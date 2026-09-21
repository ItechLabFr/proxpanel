'use strict';

const http = require('http');
const https = require('https');
const { buildWazuhOverview } = require('./wazuh');

const jwtCache = new Map();

function request(baseUrl, reqPath, options={}) {
  return new Promise((resolve,reject)=>{
    let base;
    try { base=new URL(String(baseUrl||'')); } catch { return reject(new Error('URL Wazuh invalide.')); }
    if(!['http:','https:'].includes(base.protocol))return reject(new Error('URL Wazuh HTTP/HTTPS requise.'));
    const lib=base.protocol==='https:'?https:http;
    const body=options.body==null?null:(typeof options.body==='string'?options.body:JSON.stringify(options.body));
    const headers={Accept:'application/json',...(options.headers||{})};
    if(body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    if(body&&!headers['Content-Length'])headers['Content-Length']=Buffer.byteLength(body);
    const req=lib.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||(base.protocol==='https:'?443:80),
      path:reqPath,method:options.method||'GET',headers,
      rejectUnauthorized:options.rejectUnauthorized!==false,timeout:Math.max(1000,Number(options.timeoutMs||12000))
    },res=>{
      let size=0;const chunks=[];
      res.on('data',chunk=>{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size<=12*1024*1024)chunks.push(b);});
      res.on('end',()=>{
        const text=Buffer.concat(chunks).toString('utf8').trim();
        let data;try{data=JSON.parse(text||'{}')}catch{data=text}
        if(res.statusCode>=200&&res.statusCode<300)return resolve({status:res.statusCode,data,headers:res.headers});
        const message=typeof data==='object'?(data?.message||data?.error?.reason||data?.error||`HTTP ${res.statusCode}`):(`${`HTTP ${res.statusCode}`} · ${String(data).slice(0,300)}`);
        reject(new Error(String(message)));
      });
    });
    req.on('timeout',()=>req.destroy(new Error('Timeout Wazuh')));
    req.on('error',reject);
    if(body)req.write(body);req.end();
  });
}

function basic(username,password) {
  return 'Basic '+Buffer.from(String(username||'')+':'+String(password||''),'utf8').toString('base64');
}
function period(value='24h') {
  const v=String(value||'24h').toLowerCase();return ['24h','7d','30d'].includes(v)?v:'24h';
}
function alertThreshold(item={}) {
  return Math.max(1,Math.min(16,Number(item.alertLevel||12)));
}
function affectedItems(value) {
  if(Array.isArray(value))return value;
  if(Array.isArray(value?.affected_items))return value.affected_items;
  if(Array.isArray(value?.data?.affected_items))return value.data.affected_items;
  return [];
}
function searchHits(value) {
  if(Array.isArray(value?.hits?.hits))return value.hits.hits;
  if(Array.isArray(value?.data?.hits?.hits))return value.data.hits.hits;
  return [];
}

async function authenticate(item,force=false) {
  const key=String(item.id||item.serverUrl||'wazuh'),cached=jwtCache.get(key);
  if(!force&&cached?.token&&cached.expiresAt>Date.now()+30000)return cached.token;
  if(!item.username||!item.password)throw new Error('Identifiants Wazuh Server API requis.');
  const r=await request(item.serverUrl,'/security/user/authenticate?raw=true',{
    method:'POST',headers:{Authorization:basic(item.username,item.password),Accept:'application/json,text/plain'},
    rejectUnauthorized:item.rejectUnauthorized!==false
  });
  let token='';
  if(typeof r.data==='string')token=r.data;
  else token=String(r.data?.data?.token||r.data?.token||r.data?.raw||'');
  token=token.trim().replace(/^"|"$/g,'');
  if(token.length<20)throw new Error('JWT Wazuh non reçu.');
  // Deliberately short-lived and memory-only. Never persist the JWT.
  jwtCache.set(key,{token,expiresAt:Date.now()+12*60*1000});
  return token;
}

async function serverJson(item,path,{forceAuth=false}={}) {
  const key=String(item.id||item.serverUrl||'wazuh');
  let token=await authenticate(item,forceAuth);
  try {
    const r=await request(item.serverUrl,path,{headers:{Authorization:'Bearer '+token},rejectUnauthorized:item.rejectUnauthorized!==false});
    return r.data;
  } catch(error) {
    if(forceAuth)throw error;
    jwtCache.delete(key);token=await authenticate(item,true);
    const r=await request(item.serverUrl,path,{headers:{Authorization:'Bearer '+token},rejectUnauthorized:item.rejectUnauthorized!==false});
    return r.data;
  }
}

async function indexerJson(item,path,{method='GET',body=null}={}) {
  if(!item.indexerUrl||!item.indexerUsername||!item.indexerPassword)throw new Error('Identifiants Wazuh Indexer requis.');
  const r=await request(item.indexerUrl,path,{
    method,body,headers:{Authorization:basic(item.indexerUsername,item.indexerPassword),'Content-Type':'application/json'},
    rejectUnauthorized:item.rejectUnauthorized!==false
  });
  return r.data;
}

async function testWazuhConnection(item) {
  const errors=[],result={ok:false,degraded:false,serverApi:false,indexer:false,agents:0,managerVersion:'',indexerStatus:''};
  try {
    const managerRaw=await serverJson(item,'/manager/info',{forceAuth:true});
    const agentsRaw=await serverJson(item,'/agents?limit=1&select=id,name,status');
    const manager=affectedItems(managerRaw)[0]||managerRaw?.data||managerRaw||{};
    result.serverApi=true;
    result.managerVersion=String(manager?.version||manager?.data?.version||'');
    result.agents=Number(agentsRaw?.total_affected_items||agentsRaw?.data?.total_affected_items||affectedItems(agentsRaw).length||0);
  } catch(error) { errors.push('Server API: '+String(error.message||error)); }
  try {
    const health=await indexerJson(item,'/_cluster/health');
    result.indexer=true;result.indexerStatus=String(health?.status||health?.cluster_name||'ok');
  } catch(error) { errors.push('Indexer: '+String(error.message||error)); }
  result.ok=result.serverApi&&result.indexer;
  result.degraded=(result.serverApi||result.indexer)&&!result.ok;
  result.detail=result.ok
    ?`Server API OK · Indexer ${result.indexerStatus||'OK'} · ${result.agents} agent(s)`
    :result.degraded?('Wazuh partiellement joignable · '+errors.join(' · ')):('Wazuh inaccessible · '+errors.join(' · '));
  if(!result.serverApi&&!result.indexer)throw new Error(result.detail);
  return result;
}

async function collectWazuh(item,{period:periodValue='24h'}={}) {
  const selectedPeriod=period(periodValue),errors=[];
  let manager={},agents=[],indexerHealth={},vulnerabilities=[],alerts=[];
  try {
    const [managerRaw,agentsRaw]=await Promise.all([
      serverJson(item,'/manager/info'),
      serverJson(item,'/agents?limit=500&select=id,name,ip,status,lastKeepAlive,version,os')
    ]);
    manager=affectedItems(managerRaw)[0]||managerRaw?.data||managerRaw||{};
    agents=affectedItems(agentsRaw);
  } catch(error) { errors.push({component:'manager',message:String(error.message||error)}); }
  try { indexerHealth=await indexerJson(item,'/_cluster/health'); }
  catch(error) { errors.push({component:'indexer',message:String(error.message||error)}); }
  try {
    const query={
      size:1000,
      query:{bool:{must_not:[{terms:{'vulnerability.status.keyword':['Solved','solved','Resolved','resolved','Fixed','fixed']}}]}},
      _source:[
        'agent.id','agent.name','agent.ip','host.hostname','host.ip','host.os.*',
        'vulnerability.id','vulnerability.severity','vulnerability.status','vulnerability.description',
        'vulnerability.score.*','vulnerability.cvss.*','vulnerability.reference','vulnerability.references',
        'vulnerability.detected_at','vulnerability.detectedAt','vulnerability.updated_at','vulnerability.updatedAt',
        'vulnerability.remediation.*','vulnerability.package.*',
        'package.name','package.version','package.architecture','package.arch','package.vendor','package.source',
        'package.fixed_version','package.fixedVersion','@timestamp'
      ]
    };
    const raw=await indexerJson(item,'/wazuh-states-vulnerabilities*/_search',{method:'POST',body:query});
    vulnerabilities=searchHits(raw);
  } catch(error) { errors.push({component:'indexer-vulnerabilities',message:String(error.message||error)}); }
  try {
    const hours=selectedPeriod==='30d'?720:selectedPeriod==='7d'?168:24;
    const query={
      size:250,
      query:{bool:{filter:[
        {range:{'rule.level':{gte:alertThreshold(item)}}},
        {range:{'timestamp':{gte:'now-'+hours+'h'}}}
      ]}},
      sort:[{'timestamp':{order:'desc',unmapped_type:'date'}}],
      _source:[
        'timestamp','@timestamp','agent.id','agent.name','agent.ip','host.hostname','host.ip',
        'rule.id','rule.level','rule.description','rule.groups','rule.mitre.*','mitre.*',
        'data.srcip','data.dstip','source.ip','destination.ip','decoder.name','location'
      ]
    };
    const raw=await indexerJson(item,'/wazuh-alerts-*/_search',{method:'POST',body:query});
    alerts=searchHits(raw);
  } catch(error) { errors.push({component:'indexer-alerts',message:String(error.message||error)}); }
  return buildWazuhOverview({manager,indexerHealth,agents,vulnerabilities,alerts,errors,period:selectedPeriod});
}

module.exports={request,testWazuhConnection,collectWazuh,period,alertThreshold};
