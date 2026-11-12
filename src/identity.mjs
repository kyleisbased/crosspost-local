import path from 'node:path';
import {createHash} from 'node:crypto';
export function dataIdentity(directory){
  let resolved=path.resolve(directory);
  if(process.platform==='win32')resolved=resolved.toLowerCase();
  return createHash('sha256').update(resolved).digest('hex');
}
