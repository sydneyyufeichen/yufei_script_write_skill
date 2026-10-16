#!/usr/bin/env node
// Output-side catalog update; never a selection or writing input.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpus = '/Users/chenyufei/Documents/ChatGPT/video_media_search_skill/output';
const args = process.argv.slice(2);
let catalogArg = null;
const draftArgs = [];
let reconcileCurrent = false;
for (let i = 0; i < args.length;) {
  const key = args[i];
  if (key === '--reconcile-current') {
    reconcileCurrent = true;
    i += 1;
    continue;
  }
  const value = args[i + 1];
  if (!value) throw Error('Missing value for ' + key);
  if (key === '--catalog') catalogArg = value;
  else if (key === '--draft') draftArgs.push(value);
  else throw Error('Usage: node scripts/update-material-catalog.mjs [--catalog PATH] [--draft PATH ...] [--reconcile-current]');
  i += 2;
}
const catalog = path.resolve(catalogArg || path.join(root, 'management/material-catalog.md'));
const platforms = ['instagram', 'xiaohongshu', 'text'];
const field = (text, name) => text.match(new RegExp('^- ' + name + ':[ \\t]*(.*)$', 'm'))?.[1]?.trim() || '';
const escape = text => String(text).replace(/\\/g, '\\\\').replace(/[\[\]|]/g, '\\$&').replace(/[\r\n]/g, ' ');
const link = (label, file) => '[' + escape(label) + '](<' + file + '>)';
const target = cell => cell.match(/\]\(<([^>]+)>\)/)?.[1];
function resolveTarget(raw, baseDir) {
  if (!raw) return null;
  if (/^file:\/\//i.test(raw)) {
    try { return fileURLToPath(raw); } catch { return null; }
  }
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(baseDir, raw);
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function files(dir) {
  if (!await exists(dir)) return [];
  return (await Promise.all((await fs.readdir(dir, {withFileTypes:true})).filter(e=>!e.name.startsWith('.')).map(e=>{
    const file=path.join(dir,e.name);
    return e.isDirectory()?files(file):e.isFile()&&e.name.endsWith('.md')?[file]:[];
  }))).flat().sort();
}
// Split table cells without corrupting escaped pipes or pipes in local link targets.
function cells(line) {
  const result=[]; let cell='', angle=false, escaped=false;
  for (const c of line.trim().slice(1,-1)) {
    if (escaped) {cell+=c;escaped=false;continue;}
    if (c==='\\') {cell+=c;escaped=true;continue;}
    if(c==='<')angle=true;
    if(c==='>')angle=false;
    if(c==='|'&&!angle){result.push(cell.trim());cell='';}else cell+=c;
  }
  result.push(cell.trim());return result;
}
function dateOf(file) {
  const n=path.basename(file);
  const digits=n.match(/_(?:问题解决|反常识纠错|深度解读|真实场景)_(\d{8})\.md$/)?.[1]
    || n.match(/_(\d{8})(?:_(?:问题解决|反常识纠错|深度解读|真实场景))?\.md$/)?.[1]
    || n.match(/ - (\d{8})-\d+\.md$/)?.[1];
  if(!digits)return '';
  const iso=digits.slice(0,4)+'-'+digits.slice(4,6)+'-'+digits.slice(6,8);
  const d=new Date(iso+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:'';
}
const records=[];
for(const platform of platforms)for(const file of await files(path.join(corpus,platform))){
  const text=await fs.readFile(file,'utf8'), raw=field(text,'Likes').replace(/,/g,'');
  records.push({platform,file,account:field(text,'Account')||'未知作者',title:text.match(/^# (.+)$/m)?.[1]||path.basename(file),likes:/^\d+(?:\.\d+)?$/.test(raw)?Number(raw):null});
}
if(!records.length)throw Error('No source records; refusing to overwrite catalog');
const byPath=new Map(records.map(r=>[r.file,r]));
const byName=new Map();
for(const r of records)byName.set(path.basename(r.file),[...(byName.get(path.basename(r.file))||[]),r]);
const saved=new Map();
if(await exists(catalog)){
  let platform='';
  for(const line of (await fs.readFile(catalog,'utf8')).split('\n')){
    if(line==='## Instagram')platform='instagram';
    if(line==='## 小红书')platform='xiaohongshu';
    if(line==='## Text')platform='text';
    if(!/^\| \d+ \|/.test(line))continue;
    const c=cells(line), file=target(c[2]||'');
    if(c.length!==8||!file||!platform||saved.has(file))throw Error('Malformed/duplicate editable row; refusing to overwrite: '+line);
    saved.set(file,{status:c[4],created:c[5],published:c[6],latest:c[7]});
    // Preserve hand-maintained rows even if a source was moved out of the corpus.
    if(!byPath.has(file)){const r={platform,file,account:c[1],sourceCell:c[2],likes:/^\d+$/.test(c[3])?Number(c[3]):null};records.push(r);byPath.set(file,r);}
  }
}
const uses=new Map(), unresolved=[];
const draftFiles = reconcileCurrent || !draftArgs.length
  ? [...await files(path.join(root,'output')),...await files(path.join(root,'archive'))]
  : [...new Set(draftArgs.map(file => path.resolve(root, file)))];
for(const draft of draftFiles){
  if (!await exists(draft)) throw Error('Draft does not exist: ' + draft);
  const text=await fs.readFile(draft,'utf8');
  const section=text.match(/^## (?:Source|Xiaohongshu) References\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1];
  if(!section)continue;
  const stat=await fs.stat(draft);
  for(const line of section.split('\n').filter(l=>/^-\s+/.test(l))){
    const file=resolveTarget(target(line),path.dirname(draft)), name=line.replace(/^-\s+/,'').trim();
    const record=file?byPath.get(file):byName.get(name)?.length===1?byName.get(name)[0]:null;
    if(!record){unresolved.push({draft,line});continue;}
    const candidate={file:draft,date:dateOf(draft),modified:stat.mtimeMs};
    const prior=uses.get(record.file);
    // Dated creations win by creation date; same-date edits choose newest file.
    if(!prior||candidate.date>prior.date||candidate.date===prior.date&&candidate.modified>prior.modified)uses.set(record.file,candidate);
  }
}
if(unresolved.length)throw Error('Unresolved draft references: '+JSON.stringify(unresolved));
const lines=['# 素材用稿台账','',
'此文件用于人工选稿与发布管理；创作时不读取，不参与选题排序或排除。Instagram、小红书分别按本地保存的点赞降序排列；Text 没有点赞时按作者和文件名排列。','',
'用稿状态表示原素材是否用于二次创作，不表示成稿是否又优化过，也不等于已发布。初始有成稿引用标为“已用稿”，其余标为“未用稿”（仅依据现存记录）；你可以自行改为待选、已选用、暂不用等文字。','',
'产出时间为最新关联稿件的创建日期；旧稿日期无法确认时写“待补充”，不把修改时间冒充创建时间。发布时间留给你手填，不推断。每行只保留一个最新稿件链接。','',
'可直接编辑用稿状态、产出时间、发布时间。选题和写稿时不读取本表；每次新稿终审后由 skill 以 --draft 传入本批文件自动更新。被新稿引用的素材改为“已用稿”，同步产出时间和最新稿件；其他行保留手填状态，所有行保留手填发布时间。请保留表头、素材链接和表格结构。',''];
for(const platform of platforms){
  const group=records.filter(r=>r.platform===platform).sort((a,b)=>(b.likes??-1)-(a.likes??-1)||a.account.localeCompare(b.account)||a.file.localeCompare(b.file));
  lines.push('## '+(platform==='instagram'?'Instagram':platform==='xiaohongshu'?'小红书':'Text'),'','| 排名 | 作者 | 素材（本地全文） | 点赞 | 用稿状态 | 产出时间 | 发布时间 | 最新稿件 |','| ---: | --- | --- | ---: | --- | --- | --- | --- |');
  group.forEach((r,i)=>{
    const old=saved.get(r.file), latest=uses.get(r.file);
    let latestCell=old?.latest||'—', created=old?.created||'';
    let status=old?.status||'未用稿';
    if(reconcileCurrent&&!latest){
      latestCell='—';
      created='';
      if(status==='已用稿')status='未用稿';
    }
    const oldTarget=target(latestCell);
    const oldDate=oldTarget?dateOf(oldTarget):'';
    if(latest&&(!oldTarget||latest.file===oldTarget||latest.date>=oldDate)){
      latestCell=link(path.basename(latest.file,'.md'),latest.file);
      if(latest.file!==oldTarget||draftArgs.length)created=latest.date||created||'待补充';
    }
    if(latest)status='已用稿';
    lines.push('| '+[i+1,escape(r.account),r.sourceCell||link(r.title,r.file),r.likes??'未知',status,created,old?.published||'',latestCell].join(' | ')+' |');
  });
  lines.push('');
}
await fs.mkdir(path.dirname(catalog),{recursive:true});
await fs.writeFile(catalog+'.tmp',lines.join('\n'));
await fs.rename(catalog+'.tmp',catalog);
console.log(JSON.stringify({catalog,records:records.length,manuallyPreserved:saved.size,sourcesWithDrafts:uses.size,reconcileCurrent},null,2));
