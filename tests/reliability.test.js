'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {backupAlertDecision,summarizeDockerContainers,classifyPortainerEnvironment}=require('../app/lib/reliability');

test('daily backup around 24h stays healthy with a 36h threshold',()=>{
  const now=2_000_000;
  const result=backupAlertDecision({ctime:now-24*3600,maxAgeHours:36,absenceReliable:true,nowSec:now});
  assert.equal(result.kind,'ok');
  assert.equal(Math.round(result.ageHours),24);
});

test('backup older than 36h is stale',()=>{
  const now=2_000_000;
  const result=backupAlertDecision({ctime:now-37*3600,maxAgeHours:36,absenceReliable:true,nowSec:now});
  assert.equal(result.kind,'stale');
});

test('missing backup is never inferred from an unreliable inventory',()=>{
  assert.equal(backupAlertDecision({ctime:0,maxAgeHours:36,absenceReliable:false}).kind,'unknown');
  assert.equal(backupAlertDecision({ctime:0,maxAgeHours:36,absenceReliable:true}).kind,'absent');
});

test('Portainer container summary counts running and unhealthy containers',()=>{
  const result=summarizeDockerContainers([
    {State:'running',Status:'Up 2 hours (healthy)'},
    {State:'running',Status:'Up 3 minutes (unhealthy)'},
    {State:'exited',Status:'Exited (0) 1 hour ago'}
  ]);
  assert.deepEqual(result,{total:3,running:2,stopped:1,healthy:1,unhealthy:1,restarting:0,paused:0});
});

test('Docker standalone is supported while Swarm is reported separately',()=>{
  assert.deepEqual(classifyPortainerEnvironment({Swarm:{LocalNodeState:'inactive'}}),{kind:'docker-standalone',supported:true,label:'Docker Standalone'});
  assert.deepEqual(classifyPortainerEnvironment({Swarm:{LocalNodeState:'active'}}),{kind:'swarm',supported:false,label:'Docker Swarm'});
});
