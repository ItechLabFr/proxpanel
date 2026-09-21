'use strict';

const http=require('http');
const https=require('https');

function request(baseUrl,reqPath,options={}){
  return new Promise((resolve,reject)=>{
    let base;try{base=new URL(String(baseUrl||''))}catch{return reject(new Error('URL PBS invalide.'))}
    if(!['http:','https:'].includes(base.protocol))return reject(new Error('URL PBS HTTP/HTTPS requise.'));
    const lib=base.protocol==='https:'?https:http;
    const body=options.body==null?null:(typeof options.body==='string'?options.body:JSON.stringify(options.body));
    const headers={Accept:'application/json',...(options.headers||{})};
    if(body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    if(body&&!headers['Content-Length'])headers['Content-Length']=Buffer.byteLength(body);
    const req=lib.request({protocol:base.protocol,hostname:base.hostname,port:base.port||(base.protocol==='https:'?443:80),path:reqPath,method:options.method||'GET',headers,rejectUnauthorized:options.rejectUnauthorized!==false,timeout:Math.max(1000,Number(options.timeoutMs||15000))},res=>{
      let size=0;const chunks=[];res.on('data',chunk=>{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size<=16*1024*1024)chunks.push(b)});
      res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8').trim();let data;try{data=JSON.parse(text||'{}')}catch{data=text}
        if(res.statusCode>=200&&res.statusCode<300)return resolve({status:res.statusCode,data,headers:res.headers});
        const message=typeof data==='object'?(data?.message||data?.error?.reason||data?.errors?.message||data?.error||`HTTP ${res.statusCode}`):(`HTTP ${res.statusCode} · ${String(data).slice(0,400)}`);reject(new Error(String(message)));
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Timeout PBS')));req.on('error',reject);if(body)req.write(body);req.end();
  });
}
function encodeForm(obj={}){return Object.entries(obj).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v??''))).join('&')}
function unwrap(value){return value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'data')?value.data:value}
function arrayData(value){const v=unwrap(value);return Array.isArray(v)?v:[]}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0}

async function authContext(item){
  if(item.authMode==='token'){
    if(!item.tokenId||!item.tokenSecret)throw new Error('Token PBS incomplet.');
    return {headers:{Authorization:`PBSAPIToken=${item.tokenId}:${item.tokenSecret}`}};
  }
  if(!item.username||!item.password)throw new Error('Identifiants PBS requis.');
  const r=await request(item.url,'/api2/json/access/ticket',{method:'POST',body:encodeForm({username:item.username,password:item.password}),headers:{'Content-Type':'application/x-www-form-urlencoded'},rejectUnauthorized:item.rejectUnauthorized!==false});
  const data=unwrap(r.data)||{},ticket=String(data.ticket||''),csrf=String(data.CSRFPreventionToken||data.csrfpreventiontoken||'');
  if(!ticket)throw new Error('Ticket PBS non reçu.');
  return {headers:{Cookie:`PBSAuthCookie=${encodeURIComponent(ticket)}`,...(csrf?{'CSRFPreventionToken':csrf}:{})}};
}
async function api(item,path,{method='GET',body=null,auth=null}={}){
  const ctx=auth||await authContext(item);
  const headers={...(ctx.headers||{})};
  if(body!=null)headers['Content-Type']='application/json';
  const r=await request(item.url,path,{method,body,headers,rejectUnauthorized:item.rejectUnauthorized!==false});
  return unwrap(r.data);
}
async function tryApi(item,paths,options={}){
  let last;for(const path of paths){try{return {path,data:await api(item,path,options)}}catch(e){last=e}}throw last||new Error('Endpoint PBS indisponible.');
}
function normalizeDatastore(row={}){
  const total=num(row.total||row.totalbytes||row.size),used=num(row.used||row.usedbytes),avail=num(row.avail||row.available||row.free||Math.max(0,total-used));
  return {store:String(row.store||row.name||row.datastore||''),total,used,avail,usagePct:total?Number((used/total*100).toFixed(2)):0,gcStatus:String(row['gc-status']||row.gc_status||row.status||''),comment:String(row.comment||'')};
}
function normalizeSnapshot(row={},store=''){
  const backupType=String(row['backup-type']||row.backup_type||row.type||''),backupId=String(row['backup-id']||row.backup_id||row.id||''),backupTime=num(row['backup-time']||row.backup_time||row.time);
  return {store,backupType,backupId,backupTime,snapshot:String(row.snapshot||row['backup-dir']||''),owner:String(row.owner||''),size:num(row.size||row['backup-size']),protected:!!(row.protected||row['protected']),verification:String(row.verification?.state||row.verification||row['verification-state']||''),files:Array.isArray(row.files)?row.files.length:num(row.files),comment:String(row.comment||'')};
}
function normalizeJob(row={},kind=''){return {kind,id:String(row.id||row.jobid||row.name||''),store:String(row.store||row.datastore||''),schedule:String(row.schedule||''),comment:String(row.comment||''),disable:!!row.disable,remote:String(row.remote||''),namespace:String(row.ns||row.namespace||''),lastRun:String(row['last-run-state']||row.last_run_state||row.status||''),raw:row}}
function normalizeTask(row={}){return {upid:String(row.upid||''),node:String(row.node||''),workerType:String(row.worker_type||row.type||''),workerId:String(row.worker_id||row.id||''),user:String(row.user||''),status:String(row.status||''),startTime:num(row.starttime||row.start_time),endTime:num(row.endtime||row.end_time),pid:num(row.pid)}}

async function collectPbs(item){
  const auth=await authContext(item),errors=[];let version={},datastores=[],snapshots=[],verifyJobs=[],pruneJobs=[],syncJobs=[],tasks=[],nodes=[];
  try{version=await api(item,'/api2/json/version',{auth})||{}}catch(e){errors.push({component:'version',message:e.message})}
  try{const out=await tryApi(item,['/api2/json/status/datastore-usage','/api2/json/admin/datastore'],{auth});datastores=arrayData(out.data).map(normalizeDatastore).filter(x=>x.store)}catch(e){errors.push({component:'datastores',message:e.message})}
  for(const ds of datastores.slice(0,24)){
    try{const st=await api(item,`/api2/json/admin/datastore/${encodeURIComponent(ds.store)}/status`,{auth});if(st&&typeof st==='object'){const n=normalizeDatastore({...ds,...st,store:ds.store});Object.assign(ds,n)}}catch{}
    try{const rows=await api(item,`/api2/json/admin/datastore/${encodeURIComponent(ds.store)}/snapshots?limit=500`,{auth});snapshots.push(...arrayData(rows).map(x=>normalizeSnapshot(x,ds.store)))}catch(e){errors.push({component:`snapshots:${ds.store}`,message:e.message})}
  }
  for(const [kind,path] of [['verify','/api2/json/config/verify'],['prune','/api2/json/config/prune'],['sync','/api2/json/config/sync']]){
    try{const rows=arrayData(await api(item,path,{auth})).map(x=>normalizeJob(x,kind));if(kind==='verify')verifyJobs=rows;else if(kind==='prune')pruneJobs=rows;else syncJobs=rows}catch(e){errors.push({component:`jobs:${kind}`,message:e.message})}
  }
  try{nodes=arrayData(await api(item,'/api2/json/nodes',{auth}))}catch{}
  const node=String(nodes[0]?.node||nodes[0]?.name||'localhost');
  try{tasks=arrayData(await api(item,`/api2/json/nodes/${encodeURIComponent(node)}/tasks?limit=150`,{auth})).map(normalizeTask)}catch(e){errors.push({component:'tasks',message:e.message})}
  const latestByGuest=new Map();for(const s of snapshots){const key=`${s.backupType}/${s.backupId}`;const prev=latestByGuest.get(key);if(!prev||s.backupTime>prev.backupTime)latestByGuest.set(key,s)}
  const activeTasks=tasks.filter(t=>!t.endTime&&!/^(OK|WARNINGS|ERROR)$/i.test(t.status)).length,failedTasks=tasks.filter(t=>/ERROR|FAILED/i.test(t.status)).length;
  return {configured:true,status:errors.length?(datastores.length||snapshots.length?'degraded':'offline'):'online',generatedAt:new Date().toISOString(),version:{version:String(version.version||version.release||''),repoId:String(version['repoid']||version.repoid||'')},datastores,snapshots:snapshots.sort((a,b)=>b.backupTime-a.backupTime),latestByGuest:[...latestByGuest.entries()].map(([guest,snapshot])=>({guest,...snapshot})).sort((a,b)=>b.backupTime-a.backupTime),jobs:{verify:verifyJobs,prune:pruneJobs,sync:syncJobs},tasks,summary:{datastores:datastores.length,total:datastores.reduce((n,x)=>n+x.total,0),used:datastores.reduce((n,x)=>n+x.used,0),snapshots:snapshots.length,guests:latestByGuest.size,verifyJobs:verifyJobs.length,pruneJobs:pruneJobs.length,syncJobs:syncJobs.length,activeTasks,failedTasks},errors};
}
async function testPbsConnection(item){
  const auth=await authContext(item);const version=await api(item,'/api2/json/version',{auth});let stores=[];try{stores=arrayData(await tryApi(item,['/api2/json/status/datastore-usage','/api2/json/admin/datastore'],{auth}).then(x=>x.data))}catch{}
  return {ok:true,version:String(version?.version||version?.release||''),datastores:stores.length,detail:`PBS ${String(version?.version||version?.release||'joignable')} · ${stores.length} datastore(s)`};
}
async function runPbsAction(item,{kind,id='',store=''}={}){
  const auth=await authContext(item);kind=String(kind||'');id=String(id||'');store=String(store||'');
  const candidates=kind==='gc'&&store?[`/api2/json/admin/datastore/${encodeURIComponent(store)}/gc`]:
    ['verify','prune','sync'].includes(kind)&&id?[`/api2/json/admin/${kind}/${encodeURIComponent(id)}/run`,`/api2/json/admin/${kind}/${encodeURIComponent(id)}`]:[];
  if(!candidates.length)throw new Error('Action PBS invalide.');
  let last;for(const path of candidates){try{const result=await api(item,path,{method:'POST',body:{},auth});return {ok:true,kind,id,store,upid:String(result||''),path}}catch(e){last=e}}throw last||new Error('Action PBS impossible.');
}
function demoPbsOverview(){
  const now=Math.floor(Date.now()/1000),snap=(store,type,id,hours,verification='ok')=>({store,backupType:type,backupId:id,backupTime:now-hours*3600,snapshot:`${type}/${id}/${new Date((now-hours*3600)*1000).toISOString()}`,owner:'root@pam',size:type==='vm'?58*1024**3:12*1024**3,protected:false,verification});
  const snapshots=[snap('BKP-NAS','vm','100',3),snap('BKP-NAS','vm','205',5),snap('BKP-NAS','ct','220',7),snap('BKP-NAS','vm','100',27),snap('BKP-OFFSITE','vm','400',31,'unknown')];
  const latestMap=new Map();for(const s of snapshots){const key=`${s.backupType}/${s.backupId}`;if(!latestMap.has(key))latestMap.set(key,s)}
  return {configured:true,status:'online',generatedAt:new Date().toISOString(),version:{version:'3.4-demo',repoId:'demo'},datastores:[{store:'BKP-NAS',total:4*1024**4,used:2.46*1024**4,avail:1.54*1024**4,usagePct:61.5,gcStatus:'OK'},{store:'BKP-OFFSITE',total:2*1024**4,used:.91*1024**4,avail:1.09*1024**4,usagePct:45.5,gcStatus:'OK'}],snapshots,latestByGuest:[...latestMap.entries()].map(([guest,snapshot])=>({guest,...snapshot})),jobs:{verify:[{kind:'verify',id:'daily-verify',store:'BKP-NAS',schedule:'daily',disable:false}],prune:[{kind:'prune',id:'daily-prune',store:'BKP-NAS',schedule:'daily',disable:false}],sync:[{kind:'sync',id:'offsite-sync',store:'BKP-NAS',schedule:'hourly',remote:'PBS-OFFSITE',disable:false}]},tasks:[{upid:'UPID:demo:verify',node:'localhost',workerType:'verify',workerId:'BKP-NAS',user:'root@pam',status:'OK',startTime:now-3600,endTime:now-3300}],summary:{datastores:2,total:6*1024**4,used:3.37*1024**4,snapshots:snapshots.length,guests:latestMap.size,verifyJobs:1,pruneJobs:1,syncJobs:1,activeTasks:0,failedTasks:0},errors:[]};
}

module.exports={collectPbs,testPbsConnection,runPbsAction,demoPbsOverview,normalizeDatastore,normalizeSnapshot,normalizeJob,normalizeTask};
