import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {hash,validate,applyUpdate,recover,newer,chooseRelease,stopApp} from '../scripts/update.mjs';
import {createApp} from '../src/server.mjs';

const current={name:'crosspost-local',version:'0.1.0',dependencies:{playwright:'1.63.0'}};
function bundle(){
  const files={'package.json':JSON.stringify({...current,version:'0.2.0'}),'src/server.mjs':'new server','scripts/launch.mjs':'new launcher','scripts/update.mjs':'new updater','public/app.js':'new UI'};
  return {format:1,app:'crosspost-local',version:'0.2.0',nodeMajor:24,dependencies:current.dependencies,files:Object.entries(files).map(([path,data])=>({path,data:Buffer.from(data).toString('base64'),sha256:hash(data)}))};
}
async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-update-'));t.after(()=>rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  for(const dir of ['src','scripts','data','data/sessions','data/youtube'])await mkdir(path.join(root,dir),{recursive:true});
  await writeFile(path.join(root,'package.json'),JSON.stringify(current));await writeFile(path.join(root,'src/server.mjs'),'old server');
  for(const file of ['data/crosspost.sqlite','data/video.mp4','data/sessions/login','data/youtube/token'])await writeFile(path.join(root,file),'private fixture');return root;
}
test('updater validates all paths, content hashes, duplicate paths and dependency compatibility',()=>{
  const b=bundle();assert.equal(validate(b,current),b);
  for(const name of ['../data/video.mp4','data/video.mp4','src/../../escape','src/a:stream.mjs','src\\server.mjs','PACKAGE-MANIFEST.json']){
    const invalid=structuredClone(b);invalid.files[0].path=name;assert.throws(()=>validate(invalid,current));
  }
  const corrupt=structuredClone(b);corrupt.files[0].sha256='0'.repeat(64);assert.throws(()=>validate(corrupt,current),/checksum/);
  const duplicate=structuredClone(b);duplicate.files.push(duplicate.files[0]);assert.throws(()=>validate(duplicate,current),/duplicate/);
  assert.throws(()=>validate(b,{...current,dependencies:{playwright:'9.0.0'}}),/bundled components/);
});
test('update preserves private data and updates only app files',async t=>{
  const root=await fixture(t);await applyUpdate(root,bundle());
  assert.equal(JSON.parse(await readFile(path.join(root,'package.json'))).version,'0.2.0');
  assert.equal(await readFile(path.join(root,'src/server.mjs'),'utf8'),'new server');
  for(const file of ['data/crosspost.sqlite','data/video.mp4','data/sessions/login','data/youtube/token'])assert.equal(await readFile(path.join(root,file),'utf8'),'private fixture');
  await assert.rejects(access(path.join(root,'.crosspost-update')));
});
test('partial file-installation failure rolls back old files and removes newly added files',async t=>{
  const root=await fixture(t);let n=0;
  await assert.rejects(applyUpdate(root,bundle(),{beforeWrite:async()=>{if(++n===4)throw Error('simulated disk failure');}}),/disk failure/);
  assert.equal(await readFile(path.join(root,'src/server.mjs'),'utf8'),'old server');assert.equal(JSON.parse(await readFile(path.join(root,'package.json'))).version,'0.1.0');
  await assert.rejects(access(path.join(root,'scripts/launch.mjs')));await assert.rejects(access(path.join(root,'.crosspost-update')));
});
test('busy app aborts before code mutation and recovery restores an interrupted transaction',async t=>{
  const root=await fixture(t);await assert.rejects(applyUpdate(root,bundle(),{beforeApply:async()=>{throw Error('upload busy');}}),/busy/);
  assert.equal(await readFile(path.join(root,'src/server.mjs'),'utf8'),'old server');
  const dir=path.join(root,'.crosspost-update');await mkdir(path.join(dir,'backup/src'),{recursive:true});
  await writeFile(path.join(dir,'backup/src/server.mjs'),'old server');await writeFile(path.join(root,'src/server.mjs'),'partial');
  await writeFile(path.join(dir,'journal.json'),JSON.stringify({pid:process.pid,files:[{path:'src/server.mjs',existed:true}]}));
  await recover(root);assert.equal(await readFile(path.join(root,'src/server.mjs'),'utf8'),'old server');
});
test('stopApp refuses active uploads and a different installation',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-stop-'));const app=await createApp({dataDir:root,port:0,worker:false,browsers:{busy:true,closeAll:async()=>{}}});
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  await assert.rejects(stopApp(root,root,app.port),/upload is running/);
  await assert.rejects(stopApp(root,root+'-wrong',app.port),/different app/);
});
test('release selection includes completed test releases, skips drafts and never downgrades',()=>{
  const release={draft:false,published_at:'2026-11-12',prerelease:true,assets:[{name:'Crosspost-update.json'},{name:'SHA256SUMS.txt'}]};
  assert.equal(chooseRelease([{...release,draft:true},release]),release);assert.equal(chooseRelease([{...release,assets:[]}]),undefined);
  assert.equal(newer('0.2.0','0.1.0'),true);assert.equal(newer('0.2.0','0.2.0'),false);assert.equal(newer('0.1.9','0.2.0'),false);
});
