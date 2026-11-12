import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
export const platforms = ['youtube', 'instagram', 'tiktok'];
export class Store {
  constructor(file, recover=true) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(profile TEXT NOT NULL REFERENCES profiles(id),platform TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',confirmed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(profile,platform));
      CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,profile TEXT NOT NULL REFERENCES profiles(id),name TEXT NOT NULL,path TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',metadata TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,video TEXT NOT NULL REFERENCES videos(id),platform TEXT NOT NULL,state TEXT NOT NULL,due INTEGER NOT NULL,message TEXT NOT NULL DEFAULT '',url TEXT,updated INTEGER NOT NULL,UNIQUE(video,platform));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    if (!this.db.prepare('SELECT id FROM profiles LIMIT 1').get()) this.addProfile('My first profile');
    if(recover)this.recover();
  }
  recover(){this.db.prepare("UPDATE jobs SET state='attention',message='App stopped during upload. Check the platform before retrying.',updated=? WHERE state='running'").run(Date.now());}
  addProfile(name) {
    name = String(name || '').trim();
    if (!name || name.length > 60) throw Error('Use a profile name between 1 and 60 characters.');
    const id = randomUUID(); this.db.prepare('INSERT INTO profiles VALUES(?,?)').run(id,name);
    for (const p of platforms) this.db.prepare('INSERT INTO accounts(profile,platform) VALUES(?,?)').run(id,p);
    return {id,name};
  }
  profile(id) { const p=this.db.prepare('SELECT * FROM profiles WHERE id=?').get(id); if(!p) throw Error('Profile not found.'); return p; }
  disconnect(profile,platform) {
    this.profile(profile);if(!platforms.includes(platform))throw Error('Unknown platform.');
    this.db.prepare('UPDATE accounts SET confirmed=0 WHERE profile=? AND platform=?').run(profile,platform);
  }
  video(id) { const v=this.db.prepare('SELECT * FROM videos WHERE id=?').get(id); if(!v) throw Error('Video not found.'); return {...v,metadata:JSON.parse(v.metadata)}; }
  addVideo(v) { this.profile(v.profile);const id=randomUUID(); this.db.prepare('INSERT INTO videos VALUES(?,?,?,?,?,?,?,?)').run(id,v.profile,v.name,v.path,v.title,'',JSON.stringify(v.metadata),Date.now());return this.video(id); }
  editVideo(id,title,description) {
    if(typeof title!=='string'||typeof description!=='string')throw Error('Title and description must be text.');
    this.video(id);
    if (this.db.prepare("SELECT id FROM jobs WHERE video=? AND state IN ('queued','running')").get(id)) throw Error('Cancel pending uploads before editing this video.');
    if(!String(title).trim() || String(title).length>100) throw Error('Title must be 1-100 characters.');
    if(String(description).length>2000) throw Error('Shared description must be 2,000 characters or fewer.');
    this.db.prepare('UPDATE videos SET title=?,description=? WHERE id=?').run(String(title).trim(),String(description),id);
  }
  bulkCaption(ids,description){
    if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw Error('Select 1-100 unique videos.');
    const list=ids.map(id=>this.video(id));
    if(new Set(list.map(v=>v.profile)).size!==1)throw Error('Edit one profile at a time.');
    this.db.exec('BEGIN IMMEDIATE');
    try{for(const v of list)this.editVideo(v.id,v.title,description);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  queue(ids,targets,start,interval) {
    if(!Array.isArray(ids)||!ids.length||ids.length>100) throw Error('Select 1-100 videos.');
    if(!Array.isArray(targets)||!targets.length||targets.some(p=>!platforms.includes(p))) throw Error('Select a valid platform.');
    if(new Set(ids).size!==ids.length||new Set(targets).size!==targets.length) throw Error('Duplicate selections.');
    if(!Number.isFinite(start)||!Number.isFinite(interval)||interval<0||interval>31536000000) throw Error('Invalid schedule.');
    const list=ids.map(id=>this.video(id));
    if(new Set(list.map(v=>v.profile)).size!==1) throw Error('Schedule one profile at a time.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for(const [i,v] of list.entries()) for(const p of targets) {
        const a=this.db.prepare('SELECT * FROM accounts WHERE profile=? AND platform=?').get(v.profile,p);
        if(!a?.confirmed) throw Error(`Connect and confirm ${p} for this profile first.`);
        const existing=this.db.prepare('SELECT state FROM jobs WHERE video=? AND platform=?').get(v.id,p);
        if(existing && existing.state!=='cancelled') throw Error(`${v.name} already has a ${p} upload. Review its existing status.`);
        this.db.prepare(`INSERT INTO jobs VALUES(?,?,?,?,?,'',NULL,?) ON CONFLICT(video,platform) DO UPDATE SET state='queued',due=excluded.due,message='',url=NULL,updated=excluded.updated`).run(randomUUID(),v.id,p,'queued',start+i*interval,Date.now());
      }
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK');throw e; }
  }
  claim(now=Date.now()) {
    if(this.paused())return null;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const j=this.db.prepare("SELECT jobs.*,videos.profile FROM jobs JOIN videos ON jobs.video=videos.id JOIN accounts ON accounts.profile=videos.profile AND accounts.platform=jobs.platform WHERE jobs.state='queued' AND jobs.due<=? AND accounts.confirmed=1 ORDER BY jobs.due,jobs.updated LIMIT 1").get(now);
      if(j) this.db.prepare("UPDATE jobs SET state='running',updated=? WHERE id=?").run(now,j.id);
      this.db.exec('COMMIT');return j;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  finish(id,state,message='',url=null) {this.db.prepare('UPDATE jobs SET state=?,message=?,url=?,updated=? WHERE id=?').run(state,message,url,Date.now(),id);}
  action(id,action,checked=false) {
    const j=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);if(!j)throw Error('Upload not found.');
    if(j.state==='running')throw Error('An upload is running. Wait for it to finish.');
    if(action==='cancel'&&j.state==='queued')return this.finish(id,'cancelled','Cancelled by you.');
    if(action==='retry'&&j.state==='attention'&&checked) {this.db.prepare("UPDATE jobs SET state='queued',due=?,message='',updated=? WHERE id=?").run(Date.now(),Date.now(),id);return;}
    if(action==='complete'&&j.state==='attention'&&checked)return this.finish(id,'published','Marked published by you after checking the platform.');
    throw Error('Review the platform and confirm its actual status before retrying.');
  }
  paused(){return this.db.prepare("SELECT value FROM settings WHERE key='paused'").get()?.value==='true';}
  pause(value){this.db.prepare("INSERT INTO settings VALUES('paused',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(value));}
  snapshot(){return {profiles:this.db.prepare('SELECT * FROM profiles').all(),accounts:this.db.prepare('SELECT * FROM accounts').all(),videos:this.db.prepare('SELECT id,profile,name,title,description,metadata,created FROM videos ORDER BY created').all().map(v=>({...v,metadata:JSON.parse(v.metadata)})),jobs:this.db.prepare('SELECT * FROM jobs ORDER BY due').all(),paused:this.paused()};}
  close(){this.db.close();}
}
