import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {dataIdentity} from '../src/identity.mjs';

const exec=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function availablePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

// Exercise the real entry point in an isolated profile, including a second launch.
// No account records or videos are loaded, and no external browser is opened.
export async function verifyLauncher(command,args=[]){
  const data=await mkdtemp(path.join(tmpdir(),'crosspost-entry-'));
  const port=await availablePort(),base=`http://127.0.0.1:${port}`;
  const expected=dataIdentity(data);
  const env={...process.env,PORT:String(port),CROSSPOST_DATA:data,CROSSPOST_NO_OPEN:'1'};
  const request=(url,options={})=>fetch(base+url,{...options,signal:AbortSignal.timeout(1500)});
  let ownsServer=false,stopped=false;
  try{
    await exec(command,args,{env,windowsHide:true,timeout:25000});
    const health=await(await request('/api/health')).json();
    assert.equal(health.app,'crosspost-local');assert.equal(health.instance,expected);
    ownsServer=true;
    const state=await(await request('/api/state')).json();
    assert.equal(state.videos.length,0);assert.equal(state.jobs.length,0);
    assert.ok(state.accounts.every(account=>!account.confirmed));
    const created=await request('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json','X-Crosspost-Token':state.token},body:JSON.stringify({name:'Launcher smoke check'})});
    assert.equal(created.status,201);
    const profile=await created.json();
    await exec(command,args,{env,windowsHide:true,timeout:15000});
    const reopened=await(await request('/api/state')).json();
    assert.equal(reopened.token,state.token,'A second launch must reuse the running server');
    assert.ok(reopened.profiles.some(item=>item.id===profile.id));
  }finally{
    // Also recover a server that started just before a launcher failure.
    const health=await request('/api/health').then(r=>r.json()).catch(()=>null);
    ownsServer=ownsServer||health?.instance===expected;
    if(health?.instance===expected){
      const state=await(await request('/api/state')).json();
      const quit=await request('/api/quit',{method:'POST',headers:{'X-Crosspost-Token':state.token},body:'{}'});
      assert.equal(quit.status,200);
      for(let i=0;i<40;i++){
        await delay(100);
        const alive=await request('/api/health').then(()=>true).catch(()=>false);
        if(!alive){stopped=true;break;}
      }
    }else stopped=!health;
    // A closed listener can precede SQLite/process handle release on Windows.
    // Bound the cleanup wait; do not treat a permanently locked database as success.
    if(stopped)await rm(data,{recursive:true,force:true,maxRetries:20,retryDelay:50});
    if(ownsServer&&!stopped)throw Error('Launcher test could not stop its isolated server.');
  }
  console.log('Launcher passed: starts isolated app, reopens same instance, retains saved data, and shuts down cleanly.');
}
