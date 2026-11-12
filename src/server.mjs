import http from 'node:http';
import { createReadStream,createWriteStream } from 'node:fs';
import { mkdir,readFile,unlink,stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes,randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { Store,platforms } from './store.mjs';
import { Browsers,upload } from './browser.mjs';
import { inspectVideo } from './media.mjs';
import { dataIdentity } from './identity.mjs';
import { YouTube } from './youtube.mjs';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createApp({dataDir=process.env.CROSSPOST_DATA||path.join(appRoot,'data'),port=Number(process.env.PORT||4318),worker=true,browsers=new Browsers(path.join(dataDir,'sessions')),youtube=new YouTube(dataDir)}={}){
  await mkdir(path.join(dataDir,'videos'),{recursive:true,mode:0o700});
  const store=new Store(path.join(dataDir,'crosspost.sqlite'),false);
  await youtube.init();
  for(const a of store.snapshot().accounts)if(a.platform==='youtube'&&a.confirmed&&!await youtube.hasToken(a.profile))store.disconnect(a.profile,'youtube');
  const version=JSON.parse(await readFile(path.join(appRoot,'package.json'),'utf8')).version;
  const token=randomBytes(32).toString('hex');let working=false,closing=false;
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const json=async req=>{let result='';for await(const c of req){result+=c;if(result.length>1024*1024)throw Error('Request too large.');}return JSON.parse(result||'{}');};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control','no-store');
    try{
      const actual=server.address().port,origin=`http://127.0.0.1:${actual}`;
      if(![`127.0.0.1:${actual}`,`localhost:${actual}`].includes(req.headers.host))return send(res,403,{error:'Local access only.'});
      const url=new URL(req.url,origin),route=url.pathname;
      // Google navigates here cross-site. Only this state-protected GET callback is exempt.
      if(req.method==='GET'&&route==='/oauth/youtube/callback'){
        const account=await youtube.callback(url.searchParams);store.profile(account.profile);
        store.db.prepare("UPDATE accounts SET label=?,confirmed=1 WHERE profile=? AND platform='youtube'").run(account.label,account.profile);
        res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>YouTube connected</title><h1>YouTube connected</h1><p>You can close this tab and return to Crosspost.</p><a href="/">Return to Crosspost</a>');return;
      }
      if(req.headers.origin && ![origin,`http://localhost:${actual}`].includes(req.headers.origin))return send(res,403,{error:'Cross-origin requests are blocked.'});
      if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'Cross-site requests are blocked.'});
      if(req.method!=='GET'&&req.headers['x-crosspost-token']!==token)return send(res,403,{error:'Reload this local dashboard and try again.'});
      if(req.method==='GET'&&route==='/api/health')return send(res,200,{app:'crosspost-local',version,instance:dataIdentity(dataDir)});
      if(req.method==='GET'&&route==='/api/state')return send(res,200,{...store.snapshot(),token,browserBusy:browsers.busy||working,youtubeConfigured:!!youtube.config,version,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
      if(req.method==='POST'&&route==='/api/youtube/config'){
        if(working||browsers.busy)throw Error('Wait for the current upload to finish.');
        await youtube.configure(await json(req));
        store.db.prepare("UPDATE accounts SET confirmed=0 WHERE platform='youtube'").run();
        return send(res,200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/profiles')return send(res,201,store.addProfile((await json(req)).name));
      if(req.method==='POST'&&route==='/api/pause'){store.pause(Boolean((await json(req)).paused));return send(res,200,{ok:true});}
      if(req.method==='POST'&&route==='/api/connect'){
        const b=await json(req);store.profile(b.profile);if(!platforms.includes(b.platform))throw Error('Unknown platform.');
        if(browsers.busy||working)throw Error('Wait for the current upload to finish.');
        // Suspend only this account, durably, until the user verifies it again.
        // Never change the user's global pause preference during account setup.
        store.disconnect(b.profile,b.platform);
        if(b.platform==='youtube')return send(res,200,await youtube.connect(b.profile,origin));
        await browsers.connect(b.profile,b.platform);return send(res,200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/quit'){
        if(working||browsers.busy)throw Error('Wait for the current upload to finish before quitting.');
        const b=await json(req);closing=true;if(b.forUpdate!==true)store.pause(true);send(res,200,{ok:true});
        setTimeout(async()=>{clearInterval(timer);await browsers.closeAll();server.close(()=>store.close());},200);return;
      }
      if(req.method==='POST'&&route==='/api/account'){
        const b=await json(req);store.profile(b.profile);if(!platforms.includes(b.platform))throw Error('Unknown platform.');
        if(b.platform==='youtube')throw Error('Use Google sign-in to verify your YouTube channel automatically.');
        if(browsers.busy)throw Error('Wait for the current upload to finish.');
        const label=String(b.label||'').trim();if(!label||label.length>100)throw Error('Enter the account handle you signed into.');
        if(!b.confirmed)throw Error('Confirm that you signed into the correct account.');
        browsers.busy=true;
        try{
          await browsers.verify(b.profile,b.platform);
          // Close the setup window before allowing this account's jobs to run.
          await browsers.close(b.profile,b.platform);
          store.db.prepare('UPDATE accounts SET label=?,confirmed=1 WHERE profile=? AND platform=?').run(label,b.profile,b.platform);
        }finally{browsers.busy=false;}
        return send(res,200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/upload'){
        const profile=url.searchParams.get('profile');store.profile(profile);
        const result=await receive(req,profile,url.searchParams.get('name'),dataDir,store);return send(res,201,result);
      }
      if(req.method==='POST'&&route==='/api/bulk-caption'){
        const b=await json(req);store.bulkCaption(b.ids,b.description);return send(res,200,{ok:true});
      }
      if(req.method==='PATCH'&&route.startsWith('/api/videos/')){
        const id=route.split('/').at(-1),b=await json(req);store.editVideo(id,b.title,b.description);
        const v=store.video(id);v.metadata.madeForKids=b.madeForKids===true;
        store.db.prepare('UPDATE videos SET metadata=? WHERE id=?').run(JSON.stringify(v.metadata),id);
        return send(res,200,{ok:true});
      }
      if(req.method==='POST'&&route==='/api/queue'){
        const b=await json(req);if(b.audienceConfirmed!==true)throw Error('Confirm the YouTube audience setting for these videos.');
        store.queue(b.ids,b.platforms,b.start===null?Date.now():Number(b.start),Number(b.interval));return send(res,200,{ok:true});
      }
      if(req.method==='DELETE'&&route.startsWith('/api/videos/')){
        const id=route.split('/').at(-1),v=store.video(id);
        if(store.db.prepare("SELECT id FROM jobs WHERE video=? AND state NOT IN ('cancelled')").get(id))throw Error('Only drafts and cancelled videos can be removed. Keep published records to prevent duplicates.');
        await unlink(v.path);
        store.db.prepare('DELETE FROM jobs WHERE video=?').run(id);store.db.prepare('DELETE FROM videos WHERE id=?').run(id);return send(res,200,{ok:true});
      }
      if(req.method==='POST'&&route.startsWith('/api/jobs/')){const b=await json(req);store.action(route.split('/').at(-1),b.action,b.checked);return send(res,200,{ok:true});}
      if(req.method==='GET'&&route.startsWith('/media/')){
        const v=store.video(route.split('/').at(-1)),size=(await stat(v.path)).size;
        const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
        if(match){const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):size-1,size-1);if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}res.writeHead(206,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});return createReadStream(v.path,{start,end}).pipe(res);}
        res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':size,'Accept-Ranges':'bytes'});return createReadStream(v.path).pipe(res);
      }
      const staticFiles={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
      if(req.method==='GET'&&staticFiles[route]){res.setHeader('Content-Type',route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html');return res.end(await readFile(path.join(appRoot,'public',staticFiles[route])));}
      send(res,404,{error:'Not found.'});
    }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end();}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){store.close();throw e;}
  store.recover();
  const tick=async()=>{
    if(working||closing||browsers.busy)return;working=true;
    try{const job=store.claim();if(job){const result=job.platform==='youtube'?await youtube.upload(job,store.video(job.video)):await upload(browsers,job,store.video(job.video));if(result.needsReconnect)store.disconnect(job.profile,job.platform);store.finish(job.id,result.state,result.message,result.url);}}
    catch(e){console.error('Worker:',e.message);}finally{working=false;}
  };
  const timer=worker?setInterval(tick,3000):null;
  return {server,store,port:server.address().port,async close(){closing=true;clearInterval(timer);await browsers.closeAll();while(working)await new Promise(r=>setTimeout(r,50));await new Promise(r=>server.close(r));store.close();}};
}

async function receive(req,profile,filename,dataDir,store){
  const name=path.basename(String(filename||'')),file=path.join(dataDir,'videos',`${randomUUID()}.mp4`);
  if(!/\.mp4$/i.test(name))throw Error('Please use an MP4 video.');
  if(Number(req.headers['content-length'])>1024*1024*1024)throw Error('File exceeds 1 GB.');
  let size=0;
  const limiter=new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>1024*1024*1024?Error('File exceeds 1 GB.'):null,chunk);}});
  try{
    await pipeline(req,limiter,createWriteStream(file,{mode:0o600}));
    const metadata=await inspectVideo(file);metadata.madeForKids=false;
    const video=store.addVideo({profile,name,path:file,title:name.replace(/\.mp4$/i,'').slice(0,100),metadata});return {id:video.id,name};
  }catch(e){await unlink(file).catch(()=>{});throw e;}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp();console.log(`Crosspost Local is ready: http://127.0.0.1:${app.port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
