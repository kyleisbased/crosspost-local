// Dependency-free updater: uses the Node runtime already included with Crosspost.
import {readFile,writeFile,mkdir,rename,rm,lstat,chmod,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

const repo='kyleisbased/crosspost-local';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const transactionName='.crosspost-update';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=v=>/^\d+\.\d+\.\d+$/.test(v)?v.split('.').map(Number):null;
export function newer(a,b){const x=version(a),y=version(b);if(!x||!y)throw Error('Invalid update version.');for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function allowed(name){
  return typeof name==='string'&&name.length<180&&!name.split('/').some(s=>!s||s==='.'||s==='..')&&
    (/^(src|public|scripts)\/[a-zA-Z0-9_-]+\.(mjs|js|html|css)$/.test(name)||/^(PACKAGE-MANIFEST\.json|package\.json|README\.md|YOUTUBE-SETUP\.md|UPDATE\.md|AGENTS\.md|Update-Windows\.cmd|Update-Mac\.command)$/.test(name));
}
export function validate(bundle,current){
  if(bundle?.format!==1||bundle.app!=='crosspost-local'||!version(bundle.version)||bundle.nodeMajor!==24)throw Error('Unsupported update package.');
  if(JSON.stringify(bundle.dependencies)!==JSON.stringify(current.dependencies))throw Error('This release changes bundled components. Download the new desktop package once; your saved data stays in place.');
  if(!Array.isArray(bundle.files)||bundle.files.length<3||bundle.files.length>150)throw Error('Invalid update file list.');
  const seen=new Set();let size=0;
  for(const file of bundle.files){
    if(file.path==='PACKAGE-MANIFEST.json'||!allowed(file.path)||seen.has(file.path.toLowerCase())||typeof file.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data))throw Error('Unsafe or duplicate update path.');
    seen.add(file.path.toLowerCase());const bytes=Buffer.from(file.data,'base64');size+=bytes.length;
    if(size>15*1024*1024||hash(bytes)!==file.sha256)throw Error('Update checksum mismatch or oversized package.');
  }
  for(const name of ['package.json','src/server.mjs','scripts/launch.mjs','scripts/update.mjs'])if(!seen.has(name))throw Error('Incomplete update package.');
  const pkg=JSON.parse(Buffer.from(bundle.files.find(f=>f.path==='package.json').data,'base64'));
  if(pkg.name!==bundle.app||pkg.version!==bundle.version||JSON.stringify(pkg.dependencies)!==JSON.stringify(bundle.dependencies))throw Error('Update metadata does not match the package.');
  return bundle;
}
async function safeTarget(base,name){
  if(!allowed(name))throw Error('Unsafe update path.');
  let next=base;
  for(const part of name.split('/')){
    next=path.join(next,part);
    try{if((await lstat(next)).isSymbolicLink())throw Error('Updates cannot overwrite symbolic links.');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return next;
}
async function restore(base,journal){
  for(const entry of [...journal.files].reverse()){
    const target=await safeTarget(base,entry.path);
    if(entry.existed){const bytes=await readFile(path.join(base,transactionName,'backup',entry.path));await writeFile(target,bytes);if(entry.mode!==undefined)await chmod(target,entry.mode);}
    else await rm(target,{force:true});
  }
}
export async function recover(base){
  base=await realpath(base);const dir=path.join(base,transactionName);
  const journal=JSON.parse(await readFile(path.join(dir,'journal.json'),'utf8'));
  if(journal.pid!==process.pid){try{process.kill(journal.pid,0);throw Error('Another updater is still running. Wait for it to finish.');}catch(e){if(e.code!=='ESRCH')throw e;}}
  if(!Array.isArray(journal.files)||journal.files.some(e=>!allowed(e.path)))throw Error('Invalid recovery journal. Restore your app backup.');
  await restore(base,journal);await rm(dir,{recursive:true,force:true});
}
export async function applyUpdate(base,bundle,{beforeApply=async()=>{},beforeWrite=async()=>{}}={}){
  base=await realpath(base);const current=JSON.parse(await readFile(path.join(base,'package.json'),'utf8'));validate(bundle,current);
  const dir=path.join(base,transactionName);
  const entries=[...bundle.files];
  if(existsSync(path.join(base,'PACKAGE-MANIFEST.json'))){
    const manifest=JSON.parse(await readFile(path.join(base,'PACKAGE-MANIFEST.json'),'utf8'));
    const mapped=new Map(manifest.files.map(f=>[f.path,f]));
    for(const file of entries)mapped.set(file.path,{path:file.path,kind:'file',bytes:Buffer.from(file.data,'base64').length,sha256:file.sha256});
    manifest.files=[...mapped.values()].sort((a,b)=>a.path.localeCompare(b.path,'en'));manifest.updatedVersion=bundle.version;
    entries.push({path:'PACKAGE-MANIFEST.json',data:Buffer.from(JSON.stringify(manifest,null,2)+'\n').toString('base64')});
  }
  await mkdir(dir); // Exclusive transaction; never delete a competing updater's files.
  const journal={pid:process.pid,files:[]};let modifying=false;
  try{
    for(const entry of entries){
      const target=await safeTarget(base,entry.path);let bytes=null;
      try{bytes=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
      if(bytes){const backup=path.join(dir,'backup',entry.path);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,bytes);}
      journal.files.push({path:entry.path,existed:bytes!==null,mode:bytes!==null?(await lstat(target)).mode:undefined});
    }
    await writeFile(path.join(dir,'journal.json'),JSON.stringify(journal));
    await beforeApply();modifying=true;
    for(const entry of [...entries].sort((a,b)=>(a.path==='package.json')-(b.path==='package.json'))){
      await beforeWrite(entry.path);
      const target=await safeTarget(base,entry.path),staged=path.join(dir,'next');
      await mkdir(path.dirname(target),{recursive:true});await writeFile(staged,Buffer.from(entry.data,'base64'));await rename(staged,target);
      const original=journal.files.find(f=>f.path===entry.path);await chmod(target,original.mode??(entry.path.endsWith('.command')?0o755:0o644));
    }
  }catch(error){
    if(modifying)try{await restore(base,journal);}catch{throw Error('Update interrupted; recovery is needed. Run the updater with --recover before opening Crosspost.');}
    await rm(dir,{recursive:true,force:true});throw error;
  }
  await rm(dir,{recursive:true,force:true});
}
async function download(url,max){
  const response=await fetch(url,{headers:{'User-Agent':'Crosspost-Local-Updater','Accept':'application/octet-stream'},signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Could not download the update (${response.status}). Try again later.`);
  if(Number(response.headers.get('content-length'))>max)throw Error('Update response is too large.');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('Update response is too large.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export function chooseRelease(releases,current){
  return releases.filter(r=>!r.draft&&r.assets?.some(a=>a.name==='Crosspost-update.json')&&r.assets.some(a=>a.name==='SHA256SUMS.txt'))
    .sort((a,b)=>Date.parse(b.published_at)-Date.parse(a.published_at))[0];
}
function assetUrl(release,name){
  const value=release.assets.find(a=>a.name===name)?.browser_download_url;
  const url=new URL(value);
  if(url.origin!=='https://github.com'||!url.pathname.startsWith(`/${repo}/releases/download/`)||!url.pathname.endsWith('/'+name))throw Error('Unexpected update download location.');
  return url.href;
}
export async function stopApp(base,dataDir,port){
  const origin=`http://127.0.0.1:${port}`;let response;
  try{response=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1500)});}catch(e){if(e.cause?.code==='ECONNREFUSED')return;throw Error('Cannot safely check the running app. Quit Crosspost and try again.');}
  const state=await response.json();let normalized=path.resolve(dataDir);if(process.platform==='win32')normalized=normalized.toLowerCase();
  if(state.app!=='crosspost-local'||state.instance!==hash(normalized))throw Error('A different app or data folder is using this port. Quit it before updating this copy.');
  const status=await(await fetch(origin+'/api/state')).json();
  if(status.browserBusy||status.jobs?.some(j=>j.state==='running'))throw Error('An upload is running. Let it finish, then update again.');
  const quit=await fetch(origin+'/api/quit',{method:'POST',headers:{'Content-Type':'application/json','X-Crosspost-Token':status.token},body:JSON.stringify({forUpdate:true})});
  if(!quit.ok)throw Error('The app cannot quit safely yet. Let the current upload finish.');
  for(let n=0;n<40;n++){
    await new Promise(r=>setTimeout(r,250));
    try{await fetch(origin+'/api/health',{signal:AbortSignal.timeout(1000)});}catch(e){if(e.cause?.code==='ECONNREFUSED')return;}
  }
  throw Error('Crosspost is still running. Quit it before updating.');
}
async function main(){
  if(process.versions.node.split('.')[0]!=='24')throw Error('Run the updater with the Node 24 runtime included with Crosspost.');
  if(process.argv.includes('--recover')){await recover(root);console.log('Previous app files restored. You can open Crosspost or try updating again.');return;}
  const current=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
  if(current.name!=='crosspost-local')throw Error('Run the updater from your Crosspost folder.');
  if(existsSync(path.join(root,transactionName)))throw Error('An update is running or was interrupted. If it stopped, run this updater with --recover.');
  console.log('Checking verified Crosspost test releases...');
  const response=await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`,{headers:{'User-Agent':'Crosspost-Local-Updater','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`GitHub could not check for updates (${response.status}). Try again later.`);
  const release=chooseRelease(await response.json(),current);
  if(!release){console.log('No compatible updater release is available yet. Your app was not changed.');return;}
  const sums=(await download(assetUrl(release,'SHA256SUMS.txt'),65536)).toString('utf8');
  const expected=sums.split(/\r?\n/).map(l=>l.match(/^([a-f0-9]{64})\s+\*?Crosspost-update\.json$/)).find(Boolean)?.[1];
  if(!expected)throw Error('The release has no updater checksum. No files were changed.');
  const bytes=await download(assetUrl(release,'Crosspost-update.json'),22*1024*1024);
  if(hash(bytes)!==expected)throw Error('Download checksum did not match. No files were changed.');
  const bundle=validate(JSON.parse(bytes),current);
  if(!newer(bundle.version,current.version)){console.log(`Crosspost ${current.version} is up to date.`);return;}
  const portable=existsSync(path.join(root,'runtime',process.platform==='win32'?'node.exe':'node'));
  const userBase=process.platform==='win32'?(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local')):path.join(os.homedir(),'Library','Application Support');
  const data=process.env.CROSSPOST_DATA||(portable?path.join(userBase,'CrosspostLocal'):path.join(root,'data'));
  const port=Number(process.env.PORT||4318);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local app port.');
  await applyUpdate(root,bundle,{beforeApply:()=>stopApp(root,data,port)});
  console.log(`Updated Crosspost ${current.version} to ${bundle.version}. Videos, accounts, and schedules are preserved.`);
  const child=spawn(process.execPath,[path.join(root,'scripts',portable?'portable-launch.mjs':'launch.mjs')],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
  const [code]=await once(child,'exit');if(code!==0)throw Error('Update installed, but the app could not restart. Open its normal launcher.');
  console.log('Check Accounts for any reconnection instructions. Older versions may leave the queue paused after updating.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
