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
