import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../src/server.mjs';
import http from 'node:http';

test('account setup leaves global pause alone and verification closes the setup browser',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-connect-'));let fail=false,closed=0;
  const browsers={busy:false,connect:async()=>{if(fail)throw Error('Network blocked');},verify:async()=>true,close:async()=>{closed++;},closeAll:async()=>{}};
  const app=await createApp({port:0,dataDir:root,worker:false,browsers});
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
  const base=`http://127.0.0.1:${app.port}`,state=await(await fetch(`${base}/api/state`)).json(),profile=state.profiles[0].id;
  const post=(route,extra={})=>fetch(base+route,{method:'POST',headers:{'X-Crosspost-Token':state.token},body:JSON.stringify({profile,platform:'youtube',...extra})});
  app.store.db.prepare('UPDATE accounts SET confirmed=1').run();
  assert.equal((await post('/api/connect')).status,200);assert.equal(app.store.paused(),false);
  assert.equal(app.store.snapshot().accounts.find(a=>a.platform==='youtube').confirmed,0);
  assert.equal((await post('/api/account',{label:'My channel',confirmed:true})).status,200);
  assert.equal(closed,1);assert.equal(browsers.busy,false);
  assert.equal(app.store.snapshot().accounts.find(a=>a.platform==='youtube').confirmed,1);
  app.store.pause(true);fail=true;assert.equal((await post('/api/connect')).status,400);
  assert.equal(app.store.paused(),true);assert.equal(app.store.snapshot().accounts.find(a=>a.platform==='youtube').confirmed,0);
});
test('local HTTP app serves dashboard, protects writes and isolates profiles',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-http-'));const app=await createApp({port:0,dataDir:root,worker:false});t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});const base=`http://127.0.0.1:${app.port}`;
  const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/Add videos/);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const state=await(await fetch(`${base}/api/state`)).json();assert.equal(state.profiles.length,1);
  const fake=await fetch(`${base}/api/account`,{method:'POST',headers:{'X-Crosspost-Token':state.token},body:JSON.stringify({profile:state.profiles[0].id,platform:'youtube',label:'Not really connected',confirmed:true})});assert.equal(fake.status,400);assert.match((await fake.json()).error,/sign-in browser/);
  assert.ok(app.store.snapshot().accounts.every(a=>!a.confirmed));
  let result=await fetch(`${base}/api/profiles`,{method:'POST',body:JSON.stringify({name:'No token'})});assert.equal(result.status,403);
  result=await fetch(`${base}/api/profiles`,{method:'POST',headers:{'X-Crosspost-Token':state.token,Origin:'https://evil.example'},body:JSON.stringify({name:'Bad origin'})});assert.equal(result.status,403);
  const badHost=await new Promise((resolve,reject)=>{http.get(`${base}/api/state`,{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(badHost,403);
  result=await fetch(`${base}/api/profiles`,{method:'POST',headers:{'X-Crosspost-Token':state.token},body:JSON.stringify({name:'Second profile'})});assert.equal(result.status,201);
  const next=await(await fetch(`${base}/api/state`)).json();assert.equal(next.profiles.length,2);assert.equal(next.accounts.length,6);assert.ok(next.accounts.every(a=>a.confirmed===0));
  result=await fetch(`${base}/api/upload?profile=${state.profiles[0].id}&name=bad.mp4`,{method:'POST',headers:{'X-Crosspost-Token':state.token},body:'not a video'});assert.equal(result.status,400);assert.equal((await(await fetch(`${base}/api/state`)).json()).videos.length,0);
});
