'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  demoPbsOverview,normalizeDatastore,normalizeSnapshot,normalizeJob,normalizeTask
}=require('../app/lib/pbs-client');

test('PBS datastore normalization exposes capacity and percentage',()=>{
  const row=normalizeDatastore({store:'BKP',total:1000,used:625,avail:375});
  assert.equal(row.store,'BKP');
  assert.equal(row.total,1000);
  assert.equal(row.used,625);
  assert.equal(row.avail,375);
  assert.equal(row.usagePct,62.5);
});

test('PBS snapshot normalization keeps restore point identity',()=>{
  const row=normalizeSnapshot({'backup-type':'vm','backup-id':'100','backup-time':1234,size:42,verification:{state:'ok'}},'BKP');
  assert.equal(row.store,'BKP');
  assert.equal(row.backupType,'vm');
  assert.equal(row.backupId,'100');
  assert.equal(row.backupTime,1234);
  assert.equal(row.size,42);
  assert.equal(row.verification,'ok');
});

test('PBS jobs are normalized by kind and schedule',()=>{
  const row=normalizeJob({id:'daily',store:'BKP',schedule:'daily',remote:'OFFSITE'},'sync');
  assert.equal(row.kind,'sync');
  assert.equal(row.id,'daily');
  assert.equal(row.store,'BKP');
  assert.equal(row.schedule,'daily');
  assert.equal(row.remote,'OFFSITE');
});

test('PBS task normalization keeps technical identifiers',()=>{
  const row=normalizeTask({upid:'UPID:node:1',node:'node',worker_type:'verify',worker_id:'BKP',status:'OK',starttime:10,endtime:20});
  assert.equal(row.upid,'UPID:node:1');
  assert.equal(row.workerType,'verify');
  assert.equal(row.workerId,'BKP');
  assert.equal(row.status,'OK');
  assert.equal(row.endTime,20);
});

test('PBS public demo provides deterministic operational data',()=>{
  const o=demoPbsOverview();
  assert.equal(o.configured,true);
  assert.equal(o.status,'online');
  assert.ok(o.datastores.length>=2);
  assert.ok(o.snapshots.length>=4);
  assert.ok(o.jobs.verify.length>=1);
  assert.ok(o.jobs.prune.length>=1);
  assert.ok(o.jobs.sync.length>=1);
  assert.ok(o.latestByGuest.length>=3);
});
