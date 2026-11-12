import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,cp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../src/server.mjs';
import {hash} from '../scripts/update.mjs';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('actual updater CLI verifies download, stops and restarts app, preserves saved queue, and is idempotent',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-update-cli-'));let app,base;
  try{
    for(const name of ['src','public'])await cp(path.join(source,name),path.join(root,name),{recursive:true});
    await mkdir(path.join(root,'scripts'));for(const name of ['launch.mjs','portable-launch.mjs','update.mjs'])await cp(path.join(source,'scripts',name),path.join(root,'scripts',name));
    const pkg=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    await writeFile(path.join(root,'package.json'),JSON.stringify({...pkg,version:'0.0.1'}));
    const data=path.join(root,'data');app=await createApp({dataDir:data,port:0,worker:false});base=`http://127.0.0.1:${app.port}`;
    const profile=app.store.addProfile('Preserve me');app.store.pause(true);
    app.store.db.prepare("UPDATE accounts SET label='Saved account',confirmed=1 WHERE profile=? AND platform='instagram'").run(profile.id);
    const videoFile=path.join(data,'videos','fixture.mp4');await writeFile(videoFile,'private video fixture');
    const video=app.store.addVideo({profile:profile.id,name:'fixture.mp4',path:videoFile,title:'Saved caption',metadata:{duration:1,width:1080,height:1920}});
    app.store.queue([video.id],['instagram'],Date.now()+86400000,0);
    const before=JSON.parse(JSON.stringify(app.store.snapshot()));
    const names=['package.json','src/server.mjs','src/youtube.mjs','scripts/launch.mjs','scripts/update.mjs'];
    const files=[];for(const name of names){const bytes=await readFile(path.join(source,name));files.push({path:name,data:bytes.toString('base64'),sha256:hash(bytes)});}
    const bytes=Buffer.from(JSON.stringify({format:1,app:pkg.name,version:pkg.version,nodeMajor:24,dependencies:pkg.dependencies,files}));
    const release={draft:false,prerelease:true,published_at:new Date().toISOString(),assets:['Crosspost-update.json','SHA256SUMS.txt'].map(name=>({name,browser_download_url:'https://github.com/kyleisbased/crosspost-local/releases/download/test/'+name}))};
    // Only GitHub download responses are substituted. The real CLI, file transaction,
    // running HTTP app, shutdown, bundled launch path and database are exercised.
    const preload=path.join(root,'fixture-download.mjs');
    await writeFile(preload,`const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{const s=String(url);if(s.startsWith('https://api.github.com/'))return new Response(${JSON.stringify(JSON.stringify([release]))});if(s.endsWith('/SHA256SUMS.txt'))return new Response(${JSON.stringify(hash(bytes)+'  Crosspost-update.json\n')});if(s.endsWith('/Crosspost-update.json'))return new Response(Buffer.from(${JSON.stringify(bytes.toString('base64'))},'base64'));return original(url,options);};`);
    const options={cwd:root,env:{...process.env,PORT:String(app.port),CROSSPOST_DATA:data,CROSSPOST_NO_OPEN:'1'},windowsHide:true,timeout:20000};
    const run=()=>promisify(execFile)(process.execPath,['--import',pathToFileURL(preload).href,path.join(root,'scripts/update.mjs')],options);
    const result=await run();assert.match(result.stdout,/Updated Crosspost 0.0.1/);
    const health=await(await fetch(base+'/api/health')).json();assert.equal(health.version,pkg.version);
    const after=await(await fetch(base+'/api/state')).json();for(const key of ['profiles','videos','jobs','accounts','paused'])assert.deepEqual(after[key],before[key]);
    assert.equal(await readFile(videoFile,'utf8'),'private video fixture');
    assert.match((await run()).stdout,/is up to date/);
  }finally{
    if(base){try{const state=await(await fetch(base+'/api/state')).json();await fetch(base+'/api/quit',{method:'POST',headers:{'X-Crosspost-Token':state.token},body:'{}'});await new Promise(r=>setTimeout(r,400));}catch{}}
    if(app?.server.listening)await app.close();
    await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
});
