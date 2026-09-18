'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  backupAlertDecision,summarizeDockerContainers,classifyPortainerEnvironment,
  normalizeDockerContainer,normalizePortainerStack,redactDockerInspect,
  parseDockerSizeBytes,dockerDiskPressureFromInfo,dockerIncidentTransition
}=require('../app/lib/reliability');

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


test('Docker container normalization exposes operational metadata',()=>{
  const row=normalizeDockerContainer({
    Id:'abc123',
    Names:['/vaultwarden'],
    Image:'vaultwarden/server:latest',
    State:'running',
    Status:'Up 2 hours (healthy)',
    Labels:{'com.docker.compose.project':'vaultwarden'},
    Ports:[{PrivatePort:80,PublicPort:8080,Type:'tcp'}],
    NetworkSettings:{Networks:{frontend:{IPAddress:'172.18.0.4',Gateway:'172.18.0.1'}}}
  });
  assert.equal(row.name,'vaultwarden');
  assert.equal(row.health,'healthy');
  assert.equal(row.stack,'vaultwarden');
  assert.equal(row.ports[0].publicPort,8080);
  assert.equal(row.networks[0].name,'frontend');
});

test('Portainer stack normalization never exposes environment values',()=>{
  const row=normalizePortainerStack({
    Id:12,Name:'uptime-kuma',EndpointId:3,Status:1,CreatedBy:'admin',
    Env:[{name:'PASSWORD',value:'secret'},{name:'TZ',value:'Europe/Paris'}],
    GitConfig:{URL:'https://example.invalid/repo'}
  });
  assert.equal(row.active,true);
  assert.deepEqual(row.envNames,['PASSWORD','TZ']);
  assert.equal(JSON.stringify(row).includes('secret'),false);
});

test('Docker inspect redaction hides environment and secret-like fields',()=>{
  const row=redactDockerInspect({
    Config:{Env:['TOKEN=abc123','TZ=Europe/Paris'],Labels:{normal:'ok',apiKey:'danger'}},
    Password:'should-hide'
  });
  assert.deepEqual(row.Config.Env,['TOKEN=[redacted]','TZ=[redacted]']);
  assert.equal(row.Config.Labels.apiKey,'[redacted]');
  assert.equal(row.Password,'[redacted]');
});


test('Docker driver storage pressure is only reported when reliable capacity data exists',()=>{
  assert.equal(parseDockerSizeBytes('12.5 GB'),12.5e9);
  const pressure=dockerDiskPressureFromInfo({
    DriverStatus:[['Data Space Used','92 GB'],['Data Space Total','100 GB']]
  },85,95);
  assert.equal(pressure.severity,'warning');
  assert.equal(pressure.pct,92);
  assert.equal(dockerDiskPressureFromInfo({DriverStatus:[['Backing Filesystem','extfs']]},85,95),null);
});

test('Docker incidents require confirmation and emit one recovery transition',()=>{
  const now=1_000_000;
  const first=dockerIncidentTransition({},true,now,{confirmations:2,cooldownMinutes:30});
  assert.equal(first.active,false);
  assert.equal(first.shouldNotify,false);
  const second=dockerIncidentTransition(first,true,now+60_000,{confirmations:2,cooldownMinutes:30});
  assert.equal(second.active,true);
  assert.equal(second.shouldNotify,true);
  const steady=dockerIncidentTransition({...second,lastNotifiedAt:now+60_000},true,now+120_000,{confirmations:2,cooldownMinutes:30});
  assert.equal(steady.shouldNotify,false);
  const recovered=dockerIncidentTransition(steady,false,now+180_000,{confirmations:2,cooldownMinutes:30});
  assert.equal(recovered.active,false);
  assert.equal(recovered.shouldRecover,true);
});


test('Docker recurring incident waits for cooldown then notifies once',()=>{
  const start=10_000_000;
  const active={active:true,confirmations:2,occurrenceNotified:true,lastNotifiedAt:start,firstSeen:new Date(start).toISOString(),lastSeen:new Date(start).toISOString()};
  const recovered=dockerIncidentTransition(active,false,start+60_000,{confirmations:2,cooldownMinutes:30});
  const pending=dockerIncidentTransition(recovered,true,start+120_000,{confirmations:2,cooldownMinutes:30});
  const suppressed=dockerIncidentTransition(pending,true,start+180_000,{confirmations:2,cooldownMinutes:30});
  assert.equal(suppressed.active,true);
  assert.equal(suppressed.shouldNotify,false);
  const delayed=dockerIncidentTransition(suppressed,true,start+31*60_000,{confirmations:2,cooldownMinutes:30});
  assert.equal(delayed.shouldNotify,true);
});
