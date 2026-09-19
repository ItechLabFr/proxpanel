'use strict';

const RANGE_MS={
  hour:60*60*1000,
  day:24*60*60*1000,
  week:7*24*60*60*1000,
  month:30*24*60*60*1000
};
const RETENTION_MS=32*24*60*60*1000;

function dockerHistoryRange(value){
  const key=String(value||'day').toLowerCase();
  return Object.prototype.hasOwnProperty.call(RANGE_MS,key)?key:'day';
}

function dockerNetworkMbps(currentBytes,previousBytes,elapsedMs){
  const current=Number(currentBytes),previous=Number(previousBytes),elapsed=Number(elapsedMs);
  if(!Number.isFinite(current)||!Number.isFinite(previous)||elapsed<=0||current<previous)return 0;
  return Number((((current-previous)*8)/(elapsed/1000)/1e6).toFixed(3));
}

function appendDockerHistory(rows,sample,{now=Date.now(),minIntervalMs=60_000,retentionMs=RETENTION_MS}={}){
  const list=Array.isArray(rows)?rows.filter(Boolean):[];
  const time=Number(sample?.time||now);
  if(!Number.isFinite(time))return list;
  const last=list.at(-1);
  if(last&&time-Number(last.time||0)<minIntervalMs)return list;
  const next=[...list,{...sample,time}].filter(x=>Number(x.time||0)>=now-retentionMs);
  return next;
}

function average(rows,key){
  const values=rows.map(x=>Number(x?.[key])).filter(Number.isFinite);
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function downsampleDockerHistory(rows,maxPoints=180){
  const list=Array.isArray(rows)?rows:[];
  const limit=Math.max(12,Number(maxPoints)||180);
  if(list.length<=limit)return list;
  const size=Math.ceil(list.length/limit),out=[];
  for(let i=0;i<list.length;i+=size){
    const bucket=list.slice(i,i+size),last=bucket.at(-1)||{};
    out.push({
      ...last,
      cpuPct:Number(average(bucket,'cpuPct').toFixed(2)),
      memoryPct:Number(average(bucket,'memoryPct').toFixed(2)),
      rxMbps:Number(average(bucket,'rxMbps').toFixed(3)),
      txMbps:Number(average(bucket,'txMbps').toFixed(3))
    });
  }
  return out;
}

function selectDockerHistory(samples,{range='day',scope='all',now=Date.now(),maxPoints=180}={}){
  const key=dockerHistoryRange(range),start=now-RANGE_MS[key],target=String(scope||'all');
  const rows=(Array.isArray(samples)?samples:[])
    .filter(x=>Number(x?.time||0)>=start)
    .map(x=>({time:Number(x.time),...(x.scopes?.[target]||{})}))
    .filter(x=>Object.keys(x).length>1)
    .sort((a,b)=>a.time-b.time);
  return {range:key,scope:target,from:start,to:now,points:downsampleDockerHistory(rows,maxPoints)};
}

module.exports={
  RANGE_MS,RETENTION_MS,dockerHistoryRange,dockerNetworkMbps,
  appendDockerHistory,downsampleDockerHistory,selectDockerHistory
};
