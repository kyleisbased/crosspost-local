import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';

const scopes=['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'];
// The distributed credential correction is pending explicit publication approval.
export const desktopClientId='339324138959-4aa8v02qckvq3tc7kcrvitb968j64rdu.apps.googleusercontent.com';
export async function openGoogle(url){
  const parsed=new URL(url);
  if(parsed.origin!=='https://accounts.google.com')throw Error('Invalid Google sign-in URL.');
  const command=process.platform==='win32'?'explorer.exe':process.platform==='darwin'?'open':'xdg-open';
  const child=spawn(command,[url],{detached:true,windowsHide:true,stdio:'ignore'});
  await once(child,'spawn');child.unref();
}
async function save(file,value){
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
  await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);
}
async function read(file){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('Cannot read saved YouTube settings. Restore the data backup or reconnect.');}}
function authError(message){return Object.assign(Error(message),{needsReconnect:true});}
export class YouTube {
  constructor(dataDir,{fetcher=fetch,openBrowser=openGoogle,now=Date.now}={}){
    this.root=path.join(dataDir,'youtube');this.fetch=fetcher;this.openBrowser=openBrowser;this.now=now;this.pending=new Map();this.generations=new Map();this.config=null;
  }
  async init(){this.config=await read(path.join(this.root,'client.json'))||{client_id:desktopClientId};return this;}
  file(profile){if(!/^[a-zA-Z0-9_-]+$/.test(profile))throw Error('Invalid profile.');return path.join(this.root,profile+'.json');}
  async hasToken(profile){const value=await read(this.file(profile));return !!(this.config&&value?.client_id===this.config.client_id&&value.refresh_token);}
  async configure(input){
    const c=input?.installed;
    if(!c||typeof c.client_id!=='string'||!/^[-a-zA-Z0-9_.]+\.apps\.googleusercontent\.com$/.test(c.client_id)||c.client_id.length>300)throw Error('Choose the Desktop app OAuth JSON downloaded from Google Cloud. Web app credentials will not work.');
    if(c.client_secret!==undefined&&(typeof c.client_secret!=='string'||c.client_secret.length>300))throw Error('Invalid desktop client settings.');
    this.config={client_id:c.client_id,client_secret:c.client_secret||''};this.pending.clear();this.generations.clear();
    await save(path.join(this.root,'client.json'),this.config);
  }
  async connect(profile,origin){
    if(!this.config)throw Error('YouTube needs the Google Desktop app JSON first. Open YouTube setup below.');
    for(const [key,p] of this.pending)if(p.profile===profile||p.expires<this.now())this.pending.delete(key);
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
    const redirect=origin+'/oauth/youtube/callback';
    this.pending.set(state,{profile,verifier,redirect,expires:this.now()+10*60*1000,config:{...this.config}});
    this.generations.set(profile,state);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:this.config.client_id,redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent select_account'}).toString();
    // A normal system browser is required. Never launch Google login in Playwright.
    try{await this.openBrowser(url.href);}catch{/* The dashboard also offers this exact link. */}
    return {authorizationUrl:url.href};
  }
  async request(url,options={},stage='YouTube request'){
    let r;try{r=await this.fetch(url,{...options,redirect:'error',signal:options.signal||AbortSignal.timeout(30000)});}catch{throw Error('Cannot reach Google. Check your connection and try again.');}
    if(!r.ok){
      const detail=await r.json().catch(()=>({}));
      const code=typeof detail.error==='string'&&/^[a-z_]{1,60}$/.test(detail.error)?detail.error:null;
      const prefix=`${stage} failed (${r.status}${code?': '+code:''}). `;
      if(r.status===401||code==='invalid_grant')throw authError(prefix+'Google rejected the authorization code or refresh token. Start Connect YouTube again; do not refresh the callback page.');
      if(code==='invalid_client')throw authError(prefix+'Google rejected Crosspost\'s desktop app credentials. Update Crosspost or contact its maintainer.');
      if(code==='invalid_request'){
        // Classify known descriptions, never echo arbitrary response text or tokens.
        const missingSecret=/client_secret.*(?:missing|required)|(?:missing|required).*client_secret/i.test(String(detail.error_description||''));
        throw Error(prefix+(missingSecret?'Google requires the desktop client credential missing from this installation. Update Crosspost or contact its maintainer.':'Google rejected the sign-in request parameters. Send this error to the Crosspost maintainer.'));
      }
      const reason=detail.error?.errors?.[0]?.reason;
      if(reason==='quotaExceeded'||reason==='uploadLimitExceeded')throw Error('YouTube upload quota or account limit reached. Try again after the limit resets.');
      if(r.status===403)throw Error('Google denied access. Check YouTube API access, consent permissions, test-user access, and account upload limits in Google Cloud.');
      throw Error(prefix+'Send this error to the Crosspost maintainer.');
    }
    return r;
  }
  async exchange(config,fields){
    const credentials={client_id:config.client_id};
    if(config.client_secret)credentials.client_secret=config.client_secret;
    const r=await this.request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...credentials,...fields}).toString()},fields.grant_type==='refresh_token'?'Google session refresh':'Google sign-in token exchange');
    const token=await r.json();if(!token.access_token)throw authError('Google did not return an access token. Reconnect YouTube.');
    return {...token,expires_at:this.now()+Number(token.expires_in||3600)*1000};
  }
  async callback(params){
    const state=params.get('state'),p=this.pending.get(state);this.pending.delete(state);
    if(!p||p.expires<this.now())throw Error('This sign-in link expired or was already used. Start Connect YouTube again.');
    if(params.has('error'))throw Error('Google sign-in was cancelled or denied. Reconnect and approve the requested permissions. Your Google account or organization may restrict access.');
    const code=params.get('code');if(!code||code.length>4096)throw Error('Google did not return a valid sign-in code.');
    const token=await this.exchange(p.config,{code,code_verifier:p.verifier,redirect_uri:p.redirect,grant_type:'authorization_code'});
    if(!token.refresh_token)throw Error('Google did not grant offline access. Reconnect YouTube and approve the requested permissions.');
    const granted=new Set(String(token.scope||'').split(' '));
    if(!scopes.every(s=>granted.has(s)))throw Error('Both upload and channel-read permissions are needed. Reconnect and approve both permissions.');
    const r=await this.request('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:{Authorization:`Bearer ${token.access_token}`}},'YouTube channel verification');
    const channels=(await r.json()).items;
    if(channels?.length!==1||!channels[0].id||!channels[0].snippet?.title)throw Error('Google did not return one YouTube channel. Create or select the correct channel and reconnect.');
    const channel=channels[0];
    if(this.config.client_id!==p.config.client_id||this.generations.get(p.profile)!==state)throw Error('YouTube settings or sign-in changed. Please use the newest sign-in attempt.');
    await save(this.file(p.profile),{...token,client_id:p.config.client_id,channelId:channel.id,label:channel.snippet.title});
    return {profile:p.profile,label:channel.snippet.title};
  }
  async accessToken(profile){
    const saved=await read(this.file(profile));
    if(!this.config||saved?.client_id!==this.config.client_id||!saved.refresh_token)throw authError('Reconnect YouTube using Google sign-in. The old browser connection is no longer used.');
    if(saved.expires_at>this.now()+60000)return saved.access_token;
    const token=await this.exchange(this.config,{refresh_token:saved.refresh_token,grant_type:'refresh_token'});
    const next={...saved,...token,refresh_token:token.refresh_token||saved.refresh_token};await save(this.file(profile),next);return next.access_token;
  }
  async upload(job,video){
    let submitted=false;
    try{
      const token=await this.accessToken(job.profile),size=(await stat(video.path)).size;
      const headers={Authorization:`Bearer ${token}`};
      const r=await this.request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Upload-Content-Length':String(size),'X-Upload-Content-Type':'video/mp4'},body:JSON.stringify({snippet:{title:video.title,description:video.description,categoryId:'22'},status:{privacyStatus:'public',selfDeclaredMadeForKids:video.metadata.madeForKids===true}})});
      const location=new URL(r.headers.get('location'));
      if(location.origin!=='https://www.googleapis.com'||!location.pathname.startsWith('/upload/youtube/'))throw Error('Google returned an unexpected upload endpoint. Upload stopped.');
      submitted=true;
      const stream=createReadStream(video.path);let response;
      try{response=await this.request(location.href,{method:'PUT',headers:{...headers,'Content-Type':'video/mp4','Content-Length':String(size)},body:stream,duplex:'half',signal:AbortSignal.timeout(15*60*1000)});}finally{stream.destroy();}
      const result=await response.json();
      if(!/^[a-zA-Z0-9_-]{11}$/.test(result.id||''))throw Error('YouTube did not confirm a video ID.');
      const url=`https://www.youtube.com/watch?v=${result.id}`;
      if(result.status?.privacyStatus!=='public'||['failed','rejected','deleted'].includes(result.status?.uploadStatus))return {state:'attention',message:'YouTube received the video but did not confirm public visibility. Open it in Studio; do not upload a duplicate.',url};
      return {state:'published',message:'YouTube accepted the public upload. Processing may take a few minutes.',url};
    }catch(e){return {state:'attention',message:(submitted?'The upload may have reached YouTube. Check Studio before retrying. ':'')+e.message,needsReconnect:!!e.needsReconnect};}
  }
}

