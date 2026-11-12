import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdirSync,openSync,closeSync} from 'node:fs';
import {once} from 'node:events';
import {dataIdentity} from '../src/identity.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Choose a local port between 1 and 65535.');
const url=`http://127.0.0.1:${port}`;
const data=path.resolve(process.env.CROSSPOST_DATA||path.join(root,'data'));
const expected=dataIdentity(data);
if(Number(process.versions.node.split('.')[0])!==24){console.error('Please install Node.js 24 LTS.');process.exit(1);}
async function running(){
  let response;try{response=await fetch(`${url}/api/health`,{signal:AbortSignal.timeout(1000)});}catch{return false;}
  const state=await response.json().catch(()=>({}));
  if(state.app==='crosspost-local'&&state.instance===expected)return true;
  throw Error(`Port ${port} is already in use by another app or Crosspost installation. Quit that app before opening this copy. Your saved data has not been changed.`);
}
if(!await running()){
  mkdirSync(data,{recursive:true});const fd=openSync(path.join(data,'app.log'),'a');
  try{
    const child=spawn(process.execPath,[path.join(root,'src','server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});
    await once(child,'spawn');child.unref();
  }finally{closeSync(fd);}
  for(let n=0;n<30&&!await running();n++)await new Promise(r=>setTimeout(r,300));
}
if(!await running())throw Error(`Could not start Crosspost. Check ${path.join(data,'app.log')} for details.`);
if(process.env.CROSSPOST_NO_OPEN!=='1'){
  const command=process.platform==='win32'?'explorer.exe':'open';
  const browser=spawn(command,[url],{detached:true,windowsHide:true,stdio:'ignore'});
  browser.on('error',()=>console.error(`Open ${url} in your browser.`));browser.unref();
}
console.log(`Crosspost is running at ${url}. The background worker stays on after this launcher closes.`);
