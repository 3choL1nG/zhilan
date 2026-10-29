import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';import {DATA} from './config.mjs';
fs.mkdirSync(DATA,{recursive:true,mode:0o700});
export const db=new DatabaseSync(path.join(DATA,'zhilan.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',active INTEGER NOT NULL DEFAULT 1,quota INTEGER NOT NULL DEFAULT 268435456,must_change INTEGER DEFAULT 1,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL,csrf TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,started INTEGER NOT NULL,deadline INTEGER,snapshot TEXT NOT NULL,answers TEXT NOT NULL DEFAULT '{}',marks TEXT NOT NULL DEFAULT '[]',score REAL,auto_score REAL,self_score REAL,finished INTEGER,revision INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS progress(user_id INTEGER NOT NULL REFERENCES users(id),question_id TEXT NOT NULL,wrong INTEGER DEFAULT 0,favorite INTEGER DEFAULT 0,seen INTEGER DEFAULT 0,correct INTEGER DEFAULT 0,last_answer TEXT,updated INTEGER,PRIMARY KEY(user_id,question_id));
CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),question_id TEXT,text TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),attempt_id TEXT REFERENCES attempts(id),question_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created INTEGER NOT NULL,touched INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS attempt_owner ON attempts(user_id,status);`);
export const now=()=>Date.now();
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex')}
export function verifyPassword(password,stored){try{const [salt,hash]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'))}catch{return false}}
export function tokenHash(raw){return createHash('sha256').update(raw).digest('hex')}
export function publicUser(u){return {id:u.id,username:u.username,role:u.role,quota:u.quota,mustChange:!!u.must_change}}
export function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
export function createUser(username,password,role='user'){if(!/^[A-Za-z0-9_.-]{2,32}$/.test(username))throw Error('账号需为2–32位字母、数字或_.-');if(typeof password!=='string'||password.length<10||password.length>200)throw Error('密码需为10–200位');const result=db.prepare('INSERT INTO users(username,password,role,created) VALUES(?,?,?,?)').run(username,hashPassword(password),role,now());return Number(result.lastInsertRowid)}
