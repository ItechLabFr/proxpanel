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

module.exports={backupAlertDecision,summarizeDockerContainers,classifyPortainerEnvironment};
