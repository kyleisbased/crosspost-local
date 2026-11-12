import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Portable distributions include their own browser. Media inspection is built in.
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(root,'browsers');
// Keep private sessions outside the distributable folder and app updates.
const base=process.platform==='win32'?(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local')):path.join(os.homedir(),'Library','Application Support');
process.env.CROSSPOST_DATA=path.join(base,'CrosspostLocal');
await import('./launch.mjs');
