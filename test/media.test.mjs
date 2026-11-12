import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../src/server.mjs';
const exec=promisify(execFile);
test('real vertical MP4 imports, edits, queues and preserves three destinations',async t=>{
  try{await exec('ffmpeg',['-version'],{windowsHide:true});}catch{t.skip('ffmpeg is needed to generate the test video');return;}
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-media-'));
  const file=path.join(root,'short.mp4');
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=green:s=180x320:d=1','-c:v','libx264','-pix_fmt','yuv420p',file],{windowsHide:true});
  const app=await createApp({port:0,dataDir:path.join(root,'data'),worker:false});
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.port}`,state=await(await fetch(base+'/api/state')).json();
  const headers={'X-Crosspost-Token':state.token},profile=state.profiles[0].id;
  let r=await fetch(`${base}/api/upload?profile=${profile}&name=short.mp4`,{method:'POST',headers,body:await readFile(file)});assert.equal(r.status,201);const video=await r.json();
  r=await fetch(`${base}/media/${video.id}`,{headers:{Range:'bytes=0-99'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,100);
  r=await fetch(`${base}/api/videos/${video.id}`,{method:'PATCH',headers,body:JSON.stringify({title:'Real file',description:'Testing locally',madeForKids:false})});assert.equal(r.status,200);
  app.store.db.prepare('UPDATE accounts SET confirmed=1').run();
  r=await fetch(base+'/api/queue',{method:'POST',headers,body:JSON.stringify({ids:[video.id],platforms:['youtube','instagram','tiktok'],start:Date.now()+100000,interval:0,audienceConfirmed:true})});assert.equal(r.status,200);
  const after=await(await fetch(base+'/api/state')).json();assert.equal(after.jobs.length,3);assert.equal(after.videos[0].title,'Real file');assert.equal(after.videos[0].metadata.height,320);
  r=await fetch(`${base}/api/videos/${video.id}`,{method:'DELETE',headers});assert.equal(r.status,400);
  for(const job of after.jobs)app.store.action(job.id,'cancel');
  r=await fetch(`${base}/api/videos/${video.id}`,{method:'DELETE',headers});assert.equal(r.status,200);
});
