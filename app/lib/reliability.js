'use strict';

function backupAlertDecision({ctime=0,maxAgeHours=36,absenceReliable=false,nowSec=Date.now()/1000}={}) {
  const maxAge=Math.max(1,Number(maxAgeHours||36));
  const ts=Number(ctime||0);
  if(!ts)return absenceReliable?{kind:'absent',ageHours:null,maxAgeHours:maxAge}:{kind:'unknown',ageHours:null,maxAgeHours:maxAge};
  const ageHours=Math.max(0,(Number(nowSec)-ts)/3600);
  if(ageHours>maxAge)return {kind:'stale',ageHours,maxAgeHours:maxAge};
  return {kind:'ok',ageHours,maxAgeHours:maxAge};
}

function summarizeDockerContainers(containers=[]) {
  const rows=Array.isArray(containers)?containers:[];
  let running=0,stopped=0,unhealthy=0,healthy=0,restarting=0,paused=0;
  for(const c of rows){
    const state=String(c?.State||c?.state||'').toLowerCase();
    const status=String(c?.Status||c?.status||'').toLowerCase();
    if(state==='running')running++;
    else stopped++;
    if(state==='restarting'||status.includes('restart'))restarting++;
    if(state==='paused'||status.includes('paused'))paused++;
    if(status.includes('(unhealthy)')||String(c?.Health||c?.health||'').toLowerCase()==='unhealthy')unhealthy++;
    if(status.includes('(healthy)')||String(c?.Health||c?.health||'').toLowerCase()==='healthy')healthy++;
  }
  return {total:rows.length,running,stopped,healthy,unhealthy,restarting,paused};
}

function classifyPortainerEnvironment(dockerInfo=null) {
  if(!dockerInfo||typeof dockerInfo!=='object')return {kind:'unavailable',supported:false,label:'Indisponible'};
  const swarmState=String(dockerInfo?.Swarm?.LocalNodeState||'inactive').toLowerCase();
  if(swarmState&&swarmState!=='inactive'&&swarmState!=='locked'&&swarmState!=='error'){
    return {kind:'swarm',supported:false,label:'Docker Swarm'};
  }
  return {kind:'docker-standalone',supported:true,label:'Docker Standalone'};
}

function firstContainerName(row={}) {
  const raw=Array.isArray(row.Names)?row.Names[0]:row.Name||row.name||'';
  return String(raw||'').replace(/^\//,'');
}

function containerHealth(row={}) {
  const health=String(row?.State?.Health?.Status||row?.Health||'').toLowerCase();
  const status=String(row?.Status||row?.status||'').toLowerCase();
  if(health)return health;
  if(status.includes('(unhealthy)'))return 'unhealthy';
  if(status.includes('(healthy)'))return 'healthy';
  return '';
}

function dockerStackNameFromLabels(labels={}) {
  const l=labels&&typeof labels==='object'?labels:{};
  return String(l['com.docker.compose.project']||l['io.portainer.stack.name']||'');
}

function normalizeDockerPorts(ports=[]) {
  return (Array.isArray(ports)?ports:[]).slice(0,24).map(p=>({
    ip:String(p?.IP||''),
    privatePort:Number(p?.PrivatePort||0),
    publicPort:Number(p?.PublicPort||0),
    type:String(p?.Type||'tcp')
  }));
}

function normalizeDockerNetworks(networkSettings={}) {
  const networks=networkSettings?.Networks&&typeof networkSettings.Networks==='object'?networkSettings.Networks:{};
  return Object.entries(networks).slice(0,24).map(([name,v])=>({
    name:String(name),ip:String(v?.IPAddress||''),gateway:String(v?.Gateway||''),mac:String(v?.MacAddress||'')
  }));
}

function normalizeDockerContainer(row={}) {
  const labels=row.Labels&&typeof row.Labels==='object'?row.Labels:{};
  return {
    id:String(row.Id||row.ID||row.id||''),
    name:firstContainerName(row),
    image:String(row.Image||row.image||''),
    imageId:String(row.ImageID||row.ImageId||''),
    command:String(row.Command||''),
    created:Number(row.Created||0),
    state:String(row.State||row.state||'unknown').toLowerCase(),
    status:String(row.Status||row.status||''),
    health:containerHealth(row),
    stack:dockerStackNameFromLabels(labels),
    labels,
    ports:normalizeDockerPorts(row.Ports),
    networks:normalizeDockerNetworks(row.NetworkSettings)
  };
}

function normalizePortainerStack(row={}) {
  const envNames=(Array.isArray(row.Env)?row.Env:[]).map(e=>String(e?.name||e?.Name||'')).filter(Boolean);
  return {
    id:Number(row.Id||row.id||0),
    name:String(row.Name||row.name||''),
    endpointId:Number(row.EndpointId||row.EndpointID||0),
    status:Number(row.Status||0),
    active:Number(row.Status||0)===1,
    createdBy:String(row.CreatedBy||''),
    creationDate:Number(row.CreationDate||0),
    entryPoint:String(row.EntryPoint||''),
    envNames:[...new Set(envNames)].slice(0,100),
    git:!!row.GitConfig,
    autoUpdate:!!row.AutoUpdate,
    additionalFiles:Array.isArray(row.AdditionalFiles)?row.AdditionalFiles.map(String).slice(0,20):[]
  };
}

function redactDockerInspect(value,depth=0) {
  if(depth>12)return '[max depth]';
  if(Array.isArray(value))return value.slice(0,200).map(v=>redactDockerInspect(v,depth+1));
  if(!value||typeof value!=='object')return value;
  const out={};
  const secret=/pass(word)?|secret|token|api[_-]?key|private[_-]?key|authorization|credential/i;
  for(const [key,v] of Object.entries(value)){
    if(secret.test(key)){out[key]='[redacted]';continue;}
    if(key==='Env'&&Array.isArray(v)){
      out[key]=v.slice(0,200).map(item=>{
        const s=String(item||''),eq=s.indexOf('=');
        return eq>0?`${s.slice(0,eq)}=[redacted]`:s;
      });
      continue;
    }
    out[key]=redactDockerInspect(v,depth+1);
  }
  return out;
}

module.exports={
  backupAlertDecision,summarizeDockerContainers,classifyPortainerEnvironment,
  normalizeDockerContainer,normalizePortainerStack,redactDockerInspect,normalizeDockerPorts,normalizeDockerNetworks
};
