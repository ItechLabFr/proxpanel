const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BOOTSTRAP_VERSION = '0.3.0';
const RUNTIME_DIR = process.env.PROXPANEL_RUNTIME_DIR || '/opt/proxpanel-runtime';
const RELEASES_DIR = path.join(RUNTIME_DIR, 'releases');
const CURRENT_LINK = path.join(RUNTIME_DIR, 'current');
const SEED_DIR = process.env.PROXPANEL_SEED_DIR || '/opt/proxpanel-seed';
const DATA_DIR = process.env.PROXPANEL_DATA_DIR || '/app/data';
const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');

function copyDir(src, dest) { fs.mkdirSync(dest,{recursive:true}); for(const e of fs.readdirSync(src,{withFileTypes:true})){const a=path.join(src,e.name),b=path.join(dest,e.name);if(e.isDirectory())copyDir(a,b);else if(e.isFile())fs.copyFileSync(a,b);} }
function readJson(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function parse(v){const m=String(v||'').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);if(!m)return null;return [+m[1],+m[2],+m[3],m[4]||''];}
function cmp(a,b){a=parse(a);b=parse(b);if(!a||!b)return 0;for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;if(a[3]===b[3])return 0;if(!a[3])return 1;if(!b[3])return -1;return a[3].localeCompare(b[3],undefined,{numeric:true})}
function switchCurrent(releaseName){const target=path.join(RELEASES_DIR,releaseName),tmp=`${CURRENT_LINK}.new`;try{fs.rmSync(tmp,{force:true})}catch{};fs.symlinkSync(path.relative(RUNTIME_DIR,target),tmp,'dir');fs.renameSync(tmp,CURRENT_LINK)}
function releaseVersion(dir){try{const v=String(readJson(path.join(dir,'release.json'),{}).version||'').trim();if(parse(v))return v}catch{};try{const v=String(readJson(path.join(dir,'package.json'),{}).version||'').trim();if(parse(v))return v}catch{};return ''}
function currentVersion(){return releaseVersion(CURRENT_LINK)}
function ensureRuntime(){
  fs.mkdirSync(RELEASES_DIR,{recursive:true});fs.mkdirSync(DATA_DIR,{recursive:true});
  const seedVersion=releaseVersion(SEED_DIR);
  if(!seedVersion)throw new Error('Version seed ProxPanel introuvable : release.json/package.json invalide.');
  const seedName=`v${seedVersion}`,seedRelease=path.join(RELEASES_DIR,seedName);
  if(!fs.existsSync(CURRENT_LINK)){
    if(!fs.existsSync(seedRelease))copyDir(SEED_DIR,seedRelease);switchCurrent(seedName);
    fs.writeFileSync(STATE_FILE,JSON.stringify({currentRelease:seedName,previousRelease:null,initializedAt:new Date().toISOString(),source:'docker-image'},null,2));return;
  }
  const cur=currentVersion();
  if(cur && cmp(seedVersion,cur)>0){
    if(!fs.existsSync(seedRelease))copyDir(SEED_DIR,seedRelease);
    const st=readJson(STATE_FILE,{}),prev=st.currentRelease||`v${cur}`;switchCurrent(seedName);
    fs.writeFileSync(STATE_FILE,JSON.stringify({...st,currentRelease:seedName,previousRelease:prev,updatedAt:new Date().toISOString(),source:'docker-image'},null,2));
    console.log(`[bootstrap] Image Docker plus récente détectée : ${cur} -> ${seedVersion}`);
  }
}
let child=null,stopping=false;
function startChild(){ensureRuntime();const entry=path.join(CURRENT_LINK,'server.js');if(!fs.existsSync(entry)){console.error(`[bootstrap] Entrypoint introuvable: ${entry}`);process.exit(1)}console.log(`[bootstrap ${BOOTSTRAP_VERSION}] Démarrage ${currentVersion()}`);child=spawn(process.execPath,[entry],{cwd:CURRENT_LINK,stdio:'inherit',env:{...process.env,PROXPANEL_RUNTIME_DIR:RUNTIME_DIR,PROXPANEL_DATA_DIR:DATA_DIR,PROXPANEL_BOOTSTRAP_VERSION:BOOTSTRAP_VERSION}});child.on('exit',(code,signal)=>{child=null;if(stopping)return process.exit(0);if(code===75){console.log('[bootstrap] Redémarrage demandé…');return setTimeout(startChild,600)}console.error(`[bootstrap] Arrêt code=${code} signal=${signal||'none'}; redémarrage dans 2 s.`);setTimeout(startChild,2000)})}
function stop(sig){if(stopping)return;stopping=true;if(child)child.kill(sig);else process.exit(0);setTimeout(()=>process.exit(0),5000).unref()}
process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));startChild();
