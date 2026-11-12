import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createApp} from '../src/server.mjs';
import {verifyPackageManifest} from '../src/release-integrity.mjs';
const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const integrity=await verifyPackageManifest(appRoot);
console.log(`Package integrity verified: ${integrity.files} files.`);
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(appRoot,'browsers');
const {chromium}=await import('playwright');
const dataDir=await mkdtemp(path.join(tmpdir(),'crosspost-bundle-'));
let app,browser;
try{
  app=await createApp({dataDir,port:0,worker:false});
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${app.port}`);
  await page.getByRole('heading',{name:'Your videos'}).waitFor();
  await page.getByRole('button',{name:'Accounts',exact:true}).click();
  await page.getByRole('heading',{name:'Your accounts'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Connect',exact:true}).count(),3);
  console.log('Bundled runtime, SQLite, server, browser and account dashboard passed. No social posting attempted.');
}finally{
  await browser?.close();await app?.close();await rm(dataDir,{recursive:true,force:true});
}
