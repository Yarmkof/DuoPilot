import express from "express";
import cors from "cors";
import webpush from "web-push";
import Database from "better-sqlite3";
import { DateTime } from "luxon";

const PORT=Number(process.env.PORT||8080);
const VAPID_PUBLIC_KEY=process.env.VAPID_PUBLIC_KEY||"";
const VAPID_PRIVATE_KEY=process.env.VAPID_PRIVATE_KEY||"";
const VAPID_SUBJECT=process.env.VAPID_SUBJECT||"mailto:admin@example.com";
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||"https://yarmkof.github.io";
const DB_PATH=process.env.DB_PATH||"./data/duopilot.sqlite";

if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY){
  console.error("Missing VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY");
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);

import fs from "fs";
import path from "path";

let effectiveDbPath=DB_PATH;
try{
  fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
}catch(error){
  console.warn(`Cannot create ${path.dirname(DB_PATH)}; falling back to local ./data storage`,error.message);
  effectiveDbPath="./data/duopilot.sqlite";
  fs.mkdirSync(path.dirname(effectiveDbPath),{recursive:true});
}

const db=new Database(effectiveDbPath);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS subscriptions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 endpoint TEXT UNIQUE NOT NULL,
 subscription_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 endpoint TEXT NOT NULL,
 task_id TEXT NOT NULL,
 title TEXT NOT NULL,
 owner TEXT,
 category TEXT,
 due_date TEXT NOT NULL,
 alert_offset INTEGER NOT NULL,
 alert_date TEXT NOT NULL,
 timezone TEXT NOT NULL,
 sent_at TEXT,
 UNIQUE(endpoint,task_id,alert_offset,due_date)
);
`);

const app=express();
app.use(cors({
 origin(origin,cb){
  if(!origin||origin===ALLOWED_ORIGIN||origin.startsWith("https://duopilot-production-")) return cb(null,true);
  cb(new Error("Origin not allowed"));
 }
}));
app.use(express.json({limit:"500kb"}));

app.get("/",(req,res)=>res.json({service:"DuoPilot Push",status:"ok"}));
app.get("/health",(req,res)=>res.json({status:"ok",service:"duopilot-push",time:new Date().toISOString()}));
app.get("/api/push/public-key",(req,res)=>res.json({publicKey:VAPID_PUBLIC_KEY}));

app.post("/api/push/subscribe",(req,res)=>{
 const sub=req.body?.subscription;
 if(!sub?.endpoint)return res.status(400).json({error:"invalid_subscription"});
 const now=new Date().toISOString();
 db.prepare(`INSERT INTO subscriptions(endpoint,subscription_json,created_at,updated_at)
 VALUES(?,?,?,?)
 ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json,updated_at=excluded.updated_at`)
 .run(sub.endpoint,JSON.stringify(sub),now,now);
 const row=db.prepare("SELECT id FROM subscriptions WHERE endpoint=?").get(sub.endpoint);
 res.json({ok:true,subscriptionId:String(row.id)});
});

app.post("/api/reminders/sync",(req,res)=>{
 const endpoint=req.body?.endpoint;
 const reminders=Array.isArray(req.body?.reminders)?req.body.reminders:[];
 const timezone=req.body?.timezone||"Europe/Paris";
 if(!endpoint)return res.status(400).json({error:"endpoint_required"});
 if(!db.prepare("SELECT id FROM subscriptions WHERE endpoint=?").get(endpoint))
   return res.status(404).json({error:"subscription_not_registered"});

 const tx=db.transaction(()=>{
  db.prepare("DELETE FROM reminders WHERE endpoint=?").run(endpoint);
  const ins=db.prepare(`INSERT OR IGNORE INTO reminders
  (endpoint,task_id,title,owner,category,due_date,alert_offset,alert_date,timezone,sent_at)
  VALUES(?,?,?,?,?,?,?,?,?,NULL)`);
  for(const task of reminders){
   if(!task?.id||!task?.title||!task?.dueDate)continue;
   for(const raw of task.alerts||[]){
    const offset=Number(raw);
    if(![0,1,7,14].includes(offset))continue;
    const due=DateTime.fromISO(task.dueDate,{zone:timezone}).startOf("day");
    if(!due.isValid)continue;
    ins.run(endpoint,String(task.id),String(task.title),String(task.owner||""),String(task.category||""),
      due.toISODate(),offset,due.minus({days:offset}).toISODate(),timezone);
   }
  }
 });
 tx();
 const count=db.prepare("SELECT COUNT(*) c FROM reminders WHERE endpoint=?").get(endpoint).c;
 res.json({ok:true,reminderCount:count});
});

async function sendReminder(row){
 const subRow=db.prepare("SELECT subscription_json FROM subscriptions WHERE endpoint=?").get(row.endpoint);
 if(!subRow)return;
 const subscription=JSON.parse(subRow.subscription_json);
 const body=row.alert_offset===0
   ? `Échéance aujourd’hui · ${row.owner}${row.category?" · "+row.category:""}`
   : `${row.alert_offset===1?"La veille":row.alert_offset===7?"1 semaine avant":"2 semaines avant"} · ${row.owner}${row.category?" · "+row.category:""}`;
 const payload=JSON.stringify({
  title:`DuoPilot · ${row.title}`,body,
  tag:`duopilot-${row.task_id}-${row.alert_offset}-${row.due_date}`,
  taskId:row.task_id,url:"./"
 });
 try{
  await webpush.sendNotification(subscription,payload,{TTL:86400});
  db.prepare("UPDATE reminders SET sent_at=? WHERE id=?").run(new Date().toISOString(),row.id);
 }catch(err){
  console.error("Push failed",err.statusCode,err.body||err.message);
  if([404,410].includes(Number(err.statusCode))){
   db.prepare("DELETE FROM reminders WHERE endpoint=?").run(row.endpoint);
   db.prepare("DELETE FROM subscriptions WHERE endpoint=?").run(row.endpoint);
  }
 }
}

async function dispatch(){
 const rows=db.prepare("SELECT * FROM reminders WHERE sent_at IS NULL").all();
 for(const row of rows){
  const now=DateTime.now().setZone(row.timezone);
  if(now.isValid&&now.toISODate()===row.alert_date&&now.hour>=9)await sendReminder(row);
 }
}
setInterval(()=>dispatch().catch(console.error),60000);
dispatch().catch(console.error);

app.listen(PORT,"0.0.0.0",()=>console.log(`DuoPilot Push listening on ${PORT}`));
