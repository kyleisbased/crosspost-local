import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash,validate} from './update.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const names=['package.json','README.md','YOUTUBE-SETUP.md','UPDATE.md','AGENTS.md','Update-Windows.cmd','Update-Mac.command'];
for(const dir of ['src','public'])for(const name of await readdir(path.join(root,dir)))if(/\.(mjs|js|html|css)$/.test(name))names.push(dir+'/'+name);
for(const name of ['launch.mjs','portable-launch.mjs','update.mjs'])names.push('scripts/'+name);
const files=[];for(const name of names){const bytes=await readFile(path.join(root,name));files.push({path:name,sha256:hash(bytes),data:bytes.toString('base64')});}
const bundle={format:1,app:pkg.name,version:pkg.version,nodeMajor:24,dependencies:pkg.dependencies,files};validate(bundle,pkg);
await mkdir(path.join(root,'update-release'),{recursive:true});
await writeFile(path.join(root,'update-release','Crosspost-update.json'),JSON.stringify(bundle));
console.log(`Packaged Crosspost ${pkg.version} update (${files.length} files).`);
