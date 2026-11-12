import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {inspectVideo} from '../src/media.mjs';
const exec=promisify(execFile);
test('built-in MP4 reader checks real exports without a native media probe',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-formats-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const make=async(name,dimensions='180x320',options=[])=>{
    const file=path.join(root,name+'.mp4');
    await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',`color=c=green:s=${dimensions}:d=1`,...options,'-c:v','libx264','-pix_fmt','yuv420p','-shortest',file],{windowsHide:true});return file;
  };
  const base=await make('portrait');
  await t.test('portrait H.264 and no audio',async()=>assert.deepEqual(await inspectVideo(base),{width:180,height:320,duration:1,codec:'h264'}));
  await t.test('AAC audio and fast-start metadata',async()=>{
    const file=await make('aac','180x320',['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','aac','-movflags','+faststart']);
    assert.equal((await inspectVideo(file)).width,180);
  });
  await t.test('MP3 audio rejected even when stored in an mp4a entry',async()=>{
    const file=await make('mp3','180x320',['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame']);
    await assert.rejects(inspectVideo(file),/AAC/);
  });
  const landscape=await make('landscape','320x180');
  await t.test('landscape rejected',async()=>assert.rejects(inspectVideo(landscape),/vertical/));
  await t.test('90-degree portrait rotation respected',async()=>{
    const file=path.join(root,'rotated.mp4');
    await exec('ffmpeg',['-hide_banner','-loglevel','error','-display_rotation','90','-i',landscape,'-c','copy',file],{windowsHide:true});
    assert.equal((await inspectVideo(file)).height,320);
  });
  await t.test('fragmented streaming MP4 rejected clearly',async()=>{
    const file=await make('fragmented','180x320',['-movflags','frag_keyframe+empty_moov']);
    await assert.rejects(inspectVideo(file),/fragmented/);
  });
  await t.test('truncated box and oversized metadata rejected',async()=>{
    const bytes=await readFile(base),file=path.join(root,'broken.mp4');
    await writeFile(file,bytes.subarray(0,bytes.length-5));await assert.rejects(inspectVideo(file),/incomplete/);
    const corrupt=Buffer.from(bytes);corrupt.writeUInt32BE(0xffffffff,0);
    await writeFile(file,corrupt);await assert.rejects(inspectVideo(file),/incomplete/);
  });
  await t.test('duration over 3 minutes rejected',async()=>{
    const bytes=Buffer.from(await readFile(base)),at=bytes.indexOf(Buffer.from('mvhd'))+4;
    bytes.writeUInt32BE(bytes.readUInt32BE(at+12)*200,at+16);
    const file=path.join(root,'long.mp4');await writeFile(file,bytes);await assert.rejects(inspectVideo(file),/3 minutes/);
  });
  await t.test('non-H264 video rejected',async()=>{
    const bytes=Buffer.from(await readFile(base));const at=bytes.indexOf(Buffer.from('avc1'),bytes.indexOf(Buffer.from('stsd')));
    bytes.write('mp4v',at,'ascii');const file=path.join(root,'other-codec.mp4');await writeFile(file,bytes);
    await assert.rejects(inspectVideo(file),/H.264/);
  });
});
