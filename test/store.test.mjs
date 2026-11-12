import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('rejects missing metadata instead of saving undefined text',t=>{const {s,add}=fixture(t);const v=add();assert.throws(()=>s.editVideo(v.id,undefined,''),/must be text/);assert.throws(()=>s.editVideo(v.id,'OK',null),/must be text/);});
test('bulk captions are atomic when a selected video is already queued',t=>{const {s,add}=fixture(t);const a=add(),b=add();s.queue([b.id],['youtube'],0,0);assert.throws(()=>s.bulkCaption([a.id,b.id],'new caption'),/Cancel/);assert.equal(s.video(a.id).description,'');s.action(s.snapshot().jobs[0].id,'cancel');s.bulkCaption([a.id,b.id],'updated');assert.equal(s.video(a.id).description,'updated');assert.equal(s.video(b.id).description,'updated');s.bulkCaption([a.id,b.id],'');assert.equal(s.video(a.id).description,'');});
function fixture(t,file=':memory:'){const s=new Store(file);t.after(()=>s.close());const p=s.snapshot().profiles[0];s.db.prepare('UPDATE accounts SET confirmed=1 WHERE profile=?').run(p.id);return {s,p,add:()=>s.addVideo({profile:p.id,name:'clip.mp4',path:'/clip.mp4',title:'A clip',metadata:{duration:10}})};}
test('schedules each platform with ordered spacing and durable metadata',t=>{const {s,add}=fixture(t);const a=add(),b=add();s.queue([a.id,b.id],['youtube','instagram','tiktok'],100,1000);const jobs=s.snapshot().jobs;assert.equal(jobs.length,6);assert.deepEqual(jobs.map(j=>j.due),[100,100,100,1100,1100,1100]);assert.equal(s.claim(99),undefined);assert.equal(s.claim(100).video,a.id);});
test('duplicate batches roll back without partially adding another video',t=>{const {s,add}=fixture(t);const a=add(),b=add();s.queue([a.id],['youtube'],100,0);assert.throws(()=>s.queue([b.id,a.id],['youtube'],100,0),/already/);assert.equal(s.snapshot().jobs.length,1);});
test('paused queue does not claim jobs',t=>{const {s,add}=fixture(t);s.queue([add().id],['youtube'],0,0);s.pause(true);assert.equal(s.claim(),null);s.pause(false);assert.ok(s.claim());});

test('disconnected accounts wait without blocking other destinations or changing pause preference',t=>{
  const {s,p,add}=fixture(t);const video=add();s.queue([video.id],['youtube','instagram'],0,0);
  s.disconnect(p.id,'youtube');assert.equal(s.paused(),false);
  const job=s.claim();assert.equal(job.platform,'instagram');s.finish(job.id,'published');
  assert.equal(s.claim(),undefined);
  assert.equal(s.snapshot().jobs.find(j=>j.platform==='youtube').state,'queued');
  s.db.prepare('UPDATE accounts SET confirmed=1 WHERE profile=? AND platform=?').run(p.id,'youtube');
  assert.equal(s.claim().platform,'youtube');
  s.pause(true);s.disconnect(p.id,'instagram');assert.equal(s.paused(),true);
});
test('profile boundaries and account confirmation are enforced',t=>{const {s,add}=fixture(t);const a=add(),p=s.addProfile('Second');const b=s.addVideo({profile:p.id,name:'b.mp4',path:'/b.mp4',title:'B',metadata:{}});assert.throws(()=>s.queue([a.id,b.id],['youtube'],0,0),/one profile/);assert.throws(()=>s.queue([b.id],['youtube'],0,0),/Connect/);assert.equal(s.snapshot().jobs.length,0);});
test('published destinations are never accidentally requeued',t=>{const {s,add}=fixture(t);const a=add();s.queue([a.id],['youtube'],0,0);const j=s.claim();s.finish(j.id,'published');assert.throws(()=>s.queue([a.id],['youtube'],0,0),/already/);assert.throws(()=>s.action(j.id,'retry',true));});
test('uncertain upload requires an explicit checked retry',t=>{const {s,add}=fixture(t);s.queue([add().id],['youtube'],0,0);const j=s.claim();s.finish(j.id,'attention');assert.throws(()=>s.action(j.id,'retry'));s.action(j.id,'retry',true);assert.equal(s.snapshot().jobs[0].state,'queued');});
test('cannot edit a scheduled or running post',t=>{const {s,add}=fixture(t);const a=add();s.queue([a.id],['youtube'],0,0);assert.throws(()=>s.editVideo(a.id,'Changed',''),/Cancel/);s.action(s.snapshot().jobs[0].id,'cancel');s.editVideo(a.id,'Changed','Caption');assert.equal(s.video(a.id).title,'Changed');});
test('restart preserves queue and holds interrupted uploads',()=>{const root=mkdtempSync(path.join(tmpdir(),'crosspost-test-'));try{const file=path.join(root,'test.sqlite');let s=new Store(file);const p=s.snapshot().profiles[0];s.db.prepare('UPDATE accounts SET confirmed=1').run();const a=s.addVideo({profile:p.id,name:'a.mp4',path:'/a.mp4',title:'A',metadata:{}});s.queue([a.id],['youtube','tiktok'],0,0);s.claim();s.close();s=new Store(file);assert.deepEqual(s.snapshot().jobs.map(j=>j.state).sort(),['attention','queued']);s.close();}finally{rmSync(root,{recursive:true,force:true});}});
