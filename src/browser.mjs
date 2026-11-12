import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export const destinations={youtube:'https://studio.youtube.com/',instagram:'https://www.instagram.com/',tiktok:'https://www.tiktok.com/tiktokstudio/upload'};
export function browserError(error){
  const message=String(error?.message||error);
  if(message.includes('ERR_NETWORK_ACCESS_DENIED'))return 'This computer or execution environment blocked the browser’s internet access. Account sign-in and publishing need network access. No connection was saved.';
  if(/Executable doesn't exist|browserType\.launch.*executable/i.test(message))return 'The included browser is missing. Re-extract the complete app package, or run Setup if using the source version.';
  return message.replace(/\u001b\[[0-9;]*m/g,'').split('\n')[0].slice(0,350);
}
export class Browsers {
  constructor(root){this.root=root;this.sessions=new Map();this.busy=false;}
  async open(profile,platform){
    const key=`${profile}-${platform}`;
    if(this.sessions.has(key))return this.sessions.get(key);
    const directory=path.join(this.root,key);await mkdir(directory,{recursive:true,mode:0o700});
    let chromium;
    try{({chromium}=await import('playwright'));}catch{throw Error('Browser component is not installed. Run the Setup launcher first.');}
    const context=await chromium.launchPersistentContext(directory,{headless:false,viewport:{width:1280,height:900},locale:'en-US',acceptDownloads:false});
    this.sessions.set(key,context);context.on('close',()=>this.sessions.delete(key));return context;
  }
  async connect(profile,platform){
    if(this.busy)throw Error('Wait until the current upload finishes before opening account settings.');
    this.busy=true;
    try{
    const context=await this.open(profile,platform);const page=context.pages()[0]||await context.newPage();
    await page.goto(destinations[platform],{waitUntil:'domcontentloaded',timeout:60000});await page.bringToFront();
    }catch(error){throw Error(browserError(error));}finally{this.busy=false;}
  }
  async verify(profile,platform){
    const context=this.sessions.get(`${profile}-${platform}`);
    if(!context)throw Error('Open the sign-in browser and finish signing in first.');
    const page=context.pages()[0];
    if(!page)throw Error('Open the sign-in browser again.');
    const host=new URL(page.url()).hostname;
    if(!(host===new URL(destinations[platform]).hostname))throw Error('Finish signing in, then return to the platform.');
    const ready=platform==='youtube'?page.getByRole('button',{name:/^Create$/i}):platform==='instagram'?page.getByRole('link',{name:/^New post$|^Create$/i}):page.locator('input[type="file"]');
    if(!await ready.count())throw Error('The signed-in upload screen could not be verified. Finish signing in or reopen the account browser.');
    if(platform!=='tiktok'&&!await ready.first().isVisible())throw Error('The signed-in upload screen is not ready.');
    return true;
  }
  async closeAll(){for(const context of this.sessions.values())await context.close().catch(()=>{});}
  async close(profile,platform){
    const key=`${profile}-${platform}`,context=this.sessions.get(key);
    if(context){await context.close();this.sessions.delete(key);}
  }
}

// Selectors below target the English desktop publishing interfaces. They are
// intentionally strict: UI changes fail closed instead of clicking guesses.
async function click(locator){await locator.first().click({timeout:30000});}
async function fill(locator,text){await locator.first().fill(text,{timeout:30000});}
async function success(page,expression,timeout=120000){await page.getByText(expression).first().waitFor({state:'visible',timeout});}
async function caption(page,locator,text){await fill(locator,text);}

export async function upload(browsers,job,video){
  browsers.busy=true;
  let context,committing=false,needsReconnect=false;
  try{
    context=await browsers.open(video.profile,job.platform);
    const page=context.pages()[0]||await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(destinations[job.platform],{waitUntil:'domcontentloaded',timeout:60000});
    try{await browsers.verify(video.profile,job.platform);}catch(e){needsReconnect=true;throw e;}
    const text=[video.title,video.description].filter(Boolean).join('\n\n');
    const commit=()=>{committing=true;};
    const url=await adapters[job.platform](page,video,text,commit);
    return {state:'published',message:'Publication confirmation detected in the platform browser.',url};
  }catch(e){
    const note=committing?'The final publish step started. Check the platform before retrying to avoid a duplicate.':'The browser could not complete the upload. Check login, verification prompts, and the draft before retrying.';
    return {state:'attention',message:`${note} ${browserError(e)}`,url:null,needsReconnect};
  }finally{
    // Release browser memory after each upload. Saved sign-in data stays on disk.
    if(context)await browsers.close(video.profile,job.platform).catch(()=>{});
    browsers.busy=false;
  }
}

const adapters={
  async youtube(page,video,text,commit){
    await click(page.getByRole('button',{name:/^Create$/i}));
    await click(page.getByText('Upload videos',{exact:true}));
    await page.locator('input[type="file"]').setInputFiles(video.path);
    const fields=page.locator('ytcp-social-suggestions-textbox #textbox');
    await fill(fields.nth(0),video.title);await fill(fields.nth(1),video.description);
    // Audience classification must be set explicitly by the user in the queue UI.
    await click(page.getByText(video.metadata.madeForKids?"Yes, it's made for kids":"No, it's not made for kids",{exact:true}));
    for(let n=0;n<3;n++)await click(page.getByRole('button',{name:'Next',exact:true}));
    await click(page.getByRole('radio',{name:/^Public/}));
    commit();await click(page.getByRole('button',{name:'Publish',exact:true}));
    await success(page,/^Video published[.!]?$/i);
    const link=await page.locator('a[href*="youtu.be/"]').first().getAttribute('href').catch(()=>null);
    return link;
  },
  async instagram(page,video,text,commit){
    await click(page.getByRole('link',{name:/^New post$|^Create$/i}));
    await page.locator('input[type="file"]').setInputFiles(video.path);
    // Preserve the uploaded portrait crop when the aspect-ratio selector exists.
    const crop=page.getByRole('button',{name:/Select crop/i});
    if(await crop.count()){await click(crop);await click(page.getByText('Original',{exact:true}));}
    await click(page.getByRole('button',{name:'Next',exact:true}));
    await click(page.getByRole('button',{name:'Next',exact:true}));
    await caption(page,page.getByRole('textbox',{name:/Write a caption/i}),text);
    commit();await click(page.getByRole('button',{name:'Share',exact:true}));
    await success(page,/^Your (?:reel|post) has been shared[.!]?$/i);
    return null;
  },
  async tiktok(page,video,text,commit){
    await page.locator('input[type="file"]').setInputFiles(video.path);
    await caption(page,page.locator('[contenteditable="true"]').first(),text);
    // A previously saved privacy choice may not be public; require visible Everyone.
    await page.getByText('Everyone',{exact:true}).first().waitFor({state:'visible',timeout:30000});
    commit();await click(page.getByRole('button',{name:'Post',exact:true}));
    // Upload completion alone does not establish that a video was published.
    await success(page,/^(?:Your video has been posted|Video posted|Your video has been published|Video published)(?: successfully)?[.!]?$/i);
    return null;
  }
};
