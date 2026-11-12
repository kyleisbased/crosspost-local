import {createReadStream} from 'node:fs';
import {readdir,readlink,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const manifestName='PACKAGE-MANIFEST.json';
const metadata=name=>['.ds_store','thumbs.db','desktop.ini'].includes(name.toLowerCase())||name.startsWith('._');
async function digest(file){
  const hash=createHash('sha256');for await(const data of createReadStream(file))hash.update(data);return hash.digest('hex');
}
async function inventory(root,relative=''){
  const results=[];
  const entries=await readdir(path.join(root,relative),{withFileTypes:true});
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    if(metadata(entry.name)||(!relative&&entry.name===manifestName))continue;
    const name=relative?`${relative}/${entry.name}`:entry.name;
    const absolute=path.join(root,...name.split('/'));
    if(entry.isSymbolicLink()){
      const target=await readlink(absolute);
      const resolved=path.resolve(path.dirname(absolute),target);
      const destination=path.relative(root,resolved);
      if(path.isAbsolute(target)||destination==='..'||destination.startsWith('..'+path.sep))throw Error(`Package link points outside the app: ${name}`);
      results.push({path:name,kind:'link',target:target.replaceAll('\\','/')});
    }else if(entry.isDirectory())results.push(...await inventory(root,name));
    else if(entry.isFile())results.push({path:name,kind:'file',bytes:(await stat(absolute)).size,sha256:await digest(absolute)});
    else throw Error(`Unsupported package entry: ${name}`);
  }
  return results.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export async function writePackageManifest(directory,details={}){
  const root=path.resolve(directory),files=await inventory(root);
  const manifest={format:1,...details,files};
  await writeFile(path.join(root,manifestName),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export async function verifyPackageManifest(directory){
  const root=path.resolve(directory),manifest=JSON.parse(await readFile(path.join(root,manifestName),'utf8'));
  if(manifest.format!==1||!Array.isArray(manifest.files))throw Error('Unsupported package manifest.');
  const actual=await inventory(root),expected=new Map(manifest.files.map(file=>[file.path,file]));
  if(expected.size!==manifest.files.length)throw Error('Duplicate entries in package manifest.');
  const changed=[];
  for(const file of actual){
    if(JSON.stringify(file)!==JSON.stringify(expected.get(file.path)))changed.push(file.path);
    expected.delete(file.path);
  }
  changed.push(...expected.keys());
  if(changed.length)throw Error(`Package is incomplete or changed: ${changed.slice(0,5).join(', ')}. Extract a fresh copy of the entire download.`);
  return {files:actual.length};
}
