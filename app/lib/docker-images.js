'use strict';

function normalizeDockerImageId(value='') {
  return String(value||'').trim().replace(/^sha256:/i,'').toLowerCase();
}

function splitDockerImageReference(value='') {
  const raw=String(value||'').trim();
  if(!raw)return {raw:'',repository:'',tag:'',digest:'',pullRef:'',display:''};
  const at=raw.lastIndexOf('@');
  const digest=at>0?raw.slice(at+1):'';
  const withoutDigest=at>0?raw.slice(0,at):raw;
  const slash=withoutDigest.lastIndexOf('/');
  const colon=withoutDigest.lastIndexOf(':');
  const hasTag=colon>slash;
  const repository=hasTag?withoutDigest.slice(0,colon):withoutDigest;
  const tag=digest?'':(hasTag?withoutDigest.slice(colon+1):'latest');
  const pullRef=digest?`${repository}@${digest}`:`${repository}:${tag}`;
  return {raw,repository,tag,digest,pullRef,display:pullRef};
}

function normalizeDockerImage(row={}) {
  const repoTags=(Array.isArray(row.RepoTags)?row.RepoTags:[]).map(String).filter(x=>x&&x!=='<none>:<none>');
  const repoDigests=(Array.isArray(row.RepoDigests)?row.RepoDigests:[]).map(String).filter(x=>x&&x!=='<none>@<none>');
  return {
    id:String(row.Id||row.ID||row.id||''),
    shortId:normalizeDockerImageId(row.Id||row.ID||row.id||'').slice(0,12),
    repoTags,repoDigests,created:Number(row.Created||0),size:Number(row.Size||0),
    sharedSize:Number(row.SharedSize||0),virtualSize:Number(row.VirtualSize||row.Size||0),
    containers:Number(row.Containers??-1),dangling:repoTags.length===0
  };
}

function imageMatchesContainer(image={},container={}) {
  const imageId=normalizeDockerImageId(image.id);
  const containerId=normalizeDockerImageId(container.imageId||container.ImageID||container.ImageId||'');
  if(imageId&&containerId&&imageId===containerId)return true;
  const ref=String(container.image||container.Image||'');
  return (image.repoTags||[]).includes(ref);
}

function imageUsages(image={},containers=[]) {
  return (Array.isArray(containers)?containers:[]).filter(c=>imageMatchesContainer(image,c)).map(c=>({
    id:String(c.id||c.Id||''),name:String(c.name||c.Name||'').replace(/^\//,''),
    image:String(c.image||c.Image||''),stack:String(c.stack||''),state:String(c.state||c.State||'')
  }));
}

function digestRepository(value='') { const raw=String(value||'');const at=raw.lastIndexOf('@');return at>0?raw.slice(0,at):''; }
function digestValue(value='') { const raw=String(value||'');const at=raw.lastIndexOf('@');return at>0?raw.slice(at+1):''; }

function currentDigestForReference(image={},reference='') {
  const parsed=splitDockerImageReference(reference);
  if(parsed.digest)return parsed.digest;
  const digests=Array.isArray(image.repoDigests)?image.repoDigests:[];
  const exact=digests.find(x=>digestRepository(x)===parsed.repository);
  if(exact)return digestValue(exact);
  const tail=parsed.repository.includes('/')?parsed.repository.split('/').slice(-2).join('/'):parsed.repository;
  const fallback=digests.find(x=>{const repo=digestRepository(x);return repo===tail||repo.endsWith('/'+tail);});
  return fallback?digestValue(fallback):'';
}

function distributionDigest(payload={}) {
  return String(payload?.Descriptor?.digest||payload?.descriptor?.digest||payload?.digest||'').trim();
}

function classifyDockerImageUpdate(input={}) {
  const localDigest=String(input.localDigest||'').trim(),remoteDigest=String(input.remoteDigest||'').trim();
  const currentImageId=normalizeDockerImageId(input.currentImageId||''),pulledImageId=normalizeDockerImageId(input.pulledImageId||'');
  const checkedAt=String(input.checkedAt||'');
  if(pulledImageId&&currentImageId&&pulledImageId!==currentImageId)return {kind:'redeploy-required',label:'Image téléchargée · redeploy requis',tone:'warning',updateAvailable:true,pullAvailable:false,redeployRequired:true,localDigest,remoteDigest,checkedAt};
  if(remoteDigest&&localDigest){
    if(remoteDigest===localDigest)return {kind:'up-to-date',label:'À jour',tone:'ok',updateAvailable:false,pullAvailable:false,redeployRequired:false,localDigest,remoteDigest,checkedAt};
    return {kind:'update-available',label:'Mise à jour disponible',tone:'warning',updateAvailable:true,pullAvailable:true,redeployRequired:false,localDigest,remoteDigest,checkedAt};
  }
  if(input.error)return {kind:'unknown',label:'Vérification impossible',tone:'neutral',updateAvailable:false,pullAvailable:true,redeployRequired:false,localDigest,remoteDigest,checkedAt,error:String(input.error)};
  return {kind:'unknown',label:'État distant inconnu',tone:'neutral',updateAvailable:false,pullAvailable:true,redeployRequired:false,localDigest,remoteDigest,checkedAt};
}

function summarizeDockerRedeployHealth(containers=[]) {
  const rows=Array.isArray(containers)?containers:[];
  const running=rows.filter(x=>String(x.state||x.State||'').toLowerCase()==='running').length;
  const unhealthy=rows.filter(x=>String(x.health||x.Health||'').toLowerCase()==='unhealthy'||String(x.status||x.Status||'').toLowerCase().includes('(unhealthy)')).length;
  const restarting=rows.filter(x=>String(x.state||x.State||'').toLowerCase()==='restarting').length;
  return {total:rows.length,running,unhealthy,restarting,ok:rows.length>0&&unhealthy===0&&restarting===0&&running===rows.length};
}

function normalizeDockerUpdateWindow(row={}) {
  const days=[...new Set((Array.isArray(row.days)?row.days:[]).map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))];
  const time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):'';
  return {days:days.length?days:[0,1,2,3,4,5,6],start:time(row.start)||'02:00',end:time(row.end)||'05:00'};
}

module.exports={
  normalizeDockerImageId,splitDockerImageReference,normalizeDockerImage,imageMatchesContainer,imageUsages,
  currentDigestForReference,distributionDigest,classifyDockerImageUpdate,summarizeDockerRedeployHealth,
  normalizeDockerUpdateWindow
};
