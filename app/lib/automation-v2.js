'use strict';

const MACHINE_ACTIONS=new Set(['start','stop','shutdown','reboot','suspend','resume','reset','hibernate']);
const DOCKER_CONTAINER_ACTIONS=new Set(['start','stop','restart','pause','resume']);
const DOCKER_STACK_ACTIONS=new Set(['start','stop','redeploy']);
const BACKUP_MODES=new Set(['snapshot','suspend','stop']);

function clampNumber(value,min,max,fallback){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function cleanId(value,fallback=''){
  const v=String(value||'').trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(v)?v:fallback;
}
function normalizeTarget(row={}){
  if(row.target&&typeof row.target==='object'){
    const t=row.target;
    const kind=String(t.kind||'').toLowerCase();
    if(kind==='machine')return {kind,vmid:Number(t.vmid||0)};
    if(kind==='tag')return {kind,tag:String(t.tag||'').trim().slice(0,80)};
    if(kind==='group')return {kind,groupId:String(t.groupId||'').trim().slice(0,120),groupName:String(t.groupName||'').trim().slice(0,120)};
  }
  if(Number(row.vmid)>0)return {kind:'machine',vmid:Number(row.vmid)};
  if(row.tag)return {kind:'tag',tag:String(row.tag).trim().slice(0,80)};
  if(row.groupId||row.group)return {kind:'group',groupId:String(row.groupId||'').trim().slice(0,120),groupName:String(row.group||'').trim().slice(0,120)};
  return {kind:'machine',vmid:0};
}
function normalizeRetry(row={}){
  const retry=row.retry&&typeof row.retry==='object'?row.retry:{};
  return {
    attempts:Math.round(clampNumber(retry.attempts??row.retries,1,5,1)),
    delaySeconds:Math.round(clampNumber(retry.delaySeconds??row.retryDelaySeconds,0,300,5))
  };
}
function normalizeCondition(condition={}){
  const kind=String(condition.kind||'machine-state').toLowerCase();
  if(kind==='machine-state')return {kind,target:normalizeTarget(condition),state:String(condition.state||'running').toLowerCase()};
  if(kind==='node-state')return {kind,node:String(condition.node||'').trim(),state:String(condition.state||'online').toLowerCase()};
  if(kind==='step-status')return {kind,stepId:cleanId(condition.stepId),status:String(condition.status||'ok').toLowerCase()};
  if(kind==='always')return {kind};
  return {kind:'machine-state',target:normalizeTarget(condition),state:String(condition.state||'running').toLowerCase()};
}
function normalizeAutomationStep(row={},index=0){
  const type=String(row.type||'').toLowerCase();
  const base={
    id:cleanId(row.id,`step-${index+1}`),
    type,
    label:String(row.label||'').trim().slice(0,160),
    timeoutMinutes:clampNumber(row.timeoutMinutes,0.1,240,10),
    retry:normalizeRetry(row),
    dependsOn:[...new Set((Array.isArray(row.dependsOn)?row.dependsOn:[]).map(x=>cleanId(x)).filter(Boolean))]
  };
  if(type==='wait')return {...base,seconds:clampNumber(row.seconds,0,3600,0)};
  if(type==='machine-action')return {...base,target:normalizeTarget(row),action:String(row.action||'').toLowerCase()};
  if(type==='wait-until')return {...base,target:normalizeTarget(row),state:String(row.state||'stopped').toLowerCase(),pollSeconds:clampNumber(row.pollSeconds,2,60,5)};
  if(type==='backup')return {...base,target:normalizeTarget(row),storage:String(row.storage||'').trim().slice(0,120),mode:BACKUP_MODES.has(String(row.mode||'snapshot'))?String(row.mode||'snapshot'):'snapshot',compress:String(row.compress||'zstd').trim().slice(0,20)};
  if(type==='docker-action')return {...base,scope:String(row.scope||'container').toLowerCase(),portainerId:String(row.portainerId||'').trim(),endpointId:Number(row.endpointId||0),targetId:String(row.targetId||row.containerId||row.stackId||'').trim(),action:String(row.action||'').toLowerCase()};
  if(type==='condition')return {...base,condition:normalizeCondition(row.condition||{}),then:normalizeAutomationSteps(row.then||[],`${base.id}-then`),else:normalizeAutomationSteps(row.else||[],`${base.id}-else`)};
  return {...base};
}
function normalizeAutomationSteps(steps=[],prefix='step'){
  return (Array.isArray(steps)?steps:[]).slice(0,100).map((row,index)=>{
    const normalized=normalizeAutomationStep(row,index);
    if(!row?.id)normalized.id=`${prefix}-${index+1}`;
    return normalized;
  });
}
function validationError(message,path){return {ok:false,error:message,path};}
function validateTarget(target,path){
  if(target?.kind==='machine'&&Number(target.vmid)>0)return null;
  if(target?.kind==='tag'&&target.tag)return null;
  if(target?.kind==='group'&&(target.groupId||target.groupName))return null;
  return validationError('Cible machine/tag/groupe invalide.',path);
}
function validateAutomationSteps(steps=[],path='steps',knownIds=new Set()){
  for(let i=0;i<steps.length;i++){
    const step=steps[i],p=`${path}[${i}]`;
    if(!step.id)return validationError('Identifiant d’étape requis.',p);
    if(knownIds.has(step.id))return validationError(`Identifiant d’étape dupliqué : ${step.id}`,p);
    knownIds.add(step.id);
    for(const dep of step.dependsOn||[])if(!knownIds.has(dep))return validationError(`Dépendance inconnue ou située après l’étape : ${dep}`,p);
    if(step.type==='wait')continue;
    if(step.type==='machine-action'){
      const e=validateTarget(step.target,`${p}.target`);if(e)return e;
      if(!MACHINE_ACTIONS.has(step.action))return validationError(`Action machine invalide : ${step.action}`,p);
      continue;
    }
    if(step.type==='wait-until'){
      const e=validateTarget(step.target,`${p}.target`);if(e)return e;
      if(!['running','stopped','paused','online','offline'].includes(step.state))return validationError(`État d’attente invalide : ${step.state}`,p);
      continue;
    }
    if(step.type==='backup'){
      const e=validateTarget(step.target,`${p}.target`);if(e)return e;
      continue;
    }
    if(step.type==='docker-action'){
      if(step.scope==='container'&&!DOCKER_CONTAINER_ACTIONS.has(step.action))return validationError('Action conteneur Docker invalide.',p);
      if(step.scope==='stack'&&!DOCKER_STACK_ACTIONS.has(step.action))return validationError('Action stack Docker invalide.',p);
      if(!['container','stack'].includes(step.scope)||!step.portainerId||!Number.isInteger(step.endpointId)||step.endpointId<=0||!step.targetId)return validationError('Cible Docker incomplète.',p);
      continue;
    }
    if(step.type==='condition'){
      const thenResult=validateAutomationSteps(step.then||[],`${p}.then`,knownIds);if(!thenResult.ok)return thenResult;
      const elseResult=validateAutomationSteps(step.else||[],`${p}.else`,knownIds);if(!elseResult.ok)return elseResult;
      continue;
    }
    return validationError(`Type d’étape non pris en charge : ${step.type||'(vide)'}`,p);
  }
  return {ok:true};
}
function normalizeAutomationScenario(body={}){
  const scheduleTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.scheduleTime||''))?String(body.scheduleTime):'';
  return {
    id:cleanId(body.id)||'',
    name:String(body.name||'').trim().slice(0,120),
    description:String(body.description||'').trim().slice(0,500),
    serverId:String(body.serverId||'').trim(),
    scheduleTime,
    scheduleDays:[...new Set((Array.isArray(body.scheduleDays)?body.scheduleDays:[]).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))],
    enabled:body.enabled!==false,
    steps:normalizeAutomationSteps(body.steps||[])
  };
}
function targetLabel(target={}){
  if(target.kind==='machine')return `VM/LXC ${target.vmid}`;
  if(target.kind==='tag')return `tag ${target.tag}`;
  if(target.kind==='group')return `groupe ${target.groupName||target.groupId}`;
  return 'cible';
}
function summarizeAutomationStep(step={}){
  if(step.type==='wait')return `Attendre ${step.seconds}s`;
  if(step.type==='machine-action')return `${step.action} · ${targetLabel(step.target)}`;
  if(step.type==='wait-until')return `Attendre ${step.state} · ${targetLabel(step.target)}`;
  if(step.type==='backup')return `Backup ${targetLabel(step.target)}${step.storage?` → ${step.storage}`:''}`;
  if(step.type==='docker-action')return `Docker ${step.scope} ${step.targetId} · ${step.action}`;
  if(step.type==='condition')return `Condition ${step.condition?.kind||''}`;
  return step.type||'Étape';
}
function automationTemplates(){
  return [
    {id:'safe-start',name:'Démarrage ordonné',description:'Démarre deux machines avec attente d’état entre les étapes.',steps:[
      {id:'start-app',type:'machine-action',vmid:100,action:'start',retry:{attempts:2,delaySeconds:5}},
      {id:'wait-app',type:'wait-until',vmid:100,state:'running',timeoutMinutes:5,dependsOn:['start-app']},
      {id:'start-service',type:'machine-action',vmid:101,action:'start',dependsOn:['wait-app']}
    ]},
    {id:'lab-maintenance',name:'Maintenance du lab',description:'Arrête les machines taggées test, attend leur arrêt puis lance un backup.',steps:[
      {id:'stop-test',type:'machine-action',tag:'test',action:'shutdown',retry:{attempts:2,delaySeconds:10}},
      {id:'wait-test',type:'wait-until',tag:'test',state:'stopped',timeoutMinutes:15,dependsOn:['stop-test']},
      {id:'backup-test',type:'backup',tag:'test',mode:'snapshot',dependsOn:['wait-test']}
    ]},
    {id:'docker-secondary',name:'Arrêt stack Docker secondaire',description:'Arrête une stack Portainer après une courte temporisation.',steps:[
      {id:'grace',type:'wait',seconds:10},
      {id:'docker-stop',type:'docker-action',scope:'stack',portainerId:'PORTAINER_ID',endpointId:1,targetId:'STACK_ID',action:'stop',dependsOn:['grace']}
    ]}
  ].map(t=>({...t,steps:normalizeAutomationSteps(t.steps)}));
}
module.exports={
  MACHINE_ACTIONS,DOCKER_CONTAINER_ACTIONS,DOCKER_STACK_ACTIONS,
  normalizeTarget,normalizeRetry,normalizeCondition,normalizeAutomationStep,normalizeAutomationSteps,
  normalizeAutomationScenario,validateAutomationSteps,summarizeAutomationStep,targetLabel,automationTemplates
};
