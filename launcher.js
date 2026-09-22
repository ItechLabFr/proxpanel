const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const BOOTSTRAP_VERSION = '0.4.0';
const RUNTIME_DIR = process.env.PROXPANEL_RUNTIME_DIR || '/opt/proxpanel-runtime';
const RELEASES_DIR = path.join(RUNTIME_DIR, 'releases');
const CURRENT_LINK = path.join(RUNTIME_DIR, 'current');
const SEED_DIR = process.env.PROXPANEL_SEED_DIR || '/opt/proxpanel-seed';
const DATA_DIR = process.env.PROXPANEL_DATA_DIR || '/app/data';
const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');
const PORT = Number(process.env.PORT || 8080);

function copyDir(src, dest) { fs.mkdirSync(dest,{recursive:true}); for(const e of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,e.name),b=path.join(dest,e.name);if(e.isDirectory())copyDir(a,b);else if(e.isFile())fs.copyFileSync(a,b);} }
function readJson(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeState(value){fs.mkdirSync(path.dirname(STATE_FILE),{recursive:true});fs.writeFileSync(STATE_FILE,JSON.stringify(value,null,2));}
function parse(v){const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);if(!m)return null;return [+m[1],+m[2],+m[3],m[4]||''];}
function cmp(a,b){a=parse(a);b=parse(b);if(!a||!b)return 0;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;if(a[3]===b[3])return 0;if(!a[3])return 1;if(!b[3])return -1;return a[3].localeCompare(b[3],undefined,{numeric:true})}
function switchCurrent(releaseName){const target=path.join(RELEASES_DIR,releaseName),tmp=`${CURRENT_LINK}.new`;if(!fs.existsSync(path.join(target,'server.js')))throw new Error(`Release cible invalide: ${releaseName}`);try{fs.rmSync(tmp,{force:true})}catch{};fs.symlinkSync(path.relative(RUNTIME_DIR,target),tmp,'dir');fs.renameSync(tmp,CURRENT_LINK)}
function releaseVersion(dir){try{const v=String(readJson(path.join(dir,'release.json'),{}).version||'').trim();if(parse(v))return v}catch{};try{const v=String(readJson(path.join(dir,'package.json'),{}).version||'').trim();if(parse(v))return v}catch{};return ''}
function currentVersion(){return releaseVersion(CURRENT_LINK)}
function ensureRuntime(){
  fs.mkdirSync(RELEASES_DIR,{recursive:true});fs.mkdirSync(DATA_DIR,{recursive:true});
  const seedVersion=releaseVersion(SEED_DIR);
  if(!seedVersion)throw new Error('Version seed ProxPanel introuvable : release.json/package.json invalide.');
  const seedName=`v${seedVersion}`,seedRelease=path.join(RELEASES_DIR,seedName);
  if(!fs.existsSync(CURRENT_LINK)){
    if(!fs.existsSync(seedRelease))copyDir(SEED_DIR,seedRelease);switchCurrent(seedName);
    writeState({currentRelease:seedName,previousRelease:null,initializedAt:new Date().toISOString(),source:'image-or-lxc-seed'});return;
  }
  const cur=currentVersion();
  if(cur && cmp(seedVersion,cur)>0){
    if(!fs.existsSync(seedRelease))copyDir(SEED_DIR,seedRelease);
    const st=readJson(STATE_FILE,{}),prev=st.currentRelease||`v${cur}`;switchCurrent(seedName);
    writeState({...st,currentRelease:seedName,previousRelease:prev,updatedAt:new Date().toISOString(),source:'image-or-lxc-seed'});
    console.log(`[bootstrap] Seed plus récent détecté : ${cur} -> ${seedVersion}`);
  }
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function healthOnce(){
  return new Promise(resolve=>{
    const req=http.get({host:'127.0.0.1',port:PORT,path:'/healthz',timeout:1800},res=>{res.resume();resolve(res.statusCode>=200&&res.statusCode<300)});
    req.on('timeout',()=>{req.destroy();resolve(false)});req.on('error',()=>resolve(false));
  });
}
let child=null,stopping=false,rollingBack=false,validationGeneration=0;
async function validatePendingRelease(generation){
  const st=readJson(STATE_FILE,{}),pending=st.pendingValidation;
  if(!pending||pending.release!==st.currentRelease)return;
  console.log(`[bootstrap] Validation post-update de ${pending.release}…`);
  const deadline=Date.now()+45000;
  while(!stopping&&generation===validationGeneration&&Date.now()<deadline){
    if(await healthOnce()){
      const current=readJson(STATE_FILE,{});
      if(current.pendingValidation?.release===pending.release){
        delete current.pendingValidation;current.lastHealthyAt=new Date().toISOString();current.lastHealthyRelease=pending.release;writeState(current);
      }
      console.log(`[bootstrap] Healthcheck OK pour ${pending.release}.`);return;
    }
    await wait(1200);
  }
  if(stopping||generation!==validationGeneration)return;
  const current=readJson(STATE_FILE,{}),previous=pending.previousRelease||current.previousRelease;
  if(!previous||!fs.existsSync(path.join(RELEASES_DIR,previous,'server.js'))){
    console.error(`[bootstrap] Healthcheck échoué pour ${pending.release}, mais aucun rollback valide n'est disponible.`);
    delete current.pendingValidation;current.validationFailedAt=new Date().toISOString();writeState(current);return;
  }
  console.error(`[bootstrap] Healthcheck échoué pour ${pending.release}. Rollback automatique vers ${previous}.`);
  const failed=current.currentRelease||pending.release;
  try{
    switchCurrent(previous);
    rollingBack=true;validationGeneration++;
    writeState({...current,currentRelease:previous,previousRelease:failed,pendingValidation:null,automaticRollbackAt:new Date().toISOString(),automaticRollbackReason:'post-update-healthcheck-failed'});
    if(child)child.kill('SIGTERM');
  }catch(error){console.error(`[bootstrap] Rollback automatique impossible: ${error.message}`)}
}
function startChild(){
  ensureRuntime();const entry=path.join(CURRENT_LINK,'server.js');
  if(!fs.existsSync(entry)){console.error(`[bootstrap] Entrypoint introuvable: ${entry}`);process.exit(1)}
  console.log(`[bootstrap ${BOOTSTRAP_VERSION}] Démarrage ${currentVersion()}`);
  child=spawn(process.execPath,[entry],{cwd:CURRENT_LINK,stdio:'inherit',env:{...process.env,PROXPANEL_RUNTIME_DIR:RUNTIME_DIR,PROXPANEL_DATA_DIR:DATA_DIR,PROXPANEL_BOOTSTRAP_VERSION:BOOTSTRAP_VERSION}});
  const generation=++validationGeneration;
  setTimeout(()=>validatePendingRelease(generation).catch(e=>console.error('[bootstrap] Validation post-update:',e.message)),1000).unref();
  child.on('exit',(code,signal)=>{
    child=null;if(stopping)return process.exit(0);
    if(rollingBack){rollingBack=false;console.log('[bootstrap] Redémarrage après rollback automatique…');return setTimeout(startChild,600)}
    if(code===75){console.log('[bootstrap] Redémarrage demandé…');return setTimeout(startChild,600)}
    console.error(`[bootstrap] Arrêt code=${code} signal=${signal||'none'}; redémarrage dans 2 s.`);setTimeout(startChild,2000)
  })
}
function stop(sig){if(stopping)return;stopping=true;validationGeneration++;if(child)child.kill(sig);else process.exit(0);setTimeout(()=>process.exit(0),5000).unref()}
process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));startChild();
