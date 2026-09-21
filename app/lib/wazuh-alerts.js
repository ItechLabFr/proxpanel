'use strict';

function objectMap(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function keepObjectEntries(obj,max=2000){return Object.fromEntries(Object.entries(obj||{}).slice(-max))}
function vulnKey(v={}){return String(v.key||`${v.agentId||v.agentName||'agent'}|${v.id||'cve'}|${v.packageName||'package'}|${v.packageVersion||''}`)}
function alertKey(a={}){return String(a.key||`${a.timestamp||''}|${a.ruleId||''}|${a.agentId||a.agentName||''}`)}
function vulnerabilitySnapshot(v={}){return {
  key:vulnKey(v),id:String(v.id||''),severity:String(v.severity||''),score:Number.isFinite(Number(v.score))?Number(v.score):null,
  agentId:String(v.agentId||''),agentName:String(v.agentName||''),agentIp:String(v.agentIp||''),os:String(v.os||''),
  packageName:String(v.packageName||''),packageVersion:String(v.packageVersion||''),fixedVersion:String(v.fixedVersion||''),
  detectedAt:String(v.detectedAt||''),updatedAt:String(v.updatedAt||''),mapping:v.mapping||null
}}
function commonVulnerabilityDetails(v){
  return [
    v.id?`CVE: ${v.id}`:'',v.score!=null?`CVSS: ${v.score}`:'',v.agentName?`Machine: ${v.agentName}`:'',
    v.agentId?`Agent Wazuh: ${v.agentId}`:'',v.agentIp?`IP: ${v.agentIp}`:'',v.os?`OS: ${v.os}`:'',
    v.packageName?`Paquet / logiciel: ${v.packageName}`:'',v.packageVersion?`Version installée: ${v.packageVersion}`:'',
    v.fixedVersion?`Version corrigée: ${v.fixedVersion}`:'',v.mapping?.name?`VM/LXC Proxmox: ${v.mapping.name}${v.mapping.vmid?` · VMID ${v.mapping.vmid}`:''}`:'',
    v.mapping?.node?`Nœud Proxmox: ${v.mapping.node}`:''
  ].filter(Boolean);
}
function vulnerabilityTechnical(v){return [
  v.id?{label:'CVE',value:v.id}:null,v.score!=null?{label:'CVSS',value:String(v.score)}:null,
  v.packageName?{label:'Paquet / logiciel',value:v.packageName}:null,
  v.packageVersion?{label:'Version installée',value:v.packageVersion}:null,
  v.fixedVersion?{label:'Version corrigée',value:v.fixedVersion}:null,
  v.agentId?{label:'Agent Wazuh',value:v.agentId}:null
].filter(Boolean)}
function evaluateWazuhTransitions(previous={},overview={},config={}){
  const prev=previous&&typeof previous==='object'?previous:{};
  const now=new Date().toISOString(),events=[];
  const online=overview.status==='online';
  const failureCount=online?0:Number(prev.failureCount||0)+1;
  let outageNotified=!!prev.outageNotified;

  if(!online&&failureCount>=2&&!outageNotified){
    const degraded=overview.status==='degraded';
    events.push({
      type:'wazuh.integration.unreachable',severity:degraded?'warning':'critical',
      title:degraded?'Wazuh partiellement indisponible':'Wazuh indisponible',
      message:degraded?'Une partie des sources Wazuh ne répond plus. Les données affichées peuvent être incomplètes.':'ProxPanel ne parvient plus à collecter les données Wazuh après deux contrôles consécutifs.',
      target:config.name||'Wazuh',source:'Wazuh Server / Indexer API',
      details:(overview.errors||[]).map(e=>`${e.component}: ${e.message}`),
      technicalDetails:(overview.errors||[]).map(e=>({label:String(e.component||'Wazuh'),value:String(e.message||'Erreur')})),
      recommendation:'Vérifie le Wazuh Manager, l’Indexer, les certificats TLS, les identifiants et la connectivité depuis ProxPanel.'
    });
    outageNotified=true;
  }
  if(online&&outageNotified){
    events.push({type:'wazuh.integration.recovered',severity:'info',title:'Wazuh de nouveau opérationnel',message:'Le Wazuh Manager et l’Indexer répondent de nouveau correctement.',target:config.name||'Wazuh',source:'Wazuh Server / Indexer API',recommendation:'Aucune action requise si les collectes suivantes restent stables.'});
    outageNotified=false;
  }

  const prevAgents=objectMap(prev.agents),agentConfirmations={...objectMap(prev.agentConfirmations)},agentNotified={...objectMap(prev.agentNotified)},nextAgents={};
  for(const agent of overview.agents||[]){
    const id=String(agent.id||agent.name||'');if(!id)continue;const status=String(agent.status||'unknown');nextAgents[id]={id,name:String(agent.name||''),status,ip:String(agent.ip||''),lastKeepAlive:String(agent.lastKeepAlive||'')};
    const disconnected=status!=='active';
    if(disconnected){agentConfirmations[id]=Number(agentConfirmations[id]||0)+1;}else{agentConfirmations[id]=0;}
    if(disconnected&&agentConfirmations[id]>=2&&!agentNotified[id]&&config.notifyAgentOffline!==false&&prev.baseline){
      events.push({type:'wazuh.agent.disconnected',severity:'warning',title:'Agent Wazuh déconnecté',message:`${agent.name||id} ne communique plus avec Wazuh après deux contrôles consécutifs.`,target:agent.name||id,source:'Wazuh Server API',details:[`Agent ID: ${id}`,agent.ip?`IP: ${agent.ip}`:'',agent.lastKeepAlive?`Dernier contact: ${agent.lastKeepAlive}`:''].filter(Boolean),technicalDetails:[{label:'Agent Wazuh',value:id},{label:'État',value:status}],recommendation:'Vérifie le service Wazuh Agent, le réseau et la connectivité vers le Manager.'});
      agentNotified[id]=true;
    }
    if(!disconnected&&agentNotified[id]){
      events.push({type:'wazuh.agent.recovered',severity:'info',title:'Agent Wazuh reconnecté',message:`${agent.name||id} communique de nouveau avec Wazuh.`,target:agent.name||id,source:'Wazuh Server API',details:[`Agent ID: ${id}`,agent.ip?`IP: ${agent.ip}`:''].filter(Boolean),recommendation:'Aucune action requise si l’agent reste stable.'});
      delete agentNotified[id];
    }
  }

  const currentVulnerabilities={},prevVulnerabilities=objectMap(prev.vulnerabilities),newVulnerabilityKeys=[];
  for(const vRaw of overview.vulnerabilities||[]){
    const v=vulnerabilitySnapshot(vRaw);if(!v.key||!['critical','high'].includes(v.severity))continue;currentVulnerabilities[v.key]=v;
    if(prev.baseline&&!prevVulnerabilities[v.key])newVulnerabilityKeys.push(v.key);
    if(prev.baseline&&!prevVulnerabilities[v.key]&&(v.severity==='critical'||config.notifyHigh===true)){
      events.push({
        type:v.severity==='critical'?'wazuh.vulnerability.critical':'wazuh.vulnerability.high',
        severity:v.severity==='critical'?'critical':'warning',title:`Nouvelle vulnérabilité ${v.severity==='critical'?'critique':'élevée'} · ${v.id||'CVE'}`,
        message:`${v.agentName||'Endpoint'} est concerné${v.packageName?` via ${v.packageName}`:''}${v.packageVersion?` ${v.packageVersion}`:''}.`,
        target:v.agentName||v.agentId||v.id,source:'Wazuh Vulnerability Detection / Indexer',
        details:commonVulnerabilityDetails(v),technicalDetails:vulnerabilityTechnical(v),
        recommendation:v.fixedVersion?`Planifie la mise à niveau vers la version corrigée ${v.fixedVersion} après validation.`:'Consulte Wazuh et les bulletins éditeur pour confirmer le correctif disponible avant intervention.'
      });
    }
  }
  if(prev.baseline){
    for(const [key,v] of Object.entries(prevVulnerabilities)){
      if(v.severity!=='critical'||currentVulnerabilities[key])continue;
      events.push({type:'wazuh.vulnerability.solved',severity:'info',title:`Vulnérabilité critique résolue · ${v.id||'CVE'}`,message:`${v.agentName||'Endpoint'} ne présente plus cette vulnérabilité active dans la dernière collecte Wazuh.`,target:v.agentName||v.agentId||v.id,source:'Wazuh Vulnerability Detection / Indexer',details:commonVulnerabilityDetails(v),technicalDetails:vulnerabilityTechnical(v),recommendation:'Confirme la stabilité lors des prochaines collectes et conserve la trace du correctif appliqué.'});
    }
  }

  const prevAlertKeys=new Set(Array.isArray(prev.alertKeys)?prev.alertKeys.map(String):[]),nextAlertKeys=[];
  for(const alert of overview.alerts||[]){
    const key=alertKey(alert);if(!key)continue;nextAlertKeys.push(key);
    if(prev.baseline&&!prevAlertKeys.has(key)){
      events.push({type:'wazuh.alert.important',severity:Number(alert.level||0)>=15?'critical':'warning',title:`Alerte Wazuh niveau ${Number(alert.level||0)}`,message:String(alert.description||'Événement de sécurité important détecté.'),target:alert.agentName||alert.agentId||'Endpoint',source:'Wazuh Alerts / Indexer',details:[`Règle: ${alert.ruleId||'—'}`,`Niveau: ${Number(alert.level||0)}`,alert.agentName?`Machine: ${alert.agentName}`:'',alert.agentId?`Agent: ${alert.agentId}`:'',alert.timestamp?`Date: ${alert.timestamp}`:'',alert.mitreTactics?.length?`MITRE tactique: ${alert.mitreTactics.join(', ')}`:'',alert.mitreTechniques?.length?`MITRE technique: ${alert.mitreTechniques.join(', ')}`:'',alert.mapping?.name?`VM/LXC Proxmox: ${alert.mapping.name}${alert.mapping.vmid?` · VMID ${alert.mapping.vmid}`:''}`:''].filter(Boolean),technicalDetails:[{label:'Rule ID',value:String(alert.ruleId||'')},{label:'Rule level',value:String(alert.level||0)},...(alert.mitreIds?.length?[{label:'MITRE',value:alert.mitreIds.join(', ')}]:[])],recommendation:'Ouvre Wazuh pour l’investigation détaillée et vérifie la machine concernée avant toute action.'});
    }
  }

  const prevFimKeys=new Set(Array.isArray(prev.fimKeys)?prev.fimKeys.map(String):[]),nextFimKeys=[];
  const sensitivePath=/^(?:\/etc\/(?:ssh|sudoers(?:\.d)?|pam\.d|systemd|security|passwd|shadow|group)|[A-Za-z]:\\Windows\\System32\\|[A-Za-z]:\\ProgramData\\)/i;
  for(const fim of overview.fim||[]){
    const key=String(fim.key||'');if(!key)continue;nextFimKeys.push(key);
    if(prev.baseline&&config.notifyFim===true&&!prevFimKeys.has(key)&&sensitivePath.test(String(fim.path||''))){
      events.push({type:'wazuh.fim.sensitive',severity:Number(fim.level||0)>=12?'critical':'warning',title:'Modification sensible détectée par Wazuh',message:`${fim.agentName||fim.agentId||'Endpoint'} · ${fim.event||'modification'} · ${fim.path||'chemin non renseigné'}.`,target:fim.agentName||fim.agentId||'Endpoint',source:'Wazuh FIM / Indexer',details:[fim.path?`Chemin: ${fim.path}`:'',fim.event?`Action: ${fim.event}`:'',fim.ruleId?`Règle: ${fim.ruleId}`:'',`Niveau: ${Number(fim.level||0)}`,fim.timestamp?`Date: ${fim.timestamp}`:''].filter(Boolean),technicalDetails:[fim.sha256Before?{label:'SHA-256 avant',value:fim.sha256Before}:null,fim.sha256After?{label:'SHA-256 après',value:fim.sha256After}:null].filter(Boolean),recommendation:'Vérifie si cette modification était attendue puis ouvre Wazuh pour consulter le détail FIM complet.'});
    }
  }

  const currentCritical=Number(overview.summary?.critical||0),previousCritical=Number(prev.criticalCount||0);
  if(prev.baseline&&previousCritical>=0&&currentCritical>=previousCritical+5){
    events.push({type:'wazuh.vulnerability.spike',severity:'critical',title:'Hausse soudaine des vulnérabilités critiques',message:`Le nombre de vulnérabilités critiques actives est passé de ${previousCritical} à ${currentCritical}.`,target:config.name||'Wazuh',source:'ProxPanel Wazuh Security',details:[`Avant: ${previousCritical}`,`Maintenant: ${currentCritical}`,`Machines concernées: ${Number(overview.summary?.affectedEndpoints||0)}`],recommendation:'Priorise les nouvelles CVE critiques et vérifie si une mise à jour récente de l’inventaire ou des flux de vulnérabilités explique cette hausse.'});
  }

  return {
    events,
    state:{baseline:true,checkedAt:now,failureCount,outageNotified,agents:keepObjectEntries(nextAgents,1000),agentConfirmations:keepObjectEntries(agentConfirmations,1000),agentNotified:keepObjectEntries(agentNotified,1000),vulnerabilities:keepObjectEntries(currentVulnerabilities,4000),newVulnerabilityKeys:newVulnerabilityKeys.slice(0,1000),alertKeys:[...new Set(nextAlertKeys)].slice(0,1500),fimKeys:[...new Set(nextFimKeys)].slice(0,1500),criticalCount:currentCritical}
  };
}

module.exports={evaluateWazuhTransitions,vulnKey};
