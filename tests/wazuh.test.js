'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeVulnerabilityHit,buildWazuhOverview,demoWazuhOverview}=require('../app/lib/wazuh');
const {evaluateWazuhTransitions}=require('../app/lib/wazuh-alerts');

function vuln(id='CVE-DEMO-1',severity='Critical',agent='srv01',pkg='openssl',fixed=''){
  return {_id:id+'-'+agent,_source:{agent:{id:agent,name:agent},vulnerability:{id,severity,status:'Active',score:{base:severity==='Critical'?9.8:8.1}},package:{name:pkg,version:'1.0.0',...(fixed?{fixed_version:fixed}:{})}}};
}

test('Wazuh vulnerability normalization keeps machine, package and fixed version from source',()=>{
  const row=normalizeVulnerabilityHit(vuln('CVE-DEMO-1','Critical','srv01','libssl3','3.0.14'));
  assert.equal(row.id,'CVE-DEMO-1');assert.equal(row.severity,'critical');assert.equal(row.agentName,'srv01');assert.equal(row.packageName,'libssl3');assert.equal(row.packageVersion,'1.0.0');assert.equal(row.fixedVersion,'3.0.14');assert.equal(row.score,9.8);
});

test('Wazuh normalization never invents a fixed version',()=>{
  const row=normalizeVulnerabilityHit(vuln('CVE-DEMO-2','High','srv02','openssh-server'));
  assert.equal(row.fixedVersion,'');
});

test('Overview excludes solved vulnerabilities from active critical/high counts',()=>{
  const active=vuln('CVE-A','Critical','srv01','openssl');
  const solved=vuln('CVE-B','Critical','srv02','kernel');solved._source.vulnerability.status='Solved';
  const o=buildWazuhOverview({agents:[{id:'srv01',name:'srv01',status:'active'},{id:'srv02',name:'srv02',status:'active'}],vulnerabilities:[active,solved],alerts:[]});
  assert.equal(o.summary.critical,1);assert.equal(o.vulnerabilities.length,1);assert.equal(o.summary.affectedEndpoints,1);
});

test('Partial Wazuh collection is degraded, never reported as healthy zero',()=>{
  const o=buildWazuhOverview({agents:[],vulnerabilities:[],alerts:[],errors:[{component:'indexer',message:'timeout'}]});
  assert.equal(o.status,'degraded');assert.equal(o.errors.length,1);
});

test('First Wazuh alert evaluation creates a silent baseline',()=>{
  const o=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[vuln()],alerts:[]});
  const r=evaluateWazuhTransitions({},o,{notifyHigh:true});
  assert.equal(r.events.length,0);assert.equal(r.state.baseline,true);assert.equal(Object.keys(r.state.vulnerabilities).length,1);
});

test('A new critical CVE notifies once and is then deduplicated',()=>{
  const base=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[],alerts:[]});
  const first=evaluateWazuhTransitions({},base,{});
  const changed=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[vuln('CVE-NEW','Critical','001','libssl3','2.0')],alerts:[]});
  const second=evaluateWazuhTransitions(first.state,changed,{});
  assert.equal(second.events.filter(e=>e.type==='wazuh.vulnerability.critical').length,1);
  const third=evaluateWazuhTransitions(second.state,changed,{});
  assert.equal(third.events.filter(e=>e.type==='wazuh.vulnerability.critical').length,0);
});

test('High CVE notification follows administrator policy',()=>{
  const base=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[],alerts:[]});
  const first=evaluateWazuhTransitions({},base,{});
  const changed=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[vuln('CVE-HIGH','High','001','openssh-server')],alerts:[]});
  assert.equal(evaluateWazuhTransitions(first.state,changed,{notifyHigh:false}).events.filter(e=>e.type==='wazuh.vulnerability.high').length,0);
  assert.equal(evaluateWazuhTransitions(first.state,changed,{notifyHigh:true}).events.filter(e=>e.type==='wazuh.vulnerability.high').length,1);
});

test('Agent disconnection requires two consecutive checks and recovery is explicit',()=>{
  const healthy=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[],alerts:[]});
  const baseline=evaluateWazuhTransitions({},healthy,{notifyAgentOffline:true});
  const down=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'disconnected'}],vulnerabilities:[],alerts:[]});
  const firstDown=evaluateWazuhTransitions(baseline.state,down,{notifyAgentOffline:true});
  assert.equal(firstDown.events.filter(e=>e.type==='wazuh.agent.disconnected').length,0);
  const secondDown=evaluateWazuhTransitions(firstDown.state,down,{notifyAgentOffline:true});
  assert.equal(secondDown.events.filter(e=>e.type==='wazuh.agent.disconnected').length,1);
  const recovered=evaluateWazuhTransitions(secondDown.state,healthy,{notifyAgentOffline:true});
  assert.equal(recovered.events.filter(e=>e.type==='wazuh.agent.recovered').length,1);
});

test('Resolved critical vulnerability emits a solved event',()=>{
  const withVuln=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[vuln('CVE-SOLVED','Critical','001','kernel')],alerts:[]});
  const baseline=evaluateWazuhTransitions({},withVuln,{});
  const clean=buildWazuhOverview({agents:[{id:'001',name:'srv01',status:'active'}],vulnerabilities:[],alerts:[]});
  const r=evaluateWazuhTransitions(baseline.state,clean,{});
  assert.equal(r.events.filter(e=>e.type==='wazuh.vulnerability.solved').length,1);
});

test('Demo Wazuh overview is deterministic enough for public UI fixtures',()=>{
  const o=demoWazuhOverview('24h');assert.equal(o.configured,true);assert.ok(o.summary.critical>0);assert.ok(o.vulnerabilities.some(v=>v.packageName));assert.ok(o.alerts.some(a=>a.level>=12));
});
