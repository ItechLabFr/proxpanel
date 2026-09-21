'use strict';

function pathValue(obj, path) {
  return String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], obj);
}
function firstValue(obj, paths, fallback='') {
  for (const path of paths || []) {
    const value = pathValue(obj, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
}
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}
function normalizedSeverity(value='') {
  const raw=String(value||'').trim().toLowerCase();
  if (raw.includes('critical')) return 'critical';
  if (raw.includes('high')) return 'high';
  if (raw.includes('medium')) return 'medium';
  if (raw.includes('low')) return 'low';
  return raw || 'unknown';
}
function activeVulnerabilityStatus(value='') {
  const status=String(value||'').trim().toLowerCase();
  return !['solved','resolved','fixed','remediated','closed'].includes(status);
}
function normalizeAgent(row={}) {
  const os=row.os||{};
  return {
    id:String(row.id||''),
    name:String(row.name||row.hostname||''),
    ip:String(row.ip||''),
    status:String(row.status||'unknown').toLowerCase(),
    lastKeepAlive:String(row.lastKeepAlive||row.last_keepalive||''),
    version:String(row.version||''),
    os:String(os.name||os.full||row.os_name||''),
    osVersion:String(os.version||row.os_version||'')
  };
}
function normalizeVulnerabilityHit(hit={}) {
  const src=hit._source||hit;
  const vulnerability=src.vulnerability||{};
  const pkg=src.package||vulnerability.package||{};
  const agent=src.agent||{};
  const host=src.host||{};
  const score=firstValue(src,[
    'vulnerability.score.base',
    'vulnerability.cvss.cvss3.base_score',
    'vulnerability.cvss.cvss2.base_score',
    'cvss.score'
  ],null);
  const fixedVersion=firstValue(src,[
    'package.fixed_version',
    'package.fixedVersion',
    'vulnerability.package.fixed_version',
    'vulnerability.package.fixedVersion',
    'vulnerability.remediation.fixed_version',
    'remediation.fixed_version'
  ],'');
  return {
    key:String(hit._id||`${agent.id||agent.name||'agent'}:${vulnerability.id||src.id||'unknown'}:${pkg.name||'package'}:${pkg.version||''}`),
    id:String(vulnerability.id||src.id||''),
    severity:normalizedSeverity(vulnerability.severity||src.severity),
    score:Number.isFinite(Number(score))?Number(score):null,
    vector:String(firstValue(src,['vulnerability.score.version','vulnerability.cvss.cvss3.vector_string','vulnerability.cvss.cvss2.vector_string'],'')||''),
    status:String(vulnerability.status||src.status||'Active'),
    description:String(vulnerability.description||src.description||''),
    reference:String(firstValue(src,['vulnerability.reference','vulnerability.references','reference'],'')||''),
    detectedAt:String(firstValue(src,['vulnerability.detected_at','vulnerability.detectedAt','timestamp'],'')||''),
    updatedAt:String(firstValue(src,['vulnerability.updated_at','vulnerability.updatedAt','@timestamp'],'')||''),
    agentId:String(agent.id||''),
    agentName:String(agent.name||host.hostname||''),
    agentIp:String(agent.ip||host.ip||''),
    os:String(firstValue(src,['host.os.full','host.os.name','agent.os.name'],'')||''),
    packageName:String(pkg.name||pkg.source||''),
    packageVersion:String(pkg.version||''),
    packageArchitecture:String(pkg.architecture||pkg.arch||''),
    packageVendor:String(pkg.vendor||''),
    fixedVersion:String(fixedVersion||''),
    active:activeVulnerabilityStatus(vulnerability.status||src.status||'Active')
  };
}
function normalizeSecurityAlertHit(hit={}) {
  const src=hit._source||hit,rule=src.rule||{},agent=src.agent||{},host=src.host||{};
  const mitre=rule.mitre||src.mitre||{};
  return {
    key:String(hit._id||`${src.timestamp||src['@timestamp']||''}:${rule.id||''}:${agent.id||agent.name||''}`),
    timestamp:String(src.timestamp||src['@timestamp']||''),
    ruleId:String(rule.id||''),
    level:Number(rule.level||0),
    description:String(rule.description||src.description||''),
    agentId:String(agent.id||''),
    agentName:String(agent.name||host.hostname||''),
    agentIp:String(agent.ip||host.ip||''),
    groups:asArray(rule.groups).map(String),
    mitreIds:asArray(mitre.id).map(String),
    mitreTactics:asArray(mitre.tactic).map(String),
    mitreTechniques:asArray(mitre.technique).map(String),
    source:String(firstValue(src,['data.srcip','source.ip','decoder.name','location'],'')||''),
    destination:String(firstValue(src,['data.dstip','destination.ip'],'')||'')
  };
}
function normalizeFimHit(hit={}) {
  const src=hit._source||hit,rule=src.rule||{},agent=src.agent||{},syscheck=src.syscheck||{},host=src.host||{};
  return {
    key:String(hit._id||`${src.timestamp||src['@timestamp']||''}:${agent.id||agent.name||''}:${syscheck.path||''}`),
    timestamp:String(src.timestamp||src['@timestamp']||''),
    agentId:String(agent.id||''),agentName:String(agent.name||host.hostname||''),agentIp:String(agent.ip||host.ip||''),
    path:String(syscheck.path||src.path||''),event:String(syscheck.event||syscheck.event_type||src.event?.action||'modified'),
    ruleId:String(rule.id||''),level:Number(rule.level||0),description:String(rule.description||''),
    user:String(syscheck.uname_after||syscheck.user_name||''),group:String(syscheck.gname_after||''),
    sha256Before:String(syscheck.sha256_before||''),sha256After:String(syscheck.sha256_after||'')
  };
}
function securityCategorySummary(alerts=[],fim=[]) {
  const out={bruteForce:0,authentication:0,malware:0,privilegeEscalation:0,integrity:0};
  for(const a of alerts||[]){
    const text=[a.description,...(a.groups||[]),...(a.mitreTactics||[]),...(a.mitreTechniques||[])].join(' ').toLowerCase();
    if(/brute.?force|t1110/.test(text))out.bruteForce++;
    if(/auth|login|logon|credential/.test(text))out.authentication++;
    if(/malware|virus|trojan|rootkit|ransom/.test(text))out.malware++;
    if(/privilege escalation|elevation|t1068/.test(text))out.privilegeEscalation++;
    if(/syscheck|integrity|file change|fim/.test(text))out.integrity++;
  }
  out.integrity+=Array.isArray(fim)?fim.length:0;
  return out;
}
function vulnerabilityKey(v={}) {
  return String(v.key||`${v.agentId||v.agentName||'agent'}|${v.id||'cve'}|${v.packageName||'package'}|${v.packageVersion||''}`);
}
function endpointKey(name,id='') {
  return String(id||name||'unknown');
}
function buildWazuhOverview({manager={},indexerHealth={},agents=[],vulnerabilities=[],alerts=[],fim=[],errors=[],period='24h',generatedAt=new Date().toISOString()}={}) {
  const normalizedAgents=(agents||[]).map(normalizeAgent);
  const normalizedVulnerabilities=(vulnerabilities||[]).map(normalizeVulnerabilityHit);
  const activeVulnerabilities=normalizedVulnerabilities.filter(v=>v.active);
  const normalizedAlerts=(alerts||[]).map(normalizeSecurityAlertHit).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
  const normalizedFim=(fim||[]).map(normalizeFimHit).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)));
  const critical=activeVulnerabilities.filter(v=>v.severity==='critical');
  const high=activeVulnerabilities.filter(v=>v.severity==='high');
  const agentStatus={total:normalizedAgents.length,active:0,disconnected:0,neverConnected:0,other:0};
  for(const agent of normalizedAgents){
    if(agent.status==='active')agentStatus.active++;
    else if(agent.status==='disconnected')agentStatus.disconnected++;
    else if(agent.status==='never_connected'||agent.status==='never connected'||agent.status==='neverconnected')agentStatus.neverConnected++;
    else agentStatus.other++;
  }

  const byEndpointMap=new Map(),bySoftwareMap=new Map();
  for(const v of activeVulnerabilities){
    const key=endpointKey(v.agentName,v.agentId);
    if(!byEndpointMap.has(key))byEndpointMap.set(key,{agentId:v.agentId,agentName:v.agentName||v.agentId||'Endpoint',ip:v.agentIp,critical:0,high:0,total:0,packages:new Set(),cves:new Set(),alerts:0,priority:'ok'});
    const ep=byEndpointMap.get(key);ep.total++;ep.cves.add(v.id);if(v.packageName)ep.packages.add(v.packageName);if(v.severity==='critical')ep.critical++;if(v.severity==='high')ep.high++;
    const swKey=v.packageName||'Logiciel non renseigné';
    if(!bySoftwareMap.has(swKey))bySoftwareMap.set(swKey,{name:swKey,critical:0,high:0,total:0,machines:new Set(),cves:new Set()});
    const sw=bySoftwareMap.get(swKey);sw.total++;sw.machines.add(v.agentName||v.agentId||'Endpoint');sw.cves.add(v.id);if(v.severity==='critical')sw.critical++;if(v.severity==='high')sw.high++;
  }
  for(const alert of normalizedAlerts){
    const key=endpointKey(alert.agentName,alert.agentId);
    if(!byEndpointMap.has(key))byEndpointMap.set(key,{agentId:alert.agentId,agentName:alert.agentName||alert.agentId||'Endpoint',ip:alert.agentIp,critical:0,high:0,total:0,packages:new Set(),cves:new Set(),alerts:0,priority:'ok'});
    byEndpointMap.get(key).alerts++;
  }
  const disconnectedIds=new Set(normalizedAgents.filter(a=>a.status!=='active').map(a=>endpointKey(a.name,a.id)));
  const byEndpoint=[...byEndpointMap.values()].map(ep=>{
    const disconnected=disconnectedIds.has(endpointKey(ep.agentName,ep.agentId));
    const priority=ep.critical>0||normalizedAlerts.some(a=>(a.agentId&&a.agentId===ep.agentId||a.agentName&&a.agentName===ep.agentName)&&a.level>=15)?'critical':ep.high>0||ep.alerts>0||disconnected?'attention':'ok';
    return {...ep,packages:[...ep.packages],cves:[...ep.cves],priority,disconnected};
  }).sort((a,b)=>b.critical-a.critical||b.high-a.high||b.alerts-a.alerts||String(a.agentName).localeCompare(String(b.agentName)));
  const bySoftware=[...bySoftwareMap.values()].map(sw=>({...sw,machines:[...sw.machines],cves:[...sw.cves]})).sort((a,b)=>b.critical-a.critical||b.high-a.high||b.total-a.total||String(a.name).localeCompare(String(b.name)));

  const affectedEndpoints=new Set(activeVulnerabilities.map(v=>v.agentId||v.agentName).filter(Boolean));
  const vulnerablePackages=new Set(activeVulnerabilities.map(v=>v.packageName).filter(Boolean));
  const managerOk=!errors.some(e=>String(e.component||'').toLowerCase()==='manager');
  const indexerOk=!errors.some(e=>String(e.component||'').toLowerCase()==='indexer');
  const status=errors.length?(managerOk||indexerOk?'degraded':'offline'):'online';

  return {
    configured:true,
    status,
    generatedAt,
    period,
    manager:{ok:managerOk,version:String(manager?.version||manager?.data?.version||''),name:String(manager?.name||manager?.hostname||'Wazuh Manager')},
    indexer:{ok:indexerOk,status:String(indexerHealth?.status||indexerHealth?.cluster_name||'')},
    errors:(errors||[]).map(e=>({component:String(e.component||'Wazuh'),message:String(e.message||e)})),
    summary:{
      agentsTotal:agentStatus.total,
      agentsActive:agentStatus.active,
      agentsDisconnected:agentStatus.disconnected,
      agentsNeverConnected:agentStatus.neverConnected,
      importantAlerts:normalizedAlerts.length,
      critical:critical.length,
      high:high.length,
      affectedEndpoints:affectedEndpoints.size,
      vulnerablePackages:vulnerablePackages.size
    },
    agents:normalizedAgents,
    vulnerabilities:activeVulnerabilities.sort((a,b)=>{
      const rank=s=>s==='critical'?0:s==='high'?1:s==='medium'?2:s==='low'?3:4;
      return rank(a.severity)-rank(b.severity)||(Number(b.score||0)-Number(a.score||0))||String(a.id).localeCompare(String(b.id));
    }),
    alerts:normalizedAlerts,
    fim:normalizedFim,
    categories:securityCategorySummary(normalizedAlerts,normalizedFim),
    byEndpoint,
    bySoftware
  };
}
function demoWazuhOverview(period='24h') {
  const now=Date.now(),iso=ms=>new Date(now-ms).toISOString();
  const agents=[
    {id:'001',name:'DC01',ip:'10.10.0.10',status:'active',lastKeepAlive:iso(40*1000),version:'v4.14.7',os:{name:'Windows Server 2022',version:'21H2'}},
    {id:'002',name:'ITL-DCK-PROD01',ip:'10.20.30.40',status:'active',lastKeepAlive:iso(28*1000),version:'v4.14.7',os:{name:'Debian GNU/Linux',version:'13'}},
    {id:'003',name:'PVE-DEMO-01',ip:'10.10.0.2',status:'active',lastKeepAlive:iso(52*1000),version:'v4.14.7',os:{name:'Debian GNU/Linux',version:'13'}},
    {id:'004',name:'ITL-AD01',ip:'10.10.0.11',status:'disconnected',lastKeepAlive:iso(102*60*1000),version:'v4.14.7',os:{name:'Windows Server 2022',version:'21H2'}}
  ];
  const vulnerabilities=[
    {_id:'demo-v1',_source:{agent:{id:'002',name:'ITL-DCK-PROD01'},host:{os:{full:'Debian GNU/Linux 13'}},vulnerability:{id:'CVE-2026-2183',severity:'Critical',status:'Active',score:{base:9.8},description:'Demo critical OpenSSL vulnerability',detected_at:iso(3*60*60*1000)},package:{name:'libssl3',version:'3.0.11-1',architecture:'amd64',fixed_version:'3.0.14-1'}}},
    {_id:'demo-v2',_source:{agent:{id:'003',name:'PVE-DEMO-01'},host:{os:{full:'Debian GNU/Linux 13'}},vulnerability:{id:'CVE-2026-2183',severity:'Critical',status:'Active',score:{base:9.8},description:'Demo critical OpenSSL vulnerability'},package:{name:'libssl3',version:'3.0.11-1',architecture:'amd64',fixed_version:'3.0.14-1'}}},
    {_id:'demo-v3',_source:{agent:{id:'001',name:'DC01'},host:{os:{full:'Windows Server 2022'}},vulnerability:{id:'CVE-2026-44102',severity:'Critical',status:'Active',score:{base:9.1},description:'Demo Windows vulnerability'},package:{name:'Windows Kernel',version:'20348.000',fixed_version:'20348.2800'}}},
    {_id:'demo-v4',_source:{agent:{id:'002',name:'ITL-DCK-PROD01'},vulnerability:{id:'CVE-2026-11844',severity:'High',status:'Active',score:{base:8.1}},package:{name:'openssh-server',version:'9.2p1'}}},
    {_id:'demo-v5',_source:{agent:{id:'002',name:'ITL-DCK-PROD01'},vulnerability:{id:'CVE-2026-30171',severity:'High',status:'Active',score:{base:7.8}},package:{name:'containerd.io',version:'1.7.19'}}}
  ];
  const alerts=[
    {_id:'demo-a1',_source:{timestamp:iso(18*60*1000),agent:{id:'002',name:'ITL-DCK-PROD01'},rule:{id:'5712',level:14,description:'Multiple authentication failures',groups:['authentication_failed'],mitre:{id:['T1110'],tactic:['Credential Access'],technique:['Brute Force']}}}},
    {_id:'demo-a2',_source:{timestamp:iso(44*60*1000),agent:{id:'001',name:'DC01'},rule:{id:'60122',level:12,description:'Suspicious privilege-related activity',groups:['windows','security'],mitre:{id:['T1068'],tactic:['Privilege Escalation'],technique:['Exploitation for Privilege Escalation']}}}}
  ];
  const fim=[
    {_id:'demo-f1',_source:{timestamp:iso(32*60*1000),agent:{id:'002',name:'ITL-DCK-PROD01'},rule:{id:'550',level:10,description:'Integrity checksum changed',groups:['syscheck']},syscheck:{path:'/etc/ssh/sshd_config',event:'modified',sha256_before:'demo-before',sha256_after:'demo-after'}}},
    {_id:'demo-f2',_source:{timestamp:iso(95*60*1000),agent:{id:'003',name:'PVE-DEMO-01'},rule:{id:'554',level:9,description:'File added to monitored directory',groups:['syscheck']},syscheck:{path:'/etc/sudoers.d/demo-admin',event:'added'}}}
  ];
  return buildWazuhOverview({manager:{version:'4.14.7',name:'wazuh-manager-demo'},indexerHealth:{status:'green'},agents,vulnerabilities,alerts,fim,period});
}

module.exports={
  normalizeAgent,
  normalizeVulnerabilityHit,
  normalizeSecurityAlertHit,
  normalizeFimHit,
  securityCategorySummary,
  vulnerabilityKey,
  buildWazuhOverview,
  demoWazuhOverview
};
