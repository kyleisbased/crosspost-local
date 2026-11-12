import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browsers,upload,browserError} from '../src/browser.mjs';
test('account verification rejects missing sessions and external login screens',async()=>{
 const b=new Browsers('/unused');await assert.rejects(b.verify('p','youtube'),/sign-in browser/);
 b.sessions.set('p-youtube',{pages:()=>[{url:()=> 'https://accounts.google.com/'}]});await assert.rejects(b.verify('p','youtube'),/Finish signing in/);
});
test('account verification requires a visible upload control',async()=>{
 const b=new Browsers('/unused');const locator={count:async()=>1,first(){return this;},isVisible:async()=>false};
 b.sessions.set('p-youtube',{pages:()=>[{url:()=> 'https://studio.youtube.com/',getByRole:()=>locator}]});
 await assert.rejects(b.verify('p','youtube'),/not ready/);locator.isVisible=async()=>true;assert.equal(await b.verify('p','youtube'),true);
});
test('failed uploads become attention and release browser lock',async()=>{
 const b={busy:false,open:async()=>{throw Error('Browser unavailable');}};
 const result=await upload(b,{platform:'youtube'},{profile:'p'});assert.equal(result.state,'attention');assert.equal(b.busy,false);assert.match(result.message,/Browser unavailable/);
});
test('simultaneous connection requests are rejected and lock is released',async()=>{
 const b=new Browsers('/unused');b.busy=true;await assert.rejects(b.connect('p','youtube'),/Wait/);b.busy=false;b.open=async()=>{throw Error('Missing browser');};await assert.rejects(b.connect('p','youtube'),/Missing browser/);assert.equal(b.busy,false);
});
test('network denial is actionable and never marks a connection successful',async()=>{
 const b=new Browsers('/unused');
 b.open=async()=>({pages:()=>[{goto:async()=>{throw Error('page.goto: net::ERR_NETWORK_ACCESS_DENIED\nCall log: private debugging details');}}]});
 await assert.rejects(b.connect('p','youtube'),/blocked the browser’s internet access/);
 assert.equal(b.busy,false);
 assert.doesNotMatch(browserError(Error('net::ERR_NETWORK_ACCESS_DENIED\nCall log: secret')),/secret|Call log/);
});

function uploadFixture(message,{signedIn=true}={}){
  let closed=0,files=0,clicks=0;
  const control={first(){return this;},fill:async()=>{},click:async()=>{clicks++;},setInputFiles:async()=>{files++;},waitFor:async()=>{}};
  const page={setDefaultTimeout(){},goto:async()=>{},locator:()=>control,getByRole:()=>control,
    getByText(pattern){if(typeof pattern==='string')return control;return {first(){return this;},waitFor:async()=>{if(!pattern.test(message))throw Error('Publication not confirmed');}};}};
  const browsers={busy:false,open:async()=>({pages:()=>[page]}),verify:async()=>{if(!signedIn)throw Error('Finish signing in');},close:async()=>{closed++;}};
  return {browsers,counts:()=>({closed,files,clicks})};
}

test('TikTok upload completion is not reported as publication',async()=>{
  for(const message of ['Video uploaded','Your video has been uploaded','Your video has been posted to drafts']){
    const f=uploadFixture(message),r=await upload(f.browsers,{platform:'tiktok'},{profile:'p',path:'/clip.mp4',title:'Test',description:''});
    assert.equal(r.state,'attention');assert.match(r.message,/final publish step started/);assert.equal(f.counts().closed,1);assert.equal(f.browsers.busy,false);
  }
});

test('explicit publication confirmation succeeds and closes the browser',async()=>{
  const f=uploadFixture('Your video has been posted.'),r=await upload(f.browsers,{platform:'tiktok'},{profile:'p',path:'/clip.mp4',title:'Test',description:''});
  assert.equal(r.state,'published');assert.equal(f.counts().closed,1);
});

test('expired login is detected before selecting a file or pressing publish',async()=>{
  const f=uploadFixture('',{signedIn:false}),r=await upload(f.browsers,{platform:'tiktok'},{profile:'p',path:'/clip.mp4',title:'Test',description:''});
  assert.equal(r.state,'attention');assert.equal(r.needsReconnect,true);assert.deepEqual(f.counts(),{closed:1,files:0,clicks:0});
});
