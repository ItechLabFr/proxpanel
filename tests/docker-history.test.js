'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  dockerHistoryRange,dockerNetworkMbps,appendDockerHistory,
  downsampleDockerHistory,selectDockerHistory
}=require('../app/lib/docker-history');

test('Docker history accepts the supported ranges and falls back to day',()=>{
  assert.equal(dockerHistoryRange('hour'),'hour');
  assert.equal(dockerHistoryRange('month'),'month');
  assert.equal(dockerHistoryRange('invalid'),'day');
});

test('Docker network Mbps is calculated from monotonic byte counters',()=>{
  assert.equal(dockerNetworkMbps(2_000_000,1_000_000,1000),8);
  assert.equal(dockerNetworkMbps(900,1000,1000),0);
});

test('Docker history enforces the one minute sampling interval',()=>{
  const first=appendDockerHistory([],{time:1_000_000,scopes:{all:{cpuPct:10}}},{now:1_000_000,minIntervalMs:60_000});
  const skipped=appendDockerHistory(first,{time:1_030_000,scopes:{all:{cpuPct:20}}},{now:1_030_000,minIntervalMs:60_000});
  const accepted=appendDockerHistory(skipped,{time:1_061_000,scopes:{all:{cpuPct:30}}},{now:1_061_000,minIntervalMs:60_000});
  assert.equal(first.length,1);
  assert.equal(skipped.length,1);
  assert.equal(accepted.length,2);
});

test('Docker history selects one environment without mixing other scopes',()=>{
  const now=10_000_000;
  const samples=[
    {time:now-1000,scopes:{all:{cpuPct:50},'p1:1':{cpuPct:20}}},
    {time:now,scopes:{all:{cpuPct:60},'p1:1':{cpuPct:30}}}
  ];
  const result=selectDockerHistory(samples,{range:'hour',scope:'p1:1',now});
  assert.deepEqual(result.points.map(x=>x.cpuPct),[20,30]);
});

test('Docker history downsampling keeps the final status while averaging metrics',()=>{
  const rows=Array.from({length:24},(_,i)=>({
    time:i,cpuPct:i,memoryPct:i*2,rxMbps:i/2,txMbps:i/4,
    running:i,stopped:24-i,unhealthy:i===23?1:0,incidents:i===23?1:0
  }));
  const sampled=downsampleDockerHistory(rows,12);
  assert.ok(sampled.length<=12);
  assert.equal(sampled.at(-1).running,23);
  assert.equal(sampled.at(-1).unhealthy,1);
  assert.ok(sampled[0].cpuPct>0);
});
