import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
import {verifyLauncher} from '../scripts/verify-launcher.mjs';
const exec=promisify(execFile);
test('portable entry starts, reopens and shuts down an isolated app',async()=>{
 await verifyLauncher(process.execPath,[fileURLToPath(new URL('../scripts/portable-launch.mjs',import.meta.url))]);
});
test('launcher reopens its own data and refuses another installation on the same port',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'crosspost-launch-'));
 const app=await createApp({port:0,dataDir,worker:false});
 t.after(async()=>{await app.close();await rm(dataDir,{recursive:true,force:true});});
 const script=fileURLToPath(new URL('../scripts/launch.mjs',import.meta.url));
 const env={...process.env,PORT:String(app.port),CROSSPOST_DATA:dataDir,CROSSPOST_NO_OPEN:'1'};
 const result=await exec(process.execPath,[script],{env,windowsHide:true});
 assert.match(result.stdout,/Crosspost is running/);
 await assert.rejects(exec(process.execPath,[script],{env:{...env,CROSSPOST_DATA:path.join(dataDir,'other')},windowsHide:true}),/another app or Crosspost installation/);
 assert.equal(app.store.snapshot().profiles.length,1);
});
