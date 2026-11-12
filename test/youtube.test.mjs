import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {YouTube,desktopClientId} from '../src/youtube.mjs';
import {Browsers} from '../src/browser.mjs';
import {createApp} from '../src/server.mjs';

const config={installed:{client_id:'123-test.apps.googleusercontent.com',client_secret:'fixture-only'}};
const scope='https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
const json=(value,init)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'},...init});
async function fixture(t){
  const dir=await mkdtemp(path.join(tmpdir(),'crosspost-oauth-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100}));
  const calls=[];let now=100000,opened;
  const yt=new YouTube(dir,{now:()=>now,openBrowser:async url=>{opened=url;},fetcher:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/token'))return json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,scope});
    if(url.includes('/channels'))return json({items:[{id:'UC-fixture',snippet:{title:'Test channel'}}]});
    throw Error('Unexpected request');
  }});
  await yt.init();await yt.configure(config);
  return {yt,dir,calls,now:value=>now=value,opened:()=>opened};
}
async function authorize(yt,profile='profile-1'){
  const {authorizationUrl}=await yt.connect(profile,'http://127.0.0.1:4318');
  const url=new URL(authorizationUrl);
  return {url,result:await yt.callback(new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code'}))};
}

test('fresh installations authorize and refresh using the bundled public client without a secret',async t=>{
  const f=await fixture(t);
  await rm(path.join(f.dir,'youtube','client.json'));
  await f.yt.init();
  const {url}=await authorize(f.yt);
  assert.equal(url.searchParams.get('client_id'),desktopClientId);
  assert.equal(new URLSearchParams(f.calls[0].options.body).has('client_secret'),false);
  f.now(9999999);await f.yt.accessToken('profile-1');
  const body=new URLSearchParams(f.calls.at(-1).options.body);
  assert.equal(body.get('client_id'),desktopClientId);
  assert.equal(body.has('client_secret'),false);
  await f.yt.configure(config);await f.yt.init();
  assert.equal(f.yt.config.client_id,config.installed.client_id);
  assert.equal(await f.yt.hasToken('profile-1'),false);
});
test('Google login opens normal browser with PKCE and callback verifies channel identity',async t=>{
  const f=await fixture(t),{url,result}=await authorize(f.yt);
  assert.equal(f.opened(),url.href);assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(result.label,'Test channel');
  const body=new URLSearchParams(f.calls[0].options.body);assert.ok(body.get('code_verifier'));assert.equal(body.get('redirect_uri'),'http://127.0.0.1:4318/oauth/youtube/callback');
  assert.equal(await f.yt.hasToken('profile-1'),true);assert.equal(await f.yt.hasToken('profile-2'),false);
  await assert.rejects(f.yt.callback(new URLSearchParams({state:url.searchParams.get('state'),code:'again'})),/expired/);
  await assert.rejects(new Browsers(f.dir).open('p','youtube'),/normal browser/);
});
test('OAuth rejects wrong, expired, superseded and cancelled state without a token exchange',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.yt.callback(new URLSearchParams({state:'wrong',code:'x'})),/expired/);
  let {authorizationUrl}=await f.yt.connect('p','http://127.0.0.1:4318');
  const old=new URL(authorizationUrl).searchParams.get('state');await f.yt.connect('p','http://127.0.0.1:4318');
  await assert.rejects(f.yt.callback(new URLSearchParams({state:old,code:'x'})),/expired/);
  ({authorizationUrl}=await f.yt.connect('p','http://127.0.0.1:4318'));f.now(9999999);
  await assert.rejects(f.yt.callback(new URLSearchParams({state:new URL(authorizationUrl).searchParams.get('state'),code:'x'})),/expired/);
  ({authorizationUrl}=await f.yt.connect('p','http://127.0.0.1:4318'));
  await assert.rejects(f.yt.callback(new URLSearchParams({state:new URL(authorizationUrl).searchParams.get('state'),error:'access_denied'})),/cancelled/);
  assert.equal(f.calls.length,0);
});
test('missing setup and wrong client type are actionable, and partial permission does not connect',async t=>{
  const f=await fixture(t);f.yt.config=null;
  await assert.rejects(f.yt.connect('p','http://127.0.0.1:4318'),/Desktop app JSON/);
  await assert.rejects(f.yt.configure({web:config.installed}),/Web app credentials/);
  await f.yt.configure(config);f.yt.fetch=async()=>json({access_token:'x',refresh_token:'y',scope:'https://www.googleapis.com/auth/youtube.upload'});
  await assert.rejects(authorize(f.yt),/Both upload/);assert.equal(await f.yt.hasToken('profile-1'),false);
});
test('expired access token refreshes for the same profile; revoked grant requires reconnection',async t=>{
  const f=await fixture(t);await authorize(f.yt);f.now(9999999);
  assert.equal(await f.yt.accessToken('profile-1'),'fixture-access');
  const last=f.calls.at(-1);assert.equal(new URLSearchParams(last.options.body).get('grant_type'),'refresh_token');
  f.now(99999999);f.yt.fetch=async()=>json({error:'invalid_grant'},{status:400});
  await assert.rejects(f.yt.accessToken('profile-1'),e=>e.needsReconnect===true);
});
test('YouTube streams public metadata and media; ambiguous upload is held without retry',async t=>{
  const f=await fixture(t);await authorize(f.yt);const file=path.join(f.dir,'fixture.mp4');await writeFile(file,'fixture-video');
  const video={path:file,title:'Fixture title',description:'Fixture description',metadata:{madeForKids:true}};let posted,puts=0;
  f.yt.fetch=async(url,options)=>{
    if(options.method==='POST'){posted=JSON.parse(options.body);return new Response('',{headers:{location:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test'}});}
    puts++;let bytes='';for await(const c of options.body)bytes+=c;assert.equal(bytes,'fixture-video');
    return json({id:'abcdefghijk',status:{privacyStatus:'public',uploadStatus:'uploaded'}});
  };
  let result=await f.yt.upload({profile:'profile-1'},video);assert.equal(result.state,'published');assert.equal(result.url,'https://www.youtube.com/watch?v=abcdefghijk');assert.equal(posted.status.selfDeclaredMadeForKids,true);assert.equal(posted.snippet.title,video.title);assert.equal(puts,1);
  f.yt.fetch=async(url,options)=>{if(options.method==='POST')return new Response('',{headers:{location:'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test'}});puts++;throw Error('lost response');};
  result=await f.yt.upload({profile:'profile-1'},video);assert.equal(result.state,'attention');assert.match(result.message,/may have reached/);assert.equal(puts,2);
});
test('YouTube rejects redirected upload destinations and non-public confirmation',async t=>{
  const f=await fixture(t);await authorize(f.yt);const file=path.join(f.dir,'fixture.mp4');await writeFile(file,'fixture');let puts=0;
  const video={path:file,title:'Title',description:'',metadata:{}};
  f.yt.fetch=async()=>new Response('',{headers:{location:'https://evil.example/upload/youtube/x'}});
  assert.equal((await f.yt.upload({profile:'profile-1'},video)).state,'attention');
  f.yt.fetch=async(url,options)=>{if(options.method==='POST')return new Response('',{headers:{location:'https://www.googleapis.com/upload/youtube/v3/videos?x=1'}});puts++;for await(const c of options.body){}return json({id:'abcdefghijk',status:{privacyStatus:'private'}});};
  const result=await f.yt.upload({profile:'profile-1'},video);assert.equal(puts,1);assert.equal(result.state,'attention');assert.match(result.message,/did not confirm public/);
});
test('HTTP callback permits only valid OAuth state and never exposes Google tokens',async t=>{
  const f=await fixture(t);const app=await createApp({dataDir:f.dir,port:0,worker:false,youtube:f.yt});try {
  const base=`http://127.0.0.1:${app.port}`,s=await(await fetch(base+'/api/state')).json(),profile=s.profiles[0].id;
  const r=await fetch(base+'/api/connect',{method:'POST',headers:{'X-Crosspost-Token':s.token},body:JSON.stringify({profile,platform:'youtube'})});assert.equal(r.status,200);
  const {authorizationUrl}=await r.json();const state=new URL(authorizationUrl).searchParams.get('state');
  const wrong=await fetch(base+'/oauth/youtube/callback?state=wrong&code=x',{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(wrong.status,400);
  const good=await fetch(base+`/oauth/youtube/callback?state=${state}&code=x`,{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(good.status,200);
  const body=await(await fetch(base+'/api/state')).text();assert.doesNotMatch(body,/fixture-access|fixture-refresh|fixture-only/);assert.equal(JSON.parse(body).accounts.find(a=>a.platform==='youtube').label,'Test channel');
  assert.equal(JSON.parse(body).accounts.find(a=>a.platform==='youtube').confirmed,1);
  } finally { await app.close(); }
});
