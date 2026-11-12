import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {writePackageManifest,verifyPackageManifest} from '../src/release-integrity.mjs';
async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'crosspost-package-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'runtime'));await writeFile(path.join(root,'runtime','node'),'runtime fixture');
  await writeFile(path.join(root,'app.js'),'app fixture');await writePackageManifest(root,{target:'test'});return root;
}
test('package integrity accepts complete packages and harmless OS metadata',async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'.DS_Store'),'Finder');
  assert.deepEqual(await verifyPackageManifest(root),{files:2});
});
test('package integrity rejects altered, missing and unexpected app files',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'app.js'),'changed');await assert.rejects(verifyPackageManifest(root),/app.js/);
  await writeFile(path.join(root,'app.js'),'app fixture');await rm(path.join(root,'runtime','node'));
  await assert.rejects(verifyPackageManifest(root),/runtime\/node/);
  await writeFile(path.join(root,'runtime','node'),'runtime fixture');await writeFile(path.join(root,'extra.js'),'new code');
  await assert.rejects(verifyPackageManifest(root),/extra.js/);
});
test('package integrity rejects a directory link outside the distribution',async t=>{
  const root=await fixture(t),outside=await mkdtemp(path.join(tmpdir(),'crosspost-link-'));
  t.after(()=>rm(outside,{recursive:true,force:true}));
  try{await symlink(outside,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');}
  catch(error){if(error.code==='EPERM'){t.skip('Link creation unavailable on this host');return;}throw error;}
  await assert.rejects(writePackageManifest(root),/outside the app/);
});
