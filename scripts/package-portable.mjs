import {cp,mkdir,readFile,writeFile,access,chmod,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writePackageManifest,verifyPackageManifest} from '../src/release-integrity.mjs';
import {verifyLauncher} from './verify-launcher.mjs';
const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=`${process.platform}-${process.arch}`;
const assembleOnly=process.argv.includes('--assemble-only');
if(!['win32','darwin'].includes(process.platform))throw Error('Build on Windows or macOS, matching the recipient machine.');
if(process.versions.node.split('.')[0]!=='24')throw Error('Build with Node.js 24.');

// Validate everything before producing a folder that could be mistaken for a release.
let chromium;
try{({chromium}=await import('playwright'));}
catch{throw Error('Build blocked: dependencies are missing. No portable release was produced.');}
const browserExe=chromium.executablePath();await access(browserExe);
// Chromium's revision folder is the self-contained unit, including its licenses.
let browserFolder=path.dirname(browserExe);
while(!/^chromium-\d+$/.test(path.basename(browserFolder))){
 const parent=path.dirname(browserFolder);if(parent===browserFolder)throw Error('Cannot locate the installed Chromium revision folder.');browserFolder=parent;
}
const nodeLicense=process.env.CROSSPOST_NODE_LICENSE||path.join(path.dirname(process.execPath),'LICENSE');
await access(nodeLicense).catch(()=>{throw Error('Provide the Node.js distribution LICENSE using CROSSPOST_NODE_LICENSE before redistribution.');});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const finalOut=path.join(root,'releases',`Crosspost-${target}-${stamp}`);
const out=finalOut+'.partial';
const app=process.platform==='darwin'?path.join(out,'Crosspost.app','Contents','Resources','app'):out;
await mkdir(path.join(app,'runtime'),{recursive:true});
await mkdir(path.join(app,'scripts'),{recursive:true});
await mkdir(path.join(app,'node_modules'),{recursive:true});
for(const name of ['src','public','package.json'])await cp(path.join(root,name),path.join(app,name),{recursive:true});
for(const name of ['launch.mjs','portable-launch.mjs','verify-bundle.mjs'])await cp(path.join(root,'scripts',name),path.join(app,'scripts',name));
for(const name of ['playwright','playwright-core'])await cp(path.join(root,'node_modules',name),path.join(app,'node_modules',name),{recursive:true});
await cp(process.execPath,path.join(app,'runtime',process.platform==='win32'?'node.exe':'node'));
await cp(nodeLicense,path.join(app,'runtime',`NODE-LICENSE${path.extname(nodeLicense)||'.txt'}`));
await cp(browserFolder,path.join(app,'browsers',path.basename(browserFolder)),{recursive:true,verbatimSymlinks:true});
await writeFile(path.join(out,'READ-ME.txt'),`Crosspost Local - TEST BUILD\n\nExtract the whole download, then open Crosspost.${process.platform==='win32'?'exe':'app'}.\nNode.js and Chromium are included; no separate developer-tool installation is intended.\nConnect your accounts in the Accounts tab. Keep the app running and computer awake for scheduled uploads.\nPrivate videos and sessions are stored in your user account's CrosspostLocal application-data folder.\n\nThis unsigned build is for testing, not production publishing. ${assembleOnly?'The bundled executable could not be validated in the build environment. ':''}Real account connections and publishing have not been verified.\n`);
if(process.platform==='win32'){
 const csc=path.join(process.env.WINDIR,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 await exec(csc,['/nologo','/target:winexe','/reference:System.Windows.Forms.dll',`/out:${path.join(out,'Crosspost.exe')}`,path.join(root,'scripts','WindowsLauncher.cs')],{windowsHide:true});
}else{
 const contents=path.join(out,'Crosspost.app','Contents');await mkdir(path.join(contents,'MacOS'),{recursive:true});
 await writeFile(path.join(contents,'Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Crosspost</string><key>CFBundleIdentifier</key><string>local.crosspost.app</string><key>CFBundleExecutable</key><string>Crosspost</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>0.1.0</string></dict></plist>`);
 const launcher=path.join(contents,'MacOS','Crosspost');await cp(path.join(root,'scripts','MacLauncher.sh'),launcher);await chmod(launcher,0o755);
 await chmod(path.join(app,'runtime','node'),0o755);
}
// Check bundled executables, rather than relying on the developer's PATH.
const node=path.join(app,'runtime',process.platform==='win32'?'node.exe':'node');
await access(path.join(app,'browsers',path.basename(browserFolder),path.relative(browserFolder,browserExe)));
const status={target,builtAt:new Date().toISOString(),bundledDependencyChecks:assembleOnly?'NOT RUN - assembly only':'pending',launcherChecks:assembleOnly?'NOT RUN - assembly only':'pending',livePublishing:'NOT VERIFIED',signing:'NOT CONFIGURED'};
const manifestDetails={target,nodeVersion:process.versions.node,browserVersion:JSON.parse(await readFile(path.join(root,'node_modules','playwright','package.json'),'utf8')).version};
await writeFile(path.join(out,'BUILD-STATUS.json'),JSON.stringify(status,null,2));
await writePackageManifest(app,manifestDetails);
try{
 if(!assembleOnly){
  await exec(node,['--version'],{windowsHide:true,timeout:15000});
  await exec(node,[path.join(app,'scripts','verify-bundle.mjs')],{cwd:app,windowsHide:true,timeout:60000});
  status.bundledDependencyChecks='passed';
  status.launcherChecks='running';
  await verifyLauncher(process.platform==='win32'?path.join(out,'Crosspost.exe'):path.join(out,'Crosspost.app','Contents','MacOS','Crosspost'));
  status.launcherChecks='passed';
 }
}catch(error){
 if(status.bundledDependencyChecks!=='passed')status.bundledDependencyChecks='FAILED';
 if(status.launcherChecks==='running')status.launcherChecks='FAILED';
 status.failure={code:error.code||null,message:String(error.message).split('\n')[0]};
 await writeFile(path.join(out,'BUILD-STATUS.json'),JSON.stringify(status,null,2));
 await writePackageManifest(app,manifestDetails);
 throw Error(`Package verification failed; the unfinished build remains in ${out}. ${status.failure.message}`);
}
await writeFile(path.join(out,'BUILD-STATUS.json'),JSON.stringify(status,null,2));
await writePackageManifest(app,manifestDetails);
await verifyPackageManifest(app);
await rename(out,finalOut);
console.log(`Portable test build created: ${finalOut}`);
