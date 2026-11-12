import {open} from 'node:fs/promises';

// A bounded metadata reader for ordinary, self-contained H.264/AAC MP4 exports.
// Reads only box headers and moov; never loads the video payload into memory.
// References: Apple QuickTime File Format (tkhd, mdhd, stsd) and
// https://mp4ra.org/registered-types/object-types (MPEG audio object types).
const invalid=()=>Error('This MP4 is incomplete or unsupported. Export a new H.264/AAC MP4 from your editor.');
function need(data,bytes){if(data.length<bytes)throw invalid();return data;}
function boxes(data){
  const result=[];let offset=0;
  while(offset<data.length){
    need(data.subarray(offset),8);let size=data.readUInt32BE(offset),header=8;
    if(size===1){need(data.subarray(offset),16);const n=data.readBigUInt64BE(offset+8);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw invalid();size=Number(n);header=16;}
    if(size===0)size=data.length-offset;
    if(size<header||offset+size>data.length||result.length>=10000)throw invalid();
    result.push({type:data.toString('ascii',offset+4,offset+8),data:data.subarray(offset+header,offset+size)});offset+=size;
  }
  return result;
}
function box(list,type){const found=list.filter(b=>b.type===type);if(found.length!==1)throw invalid();return found[0].data;}
function time(data){
  need(data,20);const version=data[0];if(version!==0&&version!==1)throw invalid();
  const at=version===1?20:12;need(data,at+(version===1?12:8));
  const scale=data.readUInt32BE(at),ticks=version===1?Number(data.readBigUInt64BE(at+4)):data.readUInt32BE(at+4);
  if(!scale||!Number.isSafeInteger(ticks))throw invalid();return ticks/scale;
}
function descriptor(data,offset=0){
  need(data.subarray(offset),2);const tag=data[offset++];let size=0,last;
  for(let i=0;i<4;i++){need(data.subarray(offset),1);last=data[offset++];size=size*128+(last&127);if(!(last&128))break;}
  if(last&128||offset+size>data.length)throw invalid();return {tag,data:data.subarray(offset,offset+size),end:offset+size};
}
function aac(entry){
  if(entry.type!=='mp4a')return false;
  const data=need(entry.data,28);const version=data.readUInt16BE(8);
  if(version!==0)return false;
  const esds=box(boxes(data.subarray(28)),'esds');need(esds,6);
  const es=descriptor(esds,4);if(es.tag!==3)return false;need(es.data,3);
  let offset=3;const flags=es.data[2];
  if(flags&128)offset+=2;
  if(flags&64){need(es.data,offset+1);offset+=1+es.data[offset];}
  if(flags&32)offset+=2;
  const decoder=descriptor(es.data,offset);if(decoder.tag!==4)return false;need(decoder.data,13);
  if([0x66,0x67,0x68].includes(decoder.data[0]))return true;
  if(decoder.data[0]!==0x40)return false;
  const config=descriptor(decoder.data,13);if(config.tag!==5)return false;need(config.data,2);
  const shortType=config.data[0]>>3;
  const objectType=shortType===31?32+((config.data[0]&7)<<3)+(config.data[1]>>5):shortType;
  return [1,2,3,4,5,6,17,23,29,39].includes(objectType);
}
function track(data){
  const list=boxes(data),media=boxes(box(list,'mdia')),handler=need(box(media,'hdlr'),12).toString('ascii',8,12);
  if(!['vide','soun'].includes(handler))return null;
  const duration=time(box(media,'mdhd'));
  const table=boxes(box(boxes(box(media,'minf')),'stbl'));
  const description=need(box(table,'stsd'),8),entries=boxes(description.subarray(8));
  if(entries.length!==description.readUInt32BE(4)||entries.length!==1)throw invalid();
  const samples=table.find(b=>b.type==='stsz'||b.type==='stz2');
  if(!samples||need(samples.data,12).readUInt32BE(8)===0)throw invalid();
  const entry=entries[0];
  if(handler==='soun'){
    if(!aac(entry))throw Error('Export audio as AAC for consistent uploads.');
    return {type:handler,duration};
  }
  if(!['avc1','avc3'].includes(entry.type))throw Error('Export as an H.264 MP4 for consistent uploads to all three platforms.');
  need(entry.data,78);const avc=need(box(boxes(entry.data.subarray(78)),'avcC'),7);
  if(avc[0]!==1)throw invalid();
  let width=entry.data.readUInt16BE(24),height=entry.data.readUInt16BE(26);
  const tkhd=box(list,'tkhd');need(tkhd,4);if(![0,1].includes(tkhd[0]))throw invalid();
  const at=tkhd[0]===1?52:40;need(tkhd,at+44);
  const [a,b,c,d]=[0,4,12,16].map(o=>tkhd.readInt32BE(at+o)/65536);
  const near=(x,y)=>Math.abs(x-y)<0.001;
  if(near(a,0)&&near(d,0)&&near(Math.abs(b),1)&&near(Math.abs(c),1))[width,height]=[height,width];
  else if(!(near(Math.abs(a),1)&&near(Math.abs(d),1)&&near(b,0)&&near(c,0)))throw Error('Export the video with its rotation applied before importing.');
  if(!width||!height)throw invalid();
  return {type:handler,width,height,duration};
}
export async function inspectVideo(file){
  const handle=await open(file,'r');
  try{
    const size=(await handle.stat()).size;
    if(size>1024*1024*1024)throw Error('File exceeds 1 GB.');
    let offset=0,movie,hasType=false,hasMedia=false,count=0;
    while(offset<size){
      if(++count>10000||size-offset<8)throw invalid();
      const header=Buffer.alloc(16);const {bytesRead}=await handle.read(header,0,Math.min(16,size-offset),offset);need(header.subarray(0,bytesRead),8);
      let length=header.readUInt32BE(),headerSize=8;const type=header.toString('ascii',4,8);
      if(length===1){if(bytesRead<16)throw invalid();const n=header.readBigUInt64BE(8);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw invalid();length=Number(n);headerSize=16;}
      if(length===0)length=size-offset;
      if(length<headerSize||offset+length>size)throw invalid();
      if(type==='moof')throw Error('Export a standard MP4 rather than a fragmented streaming MP4.');
      if(type==='ftyp'){if(length<headerSize+8)throw invalid();hasType=true;}
      if(type==='mdat'&&length>headerSize)hasMedia=true;
      if(type==='moov'){
        if(movie||length>16*1024*1024)throw invalid();movie=Buffer.alloc(length-headerSize);
        const read=await handle.read(movie,0,movie.length,offset+headerSize);if(read.bytesRead!==movie.length)throw invalid();
      }
      offset+=length;
    }
    if(!hasType||!hasMedia||!movie)throw invalid();
    const list=boxes(movie);if(list.some(b=>b.type==='mvex'))throw Error('Export a standard MP4 rather than a fragmented streaming MP4.');
    const tracks=list.filter(b=>b.type==='trak').map(b=>track(b.data)).filter(Boolean),video=tracks.filter(t=>t.type==='vide');
    if(video.length!==1)throw Error('Export an MP4 containing one video track.');
    const duration=Math.max(time(box(list,'mvhd')),...tracks.map(t=>t.duration));
    if(!Number.isFinite(duration)||duration<=0||duration>180.5)throw Error('Use a short video up to 3 minutes.');
    const {width,height}=video[0];if(width>=height)throw Error('Use a vertical video (height greater than width).');
    return {width,height,duration,codec:'h264'};
  }catch(error){if(error instanceof RangeError)throw invalid();throw error;}
  finally{await handle.close();}
}
