'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  normalizeDockerImageId,splitDockerImageReference,normalizeDockerImage,imageUsages,
  currentDigestForReference,distributionDigest,classifyDockerImageUpdate,summarizeDockerRedeployHealth,
  normalizeDockerUpdateWindow
}=require('../app/lib/docker-images');

test('Docker image references are normalized safely',()=>{
  assert.deepEqual(splitDockerImageReference('nginx'),{raw:'nginx',repository:'nginx',tag:'latest',digest:'',pullRef:'nginx:latest',display:'nginx:latest'});
  const tagged=splitDockerImageReference('ghcr.io/acme/app:v1.2.3');
  assert.equal(tagged.repository,'ghcr.io/acme/app');
  assert.equal(tagged.tag,'v1.2.3');
  assert.equal(tagged.pullRef,'ghcr.io/acme/app:v1.2.3');
  const pinned=splitDockerImageReference('ghcr.io/acme/app@sha256:abc123');
  assert.equal(pinned.repository,'ghcr.io/acme/app');
  assert.equal(pinned.digest,'sha256:abc123');
  assert.equal(pinned.pullRef,'ghcr.io/acme/app@sha256:abc123');
});

test('Docker images expose tags, digests and dangling state',()=>{
  const image=normalizeDockerImage({Id:'sha256:ABCDEF',RepoTags:['nginx:latest'],RepoDigests:['nginx@sha256:111'],Created:10,Size:42});
  assert.equal(image.shortId,'abcdef');
  assert.equal(image.dangling,false);
  assert.equal(image.size,42);
  const dangling=normalizeDockerImage({Id:'sha256:deadbeef',RepoTags:['<none>:<none>'],RepoDigests:[]});
  assert.equal(dangling.dangling,true);
});

test('Image usage matches running container image ids before tags',()=>{
  const image=normalizeDockerImage({Id:'sha256:abc',RepoTags:['acme/app:latest']});
  const usages=imageUsages(image,[
    {id:'1',name:'one',image:'acme/app:latest',imageId:'sha256:abc',state:'running'},
    {id:'2',name:'two',image:'other:latest',imageId:'sha256:def',state:'running'}
  ]);
  assert.equal(usages.length,1);
  assert.equal(usages[0].name,'one');
});

test('Local digest is selected for the matching repository',()=>{
  const image=normalizeDockerImage({
    Id:'sha256:abc',
    RepoTags:['ghcr.io/acme/app:latest'],
    RepoDigests:['ghcr.io/acme/app@sha256:aaaa','ghcr.io/acme/other@sha256:bbbb']
  });
  assert.equal(currentDigestForReference(image,'ghcr.io/acme/app:latest'),'sha256:aaaa');
  assert.equal(currentDigestForReference(image,'ghcr.io/acme/app@sha256:cccc'),'sha256:cccc');
});

test('Distribution digest extraction supports Docker response shapes',()=>{
  assert.equal(distributionDigest({Descriptor:{digest:'sha256:aaa'}}),'sha256:aaa');
  assert.equal(distributionDigest({descriptor:{digest:'sha256:bbb'}}),'sha256:bbb');
});

test('Docker update classification separates update, pull and redeploy states',()=>{
  const checkedAt='2026-09-19T20:00:00Z';
  assert.equal(classifyDockerImageUpdate({localDigest:'sha256:a',remoteDigest:'sha256:a',checkedAt}).kind,'up-to-date');
  const update=classifyDockerImageUpdate({localDigest:'sha256:a',remoteDigest:'sha256:b',checkedAt});
  assert.equal(update.kind,'update-available');
  assert.equal(update.pullAvailable,true);
  assert.equal(update.redeployRequired,false);
  const redeploy=classifyDockerImageUpdate({currentImageId:'sha256:old',pulledImageId:'sha256:new',localDigest:'sha256:b',remoteDigest:'sha256:b',checkedAt});
  assert.equal(redeploy.kind,'redeploy-required');
  assert.equal(redeploy.pullAvailable,false);
  assert.equal(redeploy.redeployRequired,true);
  assert.equal(classifyDockerImageUpdate({error:'registry unavailable'}).kind,'unknown');
});

test('Redeploy health requires every expected container running without unhealthy/restarting state',()=>{
  assert.deepEqual(
    summarizeDockerRedeployHealth([{state:'running',health:'healthy'},{state:'running',health:''}]),
    {total:2,running:2,unhealthy:0,restarting:0,ok:true}
  );
  assert.equal(summarizeDockerRedeployHealth([{state:'running',health:'unhealthy'}]).ok,false);
  assert.equal(summarizeDockerRedeployHealth([]).ok,false);
});

test('Docker maintenance windows are normalized',()=>{
  assert.deepEqual(normalizeDockerUpdateWindow({days:[1,1,7,-1,5],start:'01:30',end:'04:00'}),{days:[1,5],start:'01:30',end:'04:00'});
  assert.deepEqual(normalizeDockerUpdateWindow({days:[],start:'bad',end:'bad'}),{days:[0,1,2,3,4,5,6],start:'02:00',end:'05:00'});
});

test('Image id normalization ignores sha256 prefix and casing',()=>{
  assert.equal(normalizeDockerImageId('sha256:ABC123'),'abc123');
});
