const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');
const dgram = require('dgram');
const zlib = require('zlib');
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { URL } = require('url');
const QRCode = require('./vendor/QRCode');
const QRErrorCorrectLevel = require('./vendor/QRCode/QRErrorCorrectLevel');
const {
  classifyProxmoxTaskStatus,backupAlertDecision,summarizeDockerContainers,classifyPortainerEnvironment,
  normalizeDockerContainer,normalizePortainerStack,redactDockerInspect,
  dockerDiskPressureFromInfo,dockerIncidentTransition
} = require('./lib/reliability');
const {
  RANGE_MS,appendDockerHistory,selectDockerHistory,dockerNetworkMbps
} = require('./lib/docker-history');
const {
  normalizeDockerImageId,splitDockerImageReference,normalizeDockerImage,imageUsages,
  currentDigestForReference,distributionDigest,classifyDockerImageUpdate,summarizeDockerRedeployHealth,
  normalizeDockerUpdateWindow
} = require('./lib/docker-images');
const {
  DEMO_MODE, DEMO_USERNAME, DEMO_PASSWORD, DEMO_EMAIL,
  demoProxmoxApi, demoTemperatureForNode,
  demoDockerOverview, demoDockerContainers, demoDockerStacks,
  demoDockerContainerDetails, demoDockerLogs
} = require('./lib/demo-mode');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.PROXPANEL_DATA_DIR || path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');
const MASTER_KEY_FILE = path.join(DATA_DIR, 'master.key');
function readReleaseMetadata() {
  const candidates=[path.join(ROOT,'release.json'),path.resolve(ROOT,'..','release.json')];
  let lastError='release.json introuvable';
  for(const file of candidates){
    try{
      if(!fs.existsSync(file))continue;
      const release=JSON.parse(fs.readFileSync(file,'utf8'));
      const version=String(release?.version||'').trim();
      if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))throw new Error('version SemVer invalide');
      return {...release,version,file};
    }catch(error){lastError=String(error?.message||error);}
  }
  return {version:'',error:lastError};
}
const RELEASE_METADATA = readReleaseMetadata();
let PACKAGE_VERSION = '';
try { PACKAGE_VERSION = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '').trim(); } catch {}
const APP_VERSION = RELEASE_METADATA.version || String(process.env.PROXPANEL_VERSION || '').trim() || PACKAGE_VERSION;
const APP_CHANNEL = APP_VERSION.includes('-') ? 'BETA' : 'STABLE';
function otaRuntimeVersion() {
  const version=String(RELEASE_METADATA.version||'').trim();
  return version && version!=='0.0.0' ? version : '';
}
function requireOtaRuntimeVersion() {
  const version=otaRuntimeVersion();
  if(!version) throw new Error(`Version OTA indisponible : release.json absent, invalide ou interdit (${RELEASE_METADATA.error||'version inconnue'}).`);
  return version;
}
const OFFICIAL_OTA_BASE_URL = 'https://updates.proxpanel.fr';
const BOOTSTRAP_VERSION = process.env.PROXPANEL_BOOTSTRAP_VERSION || '0.0.0';
const RUNTIME_DIR = process.env.PROXPANEL_RUNTIME_DIR || path.join(ROOT, '.runtime');
const RELEASES_DIR = path.join(RUNTIME_DIR, 'releases');
const CURRENT_LINK = path.join(RUNTIME_DIR, 'current');
const RUNTIME_STATE_FILE = path.join(RUNTIME_DIR, 'state.json');
const UPDATE_HISTORY_FILE = path.join(DATA_DIR, 'update-history.json');
const UPDATE_UPLOAD_DIR = path.join(RUNTIME_DIR, 'uploads');
const UPDATE_BACKUP_DIR = path.join(RUNTIME_DIR, 'backups');
const MAX_UPDATE_BYTES = 250 * 1024 * 1024;
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const CHANGES_FILE = path.join(DATA_DIR, 'changes.json');
const AUTOMATIONS_FILE = path.join(DATA_DIR, 'automations.json');
const INTEGRATIONS_FILE = path.join(DATA_DIR, 'integrations.json');
const DEPENDENCIES_FILE = path.join(DATA_DIR, 'dependencies.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DASHBOARD_GROUPS_FILE = path.join(DATA_DIR, 'dashboard-groups.json');
const RESTORE_TESTS_FILE = path.join(DATA_DIR, 'restore-tests.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics-history.json');
const ALERT_STATE_FILE = path.join(DATA_DIR, 'alert-state.json');
const DOCKER_MONITOR_STATE_FILE = path.join(DATA_DIR, 'docker-monitor-state.json');
const DOCKER_TOPOLOGY_FILE = path.join(DATA_DIR, 'docker-topology.json');
const DOCKER_METRICS_FILE = path.join(DATA_DIR, 'docker-metrics-history.json');
const DOCKER_UPDATE_STATE_FILE = path.join(DATA_DIR, 'docker-update-state.json');
const DOCKER_UPDATE_HISTORY_FILE = path.join(DATA_DIR, 'docker-update-history.json');
const UPDATE_CHECK_STATE_FILE = path.join(DATA_DIR, 'update-check-state.json');
const OTA_INSTANCE_FILE = path.join(DATA_DIR, 'ota-instance-id.txt');
const PVE_UPDATE_STATE_FILE = path.join(DATA_DIR, 'pve-update-state.json');
const CONSOLE_SESSIONS = new Map();
const CONSOLE_ERRORS = new Map();
const CONSOLE_STATES = new Map();
const PVE_USER_SESSIONS = new Map();
const AUTOMATION_RUNS = new Map();
const CONSOLE_TTL_MS = 5 * 60 * 1000;
const LOGIN_ATTEMPTS = new Map();
const EMAIL_2FA_CODES = new Map();
const GUEST_STORAGE_CACHE = new Map();
const GUEST_STORAGE_CACHE_OK_MS = 5 * 60 * 1000;
const GUEST_STORAGE_CACHE_NEGATIVE_MS = 60 * 1000;
// Short-lived in-memory caches remove redundant TLS handshakes and repeated
// Proxmox logins during dashboard bursts without weakening certificate pinning.
const CERT_PIN_CACHE = new Map();
const CERT_PIN_CACHE_MS = 60 * 1000;
const PVE_AUTH_CACHE = new Map();
const PVE_AUTH_CACHE_MS = 20 * 60 * 1000;
const BACKUP_INVENTORY_CACHE = new Map();
const BACKUP_INVENTORY_CACHE_MS = 60 * 1000;
const PORTAINER_OVERVIEW_CACHE = new Map();
const PORTAINER_OVERVIEW_CACHE_MS = 20 * 1000;
const NODE_TEMPERATURE_CACHE = new Map();
const NODE_TEMPERATURE_CACHE_MS = 30 * 1000;
const NODE_ADDRESS_CACHE = new Map();
const NODE_ADDRESS_CACHE_MS = 5 * 60 * 1000;

for (const dir of [RUNTIME_DIR, RELEASES_DIR, UPDATE_UPLOAD_DIR, UPDATE_BACKUP_DIR]) fs.mkdirSync(dir, { recursive: true });

fs.mkdirSync(DATA_DIR, { recursive: true });

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function jsonRead(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function jsonWrite(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function defaultSettings() {
  return {
    branding: { name: 'ProxPanel', subtitle: 'PROXMOX CONSOLE', accent: '#ff7a00', logoText: '◇' },
    thresholds: { cpuWarning: 85, memoryWarning: 85, storageWarning: 85, storageCritical: 95, temperatureWarning: 75, temperatureCritical: 85, backupMaxAgeHours: 36 },
    modules: { overview: true, machines: true, nodes: true, monitoring: true, storage: true, docker: true, backups: true, tasks: true, create: false, templates: true, firewall: false, problems: true, dependencies: true, changes: true, maintenance: true, pveupdates: true, automations: true, energy: false, audit: true, integrations: false, notifications: true, users: true, admin: true },
    dashboardWidgets: ['cpu','memory','storage','temperature','network','machines','health','problems','capacity','backups'],
    homePage: 'overview',
    language: 'fr',
    timezone: 'UTC',
    menuOrder: ['overview','machines','nodes','monitoring','storage','docker','backups','tasks','templates','problems','dependencies','changes','maintenance','pveupdates','automations','audit','notifications','users','admin'],
    electricity: { pricePerKwh: 0.25, currency: 'EUR', nodes: {} },
    alerts: {
      enabled: true, pollMinutes: 5, discordWebhook: '', discordChannels: [], genericWebhook: '', telegramBotToken: '', telegramChatId: '',
      docker: { enabled:true, confirmations:2, cooldownMinutes:30, restartDeltaWarning:3, stoppedGraceMinutes:3, maxMetricContainers:50 },
      smtp: {
        enabled: false, mode: 'm365-graph', host: 'smtp.office365.com', port: 587, security: 'starttls', username: '', passwordEnc: '', from: '', to: '',
        tenantId: '', clientId: '', clientSecretEnc: '', sender: ''
      }
    },
    updates: { autoCheckEnabled: true, checkIntervalHours: 6, provider: 'ota', otaBaseUrl: OFFICIAL_OTA_BASE_URL, otaChannel: 'stable', otaPublicKeyPem: '', otaPublicKeyFingerprint: '', feedUrl: '', notifyPanel: true, notifyDiscord: true, notifyEmail: true, autoInstallEnabled: false, autoInstallWindows: [{ days:[0,1,2,3,4,5,6], start:'02:00', end:'05:00' }] },
    pveUpdates: { enabled: true, checkIntervalHours: 6, refreshApt: true, notifyPanel: true, notifyDiscord: true, notifyEmail: true, includeChangelog: true, manualReportEmail: true, manualReportDiscord: true, manualAudit: true },
    dockerUpdates: { autoCheckEnabled:false, checkIntervalHours:12, notifyOnAvailable:true, scheduledActionsEnabled:false, maintenanceWindows:[{days:[0,1,2,3,4,5,6],start:'02:00',end:'05:00'}] },
    ui: {
      dashboardRefreshSeconds: 10,
      dashboardLayout: {
        density: 'comfortable',
        motion: true,
        machineView: 'cards',
        hidden: [],
        sizes: { cpu:'s', memory:'s', storage:'s', temperature:'s', network:'s', machines:'xl', health:'m', problems:'l', capacity:'m', backups:'m' }
      },
      tvStudio: {
        density: 'comfortable',
        widgets: ['health','cpu','memory','temperature','network','storage','machines','alerts'],
        sizes: { health:'l', cpu:'l', memory:'l', temperature:'l', network:'l', storage:'l', machines:'m', alerts:'l' }
      }
    },
    bookmarks: [],
    pwa: { notificationsEnabled: true }
  };
}
function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out = { ...base };
  for (const [k,v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}
function normalizeClockTime(value, fallback='02:00') {
  const raw=String(value||'').trim();
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return fallback;
  return raw;
}
function normalizeAutoInstallWindows(value) {
  const source=Array.isArray(value)&&value.length?value:[{days:[0,1,2,3,4,5,6],start:'02:00',end:'05:00'}];
  return source.slice(0,8).map((row,index)=>{
    const days=[...new Set((Array.isArray(row?.days)?row.days:[]).map(Number).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))];
    const start=normalizeClockTime(row?.start,'02:00'),end=normalizeClockTime(row?.end,'05:00');
    return {id:String(row?.id||`window-${index+1}`).slice(0,64),days:days.length?days:[0,1,2,3,4,5,6],start,end};
  });
}
function zonedParts(date=new Date(),timeZone='UTC') {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  } catch {
    return {year:String(date.getFullYear()),month:String(date.getMonth()+1).padStart(2,'0'),day:String(date.getDate()).padStart(2,'0'),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()],hour:String(date.getHours()).padStart(2,'0'),minute:String(date.getMinutes()).padStart(2,'0')};
  }
}
function dayIndexFromParts(parts){return {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday]??0;}
function clockMinutes(value){const [h,m]=String(value||'00:00').split(':').map(Number);return h*60+m;}
function autoInstallWindowMatch(settings=new Date(), maybeDate=null) {
  // Backwards-compatible call shape: autoInstallWindowMatch(settings, date)
  let cfg, date;
  if(settings instanceof Date){date=settings;cfg=getSettings();}else{cfg=settings||getSettings();date=maybeDate instanceof Date?maybeDate:new Date();}
  const updates=cfg.updates||{},tz=cfg.timezone||'UTC',parts=zonedParts(date,tz),day=dayIndexFromParts(parts),minute=Number(parts.hour)*60+Number(parts.minute),windows=normalizeAutoInstallWindows(updates.autoInstallWindows);
  const prevDay=(day+6)%7;
  for(const window of windows){
    const start=clockMinutes(window.start),end=clockMinutes(window.end);
    if(start===end) continue;
    const sameDay=start<end && window.days.includes(day) && minute>=start && minute<end;
    const overnight=start>end && ((window.days.includes(day)&&minute>=start)||(window.days.includes(prevDay)&&minute<end));
    if(sameDay||overnight)return {open:true,window,timeZone:tz,localTime:`${parts.hour}:${parts.minute}`,day};
  }
  return {open:false,window:null,timeZone:tz,localTime:`${parts.hour}:${parts.minute}`,day};
}
function normalizeSettings(settings) {
  const out = settings && typeof settings === 'object' ? settings : defaultSettings();
  out.modules = { ...(out.modules || {}), energy: false, create: false, firewall: false, integrations: false, docker: out.modules?.docker !== false, notifications: out.modules?.notifications !== false, users: out.modules?.users !== false };
  out.dashboardWidgets = (Array.isArray(out.dashboardWidgets) ? out.dashboardWidgets : defaultSettings().dashboardWidgets).filter(x => x !== 'energy');
  if (!out.dashboardWidgets.includes('temperature')) {
    const networkIndex = out.dashboardWidgets.indexOf('network');
    out.dashboardWidgets.splice(networkIndex >= 0 ? networkIndex : Math.min(3, out.dashboardWidgets.length), 0, 'temperature');
  }
  const hidden = new Set(['energy','create','firewall','integrations']);
  out.menuOrder = (Array.isArray(out.menuOrder) ? out.menuOrder : defaultSettings().menuOrder).filter(x => !hidden.has(x));
  if (!out.menuOrder.includes('docker')) {
    const storageIndex=out.menuOrder.indexOf('storage');
    out.menuOrder.splice(storageIndex>=0?storageIndex+1:Math.min(5,out.menuOrder.length),0,'docker');
  }
  for (const key of ['notifications','users','admin']) if (!out.menuOrder.includes(key)) out.menuOrder.push(key);
  if (hidden.has(out.homePage)) out.homePage = 'overview';
  out.language = ['fr','en'].includes(String(out.language || '').toLowerCase()) ? String(out.language).toLowerCase() : 'fr';
  out.updates = { ...(out.updates || {}) };
  out.updates.provider = out.updates.provider === 'legacy' ? 'legacy' : 'ota';
  out.updates.otaChannel = ['stable','beta'].includes(String(out.updates.otaChannel || '').toLowerCase()) ? String(out.updates.otaChannel).toLowerCase() : 'stable';
  out.updates.otaBaseUrl = String(out.updates.otaBaseUrl || OFFICIAL_OTA_BASE_URL).trim().replace(/\/$/, '');
  out.updates.otaPublicKeyFingerprint = String(out.updates.otaPublicKeyFingerprint || '').trim().toLowerCase();
  out.updates.autoInstallEnabled = out.updates.autoInstallEnabled === true;
  out.updates.autoInstallWindows = normalizeAutoInstallWindows(out.updates.autoInstallWindows);
  out.dockerUpdates = out.dockerUpdates && typeof out.dockerUpdates==='object' ? out.dockerUpdates : {};
  out.dockerUpdates.autoCheckEnabled = out.dockerUpdates.autoCheckEnabled === true;
  out.dockerUpdates.checkIntervalHours = Math.max(1,Math.min(168,Number(out.dockerUpdates.checkIntervalHours||12)));
  out.dockerUpdates.notifyOnAvailable = out.dockerUpdates.notifyOnAvailable !== false;
  out.dockerUpdates.scheduledActionsEnabled = out.dockerUpdates.scheduledActionsEnabled === true;
  out.dockerUpdates.maintenanceWindows = (Array.isArray(out.dockerUpdates.maintenanceWindows)&&out.dockerUpdates.maintenanceWindows.length?out.dockerUpdates.maintenanceWindows:[{days:[0,1,2,3,4,5,6],start:'02:00',end:'05:00'}]).slice(0,8).map(normalizeDockerUpdateWindow);
  out.ui = out.ui && typeof out.ui === 'object' ? out.ui : {};
  const widgetKeys=['cpu','memory','storage','temperature','network','machines','health','problems','capacity','backups'];
  const sizeKeys=new Set(['s','m','l','xl']);
  const dl=out.ui.dashboardLayout && typeof out.ui.dashboardLayout==='object' ? out.ui.dashboardLayout : {};
  dl.density=['compact','comfortable','spacious'].includes(dl.density)?dl.density:'comfortable';
  dl.motion=dl.motion!==false;
  dl.machineView=['table','cards','compact'].includes(dl.machineView)?dl.machineView:'cards';
  dl.hidden=Array.isArray(dl.hidden)?[...new Set(dl.hidden.filter(k=>widgetKeys.includes(k)))]:[];
  dl.sizes=dl.sizes&&typeof dl.sizes==='object'?dl.sizes:{};
  for(const k of widgetKeys){if(!sizeKeys.has(dl.sizes[k]))delete dl.sizes[k];}
  out.ui.dashboardLayout=dl;
  const tvKeys=['health','cpu','memory','temperature','network','storage','machines','nodes','alerts','backups'];
  const tv=out.ui.tvStudio&&typeof out.ui.tvStudio==='object'?out.ui.tvStudio:{};
  tv.density=['compact','comfortable','spacious'].includes(tv.density)?tv.density:'comfortable';
  tv.widgets=Array.isArray(tv.widgets)?[...new Set(tv.widgets.filter(k=>tvKeys.includes(k)))]:['health','cpu','memory','temperature','network','storage','machines','alerts'];
  if(!tv.widgets.length)tv.widgets=['health','cpu','memory','temperature'];
  tv.sizes=tv.sizes&&typeof tv.sizes==='object'?tv.sizes:{};
  for(const k of tvKeys){if(!sizeKeys.has(tv.sizes[k]))delete tv.sizes[k];}
  out.ui.tvStudio=tv;
  return out;
}
function getSettings() { return normalizeSettings(deepMerge(defaultSettings(), jsonRead(SETTINGS_FILE, {}))); }
function saveSettings(value) { jsonWrite(SETTINGS_FILE, normalizeSettings(deepMerge(defaultSettings(), value || {}))); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(); }
function audit(req, action, target = '', details = {}, result = 'ok') {
  const session = getSession(req);
  const rows = jsonRead(AUDIT_FILE, []);
  rows.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), user: session?.username || 'system', ip: clientIp(req), action, target, result, details });
  jsonWrite(AUDIT_FILE, rows.slice(0, 2000));
}
function addAuditSystem(action, target = '', details = {}, result = 'ok') {
  const rows = jsonRead(AUDIT_FILE, []);
  rows.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), user: 'system', ip: '', action, target, result, details });
  jsonWrite(AUDIT_FILE, rows.slice(0, 2000));
}
function pveSessionKey(session, serverId) { return `${session?.nonce || 'none'}:${serverId}`; }
function getPveUserSession(session, serverId) {
  const key = pveSessionKey(session, serverId);
  const item = PVE_USER_SESSIONS.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) { PVE_USER_SESSIONS.delete(key); return null; }
  return item;
}
function storePveUserSession(session, serverId, auth) {
  const key = pveSessionKey(session, serverId);
  PVE_USER_SESSIONS.set(key, { ...auth, expiresAt: Date.now() + 90 * 60 * 1000 });
}
function redactIntegration(i) {
  if (!i) return i;
  const o = { ...i };
  for (const k of ['passwordEnc','tokenEnc','apiKeyEnc','secretEnc']) delete o[k];
  o.hasSecret = !!(i.passwordEnc || i.tokenEnc || i.apiKeyEnc || i.secretEnc);
  return o;
}
function encodeForm(obj) {
  return new URLSearchParams(Object.entries(obj || {}).filter(([,v]) => v !== undefined && v !== null && v !== '').map(([k,v]) => [k, String(v)])).toString();
}
function clampNumber(v, min, max, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function taskNodeFromUpid(upid) { const m = String(upid || '').match(/^UPID:([^:]+):/); return m ? m[1] : null; }
function taskIdEncode(upid) { return encodeURIComponent(String(upid || '')); }
function stripAnsi(s) { return String(s || '').replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, ''); }
function sensorPointsFromJson(data) {
  const points=[];
  const walk=(value,path=[])=>{
    if(!value||typeof value!=='object')return;
    for(const [key,v] of Object.entries(value)){
      const next=[...path,key];
      if(/_input$/i.test(key)&&Number.isFinite(Number(v))){
        const c=Number(v);if(c>-40&&c<180)points.push({label:path.join(' / ')||key,key,value:c,path:next.join(' / ')});
      } else if(v&&typeof v==='object') walk(v,next);
    }
  };
  walk(data);return points;
}
function sensorPointsFromText(text) {
  const points=[];let chip='';
  for(const line of String(text||'').split(/\r?\n/)){
    if(line&&!/^\s/.test(line)&&!line.includes(':')){chip=line.trim();continue;}
    const m=line.match(/^\s*([^:]+):\s*\+?(-?\d+(?:[.,]\d+)?)\s*°?C\b/i);
    if(!m)continue;const c=Number(m[2].replace(',','.'));if(Number.isFinite(c)&&c>-40&&c<180)points.push({label:m[1].trim(),key:'text',value:c,path:`${chip} / ${m[1].trim()}`});
  }
  return points;
}
function pickCpuTemperature(points=[]) {
  const exclude=/nvme|drivetemp|drive|ssd|hdd|amdgpu|radeon|gpu|iwlwifi|wifi|battery|pch_/i;
  const usable=points.filter(p=>!exclude.test(String(p.path||'')));
  const preferred=usable.filter(p=>/package id|tctl|tdie|cpu(?: package| temp| temperature)?/i.test(String(p.path||'')));
  const cores=usable.filter(p=>/core\s*\d+|coretemp|k10temp|zenpower|ccd\d*/i.test(String(p.path||'')));
  const source=preferred.length?preferred:cores.length?cores:usable;
  if(!source.length)return {temperatureC:null,readings:[]};
  const hottest=source.reduce((a,b)=>Number(b.value)>Number(a.value)?b:a,source[0]);
  return {temperatureC:Number(Number(hottest.value).toFixed(1)),readings:source.sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,8).map(p=>({label:p.path||p.label,value:Number(Number(p.value).toFixed(1))}))};
}
function temperatureDiagnostic(code,title,detail,action='',severity='warning') {
  return {
    temperatureDiagnosticCode:String(code||'unknown'),
    temperatureDiagnosticTitle:String(title||'Température indisponible'),
    temperatureDiagnosticDetail:String(detail||''),
    temperatureDiagnosticAction:String(action||''),
    temperatureDiagnosticSeverity:String(severity||'warning')
  };
}
let SSH_RUNTIME_SUPPORT = null;
function sshRuntimeSupport() {
  if(SSH_RUNTIME_SUPPORT)return SSH_RUNTIME_SUPPORT;
  const commandPath=name=>{try{return String(execFileSync('/bin/sh',['-lc',`command -v ${name}`],{encoding:'utf8',timeout:1500})).trim();}catch{return '';}};
  SSH_RUNTIME_SUPPORT={ssh:commandPath('ssh'),sshpass:commandPath('sshpass')};
  return SSH_RUNTIME_SUPPORT;
}
function sshSensorIdentity(server) {
  const raw=String(server?.username||'').trim();const [user,realm='pam']=raw.split('@');
  if(!user||realm!=='pam')return {ok:false,error:'Compte PAM requis pour la collecte SSH.',...temperatureDiagnostic(
    'pam-required','Compte PAM requis',
    raw?`Le compte « ${raw} » n’utilise pas le realm PAM. La lecture de lm-sensors se fait en SSH sur le nœud.`:'Aucun compte Proxmox PAM exploitable n’est configuré pour la lecture SSH.',
    'Configure la connexion Proxmox avec un compte de type utilisateur@pam disposant du droit de connexion SSH.'
  )};
  if(!server?.passwordEnc)return {ok:false,error:'Mot de passe Proxmox persistant requis pour la lecture SSH.',...temperatureDiagnostic(
    'password-missing','Mot de passe non enregistré',
    `Le compte ${raw||user+'@pam'} est compatible, mais ProxPanel ne possède pas de mot de passe persistant pour ouvrir la session SSH.`,
    'Modifie la connexion Proxmox dans ProxPanel et enregistre le mot de passe du compte PAM.'
  )};
  try{return {ok:true,user,password:decryptText(server.passwordEnc)};}
  catch{return {ok:false,error:'Le mot de passe enregistré ne peut pas être déchiffré.',...temperatureDiagnostic(
    'password-unreadable','Mot de passe illisible',
    'Le secret enregistré pour cette connexion Proxmox ne peut plus être déchiffré avec la clé maître actuelle.',
    'Réenregistre le mot de passe du compte PAM dans la connexion Proxmox.'
  )};}
}
async function clusterNodeIpMap(server,auth) {
  const cacheKey=String(server?.id||server?.url||'');const cached=NODE_ADDRESS_CACHE.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return {map:new Map(cached.entries),fallbackHost:cached.fallbackHost};
  const out=new Map();
  try{
    const rows=await proxmoxApi(server,'/cluster/status',{auth});
    for(const row of Array.isArray(rows)?rows:[])if(row?.type==='node'&&row?.name&&row?.ip)out.set(String(row.name),String(row.ip));
  }catch{}
  let fallbackHost='';try{fallbackHost=new URL(server.url).hostname;}catch{}
  const result={entries:[...out.entries()],fallbackHost};NODE_ADDRESS_CACHE.set(cacheKey,{...result,expiresAt:Date.now()+NODE_ADDRESS_CACHE_MS});
  return {map:new Map(result.entries),fallbackHost};
}
async function readLmSensorsOverSsh(server,node,host) {
  const identity=sshSensorIdentity(server);
  if(!identity.ok)return {temperatureC:null,temperatureStatus:'unavailable',temperatureError:identity.error,temperatureSource:'lm-sensors',...identity};
  const runtime=sshRuntimeSupport();
  if(!runtime.ssh)return {temperatureC:null,temperatureStatus:'unavailable',temperatureError:'Client OpenSSH absent de l’image ProxPanel.',temperatureSource:'lm-sensors',...temperatureDiagnostic(
    'ssh-client-missing','Client SSH absent',
    'La commande ssh n’est pas disponible dans le conteneur ProxPanel. La température ne peut pas être lue sur le nœud.',
    'Mets à jour/recrée le conteneur avec l’image Docker complète ProxPanel 1.7.0-beta.14 ou plus récente.'
  )};
  if(!runtime.sshpass)return {temperatureC:null,temperatureStatus:'unavailable',temperatureError:'sshpass absent de l’image ProxPanel.',temperatureSource:'lm-sensors',...temperatureDiagnostic(
    'sshpass-missing','Composant SSH incomplet',
    'Le client SSH est présent mais sshpass est absent du conteneur. ProxPanel ne peut pas utiliser le mot de passe PAM configuré.',
    'Mets à jour/recrée le conteneur avec l’image Docker complète ProxPanel 1.7.0-beta.14 ou plus récente.'
  )};
  if(!host)return {temperatureC:null,temperatureStatus:'unavailable',temperatureError:'Adresse du nœud introuvable dans Proxmox.',temperatureSource:'lm-sensors',...temperatureDiagnostic(
    'node-address-missing','Adresse du nœud introuvable',
    `ProxPanel n’a pas pu déterminer l’adresse réseau du nœud ${node||'Proxmox'} depuis /cluster/status.`,
    'Vérifie la configuration réseau/cluster Proxmox et que le nœud remonte bien une adresse IP.'
  )};
  const cacheKey=`${server.id}:${node}:${host}`;const cached=NODE_TEMPERATURE_CACHE.get(cacheKey);
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const knownHosts=path.join(DATA_DIR,'ssh-known-hosts');
  try{
    const {stdout}=await execFileAsync('sshpass',['-e','ssh','-o','BatchMode=no','-o','ConnectTimeout=4','-o','ConnectionAttempts=1','-o','PreferredAuthentications=password,keyboard-interactive','-o','PubkeyAuthentication=no','-o','StrictHostKeyChecking=accept-new','-o',`UserKnownHostsFile=${knownHosts}`,`${identity.user}@${host}`,'LC_ALL=C sensors -j 2>/dev/null || LC_ALL=C sensors'],{env:{...process.env,SSHPASS:identity.password},timeout:6500,maxBuffer:1024*1024});
    let points=[];try{points=sensorPointsFromJson(JSON.parse(String(stdout||'{}')))}catch{points=sensorPointsFromText(stdout)}
    const picked=pickCpuTemperature(points);
    const value=picked.temperatureC==null
      ? {...picked,temperatureStatus:'no-data',temperatureError:'lm-sensors ne remonte aucune température CPU exploitable.',temperatureSource:'lm-sensors',host,...temperatureDiagnostic(
          'no-cpu-sensor','Aucune sonde CPU exploitable',
          `La commande lm-sensors répond sur ${node||host}, mais aucune température CPU reconnue n’a été trouvée dans sa sortie.`,
          'Exécute « sensors » directement sur le nœud et vérifie que coretemp (Intel) ou k10temp/zenpower (AMD) remonte une température CPU.'
        )}
      : {...picked,temperatureStatus:'ok',temperatureError:'',temperatureSource:'lm-sensors',host,...temperatureDiagnostic('ok','Température disponible','Lecture lm-sensors opérationnelle.','', 'ok')};
    NODE_TEMPERATURE_CACHE.set(cacheKey,{value,expiresAt:Date.now()+NODE_TEMPERATURE_CACHE_MS});return value;
  }catch(e){
    const raw=String(e?.stderr||e?.message||e||'').trim();
    const msg=raw.split(/\r?\n/).filter(Boolean).slice(-2).join(' · ');
    let diag;
    if(e?.code==='ENOENT')diag=temperatureDiagnostic('ssh-component-missing','Composant SSH absent','Le processus de collecte SSH ne peut pas être lancé dans le conteneur ProxPanel.','Mets à jour/recrée le conteneur avec l’image Docker complète ProxPanel 1.7.0-beta.14 ou plus récente.');
    else if(/permission denied|authentication failed|access denied/i.test(raw))diag=temperatureDiagnostic('ssh-auth-failed','Authentification SSH refusée',`Le nœud ${node||host} répond, mais refuse l’authentification du compte ${identity.user}@pam.`,'Vérifie le mot de passe enregistré dans ProxPanel et que ce compte PAM peut ouvrir une session SSH sur le nœud.');
    else if(/sensors:\s*(not found|command not found)|command not found.*sensors|sensors.*command not found|no such file or directory.*sensors/i.test(raw))diag=temperatureDiagnostic('lm-sensors-missing','lm-sensors absent du nœud',`La connexion SSH vers ${node||host} fonctionne, mais la commande « sensors » n’est pas disponible.`,'Installe le paquet lm-sensors sur ce nœud Proxmox puis exécute sensors-detect si nécessaire.');
    else if(/connection timed out|operation timed out|no route to host|network is unreachable|connection refused|could not resolve hostname|name or service not known|connection reset|connection closed/i.test(raw))diag=temperatureDiagnostic('node-unreachable','Nœud injoignable en SSH',`ProxPanel n’arrive pas à ouvrir une connexion SSH vers ${node||host} (${host}).`,'Vérifie que le nœud est joignable depuis le conteneur ProxPanel, que SSH écoute sur le port 22 et qu’aucun pare-feu ne bloque la connexion.');
    else diag=temperatureDiagnostic('ssh-read-error','Erreur de lecture lm-sensors',msg||`La lecture SSH de lm-sensors sur ${node||host} a échoué.`,'Ouvre le détail du nœud et vérifie la connectivité SSH ainsi que la commande « sensors » directement sur Proxmox.');
    const value={temperatureC:null,temperatureStatus:'error',temperatureError:msg||diag.temperatureDiagnosticDetail,temperatureSource:'lm-sensors',host,...diag};
    NODE_TEMPERATURE_CACHE.set(cacheKey,{value,expiresAt:Date.now()+NODE_TEMPERATURE_CACHE_MS});return value;
  }
}
async function enrichNodeTemperatures(server,auth,dashboard) {
  const nodes=dashboard?.nodes||[];if(!nodes.length)return dashboard;
  if (DEMO_MODE && server?.demo) {
    dashboard.nodes=nodes.map(n=>({
      ...n,
      temperatureC:demoTemperatureForNode(n.node),
      temperatureDiagnosticCode:'ok',
      temperatureDiagnosticTitle:'Température disponible',
      temperatureDiagnosticDetail:'Valeur simulée pour la démonstration publique.',
      temperatureDiagnosticAction:''
    }));
    const temps=dashboard.nodes.map(n=>Number(n.temperatureC)).filter(Number.isFinite);
    dashboard.metrics=dashboard.metrics||{};
    dashboard.metrics.temperatureMaxC=temps.length?Number(Math.max(...temps).toFixed(1)):null;
    dashboard.metrics.temperatureAvgC=temps.length?Number((temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1)):null;
    dashboard.metrics.temperatureAvailableNodes=temps.length;
    return dashboard;
  }
  const {map,fallbackHost}=await clusterNodeIpMap(server,auth);
  const rows=await Promise.all(nodes.map(async n=>{
    const host=map.get(String(n.node))||(nodes.length===1?fallbackHost:'');
    return {node:n.node,...await readLmSensorsOverSsh(server,n.node,host)};
  }));
  const by=new Map(rows.map(r=>[String(r.node),r]));
  dashboard.nodes=nodes.map(n=>({...n,...(by.get(String(n.node))||{})}));
  const temps=dashboard.nodes.map(n=>Number(n.temperatureC)).filter(Number.isFinite);
  dashboard.metrics=dashboard.metrics||{};
  dashboard.metrics.temperatureMaxC=temps.length?Number(Math.max(...temps).toFixed(1)):null;
  dashboard.metrics.temperatureAvgC=temps.length?Number((temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1)):null;
  dashboard.metrics.temperatureAvailableNodes=temps.length;
  return dashboard;
}

function getMasterKey() {
  if (process.env.APP_MASTER_KEY) return crypto.createHash('sha256').update(process.env.APP_MASTER_KEY).digest();
  if (!fs.existsSync(MASTER_KEY_FILE)) fs.writeFileSync(MASTER_KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(MASTER_KEY_FILE, 'utf8').trim(), 'hex');
}
const MASTER_KEY = getMasterKey();

function encryptText(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}
function decryptText(payload) {
  const [ivB64, tagB64, dataB64] = String(payload || '').split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function ensureDemoModeSeed() {
  if (!DEMO_MODE) return;
  const pw=hashPassword(DEMO_PASSWORD);
  const createdAt='2026-09-18T00:00:00.000Z';
  const user={
    id:'demo-user',username:DEMO_USERNAME,displayName:'Compte Démo',email:DEMO_EMAIL,
    role:'admin',permissions:['*'],active:true,salt:pw.salt,hash:pw.hash,createdAt,lastLoginAt:'',
    totpEnabled:false,totpSecretEnc:'',recoveryCodeHashes:[]
  };
  jsonWrite(USERS_FILE,[user]);
  jsonWrite(CONFIG_FILE,{admin:{username:DEMO_USERNAME,email:DEMO_EMAIL,salt:pw.salt,hash:pw.hash,createdAt}});
  const settings=defaultSettings();
  settings.branding={...(settings.branding||{}),subtitle:'PUBLIC DEMO'};
  settings.modules={...(settings.modules||{}),create:false,firewall:false};
  settings.language='fr';
  jsonWrite(SETTINGS_FILE,settings);
  jsonWrite(SERVERS_FILE,[{
    id:'demo-pve',name:'Cluster ProxPanel Demo',url:'https://demo-pve.local:8006',
    username:'demo@pve',authMode:'demo',demo:true,allowSelfSigned:false,certFingerprint:'',
    createdAt,status:'online',lastSeen:new Date().toISOString(),lastError:null,pveVersion:'9.0.3',wol:null
  }]);
  jsonWrite(INTEGRATIONS_FILE,[{
    id:'demo-portainer',type:'portainer',name:'Portainer CE · Démo',url:'https://portainer.demo.local',
    username:'',statusPageSlug:'',allowSelfSigned:false,enabled:true,createdAt,
    lastStatus:'ok',lastTestAt:new Date().toISOString(),lastError:'',
    portainerVersion:'2.27.1',portainerEdition:'Community Edition',
    environmentCount:2,supportedDockerCount:2,demo:true
  }]);
}
ensureDemoModeSeed();
function safeEqualHex(a, b) {
  try {
    const A = Buffer.from(a, 'hex');
    const B = Buffer.from(b, 'hex');
    return A.length === B.length && crypto.timingSafeEqual(A, B);
  } catch { return false; }
}

const ROLE_PERMISSIONS = {
  admin: ['*'],
  operator: ['dashboard.view','machines.view','machines.control','console.use','backups.run','tasks.manage','pve.updates','audit.view'],
  viewer: ['dashboard.view','machines.view']
};
function defaultPermissionsForRole(role='viewer') { return [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer)]; }
function panelUsers(config=jsonRead(CONFIG_FILE,{})) {
  let rows=jsonRead(USERS_FILE,[]);
  if ((!Array.isArray(rows) || !rows.length) && config?.admin?.username && config.admin.salt && config.admin.hash) {
    rows=[{id:crypto.randomUUID(),username:config.admin.username,displayName:config.admin.username,email:String(config.admin.email||''),role:'admin',permissions:['*'],active:true,salt:config.admin.salt,hash:config.admin.hash,createdAt:config.admin.createdAt||new Date().toISOString(),totpEnabled:false,totpSecretEnc:'',recoveryCodeHashes:[]}];
    jsonWrite(USERS_FILE,rows);
  }
  return Array.isArray(rows)?rows:[];
}
function savePanelUsers(rows){jsonWrite(USERS_FILE,(rows||[]).slice(0,200));}
function publicPanelUser(u){return {id:u.id,username:u.username,displayName:u.displayName||u.username,email:String(u.email||''),role:u.role||'viewer',permissions:Array.isArray(u.permissions)?u.permissions:defaultPermissionsForRole(u.role),active:u.active!==false,totpEnabled:!!u.totpEnabled,recoveryCodesRemaining:Array.isArray(u.recoveryCodeHashes)?u.recoveryCodeHashes.length:0,createdAt:u.createdAt||'',lastLoginAt:u.lastLoginAt||''};}
function userHasPermission(user,perm){if(!user||user.active===false)return false;const perms=Array.isArray(user.permissions)&&user.permissions.length?user.permissions:defaultPermissionsForRole(user.role);return perms.includes('*')||perms.includes(perm);}
function base32Encode(buf){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';for(const byte of buf){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=alphabet[(value<<(5-bits))&31];return out;}
function base32Decode(str){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out=[];for(const ch of String(str||'').toUpperCase().replace(/[^A-Z2-7]/g,'')){const idx=alphabet.indexOf(ch);if(idx<0)continue;value=(value<<5)|idx;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
function totpCode(secret,counter){const key=base32Decode(secret);const b=Buffer.alloc(8);let n=BigInt(counter);for(let i=7;i>=0;i--){b[i]=Number(n&255n);n>>=8n;}const h=crypto.createHmac('sha1',key).update(b).digest();const o=h[h.length-1]&15;const bin=((h[o]&127)<<24)|((h[o+1]&255)<<16)|((h[o+2]&255)<<8)|(h[o+3]&255);return String(bin%1000000).padStart(6,'0');}
function verifyTotp(secret,code,window=1){const clean=String(code||'').replace(/\D/g,'');if(clean.length!==6)return false;const step=Math.floor(Date.now()/30000);for(let i=-window;i<=window;i++)if(totpCode(secret,step+i)===clean)return true;return false;}
function validAccountEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())&&String(value||'').trim().length<=254;}
function maskEmail(value){const email=String(value||'').trim(),i=email.indexOf('@');if(i<1)return '';const local=email.slice(0,i),domain=email.slice(i+1);return `${local.slice(0,Math.min(2,local.length))}${local.length>2?'***':'*'}@${domain}`;}
function normalizeRecoveryCode(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function hashRecoveryCode(userId,value){return crypto.createHmac('sha256',MASTER_KEY).update(`${userId}:${normalizeRecoveryCode(value)}`).digest('hex');}
function generateRecoveryCodes(count=10){const out=[];for(let i=0;i<count;i++){const raw=crypto.randomBytes(8).toString('hex').toUpperCase();out.push(`${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}`);}return out;}
function makeQrSvg(value){const qr=new QRCode(0,QRErrorCorrectLevel.M);qr.addData(String(value));qr.make();const n=qr.getModuleCount(),quiet=4,size=n+quiet*2,parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR Code TOTP">`,`<rect width="${size}" height="${size}" fill="#fff"/>`];for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))parts.push(`<rect x="${c+quiet}" y="${r+quiet}" width="1" height="1" fill="#000"/>`);parts.push('</svg>');return parts.join('');}
function email2faKey(userId){return String(userId||'');}
function hashEmail2faCode(userId,code){return crypto.createHmac('sha256',MASTER_KEY).update(`${userId}:${String(code||'')}`).digest('hex');}
function safeEqualText(a,b){try{const A=Buffer.from(String(a||''));const B=Buffer.from(String(b||''));return A.length===B.length&&crypto.timingSafeEqual(A,B);}catch{return false;}}
function emailRecoveryState(user){const cfg=getSettings().alerts?.smtp||{};return {available:!!(user&&validAccountEmail(user.email)&&cfg.enabled),emailMasked:maskEmail(user?.email||''),mailConfigured:!!cfg.enabled};}
function loginAttemptKey(req,username){return `${clientIp(req)}|${String(username||'').toLowerCase()}`;}
function checkLoginAllowed(req,username){const row=LOGIN_ATTEMPTS.get(loginAttemptKey(req,username));if(!row)return true;if(row.blockedUntil&&row.blockedUntil>Date.now())return false;if(row.blockedUntil&&row.blockedUntil<=Date.now())LOGIN_ATTEMPTS.delete(loginAttemptKey(req,username));return true;}
function recordLoginFailure(req,username){const k=loginAttemptKey(req,username),now=Date.now(),old=LOGIN_ATTEMPTS.get(k)||{count:0,firstAt:now};const within=now-old.firstAt<15*60*1000;const count=within?old.count+1:1;LOGIN_ATTEMPTS.set(k,{count,firstAt:within?old.firstAt:now,blockedUntil:count>=5?now+15*60*1000:0});}
function clearLoginFailures(req,username){LOGIN_ATTEMPTS.delete(loginAttemptKey(req,username));}
function originAllowed(req){if(['GET','HEAD','OPTIONS'].includes(req.method||'GET'))return true;const origin=req.headers.origin;if(!origin)return true;try{const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();return new URL(origin).host===host;}catch{return false;}}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function base64url(input) { return Buffer.from(input).toString('base64url'); }
function signSessionPayload(payload) { return crypto.createHmac('sha256', MASTER_KEY).update(payload).digest('base64url'); }
function getSession(req) {
  const token = parseCookies(req).proxpanel_session;
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.', 2);
  const expected = signSessionPayload(payload);
  try {
    const A = Buffer.from(sig); const B = Buffer.from(expected);
    if (A.length !== B.length || !crypto.timingSafeEqual(A, B)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.username || Number(data.expires || 0) < Date.now()) return null;
    const user=panelUsers().find(u=>u.id===data.userId||u.username===data.username);
    if(!user||user.active===false)return null;
    return {...data,userId:user.id,role:user.role||'viewer',permissions:Array.isArray(user.permissions)?user.permissions:defaultPermissionsForRole(user.role)};
  } catch { return null; }
}
function setSession(req,res,user) {
  const username=typeof user==='string'?user:user.username;
  const userId=typeof user==='object'?user.id:'';
  const role=typeof user==='object'?(user.role||'viewer'):'viewer';
  const permissions=typeof user==='object'?(user.permissions||defaultPermissionsForRole(role)):defaultPermissionsForRole(role);
  const payload = base64url(JSON.stringify({ username,userId,role,permissions,issued:Date.now(),expires: Date.now() + SESSION_TTL_MS, nonce: crypto.randomBytes(12).toString('hex') }));
  const token = `${payload}.${signSessionPayload(payload)}`;
  const secure=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'||!!req.socket?.encrypted;
  res.setHeader('Set-Cookie', `proxpanel_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}${secure?'; Secure':''}`);
}
function clearSession(req, res) {
  const secure=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'||!!req.socket?.encrypted;
  res.setHeader('Set-Cookie', `proxpanel_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);
}
function sendJson(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  const acceptEncoding = String(res.req?.headers?.['accept-encoding'] || '');
  if (payload.length >= 1024 && /(?:^|[,\s])gzip(?:[,\s]|$)/i.test(acceptEncoding)) {
    const gz = zlib.gzipSync(payload, { level: 5 });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': gz.length, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Cache-Control': 'no-store' });
    return res.end(gz);
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': payload.length, 'Cache-Control': 'no-store' });
  res.end(payload);
}
function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

function parseSemver(value) {
  const m = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) return null;
  return { core:[Number(m[1]), Number(m[2]), Number(m[3])], prerelease:m[4] ? m[4].split('.') : [] };
}
function compareSemver(a, b) {
  const A = parseSemver(a), B = parseSemver(b);
  if (!A || !B) throw new Error('Version SemVer invalide.');
  for (let i = 0; i < 3; i++) if (A.core[i] !== B.core[i]) return A.core[i] > B.core[i] ? 1 : -1;
  if (!A.prerelease.length && !B.prerelease.length) return 0;
  if (!A.prerelease.length) return 1;
  if (!B.prerelease.length) return -1;
  const len=Math.max(A.prerelease.length,B.prerelease.length);
  for(let i=0;i<len;i++){
    const av=A.prerelease[i], bv=B.prerelease[i];
    if(av===undefined)return -1; if(bv===undefined)return 1; if(av===bv)continue;
    const an=/^\d+$/.test(av), bn=/^\d+$/.test(bv);
    if(an&&bn)return Number(av)>Number(bv)?1:-1;
    if(an&&!bn)return -1; if(!an&&bn)return 1;
    return av>bv?1:-1;
  }
  return 0;
}
function normalizeUpdateChannel(value, fallback='stable') {
  const channel=String(value||'').trim().toLowerCase();
  return channel==='beta'||channel==='stable'?channel:fallback;
}
function installedVersionType(version=APP_VERSION) {
  const parsed=parseSemver(version);
  return parsed&&parsed.prerelease.length?'beta':'stable';
}
function releaseAllowedForUpdateChannel(version, selectedChannel, declaredChannel='') {
  const parsed=parseSemver(version);
  if(!parsed)return false;
  const selected=normalizeUpdateChannel(selectedChannel);
  const declared=String(declaredChannel||'').trim().toLowerCase();
  const isStable=parsed.prerelease.length===0;
  const isBeta=!isStable&&String(parsed.prerelease[0]||'').toLowerCase()==='beta';
  if(selected==='stable')return isStable&&(!declared||declared==='stable');
  // Le canal beta accepte les beta et les futures versions stables, mais pas alpha/rc.
  return (isStable||isBeta)&&(!declared||declared==='stable'||declared==='beta');
}
function releaseVersion(releaseName) {
  if (!releaseName) return null;
  const pkg = jsonRead(path.join(RELEASES_DIR, releaseName, 'package.json'), null);
  return pkg?.version || null;
}
function getRuntimeState() {
  return jsonRead(RUNTIME_STATE_FILE, { currentRelease: `v${APP_VERSION}`, previousRelease: null });
}
function getUpdateStatus() {
  const runtime = getRuntimeState();
  const history = jsonRead(UPDATE_HISTORY_FILE, []);
  const previousVersion = releaseVersion(runtime.previousRelease);
  return {
    currentVersion: APP_VERSION,
    bootstrapVersion: BOOTSTRAP_VERSION,
    currentRelease: runtime.currentRelease || `v${APP_VERSION}`,
    previousRelease: runtime.previousRelease || null,
    rollbackVersion: previousVersion,
    rollbackAvailable: !!(runtime.previousRelease && previousVersion && fs.existsSync(path.join(RELEASES_DIR, runtime.previousRelease))),
    maxZipSizeMiB: Math.round(MAX_UPDATE_BYTES / 1024 / 1024),
    history: history.slice(0, 12)
  };
}
function addUpdateHistory(entry) {
  const history = jsonRead(UPDATE_HISTORY_FILE, []);
  history.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  jsonWrite(UPDATE_HISTORY_FILE, history.slice(0, 100));
}
function receiveRawZip(req, destination) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared && declared > MAX_UPDATE_BYTES) return reject(new Error(`ZIP trop volumineux (maximum ${Math.round(MAX_UPDATE_BYTES / 1024 / 1024)} Mo).`));
    const out = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    const hash = crypto.createHash('sha256');
    let size = 0, failed = false;
    const fail = err => {
      if (failed) return;
      failed = true;
      out.destroy();
      try { fs.rmSync(destination, { force: true }); } catch {}
      reject(err);
    };
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_UPDATE_BYTES) return fail(new Error(`ZIP trop volumineux (maximum ${Math.round(MAX_UPDATE_BYTES / 1024 / 1024)} Mo).`));
      hash.update(chunk);
      if (!out.write(chunk)) req.pause(), out.once('drain', () => req.resume());
    });
    req.on('end', () => {
      if (failed) return;
      out.end(() => {
        if (size < 4) return fail(new Error('Fichier ZIP vide ou invalide.'));
        try {
          const fd = fs.openSync(destination, 'r');
          const magic = Buffer.alloc(4); fs.readSync(fd, magic, 0, 4, 0); fs.closeSync(fd);
          if (!(magic[0] === 0x50 && magic[1] === 0x4b)) return fail(new Error('Le fichier envoyé n’est pas un ZIP valide.'));
        } catch (e) { return fail(e); }
        resolve({ size, sha256: hash.digest('hex') });
      });
    });
    req.on('error', fail);
    out.on('error', fail);
  });
}
function readZipCentralDirectory(zipPath) {
  const stat = fs.statSync(zipPath);
  if (!stat.isFile() || stat.size < 22) throw new Error('ZIP vide ou invalide.');
  const fd = fs.openSync(zipPath, 'r');
  try {
    const tailLen = Math.min(stat.size, 22 + 0xffff);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, stat.size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Fin de répertoire ZIP introuvable.');
    const diskNo = tail.readUInt16LE(eocd + 4);
    const centralDisk = tail.readUInt16LE(eocd + 6);
    const entriesOnDisk = tail.readUInt16LE(eocd + 8);
    const totalEntries = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (diskNo !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) throw new Error('Les archives ZIP multi-disques ne sont pas prises en charge.');
    if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 n’est pas pris en charge pour les mises à jour ProxPanel.');
    if (!totalEntries || totalEntries > 5000) throw new Error('Structure ZIP invalide ou trop volumineuse.');
    if (centralSize > 64 * 1024 * 1024 || centralOffset + centralSize > stat.size) throw new Error('Répertoire central ZIP invalide.');
    const central = Buffer.alloc(centralSize);
    fs.readSync(fd, central, 0, centralSize, centralOffset);
    const entries = [];
    const seen = new Set();
    let pos = 0;
    let totalUncompressed = 0;
    for (let i = 0; i < totalEntries; i++) {
      if (pos + 46 > central.length || central.readUInt32LE(pos) !== 0x02014b50) throw new Error('Répertoire central ZIP corrompu.');
      const versionMadeBy = central.readUInt16LE(pos + 4);
      const flags = central.readUInt16LE(pos + 8);
      const method = central.readUInt16LE(pos + 10);
      const uncompressedSize = central.readUInt32LE(pos + 24);
      const nameLen = central.readUInt16LE(pos + 28);
      const extraLen = central.readUInt16LE(pos + 30);
      const commentLen = central.readUInt16LE(pos + 32);
      const externalAttrs = central.readUInt32LE(pos + 38);
      const end = pos + 46 + nameLen + extraLen + commentLen;
      if (!nameLen || end > central.length) throw new Error('Entrée ZIP invalide.');
      const name = central.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
      if (name.includes('\ufffd')) throw new Error('Nom de fichier ZIP invalide.');
      if (name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new Error(`Chemin interdit dans le ZIP : ${name}`);
      const normalized = path.posix.normalize(name);
      if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error(`Traversal détecté dans le ZIP : ${name}`);
      if (seen.has(name)) throw new Error(`Entrée ZIP dupliquée : ${name}`);
      seen.add(name);
      if (flags & 0x0001) throw new Error(`Les entrées ZIP chiffrées sont interdites : ${name}`);
      if (![0, 8].includes(method)) throw new Error(`Méthode de compression ZIP non prise en charge (${method}) : ${name}`);
      const creatorOs = (versionMadeBy >> 8) & 0xff;
      const unixMode = (externalAttrs >>> 16) & 0xffff;
      if (creatorOs === 3 && (unixMode & 0o170000) === 0o120000) throw new Error(`Les liens symboliques sont interdits dans les ZIP de mise à jour : ${name}`);
      totalUncompressed += uncompressedSize;
      if (totalUncompressed > 500 * 1024 * 1024) throw new Error('Contenu décompressé trop volumineux (maximum 500 Mo).');
      entries.push({ name, uncompressedSize, method });
      pos = end;
    }
    if (!entries.some(entry => entry.name === 'release.json')) throw new Error('Le ZIP ne contient pas release.json à sa racine.');
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}
function inspectUpdateZip(zipPath) {
  try {
    return readZipCentralDirectory(zipPath).map(entry => entry.name);
  } catch (e) {
    throw new Error(`ZIP illisible : ${String(e.message || e).trim()}`);
  }
}
function releaseChannelFromVersion(version) {
  const parsed = parseSemver(version);
  if (!parsed) throw new Error('Version du package invalide : SemVer attendu.');
  return parsed.prerelease.length ? 'beta' : 'stable';
}
function readUpdateManifest(zipPath) {
  let raw;
  try { raw = execFileSync('busybox', ['unzip', '-p', zipPath, 'release.json'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }); }
  catch { throw new Error('Impossible de lire release.json.'); }
  let release;
  try { release = JSON.parse(raw); } catch { throw new Error('release.json contient un JSON invalide.'); }
  if (String(release.product || '').toLowerCase() !== 'proxpanel') throw new Error('release.json ne correspond pas au produit ProxPanel.');
  if (!parseSemver(release.version)) throw new Error('release.json : version SemVer invalide.');
  const requiredStrings = ['title', 'summary', 'min_supported_version'];
  for (const key of requiredStrings) if (!String(release[key] || '').trim()) throw new Error(`release.json : champ ${key} obligatoire.`);
  for (const key of ['improvements', 'fixes', 'notes']) if (!Array.isArray(release[key])) throw new Error(`release.json : ${key} doit être un tableau.`);
  if (release.breaking_changes !== undefined && !Array.isArray(release.breaking_changes)) throw new Error('release.json : breaking_changes doit être un tableau.');
  if (!parseSemver(release.min_supported_version)) throw new Error('release.json : min_supported_version doit être une version SemVer valide.');
  const rollout = Number(release.rollout);
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) throw new Error('release.json : rollout doit être compris entre 0 et 100.');
  if (typeof release.mandatory !== 'boolean') throw new Error('release.json : mandatory doit être un booléen.');
  if (release.restart_required !== undefined && typeof release.restart_required !== 'boolean') throw new Error('release.json : restart_required doit être un booléen.');
  if (compareSemver(APP_VERSION, release.min_supported_version) < 0) throw new Error(`Cette mise à jour nécessite ProxPanel ${release.min_supported_version} minimum.`);
  if (compareSemver(release.version, APP_VERSION) <= 0) throw new Error(`Le package ${release.version} n’est pas plus récent que la version installée ${APP_VERSION}.`);
  return {
    ...release,
    schema: 2,
    product: 'proxpanel',
    channel: releaseChannelFromVersion(release.version),
    notes: release.notes.slice(0, 100),
    improvements: release.improvements.slice(0, 100),
    fixes: release.fixes.slice(0, 100),
    breaking_changes: Array.isArray(release.breaking_changes) ? release.breaking_changes.slice(0, 100) : [],
    rollout
  };
}
function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
function validateExtractedRelease(dir, manifest) {
  for (const required of ['server.js', 'package.json', path.join('public', 'index.html')]) {
    if (!fs.existsSync(path.join(dir, required))) throw new Error(`Package incomplet : ${required} manquant.`);
  }
  const pkg = jsonRead(path.join(dir, 'package.json'), null);
  if (!pkg || pkg.name !== 'proxpanel' || pkg.version !== manifest.version) throw new Error('package.json ne correspond pas au manifeste de mise à jour.');
  const jsFiles = walkFiles(dir).filter(file => file.endsWith('.js'));
  for (const file of jsFiles) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', timeout: 15000 }); }
    catch (e) { throw new Error(`JavaScript invalide dans ${path.relative(dir, file)} : ${String(e.stderr || e.message).trim()}`); }

    // Syntax validation alone does not detect a missing local require().
    // Verify every static relative dependency before switching the runtime symlink.
    const source=fs.readFileSync(file,'utf8');
    for(const match of source.matchAll(/require\((['"])(\.\.?\/[^'"]+)\1\)/g)){
      const request=match[2],base=path.resolve(path.dirname(file),request);
      const candidates=[base,`${base}.js`,`${base}.json`,path.join(base,'index.js')];
      if(!candidates.some(candidate=>fs.existsSync(candidate))){
        throw new Error(`Package incomplet : dépendance locale ${request} manquante pour ${path.relative(dir,file)}.`);
      }
    }
  }
}
function createConfigBackup(label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = String(label || 'update').replace(/[^0-9A-Za-z._-]/g, '_');
  const dir = path.join(UPDATE_BACKUP_DIR, `${stamp}-${safeLabel}`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(DATA_DIR)) fs.cpSync(DATA_DIR, path.join(dir, 'data'), { recursive: true, force: false });
  return dir;
}
function switchCurrentRelease(releaseName) {
  const releaseDir = path.join(RELEASES_DIR, releaseName);
  if (!fs.existsSync(path.join(releaseDir, 'server.js'))) throw new Error('Release cible invalide.');
  const tmpLink = `${CURRENT_LINK}.new-${crypto.randomUUID()}`;
  fs.symlinkSync(path.relative(RUNTIME_DIR, releaseDir), tmpLink, 'dir');
  fs.renameSync(tmpLink, CURRENT_LINK);
}
function installUpdateZip(zipPath, uploadInfo = {}) {
  inspectUpdateZip(zipPath);
  const manifest = readUpdateManifest(zipPath);
  const releaseName = `v${manifest.version}`;
  const releaseDir = path.join(RELEASES_DIR, releaseName);
  if (fs.existsSync(releaseDir)) throw new Error(`La release ${releaseName} existe déjà. Utilise le rollback si nécessaire.`);

  const stage = path.join(RELEASES_DIR, `.staging-${crypto.randomUUID()}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    execFileSync('busybox', ['unzip', '-q', '-o', zipPath, '-d', stage], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    validateExtractedRelease(stage, manifest);
    const backupDir = createConfigBackup(`before-${releaseName}`);
    fs.renameSync(stage, releaseDir);
    const runtime = getRuntimeState();
    const previousRelease = runtime.currentRelease || `v${APP_VERSION}`;
    switchCurrentRelease(releaseName);
    jsonWrite(RUNTIME_STATE_FILE, {
      ...runtime,
      currentRelease: releaseName,
      previousRelease,
      updatedAt: new Date().toISOString(),
      lastPackageSha256: uploadInfo.sha256 || null
    });
    addUpdateHistory({
      action: uploadInfo.automatic ? 'auto-install' : 'install', fromVersion: APP_VERSION, toVersion: manifest.version,
      packageSha256: uploadInfo.sha256 || null, packageSize: uploadInfo.size || null,
      backupDir: path.basename(backupDir), notes: Array.isArray(manifest.notes) ? manifest.notes.slice(0, 20) : []
    });
    return { manifest, releaseName, backupDir: path.basename(backupDir) };
  } catch (e) {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    throw e;
  }
}
function rollbackUpdate() {
  const runtime = getRuntimeState();
  const target = runtime.previousRelease;
  if (!target || !fs.existsSync(path.join(RELEASES_DIR, target))) throw new Error('Aucune version précédente disponible pour rollback.');
  const fromRelease = runtime.currentRelease || `v${APP_VERSION}`;
  const targetVersion = releaseVersion(target);
  if (!targetVersion) throw new Error('La release précédente est invalide.');
  const backupDir = createConfigBackup(`before-rollback-${target}`);
  switchCurrentRelease(target);
  jsonWrite(RUNTIME_STATE_FILE, {
    ...runtime,
    currentRelease: target,
    previousRelease: fromRelease,
    updatedAt: new Date().toISOString()
  });
  addUpdateHistory({ action: 'rollback', fromVersion: APP_VERSION, toVersion: targetVersion, backupDir: path.basename(backupDir) });
  return { targetVersion, targetRelease: target, backupDir: path.basename(backupDir) };
}

function sanitizeServer(s) {
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    username: s.username || '',
    authMode: s.authMode || (s.passwordEnc ? 'password' : 'interactive'),
    hasBackgroundAuth: !!(s.passwordEnc || s.apiTokenSecretEnc),
    apiTokenId: s.apiTokenId || '',
    allowSelfSigned: !!s.allowSelfSigned,
    certFingerprint: s.certFingerprint || '',
    certificatePinnedAt: s.certificatePinnedAt || null,
    createdAt: s.createdAt,
    lastSeen: s.lastSeen || null,
    status: s.status || 'unknown',
    lastError: s.lastError || null,
    pveVersion: s.pveVersion || '',
    wol: s.wol || null,
    demo: !!s.demo
  };
}

async function getTlsFingerprint(baseUrl) {
  const u = new URL(baseUrl);
  if (u.protocol !== 'https:') return '';
  const port = Number(u.port || 443);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: u.hostname, port, servername: net.isIP(u.hostname) ? undefined : u.hostname, rejectUnauthorized: false, timeout: 8000 }, () => {
      try {
        const cert = socket.getPeerCertificate(true);
        const fp = String(cert?.fingerprint256 || '').replace(/:/g, '').toUpperCase();
        socket.end();
        if (!fp) return reject(new Error('Impossible de lire l’empreinte TLS du serveur Proxmox.'));
        resolve(fp);
      } catch (e) { socket.destroy(); reject(e); }
    });
    socket.on('timeout', () => socket.destroy(new Error('Timeout TLS')));
    socket.on('error', reject);
  });
}

async function ensureCertificatePin(server) {
  if (!server || !server.allowSelfSigned) return '';
  let u;
  try { u = new URL(server.url); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  const expected = String(server.certFingerprint || '').replace(/:/g, '').toUpperCase();
  const cacheKey = `${server.id || ''}|${server.url}|${expected}`;
  const cached = CERT_PIN_CACHE.get(cacheKey);
  if (cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = (async () => {
    const actual = await getTlsFingerprint(server.url);
    if (expected && expected !== actual) {
      throw new Error(`CERTIFICATE_PIN_MISMATCH: empreinte attendue ${expected}, reçue ${actual}`);
    }
    if (!expected) {
      const rows = jsonRead(SERVERS_FILE, []);
      const row = rows.find(x => x.id === server.id);
      if (row) {
        row.certFingerprint = actual;
        row.certificatePinnedAt = new Date().toISOString();
        jsonWrite(SERVERS_FILE, rows);
        server.certFingerprint = actual;
        server.certificatePinnedAt = row.certificatePinnedAt;
      }
    }
    CERT_PIN_CACHE.set(cacheKey, { value: actual, expiresAt: Date.now() + CERT_PIN_CACHE_MS });
    return actual;
  })();
  CERT_PIN_CACHE.set(cacheKey, { promise, expiresAt: Date.now() + CERT_PIN_CACHE_MS });
  try { return await promise; }
  catch (e) { CERT_PIN_CACHE.delete(cacheKey); throw e; }
}

function formatProxmoxApiErrors(errors) {
  if (!errors || typeof errors !== 'object') return '';
  return Object.entries(errors).map(([key, value]) => {
    const msg = String(value || 'Erreur de validation');
    if (msg.includes('property is not defined in schema')) return `${key}: paramètre non supporté par cette version de Proxmox`;
    if (msg.includes('property is missing')) return `${key}: paramètre requis manquant`;
    return `${key}: ${msg}`;
  }).join(' · ');
}

function measureTcpLatency(baseUrl, timeoutMs = 3000) {
  let u;
  try { u = new URL(baseUrl); } catch { return Promise.reject(new Error('URL Proxmox invalide.')); }
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const socket = net.connect({ host: u.hostname, port });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) return reject(err);
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      resolve(Math.max(1, Math.round(elapsed)));
    };
    socket.setTimeout(timeoutMs, () => finish(new Error('Timeout de latence TCP')));
    socket.once('connect', () => finish());
    socket.once('error', finish);
  });
}

function rawRequest(baseUrl, reqPath, options = {}) {
  return new Promise((resolve, reject) => {
    const base = new URL(baseUrl);
    const lib = base.protocol === 'https:' ? https : http;
    const body = options.body || null;
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (body && !headers['Content-Length']) headers['Content-Length'] = Buffer.byteLength(body);
    const request = lib.request({
      protocol: base.protocol,
      hostname: base.hostname,
      port: base.port || (base.protocol === 'https:' ? 443 : 80),
      path: reqPath,
      method: options.method || 'GET',
      headers,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      timeout: 12000
    }, response => {
      let data = '';
      response.on('data', c => data += c);
      response.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data || '{}'); } catch { parsed = { raw: data }; }
        if (response.statusCode >= 200 && response.statusCode < 300) resolve({ status: response.statusCode, data: parsed });
        else reject(new Error(parsed?.errors ? formatProxmoxApiErrors(parsed.errors) : parsed?.message || `HTTP ${response.statusCode}`));
      });
    });
    request.on('timeout', () => request.destroy(new Error('Timeout de connexion')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}
function rawBufferRequest(baseUrl, reqPath, options = {}) {
  return new Promise((resolve,reject)=>{
    const base=new URL(baseUrl),lib=base.protocol==='https:'?https:http,body=options.body||null;
    const headers={Accept:'application/octet-stream',...(options.headers||{})};
    if(body&&!headers['Content-Length'])headers['Content-Length']=Buffer.byteLength(body);
    const request=lib.request({
      protocol:base.protocol,hostname:base.hostname,port:base.port||(base.protocol==='https:'?443:80),
      path:reqPath,method:options.method||'GET',headers,rejectUnauthorized:options.rejectUnauthorized!==false,timeout:15000
    },response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=b.length;if(bytes<=8*1024*1024)chunks.push(b)});
      response.on('end',()=>{
        const data=Buffer.concat(chunks);
        if(response.statusCode>=200&&response.statusCode<300)return resolve({status:response.statusCode,data,headers:response.headers});
        let message=`HTTP ${response.statusCode}`;try{const parsed=JSON.parse(data.toString('utf8'));message=parsed?.message||message}catch{}
        reject(new Error(message));
      });
    });
    request.on('timeout',()=>request.destroy(new Error('Timeout de connexion')));
    request.on('error',reject);
    if(body)request.write(body);
    request.end();
  });
}
function dockerStreamText(buffer) {
  if(!Buffer.isBuffer(buffer)||!buffer.length)return '';
  let offset=0,out='',framed=false;
  while(offset+8<=buffer.length){
    const stream=buffer[offset],len=buffer.readUInt32BE(offset+4);
    if(![0,1,2,3].includes(stream)||len<0||offset+8+len>buffer.length)break;
    framed=true;out+=buffer.subarray(offset+8,offset+8+len).toString('utf8');offset+=8+len;
  }
  return (framed?out:buffer.toString('utf8')).replace(/\u0000/g,'').slice(-1024*1024);
}

async function proxmoxPasswordLogin(server, username, password, otp = '') {
  await ensureCertificatePin(server);
  const first = await rawRequest(server.url, '/api2/json/access/ticket', {
    method: 'POST', body: encodeForm({ username, password }), rejectUnauthorized: !server.allowSelfSigned,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  let data = first.data?.data;
  if (!data?.ticket) throw new Error('Ticket Proxmox non reçu');
  if (data.NeedTFA) {
    if (!otp) return { needTfa: true, challenge: data.ticket };
    const second = await rawRequest(server.url, '/api2/json/access/ticket', {
      method: 'POST', body: encodeForm({ username, 'tfa-challenge': data.ticket, password: `totp:${otp}` }), rejectUnauthorized: !server.allowSelfSigned,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    data = second.data?.data;
    if (!data?.ticket) throw new Error('Code TOTP refusé ou challenge expiré.');
  }
  return { ticket: data.ticket, csrf: data.CSRFPreventionToken, username, authType: 'ticket' };
}
async function proxmoxLogin(server) {
  await ensureCertificatePin(server);
  if (server.apiTokenSecretEnc && server.apiTokenId && server.username) {
    return { authType: 'token', authorization: `PVEAPIToken=${server.username}!${server.apiTokenId}=${decryptText(server.apiTokenSecretEnc)}`, username: server.username };
  }
  if (!server.passwordEnc) throw new Error('Connexion interactive Proxmox requise pour ce serveur.');
  const key = `${server.id || ''}|${server.username || ''}|${server.passwordEnc}`;
  const cached = PVE_AUTH_CACHE.get(key);
  if (cached?.auth && cached.expiresAt > Date.now()) return cached.auth;
  if (cached?.promise) return cached.promise;
  const promise = proxmoxPasswordLogin(server, server.username, decryptText(server.passwordEnc));
  PVE_AUTH_CACHE.set(key, { promise, expiresAt: Date.now() + PVE_AUTH_CACHE_MS });
  try {
    const auth = await promise;
    if (auth?.ticket && !auth?.needTfa) PVE_AUTH_CACHE.set(key, { auth, expiresAt: Date.now() + PVE_AUTH_CACHE_MS });
    else PVE_AUTH_CACHE.delete(key);
    return auth;
  } catch (e) {
    PVE_AUTH_CACHE.delete(key);
    throw e;
  }
}
async function resolveProxmoxAuth(server, session, preferUser = true) {
  if (DEMO_MODE && server?.demo) return {authType:'demo',username:'demo@pve'};
  if (preferUser && session) {
    const direct = getPveUserSession(session, server.id);
    if (direct) return direct;
  }
  return proxmoxLogin(server);
}
async function proxmoxTicketFromApiToken(server, tokenAuth) {
  // Newer PVE versions can expose a short-lived ticket for an authenticated API
  // token session. vncwebsocket is much more consistent with PVEAuthCookie than
  // with Authorization: PVEAPIToken, so try to mint a cookie ticket first.
  try {
    const res = await rawRequest(server.url, '/api2/json/access/ticket', {
      method: 'GET', rejectUnauthorized: !server.allowSelfSigned,
      headers: { Authorization: tokenAuth.authorization, Accept: 'application/json' }
    });
    const data = res?.data?.data || {};
    if (data.ticket) return { ticket:data.ticket, csrf:data.CSRFPreventionToken||'', username:data.username||server.username||'', authType:'ticket', consoleAuthMode:'ticket-from-api-token' };
  } catch {}
  return null;
}
async function resolveConsoleAuth(server, session) {
  // vncwebsocket requires a valid PVEAuthCookie on many PVE versions. Always
  // prefer a real short-lived user ticket for graphical QEMU consoles.
  if (session) {
    const direct = getPveUserSession(session, server.id);
    if (direct?.ticket) return { ...direct, consoleAuthMode: 'ticket-session' };
  }
  if (server.passwordEnc) {
    const ticket = await proxmoxPasswordLogin(server, server.username, decryptText(server.passwordEnc));
    if (ticket?.needTfa) throw new Error('La console nécessite une authentification Proxmox interactive avec le code TOTP.');
    return { ...ticket, consoleAuthMode: 'ticket-password' };
  }
  const fallback = await proxmoxLogin(server);
  if (fallback?.authType === 'token') {
    const ticket = await proxmoxTicketFromApiToken(server, fallback);
    if (ticket) return ticket;
    throw new Error('Console QEMU : ce serveur est configuré uniquement avec un API Token et Proxmox n’a pas fourni de ticket PVEAuthCookie. Connectez-vous interactivement avec un utilisateur Proxmox ou configurez un mot de passe persistant pour la console.');
  }
  return { ...fallback, consoleAuthMode: 'ticket' };
}
function proxmoxAuthHeaders(auth, method = 'GET') {
  const headers = {};
  if (auth?.authType === 'token' && auth.authorization) headers.Authorization = auth.authorization;
  else if (auth?.ticket) headers.Cookie = `PVEAuthCookie=${auth.ticket}`;
  if (method !== 'GET' && auth?.csrf) headers.CSRFPreventionToken = auth.csrf;
  return headers;
}
async function proxmoxApi(server, apiPath, options = {}) {
  if (DEMO_MODE && server?.demo) return demoProxmoxApi(server,apiPath,options);
  await ensureCertificatePin(server);
  const auth = options.auth || await proxmoxLogin(server);
  const method = options.method || 'GET';
  const headers = proxmoxAuthHeaders(auth, method);
  let body = options.body || null;
  if (body && typeof body !== 'string') {
    body = encodeForm(body);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  const result = await rawRequest(server.url, `/api2/json${apiPath}`, { method, body, headers, rejectUnauthorized: !server.allowSelfSigned });
  return result.data?.data;
}


function receiveRawFile(req, destination, maxBytes = 8 * 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared && declared > maxBytes) return reject(new Error('Fichier trop volumineux.'));
    const out = fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 });
    let size = 0, done = false;
    const fail = err => { if (done) return; done = true; out.destroy(); try { fs.rmSync(destination, { force: true }); } catch {} reject(err); };
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) return fail(new Error('Fichier trop volumineux.')); });
    req.on('error', fail); out.on('error', fail);
    out.on('finish', () => { if (done) return; done = true; resolve({ size }); });
    req.pipe(out);
  });
}

async function proxmoxUploadFile(server, auth, node, storage, content, filename, filePath) {
  await ensureCertificatePin(server);
  const base = new URL(server.url);
  const boundary = `----ProxPanel${crypto.randomBytes(12).toString('hex')}`;
  const safeName = path.basename(String(filename || 'upload.bin')).replace(/[\r\n"]/g, '_');
  const fields = [
    `--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\n${content}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="filename"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  ];
  const pre = Buffer.from(fields.join(''));
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  const stat = fs.statSync(filePath);
  const headers = { ...proxmoxAuthHeaders(auth, 'POST'), 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': pre.length + stat.size + post.length, Accept: 'application/json' };
  const lib = base.protocol === 'https:' ? https : http;
  const reqPath = `/api2/json/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/upload`;
  return new Promise((resolve, reject) => {
    const request = lib.request({ protocol: base.protocol, hostname: base.hostname, port: base.port || (base.protocol === 'https:' ? 443 : 80), path: reqPath, method: 'POST', headers, rejectUnauthorized: !server.allowSelfSigned, timeout: 60 * 60 * 1000 }, response => {
      let data=''; response.on('data',c=>data+=c); response.on('end',()=>{let parsed={};try{parsed=JSON.parse(data||'{}')}catch{parsed={raw:data}};if(response.statusCode>=200&&response.statusCode<300)resolve(parsed?.data);else reject(new Error(parsed?.errors?JSON.stringify(parsed.errors):parsed?.message||`HTTP ${response.statusCode}`));});
    });
    request.on('timeout',()=>request.destroy(new Error('Timeout upload Proxmox'))); request.on('error',reject);
    request.write(pre); const input=fs.createReadStream(filePath); input.on('error',reject); input.on('end',()=>request.end(post)); input.pipe(request,{end:false});
  });
}

function normalizeTimeframe(v) { return ['hour','day','week','month','year','decade'].includes(String(v)) ? String(v) : 'day'; }
function normalizeCf(v) { return String(v).toUpperCase() === 'MAX' ? 'MAX' : 'AVERAGE'; }
function safeInteger(v, min=0, max=Number.MAX_SAFE_INTEGER, fallback=0){ const n=Number(v); return Number.isInteger(n)&&n>=min&&n<=max?n:fallback; }
function cleanConfigBody(body, allow) { const out={}; for(const k of allow) if(body[k]!==undefined&&body[k]!==null&&body[k]!=='') out[k]=body[k]; return out; }


async function findMachineResource(server, auth, type, vmid, nodeHint='') {
  const normalizedType = String(type || '');
  const id = Number(vmid);
  // In multi-node / multi-server views the UI already knows the exact node. Querying it
  // directly avoids resolving the same VMID against the wrong source and also survives a
  // temporarily incomplete /cluster/resources response.
  if (nodeHint) {
    try {
      const status = await proxmoxApi(server, `/nodes/${encodeURIComponent(nodeHint)}/${normalizedType}/${id}/status/current`, { auth });
      return { ...(status || {}), type: normalizedType, vmid: id, node: String(nodeHint), name: status?.name || status?.hostname || `${normalizedType}-${id}` };
    } catch {}
  }
  const resources = await proxmoxApi(server, '/cluster/resources', { auth });
  return (Array.isArray(resources) ? resources : []).find(r => r.type === normalizedType && Number(r.vmid) === id) || null;
}
async function getNextVmid(server, auth) { return Number(await proxmoxApi(server, '/cluster/nextid', { auth })); }
function machineBasePath(machine) { return `/nodes/${encodeURIComponent(machine.node)}/${machine.type}/${machine.vmid}`; }
function buildSpiceVv(data) {
  const d = data || {};
  const lines = ['[virt-viewer]', 'type=spice'];
  if (d.host) lines.push(`host=${d.host}`);
  if (d.proxy) lines.push(`proxy=${d.proxy}`);
  if (d.password) lines.push(`password=${d.password}`);
  if (d.title) lines.push(`title=${d.title}`);
  if (d['tls-port']) lines.push(`tls-port=${d['tls-port']}`);
  if (d.port) lines.push(`port=${d.port}`);
  if (d.ca) lines.push(`ca=${String(d.ca).replace(/\n/g,'\\n')}`);
  if (d['cert-subject']) lines.push(`host-subject=${d['cert-subject']}`);
  lines.push('delete-this-file=1', 'fullscreen=0', 'release-cursor=Ctrl+Alt+R', 'secure-attention=Ctrl+Alt+Ins', 'toggle-fullscreen=Shift+F11');
  return `${lines.join('\n')}\n`;
}

function unixNow() { return Math.floor(Date.now() / 1000); }

function calcRrdHistory(rrdByNode) {
  const buckets = new Map();
  for (const { node, points } of rrdByNode) {
    for (const point of Array.isArray(points) ? points : []) {
      const time = Number(point.time || 0);
      if (!time) continue;
      const key = String(time);
      if (!buckets.has(key)) buckets.set(key, { time, cpuSum: 0, cpuCount: 0, mem: 0, maxmem: 0, net: 0 });
      const b = buckets.get(key);
      if (Number.isFinite(Number(point.cpu))) { b.cpuSum += Number(point.cpu) * 100; b.cpuCount++; }
      b.mem += Number(point.memused ?? point.mem ?? 0);
      b.maxmem += Number(point.memtotal ?? point.maxmem ?? 0);
      // PVE RRD netin/netout are rates in bytes/s when available.
      b.net += Number(point.netin || 0) + Number(point.netout || 0);
    }
  }
  const rows = [...buckets.values()].sort((a,b) => a.time - b.time).slice(-300);
  return {
    cpu: rows.map(x => ({ time: x.time, value: x.cpuCount ? Number((x.cpuSum / x.cpuCount).toFixed(2)) : 0 })),
    memory: rows.map(x => ({ time: x.time, value: x.maxmem ? Number((x.mem / x.maxmem * 100).toFixed(2)) : 0 })),
    network: rows.map(x => ({ time: x.time, value: Number((x.net * 8 / 1_000_000).toFixed(3)) }))
  };
}

function calcStorageRrdHistory(rrdByStorage) {
  const buckets = new Map();
  for (const { points } of rrdByStorage || []) {
    for (const point of Array.isArray(points) ? points : []) {
      const time = Number(point.time || 0); if (!time) continue;
      const used = Number(point.used ?? point.disk ?? 0);
      const total = Number(point.total ?? point.maxdisk ?? 0);
      if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) continue;
      const key=String(time); if(!buckets.has(key))buckets.set(key,{time,used:0,total:0});
      const b=buckets.get(key); b.used+=used; b.total+=total;
    }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time).slice(-300).map(x=>({time:x.time,value:x.total?Number((x.used/x.total*100).toFixed(2)):0}));
}

function parseVmidList(value) {
  const out = new Set();
  String(value || '').split(/[;,\s]+/).forEach(v => { if (/^\d+$/.test(v)) out.add(Number(v)); });
  return out;
}

function calcBackupState(guests, jobs, tasks) {
  const enabled = (Array.isArray(jobs) ? jobs : []).filter(j => String(j.enabled ?? '1') !== '0');
  const allCovered = enabled.some(j => String(j.all || '') === '1');
  const explicit = new Set();
  let poolBasedJobs = 0;
  for (const job of enabled) {
    if (job.pool) poolBasedJobs++;
    for (const id of parseVmidList(job.vmid)) explicit.add(id);
  }
  const excluded = new Set();
  enabled.forEach(j => parseVmidList(j.exclude).forEach(v => excluded.add(v)));
  const protectedIds = new Set();
  for (const guest of guests) {
    const id = Number(guest.vmid);
    if (excluded.has(id)) continue;
    if (allCovered || explicit.has(id)) protectedIds.add(id);
  }
  const unprotected = guests.filter(g => !protectedIds.has(Number(g.vmid))).map(g => ({
    vmid: g.vmid, name: g.name || `${g.type}-${g.vmid}`, type: g.type, node: g.node
  }));
  const backupTasks = (Array.isArray(tasks) ? tasks : []).filter(t => String(t.type || '').toLowerCase() === 'vzdump');
  const completed = backupTasks.filter(t => Number(t.endtime || 0) > 0).sort((a,b) => Number(b.endtime||0)-Number(a.endtime||0));
  return {
    jobs: enabled.map(j => ({ id: j.id || '', storage: j.storage || '', schedule: j.schedule || '', vmid: j.vmid || '', all: j.all || 0, node: j.node || '', mode: j.mode || '', enabled: j.enabled ?? 1 })),
    protectedCount: protectedIds.size,
    unprotectedCount: unprotected.length,
    unprotected,
    poolBasedJobs,
    coveragePartial: poolBasedJobs > 0,
    lastTask: completed[0] ? {
      status: completed[0].status || 'unknown', endtime: completed[0].endtime, starttime: completed[0].starttime,
      node: completed[0].node || '', user: completed[0].user || '', id: completed[0].id || ''
    } : null
  };
}


function parseConfiguredSize(value){
  const m=String(value||'').match(/(?:^|,)size=(\d+(?:\.\d+)?)([KMGTPE]?)(?:i?B)?(?:,|$)/i);if(!m)return 0;
  const pow={K:1,M:2,G:3,T:4,P:5,E:6}[String(m[2]||'').toUpperCase()]||0;return Number(m[1])*1024**pow;
}
function configuredGuestDisks(config,type){
  const rows=[];
  for(const [key,value] of Object.entries(config||{})){
    const isDisk=type==='qemu'?/^(scsi|sata|virtio|ide)\d+$/.test(key):(key==='rootfs'||/^mp\d+$/.test(key));
    if(!isDisk)continue;
    const text=String(value||'');
    if(/media=cdrom/i.test(text)||/^none(?:,|$)/i.test(text)||key.startsWith('unused'))continue;
    const first=text.split(',')[0]||'';
    const storage=first.includes(':')?first.split(':')[0]:'';
    const volume=first.includes(':')?first.slice(first.indexOf(':')+1):first;
    rows.push({
      key,
      bus:key.replace(/\d+$/,''),
      storage,
      volume,
      total:parseConfiguredSize(text),
      raw:text
    });
  }
  return rows.sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
}
function configuredGuestCapacity(config,type){return configuredGuestDisks(config,type).reduce((sum,row)=>sum+Number(row.total||0),0)}
function unwrapGuestFsInfo(raw){
  let cur=raw;
  for(let i=0;i<5;i++){
    if(Array.isArray(cur)) return cur;
    if(cur && typeof cur==='object' && Array.isArray(cur.result)) return cur.result;
    if(cur && typeof cur==='object' && cur.data!==undefined){cur=cur.data;continue;}
    if(cur && typeof cur==='object' && cur.result!==undefined){cur=cur.result;continue;}
    break;
  }
  return [];
}
function guestFsRows(raw){
  const ignored=new Set(['tmpfs','devtmpfs','proc','sysfs','cgroup','cgroup2','overlay','squashfs','nsfs','ramfs','fusectl','debugfs','tracefs','securityfs','pstore','autofs','mqueue','hugetlbfs','configfs']);
  const seen=new Set(),rows=[];
  for(const r of unwrapGuestFsInfo(raw)){
    const total=Number(r?.['total-bytes'] ?? r?.total_bytes ?? r?.total ?? 0);
    const used=Number(r?.['used-bytes'] ?? r?.used_bytes ?? r?.used ?? 0);
    const type=String(r?.type||'').toLowerCase(),mountpoint=String(r?.mountpoint||r?.name||'').trim();
    if(ignored.has(type))continue;
    const sizeKnown=Number.isFinite(total)&&total>0;
    const safeTotal=sizeKnown?total:0;
    const safeUsed=sizeKnown&&Number.isFinite(used)?Math.max(0,Math.min(total,used)):0;
    const free=sizeKnown?Math.max(0,safeTotal-safeUsed):0;
    const usagePct=sizeKnown?Number((safeUsed/safeTotal*100).toFixed(1)):null;
    const disks=(Array.isArray(r?.disk)?r.disk:[]).map(d=>({
      dev:String(d?.dev||''),
      busType:String(d?.['bus-type']||d?.bus_type||''),
      serial:String(d?.serial||''),
      target:Number.isFinite(Number(d?.target))?Number(d.target):null,
      unit:Number.isFinite(Number(d?.unit))?Number(d.unit):null
    }));
    const key=`${mountpoint}|${safeTotal}|${safeUsed}|${type}`;if(seen.has(key))continue;seen.add(key);
    rows.push({mountpoint:mountpoint||'Volume',name:String(r?.name||''),type,total:safeTotal,used:safeUsed,free,usagePct,sizeKnown,disks});
  }
  return rows;
}
function classifyGuestAgentStorageError(message,status=''){
  if(status && status!=='running')return {code:'vm-stopped',label:'VM arrêtée'};
  const msg=String(message||'').toLowerCase();
  if(!msg)return {code:'unavailable',label:'Données filesystem indisponibles'};
  if(msg.includes('not running')||msg.includes('guest agent is not running')||msg.includes('qemu guest agent is not running'))return {code:'agent-stopped',label:'QEMU Guest Agent arrêté'};
  if(msg.includes('not configured')||msg.includes('guest agent is not configured')||msg.includes('agent not configured'))return {code:'agent-missing',label:'QEMU Guest Agent non configuré'};
  if(msg.includes('timeout')||msg.includes('timed out'))return {code:'timeout',label:'Timeout QEMU Guest Agent'};
  if(msg.includes('permission')||msg.includes('403')||msg.includes('forbidden'))return {code:'permission',label:'Permissions insuffisantes'};
  if(msg.includes('not supported')||msg.includes('unsupported')||msg.includes('501'))return {code:'unsupported',label:'Information non supportée'};
  return {code:'agent-error',label:'QEMU Guest Agent indisponible'};
}
async function guestStorageInfo(server,auth,machine){
  const key=`${server.id}:${machine.node}:${machine.type}:${machine.vmid}`,cached=GUEST_STORAGE_CACHE.get(key);if(cached&&cached.expiresAt>Date.now())return cached.value;
  const base=`/nodes/${encodeURIComponent(machine.node)}/${machine.type}/${machine.vmid}`;
  let status={},config={},fsraw=null,agentError='',agentResponded=false;
  const [statusResult,configResult]=await Promise.all([
    proxmoxApi(server,`${base}/status/current`,{auth}).catch(()=>({})),
    proxmoxApi(server,`${base}/config`,{auth}).catch(()=>({}))
  ]);
  status=statusResult||{};config=configResult||{};
  const effectiveStatus=String(status?.status||machine.status||'unknown');
  if(machine.type==='qemu'&&effectiveStatus==='running'){
    try{fsraw=await proxmoxApi(server,`${base}/agent/get-fsinfo`,{auth});agentResponded=true;}
    catch(e){agentError=String(e?.message||e||'QEMU Guest Agent indisponible');}
  }
  const configuredDisks=configuredGuestDisks(config,machine.type);
  const configuredCapacity=configuredDisks.reduce((sum,row)=>sum+Number(row.total||0),0);
  const statusUsed=Number(status?.disk??machine.disk??0),statusTotal=Number(status?.maxdisk??machine.maxdisk??0);
  let used=Number.isFinite(statusUsed)&&statusUsed>0?statusUsed:0,total=Number.isFinite(statusTotal)&&statusTotal>0?statusTotal:0;
  let source=used>0?'status':total>0?'capacity':'unknown';
  const filesystems=guestFsRows(fsraw);
  if(filesystems.length){
    const sized=filesystems.filter(r=>r.sizeKnown&&r.total>0);
    const gu=sized.reduce((sum,row)=>sum+row.used,0),gt=sized.reduce((sum,row)=>sum+row.total,0);
    if(gt>0){used=gu;total=gt;source='guest-agent';agentError='';}
    else if(machine.type==='qemu'){source='guest-agent-no-size';agentError='Le QEMU Guest Agent répond, mais ne fournit pas les compteurs de taille pour les filesystems détectés.';}
  }
  if((!total||source==='guest-agent-no-size')&&configuredCapacity>0){
    total=configuredCapacity;
    if(source!=='guest-agent-no-size')source=used>0?'status+config':'config';
  }
  const usedKnown=source==='guest-agent'||used>0;
  const free=usedKnown&&total>0?Math.max(0,total-used):null;
  const usagePct=usedKnown&&total>0?Number((used/total*100).toFixed(1)):null;
  let storageState={code:'available',label:'Disponible',tone:'ok'};
  if(machine.type==='qemu'){
    if(effectiveStatus!=='running')storageState={code:'vm-stopped',label:'VM arrêtée',tone:'neutral'};
    else if(agentResponded&&filesystems.length&&filesystems.some(row=>row.sizeKnown))storageState={code:'available',label:'Données Guest Agent disponibles',tone:'ok'};
    else if(agentResponded)storageState={code:'agent-no-size',label:'Guest Agent disponible · compteurs indisponibles',tone:'warning'};
    else{
      const classified=classifyGuestAgentStorageError(agentError,effectiveStatus);
      storageState={...classified,tone:['timeout','agent-error'].includes(classified.code)?'warning':'neutral'};
    }
  }
  const value={
    used,total,free,usagePct,source,usedKnown,
    configuredCapacity,configuredDisks,
    guestAgentAvailable:machine.type!=='qemu'?null:agentResponded,
    agentError,storageState,filesystems
  };
  const ttl=source==='guest-agent'?GUEST_STORAGE_CACHE_OK_MS:GUEST_STORAGE_CACHE_NEGATIVE_MS;
  GUEST_STORAGE_CACHE.set(key,{expiresAt:Date.now()+ttl,value});return value;
}
async function enrichMissingGuestStorage(server,auth,dash){
  const rows=dash?.machines||[];
  const targets=rows.filter(m=>m.type==='qemu'&&(m.status==='running'||!Number(m.maxdisk||0)||!Number(m.disk||0))).slice(0,80);
  if(!targets.length)return dash;
  for(let i=0;i<targets.length;i+=8){
    await Promise.all(targets.slice(i,i+8).map(async m=>{
      try{
        const info=await guestStorageInfo(server,auth,m);
        if(info.total>0)m.maxdisk=info.total;
        if(info.usedKnown)m.disk=info.used;
        m.diskFree=info.free;
        m.diskUsagePct=info.usagePct;
        m.diskSource=info.source;
        m.diskUsedKnown=!!info.usedKnown;
        m.guestAgentStorage=info.guestAgentAvailable;
        m.guestAgentStorageError=info.agentError||'';
        m.storageState=info.storageState;
        m.configuredDiskCount=info.configuredDisks?.length||0;
      }catch(e){
        m.storageState={code:'unavailable',label:'Données stockage indisponibles',tone:'warning'};
        m.guestAgentStorageError=String(e?.message||e||'');
      }
    }));
  }
  return dash;
}

function calcDashboard(resources, tasks = [], backupJobs = [], rrdByNode = []) {
  const nodes = resources.filter(r => r.type === 'node');
  const guests = resources.filter(r => r.type === 'qemu' || r.type === 'lxc');
  const storages = resources.filter(r => r.type === 'storage');
  const cpu = nodes.length ? nodes.reduce((a,n) => a + Number(n.cpu || 0), 0) / nodes.length * 100 : 0;
  const cores = nodes.reduce((a,n) => a + Number(n.maxcpu || 0), 0);
  const mem = nodes.reduce((a,n) => a + Number(n.mem || 0), 0);
  const maxmem = nodes.reduce((a,n) => a + Number(n.maxmem || 0), 0);
  const disk = storages.reduce((a,s) => a + Number(s.disk || 0), 0);
  const maxdisk = storages.reduce((a,s) => a + Number(s.maxdisk || 0), 0);
  const allocatedCores = guests.reduce((a,g) => a + Number(g.maxcpu || 0), 0);
  const allocatedMemory = guests.reduce((a,g) => a + Number(g.maxmem || 0), 0);
  const guestDiskAllocated = guests.reduce((a,g) => a + Number(g.maxdisk || 0), 0);
  const guestDiskUsed = guests.reduce((a,g) => a + Number(g.disk || 0), 0);
  const history = calcRrdHistory(rrdByNode);
  const networkLatest = history.network.length ? history.network[history.network.length - 1].value : null;
  const activeTasks = (Array.isArray(tasks) ? tasks : []).filter(t => !Number(t.endtime || 0));
  const completedTasks=(Array.isArray(tasks)?tasks:[]).filter(t=>Number(t.endtime||0)&&t.status);
  const failedTasks=completedTasks.filter(t=>classifyProxmoxTaskStatus(t.status).kind==='failure');
  const warningTasks=completedTasks.filter(t=>classifyProxmoxTaskStatus(t.status).kind==='warning');
  const onlineNodes = nodes.filter(n => n.status === 'online' || n.status === 'unknown').length;
  const healthyStorages = storages.filter(s => s.status === 'available' || s.status === 'active' || s.status === 'unknown' || !s.status).length;
  const nodePenalty = nodes.length ? Math.round((nodes.length - onlineNodes) / nodes.length * 45) : 45;
  const storagePenalty = storages.length ? Math.round((storages.length - healthyStorages) / storages.length * 25) : 0;
  const taskPenalty = Math.min(20, failedTasks.length * 4 + warningTasks.length);
  const healthScore = Math.max(0, 100 - nodePenalty - storagePenalty - taskPenalty);
  return {
    collectedAt: new Date().toISOString(),
    metrics: {
      cpu: Number(cpu.toFixed(1)), cores,
      memoryPct: maxmem ? Number((mem / maxmem * 100).toFixed(1)) : 0,
      memoryUsed: mem, memoryTotal: maxmem,
      storagePct: maxdisk ? Number((disk / maxdisk * 100).toFixed(1)) : 0,
      storageUsed: disk, storageTotal: maxdisk,
      networkMbps: networkLatest,
      allocatedCores,
      allocatedMemory,
      guestDiskAllocated,
      guestDiskUsed,
      coreCommitPct: cores ? Number((allocatedCores / cores * 100).toFixed(1)) : 0,
      memoryCommitPct: maxmem ? Number((allocatedMemory / maxmem * 100).toFixed(1)) : 0
    },
    history,
    health: { score: healthScore, onlineNodes, totalNodes: nodes.length, healthyStorages, totalStorages: storages.length, activeTasks: activeTasks.length, failedTasks: failedTasks.length, warningTasks: warningTasks.length },
    nodes: nodes.map(n => ({ node: n.node, status: n.status, cpu: n.cpu, maxcpu: n.maxcpu || 0, mem: n.mem, maxmem: n.maxmem, uptime: n.uptime, disk: n.disk || 0, maxdisk: n.maxdisk || 0 })),
    machines: guests.map(g => ({
      vmid: g.vmid, name: g.name || `${g.type}-${g.vmid}`, type: g.type, status: g.status,
      cpu: Number((Number(g.cpu || 0) * 100).toFixed(1)), maxcpu: g.maxcpu || 0, mem: g.mem || 0, maxmem: g.maxmem || 0, disk: g.disk || 0, maxdisk: g.maxdisk || 0,
      node: g.node, uptime: g.uptime || 0, tags: g.tags || '', netin: g.netin || 0, netout: g.netout || 0
    })),
    storages: storages.map(s => ({ storage: s.storage, node: s.node, status: s.status, disk: s.disk || 0, maxdisk: s.maxdisk || 0, plugintype: s.plugintype || '', content: s.content || '' })),
    tasks: (Array.isArray(tasks) ? tasks : []).slice(0, 50).map(t => ({
      upid: t.upid || '', type: t.type || '', status: t.status || '', node: t.node || '', user: t.user || '', id: t.id || '',
      starttime: t.starttime || 0, endtime: t.endtime || 0
    })),
    backup: calcBackupState(guests, backupJobs, tasks)
  };
}

function findServer(id) {
  const servers = jsonRead(SERVERS_FILE, []);
  return servers.find(s => s.id === id);
}

function normalizeDashboardGroup(row={}) {
  return {
    id:String(row.id||crypto.randomUUID()),
    name:String(row.name||'Vue infrastructure').trim().slice(0,80),
    members:(Array.isArray(row.members)?row.members:[]).map(m=>({serverId:String(m.serverId||''),nodes:[...new Set((Array.isArray(m.nodes)?m.nodes:[]).map(String).filter(Boolean))]})).filter(m=>m.serverId),
    createdAt:row.createdAt||new Date().toISOString(),
    updatedAt:row.updatedAt||new Date().toISOString()
  };
}
function mergeHistorySeries(parts,key,mode='avg') {
  const buckets=new Map();
  for(const part of parts){
    for(const point of part?.history?.[key]||[]){
      const t=Number(point.time||0),v=Number(point.value);if(!t||!Number.isFinite(v))continue;
      if(!buckets.has(t))buckets.set(t,{time:t,sum:0,count:0});const b=buckets.get(t);b.sum+=v;b.count++;
    }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time).slice(-300).map(b=>({time:b.time,value:Number((mode==='sum'?b.sum:b.sum/Math.max(1,b.count)).toFixed(3))}));
}
function mergeDashboardParts(parts=[],groupName='Vue infrastructure') {
  const valid=parts.filter(Boolean), nodes=valid.flatMap(p=>p.nodes||[]), machines=valid.flatMap(p=>p.machines||[]), storages=valid.flatMap(p=>p.storages||[]), tasks=valid.flatMap(p=>p.tasks||[]).sort((a,b)=>Number(b.starttime||0)-Number(a.starttime||0)).slice(0,100);
  const cores=valid.reduce((a,p)=>a+Number(p.metrics?.cores||0),0), cpuWeighted=valid.reduce((a,p)=>a+Number(p.metrics?.cpu||0)*Math.max(1,Number(p.metrics?.cores||0)),0);
  const memoryUsed=valid.reduce((a,p)=>a+Number(p.metrics?.memoryUsed||0),0), memoryTotal=valid.reduce((a,p)=>a+Number(p.metrics?.memoryTotal||0),0);
  const storageUsed=valid.reduce((a,p)=>a+Number(p.metrics?.storageUsed||0),0), storageTotal=valid.reduce((a,p)=>a+Number(p.metrics?.storageTotal||0),0);
  const allocatedCores=valid.reduce((a,p)=>a+Number(p.metrics?.allocatedCores||0),0), allocatedMemory=valid.reduce((a,p)=>a+Number(p.metrics?.allocatedMemory||0),0), guestDiskAllocated=valid.reduce((a,p)=>a+Number(p.metrics?.guestDiskAllocated||0),0), guestDiskUsed=valid.reduce((a,p)=>a+Number(p.metrics?.guestDiskUsed||0),0);
  const networkVals=valid.map(p=>Number(p.metrics?.networkMbps)).filter(Number.isFinite), networkMbps=networkVals.length?Number(networkVals.reduce((a,b)=>a+b,0).toFixed(3)):null;
  const temperatureVals=nodes.map(n=>Number(n.temperatureC)).filter(Number.isFinite),temperatureMaxC=temperatureVals.length?Number(Math.max(...temperatureVals).toFixed(1)):null,temperatureAvgC=temperatureVals.length?Number((temperatureVals.reduce((a,b)=>a+b,0)/temperatureVals.length).toFixed(1)):null;
  const onlineNodes=nodes.filter(n=>n.status==='online'||n.status==='unknown').length, healthyStorages=storages.filter(st=>!st.status||['available','active','unknown'].includes(String(st.status))).length;
  const completedTasks=tasks.filter(t=>Number(t.endtime||0)&&t.status),failedTasks=completedTasks.filter(t=>classifyProxmoxTaskStatus(t.status).kind==='failure').length,warningTasks=completedTasks.filter(t=>classifyProxmoxTaskStatus(t.status).kind==='warning').length,activeTasks=tasks.filter(t=>!Number(t.endtime||0)).length;
  const nodePenalty=nodes.length?Math.round((nodes.length-onlineNodes)/nodes.length*45):45, storagePenalty=storages.length?Math.round((storages.length-healthyStorages)/storages.length*25):0, taskPenalty=Math.min(20,failedTasks*4+warningTasks);
  const backup={jobs:valid.flatMap(p=>p.backup?.jobs||[]),protectedCount:valid.reduce((a,p)=>a+Number(p.backup?.protectedCount||0),0),unprotectedCount:valid.reduce((a,p)=>a+Number(p.backup?.unprotectedCount||0),0),unprotected:valid.flatMap(p=>p.backup?.unprotected||[]),machines:valid.flatMap(p=>p.backup?.machines||[]),inventory:valid.flatMap(p=>p.backup?.inventory||[])};
  return {
    grouped:true,groupName,collectedAt:new Date().toISOString(),
    metrics:{cpu:cores?Number((cpuWeighted/cores).toFixed(1)):0,cores,memoryPct:memoryTotal?Number((memoryUsed/memoryTotal*100).toFixed(1)):0,memoryUsed,memoryTotal,storagePct:storageTotal?Number((storageUsed/storageTotal*100).toFixed(1)):0,storageUsed,storageTotal,networkMbps,temperatureMaxC,temperatureAvgC,temperatureAvailableNodes:temperatureVals.length,allocatedCores,allocatedMemory,guestDiskAllocated,guestDiskUsed,coreCommitPct:cores?Number((allocatedCores/cores*100).toFixed(1)):0,memoryCommitPct:memoryTotal?Number((allocatedMemory/memoryTotal*100).toFixed(1)):0},
    history:{cpu:mergeHistorySeries(valid,'cpu','avg'),memory:mergeHistorySeries(valid,'memory','avg'),storage:mergeHistorySeries(valid,'storage','avg'),network:mergeHistorySeries(valid,'network','sum')},
    health:{score:Math.max(0,100-nodePenalty-storagePenalty-taskPenalty),onlineNodes,totalNodes:nodes.length,healthyStorages,totalStorages:storages.length,activeTasks,failedTasks,warningTasks},
    nodes,machines,storages,tasks,backup,problems:valid.flatMap(p=>p.problems||[]),capacity:{memory:{status:'collecting',samples:0},storage:{status:'collecting',samples:0}},server:{name:groupName,grouped:true}
  };
}
async function buildLiveDashboardPart(server,auth,{nodesFilter=[]}={}) {
  const resourcesAll=await proxmoxApi(server,'/cluster/resources',{auth});
  const wanted=new Set((nodesFilter||[]).map(String));
  const resources=(Array.isArray(resourcesAll)?resourcesAll:[]).filter(r=>!wanted.size||wanted.has(String(r.node||'')));
  const dash=calcDashboard(resources,[],[],[]);
  // Keep grouped live refresh consistent with the full dashboard. Guest Agent
  // storage calls use the short-lived cache, so refreshes retain used/free state
  // without hammering every VM on every dashboard tick.
  await enrichMissingGuestStorage(server,auth,dash);
  await enrichNodeTemperatures(server,auth,dash);
  dash.nodes=(dash.nodes||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.machines=(dash.machines||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.storages=(dash.storages||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  // The live endpoint still skips RRD, backup inventory and problem analysis.
  return dash;
}
async function buildDashboardPart(server,auth,{timeframe='day',nodesFilter=[],history=true}={}) {
  const resourcesAll=await proxmoxApi(server,'/cluster/resources',{auth}); const wanted=new Set((nodesFilter||[]).map(String));
  const resources=(Array.isArray(resourcesAll)?resourcesAll:[]).filter(r=>!wanted.size||wanted.has(String(r.node||'')));
  const nodes=resources.filter(r=>r.type==='node'&&r.node), storages=resources.filter(r=>r.type==='storage'&&r.node&&r.storage);
  const optional=async(p,f=[])=>{try{return await proxmoxApi(server,p,{auth})}catch{return f}};
  const [tasksAll,backupJobs,rrd,storageRrd]=await Promise.all([
    optional('/cluster/tasks',[]), optional('/cluster/backup',[]),
    history?Promise.all(nodes.map(async n=>({node:n.node,points:await optional(`/nodes/${encodeURIComponent(n.node)}/rrddata?timeframe=${normalizeTimeframe(timeframe)}&cf=AVERAGE`,[])}))):Promise.resolve([]),
    history?Promise.all(storages.slice(0,80).map(async st=>({node:st.node,storage:st.storage,points:await optional(`/nodes/${encodeURIComponent(st.node)}/storage/${encodeURIComponent(st.storage)}/rrddata?timeframe=${normalizeTimeframe(timeframe)}&cf=AVERAGE`,[])}))):Promise.resolve([])
  ]);
  const tasks=(Array.isArray(tasksAll)?tasksAll:[]).filter(t=>!wanted.size||wanted.has(String(t.node||'')));
  let dash=calcDashboard(resources,tasks,Array.isArray(backupJobs)?backupJobs:[],rrd); await enrichMissingGuestStorage(server,auth,dash); dash.history.storage=calcStorageRrdHistory(storageRrd);
  try{dash=enrichBackupState(dash,await fetchBackupInventory(server,auth,dash));}catch{}
  await enrichNodeTemperatures(server,auth,dash);
  dash.problems=computeProblems(dash,getSettings());
  dash.nodes=(dash.nodes||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.machines=(dash.machines||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.storages=(dash.storages||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.tasks=(dash.tasks||[]).map(x=>({...x,serverId:server.id,serverName:server.name}));
  dash.problems=(dash.problems||[]).map(x=>({...x,id:`${server.id}:${x.id}`,serverId:server.id,serverName:server.name}));
  return dash;
}

function recordMetrics(serverId, dashboard) {
  if (!serverId || !dashboard?.metrics) return;
  const all = jsonRead(METRICS_FILE, {});
  const rows = Array.isArray(all[serverId]) ? all[serverId] : [];
  const now = Date.now();
  const last = rows[rows.length - 1];
  if (last && now - Number(last.at || 0) < 10 * 60 * 1000) return;
  rows.push({
    at: now,
    memoryPct: Number(dashboard.metrics.memoryPct || 0),
    storagePct: Number(dashboard.metrics.storagePct || 0),
    cpuPct: Number(dashboard.metrics.cpu || 0),
    nodes: Object.fromEntries((dashboard.nodes || []).map(n => [n.node, {
      cpuPct: Number(n.cpu || 0) * 100,
      memoryPct: Number(n.maxmem || 0) ? Number(n.mem || 0) / Number(n.maxmem) * 100 : 0,
      storagePct: Number(n.maxdisk || 0) ? Number(n.disk || 0) / Number(n.maxdisk) * 100 : 0
    }]))
  });
  const cutoff = now - 365 * 24 * 60 * 60 * 1000;
  all[serverId] = rows.filter(r => Number(r.at || 0) >= cutoff).slice(-20000);
  jsonWrite(METRICS_FILE, all);
}
function forecastSeries(rows, key, threshold = 95) {
  const pts = (rows || []).map(r => ({ x: Number(r.at || 0) / 86400000, y: Number(r[key]) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 6) return { status: 'collecting', samples: pts.length, threshold };
  const span = Math.max(...pts.map(p => p.x)) - Math.min(...pts.map(p => p.x));
  if (span < 0.15) return { status: 'collecting', samples: pts.length, threshold };
  const x0 = pts[0].x;
  const normalized = pts.map(p => ({ x: p.x - x0, y: p.y }));
  const n = normalized.length;
  const sx = normalized.reduce((a,p)=>a+p.x,0), sy = normalized.reduce((a,p)=>a+p.y,0);
  const sxx = normalized.reduce((a,p)=>a+p.x*p.x,0), sxy = normalized.reduce((a,p)=>a+p.x*p.y,0);
  const den = n*sxx - sx*sx;
  if (!den) return { status: 'flat', samples: n, threshold };
  const slope = (n*sxy - sx*sy) / den;
  const intercept = (sy - slope*sx) / n;
  const nowX = normalized[normalized.length - 1].x;
  const current = slope * nowX + intercept;
  if (slope <= 0.02) return { status: 'stable', samples: n, slopePerDay: slope, current, threshold };
  const days = (threshold - current) / slope;
  if (!Number.isFinite(days) || days <= 0) return { status: 'reached', samples: n, slopePerDay: slope, current, threshold, days: 0, date: new Date().toISOString() };
  const date = new Date(Date.now() + days * 86400000).toISOString();
  return { status: 'forecast', samples: n, slopePerDay: slope, current, threshold, days: Number(days.toFixed(1)), date };
}
function getCapacityForecast(serverId) {
  const rows = jsonRead(METRICS_FILE, {})[serverId] || [];
  return { memory: forecastSeries(rows, 'memoryPct', 95), storage: forecastSeries(rows, 'storagePct', 95), samples: rows.length };
}
function computeProblems(dashboard, settings) {
  const t = settings.thresholds || {};
  const problems = [];
  const add = (severity, code, title, detail, target='', extra={}) => problems.push({
    id: `${code}:${target || title}`, severity, code, title, detail, target,
    recommendation: extra.recommendation || '', route: extra.route || '', facts: extra.facts || [], items: extra.items || []
  });
  const m = dashboard?.metrics || {};
  if (Number(m.cpu || 0) >= Number(t.cpuWarning || 85)) add('warning','cpu-high','CPU élevée', `${Number(m.cpu).toFixed(1)} % sur le cluster`, 'cluster', {
    route:'monitoring', recommendation:'Vérifie les VM/LXC les plus consommatrices et l’historique CPU avant d’augmenter les ressources.',
    facts:[{label:'CPU actuelle',value:`${Number(m.cpu).toFixed(1)} %`},{label:'Seuil d’alerte',value:`${Number(t.cpuWarning||85)} %`},{label:'Cœurs physiques',value:String(m.cores||0)},{label:'vCPU alloués',value:String(m.allocatedCores||0)}]
  });
  if (Number(m.memoryPct || 0) >= Number(t.memoryWarning || 85)) add('warning','memory-high','Mémoire élevée', `${Number(m.memoryPct).toFixed(1)} % utilisés`, 'cluster', {
    route:'monitoring', recommendation:'Contrôle les machines les plus consommatrices et le taux de mémoire engagée. Vérifie le ballooning avant toute modification.',
    facts:[{label:'RAM utilisée',value:`${Number(m.memoryPct).toFixed(1)} %`},{label:'Seuil d’alerte',value:`${Number(t.memoryWarning||85)} %`},{label:'Mémoire engagée',value:`${Number(m.memoryCommitPct||0).toFixed(1)} %`}]
  });
  if (Number(m.storagePct || 0) >= Number(t.storageCritical || 95)) add('critical','storage-critical','Stockage critique', `${Number(m.storagePct).toFixed(1)} % utilisés`, 'cluster', {
    route:'storage', recommendation:'Libère de l’espace ou étends le stockage rapidement. Vérifie les snapshots et backups volumineux.',
    facts:[{label:'Utilisation',value:`${Number(m.storagePct).toFixed(1)} %`},{label:'Seuil critique',value:`${Number(t.storageCritical||95)} %`}]
  });
  else if (Number(m.storagePct || 0) >= Number(t.storageWarning || 85)) add('warning','storage-high','Stockage presque plein', `${Number(m.storagePct).toFixed(1)} % utilisés`, 'cluster', {
    route:'storage', recommendation:'Surveille la croissance et identifie les volumes/snapshots les plus volumineux avant d’atteindre le seuil critique.',
    facts:[{label:'Utilisation',value:`${Number(m.storagePct).toFixed(1)} %`},{label:'Seuil warning',value:`${Number(t.storageWarning||85)} %`},{label:'Seuil critique',value:`${Number(t.storageCritical||95)} %`}]
  });
  for (const n of dashboard?.nodes || []) if (!(n.status === 'online' || n.status === 'unknown')) add('critical','node-offline','Nœud indisponible', n.node, n.node, {
    route:'nodes', recommendation:'Vérifie l’alimentation, le réseau et l’état du service pveproxy/pvedaemon sur ce nœud.',
    facts:[{label:'Nœud',value:n.node},{label:'État remonté',value:String(n.status||'inconnu')},{label:'Dernier uptime',value:`${Math.floor(Number(n.uptime||0)/60)} min`}]
  });
  for (const n of dashboard?.nodes || []) {
    const temp=Number(n.temperatureC);if(!Number.isFinite(temp))continue;
    if(temp>=Number(t.temperatureCritical||85))add('critical','temperature-critical','Température critique',`${n.node} · ${temp.toFixed(1)} °C`,n.node,{route:'nodes',recommendation:'Vérifie immédiatement le refroidissement, les ventilateurs, les dissipateurs et la charge du nœud.',facts:[{label:'Nœud',value:n.node},{label:'Température CPU',value:`${temp.toFixed(1)} °C`},{label:'Seuil critique',value:`${Number(t.temperatureCritical||85)} °C`},{label:'Source',value:'lm-sensors'}]});
    else if(temp>=Number(t.temperatureWarning||75))add('warning','temperature-high','Température élevée',`${n.node} · ${temp.toFixed(1)} °C`,n.node,{route:'nodes',recommendation:'Surveille la charge et le refroidissement du nœud. Contrôle les ventilateurs et le flux d’air si la température continue de monter.',facts:[{label:'Nœud',value:n.node},{label:'Température CPU',value:`${temp.toFixed(1)} °C`},{label:'Seuil warning',value:`${Number(t.temperatureWarning||75)} °C`},{label:'Source',value:'lm-sensors'}]});
  }
  for (const st of dashboard?.storages || []) if (st.status && !['available','active','unknown'].includes(String(st.status))) add('critical','storage-offline','Stockage indisponible', `${st.storage} sur ${st.node}`, `${st.node}/${st.storage}`, {
    route:'storage', recommendation:'Vérifie la connectivité du stockage, le montage et les services associés avant de relancer des opérations.',
    facts:[{label:'Stockage',value:st.storage},{label:'Nœud',value:st.node},{label:'État',value:String(st.status)}]
  });
  for (const g of dashboard?.backup?.unprotected || []) add('warning','backup-missing','Machine non protégée', `${g.name} (${g.vmid}) n’est couverte par aucun job détecté`, String(g.vmid), {
    route:'backups', recommendation:'Ajoute cette machine à un job de sauvegarde ou vérifie qu’elle est volontairement exclue.',
    facts:[{label:'Machine',value:`${g.name} (${g.vmid})`},{label:'Type',value:String(g.type||'').toUpperCase()},{label:'Nœud',value:g.node||'—'}]
  });
  const maxAgeHours = Math.max(1, Number(t.backupMaxAgeHours || 36));
  const nowSec = Date.now() / 1000;
  for (const g of dashboard?.backup?.machines || []) {
    if (!g.protectedByJob) continue;
    const ctime = Number(g.lastBackup?.ctime || 0);
    const backupDecision=backupAlertDecision({ctime,maxAgeHours,absenceReliable:!!g.backupAbsenceReliable,nowSec});
    if (backupDecision.kind==='absent') {
      // Never turn a temporary/partial inventory failure into "no backup found".
      // Missing-backup alerts are only valid when every backup storage query
      // completed successfully and there is no successful vzdump task evidence.
      add('warning','backup-absent','Sauvegarde attendue absente', `${g.name} (${g.vmid}) est protégée par un job mais aucun backup confirmé n’a été trouvé`, String(g.vmid), {
        route:'backups', recommendation:'Vérifie le job, le stockage de destination et les logs de la dernière exécution.',
        facts:[
          {label:'Machine',value:`${g.name} (${g.vmid})`},
          {label:'Nœud',value:g.node||'—'},
          {label:'Âge maximum attendu',value:`${maxAgeHours} h`},
          {label:'Inventaire backup',value:'Vérifié sur tous les stockages détectés'}
        ]
      });
      continue;
    }
    if (backupDecision.kind==='unknown'||backupDecision.kind==='ok') continue;
    const ageHours = Number(backupDecision.ageHours||0);
    if (backupDecision.kind==='stale') add('warning','backup-stale','Sauvegarde en retard', `${g.name} (${g.vmid}) : dernière sauvegarde il y a ${ageHours.toFixed(1)} h`, String(g.vmid), {
      route:'backups', recommendation:'Ouvre la page Sauvegardes pour vérifier le dernier job et relancer une sauvegarde si nécessaire.',
      facts:[
        {label:'Machine',value:`${g.name} (${g.vmid})`},
        {label:'Dernier backup',value:new Date(ctime*1000).toLocaleString('fr-FR')},
        {label:'Âge',value:`${ageHours.toFixed(1)} h`},
        {label:'Seuil',value:`${maxAgeHours} h`},
        {label:'Source',value:g.lastBackup?.source==='task'?'Tâche vzdump réussie':'Inventaire stockage'},
        {label:'Points de restauration détectés',value:String(g.restorePointCount||0)}
      ]
    });
  }
  const backupWarnings=(dashboard?.tasks||[]).filter(t=>Number(t.endtime||0)>0&&String(t.type||'').toLowerCase()==='vzdump'&&classifyProxmoxTaskStatus(t.status).kind==='warning').slice(0,12);
  if(backupWarnings.length)add('warning','backup-task-warning','Sauvegarde avec avertissement',`${backupWarnings.length} job(s) vzdump récent(s) terminé(s) avec avertissement`,'backup',{
    route:'backups',recommendation:'Consulte le log du job pour identifier les avertissements et confirmer que toutes les machines attendues ont bien été sauvegardées.',
    facts:[{label:'Jobs avec avertissement',value:String(backupWarnings.length)},{label:'Dernier statut',value:String(backupWarnings[0]?.status||'WARNINGS')}],
    items:backupWarnings.map(t=>({label:t.id?`VM/LXC ${t.id}`:'Job vzdump',meta:`${t.node||'nœud inconnu'} · ${t.user||'utilisateur inconnu'} · ${t.status||'warning'} · ${t.endtime?new Date(Number(t.endtime)*1000).toLocaleString('fr-FR'):'heure inconnue'}`,upid:t.upid||''}))
  });
  const backupFailures=(dashboard?.tasks||[]).filter(t=>Number(t.endtime||0)>0&&String(t.type||'').toLowerCase()==='vzdump'&&classifyProxmoxTaskStatus(t.status).kind==='failure').slice(0,12);
  if(backupFailures.length)add('critical','backup-task-failed','Sauvegarde échouée',`${backupFailures.length} job(s) vzdump récent(s) en échec`,'backup',{
    route:'backups',recommendation:'Consulte immédiatement les logs du job et vérifie le stockage de destination avant la prochaine fenêtre de sauvegarde.',
    facts:[{label:'Jobs en échec',value:String(backupFailures.length)},{label:'Dernier statut',value:String(backupFailures[0]?.status||'ERROR')}],
    items:backupFailures.map(t=>({label:t.id?`VM/LXC ${t.id}`:'Job vzdump',meta:`${t.node||'nœud inconnu'} · ${t.user||'utilisateur inconnu'} · ${t.status||'erreur'} · ${t.endtime?new Date(Number(t.endtime)*1000).toLocaleString('fr-FR'):'heure inconnue'}`,upid:t.upid||''}))
  });
  const failed=(dashboard?.tasks||[]).filter(t=>Number(t.endtime||0)>0&&t.status&&classifyProxmoxTaskStatus(t.status).kind==='failure'&&String(t.type||'').toLowerCase()!=='vzdump').slice(0,12);
  if (failed.length) add('critical','tasks-failed','Tâches en erreur', `${failed.length} tâche(s) récente(s) en échec`, 'cluster', {
    route:'tasks', recommendation:'Consulte les logs des tâches ci-dessous. Les erreurs de backup, migration ou stockage sont souvent explicites dans les dernières lignes.',
    facts:[{label:'Tâches en échec',value:String(failed.length)},{label:'Période',value:'tâches récentes remontées par Proxmox'}],
    items:failed.map(t=>({label:t.type||t.id||'Tâche Proxmox',meta:`${t.node||'nœud inconnu'} · ${t.user||'utilisateur inconnu'} · ${t.status||'erreur'} · ${t.endtime?new Date(Number(t.endtime)*1000).toLocaleString('fr-FR'):'heure inconnue'}`,upid:t.upid||''}))
  });
  const warnings=(dashboard?.tasks||[]).filter(t=>Number(t.endtime||0)>0&&t.status&&classifyProxmoxTaskStatus(t.status).kind==='warning'&&String(t.type||'').toLowerCase()!=='vzdump').slice(0,12);
  if(warnings.length)add('warning','tasks-warning','Tâches avec avertissement',`${warnings.length} tâche(s) récente(s) terminée(s) avec avertissement`,'cluster',{
    route:'tasks',recommendation:'Consulte les logs pour identifier les avertissements et confirmer qu’aucune action corrective n’est nécessaire.',
    facts:[{label:'Tâches avec avertissement',value:String(warnings.length)},{label:'Période',value:'tâches récentes remontées par Proxmox'}],
    items:warnings.map(t=>({label:t.type||t.id||'Tâche Proxmox',meta:`${t.node||'nœud inconnu'} · ${t.user||'utilisateur inconnu'} · ${t.status||'warning'} · ${t.endtime?new Date(Number(t.endtime)*1000).toLocaleString('fr-FR'):'heure inconnue'}`,upid:t.upid||''}))
  });
  return problems;
}

function computeEnergy(dashboard, settings) {
  const cfg = settings.electricity || {};
  const price = Number(cfg.pricePerKwh || 0);
  const rows = [];
  for (const node of dashboard?.nodes || []) {
    const c = cfg.nodes?.[node.node] || {};
    const idle = Number(c.idleWatts || 0), max = Number(c.maxWatts || 0);
    if (!(idle > 0) || !(max >= idle)) { rows.push({ node: node.node, configured: false }); continue; }
    const load = Math.max(0, Math.min(1, Number(node.cpu || 0)));
    const watts = idle + (max - idle) * load;
    const kwhDay = watts * 24 / 1000;
    rows.push({ node: node.node, configured: true, idleWatts: idle, maxWatts: max, watts: Number(watts.toFixed(1)), kwhDay: Number(kwhDay.toFixed(2)), costDay: Number((kwhDay*price).toFixed(2)), costMonth: Number((kwhDay*30.44*price).toFixed(2)), costYear: Number((kwhDay*365*price).toFixed(2)) });
  }
  const totalWatts = rows.reduce((a,r)=>a+Number(r.watts||0),0);
  return { pricePerKwh: price, currency: cfg.currency || 'EUR', nodes: rows, totalWatts: Number(totalWatts.toFixed(1)), totalCostMonth: Number((rows.reduce((a,r)=>a+Number(r.costMonth||0),0)).toFixed(2)) };
}
async function waitForTask(server, auth, upid, timeoutMs = 15 * 60 * 1000) {
  const node = taskNodeFromUpid(upid);
  if (!node) return { status: 'unknown', upid };
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const st = await proxmoxApi(server, `/nodes/${encodeURIComponent(node)}/tasks/${taskIdEncode(upid)}/status`, { auth });
    if (st?.status === 'stopped') return st;
    await sleep(1500);
  }
  throw new Error('Timeout en attendant la tâche Proxmox.');
}
function backupVmidFromEntry(row={}) {
  const direct=Number(row.vmid||0);
  if(Number.isInteger(direct)&&direct>0)return direct;
  const volid=String(row.volid||row.volume||row.name||'');
  const patterns=[
    /vzdump-(?:qemu|lxc|openvz)-(\d+)-/i,
    /(?:^|[/:_-])(?:vm|qemu|lxc|ct)[/:_-](\d+)(?:[/:_-]|$)/i,
    /backup[/:_-](?:vm|ct)[/:_-](\d+)(?:[/:_-]|$)/i
  ];
  for(const re of patterns){
    const m=volid.match(re),id=Number(m?.[1]||0);
    if(Number.isInteger(id)&&id>0)return id;
  }
  return null;
}
function successfulBackupTasks(tasks=[]){
  const latest={};
  for(const t of Array.isArray(tasks)?tasks:[]){
    if(String(t.type||'').toLowerCase()!=='vzdump')continue;
    if(Number(t.endtime||0)<=0||String(t.status||'').toUpperCase()!=='OK')continue;
    const vmid=Number(t.id||t.vmid||0);
    if(!Number.isInteger(vmid)||vmid<=0)continue;
    if(!latest[vmid]||Number(t.endtime||0)>Number(latest[vmid].endtime||0))latest[vmid]=t;
  }
  return latest;
}
async function fetchBackupInventory(server, auth, dashboard) {
  const storages=(dashboard?.storages||[]).filter(s=>String(s.content||'').split(',').map(x=>x.trim()).includes('backup')).slice(0,20);
  const signature=storages.map(s=>`${s.node}:${s.storage}`).sort().join('|');
  const cacheKey=`${server.id||''}|${signature}`;
  const cached=BACKUP_INVENTORY_CACHE.get(cacheKey);
  if(cached?.value&&cached.expiresAt>Date.now())return cached.value;
  if(cached?.promise)return cached.promise;

  const previous=cached?.value&&Array.isArray(cached.value.rows)?cached.value:null;
  const promise=(async()=>{
    const checkedAt=Date.now();
    if(!storages.length){
      return {
        rows:previous?.rows||[],complete:false,absenceReliable:false,stale:!!previous?.rows?.length,
        source:previous?.rows?.length?'stale-cache':'no-backup-storage',
        failedStorages:[],successfulStorages:0,totalStorages:0,checkedAt
      };
    }

    const results=[];
    for(let i=0;i<storages.length;i+=5){
      const batch=await Promise.all(storages.slice(i,i+5).map(async s=>{
        const key=`${s.node}:${s.storage}`;
        try{
          const rows=await proxmoxApi(server,`/nodes/${encodeURIComponent(s.node)}/storage/${encodeURIComponent(s.storage)}/content?content=backup`,{auth});
          return {
            ok:true,key,node:s.node,storage:s.storage,
            rows:(Array.isArray(rows)?rows:[]).map(r=>({
              node:s.node,storage:s.storage,volid:r.volid||'',vmid:backupVmidFromEntry(r),
              size:r.size||0,ctime:r.ctime||0,notes:r.notes||'',format:r.format||'',source:'inventory'
            }))
          };
        }catch(error){
          return {ok:false,key,node:s.node,storage:s.storage,error:String(error?.message||error||'Inventaire indisponible'),rows:[]};
        }
      }));
      results.push(...batch);
    }

    const successful=results.filter(r=>r.ok),failed=results.filter(r=>!r.ok);
    const failedKeys=new Set(failed.map(r=>r.key));
    const freshRows=successful.flatMap(r=>r.rows);
    const fallbackRows=(previous?.rows||[]).filter(r=>failedKeys.has(`${r.node}:${r.storage}`));
    const merged=new Map();
    for(const row of [...fallbackRows,...freshRows]){
      const key=`${row.node||''}|${row.storage||''}|${row.volid||''}|${row.vmid||''}|${row.ctime||''}`;
      merged.set(key,row);
    }
    const rows=[...merged.values()].sort((a,b)=>Number(b.ctime||0)-Number(a.ctime||0)).slice(0,1000);
    const complete=failed.length===0;
    return {
      rows,complete,absenceReliable:complete&&successful.length===storages.length,
      stale:failed.length>0&&fallbackRows.length>0,
      source:complete?'fresh':fallbackRows.length?'partial-stale':'partial',
      failedStorages:failed.map(r=>({node:r.node,storage:r.storage,error:r.error})),
      successfulStorages:successful.length,totalStorages:storages.length,checkedAt
    };
  })();

  BACKUP_INVENTORY_CACHE.set(cacheKey,{promise,value:previous,expiresAt:Date.now()+BACKUP_INVENTORY_CACHE_MS});
  try{
    const value=await promise;
    // Keep the last useful inventory in memory beyond its TTL. It can prove
    // that a backup exists during a temporary storage/API outage, but it is
    // never considered reliable evidence that a backup is absent.
    BACKUP_INVENTORY_CACHE.set(cacheKey,{value,expiresAt:Date.now()+BACKUP_INVENTORY_CACHE_MS});
    return value;
  }catch(error){
    if(previous){
      const fallback={...previous,complete:false,absenceReliable:false,stale:true,source:'stale-cache',checkedAt:Date.now()};
      BACKUP_INVENTORY_CACHE.set(cacheKey,{value:fallback,expiresAt:Date.now()+BACKUP_INVENTORY_CACHE_MS});
      return fallback;
    }
    BACKUP_INVENTORY_CACHE.delete(cacheKey);
    return {rows:[],complete:false,absenceReliable:false,stale:false,source:'unavailable',failedStorages:[],successfulStorages:0,totalStorages:storages.length,checkedAt:Date.now(),error:String(error?.message||error||'Inventaire indisponible')};
  }
}

function enrichBackupState(dashboard, inventoryResult) {
  const info=Array.isArray(inventoryResult)
    ? {rows:inventoryResult,complete:true,absenceReliable:true,stale:false,source:'legacy'}
    : (inventoryResult||{rows:[],complete:false,absenceReliable:false,stale:false,source:'unavailable'});
  const inventory=Array.isArray(info.rows)?info.rows:[];
  const latest={},counts={};
  for(const raw of inventory){
    const vmid=backupVmidFromEntry(raw);
    if(!vmid)continue;
    const b={...raw,vmid,source:raw.source||'inventory'};
    counts[vmid]=(counts[vmid]||0)+1;
    if(!latest[vmid]||Number(b.ctime||0)>Number(latest[vmid].ctime||0))latest[vmid]=b;
  }
  const latestTasks=successfulBackupTasks(dashboard?.tasks||[]);
  dashboard.backup=dashboard.backup||{};
  dashboard.backup.inventory=inventory;
  dashboard.backup.inventoryStatus={
    complete:!!info.complete,absenceReliable:!!info.absenceReliable,stale:!!info.stale,
    source:info.source||'unknown',failedStorages:info.failedStorages||[],
    successfulStorages:Number(info.successfulStorages||0),totalStorages:Number(info.totalStorages||0),checkedAt:info.checkedAt||Date.now()
  };
  dashboard.backup.latestByVmid=latest;
  dashboard.backup.restorePointsByVmid=counts;
  dashboard.backup.machines=(dashboard.machines||[]).map(m=>{
    const vmid=Number(m.vmid),inventoryBackup=latest[vmid]||null,task=latestTasks[vmid]||null;
    const taskBackup=task?{vmid,node:task.node||m.node,storage:'',volid:'',ctime:Number(task.endtime||0),size:0,format:'',notes:'',source:'task',taskStatus:'OK'}:null;
    const lastBackup=Number(taskBackup?.ctime||0)>Number(inventoryBackup?.ctime||0)?taskBackup:inventoryBackup;
    return {
      vmid:m.vmid,name:m.name,type:m.type,node:m.node,lastBackup,
      inventoryBackup,lastSuccessfulTask:task||null,restorePointCount:Number(counts[vmid]||0),
      protectedByJob:!(dashboard.backup.unprotected||[]).some(x=>Number(x.vmid)===vmid),
      backupAbsenceReliable:!!info.absenceReliable
    };
  });
  return dashboard;
}
async function getGuestIps(server, auth, machine) {
  const ips = new Set();
  try {
    if (machine.type === 'qemu') {
      const r = await proxmoxApi(server, `/nodes/${encodeURIComponent(machine.node)}/qemu/${machine.vmid}/agent/network-get-interfaces`, { auth });
      const arr = r?.result || r || [];
      for (const iface of Array.isArray(arr) ? arr : []) for (const ip of iface['ip-addresses'] || []) if (ip['ip-address'] && !String(ip['ip-address']).startsWith('127.') && ip['ip-address'] !== '::1') ips.add(ip['ip-address']);
    } else {
      const arr = await proxmoxApi(server, `/nodes/${encodeURIComponent(machine.node)}/lxc/${machine.vmid}/interfaces`, { auth });
      for (const iface of Array.isArray(arr) ? arr : []) for (const ip of [...(iface.inet ? [iface.inet] : []), ...(iface.inet6 ? [iface.inet6] : [])]) ips.add(String(ip).split('/')[0]);
    }
  } catch {}
  return [...ips];
}
async function integrationJson(baseUrl, reqPath, options = {}) {
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
  const headers = { ...(options.headers || {}) };
  if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await rawRequest(baseUrl.replace(/\/$/,''), reqPath, { method: options.method || 'GET', body, headers, rejectUnauthorized: options.rejectUnauthorized !== false });
  return r.data?.data ?? r.data;
}
function portainerApiKey(item) {
  if (item?.apiKeyEnc) return decryptText(item.apiKeyEnc);
  if (item?.tokenEnc) return decryptText(item.tokenEnc);
  return '';
}
function portainerHeaders(item) {
  const key=portainerApiKey(item);
  if(!key)throw new Error('Clé API Portainer requise.');
  return {'X-API-Key':key};
}
function validateIntegrationUrl(value) {
  const raw=String(value||'').trim().replace(/\/$/,'');
  let parsed;try{parsed=new URL(raw);}catch{throw new Error('URL invalide.');}
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('Portainer doit utiliser une URL HTTP ou HTTPS.');
  return raw;
}
async function portainerSystemInfo(item) {
  const headers=portainerHeaders(item),rejectUnauthorized=!item.allowSelfSigned;
  for(const path of ['/api/system/status','/api/status']){
    try{
      const status=await integrationJson(item.url,path,{headers,rejectUnauthorized});
      if(status&&typeof status==='object'){
        return {
          version:String(status.Version||status.version||status.ServerVersion||''),
          edition:String(status.Edition||status.edition||status.License?.Edition||''),
          instanceId:String(status.InstanceID||status.instanceId||'')
        };
      }
    }catch{}
  }
  return {version:'',edition:'',instanceId:''};
}
async function portainerEnvironmentOverview(item, endpoint) {
  const headers=portainerHeaders(item),rejectUnauthorized=!item.allowSelfSigned,id=Number(endpoint?.Id||endpoint?.id||0);
  const base={
    id,name:String(endpoint?.Name||endpoint?.name||`Environment ${id}`),url:String(endpoint?.URL||endpoint?.url||''),
    type:Number(endpoint?.Type??endpoint?.type??0),portainerStatus:Number(endpoint?.Status??endpoint?.status??0),
    groupId:Number(endpoint?.GroupId??endpoint?.groupId??0),reachable:false,supported:false,kind:'unknown',
    kindLabel:'Docker',dockerVersion:'',hostName:'',os:'',architecture:'',cpus:0,memoryTotal:0,
    containers:{total:0,running:0,stopped:0,healthy:0,unhealthy:0,restarting:0,paused:0},error:''
  };
  if(!id){base.error='Identifiant d’environnement Portainer invalide.';return base;}
  try{
    const info=await integrationJson(item.url,`/api/endpoints/${encodeURIComponent(id)}/docker/info`,{headers,rejectUnauthorized});
    const classification=classifyPortainerEnvironment(info);
    const containers=await integrationJson(item.url,`/api/endpoints/${encodeURIComponent(id)}/docker/containers/json?all=1`,{headers,rejectUnauthorized});
    return {
      ...base,reachable:true,supported:classification.supported,kind:classification.kind,kindLabel:classification.label,
      dockerVersion:String(info?.ServerVersion||info?.serverVersion||''),hostName:String(info?.Name||info?.name||''),
      os:String(info?.OperatingSystem||info?.OSType||''),architecture:String(info?.Architecture||''),
      cpus:Number(info?.NCPU||0),memoryTotal:Number(info?.MemTotal||0),containers:summarizeDockerContainers(containers)
    };
  }catch(error){
    return {...base,error:String(error?.message||error||'Environnement Docker inaccessible.')};
  }
}
async function portainerOverview(item) {
  const headers=portainerHeaders(item),rejectUnauthorized=!item.allowSelfSigned;
  const [system,endpoints]=await Promise.all([
    portainerSystemInfo(item),
    integrationJson(item.url,'/api/endpoints',{headers,rejectUnauthorized})
  ]);
  const rows=Array.isArray(endpoints)?endpoints:[];
  const environments=[];
  for(let i=0;i<rows.length;i+=4){
    environments.push(...await Promise.all(rows.slice(i,i+4).map(row=>portainerEnvironmentOverview(item,row))));
  }
  const supported=environments.filter(x=>x.supported),reachable=environments.filter(x=>x.reachable);
  const totals=environments.reduce((acc,row)=>{
    for(const key of ['total','running','stopped','healthy','unhealthy','restarting','paused'])acc[key]+=Number(row.containers?.[key]||0);
    return acc;
  },{total:0,running:0,stopped:0,healthy:0,unhealthy:0,restarting:0,paused:0});
  return {
    id:item.id,name:item.name||'Portainer',url:item.url,type:'portainer',
    version:system.version,edition:system.edition,environmentCount:environments.length,
    reachableCount:reachable.length,supportedDockerCount:supported.length,containers:totals,environments
  };
}
async function cachedPortainerOverview(item,force=false) {
  const key=String(item.id||item.url||'portainer'),cached=PORTAINER_OVERVIEW_CACHE.get(key);
  if(!force&&cached?.value&&cached.expiresAt>Date.now())return cached.value;
  if(!force&&cached?.promise)return cached.promise;
  const promise=portainerOverview(item);
  PORTAINER_OVERVIEW_CACHE.set(key,{promise,expiresAt:Date.now()+PORTAINER_OVERVIEW_CACHE_MS});
  try{
    const value=await promise;
    PORTAINER_OVERVIEW_CACHE.set(key,{value,expiresAt:Date.now()+PORTAINER_OVERVIEW_CACHE_MS});
    return value;
  }catch(error){
    PORTAINER_OVERVIEW_CACHE.delete(key);
    throw error;
  }
}

function findPortainerIntegration(id) {
  return jsonRead(INTEGRATIONS_FILE,[]).find(x=>x.id===id&&x.type==='portainer'&&x.enabled!==false)||null;
}
function dockerEndpointId(value) {
  const id=Number(value);if(!Number.isInteger(id)||id<=0)throw new Error('Environnement Portainer invalide.');return id;
}
function dockerObjectId(value) {
  const id=String(value||'').trim();if(!/^[A-Za-z0-9_.:-]{1,128}$/.test(id))throw new Error('Identifiant Docker invalide.');return id;
}
async function portainerDockerJson(item,endpointId,dockerPath,options={}) {
  const id=dockerEndpointId(endpointId),headers={...portainerHeaders(item),...(options.headers||{})};
  return integrationJson(item.url,`/api/endpoints/${encodeURIComponent(id)}/docker${dockerPath}`,{...options,headers,rejectUnauthorized:!item.allowSelfSigned});
}
async function portainerDockerBuffer(item,endpointId,dockerPath,options={}) {
  const id=dockerEndpointId(endpointId),headers={...portainerHeaders(item),...(options.headers||{})};
  return rawBufferRequest(item.url,`/api/endpoints/${encodeURIComponent(id)}/docker${dockerPath}`,{...options,headers,rejectUnauthorized:!item.allowSelfSigned});
}
async function portainerContainerList(item,endpointId) {
  const rows=await portainerDockerJson(item,endpointId,'/containers/json?all=1');
  return (Array.isArray(rows)?rows:[]).map(normalizeDockerContainer);
}
async function portainerStackList(item,endpointId) {
  const id=dockerEndpointId(endpointId),rows=await integrationJson(item.url,'/api/stacks',{headers:portainerHeaders(item),rejectUnauthorized:!item.allowSelfSigned});
  return (Array.isArray(rows)?rows:[]).map(normalizePortainerStack).filter(s=>s.endpointId===id);
}
function dockerTopologyMappings() {
  const rows=jsonRead(DOCKER_TOPOLOGY_FILE,{});
  return rows&&typeof rows==='object'&&!Array.isArray(rows)?rows:{};
}
function dockerTopologyKey(portainerId,endpointId){return `${String(portainerId||'')}:${Number(endpointId||0)}`;}
function normalizeDockerTopologyMapping(row={}) {
  return {
    serverId:String(row.serverId||'').slice(0,120),
    type:['qemu','lxc'].includes(String(row.type||''))?String(row.type):'',
    vmid:Number(row.vmid||0),
    node:String(row.node||'').slice(0,120),
    name:String(row.name||'').slice(0,160),
    updatedAt:new Date().toISOString()
  };
}
async function dockerContainerStats(item,endpointId,containerId) {
  try{
    const id=dockerObjectId(containerId);
    const s=await portainerDockerJson(item,endpointId,`/containers/${encodeURIComponent(id)}/stats?stream=false`);
    const cpuTotal=Number(s?.cpu_stats?.cpu_usage?.total_usage||0),preCpu=Number(s?.precpu_stats?.cpu_usage?.total_usage||0);
    const system=Number(s?.cpu_stats?.system_cpu_usage||0),preSystem=Number(s?.precpu_stats?.system_cpu_usage||0);
    const online=Number(s?.cpu_stats?.online_cpus||s?.cpu_stats?.cpu_usage?.percpu_usage?.length||1);
    const cpuDelta=cpuTotal-preCpu,systemDelta=system-preSystem;
    const cpuPct=cpuDelta>0&&systemDelta>0?(cpuDelta/systemDelta)*online*100:0;
    const mem=Number(s?.memory_stats?.usage||0),cache=Number(s?.memory_stats?.stats?.cache||s?.memory_stats?.stats?.inactive_file||0),limit=Number(s?.memory_stats?.limit||0);
    const used=Math.max(0,mem-cache);
    const networks=Object.values(s?.networks||{});
    const networkRxBytes=networks.reduce((n,row)=>n+Number(row?.rx_bytes||0),0);
    const networkTxBytes=networks.reduce((n,row)=>n+Number(row?.tx_bytes||0),0);
    return {
      cpuPct:Number(cpuPct.toFixed(2)),memoryUsed:used,memoryLimit:limit,
      memoryPct:limit?Number((used/limit*100).toFixed(2)):0,
      networkRxBytes,networkTxBytes
    };
  }catch{return null}
}

function dockerHistoryStore(){
  const data=jsonRead(DOCKER_METRICS_FILE,{samples:[]});
  return {samples:Array.isArray(data?.samples)?data.samples:[]};
}
function dockerHistoryScopeFromRows(rows=[],hostCpuTotal=0,hostMemoryTotal=0,alerts=[]) {
  const statsRows=rows.filter(x=>x?.stats);
  const rawCpu=statsRows.reduce((n,x)=>n+Number(x.stats?.cpuPct||0),0);
  const memoryUsed=statsRows.reduce((n,x)=>n+Number(x.stats?.memoryUsed||0),0);
  const networkRxBytes=statsRows.reduce((n,x)=>n+Number(x.stats?.networkRxBytes||0),0);
  const networkTxBytes=statsRows.reduce((n,x)=>n+Number(x.stats?.networkTxBytes||0),0);
  return {
    cpuPct:hostCpuTotal>0?Number(Math.min(100,rawCpu/hostCpuTotal).toFixed(2)):Number(rawCpu.toFixed(2)),
    memoryUsed,memoryTotal:Number(hostMemoryTotal||0),
    memoryPct:hostMemoryTotal>0?Number(Math.min(100,memoryUsed/hostMemoryTotal*100).toFixed(2)):0,
    running:rows.filter(x=>x.state==='running').length,
    stopped:rows.filter(x=>!['running','restarting','paused'].includes(String(x.state||''))).length,
    unhealthy:rows.filter(x=>x.health==='unhealthy').length,
    restarting:rows.filter(x=>x.state==='restarting').length,
    networkRxBytes,networkTxBytes,
    incidents:Array.isArray(alerts)?alerts.length:0
  };
}
function recordDockerHistoryScopes(scopes,now=Date.now()){
  const store=dockerHistoryStore(),previous=store.samples.at(-1),elapsed=previous?Math.max(1,now-Number(previous.time||0)):0;
  const withRates={};
  for(const [key,row] of Object.entries(scopes||{})){
    const prev=previous?.scopes?.[key]||{};
    withRates[key]={
      ...row,
      rxMbps:previous?dockerNetworkMbps(row.networkRxBytes,prev.networkRxBytes,elapsed):0,
      txMbps:previous?dockerNetworkMbps(row.networkTxBytes,prev.networkTxBytes,elapsed):0
    };
  }
  const next=appendDockerHistory(store.samples,{time:now,scopes:withRates},{now,minIntervalMs:60_000});
  if(next.length!==store.samples.length)jsonWrite(DOCKER_METRICS_FILE,{samples:next});
  return withRates;
}
function recordDockerDashboardHistory(dashboard,now=Date.now()){
  if(DEMO_MODE)return;
  const scopes={};
  for(const env of dashboard.environments||[]){
    const key=dockerTopologyKey(env.portainerId,env.endpointId);
    const rows=(dashboard.containers||[]).filter(x=>dockerTopologyKey(x.portainerId,x.endpointId)===key);
    const envAlerts=(dashboard.alerts||[]).filter(x=>String(x.portainerId||'')===String(env.portainerId)&&Number(x.endpointId||0)===Number(env.endpointId));
    scopes[key]=dockerHistoryScopeFromRows(rows,Number(env.cpus||0),Number(env.memoryTotal||0),envAlerts);
  }
  const allRows=dashboard.containers||[],cpuTotal=(dashboard.environments||[]).reduce((n,x)=>n+Number(x.cpus||0),0),memoryTotal=(dashboard.environments||[]).reduce((n,x)=>n+Number(x.memoryTotal||0),0);
  scopes.all=dockerHistoryScopeFromRows(allRows,cpuTotal,memoryTotal,dashboard.alerts||[]);
  recordDockerHistoryScopes(scopes,now);
}
function demoDockerHistory(range='day',scope='all'){
  const key=Object.prototype.hasOwnProperty.call(RANGE_MS,String(range))?String(range):'day';
  const span=RANGE_MS[key],count=key==='hour'?60:key==='day'?96:key==='week'?168:180,now=Date.now(),step=span/Math.max(1,count-1);
  const seed=String(scope||'all').split('').reduce((n,ch)=>n+ch.charCodeAt(0),0)%17;
  const points=Array.from({length:count},(_,i)=>{
    const wave=(Math.sin((i+seed)/8)+1)/2,fast=(Math.sin((i+seed)/3.7)+1)/2;
    return {
      time:Math.round(now-span+i*step),
      cpuPct:Number((12+wave*31+fast*9).toFixed(2)),
      memoryPct:Number((38+wave*23).toFixed(2)),
      running:scope==='all'?10:5,
      stopped:scope==='all'?2:1,
      unhealthy:i>count*.72&&i<count*.82?1:0,
      restarting:i>count*.52&&i<count*.57?1:0,
      rxMbps:Number((3+wave*18+fast*4).toFixed(3)),
      txMbps:Number((1.4+wave*10+fast*2).toFixed(3)),
      incidents:i>count*.72&&i<count*.82?1:0
    };
  });
  return {range:key,scope:String(scope||'all'),from:now-span,to:now,points};
}
function dockerHistoryData(range='day',scope='all'){
  if(DEMO_MODE)return demoDockerHistory(range,scope);
  return selectDockerHistory(dockerHistoryStore().samples,{range,scope,now:Date.now(),maxPoints:220});
}

async function dockerDashboardData(force=false) {
  const alerts=activeDockerAlerts();
  const overview=DEMO_MODE?demoDockerOverview():await (async()=>{
    const rows=jsonRead(INTEGRATIONS_FILE,[]).filter(x=>x.type==='portainer'&&x.enabled!==false);
    const portainers=await Promise.all(rows.map(async item=>{
      try{return {...await cachedPortainerOverview(item,force),status:'online',error:''};}
      catch(error){return {id:item.id,name:item.name||'Portainer',url:item.url,status:'error',error:String(error?.message||error),environments:[]};}
    }));
    const summary=portainers.reduce((acc,p)=>{acc.portainers++;for(const e of p.environments||[]){acc.environments++;if(e.reachable)acc.reachable++;acc.containers+=Number(e.containers?.total||0);acc.running+=Number(e.containers?.running||0);acc.stopped+=Number(e.containers?.stopped||0);acc.unhealthy+=Number(e.containers?.unhealthy||0);}return acc;},{portainers:0,environments:0,reachable:0,containers:0,running:0,stopped:0,unhealthy:0});
    return {configured:rows.length>0,portainers,summary};
  })();
  const environments=[],containers=[],stacks=[];
  for(const p of overview.portainers||[]){
    for(const env of p.environments||[]){
      const base={
        portainerId:p.id,portainerName:p.name,endpointId:Number(env.id),environmentName:env.name,
        hostName:env.hostName||'',reachable:!!env.reachable,supported:!!env.supported,
        cpus:Number(env.cpus||0),memoryTotal:Number(env.memoryTotal||0)
      };
      if(!env.reachable||!env.supported){environments.push({...base,containers:env.containers||{},stackCount:0});continue;}
      try{
        const envContainers=DEMO_MODE?demoDockerContainers(env.id):await portainerContainerList(findPortainerIntegration(p.id),env.id);
        const envStacks=DEMO_MODE?demoDockerStacks(env.id):await portainerStackList(findPortainerIntegration(p.id),env.id).catch(()=>[]);
        const running=envContainers.filter(x=>x.state==='running').slice(0,30);
        const metricRows=[];
        for(let i=0;i<running.length;i+=5){
          const batch=running.slice(i,i+5);
          metricRows.push(...await Promise.all(batch.map(async ct=>{
            if(DEMO_MODE)return demoDockerContainerDetails(env.id,ct.id)?.stats||null;
            return dockerContainerStats(findPortainerIntegration(p.id),env.id,ct.id);
          })));
        }
        const metricById=new Map(running.map((ct,i)=>[ct.id,metricRows[i]||null]));
        const normalized=envContainers.map(ct=>({...ct,...base,stats:metricById.get(ct.id)||null}));
        containers.push(...normalized);
        stacks.push(...envStacks.map(s=>({...s,...base,containerCount:normalized.filter(c=>c.stack===s.name).length})));
        const rawCpu=normalized.reduce((n,x)=>n+Number(x.stats?.cpuPct||0),0),memoryUsed=normalized.reduce((n,x)=>n+Number(x.stats?.memoryUsed||0),0);
        environments.push({
          ...base,containers:summarizeDockerContainers(envContainers),stackCount:envStacks.length,
          cpuTotalPct:rawCpu,cpuPct:base.cpus?Number(Math.min(100,rawCpu/base.cpus).toFixed(2)):Number(rawCpu.toFixed(2)),
          memoryUsed,memoryPct:base.memoryTotal?Number(Math.min(100,memoryUsed/base.memoryTotal*100).toFixed(2)):0,
          networkRxBytes:normalized.reduce((n,x)=>n+Number(x.stats?.networkRxBytes||0),0),
          networkTxBytes:normalized.reduce((n,x)=>n+Number(x.stats?.networkTxBytes||0),0)
        });
      }catch(error){environments.push({...base,containers:env.containers||{},stackCount:0,error:String(error?.message||error)});}
    }
  }
  const topCpu=[...containers].filter(x=>x.stats).sort((a,b)=>Number(b.stats?.cpuPct||0)-Number(a.stats?.cpuPct||0)).slice(0,8);
  const topMemory=[...containers].filter(x=>x.stats).sort((a,b)=>Number(b.stats?.memoryUsed||0)-Number(a.stats?.memoryUsed||0)).slice(0,8);
  const dashboard={generatedAt:new Date().toISOString(),overview:overview.summary||{},environments,containers,stacks,alerts,topCpu,topMemory,topology:dockerTopologyMappings()};
  recordDockerDashboardHistory(dashboard,Date.now());
  return dashboard;
}

function dockerMonitorState() {
  const state=jsonRead(DOCKER_MONITOR_STATE_FILE,{});
  return {
    lastPollAt:Number(state?.lastPollAt||0),
    checkedAt:String(state?.checkedAt||''),
    incidents:state?.incidents&&typeof state.incidents==='object'?state.incidents:{},
    snapshots:state?.snapshots&&typeof state.snapshots==='object'?state.snapshots:{},
    manualIntents:state?.manualIntents&&typeof state.manualIntents==='object'?state.manualIntents:{}
  };
}
function saveDockerMonitorState(state){jsonWrite(DOCKER_MONITOR_STATE_FILE,state);}
function dockerMonitorConfig(settings={}) {
  const cfg=settings?.alerts?.docker||{};
  return {
    enabled:cfg.enabled!==false,
    confirmations:Math.max(1,Math.min(5,Number(cfg.confirmations||2))),
    cooldownMinutes:Math.max(5,Math.min(1440,Number(cfg.cooldownMinutes||30))),
    restartDeltaWarning:Math.max(1,Math.min(50,Number(cfg.restartDeltaWarning||3))),
    maxMetricContainers:Math.max(0,Math.min(100,Number(cfg.maxMetricContainers??50))),
    cpuWarning:Math.max(1,Math.min(100,Number(settings?.thresholds?.cpuWarning||85))),
    memoryWarning:Math.max(1,Math.min(100,Number(settings?.thresholds?.memoryWarning||85))),
    storageWarning:Math.max(1,Math.min(100,Number(settings?.thresholds?.storageWarning||85))),
    storageCritical:Math.max(1,Math.min(100,Number(settings?.thresholds?.storageCritical||95)))
  };
}
function dockerMonitorKey(...parts){return parts.map(x=>String(x??'').replace(/[^A-Za-z0-9_.:-]/g,'_')).join(':');}
function dockerManualIntentKey(portainerId,endpointId,containerId){return dockerMonitorKey('container',portainerId,endpointId,containerId);}
function recordDockerManualIntent(portainerId,endpointId,containerId,action) {
  const state=dockerMonitorState(),now=Date.now(),key=dockerManualIntentKey(portainerId,endpointId,containerId);
  state.manualIntents[key]={action:String(action||''),at:now,expiresAt:now+15*60*1000};
  saveDockerMonitorState(state);
}
function dockerManualStopIsExpected(state,portainerId,endpointId,containerId,now=Date.now()) {
  const key=dockerManualIntentKey(portainerId,endpointId,containerId),row=state.manualIntents?.[key];
  return !!(row&&Number(row.expiresAt||0)>now&&['stop','pause','restart'].includes(String(row.action||'')));
}
function dockerIncidentPublic(row={}) {
  return {
    id:String(row.id||''),code:String(row.type||'docker.unknown'),title:String(row.title||'Incident Docker'),
    detail:String(row.detail||''),target:String(row.target||''),severity:String(row.severity||'warning'),
    route:'docker',facts:Array.isArray(row.facts)?row.facts:[],firstSeen:row.firstSeen||'',lastSeen:row.lastSeen||'',
    portainerId:row.portainerId||'',endpointId:row.endpointId||null,containerId:row.containerId||'',stackName:row.stackName||''
  };
}
function activeDockerAlerts() {
  const state=dockerMonitorState();
  return Object.values(state.incidents||{}).filter(x=>x?.active===true).map(dockerIncidentPublic).sort((a,b)=>String(b.lastSeen||'').localeCompare(String(a.lastSeen||'')));
}
async function dockerMonitorObserve(state,observed,observation,settings,now) {
  const cfg=dockerMonitorConfig(settings),id=String(observation.id),previous=state.incidents[id]||{};
  const transition=dockerIncidentTransition(previous,true,now,{confirmations:cfg.confirmations,cooldownMinutes:cfg.cooldownMinutes});
  const row={...previous,...observation,...transition,id};
  if(transition.shouldNotify){
    const logExcerpt=await dockerIncidentLogExcerpt(row);
    const errorFact=(row.facts||[]).find(f=>String(f?.label||'').toLowerCase().includes('erreur'));
    await sendAlertChannels(settings,`ProxPanel · ${row.title}`,row.detail,{
      type:row.type,severity:row.severity,serverName:row.portainerName||'Docker',target:row.target||'',
      recommendation:row.recommendation||'',details:(row.facts||[]).map(f=>typeof f==='string'?f:`${f.label}: ${f.value}`),
      source:'Docker / Portainer API',error:errorFact?.value||'',logExcerpt,
      technicalDetails:[
        row.endpointId?{label:'Endpoint Portainer',value:String(row.endpointId)}:null,
        row.containerId?{label:'Container ID',value:String(row.containerId).slice(0,64)}:null,
        row.stackName?{label:'Stack',value:String(row.stackName)}:null
      ].filter(Boolean)
    });
    row.lastNotifiedAt=now;
    addAuditSystem('alerts.docker.sent',row.target||row.portainerName||'Docker',{type:row.type,id:row.id});
  }
  state.incidents[id]=row;observed.add(id);
}
async function dockerMonitorResolveScopes(state,observed,checkedScopes,settings,now) {
  for(const [id,previous] of Object.entries(state.incidents||{})){
    if(observed.has(id)||!checkedScopes.has(String(previous.scope||'')))continue;
    const transition=dockerIncidentTransition(previous,false,now,{confirmations:dockerMonitorConfig(settings).confirmations,cooldownMinutes:dockerMonitorConfig(settings).cooldownMinutes});
    const row={...previous,...transition};
    if(transition.shouldRecover&&Number(previous.lastNotifiedAt||0)>0){
      await sendAlertChannels(settings,'Docker rétabli',`${previous.target||previous.title||'La ressource Docker'} est de nouveau dans un état normal.`,{
        type:'docker.recovered',severity:'info',serverName:previous.portainerName||'Docker',target:previous.target||'',
        details:[`Incident résolu : ${previous.title||previous.type}`]
      });
      addAuditSystem('alerts.docker.recovery',previous.target||'Docker',{type:previous.type,id});
    }
    state.incidents[id]=row;
  }
}
async function dockerContainerMonitorDetails(item,endpointId,container,wantStats=true) {
  let inspect=null,stats=null;
  try{inspect=await portainerDockerJson(item,endpointId,`/containers/${encodeURIComponent(container.id)}/json`);}catch{}
  if(wantStats&&container.state==='running')stats=await dockerContainerStats(item,endpointId,container.id);
  return {
    restartCount:Number(inspect?.RestartCount||0),
    state:String(inspect?.State?.Status||container.state||'unknown').toLowerCase(),
    health:String(inspect?.State?.Health?.Status||container.health||'').toLowerCase(),
    restartPolicy:String(inspect?.HostConfig?.RestartPolicy?.Name||''),
    stats
  };
}
async function monitorDockerEnvironment(item,env,previousSnapshot,state,settings,now,observed,checkedScopes) {
  const cfg=dockerMonitorConfig(settings),pid=item.id,eid=Number(env.id),containerScope=`containers:${pid}:${eid}`;
  let containers,stacks=null,info=null;
  try{
    [containers,info]=await Promise.all([
      portainerContainerList(item,eid),
      portainerDockerJson(item,eid,'/info').catch(()=>null)
    ]);
  }catch{return null}
  try{stacks=await portainerStackList(item,eid);}catch{}
  checkedScopes.add(containerScope);
  const stackScope=`stacks:${pid}:${eid}`;
  if(Array.isArray(stacks))checkedScopes.add(stackScope);
  const activeStacks=new Map((Array.isArray(stacks)?stacks:[]).map(s=>[s.name,s]));
  const detailRows=[];
  for(let i=0;i<containers.length;i+=5){
    const batch=containers.slice(i,i+5);
    detailRows.push(...await Promise.all(batch.map((ct,index)=>dockerContainerMonitorDetails(item,eid,ct,(i+index)<cfg.maxMetricContainers))));
  }
  const snapshot={
    checkedAt:new Date(now).toISOString(),portainerId:pid,endpointId:eid,environmentName:env.name,
    cpus:Number(env.cpus||0),memoryTotal:Number(env.memoryTotal||0),containers:{}
  };
  for(let i=0;i<containers.length;i++){
    const ct=containers[i],detail=detailRows[i]||{},previous=previousSnapshot?.containers?.[ct.id]||null;
    const stateNow=detail.state||ct.state||'unknown',health=detail.health||ct.health||'',target=`${ct.name||ct.id.slice(0,12)} · ${env.name}`;
    snapshot.containers[ct.id]={
      name:ct.name,state:stateNow,health,restartCount:Number(detail.restartCount||0),stack:ct.stack||'',checkedAt:now,
      stats:detail.stats||null
    };

    if(health==='unhealthy'){
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.container.unhealthy',pid,eid,ct.id),type:'docker.container.unhealthy',scope:containerScope,severity:'critical',
        title:'Conteneur Docker unhealthy',detail:`${ct.name||ct.id.slice(0,12)} est déclaré unhealthy par Docker.`,target,
        portainerId:pid,portainerName:item.name,endpointId:eid,containerId:ct.id,
        recommendation:'Ouvre les logs et le détail du conteneur, puis vérifie son healthcheck avant un redémarrage.',
        facts:[{label:'Environnement',value:env.name},{label:'État',value:stateNow},{label:'Health',value:health},{label:'Image',value:ct.image||'—'}]
      },settings,now);
    }

    const stack=ct.stack?activeStacks.get(ct.stack):null;
    const stackMetadataReliable=Array.isArray(stacks);
    const stackIntentionallyInactive=stack&&stack.active===false;
    const transitionedToStopped=previous&&['running','restarting'].includes(String(previous.state||''))&&!['running','restarting','paused'].includes(stateNow);
    if(transitionedToStopped&&(!ct.stack||stackMetadataReliable)&&!stackIntentionallyInactive&&!dockerManualStopIsExpected(state,pid,eid,ct.id,now)){
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.container.stopped',pid,eid,ct.id),type:'docker.container.stopped',scope:containerScope,severity:'critical',
        title:'Conteneur Docker arrêté',detail:`${ct.name||ct.id.slice(0,12)} était actif et est maintenant ${stateNow}.`,target,
        portainerId:pid,portainerName:item.name,endpointId:eid,containerId:ct.id,
        recommendation:'Vérifie les logs du conteneur et la cause de son arrêt avant de le redémarrer.',
        facts:[{label:'Environnement',value:env.name},{label:'État précédent',value:previous.state},{label:'État actuel',value:stateNow},{label:'Stack',value:ct.stack||'—'}]
      },settings,now);
    }

    const restartDelta=previous?Math.max(0,Number(detail.restartCount||0)-Number(previous.restartCount||0)):0;
    if((stateNow==='restarting'&&previous?.state==='restarting')||restartDelta>=cfg.restartDeltaWarning){
      const inspectScope=`inspect:${pid}:${eid}:${ct.id}`;checkedScopes.add(inspectScope);
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.container.restarts',pid,eid,ct.id),type:'docker.container.restarts',scope:inspectScope,severity:'warning',
        title:'Redémarrages Docker répétés',detail:`${ct.name||ct.id.slice(0,12)} redémarre de façon répétée.`,target,
        portainerId:pid,portainerName:item.name,endpointId:eid,containerId:ct.id,
        recommendation:'Vérifie les logs, le healthcheck et la restart policy du conteneur.',
        facts:[{label:'Restart count',value:String(detail.restartCount||0)},{label:'Nouveaux redémarrages',value:String(restartDelta)},{label:'Restart policy',value:detail.restartPolicy||'—'}]
      },settings,now);
    } else if(previous){
      checkedScopes.add(`inspect:${pid}:${eid}:${ct.id}`);
    }

    if(detail.stats){
      const metricScope=`metrics:${pid}:${eid}:${ct.id}`;checkedScopes.add(metricScope);
      if(Number(detail.stats.cpuPct||0)>=cfg.cpuWarning){
        await dockerMonitorObserve(state,observed,{
          id:dockerMonitorKey('docker.resources.cpu',pid,eid,ct.id),type:'docker.resources.cpu',scope:metricScope,severity:'warning',
          title:'CPU Docker élevée',detail:`${ct.name||ct.id.slice(0,12)} utilise ${Number(detail.stats.cpuPct||0).toFixed(1)} % CPU.`,target,
          portainerId:pid,portainerName:item.name,endpointId:eid,containerId:ct.id,
          recommendation:'Contrôle la charge du conteneur et son activité avant d’ajuster ses limites.',
          facts:[{label:'CPU',value:`${Number(detail.stats.cpuPct||0).toFixed(1)} %`},{label:'Seuil',value:`${cfg.cpuWarning} %`}]
        },settings,now);
      }
      if(Number(detail.stats.memoryPct||0)>=cfg.memoryWarning){
        await dockerMonitorObserve(state,observed,{
          id:dockerMonitorKey('docker.resources.memory',pid,eid,ct.id),type:'docker.resources.memory',scope:metricScope,severity:'warning',
          title:'RAM Docker élevée',detail:`${ct.name||ct.id.slice(0,12)} utilise ${Number(detail.stats.memoryPct||0).toFixed(1)} % de sa limite mémoire.`,target,
          portainerId:pid,portainerName:item.name,endpointId:eid,containerId:ct.id,
          recommendation:'Contrôle la consommation mémoire du conteneur et recherche une fuite ou une limite trop basse.',
          facts:[{label:'RAM',value:`${Number(detail.stats.memoryPct||0).toFixed(1)} %`},{label:'Seuil',value:`${cfg.memoryWarning} %`}]
        },settings,now);
      }
    }
  }

  for(const stack of (Array.isArray(stacks)?stacks:[]).filter(s=>s.active)){
    const members=containers.filter(c=>c.stack===stack.name);
    if(members.length<2)continue;
    const bad=members.filter(c=>c.health==='unhealthy'||!['running','restarting','paused'].includes(String(c.state||'')));
    if(bad.length>0&&bad.length<members.length){
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.stack.degraded',pid,eid,stack.id),type:'docker.stack.degraded',scope:stackScope,severity:'warning',
        title:'Stack Docker partiellement dégradée',detail:`${stack.name} a ${bad.length}/${members.length} conteneur(s) en défaut.`,target:`${stack.name} · ${env.name}`,
        portainerId:pid,portainerName:item.name,endpointId:eid,stackName:stack.name,
        recommendation:'Ouvre la stack et vérifie les conteneurs en défaut avant tout redeploy.',
        facts:[{label:'Conteneurs',value:String(members.length)},{label:'En défaut',value:bad.map(x=>x.name).join(', ')}]
      },settings,now);
    }
  }

  if(info){
    const diskScope=`disk:${pid}:${eid}`;checkedScopes.add(diskScope);
    const pressure=dockerDiskPressureFromInfo(info,cfg.storageWarning,cfg.storageCritical);
    if(pressure&&pressure.severity!=='ok'){
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.storage.pressure',pid,eid),type:'docker.storage.pressure',scope:diskScope,severity:pressure.severity,
        title:'Stockage Docker sous pression',detail:`${env.name} utilise ${pressure.pct.toFixed(1)} % de l’espace Docker mesurable.`,target:env.name,
        portainerId:pid,portainerName:item.name,endpointId:eid,
        recommendation:'Nettoie les images/volumes inutilisés ou augmente la capacité après vérification des données Docker.',
        facts:[{label:'Utilisé',value:`${pressure.pct.toFixed(1)} %`},{label:'Source',value:pressure.source}]
      },settings,now);
    }
  }
  return snapshot;
}
async function runDockerBackgroundAlerts(settings,now=Date.now()) {
  const cfg=dockerMonitorConfig(settings);if(!cfg.enabled||DEMO_MODE)return;
  const state=dockerMonitorState(),interval=Math.max(1,Number(settings?.alerts?.pollMinutes||5))*60000;
  if(now-Number(state.lastPollAt||0)<interval)return;
  state.lastPollAt=now;
  const observed=new Set(),checkedScopes=new Set();
  for(const [key,intent] of Object.entries(state.manualIntents||{}))if(Number(intent?.expiresAt||0)<=now)delete state.manualIntents[key];

  const portainers=jsonRead(INTEGRATIONS_FILE,[]).filter(x=>x.type==='portainer'&&x.enabled!==false);
  for(const item of portainers){
    const portainerScope=`portainer:${item.id}`;let overview;
    try{
      overview=await portainerOverview(item);checkedScopes.add(portainerScope);
    }catch(error){
      checkedScopes.add(portainerScope);
      await dockerMonitorObserve(state,observed,{
        id:dockerMonitorKey('docker.portainer.unreachable',item.id),type:'docker.portainer.unreachable',scope:portainerScope,severity:'critical',
        title:'Portainer inaccessible',detail:`${item.name||'Portainer'} ne répond plus à ProxPanel.`,target:item.name||'Portainer',
        portainerId:item.id,portainerName:item.name||'Portainer',
        recommendation:'Vérifie le service Portainer, son URL, le certificat TLS et la connectivité depuis ProxPanel.',
        facts:[{label:'URL',value:item.url},{label:'Erreur',value:String(error?.message||error)}]
      },settings,now);
      continue;
    }

    for(const env of overview.environments||[]){
      const engineScope=`engine:${item.id}:${env.id}`;checkedScopes.add(engineScope);
      if(!env.reachable){
        await dockerMonitorObserve(state,observed,{
          id:dockerMonitorKey('docker.engine.unreachable',item.id,env.id),type:'docker.engine.unreachable',scope:engineScope,severity:'critical',
          title:'Docker Engine inaccessible',detail:`${env.name} est connu de Portainer mais son Docker Engine ne répond pas.`,target:env.name,
          portainerId:item.id,portainerName:item.name||'Portainer',endpointId:Number(env.id),
          recommendation:'Vérifie le Docker Engine, l’agent Portainer et la connectivité entre Portainer et cet environnement.',
          facts:[{label:'Portainer',value:item.name||'Portainer'},{label:'Environnement',value:env.name},{label:'Erreur',value:env.error||'Connexion Docker impossible'}]
        },settings,now);
        continue;
      }
      if(!env.supported)continue;
      const snapshotKey=`${item.id}:${env.id}`,previous=state.snapshots[snapshotKey]||null;
      const snapshot=await monitorDockerEnvironment(item,env,previous,state,settings,now,observed,checkedScopes);
      if(snapshot)state.snapshots[snapshotKey]=snapshot;
    }
  }
  await dockerMonitorResolveScopes(state,observed,checkedScopes,settings,now);
  const keepAfter=now-7*24*60*60*1000;
  for(const [id,row] of Object.entries(state.incidents||{})){
    if(row.active!==true&&Number(new Date(row.resolvedAt||row.lastSeen||0).getTime()||0)<keepAfter)delete state.incidents[id];
  }
  const historyScopes={},freshSnapshotMaxAge=Math.max(interval*2,10*60*1000);
  for(const [snapshotKey,snapshot] of Object.entries(state.snapshots||{})){
    if(now-Number(new Date(snapshot?.checkedAt||0).getTime()||0)>freshSnapshotMaxAge)continue;
    const rows=Object.values(snapshot?.containers||{}).map(x=>({state:x.state,health:x.health,stats:x.stats}));
    const envAlerts=Object.values(state.incidents||{}).filter(x=>x?.active===true&&String(x.portainerId||'')===String(snapshot.portainerId||'')&&Number(x.endpointId||0)===Number(snapshot.endpointId||0));
    historyScopes[snapshotKey]=dockerHistoryScopeFromRows(rows,Number(snapshot.cpus||0),Number(snapshot.memoryTotal||0),envAlerts);
  }
  const allSnapshots=Object.values(state.snapshots||{}).filter(snapshot=>now-Number(new Date(snapshot?.checkedAt||0).getTime()||0)<=freshSnapshotMaxAge),allRows=allSnapshots.flatMap(snapshot=>Object.values(snapshot?.containers||{}).map(x=>({state:x.state,health:x.health,stats:x.stats})));
  historyScopes.all=dockerHistoryScopeFromRows(
    allRows,
    allSnapshots.reduce((n,x)=>n+Number(x.cpus||0),0),
    allSnapshots.reduce((n,x)=>n+Number(x.memoryTotal||0),0),
    Object.values(state.incidents||{}).filter(x=>x?.active===true)
  );
  recordDockerHistoryScopes(historyScopes,now);
  state.checkedAt=new Date(now).toISOString();saveDockerMonitorState(state);
}

async function testIntegration(item) {
  const url = String(item.url || '').replace(/\/$/,'');
  if (!url) throw new Error('URL requise.');
  if (item.type === 'portainer') {
    const r=await cachedPortainerOverview(item,true);
    return {
      ok:true,
      detail:`${r.environmentCount} environnement(s) · ${r.supportedDockerCount} Docker Standalone compatible(s)`,
      version:r.version||'',edition:r.edition||'',environmentCount:r.environmentCount,
      supportedDockerCount:r.supportedDockerCount,reachableCount:r.reachableCount,containers:r.containers
    };
  }
  if (item.type === 'grafana') {
    const r = await integrationJson(url, '/api/health', { rejectUnauthorized: !item.allowSelfSigned });
    return { ok: true, detail: r?.version ? `Grafana ${r.version}` : 'Grafana joignable' };
  }
  if (item.type === 'uptimekuma') {
    const slug = encodeURIComponent(item.statusPageSlug || 'default');
    const r = await integrationJson(url, `/api/status-page/${slug}`, { rejectUnauthorized: !item.allowSelfSigned });
    return { ok: true, detail: r?.config?.title || 'Status page joignable' };
  }
  if (item.type === 'npm') {
    const identity = item.username || '';
    const secret = item.passwordEnc ? decryptText(item.passwordEnc) : '';
    const token = await integrationJson(url, '/api/tokens', { method: 'POST', body: { identity, secret }, rejectUnauthorized: !item.allowSelfSigned });
    if (!token?.token) throw new Error('Token NPM non reçu.');
    const hosts = await integrationJson(url, '/api/nginx/proxy-hosts', { headers: { Authorization: `Bearer ${token.token}` }, rejectUnauthorized: !item.allowSelfSigned });
    return { ok: true, detail: `${Array.isArray(hosts) ? hosts.length : 0} proxy host(s)` };
  }
  if (item.type === 'pbs') {
    const username = item.username || '';
    const password = item.passwordEnc ? decryptText(item.passwordEnc) : '';
    const login = await rawRequest(url, '/api2/json/access/ticket', { method: 'POST', body: encodeForm({ username, password }), headers: {'Content-Type':'application/x-www-form-urlencoded'}, rejectUnauthorized: !item.allowSelfSigned });
    const ticket = login.data?.data?.ticket;
    if (!ticket) throw new Error('Ticket PBS non reçu.');
    let stores = [];
    try { stores = await integrationJson(url, '/api2/json/admin/datastore', { headers: { Cookie: `PBSAuthCookie=${encodeURIComponent(ticket)}` }, rejectUnauthorized: !item.allowSelfSigned }); } catch {}
    return { ok: true, detail: `${Array.isArray(stores) ? stores.length : 0} datastore(s)` };
  }
  throw new Error('Type d’intégration inconnu.');
}
async function getNpmHosts(item) {
  const url = String(item.url || '').replace(/\/$/,'');
  const token = await integrationJson(url, '/api/tokens', { method: 'POST', body: { identity: item.username || '', secret: item.passwordEnc ? decryptText(item.passwordEnc) : '' }, rejectUnauthorized: !item.allowSelfSigned });
  if (!token?.token) return [];
  const hosts = await integrationJson(url, '/api/nginx/proxy-hosts', { headers: { Authorization: `Bearer ${token.token}` }, rejectUnauthorized: !item.allowSelfSigned });
  return (Array.isArray(hosts) ? hosts : []).map(h => ({ id: h.id, domains: h.domain_names || [], forwardHost: h.forward_host || '', forwardPort: h.forward_port || '', scheme: h.forward_scheme || 'http', enabled: h.enabled !== 0 }));
}
async function buildDependencyGraph(server, auth, dashboard) {
  const configured = jsonRead(DEPENDENCIES_FILE, []);
  const nodes = [], edges = [];
  const seen = new Set();
  const addNode = (id, label, type, meta={}) => { if (!seen.has(id)) { seen.add(id); nodes.push({ id,label,type,...meta }); } };
  const addEdge = (from,to,label='') => edges.push({ from,to,label });
  for (const n of dashboard.nodes || []) addNode(`node:${n.node}`, n.node, 'node');
  for (const s of dashboard.storages || []) { const sid=`storage:${s.node}:${s.storage}`; addNode(sid,s.storage,'storage',{node:s.node}); addEdge(`node:${s.node}`,sid,'stockage'); }
  for (const m of dashboard.machines || []) { const mid=`machine:${m.type}:${m.vmid}`; addNode(mid,m.name,'machine',{vmid:m.vmid,node:m.node,machineType:m.type}); addEdge(mid,`node:${m.node}`,'hébergé sur'); }
  const ipMap = new Map();
  for (const m of (dashboard.machines || []).filter(x=>x.status==='running').slice(0,80)) {
    const ips = await getGuestIps(server, auth, m);
    for (const ip of ips) ipMap.set(ip, m);
  }
  const integrations = jsonRead(INTEGRATIONS_FILE, []);
  const npm = integrations.find(i=>i.type==='npm' && i.enabled !== false);
  if (npm) {
    try {
      const hosts = await getNpmHosts(npm);
      for (const h of hosts) for (const domain of h.domains) {
        const did=`domain:${domain}`; const sid=`service:${domain}`;
        addNode(did,domain,'domain'); addNode(sid,`${h.scheme}://${h.forwardHost}:${h.forwardPort}`,'service'); addEdge(did,sid,'NPM');
        const m = ipMap.get(String(h.forwardHost));
        if (m) addEdge(sid,`machine:${m.type}:${m.vmid}`,'forward');
      }
    } catch {}
  }
  for (const row of configured) {
    if (!row.from || !row.to) continue;
    addNode(`manual:${row.from}`, row.from, row.fromType || 'service'); addNode(`manual:${row.to}`, row.to, row.toType || 'machine'); addEdge(`manual:${row.from}`,`manual:${row.to}`,row.label || 'dépend de');
  }
  return { nodes, edges, autoMatchedIps: ipMap.size };
}
function listAlertsForDashboard(dashboard, settings) { return computeProblems(dashboard, settings).filter(p=>p.severity==='critical' || p.severity==='warning'); }
const DISCORD_EVENT_TYPES = [
  'backup.success','backup.warning','backup.failed','backup.stale','backup.unprotected',
  'node.offline','node.recovered','task.warning','task.failed','storage.warning','storage.critical',
  'resources.cpu','resources.memory','temperature.warning','temperature.critical',
  'docker.portainer.unreachable','docker.engine.unreachable','docker.container.stopped','docker.container.unhealthy','docker.container.restarts',
  'docker.resources.cpu','docker.resources.memory','docker.storage.pressure','docker.stack.degraded','docker.recovered',
  'system.update.available','pve.update.available','pve.update.security','pve.update.manual-report','system.test'
];
function normalizeDiscordEvents(list) {
  const src = Array.isArray(list) ? list : [];
  const out = [...new Set(src.map(String).filter(x => DISCORD_EVENT_TYPES.includes(x)))];
  if(out.includes('backup.failed')&&!out.includes('backup.warning'))out.push('backup.warning');
  if(out.includes('task.failed')&&!out.includes('task.warning'))out.push('task.warning');
  return out.length ? out : ['backup.warning','backup.failed','backup.stale','node.offline','task.warning','task.failed','storage.critical'];
}
function redactDiscordChannel(row) {
  return { id: row.id, name: row.name || 'Discord', enabled: row.enabled !== false, events: normalizeDiscordEvents(row.events), hasWebhook: !!(row.webhookEnc || row.webhook), createdAt: row.createdAt || null };
}
function problemEventType(problem) {
  const code = String(problem?.code || '');
  if (code === 'backup-missing') return 'backup.unprotected';
  if (code === 'backup-stale' || code === 'backup-absent') return 'backup.stale';
  if (code === 'backup-task-warning') return 'backup.warning';
  if (code === 'backup-task-failed') return 'backup.failed';
  if (code === 'node-offline') return 'node.offline';
  if (code === 'tasks-failed') return 'task.failed';
  if (code === 'tasks-warning') return 'task.warning';
  if (code === 'storage-critical' || code === 'storage-offline') return 'storage.critical';
  if (code === 'storage-high') return 'storage.warning';
  if (code === 'cpu-high') return 'resources.cpu';
  if (code === 'memory-high') return 'resources.memory';
  if (code === 'temperature-high') return 'temperature.warning';
  if (code === 'temperature-critical') return 'temperature.critical';
  return 'system.test';
}
function discordEventColor(eventType, severity='info') {
  if (eventType === 'backup.success' || eventType === 'node.recovered' || eventType === 'docker.recovered') return 0x22c55e;
  if (eventType === 'pve.update.security') return 0xef4444;
  if (eventType === 'system.update.available' || eventType === 'pve.update.available' || eventType === 'pve.update.manual-report') return 0x3b82f6;
  if (severity === 'critical' || eventType === 'backup.failed' || eventType === 'node.offline' || eventType === 'storage.critical') return 0xef4444;
  if (severity === 'warning' || eventType === 'backup.stale' || eventType === 'backup.unprotected' || eventType === 'storage.warning') return 0xf59e0b;
  return 0x3b82f6;
}
function discordEventLabel(type) {
  const labels = {
    'backup.success':'Sauvegarde réussie','backup.warning':'Sauvegarde avec avertissement','backup.failed':'Sauvegarde échouée','backup.stale':'Sauvegarde en retard','backup.unprotected':'Machine non protégée',
    'node.offline':'Nœud hors ligne','node.recovered':'Nœud de nouveau en ligne','task.warning':'Tâche avec avertissement','task.failed':'Tâche échouée','storage.warning':'Stockage en alerte','storage.critical':'Stockage critique',
    'resources.cpu':'CPU élevée','resources.memory':'RAM élevée','temperature.warning':'Température élevée','temperature.critical':'Température critique',
    'docker.portainer.unreachable':'Portainer inaccessible','docker.engine.unreachable':'Docker Engine inaccessible','docker.container.stopped':'Conteneur Docker arrêté','docker.container.unhealthy':'Conteneur Docker unhealthy','docker.container.restarts':'Redémarrages Docker répétés',
    'docker.resources.cpu':'CPU Docker élevée','docker.resources.memory':'RAM Docker élevée','docker.storage.pressure':'Stockage Docker sous pression','docker.stack.degraded':'Stack Docker dégradée','docker.recovered':'Docker rétabli',
    'system.update.available':'Mise à jour ProxPanel disponible','pve.update.available':'Mises à jour Proxmox disponibles','pve.update.security':'Mise à jour de sécurité Proxmox','pve.update.manual-report':'Rapport manuel des mises à jour Proxmox','auth.2fa.email':'Code de secours 2FA','system.test':'Test système'
  };
  return labels[type] || type;
}
function severityLabel(severity='info') { return severity==='critical'?'CRITIQUE':severity==='warning'?'AVERTISSEMENT':'INFORMATION'; }
function eventIcon(event={}) {
  if(event.type==='backup.success'||event.type==='node.recovered'||event.type==='docker.recovered')return '✅';
  if(event.type==='pve.update.security')return '🚨';
  if(event.type==='pve.update.available'||event.type==='pve.update.manual-report'||event.type==='system.update.available')return '⬆️';
  if(event.severity==='critical')return '🚨';
  if(event.severity==='warning')return '⚠️';
  return 'ℹ️';
}
function defaultRecommendation(event={}) {
  if(event.recommendation)return String(event.recommendation);
  const map={
    'backup.warning':'Consulte les logs de la tâche de sauvegarde pour identifier l’avertissement et confirmer l’intégrité des sauvegardes.',
    'backup.failed':'Consulte les logs de la tâche de sauvegarde et vérifie le stockage de destination.',
    'backup.stale':'Contrôle le job planifié et relance une sauvegarde si nécessaire.',
    'backup.unprotected':'Ajoute la machine à un job de sauvegarde ou confirme son exclusion volontaire.',
    'node.offline':'Vérifie l’alimentation, le réseau et les services Proxmox du nœud.',
    'task.warning':'Ouvre ProxPanel → Tâches et consulte le log complet pour identifier l’avertissement.',
    'task.failed':'Ouvre ProxPanel → Tâches et consulte le log complet de la tâche en échec.',
    'storage.warning':'Surveille la croissance du stockage et libère de l’espace avant le seuil critique.',
    'storage.critical':'Libère ou étends le stockage rapidement avant interruption de service.',
    'resources.cpu':'Identifie les VM/LXC les plus consommatrices et contrôle l’historique.',
    'resources.memory':'Identifie les VM/LXC les plus consommatrices et contrôle la mémoire engagée.',
    'docker.portainer.unreachable':'Vérifie le service Portainer, son URL, le certificat TLS et la connectivité depuis ProxPanel.',
    'docker.engine.unreachable':'Vérifie le Docker Engine, l’agent Portainer et la connectivité de cet environnement.',
    'docker.container.stopped':'Vérifie les logs et la cause de l’arrêt avant de redémarrer le conteneur.',
    'docker.container.unhealthy':'Vérifie le healthcheck et les logs avant toute action.',
    'docker.container.restarts':'Contrôle les logs, le healthcheck et la restart policy du conteneur.',
    'docker.resources.cpu':'Contrôle la charge du conteneur et son activité avant d’ajuster ses limites.',
    'docker.resources.memory':'Contrôle la mémoire du conteneur et recherche une fuite ou une limite trop basse.',
    'docker.storage.pressure':'Nettoie les images/volumes inutilisés ou augmente la capacité après vérification.',
    'docker.stack.degraded':'Vérifie les conteneurs en défaut de la stack avant un redeploy.',
    'docker.recovered':'Aucune action requise si la ressource reste stable après récupération.',
    'temperature.warning':'Surveille la charge et le refroidissement du nœud. Vérifie les ventilateurs et le flux d’air si la température continue de monter.',
    'temperature.critical':'Vérifie immédiatement le refroidissement, les ventilateurs, les dissipateurs et la charge du nœud.',
    'auth.2fa.email':'Si tu n’es pas à l’origine de cette demande, change ton mot de passe ProxPanel et contrôle les sessions actives.',
    'pve.update.available':'Consulte le détail des paquets dans ProxPanel avant de planifier la maintenance.',
    'pve.update.security':'Consulte immédiatement le détail des correctifs de sécurité et planifie la maintenance selon la criticité détectée.',
    'pve.update.manual-report':'Aucune action n’est requise si le rapport indique que tous les nœuds sont à jour.',
    'system.test':'Aucune action requise : ce message confirme le fonctionnement du canal de notification.'
  };
  return map[event.type]||'Ouvre ProxPanel pour consulter les détails et confirmer l’état de l’infrastructure.';
}
function normalizeEventDetails(event={}) {
  const src=Array.isArray(event.details)?event.details:[];
  return src.map(x=>typeof x==='string'?x:(x&&typeof x==='object'?`${x.label||x.name||'Détail'}${x.value||x.meta?` : ${x.value||x.meta}`:''}`:String(x))).filter(Boolean).slice(0,20);
}
function messageLines(text='') { return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); }
async function sendDiscordEvent(settings, event) {
  const channels = Array.isArray(settings?.alerts?.discordChannels) ? settings.alerts.discordChannels : [];
  const jobs = [];
  for (const ch of channels) {
    const hook = ch.webhookEnc ? decryptText(ch.webhookEnc) : String(ch.webhook || '');
    if (ch.enabled === false || !hook) continue;
    const events = normalizeDiscordEvents(ch.events);
    if (!events.includes(event.type) && event.type !== 'system.test') continue;
    const details=normalizeEventDetails(event);
    const rawLines=messageLines(event.message);
    const summary=String(event.summary||rawLines.slice(0,2).join('\n')||event.message||'').slice(0,1400);
    const detailText=(details.length?details:rawLines.slice(2)).slice(0,14).map(x=>`• ${x}`).join('\n').slice(0,1024);
    const recommendation=defaultRecommendation(event).slice(0,1024);
    const diagnostic=(event.severity==='warning'||event.severity==='critical')?normalizeMailTechnicalEvidence(event):[];
    const technicalText=diagnostic.filter(x=>x.label!=='Extrait de log').slice(0,8).map(x=>`**${x.label} :** ${x.value}`).join('\n').slice(0,1024);
    const logRow=diagnostic.find(x=>x.label==='Extrait de log');
    const logText=logRow?String(logRow.value||'').replace(/```/g,'``').slice(-900):'';
    const fields = [
      { name: '📌 Priorité', value: `**${severityLabel(event.severity)}**`, inline: true },
      event.serverName ? { name: '🖥️ Serveur / cluster', value: String(event.serverName).slice(0,1024), inline: true } : null,
      event.target ? { name: '🎯 Cible', value: String(event.target).slice(0,1024), inline: true } : null,
      detailText ? { name: '📋 Détails', value: detailText, inline: false } : null,
      technicalText ? { name: '🧰 Diagnostic technique', value: technicalText, inline: false } : null,
      logText ? { name: '📜 Dernières lignes du log', value: `\`\`\`text\n${logText}\n\`\`\``, inline: false } : null,
      recommendation ? { name: '✅ Action recommandée', value: recommendation, inline: false } : null
    ].filter(Boolean);
    const payload = {
      username: 'ProxPanel BETA',
      allowed_mentions:{parse:[]},
      embeds: [{
        author:{name:'ProxPanel BETA · Supervision Proxmox'},
        title: `${eventIcon(event)} ${String(event.title || discordEventLabel(event.type)).replace(/^ProxPanel\s*[·-]\s*/,'')}`.slice(0,256),
        description: summary ? `> ${summary.replace(/\n/g,'\n> ')}` : '> Nouvel événement détecté par ProxPanel.',
        color: discordEventColor(event.type,event.severity),
        fields,
        timestamp: new Date(event.at || Date.now()).toISOString(),
        footer: { text: `ProxPanel BETA • ${discordEventLabel(event.type)} • ${ch.name||'Discord'} • Vérifie dans le panel avant action` }
      }]
    };
    jobs.push(postWebhook(hook,payload));
  }
  if (settings?.alerts?.discordWebhook && channels.length === 0) {
    const diagnostics=(event.severity==='warning'||event.severity==='critical')?normalizeMailTechnicalEvidence(event):[];
    const diag=diagnostics.slice(0,8).map(x=>`**${x.label} :** ${String(x.value||'').slice(0,500)}`).join('\n');
    jobs.push(postWebhook(settings.alerts.discordWebhook,{allowed_mentions:{parse:[]},content:`**${eventIcon(event)} ${event.title || 'ProxPanel'}**\n${event.message || ''}${diag?`\n\n**Diagnostic :**\n${diag}`:''}\n\n**Action recommandée :** ${defaultRecommendation(event)}`.slice(0,1950)}));
  }
  await Promise.allSettled(jobs);
  return jobs.length;
}
async function postWebhook(url, payload) {
  if (!url) return;
  const u = new URL(url); const base = `${u.protocol}//${u.host}`;
  await rawRequest(base, `${u.pathname}${u.search}`, { method:'POST', body: JSON.stringify(payload), headers:{'Content-Type':'application/json'}, rejectUnauthorized:true });
}
function smtpRecipients(value) {
  return String(value || '').split(/[;,]+/).map(x => x.trim()).filter(Boolean).slice(0, 20);
}
function smtpSubject(value) {
  return `=?UTF-8?B?${Buffer.from(String(value || ''), 'utf8').toString('base64')}?=`;
}
function mailHtmlEscape(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c));}
function redactDiagnosticText(value='') {
  let text=String(value||'');
  const replacements=[
    [/\b(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,'$1[REDACTED]'],
    [/\b(x-api-key\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]'],
    [/\b(api[_ -]?key|token|access[_ -]?token|refresh[_ -]?token|password|passwd|secret|client[_ -]?secret)\b\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]'],
    [/\b(PVEAPIToken=)[^\s]+/gi,'$1[REDACTED]'],
    [/(Cookie:\s*)[^\r\n]+/gi,'$1[REDACTED]'],
    [/(ticket\s*[:=]\s*)[^\s,;]+/gi,'$1[REDACTED]']
  ];
  for(const [re,replacement] of replacements)text=text.replace(re,replacement);
  return text;
}
function defaultMailTechnicalSource(event={}) {
  const type=String(event.type||'');
  if(type.startsWith('docker.'))return 'Docker / Portainer API';
  if(type.startsWith('pve.update.'))return 'APT / Proxmox API';
  if(type.startsWith('backup.')||type==='task.failed'||type==='task.warning'||type.startsWith('node.')||type.startsWith('storage.')||type.startsWith('resources.')||type.startsWith('temperature.'))return 'Proxmox API';
  if(type==='system.update.available')return 'ProxPanel OTA';
  if(type==='auth.2fa.email')return 'ProxPanel Auth';
  return 'ProxPanel';
}
function normalizeMailTechnicalEvidence(event={}) {
  const rows=[];
  const push=(label,value)=>{
    const safe=redactDiagnosticText(value).trim();
    if(!safe)return;
    rows.push({label:String(label||'Information technique').slice(0,80),value:safe.slice(0,8000)});
  };
  push('Source',event.source||defaultMailTechnicalSource(event));
  if(event.error)push('Erreur',event.error);
  if(event.upid)push('UPID',event.upid);
  for(const row of (Array.isArray(event.technicalDetails)?event.technicalDetails:[]).slice(0,12)){
    if(typeof row==='string')push('Information',row);
    else if(row&&typeof row==='object')push(row.label||row.name||'Information',row.value||row.meta||row.detail||'');
  }
  if(event.logExcerpt)push('Extrait de log',event.logExcerpt);
  return rows.slice(0,16);
}
async function proxmoxTaskLogExcerpt(server,auth,upid,limit=40) {
  try{
    const node=taskNodeFromUpid(upid);if(!node)return '';
    const rows=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/tasks/${taskIdEncode(upid)}/log?start=0&limit=1000`,{auth});
    const lines=(Array.isArray(rows)?rows:[]).map(x=>String(x?.t??x??'')).filter(Boolean);
    return redactDiagnosticText(lines.slice(-Math.max(5,Math.min(100,Number(limit||40)))).join('\n')).slice(-12000);
  }catch{return '';}
}
function summarizeProxmoxTaskLog(log='') {
  const lines=String(log||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const vmids=[...new Set(lines.flatMap(line=>[...line.matchAll(/\b(?:VM|CT)\s+(\d+)\b/gi)].map(m=>m[1])))].slice(0,30);
  const warnings=lines.filter(line=>/\bwarn(?:ing|ings)?\b/i.test(line)).slice(-10);
  const errors=lines.filter(line=>/\b(?:error|failed|failure|abort(?:ed)?)\b/i.test(line)).slice(-10);
  return {vmids,warnings,errors};
}
async function dockerIncidentLogExcerpt(row={}) {
  if(!row.containerId||!row.portainerId||!row.endpointId)return '';
  try{
    const item=findPortainerIntegration(row.portainerId);if(!item)return '';
    const r=await portainerDockerBuffer(item,Number(row.endpointId),`/containers/${encodeURIComponent(row.containerId)}/logs?stdout=1&stderr=1&timestamps=1&tail=60`);
    return redactDiagnosticText(dockerStreamText(r.data)).split(/\r?\n/).filter(Boolean).slice(-60).join('\n').slice(-12000);
  }catch{return '';}
}
function professionalMailSubject(subject,event={}) {
  const clean=String(subject||'Notification').replace(/^ProxPanel\s*[·-]\s*/,'');
  const sev=severityLabel(event.severity||'info');
  return `[ProxPanel] ${sev} · ${clean}`;
}
function mailBrandLogoAttachment() {
  try {
    const logoPath=path.join(PUBLIC_DIR,'proxpanel-logo-192.png');
    const content=fs.readFileSync(logoPath);
    return {filename:'proxpanel-logo.png',contentType:'image/png',contentId:'proxpanel-logo',contentBytes:content.toString('base64')};
  } catch { return null; }
}
function mailStatusTheme(event={}) {
  const type=String(event.type||'system.test'),severity=String(event.severity||'info');
  if(type==='backup.success'||type==='node.recovered'||type==='docker.recovered')return {accent:'#16d49a',soft:'#eafbf5',text:'#08745a',icon:'✓'};
  if(severity==='critical'||type==='pve.update.security'||type==='temperature.critical')return {accent:'#ef4444',soft:'#fff0f0',text:'#b42318',icon:'!'};
  if(severity==='warning'||type==='temperature.warning')return {accent:'#f0a429',soft:'#fff7e7',text:'#9a6700',icon:'!'};
  return {accent:'#ff7a00',soft:'#fff4e8',text:'#a84700',icon:'i'};
}
function buildProfessionalMail(subject,text,event={}) {
  const at=new Date(event.at||Date.now());
  const details=normalizeEventDetails(event);
  const lines=messageLines(text);
  const recommendation=defaultRecommendation(event);
  const severity=severityLabel(event.severity||'info');
  const theme=mailStatusTheme(event);
  const eventName=discordEventLabel(event.type||'system.test');
  const cleanSubject=String(subject||'Notification').replace(/^ProxPanel\s*[·-]\s*/,'');
  const summary=String(event.summary||lines.slice(0,2).join('\n')||text||'Nouvel événement détecté par ProxPanel.').trim();
  const facts=[
    event.serverName?['Serveur / cluster',event.serverName]:null,
    event.target?['Cible',event.target]:null,
    event.channel?['Canal',String(event.channel).toUpperCase()]:null,
    ['Type',eventName],
    ['Priorité',severity],
    ['Horodatage',at.toLocaleString('fr-FR',{timeZone:'Europe/Paris'})]
  ].filter(Boolean);
  const detailRows=(details.length?details:lines.slice(2)).slice(0,20);
  const technicalRows=(event.severity==='warning'||event.severity==='critical')?normalizeMailTechnicalEvidence(event):[];
  const logo=mailBrandLogoAttachment();
  const logoHtml=logo?'<img src="cid:proxpanel-logo" width="52" height="52" alt="ProxPanel" style="display:block;width:52px;height:52px;border:0;border-radius:13px">':'<div style="width:52px;height:52px;border-radius:13px;background:#171d22;color:#ff7a00;font-size:25px;line-height:52px;text-align:center;font-weight:900">P</div>';
  const detailHtml=detailRows.length?`<tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#f8fafc;border:1px solid #e7ebf0;border-radius:12px"><tr><td style="padding:16px 18px"><div style="font-size:12px;letter-spacing:.08em;font-weight:800;color:#586273;margin-bottom:8px">DÉTAILS</div>${detailRows.map(x=>`<div style="font-size:13px;line-height:1.55;color:#344054;margin:5px 0"><span style="color:#ff7a00;font-weight:900">•</span>&nbsp; ${mailHtmlEscape(x)}</div>`).join('')}</td></tr></table></td></tr>`:'';
  const technicalHtml=technicalRows.length?`<tr><td style="padding:0 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#10151b;border:1px solid #2d3742;border-radius:12px"><tr><td style="padding:16px 18px"><div style="font-size:12px;letter-spacing:.08em;font-weight:900;color:#ff9f43;margin-bottom:10px">DÉTAILS TECHNIQUES / LOGS</div>${technicalRows.map(x=>`<div style="margin:8px 0"><div style="font-size:10px;font-weight:800;color:#98a2b3;text-transform:uppercase;letter-spacing:.06em">${mailHtmlEscape(x.label)}</div><pre style="margin:4px 0 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:#e6edf3">${mailHtmlEscape(x.value)}</pre></div>`).join('')}</td></tr></table></td></tr>`:'';
  const factsHtml=facts.map(([k,v],i)=>`<tr><td style="padding:10px 12px;font-size:12px;color:#667085;border-bottom:${i===facts.length-1?'0':'1px solid #edf0f3'};width:38%">${mailHtmlEscape(k)}</td><td style="padding:10px 12px;font-size:13px;font-weight:700;color:#101828;border-bottom:${i===facts.length-1?'0':'1px solid #edf0f3'}">${mailHtmlEscape(v)}</td></tr>`).join('');
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;padding:0;background:#edf0f3;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#101828"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#edf0f3"><tr><td align="center" style="padding:30px 12px"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dfe4ea;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(16,24,40,.08)"><tr><td style="height:5px;background:#ff7a00;font-size:0;line-height:0">&nbsp;</td></tr><tr><td style="background:#11161c;padding:22px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="64" valign="middle">${logoHtml}</td><td valign="middle"><div style="font-size:22px;font-weight:850;color:#ffffff;letter-spacing:-.02em">ProxPanel</div><div style="margin-top:4px;color:#98a2b3;font-size:11px;letter-spacing:.12em;font-weight:700">SUPERVISION PROXMOX</div></td><td align="right" valign="middle"><span style="display:inline-block;padding:7px 10px;border:1px solid ${theme.accent};border-radius:999px;background:${theme.accent};color:#fff;font-size:10px;font-weight:900;letter-spacing:.06em">${mailHtmlEscape(severity)}</span></td></tr></table></td></tr><tr><td style="padding:28px 28px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="46" valign="top"><div style="width:38px;height:38px;line-height:38px;text-align:center;border-radius:11px;background:${theme.soft};color:${theme.text};font-size:20px;font-weight:900">${theme.icon}</div></td><td valign="top"><div style="font-size:12px;color:${theme.text};font-weight:800;letter-spacing:.06em;text-transform:uppercase">${mailHtmlEscape(eventName)}</div><h1 style="margin:6px 0 0;font-size:25px;line-height:1.25;color:#101828;letter-spacing:-.02em">${mailHtmlEscape(cleanSubject)}</h1></td></tr></table><div style="margin-top:17px;padding:14px 16px;border-radius:11px;background:${theme.soft};border:1px solid ${theme.accent}33;font-size:14px;line-height:1.65;color:#344054;white-space:pre-line">${mailHtmlEscape(summary)}</div></td></tr><tr><td style="padding:8px 28px 20px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border:1px solid #e7ebf0;border-radius:12px;overflow:hidden">${factsHtml}</table></td></tr>${detailHtml}${technicalHtml}<tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#11161c;border-radius:12px"><tr><td style="padding:16px 18px;border-left:4px solid #ff7a00;border-radius:12px"><div style="font-size:11px;letter-spacing:.09em;font-weight:900;color:#ff9f43;margin-bottom:5px">ACTION RECOMMANDÉE</div><div style="font-size:13px;line-height:1.6;color:#d0d5dd">${mailHtmlEscape(recommendation)}</div></td></tr></table></td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e7ebf0;padding:17px 28px"><table role="presentation" width="100%"><tr><td style="font-size:11px;line-height:1.55;color:#7b8491">Notification automatique ProxPanel · Vérifie les informations dans le panel avant toute action destructive.</td><td align="right" style="font-size:11px;color:#98a2b3;white-space:nowrap">proxpanel.fr</td></tr></table></td></tr></table><div style="max-width:680px;padding:12px 8px 0;text-align:center;font-size:10px;line-height:1.5;color:#98a2b3">ProxPanel centralise la supervision et l’administration de tes infrastructures Proxmox.</div></td></tr></table></body></html>`;
  const plain=[`PROXPANEL — ${severity}`,cleanSubject,'',summary,'',...facts.map(([k,v])=>`${k} : ${v}`),...(detailRows.length?['','Détails :',...detailRows.map(x=>`- ${x}`)]:[]),...(technicalRows.length?['','Détails techniques / logs :',...technicalRows.flatMap(x=>[`${x.label} :`,x.value])]:[]),'',`Action recommandée : ${recommendation}`,'','Notification automatique ProxPanel · proxpanel.fr'].join('\n');
  return {html,plain,inlineAttachments:logo?[logo]:[]};
}

const MAIL_TEST_TEMPLATES = [
  {type:'system.test',group:'Système',label:'Test système',severity:'info',description:'Validation générale du canal e-mail ProxPanel.'},
  {type:'node.offline',group:'Nœuds',label:'Nœud hors ligne',severity:'critical',description:'Un nœud Proxmox ne répond plus.'},
  {type:'node.recovered',group:'Nœuds',label:'Nœud rétabli',severity:'info',description:'Un nœud précédemment hors ligne répond de nouveau.'},
  {type:'temperature.warning',group:'Nœuds',label:'Température élevée',severity:'warning',description:'La température CPU dépasse le seuil warning.'},
  {type:'temperature.critical',group:'Nœuds',label:'Température critique',severity:'critical',description:'La température CPU dépasse le seuil critique.'},
  {type:'backup.success',group:'Sauvegardes',label:'Sauvegarde réussie',severity:'info',description:'Un job de sauvegarde s’est terminé correctement.'},
  {type:'backup.warning',group:'Sauvegardes',label:'Sauvegarde avec avertissement',severity:'warning',description:'Un job de sauvegarde s’est terminé avec un statut WARNINGS.'},
  {type:'backup.failed',group:'Sauvegardes',label:'Sauvegarde échouée',severity:'critical',description:'Un job de sauvegarde a échoué.'},
  {type:'backup.stale',group:'Sauvegardes',label:'Sauvegarde en retard',severity:'warning',description:'La dernière sauvegarde dépasse l’âge maximum configuré.'},
  {type:'backup.unprotected',group:'Sauvegardes',label:'Machine non protégée',severity:'warning',description:'Une VM ou un LXC n’est couvert par aucun backup récent.'},
  {type:'task.warning',group:'Infrastructure',label:'Tâche avec avertissement',severity:'warning',description:'Une tâche Proxmox s’est terminée avec un avertissement.'},
  {type:'task.failed',group:'Infrastructure',label:'Tâche échouée',severity:'critical',description:'Une tâche Proxmox s’est terminée en erreur.'},
  {type:'storage.warning',group:'Infrastructure',label:'Stockage en alerte',severity:'warning',description:'Le stockage dépasse le seuil warning.'},
  {type:'storage.critical',group:'Infrastructure',label:'Stockage critique',severity:'critical',description:'Le stockage dépasse le seuil critique.'},
  {type:'resources.cpu',group:'Ressources',label:'CPU élevée',severity:'warning',description:'La charge CPU dépasse le seuil configuré.'},
  {type:'resources.memory',group:'Ressources',label:'RAM élevée',severity:'warning',description:'La mémoire utilisée dépasse le seuil configuré.'},
  {type:'docker.portainer.unreachable',group:'Docker',label:'Portainer inaccessible',severity:'critical',description:'ProxPanel ne parvient plus à joindre Portainer.'},
  {type:'docker.engine.unreachable',group:'Docker',label:'Docker Engine inaccessible',severity:'critical',description:'Un environnement Docker connu de Portainer ne répond plus.'},
  {type:'docker.container.stopped',group:'Docker',label:'Conteneur arrêté',severity:'critical',description:'Un conteneur précédemment actif s’est arrêté de façon inattendue.'},
  {type:'docker.container.unhealthy',group:'Docker',label:'Conteneur unhealthy',severity:'critical',description:'Docker signale un healthcheck en échec.'},
  {type:'docker.container.restarts',group:'Docker',label:'Redémarrages répétés',severity:'warning',description:'Un conteneur redémarre de façon répétée.'},
  {type:'docker.resources.cpu',group:'Docker',label:'CPU Docker élevée',severity:'warning',description:'Un conteneur dépasse le seuil CPU.'},
  {type:'docker.resources.memory',group:'Docker',label:'RAM Docker élevée',severity:'warning',description:'Un conteneur dépasse le seuil mémoire.'},
  {type:'docker.storage.pressure',group:'Docker',label:'Stockage Docker sous pression',severity:'warning',description:'L’espace Docker mesurable dépasse le seuil configuré.'},
  {type:'docker.stack.degraded',group:'Docker',label:'Stack Docker dégradée',severity:'warning',description:'Une stack active contient des conteneurs en défaut.'},
  {type:'docker.recovered',group:'Docker',label:'Docker rétabli',severity:'info',description:'Une ressource Docker précédemment en incident est revenue à la normale.'},
  {type:'system.update.available',group:'Mises à jour',label:'Mise à jour ProxPanel',severity:'info',description:'Une nouvelle version de ProxPanel est disponible.'},
  {type:'pve.update.available',group:'Mises à jour',label:'Mises à jour Proxmox',severity:'info',description:'Des mises à jour de paquets PVE sont disponibles.'},
  {type:'pve.update.security',group:'Mises à jour',label:'Correctifs de sécurité PVE',severity:'critical',description:'Des mises à jour de sécurité Proxmox sont disponibles.'},
  {type:'pve.update.manual-report',group:'Mises à jour',label:'Rapport PVE manuel',severity:'info',description:'Rapport manuel de l’état des mises à jour PVE.'},
  {type:'auth.2fa.email',group:'Sécurité',label:'Code de secours 2FA',severity:'warning',description:'E-mail de secours envoyé lors d’une connexion 2FA.'}
];
function publicMailTemplateCatalog(){return MAIL_TEST_TEMPLATES.map(x=>({...x}));}
function mailTestScenario(type,username='admin'){
  const row=MAIL_TEST_TEMPLATES.find(x=>x.type===String(type||''));
  if(!row)throw new Error('Modèle e-mail inconnu.');
  const base={type:row.type,severity:row.severity,serverName:'PVE-PROD01',at:Date.now()};
  const updateChannel=normalizeUpdateChannel(getSettings()?.updates?.otaChannel);
  const updateChannelLabel=updateChannel==='stable'?'STABLE':'BÊTA';
  const samples={
    'system.test':{subject:'Test e-mail ProxPanel',text:`Le canal e-mail fonctionne correctement.\n\nTest lancé par ${username}.`,event:{...base,target:'Canal e-mail',details:[`Utilisateur : ${username}`,'Source : panneau de test ProxPanel']}},
    'node.offline':{subject:'Nœud Proxmox hors ligne',text:'Le nœud PVE-PROD01 ne répond plus aux contrôles ProxPanel.',event:{...base,target:'PVE-PROD01',details:['État : hors ligne','Dernière réponse : il y a 4 minutes','Contrôle : API Proxmox']}},
    'node.recovered':{subject:'Nœud Proxmox de nouveau en ligne',text:'Le nœud PVE-PROD01 répond de nouveau normalement.',event:{...base,target:'PVE-PROD01',details:['État : en ligne','Indisponibilité simulée : 6 minutes']}},
    'temperature.warning':{subject:'Température CPU élevée',text:'La température CPU du nœud PVE-PROD01 dépasse le seuil warning.',event:{...base,target:'PVE-PROD01',details:['Température CPU : 78.4 °C','Seuil warning : 75 °C','Source : lm-sensors']}},
    'temperature.critical':{subject:'Température CPU critique',text:'La température CPU du nœud PVE-PROD01 dépasse le seuil critique.',event:{...base,target:'PVE-PROD01',details:['Température CPU : 88.1 °C','Seuil critique : 85 °C','Source : lm-sensors']}},
    'backup.success':{subject:'Sauvegarde terminée',text:'La sauvegarde de VM 105 · SRV-APP01 s’est terminée correctement.',event:{...base,target:'VM 105 · SRV-APP01',details:['Nœud : PVE-PROD01','Statut Proxmox : OK','Durée : 08 min 42 s','Destination : PBS-PROD']}},
    'backup.warning':{subject:'Sauvegarde terminée avec avertissement',text:'Le job de sauvegarde s’est terminé avec un avertissement Proxmox.',event:{...base,target:'Job de sauvegarde',details:['Nœud : PVE-PROD01','Statut Proxmox brut : WARNINGS: 1','Avertissements : 1','Machines détectées : 100, 205, 400, 600','Durée : 20 min 03 s'],source:'Proxmox vzdump',upid:'UPID:PVE-PROD01:00001234:00005678:00000000:vzdump::root@pam:',technicalDetails:[{label:'Classification ProxPanel',value:'warning'},{label:'Avertissement détecté',value:'WARNINGS: 1'}],logExcerpt:'INFO: Starting Backup of VM 100\nINFO: Finished Backup of VM 100\nINFO: Backup job finished with warnings'}},
    'backup.failed':{subject:'Sauvegarde échouée',text:'La sauvegarde de VM 105 · SRV-APP01 s’est terminée en erreur.',event:{...base,target:'VM 105 · SRV-APP01',details:['Nœud : PVE-PROD01','Statut Proxmox : ERROR','Destination : PBS-PROD','Erreur : espace temporaire insuffisant'],source:'Proxmox vzdump',upid:'UPID:PVE-PROD01:00001235:00005679:00000000:vzdump:105:root@pam:',technicalDetails:[{label:'Classification ProxPanel',value:'failure'}],logExcerpt:'INFO: Starting Backup of VM 105\nERROR: temporary storage unavailable\nTASK ERROR: backup failed'}},
    'backup.stale':{subject:'Sauvegarde en retard',text:'La dernière sauvegarde de VM 105 dépasse l’âge maximum configuré.',event:{...base,target:'VM 105 · SRV-APP01',details:['Dernière sauvegarde : il y a 41 h','Seuil : 36 h','Destination attendue : PBS-PROD']}},
    'backup.unprotected':{subject:'Machine non protégée',text:'Une machine active ne possède aucune sauvegarde récente détectée.',event:{...base,target:'LXC 220 · docker-prod',details:['Type : LXC','Nœud : PVE-PROD01','Sauvegarde récente : aucune']}},
    'task.warning':{subject:'Tâche Proxmox avec avertissement',text:'Une tâche Proxmox s’est terminée avec un avertissement.',event:{...base,target:'VM 105',details:['Action : qmigrate','Statut : WARNINGS: 1','Utilisateur : root@pam'],source:'Proxmox API',upid:'UPID:PVE-PROD01:00001236:00005680:00000000:qmigrate:105:root@pam:',logExcerpt:'INFO: migration completed\nWARNING: one optional cleanup step was skipped'}},
    'task.failed':{subject:'Tâche Proxmox échouée',text:'Une tâche Proxmox s’est terminée avec un statut d’erreur.',event:{...base,target:'VM 105',details:['Action : qmigrate','Statut : ERROR','Utilisateur : root@pam'],source:'Proxmox API',upid:'UPID:PVE-PROD01:00001237:00005681:00000000:qmigrate:105:root@pam:',logExcerpt:'INFO: migration started\nERROR: target storage unavailable\nTASK ERROR: migration failed'}},
    'storage.warning':{subject:'Stockage bientôt saturé',text:'Le stockage local-lvm dépasse le seuil warning configuré.',event:{...base,target:'local-lvm',details:['Utilisation : 87 %','Seuil warning : 85 %','Libre : 214 Go']}},
    'storage.critical':{subject:'Stockage critique',text:'Le stockage local-lvm dépasse le seuil critique configuré.',event:{...base,target:'local-lvm',details:['Utilisation : 96 %','Seuil critique : 95 %','Libre : 51 Go']}},
    'resources.cpu':{subject:'Charge CPU élevée',text:'La charge CPU moyenne du nœud PVE-PROD01 dépasse le seuil configuré.',event:{...base,target:'PVE-PROD01',details:['CPU : 91 %','Seuil warning : 85 %','Durée : 10 min']}},
    'resources.memory':{subject:'Utilisation mémoire élevée',text:'L’utilisation mémoire du nœud PVE-PROD01 dépasse le seuil configuré.',event:{...base,target:'PVE-PROD01',details:['RAM : 89 %','Utilisée : 114 Go / 128 Go','Seuil warning : 85 %']}},
    'docker.portainer.unreachable':{subject:'Portainer inaccessible',text:'ProxPanel ne parvient plus à joindre Portainer.',event:{...base,serverName:'Portainer',target:'Portainer PROD',details:['URL : https://portainer.example:9443','Contrôles consécutifs : 2']}},
    'docker.engine.unreachable':{subject:'Docker Engine inaccessible',text:'L’environnement Docker PROD ne répond plus via Portainer.',event:{...base,serverName:'Portainer',target:'Docker PROD',details:['Portainer : connecté','Docker Engine : inaccessible']}},
    'docker.container.stopped':{subject:'Conteneur Docker arrêté',text:'vaultwarden était actif et est maintenant exited.',event:{...base,serverName:'Portainer',target:'vaultwarden · Docker PROD',details:['État précédent : running','État actuel : exited','Stack : vaultwarden']}},
    'docker.container.unhealthy':{subject:'Conteneur Docker unhealthy',text:'nginx-proxy-manager est déclaré unhealthy par Docker.',event:{...base,serverName:'Portainer',target:'nginx-proxy-manager · Docker PROD',details:['Health : unhealthy','Image : jc21/nginx-proxy-manager:latest']}},
    'docker.container.restarts':{subject:'Redémarrages Docker répétés',text:'uptime-kuma redémarre de façon répétée.',event:{...base,serverName:'Portainer',target:'uptime-kuma · Docker PROD',details:['Restart count : 8','Nouveaux redémarrages : 4']}},
    'docker.resources.cpu':{subject:'CPU Docker élevée',text:'immich-server dépasse le seuil CPU configuré.',event:{...base,serverName:'Portainer',target:'immich-server · Docker PROD',details:['CPU : 92 %','Seuil : 85 %']}},
    'docker.resources.memory':{subject:'RAM Docker élevée',text:'postgres dépasse le seuil mémoire configuré.',event:{...base,serverName:'Portainer',target:'postgres · Docker PROD',details:['RAM : 91 %','Seuil : 85 %']}},
    'docker.storage.pressure':{subject:'Stockage Docker sous pression',text:'Docker PROD dépasse le seuil de stockage mesurable.',event:{...base,serverName:'Portainer',target:'Docker PROD',details:['Utilisé : 91 %','Source : Docker DriverStatus']}},
    'docker.stack.degraded':{subject:'Stack Docker dégradée',text:'La stack monitoring contient un conteneur en défaut.',event:{...base,serverName:'Portainer',target:'monitoring · Docker PROD',details:['Conteneurs : 3','En défaut : grafana']}},
    'docker.recovered':{subject:'Docker rétabli',text:'La ressource Docker répond de nouveau normalement.',event:{...base,severity:'info',serverName:'Portainer',target:'Docker PROD',details:['Incident résolu : Docker Engine inaccessible']}},
    'system.update.available':{subject:'Mise à jour ProxPanel disponible',text:`Une nouvelle version de ProxPanel est disponible sur le canal ${updateChannelLabel}.`,event:{...base,serverName:'ProxPanel',target:updateChannel==='stable'?'1.7.0':'1.7.0-beta.14',channel:updateChannel,details:[`Version installée : ${APP_VERSION}`,`Canal sélectionné : ${updateChannelLabel}`,'Signature : vérifiée']}},
    'pve.update.available':{subject:'Mises à jour Proxmox disponibles',text:'Des paquets peuvent être mis à jour sur le nœud PVE-PROD01.',event:{...base,target:'PVE-PROD01',details:['Paquets : 14','Sécurité : 0','Redémarrage : non détecté']}},
    'pve.update.security':{subject:'Correctifs de sécurité Proxmox disponibles',text:'Des mises à jour de sécurité sont disponibles sur le nœud PVE-PROD01.',event:{...base,target:'PVE-PROD01',details:['Paquets : 6','Correctifs sécurité : 3','Maintenance recommandée : oui']}},
    'pve.update.manual-report':{subject:'Rapport des mises à jour Proxmox',text:'Le contrôle manuel des mises à jour Proxmox est terminé.',event:{...base,target:'Infrastructure',details:['Nœuds contrôlés : 9','Nœuds à jour : 7','Nœuds avec mises à jour : 2']}},
    'auth.2fa.email':{subject:'Code de secours ProxPanel',text:'Code de connexion : 482193\n\nCeci est un e-mail de test : le code affiché est volontairement fictif.',event:{...base,serverName:'ProxPanel',target:'Compte administrateur',details:['Validité réelle : 10 minutes','Usage unique','Ce message de test ne crée aucun code actif']}}
  };
  return samples[row.type];
}

function createSmtpReader(socket) {
  let buffer = '', waiters = [];
  const finish = (err) => { while (waiters.length) { const w = waiters.shift(); err ? w.reject(err) : w.resolve(); } };
  socket.on('error', finish);
  socket.on('close', () => finish(new Error('Connexion SMTP fermée.')));
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    while (waiters.length) {
      const lines = buffer.split(/\r?\n/); let idx = -1, code = 0;
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) { idx = i; code = Number(lines[i].slice(0,3)); break; }
      }
      if (idx < 0) break;
      const consumed = lines.slice(0, idx + 1).join('\r\n') + '\r\n';
      buffer = buffer.slice(consumed.length);
      const text = lines.slice(0, idx + 1).join('\n');
      const w = waiters.shift();
      if (code >= 400) w.reject(new Error(`SMTP ${text}`)); else w.resolve({ code, text });
    }
  });
  return () => new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}
async function openSmtpSocket(cfg) {
  const host = String(cfg.host || '').trim(); const port = Number(cfg.port || 587); const security = String(cfg.security || 'starttls');
  if (!host) throw new Error('Serveur SMTP manquant.');
  if (security === 'tls') {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject);socket.setTimeout(15000,()=>reject(new Error('Timeout SMTP TLS')))});
    return socket;
  }
  const socket = net.connect({ host, port });
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);socket.setTimeout(15000,()=>reject(new Error('Timeout SMTP')))});
  return socket;
}
async function sendSmtpMail(cfg, subject, content) {
  if (!cfg?.enabled || !cfg.host || !cfg.to || !cfg.from) return;
  let socket = await openSmtpSocket(cfg); let read = createSmtpReader(socket);
  const send = line => socket.write(`${line}\r\n`);
  try {
    await read(); send('EHLO proxpanel'); await read();
    if (String(cfg.security || 'starttls') === 'starttls') {
      send('STARTTLS'); const r = await read(); if (r.code !== 220) throw new Error('STARTTLS refusé par le serveur SMTP.');
      const plain = socket; socket = tls.connect({ socket: plain, servername: cfg.host, rejectUnauthorized: true });
      await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject);socket.setTimeout(15000,()=>reject(new Error('Timeout STARTTLS')))});
      read = createSmtpReader(socket); send('EHLO proxpanel'); await read();
    }
    const password = cfg.passwordEnc ? decryptText(cfg.passwordEnc) : '';
    if (cfg.username) {
      send('AUTH LOGIN'); await read();
      send(Buffer.from(String(cfg.username)).toString('base64')); await read();
      send(Buffer.from(password).toString('base64')); await read();
    }
    send(`MAIL FROM:<${cfg.from}>`); await read();
    const recipients = smtpRecipients(cfg.to); if (!recipients.length) throw new Error('Destinataire e-mail manquant.');
    for (const rcpt of recipients) { send(`RCPT TO:<${rcpt}>`); await read(); }
    send('DATA'); await read();
    const relatedBoundary=`proxpanel-related-${crypto.randomBytes(8).toString('hex')}`;
    const altBoundary=`proxpanel-alt-${crypto.randomBytes(8).toString('hex')}`;
    const parts=[];
    parts.push(`--${relatedBoundary}`);
    parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`,'');
    parts.push(`--${altBoundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','',content.plain||'');
    parts.push(`--${altBoundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: 8bit','',content.html||'');
    parts.push(`--${altBoundary}--`,'');
    for(const att of (content.inlineAttachments||[])){
      if(!att?.contentBytes||!att?.contentId)continue;
      const chunked=String(att.contentBytes).match(/.{1,76}/g)?.join('\r\n')||'';
      parts.push(`--${relatedBoundary}`,`Content-Type: ${att.contentType||'application/octet-stream'}; name="${att.filename||'inline.bin'}"`,'Content-Transfer-Encoding: base64',`Content-ID: <${att.contentId}>`,`Content-Disposition: inline; filename="${att.filename||'inline.bin'}"`,'',chunked);
    }
    parts.push(`--${relatedBoundary}--`,'');
    const body=parts.join('\r\n').replace(/^\./gm,'..');
    const headers = [
      `From: ${cfg.from}`, `To: ${recipients.join(', ')}`, `Subject: ${smtpSubject(subject)}`,
      'MIME-Version: 1.0', `Content-Type: multipart/related; boundary="${relatedBoundary}"`
    ].join('\r\n');
    socket.write(`${headers}\r\n\r\n${body}\r\n.\r\n`); await read();
    send('QUIT'); await read().catch(()=>{});
  } finally { try { socket.end(); } catch {} }
}
async function getMicrosoftGraphToken(cfg) {
  const tenant = String(cfg.tenantId || '').trim(), clientId = String(cfg.clientId || '').trim();
  const secret = cfg.clientSecretEnc ? decryptText(cfg.clientSecretEnc) : '';
  if (!tenant || !clientId || !secret) throw new Error('Tenant ID, Client ID et secret Microsoft 365 requis.');
  const body = new URLSearchParams({ client_id: clientId, client_secret: secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }).toString();
  const r = await rawRequest('https://login.microsoftonline.com', `/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method:'POST', body, headers:{'Content-Type':'application/x-www-form-urlencoded'}, rejectUnauthorized:true });
  if (!r.data?.access_token) throw new Error('Microsoft 365 n’a pas retourné de jeton OAuth.');
  return r.data.access_token;
}
async function sendMicrosoftGraphMail(cfg, subject, content) {
  if (!cfg?.enabled || !cfg.to) return;
  const sender = String(cfg.sender || cfg.from || '').trim(); if (!sender) throw new Error('Boîte expéditrice Microsoft 365 requise.');
  const token = await getMicrosoftGraphToken(cfg); const recipients = smtpRecipients(cfg.to);
  if (!recipients.length) throw new Error('Destinataire e-mail manquant.');
  const attachments=(content.inlineAttachments||[]).filter(a=>a?.contentBytes&&a?.contentId).map(a=>({'@odata.type':'#microsoft.graph.fileAttachment',name:a.filename||'proxpanel-logo.png',contentType:a.contentType||'image/png',isInline:true,contentId:a.contentId,contentBytes:a.contentBytes}));
  const payload = { message: { subject: String(subject || 'ProxPanel'), body: { contentType:'HTML', content:String(content.html || '') }, toRecipients: recipients.map(address => ({ emailAddress:{ address } })), ...(attachments.length?{attachments}:{}) }, saveToSentItems: true };
  await rawRequest('https://graph.microsoft.com', `/v1.0/users/${encodeURIComponent(sender)}/sendMail`, { method:'POST', body:JSON.stringify(payload), headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, rejectUnauthorized:true });
}
async function sendMailNotification(cfg, subject, text, event={}) {
  if (!cfg?.enabled) return;
  const mailEvent={type:event.type||'system.test',severity:event.severity||'info',...event};
  const content=buildProfessionalMail(subject,text,mailEvent);
  const finalSubject=professionalMailSubject(subject,mailEvent);
  return String(cfg.mode || 'smtp') === 'm365-graph' ? sendMicrosoftGraphMail(cfg, finalSubject, content) : sendSmtpMail(cfg, finalSubject, content);
}
function sanitizeAlertEvent(event={}) {
  const safeText=(value,max=12000)=>redactDiagnosticText(value).slice(0,max);
  const details=(Array.isArray(event.details)?event.details:[]).slice(0,30).map(x=>safeText(typeof x==='string'?x:(x&&typeof x==='object'?`${x.label||x.name||'Détail'}${x.value||x.meta||x.detail?`: ${x.value||x.meta||x.detail}`:''}`:String(x)),2000)).filter(Boolean);
  const technicalDetails=(Array.isArray(event.technicalDetails)?event.technicalDetails:[]).slice(0,20).map(row=>{
    if(typeof row==='string')return safeText(row,4000);
    if(!row||typeof row!=='object')return safeText(String(row||''),4000);
    return {label:safeText(row.label||row.name||'Information',120),value:safeText(row.value||row.meta||row.detail||'',4000)};
  }).filter(Boolean);
  return {...event,title:safeText(event.title||'',500),message:safeText(event.message||'',6000),serverName:safeText(event.serverName||'',500),target:safeText(event.target||'',1000),recommendation:safeText(event.recommendation||'',2000),details,source:safeText(event.source||'',500),error:safeText(event.error||'',4000),upid:safeText(event.upid||'',1000),technicalDetails,logExcerpt:safeText(event.logExcerpt||'',12000)};
}
function telegramAlertText(event={}) {
  const details=normalizeEventDetails(event).slice(0,12).map(x=>`• ${x}`).join('\n');
  const diagnostics=(event.severity==='warning'||event.severity==='critical')?normalizeMailTechnicalEvidence(event):[];
  const diag=diagnostics.filter(x=>x.label!=='Extrait de log').slice(0,8).map(x=>`${x.label}: ${x.value}`).join('\n');
  const log=diagnostics.find(x=>x.label==='Extrait de log')?.value||'';
  return [
    `${eventIcon(event)} ${event.title||'ProxPanel'}`,
    event.message||'',
    event.serverName?`Serveur / cluster: ${event.serverName}`:'',
    event.target?`Cible: ${event.target}`:'',
    details?`Détails:\n${details}`:'',
    diag?`Diagnostic technique:\n${diag}`:'',
    log?`Dernières lignes du log:\n${String(log).slice(-1400)}`:'',
    `Action recommandée: ${defaultRecommendation(event)}`
  ].filter(Boolean).join('\n\n').slice(0,3900);
}
async function sendAlertChannels(settings, title, message, event = {}) {
  const a=settings.alerts||{}; const jobs=[];
  const fullEvent=sanitizeAlertEvent({type:event.type||'system.test',severity:event.severity||'info',title,message,serverName:event.serverName||'',target:event.target||'',at:event.at||Date.now(),recommendation:event.recommendation||'',details:event.details||[],source:event.source||'',error:event.error||'',upid:event.upid||'',technicalDetails:event.technicalDetails||[],logExcerpt:event.logExcerpt||''});
  jobs.push(sendDiscordEvent(settings,fullEvent));
  if(a.genericWebhook)jobs.push(postWebhook(a.genericWebhook,{source:'proxpanel',...fullEvent,at:new Date(fullEvent.at).toISOString()}));
  if(a.telegramBotToken&&a.telegramChatId)jobs.push(postWebhook(`https://api.telegram.org/bot${a.telegramBotToken}/sendMessage`,{chat_id:a.telegramChatId,text:telegramAlertText(fullEvent)}));
  if(a.smtp?.enabled)jobs.push(sendMailNotification(a.smtp,fullEvent.title,fullEvent.message,fullEvent));
  await Promise.allSettled(jobs);
}
function normalizeReleaseNotes(value) {
  if (Array.isArray(value)) return value.map(x=>String(x).trim()).filter(Boolean).slice(0,100);
  if (typeof value === 'string') return value.split(/\r?\n/).map(x=>x.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).slice(0,100);
  return [];
}
function getOtaInstanceId() {
  try {
    const existing = fs.readFileSync(OTA_INSTANCE_FILE, 'utf8').trim();
    if (/^[0-9a-f-]{30,50}$/i.test(existing)) return existing;
  } catch {}
  const id = crypto.randomUUID();
  fs.writeFileSync(OTA_INSTANCE_FILE, `${id}\n`, { mode: 0o600 });
  return id;
}
function normalizeOtaBaseUrl(value) {
  let u;
  try { u = new URL(String(value || '').trim()); } catch { throw new Error('URL du serveur OTA invalide.'); }
  if (!['https:','http:'].includes(u.protocol)) throw new Error('Le serveur OTA doit utiliser HTTP ou HTTPS.');
  u.hash=''; u.search='';
  return u.toString().replace(/\/$/, '');
}
function otaAbsoluteUrl(baseUrl, relativePath) {
  const base = `${normalizeOtaBaseUrl(baseUrl)}/`;
  return new URL(String(relativePath || '').replace(/^\//,''), base).toString();
}
function assertOtaSameOrigin(baseUrl, targetUrl, label='URL OTA') {
  const base = new URL(normalizeOtaBaseUrl(baseUrl));
  const target = new URL(String(targetUrl));
  if (base.origin !== target.origin) throw new Error(`${label} pointe vers une origine différente du serveur OTA configuré.`);
  return target;
}
function requestTextUrl(fullUrl, { maxBytes=2*1024*1024 } = {}) {
  return new Promise((resolve,reject)=>{
    const u=new URL(fullUrl),lib=u.protocol==='https:'?https:http;
    const req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:`${u.pathname}${u.search}`,method:'GET',headers:{Accept:'text/plain,application/json;q=0.9,*/*;q=0.5'},rejectUnauthorized:true,timeout:12000},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){
        const next=new URL(res.headers.location,u).toString();res.resume();return requestTextUrl(next,{maxBytes}).then(resolve,reject);
      }
      let size=0;const chunks=[];
      res.on('data',c=>{size+=c.length;if(size>maxBytes){req.destroy(new Error('Réponse OTA trop volumineuse.'));return;}chunks.push(c)});
      res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error(`Serveur OTA : HTTP ${res.statusCode}`));resolve(Buffer.concat(chunks).toString('utf8'))});
    });
    req.on('timeout',()=>req.destroy(new Error('Timeout du serveur OTA')));req.on('error',reject);req.end();
  });
}
async function requestJsonUrl(fullUrl) {
  const text=await requestTextUrl(fullUrl,{maxBytes:4*1024*1024});
  try{return JSON.parse(text||'{}')}catch{throw new Error('Le serveur OTA a renvoyé un JSON invalide.');}
}
function postJsonUrl(fullUrl, payload, { maxBytes=1024*1024 } = {}) {
  return new Promise((resolve,reject)=>{
    const u=new URL(fullUrl),lib=u.protocol==='https:'?https:http,body=Buffer.from(JSON.stringify(payload||{}),'utf8');
    const req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:`${u.pathname}${u.search}`,method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','Content-Length':body.length},rejectUnauthorized:true,timeout:12000},res=>{
      let size=0;const chunks=[];
      res.on('data',c=>{size+=c.length;if(size>maxBytes){req.destroy(new Error('Réponse OTA trop volumineuse.'));return;}chunks.push(c)});
      res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');if(res.statusCode<200||res.statusCode>=300)return reject(new Error(`Serveur OTA : HTTP ${res.statusCode}${text?` · ${text.slice(0,300)}`:''}`));try{resolve(JSON.parse(text||'{}'))}catch{reject(new Error('Le serveur OTA a renvoyé un JSON invalide.'))}});
    });
    req.on('timeout',()=>req.destroy(new Error('Timeout du serveur OTA')));req.on('error',reject);req.end(body);
  });
}
async function sendOtaHeartbeat() {
  if (!otaRuntimeVersion()) {
    console.error(`[OTA] Heartbeat annulé : release.json absent, invalide ou version 0.0.0 interdite (${RELEASE_METADATA.error || 'version inconnue'}).`);
    return { sent:false, reason:'release-version-unavailable' };
  }
  const cfg=getSettings().updates||{};
  if(cfg.provider==='legacy')return {sent:false,reason:'legacy-provider'};
  const base=normalizeOtaBaseUrl(cfg.otaBaseUrl||OFFICIAL_OTA_BASE_URL);
  const payload={installation_id:getOtaInstanceId(),version:otaRuntimeVersion(),update_channel:normalizeUpdateChannel(cfg.otaChannel)};
  try{
    const response=await postJsonUrl(otaAbsoluteUrl(base,'api/v1/instances/heartbeat'),payload);
    return {sent:true,payload,response};
  }catch(error){
    console.warn(`[OTA] Heartbeat impossible : ${String(error?.message||error)}`);
    return {sent:false,reason:String(error?.message||error)};
  }
}
function otaPublicKeyFingerprint(pem) { return crypto.createHash('sha256').update(Buffer.from(String(pem||''),'utf8')).digest('hex'); }
function isOfficialOtaBaseUrl(value) {
  try { return normalizeOtaBaseUrl(value || OFFICIAL_OTA_BASE_URL) === normalizeOtaBaseUrl(OFFICIAL_OTA_BASE_URL); }
  catch { return false; }
}
async function ensureOfficialOtaTrust(cfg) {
  if (!isOfficialOtaBaseUrl(cfg?.otaBaseUrl)) return cfg;
  if (cfg?.otaPublicKeyPem && cfg?.otaPublicKeyFingerprint) return cfg;
  const key = await fetchOtaPublicKey({ ...(cfg || {}), otaBaseUrl: OFFICIAL_OTA_BASE_URL });
  const settings = getSettings();
  settings.updates = { ...(settings.updates || {}), provider: 'ota', otaBaseUrl: OFFICIAL_OTA_BASE_URL, otaPublicKeyPem: key.pem, otaPublicKeyFingerprint: key.fingerprint };
  saveSettings(settings);
  cfg.otaBaseUrl = OFFICIAL_OTA_BASE_URL;
  cfg.otaPublicKeyPem = key.pem;
  cfg.otaPublicKeyFingerprint = key.fingerprint;
  addAuditSystem('ota.official-key.pin', OFFICIAL_OTA_BASE_URL, { fingerprint: key.fingerprint });
  return cfg;
}
function canonicalOtaManifest(manifest) {
  const payload={
    version:String(manifest.version||''),
    channel:String(manifest.channel||''),
    filename:String(manifest.package?.filename||''),
    file_size:Number(manifest.package?.size||0),
    sha256:String(manifest.package?.sha256||''),
    mandatory:!!manifest.mandatory,
    min_supported_version:manifest.min_supported_version ? String(manifest.min_supported_version) : null
  };
  const ordered={};for(const k of Object.keys(payload).sort())ordered[k]=payload[k];
  return Buffer.from(JSON.stringify(ordered),'utf8');
}
function verifyOtaManifestSignature(manifest, publicKeyPem) {
  if(!publicKeyPem) return false;
  if(String(manifest.signature?.algorithm||'')!=='Ed25519') throw new Error('Algorithme de signature OTA non supporté.');
  const sig=Buffer.from(String(manifest.signature?.value_base64||''),'base64');
  if(!sig.length) throw new Error('Signature OTA absente.');
  try{return crypto.verify(null,canonicalOtaManifest(manifest),publicKeyPem,sig)}catch(e){throw new Error(`Clé publique OTA invalide : ${e.message}`)}
}
async function fetchOtaPublicKey(cfg) {
  const base=normalizeOtaBaseUrl(cfg.otaBaseUrl);
  const pem=await requestTextUrl(otaAbsoluteUrl(base,'api/v1/signing/public-key'));
  const fingerprintData=await requestJsonUrl(otaAbsoluteUrl(base,'api/v1/signing/fingerprint'));
  const computed=otaPublicKeyFingerprint(pem),remote=String(fingerprintData.sha256||'').toLowerCase();
  if(!remote||computed!==remote) throw new Error('Empreinte de clé OTA incohérente entre la clé publique et le serveur.');
  return {pem,fingerprint:computed};
}
async function testOtaConnection(cfg) {
  const base=normalizeOtaBaseUrl(cfg.otaBaseUrl);
  const [health,key]=await Promise.all([requestJsonUrl(otaAbsoluteUrl(base,'health')),fetchOtaPublicKey({...cfg,otaBaseUrl:base})]);
  const channel=normalizeUpdateChannel(cfg.otaChannel);
  const q=new URLSearchParams({version:requireOtaRuntimeVersion(),channel,instance_id:getOtaInstanceId()});
  const check=await requestJsonUrl(otaAbsoluteUrl(base,`api/v1/updates/check?${q}`));
  const rel=check.release||{},version=String(rel.version||'').replace(/^v/,'').trim();
  const installedVersion=requireOtaRuntimeVersion();
  const available=!!check.available&&!!parseSemver(version)&&compareSemver(version,installedVersion)>0&&releaseAllowedForUpdateChannel(version,channel,String(rel.channel||''));
  return {ok:health.status==='ok',baseUrl:base,channel,instanceId:getOtaInstanceId(),fingerprint:key.fingerprint,available,release:available?rel:null,serverReportedAvailable:!!check.available};
}
let OTA_LATEST_CACHE={at:0,key:'',data:null};
function otaSummaryChannel(summary, channel) {
  if (!summary || typeof summary !== 'object') return null;
  return summary[channel] || summary[`latest_${channel}`] || summary[`latest${channel[0].toUpperCase()}${channel.slice(1)}`] || summary.channels?.[channel] || null;
}
function normalizeOtaLatestRelease(channel, raw={}, manifest=null, cfg={}) {
  const m=manifest&&typeof manifest==='object'?manifest:{};
  const r=raw&&typeof raw==='object'?raw:{};
  const version=String(m.version||r.version||raw||'').replace(/^v/,'').trim();
  if(!version)return null;
  const improvements=normalizeReleaseNotes(m.improvements ?? r.improvements ?? r.improvementsFr ?? r.ameliorations ?? r.releaseNotesFr);
  const fixes=normalizeReleaseNotes(m.fixes ?? r.fixes ?? r.fixesFr ?? r.corrections);
  const notes=normalizeReleaseNotes(m.notes ?? r.notes ?? r.notesFr ?? r.info);
  const summaryFr=String(m.summary ?? r.summary ?? r.summaryFr ?? r.resume ?? r.description ?? m.title ?? r.title ?? '').trim().slice(0,4000);
  const allSecurity=[summaryFr,...improvements,...fixes,...notes].filter(Boolean).map(String).filter(x=>/\bCVE-\d{4}-\d+\b|s[ée]curit|security|vuln|RCE|privilege|auth(?:entication)? bypass/i.test(x));
  let signatureVerified=false;
  try{
    if(m.signature&&cfg.otaPublicKeyPem&&cfg.otaPublicKeyFingerprint&&otaPublicKeyFingerprint(cfg.otaPublicKeyPem)===String(cfg.otaPublicKeyFingerprint).toLowerCase()) signatureVerified=verifyOtaManifestSignature(m,cfg.otaPublicKeyPem);
  }catch{}
  let comparison=0;try{comparison=compareSemver(version,otaRuntimeVersion()||APP_VERSION)}catch{}
  return {
    version,channel:String(m.channel||r.channel||channel).toLowerCase(),title:String(m.title||r.title||'').trim(),summaryFr,
    improvements,fixes,notes,releaseNotesFr:[...improvements,...fixes.map(x=>`Correction : ${x}`),...notes].slice(0,100),securityNotesFr:allSecurity.slice(0,50),
    publishedAt:m.published_at||m.publishedAt||r.published_at||r.publishedAt||r.date||null,mandatory:!!(m.mandatory??r.mandatory),rollout:Number(m.rollout??r.rollout??100),
    minSupportedVersion:m.min_supported_version||r.min_supported_version||r.minSupportedVersion||null,fileSize:Number(m.package?.size||r.file_size||r.fileSize||0),
    downloadUrl:String(m.package?.download_url||r.download_url||r.downloadUrl||''),manifestUrl:String(r.manifest_url||r.manifestUrl||''),signatureVerified,
    newerThanInstalled:comparison>0,sameAsInstalled:comparison===0,olderThanInstalled:comparison<0
  };
}
async function fetchOtaLatestSummary(cfg,{force=false}={}) {
  cfg={...(cfg||{})};
  if(isOfficialOtaBaseUrl(cfg.otaBaseUrl||OFFICIAL_OTA_BASE_URL))await ensureOfficialOtaTrust(cfg);
  const base=normalizeOtaBaseUrl(cfg.otaBaseUrl||OFFICIAL_OTA_BASE_URL),cacheKey=`${base}|${cfg.otaPublicKeyFingerprint||''}`;
  if(!force&&OTA_LATEST_CACHE.data&&OTA_LATEST_CACHE.key===cacheKey&&Date.now()-OTA_LATEST_CACHE.at<60000)return OTA_LATEST_CACHE.data;
  let summary=null,source='public-summary',summaryError='';
  try{summary=await requestJsonUrl(otaAbsoluteUrl(base,'api/v1/public/summary'));}
  catch(e){source='check-fallback';summaryError=e.message;}
  async function resolveChannel(channel){
    let raw=otaSummaryChannel(summary,channel),version='';
    if(typeof raw==='string')version=raw.replace(/^v/,'').trim();
    else if(raw&&typeof raw==='object')version=String(raw.version||'').replace(/^v/,'').trim();
    let rel=raw&&typeof raw==='object'?raw:{};
    if(!version){
      try{
        const q=new URLSearchParams({version:requireOtaRuntimeVersion(),channel,instance_id:getOtaInstanceId()});
        const check=await requestJsonUrl(otaAbsoluteUrl(base,`api/v1/updates/check?${q}`));
        if(!check.available||!check.release)return null;
        rel=check.release||{};version=String(rel.version||'').replace(/^v/,'').trim();
      }catch{return null;}
    }
    if(!version)return null;
    let manifest=null;
    try{
      const manifestUrl=String(rel.manifest_url||rel.manifestUrl||otaAbsoluteUrl(base,`api/v1/releases/${encodeURIComponent(version)}/manifest`));
      assertOtaSameOrigin(base,manifestUrl,'Le manifeste public');
      manifest=await requestJsonUrl(manifestUrl);
    }catch{}
    return normalizeOtaLatestRelease(channel,{...rel,version},manifest,cfg);
  }
  const [stable,beta]=await Promise.all([resolveChannel('stable'),resolveChannel('beta')]);
  const data={ok:true,product:String(summary?.product||'ProxPanel'),baseUrl:base,currentVersion:APP_VERSION,currentChannel:APP_CHANNEL,instanceId:getOtaInstanceId(),fetchedAt:new Date().toISOString(),source,summaryEndpointAvailable:!!summary,summaryError:summary?null:summaryError,stable,beta};
  OTA_LATEST_CACHE={at:Date.now(),key:cacheKey,data};return data;
}

async function fetchOtaRelease(cfg) {
  cfg = { ...(cfg || {}) };
  if (isOfficialOtaBaseUrl(cfg.otaBaseUrl)) await ensureOfficialOtaTrust(cfg);
  const base=normalizeOtaBaseUrl(cfg.otaBaseUrl || OFFICIAL_OTA_BASE_URL);
  const channel=normalizeUpdateChannel(cfg.otaChannel);
  const installedVersion=requireOtaRuntimeVersion();
  const q=new URLSearchParams({version:installedVersion,channel,instance_id:getOtaInstanceId()});
  const check=await requestJsonUrl(otaAbsoluteUrl(base,`api/v1/updates/check?${q}`));
  if(!check.available)return {available:false,currentVersion:installedVersion,channel,provider:'ota',instanceId:getOtaInstanceId(),latestVersion:check.latest_version||check.latestVersion||null};
  const rel=check.release||{};
  const releaseVersion=String(rel.version||'').replace(/^v/,'').trim();
  if(!parseSemver(releaseVersion))throw new Error('Le serveur OTA a proposé une version SemVer invalide.');
  // Garde-fou local : le serveur OTA ne peut jamais provoquer un downgrade ou une réinstallation.
  if(compareSemver(releaseVersion,installedVersion)<=0){
    return {available:false,currentVersion:installedVersion,channel,provider:'ota',instanceId:getOtaInstanceId(),latestVersion:releaseVersion,ignoredReason:'not-newer'};
  }
  if(!releaseAllowedForUpdateChannel(releaseVersion,channel,String(rel.channel||''))){
    return {available:false,currentVersion:installedVersion,channel,provider:'ota',instanceId:getOtaInstanceId(),latestVersion:releaseVersion,ignoredReason:'channel-policy'};
  }
  const manifestUrl=rel.manifest_url||otaAbsoluteUrl(base,`api/v1/releases/${encodeURIComponent(releaseVersion)}/manifest`);
  assertOtaSameOrigin(base,manifestUrl,'Le manifeste');
  const manifest=await requestJsonUrl(manifestUrl);
  if(String(manifest.product||'').toLowerCase()!=='proxpanel')throw new Error('Le manifeste OTA ne correspond pas à ProxPanel.');
  if(String(manifest.version||'').replace(/^v/,'')!==releaseVersion)throw new Error('Version incohérente entre le check OTA et le manifeste.');
  if(!releaseAllowedForUpdateChannel(releaseVersion,channel,String(manifest.channel||rel.channel||'')))throw new Error(`La release ${releaseVersion} n’est pas autorisée sur le canal ${channel}.`);
  if(compareSemver(releaseVersion,installedVersion)<=0)return {available:false,currentVersion:installedVersion,channel,provider:'ota',instanceId:getOtaInstanceId(),latestVersion:releaseVersion,ignoredReason:'not-newer'};
  const expectedPin=String(cfg.otaPublicKeyFingerprint||'').toLowerCase();
  const pem=String(cfg.otaPublicKeyPem||'');
  let signatureVerified=false,trustRequired=!pem||!expectedPin;
  if(pem&&expectedPin){
    const actual=otaPublicKeyFingerprint(pem);
    if(actual!==expectedPin)throw new Error('La clé publique OTA locale ne correspond plus à son empreinte épinglée.');
    signatureVerified=verifyOtaManifestSignature(manifest,pem);
    if(!signatureVerified)throw new Error('SIGNATURE_OTA_INVALIDE : le manifeste a été refusé.');
    trustRequired=false;
  }
  const improvements=normalizeReleaseNotes(manifest.improvements),fixes=normalizeReleaseNotes(manifest.fixes),notes=normalizeReleaseNotes(manifest.notes);
  const allSecurity=[manifest.summary,...improvements,...fixes,...notes].filter(Boolean).map(String).filter(x=>/\bCVE-\d{4}-\d+\b|s[ée]curit|security|vuln|RCE|privilege|auth(?:entication)? bypass/i.test(x));
  const availableVersionType=installedVersionType(releaseVersion);
  const releaseChannel=String(manifest.channel||rel.channel||availableVersionType).toLowerCase()==='stable'?'stable':'beta';
  return {
    available:true,provider:'ota',currentVersion:installedVersion,channel,updateChannel:channel,releaseChannel,availableVersionType,instanceId:getOtaInstanceId(),version:releaseVersion,title:String(manifest.title||rel.title||''),publishedAt:manifest.published_at||rel.published_at||null,
    downloadUrl:String(manifest.package?.download_url||rel.download_url||''),manifestUrl,sha256:String(manifest.package?.sha256||''),fileSize:Number(manifest.package?.size||0),mandatory:!!manifest.mandatory,minSupportedVersion:manifest.min_supported_version||null,rollout:Number(manifest.rollout??100),
    summaryFr:String(manifest.summary||manifest.title||'').trim().slice(0,4000),releaseNotesFr:[...improvements,...fixes.map(x=>`Correction : ${x}`),...notes].slice(0,100),securityNotesFr:allSecurity.slice(0,50),breakingChangesFr:manifest.min_supported_version?[`Version minimale prise en charge : ${manifest.min_supported_version}`]:[],
    signatureVerified,trustRequired,pinnedFingerprint:expectedPin||null
  };
}
function remoteUpdatePublicState() {
  const state=jsonRead(UPDATE_CHECK_STATE_FILE,{}),settings=getSettings(),cfg=settings.updates||{};
  const provider=cfg.provider==='legacy'?'legacy':'ota';
  const configured=provider==='ota'?!!String(cfg.otaBaseUrl||'').trim():!!String(cfg.feedUrl||'').trim();
  const intervalHours=Math.max(1,Math.min(168,Number(cfg.checkIntervalHours||6))),lastMs=state.lastCheckAt?Date.parse(state.lastCheckAt):0;
  const nextCheckAt=configured&&lastMs?new Date(lastMs+intervalHours*3600000).toISOString():null;
  const autoWindow=autoInstallWindowMatch(settings,new Date());
  const selectedChannel=normalizeUpdateChannel(cfg.otaChannel);
  return {...state,currentVersion:APP_VERSION,installedVersionType:installedVersionType(APP_VERSION),channel:provider==='ota'?selectedChannel:APP_CHANNEL,updateChannel:selectedChannel,provider,configured,intervalHours,nextCheckAt,officialOtaBaseUrl:OFFICIAL_OTA_BASE_URL,officialOta:isOfficialOtaBaseUrl(cfg.otaBaseUrl),otaBaseUrl:cfg.otaBaseUrl||OFFICIAL_OTA_BASE_URL,otaChannel:selectedChannel,otaKeyPinned:!!(cfg.otaPublicKeyPem&&cfg.otaPublicKeyFingerprint),otaFingerprint:cfg.otaPublicKeyFingerprint||null,instanceId:getOtaInstanceId(),autoInstallEnabled:cfg.autoInstallEnabled===true,autoInstallWindows:normalizeAutoInstallWindows(cfg.autoInstallWindows),autoInstallWindowOpen:autoWindow.open,autoInstallTimeZone:autoWindow.timeZone,autoInstallLocalTime:autoWindow.localTime};
}
async function fetchRemoteRelease(feedUrl) {
  let u;try{u=new URL(String(feedUrl||'').trim())}catch{throw new Error('URL du flux de mise à jour invalide.');}
  if(!['https:','http:'].includes(u.protocol))throw new Error('Le flux de mise à jour doit utiliser HTTP ou HTTPS.');
  const data=await requestJsonUrl(u.toString()),version=String(data.version||'').trim();
  if(!parseSemver(version))throw new Error('Le flux de mise à jour ne contient pas une version SemVer valide.');
  if(data.product&&String(data.product)!=='proxpanel')throw new Error('Le flux ne correspond pas au produit ProxPanel.');
  return {version,publishedAt:data.publishedAt||data.date||null,downloadUrl:data.downloadUrl||data.url||'',summaryFr:String(data.summaryFr||data.resumeFr||'').trim().slice(0,4000),releaseNotesFr:normalizeReleaseNotes(data.releaseNotesFr||data.notesFr||data.notes||data.changelogFr),securityNotesFr:normalizeReleaseNotes(data.securityNotesFr||data.securityFr),breakingChangesFr:normalizeReleaseNotes(data.breakingChangesFr||data.breakingFr),signatureVerified:false,provider:'legacy'};
}
function updateSummaryFr(release) {
  const channel=String(release.channel||APP_CHANNEL).toUpperCase();
  const lines=[`ProxPanel ${release.version} est disponible (version installée : ${APP_VERSION}, canal ${channel}).`];
  if(release.signatureVerified)lines.push('Authenticité : manifeste OTA Ed25519 vérifié.');
  if(release.publishedAt)lines.push(`Publication : ${release.publishedAt}.`);
  if(release.summaryFr)lines.push('',release.summaryFr);
  if(release.releaseNotesFr?.length)lines.push('','Améliorations et corrections :',...release.releaseNotesFr.map(x=>`• ${x}`));
  if(release.securityNotesFr?.length)lines.push('','Sécurité :',...release.securityNotesFr.map(x=>`• ${x}`));
  if(release.breakingChangesFr?.length)lines.push('','Points d’attention :',...release.breakingChangesFr.map(x=>`• ${x}`));
  lines.push('',release.provider==='ota'?'Installation : Administration → Mises à jour → Installer depuis le serveur OTA.':'Installation : Administration → Mises à jour → importer le ZIP.');
  return lines.join('\n');
}
let UPDATE_CHECK_RUNNING=null;
async function checkRemoteUpdate({manual=false,notify=true}={}) {
  if(UPDATE_CHECK_RUNNING)return UPDATE_CHECK_RUNNING;
  UPDATE_CHECK_RUNNING=(async()=>{
    const settings=getSettings(),cfg=settings.updates||{},provider=cfg.provider==='legacy'?'legacy':'ota',previous=jsonRead(UPDATE_CHECK_STATE_FILE,{});
    const configured=provider==='ota'?!!cfg.otaBaseUrl:!!cfg.feedUrl;
    if(!configured){const state={...previous,currentVersion:APP_VERSION,provider,configured:false,available:false,lastCheckAt:new Date().toISOString(),error:provider==='ota'?'Aucun serveur OTA configuré.':'Aucun flux de mise à jour configuré.'};jsonWrite(UPDATE_CHECK_STATE_FILE,state);if(manual)throw new Error(state.error);return state;}
    try{
      let release;
      if(provider==='ota')release=await fetchOtaRelease(cfg);
      else{release=await fetchRemoteRelease(cfg.feedUrl);release.available=compareSemver(release.version,APP_VERSION)>0;release.currentVersion=APP_VERSION;release.channel=APP_CHANNEL;}
      const available=!!release.available;
      const state={currentVersion:APP_VERSION,configured:true,provider,available,...release,lastCheckAt:new Date().toISOString(),error:null,lastNotifiedVersion:previous.lastNotifiedVersion||null,autoInstallLastAt:previous.autoInstallLastAt||null,autoInstallLastVersion:previous.autoInstallLastVersion||null,autoInstallLastAttemptAt:previous.autoInstallLastAttemptAt||null,autoInstallLastError:previous.autoInstallLastError||null};
      if(available&&notify&&previous.lastNotifiedVersion!==release.version&&(!release.trustRequired)){
        const title=`ProxPanel ${release.version} disponible`,message=updateSummaryFr(release),jobs=[];
        if(cfg.notifyDiscord!==false)jobs.push(sendDiscordEvent(settings,{type:'system.update.available',severity:release.securityNotesFr?.length?'warning':'info',title,message,target:`v${release.version}`}));
        if(cfg.notifyEmail!==false&&settings.alerts?.smtp?.enabled)jobs.push(sendMailNotification(settings.alerts.smtp,title,message,{type:'system.update.available',severity:release.securityNotesFr?.length?'warning':'info',serverName:'ProxPanel',target:`v${release.version}`,channel:release.releaseChannel||normalizeUpdateChannel(cfg.otaChannel),details:release.releaseNotesFr||[]}));
        await Promise.allSettled(jobs);state.lastNotifiedVersion=release.version;addAuditSystem('update.available',`v${release.version}`,{provider,verified:!!release.signatureVerified,discord:cfg.notifyDiscord!==false,email:cfg.notifyEmail!==false});
      }
      jsonWrite(UPDATE_CHECK_STATE_FILE,state);return state;
    }catch(e){const state={...previous,currentVersion:APP_VERSION,provider,configured:true,available:false,lastCheckAt:new Date().toISOString(),error:e.message};jsonWrite(UPDATE_CHECK_STATE_FILE,state);if(manual)throw e;return state;}
  })();
  try{return await UPDATE_CHECK_RUNNING}finally{UPDATE_CHECK_RUNNING=null}
}
async function runAutomaticUpdateCheck(){const settings=getSettings(),cfg=settings.updates||{},configured=cfg.provider==='legacy'?!!cfg.feedUrl:!!cfg.otaBaseUrl;if(cfg.autoCheckEnabled===false||!configured)return;const state=jsonRead(UPDATE_CHECK_STATE_FILE,{}),last=state.lastCheckAt?Date.parse(state.lastCheckAt):0,interval=Math.max(1,Math.min(168,Number(cfg.checkIntervalHours||6)))*3600000;if(Date.now()-last<interval)return;await checkRemoteUpdate({manual:false,notify:true});}
function downloadUrlToFile(fullUrl,dest,{maxBytes=MAX_UPDATE_BYTES,expectedOrigin=null,redirects=3}={}){
  return new Promise((resolve,reject)=>{
    const u=new URL(fullUrl);if(expectedOrigin&&u.origin!==expectedOrigin)return reject(new Error('Le téléchargement OTA pointe vers une origine non autorisée.'));
    const lib=u.protocol==='https:'?https:http,hash=crypto.createHash('sha256');let size=0,done=false;
    const fail=e=>{if(done)return;done=true;try{fs.rmSync(dest,{force:true})}catch{}reject(e)};
    const req=lib.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:`${u.pathname}${u.search}`,method:'GET',headers:{Accept:'application/octet-stream'},rejectUnauthorized:true,timeout:30000},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){if(redirects<=0){res.resume();return fail(new Error('Trop de redirections OTA.'))}const next=new URL(res.headers.location,u).toString();res.resume();return downloadUrlToFile(next,dest,{maxBytes,expectedOrigin,redirects:redirects-1}).then(resolve,fail);}
      if(res.statusCode<200||res.statusCode>=300){res.resume();return fail(new Error(`Téléchargement OTA : HTTP ${res.statusCode}`));}
      const out=fs.createWriteStream(dest,{mode:0o600});
      res.on('data',c=>{size+=c.length;if(size>maxBytes){req.destroy(new Error(`Package OTA trop volumineux (> ${Math.round(maxBytes/1024/1024)} Mo).`));return;}hash.update(c)});
      res.pipe(out);out.on('finish',()=>{out.close(()=>{if(done)return;done=true;resolve({size,sha256:hash.digest('hex')})})});out.on('error',fail);
    });
    req.on('timeout',()=>req.destroy(new Error('Timeout pendant le téléchargement OTA')));req.on('error',fail);req.end();
  });
}

let OTA_INSTALL_RUNNING=null;
async function installAvailableOtaUpdate({automatic=false}={}) {
  if(OTA_INSTALL_RUNNING)return OTA_INSTALL_RUNNING;
  OTA_INSTALL_RUNNING=(async()=>{
    const tempZip=path.join(UPDATE_UPLOAD_DIR,`ota-${automatic?'auto-':'manual-'}${Date.now()}-${crypto.randomUUID()}.zip`);
    try{
      const settings=getSettings(),cfg={...(settings.updates||{})};
      if(cfg.provider==='legacy')throw new Error('Le fournisseur OTA officiel est désactivé.');
      cfg.otaBaseUrl=cfg.otaBaseUrl||OFFICIAL_OTA_BASE_URL;
      if(automatic){
        if(cfg.autoInstallEnabled!==true)throw new Error('Installation automatique désactivée.');
        const win=autoInstallWindowMatch(settings,new Date());
        if(!win.open)throw new Error('La fenêtre de maintenance automatique est fermée.');
      }
      if(isOfficialOtaBaseUrl(cfg.otaBaseUrl))await ensureOfficialOtaTrust(cfg);
      if(!cfg.otaPublicKeyPem||!cfg.otaPublicKeyFingerprint)throw new Error('La clé publique du serveur OTA personnalisé doit d’abord être épinglée.');
      const release=await fetchOtaRelease(cfg);
      if(!release.available)throw new Error('Aucune mise à jour OTA disponible.');
      if(!release.signatureVerified)throw new Error('La signature Ed25519 du manifeste OTA n’est pas vérifiée.');
      const manifest=await requestJsonUrl(release.manifestUrl);
      if(manifest.min_supported_version&&compareSemver(APP_VERSION,String(manifest.min_supported_version))<0)throw new Error(`Cette release nécessite ProxPanel ${manifest.min_supported_version} minimum.`);
      const downloadUrl=String(manifest.package?.download_url||release.downloadUrl||'');
      if(!downloadUrl)throw new Error('URL de téléchargement OTA absente.');
      const base=new URL(normalizeOtaBaseUrl(cfg.otaBaseUrl));assertOtaSameOrigin(cfg.otaBaseUrl,downloadUrl,'Le package');
      const dl=await downloadUrlToFile(downloadUrl,tempZip,{maxBytes:MAX_UPDATE_BYTES,expectedOrigin:base.origin});
      const expectedSha=String(manifest.package?.sha256||'').toLowerCase();
      if(!expectedSha||dl.sha256.toLowerCase()!==expectedSha)throw new Error('SHA-256 du package OTA invalide. Installation refusée.');
      if(Number(manifest.package?.size||0)>0&&Number(manifest.package.size)!==dl.size)throw new Error('Taille du package OTA incohérente. Installation refusée.');
      inspectUpdateZip(tempZip);
      const internal=readUpdateManifest(tempZip);
      if(String(internal.version)!==String(manifest.version))throw new Error(`Le ZIP annonce ${internal.version}, mais le manifeste OTA annonce ${manifest.version}.`);
      const result=installUpdateZip(tempZip,{sha256:dl.sha256,size:dl.size,filename:manifest.package?.filename||path.basename(downloadUrl),automatic});
      try{fs.rmSync(tempZip,{force:true})}catch{}
      return {result,release,manifest,download:dl,cfg};
    }catch(e){try{fs.rmSync(tempZip,{force:true})}catch{}throw e;}
  })();
  try{return await OTA_INSTALL_RUNNING}finally{OTA_INSTALL_RUNNING=null}
}

let AUTO_UPDATE_INSTALL_CHECK_RUNNING=null;
async function runAutomaticUpdateInstall(){
  if(AUTO_UPDATE_INSTALL_CHECK_RUNNING)return AUTO_UPDATE_INSTALL_CHECK_RUNNING;
  AUTO_UPDATE_INSTALL_CHECK_RUNNING=(async()=>{
    const settings=getSettings(),cfg=settings.updates||{};
    if(cfg.autoInstallEnabled!==true||cfg.provider==='legacy'||!cfg.otaBaseUrl)return;
    const windowState=autoInstallWindowMatch(settings,new Date());
    if(!windowState.open)return;
    let check;
    try{check=await checkRemoteUpdate({manual:false,notify:true});}
    catch(e){addAuditSystem('update.auto-check','ota',{error:e.message},'error');return;}
    if(!check?.available||check.trustRequired||!check.signatureVerified)return;
    try{
      const installed=await installAvailableOtaUpdate({automatic:true});
      const version=installed.result.manifest.version;
      const state={...jsonRead(UPDATE_CHECK_STATE_FILE,{}),autoInstallLastAt:new Date().toISOString(),autoInstallLastVersion:version,autoInstallLastError:null};
      jsonWrite(UPDATE_CHECK_STATE_FILE,state);
      addAuditSystem('update.ota.auto-install',`v${version}`,{sha256:installed.download.sha256,verified:true,fingerprint:installed.cfg.otaPublicKeyFingerprint,backup:installed.result.backupDir,timeZone:windowState.timeZone,localTime:windowState.localTime});
      setTimeout(()=>process.exit(75),1200).unref();
    }catch(e){
      const state={...jsonRead(UPDATE_CHECK_STATE_FILE,{}),autoInstallLastAttemptAt:new Date().toISOString(),autoInstallLastError:e.message};
      jsonWrite(UPDATE_CHECK_STATE_FILE,state);
      addAuditSystem('update.ota.auto-install','ota',{error:e.message,timeZone:windowState.timeZone,localTime:windowState.localTime},'error');
    }
  })();
  try{return await AUTO_UPDATE_INSTALL_CHECK_RUNNING}finally{AUTO_UPDATE_INSTALL_CHECK_RUNNING=null}
}

function normalizeAptUpdate(row) {
  return {
    package: String(row?.Package || row?.package || row?.name || '').trim(),
    oldVersion: String(row?.OldVersion || row?.oldversion || row?.CurrentVersion || row?.current || '').trim(),
    version: String(row?.Version || row?.version || row?.CandidateVersion || row?.candidate || '').trim(),
    title: String(row?.Title || row?.title || row?.Description || row?.description || '').trim(),
    origin: String(row?.Origin || row?.origin || '').trim(),
    priority: String(row?.Priority || row?.priority || '').trim(),
    section: String(row?.Section || row?.section || '').trim()
  };
}
function aptCategoryFr(name='') {
  const n=String(name).toLowerCase();
  if (/^(pve-manager|proxmox-ve|libpve)/.test(n)) return 'Gestion Proxmox VE';
  if (/kernel|microcode|firmware/.test(n)) return 'Noyau, pilotes et firmware';
  if (/qemu|pve-qemu|qemu-server/.test(n)) return 'Machines virtuelles QEMU';
  if (/lxc|pve-container/.test(n)) return 'Conteneurs LXC';
  if (/storage|zfs/.test(n)) return 'Stockage et ZFS';
  if (/ceph/.test(n)) return 'Ceph';
  if (/corosync|pve-cluster|ha-manager/.test(n)) return 'Cluster et haute disponibilité';
  if (/firewall/.test(n)) return 'Pare-feu';
  if (/network|ifupdown/.test(n)) return 'Réseau';
  if (/openssl|ssh|security|apparmor/.test(n)) return 'Sécurité';
  return 'Système Debian / dépendances';
}
function frenchifyChangelogLine(line='') {
  let x=String(line).trim().replace(/^[-*•]\s*/, '');
  if (!x) return '';
  const rules=[
    [/^fix(?:ed)?\b/i,'Correction'],[/^add(?:ed)?\b/i,'Ajout'],[/^improv(?:e|ed|ement)\b/i,'Amélioration'],[/^update(?:d)?\b/i,'Mise à jour'],[/^support\b/i,'Prise en charge'],[/^remove(?:d)?\b/i,'Suppression'],[/^allow\b/i,'Autorise'],[/^avoid\b/i,'Évite'],[/^handle\b/i,'Gestion'],[/^change(?:d)?\b/i,'Modification'],[/^security\b/i,'Sécurité']
  ];
  for (const [re,fr] of rules) if (re.test(x)) { x=x.replace(re,fr); break; }
  return x.slice(0,500);
}
function extractFrenchHighlights(changelog='') {
  const lines=String(changelog||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  for (const line of lines) {
    if (/^(\*|-|•)\s+/.test(line) || /^\s{0,3}(fix|add|improv|update|support|remove|allow|avoid|handle|change|security)/i.test(line)) {
      const t=frenchifyChangelogLine(line); if(t&&!out.includes(t)) out.push(t);
    }
    if(out.length>=5)break;
  }
  return out;
}

function extractCves(text='') {
  return [...new Set((String(text||'').match(/CVE-\d{4}-\d{4,7}/gi)||[]).map(x=>x.toUpperCase()))].slice(0,30);
}
function classifyPveUpdateSecurity(item={}, changelog='') {
  const hay=`${item.package||''} ${item.title||''} ${item.origin||''} ${item.priority||''} ${changelog||''}`.toLowerCase();
  const cves=extractCves(changelog);
  const criticalSignals=/\bcritical\b|remote code execution|\brce\b|privilege escalation|authentication bypass|unauthenticated|arbitrary code execution|use-after-free.*remote|container escape|vm escape/.test(hay);
  const securitySignals=cves.length>0||/security fix|security update|security issue|vulnerab|debian-security|bookworm-security|trixie-security/.test(hay);
  const importantSignals=/proxmox-kernel|pve-kernel|pve-manager|proxmox-ve|qemu-server|pve-qemu-kvm|pve-container|corosync|pve-cluster|ha-manager|openssl|openssh/.test(String(item.package||'').toLowerCase());
  const level=criticalSignals?'critical':securitySignals?'security':importantSignals?'important':'standard';
  return { level, cves, securityDetected:securitySignals||criticalSignals, criticalDetected:criticalSignals };
}
function pveUpdateLevelLabel(level='standard') {
  return level==='critical'?'CRITIQUE':level==='security'?'SÉCURITÉ':level==='important'?'IMPORTANT':'STANDARD';
}
function pveUpdateLevelWeight(level='standard') { return level==='critical'?4:level==='security'?3:level==='important'?2:1; }
async function waitForTask(server, auth, node, upid, timeoutMs=60000) {
  if(!upid)return;
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    try{
      const st=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`,{auth});
      if(String(st?.status||'').toLowerCase()==='stopped')return st;
    }catch{}
    await new Promise(r=>setTimeout(r,1500));
  }
}
async function fetchNodeUpdates(server, auth, node, {refresh=false, includeChangelog=true}={}) {
  if(refresh){
    try{const upid=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/update`,{method:'POST',auth});await waitForTask(server,auth,node,upid,45000);}catch{}
  }
  const raw=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/update`,{auth});
  const updates=(Array.isArray(raw)?raw:[]).map(normalizeAptUpdate).filter(x=>x.package);
  const detailed=[];
  if(includeChangelog){
    for(const item of updates){
      let changelog='';
      try{changelog=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/changelog?name=${encodeURIComponent(item.package)}${item.version?`&version=${encodeURIComponent(item.version)}`:''}`,{auth});}catch{}
      const sec=classifyPveUpdateSecurity(item,changelog);
      detailed.push({...item,categoryFr:aptCategoryFr(item.package),highlightsFr:extractFrenchHighlights(changelog),changelog:String(changelog||'').slice(0,12000),...sec});
    }
  } else for(const item of updates){const sec=classifyPveUpdateSecurity(item,'');detailed.push({...item,categoryFr:aptCategoryFr(item.package),highlightsFr:[],...sec});}
  return detailed;
}
function pveUpdateDigest(rows=[]) {
  return crypto.createHash('sha256').update(rows.map(x=>`${x.package}:${x.oldVersion}>${x.version}`).sort().join('|')).digest('hex');
}
function buildPveUpdateSummaryFr(serverName,node,updates){
  const groups=new Map();
  for(const u of updates){const k=u.categoryFr||aptCategoryFr(u.package);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(u)}
  const critical=updates.filter(u=>u.level==='critical'), security=updates.filter(u=>u.level==='security'), important=updates.filter(u=>u.level==='important');
  const cves=[...new Set(updates.flatMap(u=>u.cves||[]))];
  const lines=[`Des mises à jour Proxmox/Debian sont disponibles sur ${node} (${serverName}).`,`Paquets concernés : ${updates.length}.`,`Criticité détectée par ProxPanel : ${critical.length} critique(s), ${security.length} sécurité, ${important.length} importante(s).`];
  if(cves.length)lines.push(`Références CVE détectées dans les changelogs : ${cves.join(', ')}.`);
  lines.push('');
  for(const [cat,items] of groups){lines.push(`${cat} :`);for(const u of items)lines.push(`• [${pveUpdateLevelLabel(u.level)}] ${u.package} : ${u.oldVersion||'installée'} → ${u.version||'nouvelle version'}${(u.cves||[]).length?` · ${(u.cves||[]).join(', ')}`:''}`);}
  const highlights=updates.flatMap(u=>(u.highlightsFr||[]).map(x=>`• ${u.package} : ${x}`)).slice(0,30);
  if(highlights.length)lines.push('','Principales améliorations / corrections (résumé local en français) :',...highlights);
  if(critical.length||security.length)lines.push('','Sécurité : les niveaux ci-dessus sont déterminés à partir des changelogs et références CVE détectées. Consulte le changelog officiel avant installation.');
  lines.push('','Ouvre ProxPanel → Mises à jour PVE pour consulter le détail puis planifier la maintenance du nœud.');
  return lines.join('\n');
}
function buildManualPveUpdateReportFr(result){
  const lines=[`Contrôle manuel des mises à jour Proxmox terminé.`,`Nœuds vérifiés : ${Number(result.totalNodes||0)}.`,`Paquets disponibles : ${Number(result.totalUpdates||0)}.`];
  let critical=0,security=0,important=0; const cves=new Set();
  for(const srv of result.servers||[]){
    lines.push('',`${srv.serverName||'Proxmox'} :`);
    if(srv.error){lines.push(`• Erreur : ${srv.error}`);continue;}
    for(const node of srv.nodes||[]){
      if(node.error){lines.push(`• ${node.node} : erreur — ${node.error}`);continue;}
      lines.push(`• ${node.node} : ${node.count||0} mise(s) à jour`);
      for(const u of node.updates||[]){
        if(u.level==='critical')critical++; else if(u.level==='security')security++; else if(u.level==='important')important++;
        for(const c of u.cves||[])cves.add(c);
        lines.push(`   - [${pveUpdateLevelLabel(u.level)}] ${u.package} ${u.oldVersion||'installée'} → ${u.version||'nouvelle version'}${(u.cves||[]).length?` · ${(u.cves||[]).join(', ')}`:''}`);
      }
    }
  }
  lines.splice(3,0,`Synthèse : ${critical} critique(s), ${security} sécurité, ${important} importante(s).`);
  if(cves.size)lines.splice(4,0,`CVE détectées : ${[...cves].join(', ')}.`);
  if(!result.totalUpdates)lines.push('','Résultat : aucun paquet à mettre à jour, les nœuds contrôlés sont à jour selon APT.');
  lines.push('','Ce rapport a été généré volontairement à la suite d’un contrôle manuel dans ProxPanel BETA.');
  return lines.join('\n');
}
function pveUpdatePublicState(){
  const state=jsonRead(PVE_UPDATE_STATE_FILE,{}),cfg=getSettings().pveUpdates||{};
  const intervalHours=Math.max(1,Math.min(168,Number(cfg.checkIntervalHours||6))),last=state.lastCheckAt?Date.parse(state.lastCheckAt):0;
  return {...state,enabled:cfg.enabled!==false,intervalHours,nextCheckAt:last?new Date(last+intervalHours*3600000).toISOString():null};
}
let PVE_UPDATE_CHECK_RUNNING=null;
async function checkPveUpdates({manual=false,notify=true}={}){
  if(PVE_UPDATE_CHECK_RUNNING)return PVE_UPDATE_CHECK_RUNNING;
  PVE_UPDATE_CHECK_RUNNING=(async()=>{
    const settings=getSettings(),cfg=settings.pveUpdates||{},previous=jsonRead(PVE_UPDATE_STATE_FILE,{}),serversOut=[];let totalUpdates=0,totalNodes=0;
    for(const server of jsonRead(SERVERS_FILE,[])){
      if(!(server.passwordEnc||server.apiTokenSecretEnc)){serversOut.push({serverId:server.id,serverName:server.name,error:'Authentification persistante requise pour le contrôle automatique.',nodes:[]});continue;}
      try{
        const auth=await proxmoxLogin(server),resources=await proxmoxApi(server,'/cluster/resources',{auth});
        const nodes=[...new Set((Array.isArray(resources)?resources:[]).filter(x=>x.type==='node').map(x=>x.node).filter(Boolean))];
        const nodeRows=[];
        for(const node of nodes){
          totalNodes++;
          try{
            const updates=await fetchNodeUpdates(server,auth,node,{refresh:manual||cfg.refreshApt!==false,includeChangelog:cfg.includeChangelog!==false});
            totalUpdates+=updates.length;
            const digest=pveUpdateDigest(updates),prevNode=previous.servers?.find(x=>x.serverId===server.id)?.nodes?.find(x=>x.node===node)||{};
            const criticalCount=updates.filter(u=>u.level==='critical').length;
            const securityCount=updates.filter(u=>u.level==='security').length;
            const importantCount=updates.filter(u=>u.level==='important').length;
            const cves=[...new Set(updates.flatMap(u=>u.cves||[]))];
            nodeRows.push({node,count:updates.length,updates,digest,criticalCount,securityCount,importantCount,cves,checkedAt:new Date().toISOString(),error:null,lastNotifiedDigest:prevNode.lastNotifiedDigest||null});
            if(!manual && updates.length&&notify&&digest!==prevNode.lastNotifiedDigest){
              const hasCritical=criticalCount>0, hasSecurity=securityCount>0||cves.length>0;
              const title=hasCritical?`Mise à jour CRITIQUE Proxmox · ${node}`:hasSecurity?`Mise à jour de sécurité Proxmox · ${node}`:`${updates.length} mise${updates.length>1?'s':''} à jour Proxmox disponible${updates.length>1?'s':''} · ${node}`;
              const message=buildPveUpdateSummaryFr(server.name,node,updates);const jobs=[];
              const updateEvent={type:hasCritical||hasSecurity?'pve.update.security':'pve.update.available',severity:hasCritical?'critical':hasSecurity?'warning':'info',title,message,serverName:server.name,target:node,details:[`Paquets : ${updates.length}`,`Critiques : ${criticalCount}`,`Sécurité : ${securityCount}`,`Importantes : ${importantCount}`,...(cves.length?[`CVE : ${cves.join(', ')}`]:[]),...updates.slice(0,14).map(u=>`[${pveUpdateLevelLabel(u.level)}] ${u.package} : ${u.oldVersion||'installée'} → ${u.version||'nouvelle version'}${(u.cves||[]).length?` · ${(u.cves||[]).join(', ')}`:''}`)],recommendation:hasCritical?'Une criticité élevée a été détectée dans le changelog. Consulte immédiatement le détail puis planifie la maintenance selon ton niveau de risque.':hasSecurity?'Des références de sécurité/CVE ont été détectées. Consulte le changelog officiel et planifie la mise à jour.':'Consulte ProxPanel → Mises à jour PVE, lis les changelogs puis planifie la maintenance du nœud avant installation.'};
              if(cfg.notifyDiscord!==false)jobs.push(sendDiscordEvent(settings,updateEvent));
              if(cfg.notifyEmail!==false&&settings.alerts?.smtp?.enabled)jobs.push(sendMailNotification(settings.alerts.smtp,title,message,updateEvent));
              await Promise.allSettled(jobs);nodeRows[nodeRows.length-1].lastNotifiedDigest=digest;addAuditSystem('pve-updates.available',node,{server:server.name,count:updates.length,criticalCount,securityCount,cves});
            }
          }catch(e){nodeRows.push({node,count:0,updates:[],digest:'',criticalCount:0,securityCount:0,importantCount:0,cves:[],checkedAt:new Date().toISOString(),error:e.message,lastNotifiedDigest:null});}
        }
        serversOut.push({serverId:server.id,serverName:server.name,nodes:nodeRows,error:null});
      }catch(e){serversOut.push({serverId:server.id,serverName:server.name,error:e.message,nodes:[]});}
    }
    const allUpdates=serversOut.flatMap(srv=>(srv.nodes||[]).flatMap(n=>n.updates||[]));
    const criticalTotal=allUpdates.filter(u=>u.level==='critical').length, securityTotal=allUpdates.filter(u=>u.level==='security').length, importantTotal=allUpdates.filter(u=>u.level==='important').length;
    const cves=[...new Set(allUpdates.flatMap(u=>u.cves||[]))];
    const state={lastCheckAt:new Date().toISOString(),totalUpdates,totalNodes,criticalTotal,securityTotal,importantTotal,cves,servers:serversOut,error:null};
    jsonWrite(PVE_UPDATE_STATE_FILE,state);
    if(manual&&notify){
      const report=buildManualPveUpdateReportFr(state);
      const severity=criticalTotal?'critical':(securityTotal||cves.length)?'warning':'info';
      const title=criticalTotal?`Contrôle manuel PVE — ${criticalTotal} mise(s) à jour CRITIQUE(S)`:securityTotal?`Contrôle manuel PVE — ${securityTotal} mise(s) à jour de sécurité`:`Contrôle manuel PVE — ${totalUpdates} mise(s) à jour disponible(s)`;
      const event={type:'pve.update.manual-report',severity,title,message:report,serverName:'Tous les serveurs configurés',target:`${totalNodes} nœud(s)`,details:[`Paquets disponibles : ${totalUpdates}`,`Critiques : ${criticalTotal}`,`Sécurité : ${securityTotal}`,`Importantes : ${importantTotal}`,...(cves.length?[`CVE détectées : ${cves.join(', ')}`]:[])],recommendation:criticalTotal?'Des mises à jour critiques ont été détectées. Consulte immédiatement ProxPanel → Mises à jour PVE et les changelogs avant planification.':securityTotal||cves.length?'Des correctifs de sécurité ont été détectés. Consulte les changelogs puis planifie leur installation.':'Le contrôle manuel est terminé. Si aucun paquet n’est disponible, aucune action n’est requise.'};
      const jobs=[];
      if(cfg.manualReportEmail!==false&&settings.alerts?.smtp?.enabled)jobs.push(sendMailNotification(settings.alerts.smtp,title,report,event));
      if(cfg.manualReportDiscord!==false)jobs.push(sendDiscordEvent(settings,event));
      await Promise.allSettled(jobs);
      if(cfg.manualAudit!==false)addAuditSystem('pve-updates.manual-report','all',{totalUpdates,totalNodes,criticalTotal,securityTotal,importantTotal,cves,email:cfg.manualReportEmail!==false,discord:cfg.manualReportDiscord!==false});
    }
    return state;
  })();
  try{return await PVE_UPDATE_CHECK_RUNNING}finally{PVE_UPDATE_CHECK_RUNNING=null}
}
async function runAutomaticPveUpdateCheck(){
  const settings=getSettings(),cfg=settings.pveUpdates||{};if(cfg.enabled===false)return;
  const state=jsonRead(PVE_UPDATE_STATE_FILE,{}),last=state.lastCheckAt?Date.parse(state.lastCheckAt):0,interval=Math.max(1,Math.min(168,Number(cfg.checkIntervalHours||6)))*3600000;
  if(Date.now()-last<interval)return;await checkPveUpdates({manual:false,notify:true});
}

function sendWakeOnLan(mac, broadcast='255.255.255.255', port=9) {
  const hex=String(mac||'').replace(/[^0-9a-f]/gi,''); if(hex.length!==12) throw new Error('Adresse MAC invalide.');
  const macBuf=Buffer.from(hex,'hex'), packet=Buffer.concat([Buffer.alloc(6,0xff),...Array.from({length:16},()=>macBuf)]);
  return new Promise((resolve,reject)=>{const sock=dgram.createSocket('udp4'); sock.once('error',e=>{sock.close();reject(e)}); sock.bind(()=>{sock.setBroadcast(true);sock.send(packet,0,packet.length,Number(port)||9,broadcast,e=>{sock.close();e?reject(e):resolve();});});});
}
async function executeMachineAction(server, auth, machine, action) {
  const allowed=['start','stop','shutdown','reboot','suspend','resume','reset','hibernate']; if(!allowed.includes(action)) throw new Error('Action invalide.');
  if (action === 'reset' && machine.type !== 'qemu') throw new Error('Reset n’est disponible que pour les VM QEMU.');
  if (action === 'hibernate') {
    if (machine.type !== 'qemu') throw new Error('Hibernate n’est disponible que pour les VM QEMU.');
    return proxmoxApi(server, `/nodes/${encodeURIComponent(machine.node)}/qemu/${machine.vmid}/status/suspend`, { method:'POST', auth, body:{ todisk:1 } });
  }
  return proxmoxApi(server, `/nodes/${encodeURIComponent(machine.node)}/${machine.type}/${machine.vmid}/status/${action}`, { method:'POST', auth });
}
async function runAutomation(server, auth, scenario, reqForAudit=null) {
  const runId=crypto.randomUUID(); const run={id:runId,scenarioId:scenario.id,name:scenario.name,status:'running',startedAt:new Date().toISOString(),steps:[]}; AUTOMATION_RUNS.set(runId,run);
  (async()=>{
    try {
      for(const step of scenario.steps||[]){
        if(step.type==='wait'){const ms=Math.max(0,Math.min(3600000,Number(step.seconds||0)*1000));run.steps.push({step,status:'waiting',at:new Date().toISOString()});await sleep(ms);run.steps[run.steps.length-1].status='ok';continue;}
        if(step.type==='machine-action'){
          const resources=await proxmoxApi(server,'/cluster/resources',{auth}); const m=(resources||[]).find(x=>String(x.vmid)===String(step.vmid)&&(x.type==='qemu'||x.type==='lxc')); if(!m)throw new Error(`VM/LXC ${step.vmid} introuvable`);
          const task=await executeMachineAction(server,auth,m,step.action); const sr={step,status:'sent',task,at:new Date().toISOString()};run.steps.push(sr); if(task&&String(task).startsWith('UPID:')){const st=await waitForTask(server,auth,task,Number(step.timeoutMinutes||10)*60000);sr.status=String(st.exitstatus||'OK').toUpperCase()==='OK'?'ok':'error';sr.taskStatus=st;if(sr.status==='error')throw new Error(`Étape ${step.action} en erreur`);} else sr.status='ok'; continue;
        }
      }
      run.status='ok';run.finishedAt=new Date().toISOString();addAuditSystem('automation.run',scenario.name,{runId},'ok');
    }catch(e){run.status='error';run.error=e.message;run.finishedAt=new Date().toISOString();addAuditSystem('automation.run',scenario.name,{runId,error:e.message},'error');}
  })();
  return run;
}
function consoleDiagnosticsSnapshot(token){
  const state=CONSOLE_STATES.get(token);
  return state?.steps ? state.steps.map(step=>({...step})) : [];
}
function setConsoleDiagnostic(token,key,status,detail=''){
  const state=CONSOLE_STATES.get(token);
  if(!state)return;
  const step=state.steps.find(item=>item.key===key);
  if(step){
    step.status=status;
    step.detail=String(detail||'');
    step.at=Date.now();
  }
  state.updatedAt=Date.now();
}
async function createQemuVncProxy(server,auth,node,vmid){
  const endpoint=`/nodes/${encodeURIComponent(node)}/qemu/${vmid}/vncproxy`;
  const attempts=[
    // Prefer a dedicated 8-char VNC password. Proxmox returns it in `password`
    // and the PVEVNC ticket remains dedicated to the websocket tunnel.
    // This is the cleanest path for vanilla noVNC and newer qemu-server builds.
    {websocket:1,'generate-password':1},
    {'generate-password':1},
    // Compatibility fallbacks for older PVE/qemu-server releases.
    {websocket:1,'generate-password':0},
    {websocket:1},
    {}
  ];
  let lastError=null;
  for(const payload of attempts){
    try{return {proxy:await proxmoxApi(server,endpoint,{method:'POST',auth,body:payload}),payload};}
    catch(e){
      lastError=e;
      const msg=String(e?.message||'');
      // Only downgrade the payload for schema/parameter compatibility. Real
      // permission or runtime errors must be surfaced immediately.
      if(!/paramètre non supporté|property is not defined in schema|parameter verification failed|generate-password|websocket/i.test(msg))throw e;
    }
  }
  throw lastError||new Error('Impossible de créer le proxy VNC Proxmox.');
}
async function createConsoleSession(server, auth, ownerSession, body) {
  const node=String(body.node||''), type=String(body.type||''), vmid=Number(body.vmid||0), kind=String(body.kind||'auto');
  if(!node) throw new Error('Nœud requis.');
  let proxy, consoleKind,proxyOptions={};
  if(type==='qemu' && kind!=='term') { const created=await createQemuVncProxy(server,auth,node,vmid);proxy=created.proxy;proxyOptions=created.payload;consoleKind='vnc'; }
  else if(type==='lxc') { proxy=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/lxc/${vmid}/termproxy`,{method:'POST',auth,body:{}});consoleKind='term'; }
  else if(type==='qemu' && kind==='term') { proxy=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/qemu/${vmid}/termproxy`,{method:'POST',auth,body:{}});consoleKind='term'; }
  else if(type==='node') { proxy=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/termproxy`,{method:'POST',auth,body:{}});consoleKind='term'; }
  else throw new Error('Type de console non pris en charge.');
  if(!proxy?.ticket || !proxy?.port) throw new Error('Proxmox n’a pas retourné de ticket de console.');
  const token=crypto.randomBytes(32).toString('hex');
  const password=consoleKind==='vnc'?(proxy.password||proxy.ticket):'';
  CONSOLE_ERRORS.delete(token);
  const authMode=auth.consoleAuthMode||auth.authType||'unknown';
  const steps=[
    {key:'auth',label:'Authentification Proxmox',status:'ok',detail:authMode},
    {key:'proxy',label:consoleKind==='vnc'?'Proxy VNC Proxmox':'Proxy terminal Proxmox',status:'ok',detail:`port ${proxy.port}`},
    {key:'network',label:'Connexion réseau au nœud',status:'pending',detail:''},
    {key:'websocket',label:'WebSocket Proxmox',status:'pending',detail:''},
    {key:'client',label:consoleKind==='vnc'?'noVNC navigateur':'Terminal navigateur',status:'pending',detail:''}
  ];
  CONSOLE_STATES.set(token,{steps,createdAt:Date.now(),updatedAt:Date.now()});
  CONSOLE_SESSIONS.set(token,{token,serverId:server.id,node,type,vmid,kind:consoleKind,port:proxy.port,vncticket:proxy.ticket,password,auth,authMode,proxyOptions,ownerNonce:ownerSession.nonce,expiresAt:Date.now()+CONSOLE_TTL_MS});
  setTimeout(()=>{CONSOLE_SESSIONS.delete(token);CONSOLE_ERRORS.delete(token);CONSOLE_STATES.delete(token)},CONSOLE_TTL_MS+30000).unref();
  return {token,kind:consoleKind,password,termTicket:consoleKind==='term'?proxy.ticket:'',user:auth.username||server.username||'',authMode,expiresInSeconds:Math.round(CONSOLE_TTL_MS/1000),websocketPath:`/ws/console?token=${token}`,diagnostics:consoleDiagnosticsSnapshot(token)};
}

function buildMaintenancePlan(dashboard,node) {
  const current=(dashboard.nodes||[]).find(n=>n.node===node); if(!current)throw new Error('Nœud introuvable.');
  const targets=(dashboard.nodes||[]).filter(n=>n.node!==node&&(n.status==='online'||n.status==='unknown')).sort((a,b)=>Number(a.cpu||0)-Number(b.cpu||0));
  const machines=(dashboard.machines||[]).filter(m=>m.node===node&&m.status==='running');
  return {node,machines:machines.map((m,i)=>({...m,target:targets.length?targets[i%targets.length].node:null})),canMigrate:targets.length>0,steps:[{id:'preflight',label:'Vérifier santé et sauvegardes'},{id:'migrate',label:'Migrer les VM/LXC actives'},{id:'updates',label:'Installer les mises à jour dans le shell du nœud'},{id:'reboot',label:'Redémarrer le nœud'},{id:'verify',label:'Vérifier le retour du nœud et des services'}]};
}
function consoleUpstreamPath(item) {
  const base=`/api2/json/nodes/${encodeURIComponent(item.node)}`;
  if(item.type==='qemu') return `${base}/qemu/${item.vmid}/vncwebsocket?port=${encodeURIComponent(item.port)}&vncticket=${encodeURIComponent(item.vncticket)}`;
  if(item.type==='lxc') return `${base}/lxc/${item.vmid}/vncwebsocket?port=${encodeURIComponent(item.port)}&vncticket=${encodeURIComponent(item.vncticket)}`;
  return `${base}/vncwebsocket?port=${encodeURIComponent(item.port)}&vncticket=${encodeURIComponent(item.vncticket)}`;
}
function handleConsoleUpgrade(req, clientSocket, head) {
  let url; try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`);}catch{return clientSocket.destroy();}
  if(url.pathname!=='/ws/console') return clientSocket.destroy();
  const session=getSession(req); if(!session){clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');return clientSocket.destroy();}
  const token=url.searchParams.get('token'); const item=CONSOLE_SESSIONS.get(token); if(!item||item.expiresAt<Date.now()||item.ownerNonce!==session.nonce){clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');return clientSocket.destroy();}
  const server=findServer(item.serverId); if(!server){clientSocket.write('HTTP/1.1 404 Not Found\r\n\r\n');return clientSocket.destroy();}
  const base=new URL(server.url); const port=Number(base.port||(base.protocol==='https:'?443:80)); const connectOpts={host:base.hostname,port};
  const upstream=base.protocol==='https:'?tls.connect({...connectOpts,servername:net.isIP(base.hostname)?undefined:base.hostname,rejectUnauthorized:!server.allowSelfSigned}):net.connect(connectOpts);
  let failed=false;
  const rememberError=(message,stage='websocket')=>{
    CONSOLE_ERRORS.set(token,{message:String(message||'Connexion console interrompue'),at:Date.now(),authMode:item.authMode||'unknown',stage});
    setConsoleDiagnostic(token,stage,'error',message);
  };
  const fail=(message='Connexion au WebSocket Proxmox interrompue',stage='websocket')=>{if(failed)return;failed=true;rememberError(message,stage);try{clientSocket.destroy()}catch{};try{upstream.destroy()}catch{}};
  setConsoleDiagnostic(token,'network','pending','Connexion au nœud Proxmox…');
  upstream.setTimeout(20000,()=>fail('Timeout lors de la connexion au nœud Proxmox.','network')); clientSocket.on('error',()=>fail('Connexion navigateur interrompue.','client')); upstream.on('error',e=>fail(`Connexion Proxmox : ${e.message}`,'network'));
  const onConnected=()=>{
    setConsoleDiagnostic(token,'network','ok',`${base.hostname}:${port}`);
    setConsoleDiagnostic(token,'websocket','pending','Handshake WebSocket en cours…');
    const wsKey=req.headers['sec-websocket-key']||crypto.randomBytes(16).toString('base64');
    // PVE vncwebsocket requires the `binary` websocket subprotocol. Do not
    // invent it server-side: browsers reject a selected subprotocol they did
    // not offer. noVNC is configured to explicitly offer `binary`.
    const offeredProtocols=String(req.headers['sec-websocket-protocol']||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!offeredProtocols.includes('binary')){
      rememberError('Console noVNC : le navigateur n’a pas négocié le sous-protocole WebSocket « binary ». Recharge ProxPanel puis réessaie.','client');
      clientSocket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: 27\r\n\r\nWebSocket binary required');
      return fail('Sous-protocole WebSocket binary absent côté navigateur.');
    }
    const requestedProtocol='binary';
    const headers=[`GET ${consoleUpstreamPath(item)} HTTP/1.1`,`Host: ${base.host}`,'Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Key: ${wsKey}`,'Sec-WebSocket-Version: 13',`Sec-WebSocket-Protocol: ${requestedProtocol}`,`Origin: ${base.protocol}//${base.host}`,'Pragma: no-cache','Cache-Control: no-cache'];
    const ah=proxmoxAuthHeaders(item.auth,'GET'); for(const [k,v] of Object.entries(ah))headers.push(`${k}: ${v}`);
    headers.push('\r\n'); upstream.write(headers.join('\r\n'));
    let buf=Buffer.alloc(0); const onData=chunk=>{buf=Buffer.concat([buf,chunk]);const idx=buf.indexOf('\r\n\r\n');if(idx<0)return;const headerText=buf.slice(0,idx).toString();if(!/^HTTP\/1\.1 101 /i.test(headerText)){const status=headerText.split('\r\n')[0]||'Réponse non-101';return fail(`Handshake console refusé par Proxmox (${status}).${item.authMode==='api-token'?' Cette version de PVE peut exiger un ticket utilisateur plutôt qu’un API Token pour les consoles.':''}`,'websocket');} upstream.removeListener('data',onData);CONSOLE_ERRORS.delete(token);setConsoleDiagnostic(token,'websocket','ok','Handshake 101 Switching Protocols');clientSocket.write(buf); if(head&&head.length)upstream.write(head);
      let tunnelEstablished=true;
      upstream.on('close',()=>{if(tunnelEstablished)rememberError('Le tunnel WebSocket Proxmox a été fermé après le handshake. Si l’écran reste noir, vérifie le mot de passe VNC retourné par vncproxy et les logs pveproxy/qemu-server.');});
      clientSocket.on('close',()=>{tunnelEstablished=false;});
      upstream.pipe(clientSocket); clientSocket.pipe(upstream);}; upstream.on('data',onData);
  };
  if(base.protocol==='https:')upstream.once('secureConnect',onConnected);else upstream.once('connect',onConnected);
}

async function handleApi(req, res, url) {
  const config = jsonRead(CONFIG_FILE, {});
  const users = panelUsers(config);
  const setupDone = users.length > 0;

  if (url.pathname === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, setupDone, authenticated: !!getSession(req), version: APP_VERSION, channel:APP_CHANNEL, beta:true, bootstrapVersion: BOOTSTRAP_VERSION, defaultLanguage:getSettings().language, demoMode:DEMO_MODE, demoCredentials:DEMO_MODE?{username:DEMO_USERNAME,password:DEMO_PASSWORD}:null });
  }
  if (url.pathname === '/api/setup' && req.method === 'POST') {
    if (setupDone) return sendJson(res, 409, { error: 'Configuration initiale déjà effectuée.' });
    if(!originAllowed(req))return sendJson(res,403,{error:'Origine de requête refusée.'});
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username) || password.length < 12) return sendJson(res, 400, { error: 'Utilisateur : 3–40 caractères. Mot de passe : 12 caractères minimum.' });
    if(!validAccountEmail(email))return sendJson(res,400,{error:'Une adresse e-mail valide est obligatoire. Elle servira notamment de secours pour la double authentification.'});
    const pw = hashPassword(password),createdAt=new Date().toISOString();
    const user={id:crypto.randomUUID(),username,displayName:username,email,role:'admin',permissions:['*'],active:true,salt:pw.salt,hash:pw.hash,createdAt,totpEnabled:false,totpSecretEnc:'',recoveryCodeHashes:[]};
    savePanelUsers([user]);
    jsonWrite(CONFIG_FILE, { admin: { username, email, salt: pw.salt, hash: pw.hash, createdAt } });
    saveSettings(defaultSettings());
    setSession(req,res,user);
    audit(req,'auth.setup',username,{role:'admin'});
    return sendJson(res, 201, { ok: true, username,role:'admin' });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!setupDone) return sendJson(res, 409, { error: 'Configuration initiale requise.' });
    if(!originAllowed(req))return sendJson(res,403,{error:'Origine de requête refusée.'});
    const body = await readBody(req);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if(!checkLoginAllowed(req,username))return sendJson(res,429,{error:'Trop de tentatives. Réessaie dans 15 minutes.'});
    const all=panelUsers(config),user=all.find(u=>u.username.toLowerCase()===username.toLowerCase());
    const candidate=user?.salt?hashPassword(password,user.salt).hash:'';
    if (!user || user.active===false || !safeEqualHex(candidate,user.hash||'')) { recordLoginFailure(req,username);addAuditSystem('auth.login.failed',username,{ip:clientIp(req)},'error');return sendJson(res,401,{error:'Identifiants incorrects.'}); }
    if(user.totpEnabled){
      const otp=String(body.otp||''),recoveryCode=String(body.recoveryCode||''),emailCode=String(body.emailCode||'');
      if(!otp&&!recoveryCode&&!emailCode){const er=emailRecoveryState(user);return sendJson(res,200,{ok:false,needTotp:true,username:user.username,emailRecoveryAvailable:er.available,emailMasked:er.emailMasked,mailConfigured:er.mailConfigured,recoveryCodesRemaining:Array.isArray(user.recoveryCodeHashes)?user.recoveryCodeHashes.length:0});}
      let factorOk=false,factor='';
      if(otp){let secret='';try{secret=decryptText(user.totpSecretEnc||'')}catch{}factorOk=!!secret&&verifyTotp(secret,otp);factor='totp';}
      else if(recoveryCode){const wanted=hashRecoveryCode(user.id,recoveryCode),idx=(user.recoveryCodeHashes||[]).findIndex(h=>safeEqualText(h,wanted));if(idx>=0){user.recoveryCodeHashes.splice(idx,1);factorOk=true;factor='recovery';savePanelUsers(all);}}
      else if(emailCode){const key=email2faKey(user.id),row=EMAIL_2FA_CODES.get(key),now=Date.now();if(row&&row.expiresAt>now&&row.ip===clientIp(req)&&row.attempts<5){const wanted=hashEmail2faCode(user.id,emailCode);if(safeEqualText(row.hash,wanted)){factorOk=true;factor='email';EMAIL_2FA_CODES.delete(key);}else{row.attempts+=1;EMAIL_2FA_CODES.set(key,row);}}}
      if(!factorOk){recordLoginFailure(req,username);addAuditSystem('auth.2fa.failed',username,{ip:clientIp(req),factor:factor||'unknown'},'error');return sendJson(res,401,{error:factor==='recovery'?'Code de récupération invalide.':factor==='email'?'Code e-mail invalide ou expiré.':'Code TOTP incorrect.'});}
      addAuditSystem('auth.2fa.success',username,{ip:clientIp(req),factor},'ok');
    }
    clearLoginFailures(req,username);user.lastLoginAt=new Date().toISOString();savePanelUsers(all);setSession(req,res,user);addAuditSystem('auth.login',username,{ip:clientIp(req),role:user.role},'ok');
    return sendJson(res,200,{ok:true,username:user.username,role:user.role,totp:!!user.totpEnabled});
  }
  if (url.pathname === '/api/login/recovery-email' && req.method === 'POST') {
    if(!setupDone)return sendJson(res,409,{error:'Configuration initiale requise.'});
    if(!originAllowed(req))return sendJson(res,403,{error:'Origine de requête refusée.'});
    const body=await readBody(req),username=String(body.username||'').trim(),password=String(body.password||'');
    if(!checkLoginAllowed(req,username))return sendJson(res,429,{error:'Trop de tentatives. Réessaie dans 15 minutes.'});
    const all=panelUsers(config),user=all.find(u=>u.username.toLowerCase()===username.toLowerCase()),candidate=user?.salt?hashPassword(password,user.salt).hash:'';
    if(!user||user.active===false||!safeEqualHex(candidate,user.hash||'')){recordLoginFailure(req,username);addAuditSystem('auth.email2fa.request.failed',username,{ip:clientIp(req)},'error');return sendJson(res,401,{error:'Identifiants incorrects.'});}
    if(!user.totpEnabled)return sendJson(res,400,{error:'La double authentification n’est pas activée sur ce compte.'});
    if(!validAccountEmail(user.email))return sendJson(res,400,{error:'Aucune adresse e-mail valide n’est associée à ce compte.'});
    const mailCfg=getSettings().alerts?.smtp||{};if(!mailCfg.enabled)return sendJson(res,503,{error:'Le secours 2FA par e-mail est indisponible : la configuration e-mail ProxPanel n’est pas activée.'});
    const key=email2faKey(user.id),now=Date.now(),old=EMAIL_2FA_CODES.get(key);if(old&&now-old.sentAt<60000)return sendJson(res,429,{error:'Un code vient déjà d’être envoyé. Attends une minute avant une nouvelle demande.'});
    const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),expiresAt=now+10*60*1000;
    EMAIL_2FA_CODES.set(key,{hash:hashEmail2faCode(user.id,code),expiresAt,sentAt:now,attempts:0,ip:clientIp(req)});
    try{
      const cfg={...mailCfg,to:user.email};
      await sendMailNotification(cfg,'Code de secours ProxPanel',`Code de connexion : ${code}\n\nCe code est valable 10 minutes et ne peut être utilisé qu’une seule fois.\nSi tu n’es pas à l’origine de cette demande, change immédiatement ton mot de passe ProxPanel.`,{type:'auth.2fa.email',severity:'warning',serverName:'ProxPanel',target:maskEmail(user.email),details:['Validité : 10 minutes','Usage unique','Ne communique jamais ce code à un tiers']});
      addAuditSystem('auth.email2fa.sent',username,{ip:clientIp(req),email:maskEmail(user.email)},'ok');
      return sendJson(res,200,{ok:true,emailMasked:maskEmail(user.email),expiresIn:600});
    }catch(e){EMAIL_2FA_CODES.delete(key);addAuditSystem('auth.email2fa.send.failed',username,{ip:clientIp(req),error:e.message},'error');return sendJson(res,502,{error:`Envoi du code impossible : ${e.message}`});}
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const session = getSession(req);
    if (session) {
      for (const key of [...PVE_USER_SESSIONS.keys()]) if (key.startsWith(`${session.nonce}:`)) PVE_USER_SESSIONS.delete(key);
    }
    if(session)addAuditSystem('auth.logout',session.username,{ip:clientIp(req)},'ok');
    clearSession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Authentification requise.' });
  if(!originAllowed(req))return sendJson(res,403,{error:'Origine de requête refusée.'});

  const currentPanelUser=panelUsers(config).find(u=>u.id===session.userId||u.username===session.username);
  if (url.pathname === '/api/me' && req.method === 'GET') return sendJson(res, 200, publicPanelUser(currentPanelUser||session));
  if (DEMO_MODE && !['GET','HEAD','OPTIONS'].includes(String(req.method||'GET').toUpperCase())) {
    return sendJson(res,403,{error:'Mode démo public : les modifications et actions sont désactivées.'});
  }


  // ----- ProxPanel users / RBAC / optional panel TOTP -----
  if(url.pathname==='/api/users'&&req.method==='GET'){
    if(!userHasPermission(currentPanelUser,'*')&&!userHasPermission(currentPanelUser,'admin.users'))return sendJson(res,403,{error:'Permission utilisateurs requise.'});
    return sendJson(res,200,panelUsers(config).map(publicPanelUser));
  }
  if(url.pathname==='/api/users'&&req.method==='POST'){
    if(!userHasPermission(currentPanelUser,'*')&&!userHasPermission(currentPanelUser,'admin.users'))return sendJson(res,403,{error:'Permission utilisateurs requise.'});
    const body=await readBody(req),username=String(body.username||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),role=['admin','operator','viewer','custom'].includes(body.role)?body.role:'viewer';
    if(!/^[A-Za-z0-9._-]{3,40}$/.test(username))return sendJson(res,400,{error:'Nom utilisateur invalide.'});
    if(!validAccountEmail(email))return sendJson(res,400,{error:'Une adresse e-mail valide est obligatoire pour chaque compte ProxPanel.'});
    if(password.length<12)return sendJson(res,400,{error:'Mot de passe : 12 caractères minimum.'});
    const rows=panelUsers(config);if(rows.some(u=>u.username.toLowerCase()===username.toLowerCase()))return sendJson(res,409,{error:'Cet utilisateur existe déjà.'});
    const pw=hashPassword(password),permissions=role==='custom'?(Array.isArray(body.permissions)?body.permissions.map(String):[]):defaultPermissionsForRole(role);
    const row={id:crypto.randomUUID(),username,displayName:String(body.displayName||username).slice(0,80),email,role,permissions,active:body.active!==false,salt:pw.salt,hash:pw.hash,createdAt:new Date().toISOString(),totpEnabled:false,totpSecretEnc:'',recoveryCodeHashes:[]};rows.push(row);savePanelUsers(rows);audit(req,'user.create',username,{role,permissions});return sendJson(res,201,publicPanelUser(row));
  }
  const userMatch=url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(totp-setup|totp-enable|totp-disable|recovery-regenerate))?$/);
  if(userMatch){
    const rows=panelUsers(config),idx=rows.findIndex(u=>u.id===userMatch[1]);if(idx<0)return sendJson(res,404,{error:'Utilisateur introuvable.'});const target=rows[idx],op=userMatch[2]||'';
    const userAdmin=userHasPermission(currentPanelUser,'*')||userHasPermission(currentPanelUser,'admin.users');
    const selfTotp=target.id===currentPanelUser?.id&&(/^(totp-|recovery-)/.test(op));
    if(!userAdmin&&!selfTotp)return sendJson(res,403,{error:'Permission utilisateurs requise.'});
    if(req.method==='PUT'&&!op){const body=await readBody(req);if(body.username&&String(body.username).toLowerCase()!==target.username.toLowerCase()&&rows.some(u=>u.username.toLowerCase()===String(body.username).toLowerCase()))return sendJson(res,409,{error:'Ce nom utilisateur existe déjà.'});if(body.username)target.username=String(body.username).trim();if(body.displayName!==undefined)target.displayName=String(body.displayName||target.username).slice(0,80);if(body.email!==undefined){const email=String(body.email||'').trim().toLowerCase();if(!validAccountEmail(email))return sendJson(res,400,{error:'Une adresse e-mail valide est obligatoire.'});target.email=email;}if(body.active!==undefined){if(target.id===currentPanelUser.id&&body.active===false)return sendJson(res,400,{error:'Tu ne peux pas désactiver ton propre compte.'});target.active=!!body.active;}if(body.role){target.role=['admin','operator','viewer','custom'].includes(body.role)?body.role:target.role;target.permissions=target.role==='custom'?(Array.isArray(body.permissions)?body.permissions.map(String):target.permissions):defaultPermissionsForRole(target.role);}if(body.password){if(String(body.password).length<12)return sendJson(res,400,{error:'Mot de passe : 12 caractères minimum.'});const pw=hashPassword(String(body.password));target.salt=pw.salt;target.hash=pw.hash;}rows[idx]=target;savePanelUsers(rows);audit(req,'user.update',target.username,{role:target.role,active:target.active});return sendJson(res,200,publicPanelUser(target));}
    if(req.method==='DELETE'&&!op){if(target.id===currentPanelUser.id)return sendJson(res,400,{error:'Tu ne peux pas supprimer ton propre compte.'});rows.splice(idx,1);savePanelUsers(rows);audit(req,'user.delete',target.username);return sendJson(res,200,{ok:true});}
    if(req.method==='POST'&&op==='totp-setup'){if(!validAccountEmail(target.email))return sendJson(res,400,{error:'Ajoute d’abord une adresse e-mail valide au compte. Elle sera utilisée comme méthode de secours 2FA.'});const secret=base32Encode(crypto.randomBytes(20));target.totpPendingEnc=encryptText(secret);rows[idx]=target;savePanelUsers(rows);const issuer=encodeURIComponent('ProxPanel'),label=encodeURIComponent(`ProxPanel:${target.username}`),otpauth=`otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,er=emailRecoveryState(target);return sendJson(res,200,{secret,otpauth,qrSvg:makeQrSvg(otpauth),emailMasked:er.emailMasked,emailRecoveryAvailable:er.available,mailConfigured:er.mailConfigured});}
    if(req.method==='POST'&&op==='totp-enable'){const body=await readBody(req);let secret='';try{secret=decryptText(target.totpPendingEnc||target.totpSecretEnc||'')}catch{}if(!secret||!verifyTotp(secret,body.code))return sendJson(res,400,{error:'Code TOTP invalide.'});const recoveryCodes=generateRecoveryCodes(10);target.totpSecretEnc=encryptText(secret);target.totpEnabled=true;target.recoveryCodeHashes=recoveryCodes.map(c=>hashRecoveryCode(target.id,c));delete target.totpPendingEnc;rows[idx]=target;savePanelUsers(rows);audit(req,'user.totp.enable',target.username,{recoveryCodes:recoveryCodes.length,emailRecovery:emailRecoveryState(target).available});return sendJson(res,200,{ok:true,recoveryCodes,emailMasked:maskEmail(target.email),emailRecoveryAvailable:emailRecoveryState(target).available});}
    if(req.method==='POST'&&op==='totp-disable'){target.totpEnabled=false;target.totpSecretEnc='';target.recoveryCodeHashes=[];EMAIL_2FA_CODES.delete(email2faKey(target.id));delete target.totpPendingEnc;rows[idx]=target;savePanelUsers(rows);audit(req,'user.totp.disable',target.username);return sendJson(res,200,{ok:true});}
    if(req.method==='POST'&&op==='recovery-regenerate'){if(target.id!==currentPanelUser?.id)return sendJson(res,403,{error:'Les codes de récupération ne peuvent être régénérés que par leur propriétaire.'});const body=await readBody(req);let secret='';try{secret=decryptText(target.totpSecretEnc||'')}catch{}if(!target.totpEnabled||!secret||!verifyTotp(secret,body.code))return sendJson(res,400,{error:'Code TOTP actuel requis.'});const recoveryCodes=generateRecoveryCodes(10);target.recoveryCodeHashes=recoveryCodes.map(c=>hashRecoveryCode(target.id,c));rows[idx]=target;savePanelUsers(rows);audit(req,'user.recovery.regenerate',target.username,{count:recoveryCodes.length});return sendJson(res,200,{ok:true,recoveryCodes});}
  }


  // Server-side role enforcement. UI hiding is convenience only; the API remains authoritative.
  const isAdmin=userHasPermission(currentPanelUser,'*')||userHasPermission(currentPanelUser,'admin.manage');
  const mutating=!['GET','HEAD','OPTIONS'].includes(req.method||'GET');
  if(mutating && (/^\/api\/(settings|servers(?:\/[^/]+)?(?:\/test)?|discord-channels|mail|update(?:\/|$)|integrations)/.test(url.pathname)) && !isAdmin) return sendJson(res,403,{error:'Permission administrateur requise.'});
  if(/^\/api\/audit/.test(url.pathname) && !userHasPermission(currentPanelUser,'audit.view') && !isAdmin) return sendJson(res,403,{error:'Permission audit requise.'});
  if(/\/console\/session$/.test(url.pathname) && mutating && !userHasPermission(currentPanelUser,'console.use') && !isAdmin) return sendJson(res,403,{error:'Permission console requise.'});
  if(mutating && (/\/(machines\/[^/]+\/\d+\/(action|snapshots|clone|migrate)|bulk-action|backups\/run|maintenance\/)/.test(url.pathname)||/^\/api\/docker\//.test(url.pathname)) && !userHasPermission(currentPanelUser,'machines.control') && !isAdmin) return sendJson(res,403,{error:'Permission opérateur requise.'});
  if(mutating && /^\/api\/pve-updates/.test(url.pathname) && !userHasPermission(currentPanelUser,'pve.updates') && !isAdmin) return sendJson(res,403,{error:'Permission mises à jour PVE requise.'});

  // ----- Dynamic settings / branding / alerts / dashboard -----
  if (url.pathname === '/api/settings' && req.method === 'GET') {
    const settings = getSettings();
    const safe = JSON.parse(JSON.stringify(settings));
    if (safe.alerts?.smtp) {
      safe.alerts.smtp.hasPassword = !!safe.alerts.smtp.passwordEnc;
      safe.alerts.smtp.hasClientSecret = !!safe.alerts.smtp.clientSecretEnc;
      delete safe.alerts.smtp.passwordEnc;
      delete safe.alerts.smtp.clientSecretEnc;
    }
    safe.alerts.hasTelegramToken = !!safe.alerts.telegramBotToken;
    if (safe.alerts.telegramBotToken) safe.alerts.telegramBotToken = '••••••••';
    safe.alerts.hasDiscordWebhook = !!safe.alerts.discordWebhook;
    if (safe.alerts.discordWebhook) safe.alerts.discordWebhook = '••••••••';
    safe.alerts.discordChannels = (settings.alerts?.discordChannels || []).map(redactDiscordChannel);
    safe.alerts.hasGenericWebhook = !!safe.alerts.genericWebhook;
    if (safe.alerts.genericWebhook) safe.alerts.genericWebhook = '••••••••';
    safe.updates = safe.updates || {};
    safe.updates.otaKeyPinned = !!(settings.updates?.otaPublicKeyPem && settings.updates?.otaPublicKeyFingerprint);
    safe.updates.otaPublicKeyFingerprint = settings.updates?.otaPublicKeyFingerprint || '';
    delete safe.updates.otaPublicKeyPem;
    safe.updates.otaInstanceId = getOtaInstanceId();
    return sendJson(res, 200, safe);
  }
  if (url.pathname === '/api/settings' && req.method === 'PUT') {
    const body = await readBody(req);
    const current = getSettings();
    const previousUpdateChannel=normalizeUpdateChannel(current.updates?.otaChannel);
    const next = deepMerge(current, body || {});
    // Keep secrets when UI sends blank/masked values.
    const incomingAlerts = body.alerts || {};
    if (!incomingAlerts.discordWebhook || incomingAlerts.discordWebhook === '••••••••') next.alerts.discordWebhook = current.alerts.discordWebhook || '';
    if (!incomingAlerts.genericWebhook || incomingAlerts.genericWebhook === '••••••••') next.alerts.genericWebhook = current.alerts.genericWebhook || '';
    if (!incomingAlerts.telegramBotToken || incomingAlerts.telegramBotToken === '••••••••') next.alerts.telegramBotToken = current.alerts.telegramBotToken || '';
    if (incomingAlerts.smtp) {
      const rawPassword = String(incomingAlerts.smtp.password || '');
      const rawClientSecret = String(incomingAlerts.smtp.clientSecret || '');
      next.alerts.smtp.passwordEnc = rawPassword ? encryptText(rawPassword) : (current.alerts?.smtp?.passwordEnc || '');
      next.alerts.smtp.clientSecretEnc = rawClientSecret ? encryptText(rawClientSecret) : (current.alerts?.smtp?.clientSecretEnc || '');
      delete next.alerts.smtp.password; delete next.alerts.smtp.clientSecret;
    }
    next.thresholds.cpuWarning = clampNumber(next.thresholds.cpuWarning, 1, 100, 85);
    next.thresholds.memoryWarning = clampNumber(next.thresholds.memoryWarning, 1, 100, 85);
    next.thresholds.storageWarning = clampNumber(next.thresholds.storageWarning, 1, 100, 85);
    next.thresholds.storageCritical = clampNumber(next.thresholds.storageCritical, next.thresholds.storageWarning, 100, 95);
    next.thresholds.backupMaxAgeHours = clampNumber(next.thresholds.backupMaxAgeHours, 1, 720, 36);
    next.alerts.pollMinutes = clampNumber(next.alerts.pollMinutes, 1, 60, 5);
    next.updates = next.updates || {};
    next.updates.checkIntervalHours = clampNumber(next.updates?.checkIntervalHours, 1, 168, 6);
    next.updates.autoInstallEnabled = next.updates.autoInstallEnabled === true;
    if (body.updates && body.updates.autoInstallWindows !== undefined) {
      if (!Array.isArray(body.updates.autoInstallWindows) || !body.updates.autoInstallWindows.length) return sendJson(res,400,{error:'Ajoute au moins un créneau pour les mises à jour automatiques.'});
      for (const row of body.updates.autoInstallWindows.slice(0,8)) {
        const start=String(row?.start||''),end=String(row?.end||'');
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return sendJson(res,400,{error:'Un créneau de mise à jour contient une heure invalide.'});
        if(start===end) return sendJson(res,400,{error:'L’heure de début et l’heure de fin d’un créneau doivent être différentes.'});
        if(!Array.isArray(row?.days)||!row.days.map(Number).some(d=>Number.isInteger(d)&&d>=0&&d<=6)) return sendJson(res,400,{error:'Sélectionne au moins un jour pour chaque créneau de mise à jour.'});
      }
      next.updates.autoInstallWindows = normalizeAutoInstallWindows(body.updates.autoInstallWindows);
    }
    next.updates.provider = next.updates.provider === 'legacy' ? 'legacy' : 'ota';
    next.updates.otaChannel = normalizeUpdateChannel(next.updates.otaChannel);
    if (String(next.updates.otaBaseUrl || '').trim()) {
      try { next.updates.otaBaseUrl = normalizeOtaBaseUrl(next.updates.otaBaseUrl); } catch (e) { return sendJson(res,400,{error:e.message}); }
    } else next.updates.otaBaseUrl = '';
    // La clé OTA est publique, mais elle ne doit jamais être écrasée par un formulaire qui ne la renvoie pas.
    if (!body.updates || body.updates.otaPublicKeyPem === undefined) next.updates.otaPublicKeyPem = current.updates?.otaPublicKeyPem || '';
    if (!body.updates || body.updates.otaPublicKeyFingerprint === undefined) next.updates.otaPublicKeyFingerprint = current.updates?.otaPublicKeyFingerprint || '';
    next.pveUpdates = next.pveUpdates || {};
    next.pveUpdates.checkIntervalHours = clampNumber(next.pveUpdates.checkIntervalHours, 1, 168, 6);
    next.dockerUpdates = next.dockerUpdates || {};
    next.dockerUpdates.checkIntervalHours = clampNumber(next.dockerUpdates.checkIntervalHours,1,168,12);
    next.dockerUpdates.autoCheckEnabled = next.dockerUpdates.autoCheckEnabled === true;
    next.dockerUpdates.notifyOnAvailable = next.dockerUpdates.notifyOnAvailable !== false;
    next.dockerUpdates.scheduledActionsEnabled = next.dockerUpdates.scheduledActionsEnabled === true;
    if(body.dockerUpdates?.maintenanceWindows!==undefined){
      if(!Array.isArray(body.dockerUpdates.maintenanceWindows)||!body.dockerUpdates.maintenanceWindows.length)return sendJson(res,400,{error:'Ajoute au moins un créneau de maintenance Docker.'});
      next.dockerUpdates.maintenanceWindows=body.dockerUpdates.maintenanceWindows.slice(0,8).map(normalizeDockerUpdateWindow);
      if(next.dockerUpdates.maintenanceWindows.some(w=>w.start===w.end))return sendJson(res,400,{error:'Un créneau Docker doit avoir des heures de début et de fin différentes.'});
    }
    next.ui = next.ui || {};
    next.ui.dashboardRefreshSeconds = clampNumber(next.ui.dashboardRefreshSeconds, 5, 300, 10);
    saveSettings(next);
    const savedUpdateChannel=normalizeUpdateChannel(next.updates?.otaChannel);
    const updateChannelChanged=body.updates?.otaChannel!==undefined && savedUpdateChannel!==previousUpdateChannel;
    if(updateChannelChanged){
      // Efface immédiatement une éventuelle proposition issue de l’ancien canal.
      const previousState=jsonRead(UPDATE_CHECK_STATE_FILE,{});
      jsonWrite(UPDATE_CHECK_STATE_FILE,{...previousState,currentVersion:APP_VERSION,provider:'ota',configured:!!next.updates?.otaBaseUrl,available:false,channel:savedUpdateChannel,lastCheckAt:null,error:null,channelChangedAt:new Date().toISOString()});
      OTA_LATEST_CACHE={at:0,key:'',data:null};
      // Le changement de canal ne doit jamais bloquer la sauvegarde des paramètres si le réseau OTA est indisponible.
      setImmediate(()=>{
        sendOtaHeartbeat().catch(error=>console.warn(`[OTA] Heartbeat après changement de canal impossible : ${String(error?.message||error)}`));
        const runFreshCheck=()=>checkRemoteUpdate({manual:false,notify:false}).catch(error=>console.warn(`[OTA] Contrôle après changement de canal impossible : ${String(error?.message||error)}`));
        if(UPDATE_CHECK_RUNNING)UPDATE_CHECK_RUNNING.finally(()=>setImmediate(runFreshCheck));else runFreshCheck();
      });
    }
    audit(req, 'settings.update', 'ProxPanel', { sections: Object.keys(body || {}), updateChannelChanged, updateChannel:savedUpdateChannel });
    return sendJson(res, 200, { ok: true, updateChannel:savedUpdateChannel, updateCheckTriggered:updateChannelChanged });
  }
  if (url.pathname === '/api/notifications/test' && req.method === 'POST') {
    try {
      await sendAlertChannels(getSettings(), 'Test ProxPanel', `Notification de test lancée par ${session.username}.`, { type:'system.test', severity:'info' });
      audit(req, 'notifications.test', 'alert-channels');
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 502, { error: e.message }); }
  }
  if (url.pathname === '/api/discord-channels' && req.method === 'GET') {
    return sendJson(res, 200, (getSettings().alerts?.discordChannels || []).map(redactDiscordChannel));
  }
  if (url.pathname === '/api/discord-channels' && req.method === 'POST') {
    const body=await readBody(req); const name=String(body.name||'').trim(); const webhook=String(body.webhook||'').trim();
    if(!name||!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(webhook)) return sendJson(res,400,{error:'Nom et webhook Discord valide requis.'});
    const settings=getSettings(); settings.alerts.discordChannels=settings.alerts.discordChannels||[];
    const row={id:crypto.randomUUID(),name,webhookEnc:encryptText(webhook),enabled:body.enabled!==false,events:normalizeDiscordEvents(body.events),createdAt:new Date().toISOString()};
    settings.alerts.discordChannels.push(row); saveSettings(settings); audit(req,'discord-channel.add',name,{events:row.events}); return sendJson(res,201,redactDiscordChannel(row));
  }
  const discordChannelMatch=url.pathname.match(/^\/api\/discord-channels\/([^/]+)(?:\/(test))?$/);
  if(discordChannelMatch){
    const settings=getSettings(); settings.alerts.discordChannels=settings.alerts.discordChannels||[]; const row=settings.alerts.discordChannels.find(x=>x.id===discordChannelMatch[1]);
    if(!row)return sendJson(res,404,{error:'Salon Discord introuvable.'});
    if(req.method==='DELETE'&&!discordChannelMatch[2]){settings.alerts.discordChannels=settings.alerts.discordChannels.filter(x=>x.id!==row.id);saveSettings(settings);audit(req,'discord-channel.delete',row.name);return sendJson(res,200,{ok:true});}
    if(req.method==='PUT'&&!discordChannelMatch[2]){const body=await readBody(req);if(body.name!==undefined)row.name=String(body.name||'').trim()||row.name;if(body.enabled!==undefined)row.enabled=!!body.enabled;if(body.events!==undefined)row.events=normalizeDiscordEvents(body.events);if(body.webhook&&body.webhook!=='••••••••'){const hook=String(body.webhook).trim();if(!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(hook))return sendJson(res,400,{error:'Webhook Discord invalide.'});row.webhookEnc=encryptText(hook);delete row.webhook;}saveSettings(settings);audit(req,'discord-channel.update',row.name,{events:row.events,enabled:row.enabled});return sendJson(res,200,redactDiscordChannel(row));}
    if(req.method==='POST'&&discordChannelMatch[2]==='test'){try{const hook=row.webhookEnc?decryptText(row.webhookEnc):String(row.webhook||'');if(!hook)throw new Error('Webhook absent.');await postWebhook(hook,{username:'ProxPanel BETA',allowed_mentions:{parse:[]},embeds:[{author:{name:'ProxPanel BETA · Supervision Proxmox'},title:'✅ Test de notification réussi',description:`> Le salon **${row.name}** est correctement configuré et peut recevoir les alertes ProxPanel.`,color:0x16d49a,fields:[{name:'📌 Statut',value:'**OPÉRATIONNEL**',inline:true},{name:'🔔 Canal',value:String(row.name||'Discord'),inline:true},{name:'🧪 Type',value:'Test manuel',inline:true}],timestamp:new Date().toISOString(),footer:{text:'ProxPanel BETA • Test Discord • Aucun incident'}}]});audit(req,'discord-channel.test',row.name);return sendJson(res,200,{ok:true});}catch(e){return sendJson(res,502,{error:e.message});}}
  }
  if (url.pathname === '/api/audit' && req.method === 'GET') return sendJson(res, 200, jsonRead(AUDIT_FILE, []).slice(0, 1000));
  if (url.pathname === '/api/dashboard-groups' && req.method === 'GET') return sendJson(res,200,jsonRead(DASHBOARD_GROUPS_FILE,[]).map(normalizeDashboardGroup));
  if (url.pathname === '/api/dashboard-groups/candidates' && req.method === 'GET') {
    const rows=[];
    for(const server of jsonRead(SERVERS_FILE,[])){
      try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});rows.push({serverId:server.id,serverName:server.name,nodes:[...new Set((resources||[]).filter(x=>x.type==='node'&&x.node).map(x=>x.node))],error:null});}
      catch(e){rows.push({serverId:server.id,serverName:server.name,nodes:[],error:e.message});}
    }
    return sendJson(res,200,rows);
  }
  if (url.pathname === '/api/dashboard-groups' && req.method === 'POST') {
    const body=await readBody(req),name=String(body.name||'').trim(); if(!name)return sendJson(res,400,{error:'Nom de la vue requis.'});
    const row=normalizeDashboardGroup({id:crypto.randomUUID(),name,members:body.members,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    if(!row.members.length)return sendJson(res,400,{error:'Ajoute au moins un serveur ou un nœud à la vue.'});
    const all=jsonRead(DASHBOARD_GROUPS_FILE,[]).map(normalizeDashboardGroup);all.push(row);jsonWrite(DASHBOARD_GROUPS_FILE,all);audit(req,'dashboard-group.add',row.name,{members:row.members});return sendJson(res,201,row);
  }
  const dashGroupMatch=url.pathname.match(/^\/api\/dashboard-groups\/([^/]+)$/);
  if(dashGroupMatch&&req.method==='PUT'){
    const all=jsonRead(DASHBOARD_GROUPS_FILE,[]).map(normalizeDashboardGroup),idx=all.findIndex(x=>x.id===dashGroupMatch[1]);if(idx<0)return sendJson(res,404,{error:'Vue introuvable.'});const body=await readBody(req);
    all[idx]=normalizeDashboardGroup({...all[idx],name:String(body.name||all[idx].name).trim(),members:Array.isArray(body.members)?body.members:all[idx].members,updatedAt:new Date().toISOString()});jsonWrite(DASHBOARD_GROUPS_FILE,all);audit(req,'dashboard-group.update',all[idx].name,{members:all[idx].members});return sendJson(res,200,all[idx]);
  }
  if(dashGroupMatch&&req.method==='DELETE'){
    const all=jsonRead(DASHBOARD_GROUPS_FILE,[]).map(normalizeDashboardGroup),row=all.find(x=>x.id===dashGroupMatch[1]);if(!row)return sendJson(res,404,{error:'Vue introuvable.'});jsonWrite(DASHBOARD_GROUPS_FILE,all.filter(x=>x.id!==row.id));audit(req,'dashboard-group.delete',row.name);return sendJson(res,200,{ok:true});
  }
  const dashGroupOverview=url.pathname.match(/^\/api\/dashboard-groups\/([^/]+)\/(dashboard|live)$/);
  if(dashGroupOverview&&req.method==='GET'){
    const group=jsonRead(DASHBOARD_GROUPS_FILE,[]).map(normalizeDashboardGroup).find(x=>x.id===dashGroupOverview[1]);if(!group)return sendJson(res,404,{error:'Vue introuvable.'});
    const liveOnly=dashGroupOverview[2]==='live',history=!liveOnly&&url.searchParams.get('history')!=='0',timeframe=normalizeTimeframe(url.searchParams.get('timeframe')||'day'),parts=[],errors=[];
    const groupResults=await Promise.all(group.members.map(async member=>{
      const server=findServer(member.serverId);
      if(!server)throw new Error(`Serveur ${member.serverId} introuvable`);
      try{
        const auth=await resolveProxmoxAuth(server,session);
        return liveOnly?await buildLiveDashboardPart(server,auth,{nodesFilter:member.nodes}):await buildDashboardPart(server,auth,{timeframe,nodesFilter:member.nodes,history});
      }catch(e){throw new Error(`${server.name}: ${e.message}`);}
    }).map(p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}))));
    for(const r of groupResults){if(r.ok)parts.push(r.value);else errors.push(String(r.error?.message||r.error));}
    if(!parts.length)return sendJson(res,502,{error:errors[0]||'Aucune donnée disponible pour cette vue.'});
    const merged=mergeDashboardParts(parts,group.name);
    if(liveOnly)return sendJson(res,200,{collectedAt:merged.collectedAt,metrics:merged.metrics,nodes:merged.nodes,machines:merged.machines,storages:merged.storages,groupErrors:errors});
    return sendJson(res,200,{...merged,dashboardTimeframe:timeframe,historyEnabled:history,group:{id:group.id,name:group.name,members:group.members},groupErrors:errors});
  }

  if (url.pathname === '/api/groups' && req.method === 'GET') return sendJson(res, 200, jsonRead(GROUPS_FILE, []));
  if (url.pathname === '/api/groups' && req.method === 'POST') {
    const body=await readBody(req); const name=String(body.name||'').trim(); if(!name)return sendJson(res,400,{error:'Nom du groupe requis.'});
    const row={id:crypto.randomUUID(),name,serverId:String(body.serverId||''),vmids:[...(new Set((body.vmids||[]).map(Number).filter(Number.isFinite)))],tags:(body.tags||[]).map(String),createdAt:new Date().toISOString()};
    const all=jsonRead(GROUPS_FILE,[]);all.push(row);jsonWrite(GROUPS_FILE,all);audit(req,'group.add',name,{vmids:row.vmids,tags:row.tags});return sendJson(res,201,row);
  }
  const groupDelete=url.pathname.match(/^\/api\/groups\/([^/]+)$/);
  if(groupDelete&&req.method==='DELETE'){const all=jsonRead(GROUPS_FILE,[]);const row=all.find(x=>x.id===groupDelete[1]);if(!row)return sendJson(res,404,{error:'Groupe introuvable.'});jsonWrite(GROUPS_FILE,all.filter(x=>x.id!==row.id));audit(req,'group.delete',row.name);return sendJson(res,200,{ok:true});}

  // ----- Automatic remote update checks -----
  if (url.pathname === '/api/update/ota/latest' && req.method === 'GET') {
    try { const result=await fetchOtaLatestSummary(getSettings().updates||{}, {force:url.searchParams.get('refresh')==='1'}); return sendJson(res,200,result); }
    catch(e){ return sendJson(res,502,{error:e.message}); }
  }
  if (url.pathname === '/api/update/remote-status' && req.method === 'GET') return sendJson(res, 200, remoteUpdatePublicState());
  if (url.pathname === '/api/update/check' && req.method === 'POST') {
    try { const result=await checkRemoteUpdate({manual:true,notify:true}); audit(req,'update.check',result.version||'remote',{available:!!result.available}); return sendJson(res,200,result); }
    catch(e){ audit(req,'update.check','remote',{error:e.message},'error'); return sendJson(res,502,{error:e.message}); }
  }
  if (url.pathname === '/api/update/ota/test' && req.method === 'POST') {
    try {
      const body=await readBody(req),current=getSettings().updates||{};
      const cfg={...current,otaBaseUrl:String(body.baseUrl||current.otaBaseUrl||OFFICIAL_OTA_BASE_URL).trim(),otaChannel:normalizeUpdateChannel(body.channel||current.otaChannel)};
      const result=await testOtaConnection(cfg);audit(req,'ota.test',result.baseUrl,{fingerprint:result.fingerprint,available:result.available});return sendJson(res,200,result);
    } catch(e){audit(req,'ota.test','server',{error:e.message},'error');return sendJson(res,502,{error:e.message});}
  }
  if (url.pathname === '/api/update/ota/trust' && req.method === 'POST') {
    try {
      const body=await readBody(req),settings=getSettings();
      settings.updates=settings.updates||{};settings.updates.provider='ota';
      settings.updates.otaBaseUrl=normalizeOtaBaseUrl(body.baseUrl||settings.updates.otaBaseUrl||OFFICIAL_OTA_BASE_URL);
      settings.updates.otaChannel=normalizeUpdateChannel(body.channel||settings.updates.otaChannel);
      const key=await fetchOtaPublicKey(settings.updates);settings.updates.otaPublicKeyPem=key.pem;settings.updates.otaPublicKeyFingerprint=key.fingerprint;saveSettings(settings);
      audit(req,'ota.key.pin',settings.updates.otaBaseUrl,{fingerprint:key.fingerprint});
      try{await checkRemoteUpdate({manual:true,notify:false})}catch{}
      return sendJson(res,200,{ok:true,fingerprint:key.fingerprint,baseUrl:settings.updates.otaBaseUrl,channel:settings.updates.otaChannel,instanceId:getOtaInstanceId()});
    }catch(e){audit(req,'ota.key.pin','server',{error:e.message},'error');return sendJson(res,502,{error:e.message});}
  }
  if (url.pathname === '/api/update/ota/install' && req.method === 'POST') {
    try{
      const installed=await installAvailableOtaUpdate({automatic:false});
      const result=installed.result,dl=installed.download,cfg=installed.cfg;
      audit(req,'update.ota.install',`v${result.manifest.version}`,{sha256:dl.sha256,verified:true,fingerprint:cfg.otaPublicKeyFingerprint,backup:result.backupDir});
      sendJson(res,202,{ok:true,installedVersion:result.manifest.version,verified:true,restarting:true,backup:result.backupDir});setTimeout(()=>process.exit(75),1200).unref();return;
    }catch(e){audit(req,'update.ota.install','ota',{error:e.message},'error');return sendJson(res,400,{error:e.message||'Mise à jour OTA impossible.'});}
  }
  if (url.pathname === '/api/mail/templates' && req.method === 'GET') {
    return sendJson(res,200,{templates:publicMailTemplateCatalog()});
  }
  if (url.pathname === '/api/mail/preview' && req.method === 'POST') {
    try { const body=await readBody(req); const sample=mailTestScenario(body.type,session.username); const content=buildProfessionalMail(sample.subject,sample.text,sample.event); return sendJson(res,200,{subject:professionalMailSubject(sample.subject,sample.event),html:content.html,plain:content.plain,type:sample.event.type}); }
    catch(e){ return sendJson(res,400,{error:e.message}); }
  }
  if (url.pathname === '/api/mail/test-template' && req.method === 'POST') {
    try {
      const settings=getSettings(); if (!settings.alerts?.smtp?.enabled) throw new Error('Active d’abord les notifications e-mail et enregistre la configuration.');
      const body=await readBody(req),sample=mailTestScenario(body.type,session.username),cfg={...settings.alerts.smtp};
      if(body.to!==undefined&&String(body.to||'').trim()){
        const list=smtpRecipients(body.to); if(!list.length||list.some(x=>!/^\S+@\S+\.\S+$/.test(x)))throw new Error('Adresse de test invalide.'); cfg.to=list.join('; ');
      }
      await sendMailNotification(cfg,sample.subject,sample.text,sample.event); audit(req,'mail.test-template',sample.event.type,{to:cfg.to}); return sendJson(res,200,{ok:true,type:sample.event.type,to:cfg.to});
    } catch(e){ audit(req,'mail.test-template','email',{error:e.message},'error'); return sendJson(res,502,{error:e.message}); }
  }
  if (url.pathname === '/api/mail/test' && req.method === 'POST') {
    try { const settings=getSettings(); if (!settings.alerts?.smtp?.enabled) throw new Error('Active d’abord les notifications e-mail et enregistre la configuration.'); const sample=mailTestScenario('system.test',session.username); await sendMailNotification(settings.alerts?.smtp,sample.subject,sample.text,sample.event); audit(req,'mail.test','email'); return sendJson(res,200,{ok:true}); }
    catch(e){ audit(req,'mail.test','email',{error:e.message},'error'); return sendJson(res,502,{error:e.message}); }
  }


  // ----- Proxmox node update monitoring -----
  if (url.pathname === '/api/pve-updates/status' && req.method === 'GET') return sendJson(res,200,pveUpdatePublicState());
  if (url.pathname === '/api/pve-updates/check' && req.method === 'POST') {
    try{const result=await checkPveUpdates({manual:true,notify:true});audit(req,'pve-updates.check','all',{count:result.totalUpdates});return sendJson(res,200,pveUpdatePublicState());}
    catch(e){audit(req,'pve-updates.check','all',{error:e.message},'error');return sendJson(res,502,{error:e.message});}
  }
  const pveChangelog=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes\/([^/]+)\/apt\/changelog$/);
  if(pveChangelog&&req.method==='GET'){
    const server=findServer(pveChangelog[1]),node=decodeURIComponent(pveChangelog[2]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{const auth=await resolveProxmoxAuth(server,session),name=url.searchParams.get('name')||'',version=url.searchParams.get('version')||'';if(!name)return sendJson(res,400,{error:'Nom de paquet requis.'});const out=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/changelog?name=${encodeURIComponent(name)}${version?`&version=${encodeURIComponent(version)}`:''}`,{auth});return sendJson(res,200,{name,version,changelog:String(out||'')});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  // ----- ZIP updater -----
  if (url.pathname === '/api/update/status' && req.method === 'GET') return sendJson(res, 200, getUpdateStatus());
  if (url.pathname === '/api/update/upload' && req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/zip') && !contentType.includes('application/octet-stream')) return sendJson(res, 415, { error: 'Envoie directement le fichier .zip (application/zip).' });
    const tempZip = path.join(UPDATE_UPLOAD_DIR, `upload-${Date.now()}-${crypto.randomUUID()}.zip`);
    try {
      const uploadInfo = await receiveRawZip(req, tempZip);
      const result = installUpdateZip(tempZip, uploadInfo);
      fs.rmSync(tempZip, { force: true });
      audit(req, 'update.install', `v${result.manifest.version}`, { sha256: uploadInfo.sha256, backup: result.backupDir });
      sendJson(res, 202, { ok: true, installedVersion: result.manifest.version, notes: result.manifest.notes || [], restarting: true, backup: result.backupDir });
      setTimeout(() => process.exit(75), 1200).unref();
      return;
    } catch (e) {
      try { fs.rmSync(tempZip, { force: true }); } catch {}
      audit(req, 'update.install', 'zip', { error: e.message }, 'error');
      return sendJson(res, 400, { error: e.message || 'Mise à jour impossible.' });
    }
  }
  if (url.pathname === '/api/update/rollback' && req.method === 'POST') {
    try {
      const result = rollbackUpdate();
      audit(req, 'update.rollback', result.targetVersion, { backup: result.backupDir });
      sendJson(res, 202, { ok: true, rollbackVersion: result.targetVersion, restarting: true, backup: result.backupDir });
      setTimeout(() => process.exit(75), 1200).unref();
      return;
    } catch (e) { return sendJson(res, 400, { error: e.message }); }
  }

  // ----- Proxmox servers and auth -----
  if (url.pathname === '/api/servers' && req.method === 'GET') return sendJson(res, 200, jsonRead(SERVERS_FILE, []).map(sanitizeServer));
  if (url.pathname === '/api/servers' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const serverUrl = String(body.url || '').trim().replace(/\/$/, '');
    const username = String(body.username || '').trim();
    const authMode = ['password','token','interactive'].includes(String(body.authMode)) ? String(body.authMode) : 'password';
    let parsed;
    try { parsed = new URL(serverUrl); } catch { return sendJson(res, 400, { error: 'URL Proxmox invalide.' }); }
    if (!name || !['http:','https:'].includes(parsed.protocol)) return sendJson(res, 400, { error: 'Nom et URL HTTP/HTTPS valides requis.' });
    if (authMode !== 'interactive' && !username) return sendJson(res, 400, { error: 'Utilisateur Proxmox requis.' });
    const item = {
      id: crypto.randomUUID(), name, url: serverUrl, username, authMode,
      allowSelfSigned: !!body.allowSelfSigned, certFingerprint: String(body.certFingerprint || '').replace(/:/g,'').toUpperCase(), createdAt: new Date().toISOString(), status: 'unknown',
      wol: body.wol && body.wol.mac ? { mac: String(body.wol.mac), broadcast: String(body.wol.broadcast || '255.255.255.255'), port: Number(body.wol.port || 9) } : null
    };
    if (authMode === 'password') {
      if (!body.password) return sendJson(res, 400, { error: 'Mot de passe requis pour le mode persistant.' });
      item.passwordEnc = encryptText(String(body.password));
    } else if (authMode === 'token') {
      if (!body.apiTokenId || !body.apiTokenSecret) return sendJson(res, 400, { error: 'Token ID et secret requis.' });
      item.apiTokenId = String(body.apiTokenId).trim(); item.apiTokenSecretEnc = encryptText(String(body.apiTokenSecret));
    }
    const servers = jsonRead(SERVERS_FILE, []); servers.push(item); jsonWrite(SERVERS_FILE, servers);
    audit(req, 'server.add', name, { url: serverUrl, authMode });
    return sendJson(res, 201, sanitizeServer(item));
  }

  const serverUpdateMatch = url.pathname.match(/^\/api\/servers\/([^/]+)$/);
  if (serverUpdateMatch && req.method === 'PUT') {
    const servers = jsonRead(SERVERS_FILE, []); const item = servers.find(s => s.id === serverUpdateMatch[1]);
    if (!item) return sendJson(res, 404, { error: 'Serveur introuvable.' });
    const body = await readBody(req);
    if (body.name !== undefined) item.name = String(body.name).trim() || item.name;
    if (body.url !== undefined) { try { const u = new URL(String(body.url)); if (!['http:','https:'].includes(u.protocol)) throw new Error(); item.url = String(body.url).replace(/\/$/,''); } catch { return sendJson(res,400,{error:'URL invalide.'}); } }
    if (body.username !== undefined) item.username = String(body.username).trim();
    if (body.allowSelfSigned !== undefined) item.allowSelfSigned = !!body.allowSelfSigned;
    if (body.certFingerprint !== undefined) item.certFingerprint = String(body.certFingerprint || '').replace(/:/g,'').toUpperCase();
    if (body.authMode && ['password','token','interactive'].includes(String(body.authMode))) item.authMode = String(body.authMode);
    if (body.password) { item.passwordEnc = encryptText(String(body.password)); delete item.apiTokenSecretEnc; delete item.apiTokenId; item.authMode='password'; }
    if (body.apiTokenSecret && body.apiTokenId) { item.apiTokenId=String(body.apiTokenId); item.apiTokenSecretEnc=encryptText(String(body.apiTokenSecret)); delete item.passwordEnc; item.authMode='token'; }
    if (item.authMode === 'interactive') { delete item.passwordEnc; delete item.apiTokenSecretEnc; delete item.apiTokenId; }
    if (body.wol) item.wol = body.wol.mac ? { mac:String(body.wol.mac),broadcast:String(body.wol.broadcast||'255.255.255.255'),port:Number(body.wol.port||9) } : null;
    jsonWrite(SERVERS_FILE, servers); audit(req,'server.update',item.name,{authMode:item.authMode}); return sendJson(res,200,sanitizeServer(item));
  }
  if (serverUpdateMatch && req.method === 'DELETE') {
    const servers = jsonRead(SERVERS_FILE, []); const found = servers.find(s => s.id === serverUpdateMatch[1]);
    if (!found) return sendJson(res, 404, { error: 'Serveur introuvable.' });
    jsonWrite(SERVERS_FILE, servers.filter(s => s.id !== found.id));
    PVE_USER_SESSIONS.delete(pveSessionKey(session, found.id));
    audit(req, 'server.delete', found.name);
    return sendJson(res, 200, { ok: true });
  }

  const pveLoginMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/pve-login$/);
  if (pveLoginMatch && req.method === 'POST') {
    const server = findServer(pveLoginMatch[1]); if (!server) return sendJson(res,404,{error:'Serveur introuvable.'});
    const body = await readBody(req); const username = String(body.username || server.username || '').trim();
    if (!username || !body.password) return sendJson(res,400,{error:'Utilisateur et mot de passe Proxmox requis.'});
    try {
      const auth = await proxmoxPasswordLogin(server, username, String(body.password), String(body.otp || ''));
      if (auth.needTfa) return sendJson(res, 200, { ok:false, needTfa:true });
      storePveUserSession(session, server.id, auth);
      audit(req,'pve.login',server.name,{username});
      return sendJson(res,200,{ok:true,username,expiresInMinutes:90});
    } catch(e) { audit(req,'pve.login',server.name,{username,error:e.message},'error'); return sendJson(res,401,{error:e.message}); }
  }
  const pveSessionMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/pve-session$/);
  if (pveSessionMatch && req.method === 'GET') {
    const server=findServer(pveSessionMatch[1]); if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    const direct=getPveUserSession(session,server.id);
    return sendJson(res,200,{connected:!!direct,username:direct?.username||'',backgroundAvailable:!!(server.passwordEnc||server.apiTokenSecretEnc)});
  }
  if (pveSessionMatch && req.method === 'DELETE') { PVE_USER_SESSIONS.delete(pveSessionKey(session,pveSessionMatch[1])); audit(req,'pve.logout',pveSessionMatch[1]); return sendJson(res,200,{ok:true}); }

  const testMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/test$/);
  if (testMatch && req.method === 'POST') {
    const server = findServer(testMatch[1]); if (!server) return sendJson(res, 404, { error: 'Serveur introuvable.' });
    try {
      const auth = await resolveProxmoxAuth(server, session);
      const version = await proxmoxApi(server, '/version', { auth });
      const major = Number(String(version?.version || version?.release || '0').split('.')[0] || 0);
      if (major && major < 7) return sendJson(res, 409, { error: `Proxmox VE ${version?.version || version?.release} détecté. ProxPanel v1 nécessite Proxmox VE 7.0 ou supérieur.` });
      const servers = jsonRead(SERVERS_FILE, []); const target = servers.find(s => s.id === server.id); if (target) { target.status='online';target.lastSeen=new Date().toISOString();target.lastError=null;target.pveVersion=version?.version||version?.release||'';jsonWrite(SERVERS_FILE,servers); }
      return sendJson(res, 200, { ok: true, version, certFingerprint: server.certFingerprint || '', certificatePinned: !!server.certFingerprint });
    } catch (e) { return sendJson(res, 502, { error: `Connexion Proxmox impossible : ${e.message}` }); }
  }

  const pingMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/ping$/);
  if (pingMatch && req.method === 'GET') {
    const server = findServer(pingMatch[1]);
    if (!server) return sendJson(res, 404, { error: 'Serveur introuvable.' });
    if (DEMO_MODE && server.demo) return sendJson(res,200,{ok:true,latencyMs:8,method:'demo',measuredAt:new Date().toISOString()});
    try {
      const latencyMs = await measureTcpLatency(server.url, 3000);
      return sendJson(res, 200, { ok: true, latencyMs, method: 'tcp-connect', measuredAt: new Date().toISOString() });
    } catch (e) {
      return sendJson(res, 502, { error: `Proxmox injoignable : ${e.message}` });
    }
  }

  // ----- Real dashboard + monitoring + backups + capacity -----
  const liveDashMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/live$/);
  if (liveDashMatch && req.method === 'GET') {
    const server=findServer(liveDashMatch[1]); if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try {
      const auth=await resolveProxmoxAuth(server,session); const resources=await proxmoxApi(server,'/cluster/resources',{auth});
      const live=calcDashboard(Array.isArray(resources)?resources:[],[],[],[]);
      // Keep the single-server live dashboard aligned with grouped views.
      // Storage calls are cached, so live refresh can retain QEMU Guest Agent state
      // without turning missing data into a fake zero.
      await enrichMissingGuestStorage(server,auth,live);
      await enrichNodeTemperatures(server,auth,live);
      return sendJson(res,200,{collectedAt:live.collectedAt,metrics:live.metrics,nodes:live.nodes,machines:live.machines,storages:live.storages});
    } catch(e){return sendJson(res,502,{error:e.message});}
  }
  const dashMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/dashboard$/);
  if (dashMatch && req.method === 'GET') {
    const server = findServer(dashMatch[1]); if (!server) return sendJson(res, 404, { error: 'Serveur introuvable.' });
    try {
      const auth = await resolveProxmoxAuth(server, session);
      const resources = await proxmoxApi(server, '/cluster/resources', { auth });
      const nodes = (Array.isArray(resources) ? resources : []).filter(r => r.type === 'node' && r.node);
      const storagesForHistory = (Array.isArray(resources) ? resources : []).filter(r => r.type === 'storage' && r.node && r.storage);
      const optional = async (p, fallback = []) => { try { return await proxmoxApi(server, p, { auth }); } catch { return fallback; } };
      const historyEnabled = url.searchParams.get('history') !== '0';
      const dashboardTimeframe = normalizeTimeframe(url.searchParams.get('timeframe') || 'day');
      const [tasks, backupJobs, rrdResults, storageRrdResults] = await Promise.all([
        optional('/cluster/tasks', []), optional('/cluster/backup', []),
        historyEnabled ? Promise.all(nodes.map(async n => ({ node: n.node, points: await optional(`/nodes/${encodeURIComponent(n.node)}/rrddata?timeframe=${dashboardTimeframe}&cf=AVERAGE`, []) }))) : Promise.resolve([]),
        historyEnabled ? Promise.all(storagesForHistory.slice(0,80).map(async st => ({ node:st.node, storage:st.storage, points:await optional(`/nodes/${encodeURIComponent(st.node)}/storage/${encodeURIComponent(st.storage)}/rrddata?timeframe=${dashboardTimeframe}&cf=AVERAGE`,[]) }))) : Promise.resolve([])
      ]);
      let dashboard = calcDashboard(Array.isArray(resources) ? resources : [], Array.isArray(tasks) ? tasks : [], Array.isArray(backupJobs) ? backupJobs : [], rrdResults);
      await enrichMissingGuestStorage(server,auth,dashboard);
      dashboard.history.storage = calcStorageRrdHistory(storageRrdResults);
      const inventory = await fetchBackupInventory(server, auth, dashboard);
      dashboard = enrichBackupState(dashboard, inventory);
      // The grouped dashboard already enriched temperatures through buildDashboardPart().
      // Do the same for the legacy single-server route so the node cards, temperature
      // widget, alerts and live refresh all receive the same temperature fields.
      await enrichNodeTemperatures(server,auth,dashboard);
      const settings = getSettings();
      dashboard.problems = computeProblems(dashboard, settings);
      dashboard.capacity = getCapacityForecast(server.id);
      recordMetrics(server.id, dashboard);
      const servers = jsonRead(SERVERS_FILE, []); const target=servers.find(s=>s.id===server.id); if(target){target.status='online';target.lastSeen=new Date().toISOString();target.lastError=null;jsonWrite(SERVERS_FILE,servers);}
      return sendJson(res, 200, { ...dashboard, dashboardTimeframe, historyEnabled, server: sanitizeServer({ ...server, status:'online',lastSeen:new Date().toISOString() }), interactiveUser: getPveUserSession(session,server.id)?.username || null });
    } catch (e) {
      const servers=jsonRead(SERVERS_FILE,[]);const target=servers.find(s=>s.id===server.id);if(target){target.status='error';target.lastError=String(e.message||e);jsonWrite(SERVERS_FILE,servers);}
      return sendJson(res,502,{error:e.message});
    }
  }

  const capacityMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/capacity$/);
  if (capacityMatch && req.method === 'GET') return sendJson(res,200,getCapacityForecast(capacityMatch[1]));

  // ----- Machine actions / bulk / console -----
  const actionMatch = url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/([^/]+)\/(\d+)\/action$/);
  if (actionMatch && req.method === 'POST') {
    const [, serverId, type, vmid] = actionMatch; if(!['qemu','lxc'].includes(type))return sendJson(res,400,{error:'Type invalide.'});
    const body=await readBody(req);const action=String(body.action||'');const server=findServer(serverId);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try { const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});const machine=(resources||[]).find(r=>String(r.vmid)===String(vmid)&&r.type===type);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const task=await executeMachineAction(server,auth,machine,action);audit(req,`machine.${action}`,`${machine.name||type+'-'+vmid} (${vmid})`,{node:machine.node,task});return sendJson(res,200,{ok:true,task}); }
    catch(e){audit(req,`machine.${action}`,`${type}/${vmid}`,{error:e.message},'error');return sendJson(res,502,{error:e.message});}
  }
  const bulkMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/bulk-action$/);
  if(bulkMatch&&req.method==='POST'){
    const server=findServer(bulkMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const action=String(body.action||'');
    try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});let machines=(resources||[]).filter(r=>r.type==='qemu'||r.type==='lxc');
      const ids=new Set((body.vmids||[]).map(Number));if(ids.size)machines=machines.filter(m=>ids.has(Number(m.vmid)));if(body.tag)machines=machines.filter(m=>String(m.tags||'').split(/[;,]/).map(x=>x.trim()).includes(String(body.tag)));
      if(!machines.length)return sendJson(res,400,{error:'Aucune machine correspondante.'});const results=[];for(const m of machines.slice(0,100)){try{results.push({vmid:m.vmid,ok:true,task:await executeMachineAction(server,auth,m,action)});}catch(e){results.push({vmid:m.vmid,ok:false,error:e.message});}}
      audit(req,`bulk.${action}`,server.name,{tag:body.tag||'',vmids:machines.map(m=>m.vmid),failed:results.filter(x=>!x.ok).length});return sendJson(res,200,{ok:results.every(x=>x.ok),results});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const consoleMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/console\/session$/);
  if(consoleMatch&&req.method==='POST'){
    const server=findServer(consoleMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);
    try{const auth=await resolveConsoleAuth(server,session);const out=await createConsoleSession(server,auth,session,body);audit(req,'console.open',`${body.type}:${body.vmid||body.node}`,{node:body.node,kind:out.kind,authMode:out.authMode});return sendJson(res,201,out);}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const consoleStatusMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/console\/status$/);
  if(consoleStatusMatch&&req.method==='GET'){
    const token=String(url.searchParams.get('token')||'');const item=CONSOLE_SESSIONS.get(token);const err=CONSOLE_ERRORS.get(token);
    if(item&&item.ownerNonce!==session.nonce)return sendJson(res,403,{error:'Session console invalide.'});
    return sendJson(res,200,{error:err?.message||'',stage:err?.stage||'',authMode:err?.authMode||item?.authMode||'',at:err?.at||null,diagnostics:consoleDiagnosticsSnapshot(token)});
  }


  // ----- v1 inventory, drill-down, snapshots, clone, migration, create, nodes, storage, firewall and tasks -----
  const detailMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/detail$/);
  if(detailMatch&&req.method==='GET'){
    const server=findServer(detailMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{
      const auth=await resolveProxmoxAuth(server,session);const nodeHint=String(url.searchParams.get('node')||'');const machine=await findMachineResource(server,auth,detailMatch[2],detailMatch[3],nodeHint);if(!machine)return sendJson(res,404,{error:'Machine introuvable sur ce serveur ou ce nœud.'});
      const base=machineBasePath(machine);const optional=async(p,f=null)=>{try{return await proxmoxApi(server,p,{auth})}catch{return f}};
      const [status,config,snapshots,ips,osinfo,hostname,storageInfo]=await Promise.all([
        optional(`${base}/status/current`,{}),optional(`${base}/config`,{}),optional(`${base}/snapshot`,[]),getGuestIps(server,auth,machine),
        machine.type==='qemu'?optional(`${base}/agent/get-osinfo`,null):null,
        machine.type==='qemu'?optional(`${base}/agent/get-host-name`,null):null,
        guestStorageInfo(server,auth,machine)
      ]);
      return sendJson(res,200,{serverId:server.id,serverName:server.name,machine:{vmid:machine.vmid,name:machine.name||`${machine.type}-${machine.vmid}`,type:machine.type,node:machine.node,status:machine.status,uptime:machine.uptime||0,cpu:Number(machine.cpu||0)*100,mem:machine.mem||0,maxmem:machine.maxmem||0,disk:storageInfo?.used??machine.disk??0,maxdisk:storageInfo?.total??machine.maxdisk??0,diskFree:storageInfo?.free??null,diskUsagePct:storageInfo?.usagePct??null,diskSource:storageInfo?.source||'unknown',diskUsedKnown:!!storageInfo?.usedKnown,guestAgentStorage:storageInfo?.guestAgentAvailable??null,storageState:storageInfo?.storageState||null,tags:machine.tags||''},status,config,snapshots:Array.isArray(snapshots)?snapshots:[],ips,guestAgent:{osinfo:osinfo?.result||osinfo||null,hostname:hostname?.result?.['host-name']||hostname?.['host-name']||null},storageInfo});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const rrdMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/rrd$/);
  if(rrdMatch&&req.method==='GET'){
    const server=findServer(rrdMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    const scope=String(url.searchParams.get('scope')||'node'),timeframe=normalizeTimeframe(url.searchParams.get('timeframe')),cf=normalizeCf(url.searchParams.get('cf'));
    try{
      const auth=await resolveProxmoxAuth(server,session);let apiPath='';
      if(scope==='node'){const node=String(url.searchParams.get('node')||'');if(!node)return sendJson(res,400,{error:'node requis.'});apiPath=`/nodes/${encodeURIComponent(node)}/rrddata?timeframe=${timeframe}&cf=${cf}`;}
      else if(scope==='machine'){const type=String(url.searchParams.get('type')||'');const vmid=safeInteger(url.searchParams.get('vmid'));const node=String(url.searchParams.get('node')||'');if(!['qemu','lxc'].includes(type)||!vmid||!node)return sendJson(res,400,{error:'node, type et vmid requis.'});apiPath=`/nodes/${encodeURIComponent(node)}/${type}/${vmid}/rrddata?timeframe=${timeframe}&cf=${cf}`;}
      else if(scope==='storage'){const node=String(url.searchParams.get('node')||''),storage=String(url.searchParams.get('storage')||'');if(!node||!storage)return sendJson(res,400,{error:'node et storage requis.'});apiPath=`/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/rrddata?timeframe=${timeframe}&cf=${cf}`;}
      else return sendJson(res,400,{error:'scope invalide.'});
      const rows=await proxmoxApi(server,apiPath,{auth});return sendJson(res,200,{scope,timeframe,cf,rows:Array.isArray(rows)?rows:[]});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const snapBase=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/snapshots$/);
  if(snapBase){
    const server=findServer(snapBase[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{
      const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,snapBase[2],snapBase[3]);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const base=`${machineBasePath(machine)}/snapshot`;
      if(req.method==='GET'){const rows=await proxmoxApi(server,base,{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}
      if(req.method==='POST'){const body=await readBody(req);const snapname=String(body.snapname||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(snapname))return sendJson(res,400,{error:'Nom de snapshot invalide.'});const payload={snapname,description:String(body.description||'')};if(machine.type==='qemu'&&body.vmstate)payload.vmstate=1;const task=await proxmoxApi(server,base,{method:'POST',auth,body:payload});audit(req,'snapshot.create',`${machine.name||machine.vmid}@${snapname}`,{task});return sendJson(res,202,{ok:true,task});}
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const snapAction=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/snapshots\/([^/]+)(?:\/(rollback))?$/);
  if(snapAction){
    const server=findServer(snapAction[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,snapAction[2],snapAction[3]);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const snap=decodeURIComponent(snapAction[4]);const path0=`${machineBasePath(machine)}/snapshot/${encodeURIComponent(snap)}`;
      if(req.method==='DELETE'&&!snapAction[5]){const task=await proxmoxApi(server,path0,{method:'DELETE',auth});audit(req,'snapshot.delete',`${machine.name||machine.vmid}@${snap}`,{task});return sendJson(res,202,{ok:true,task});}
      if(req.method==='POST'&&snapAction[5]==='rollback'){const task=await proxmoxApi(server,`${path0}/rollback`,{method:'POST',auth,body:{}});audit(req,'snapshot.rollback',`${machine.name||machine.vmid}@${snap}`,{task});return sendJson(res,202,{ok:true,task});}
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const immediateBackup=url.pathname.match(/^\/api\/servers\/([^/]+)\/backups\/run$/);
  if(immediateBackup&&req.method==='POST'){
    const server=findServer(immediateBackup[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const vmid=safeInteger(body.vmid);const node=String(body.node||''),storage=String(body.storage||'');if(!vmid||!node||!storage)return sendJson(res,400,{error:'vmid, node et storage requis.'});
    try{const auth=await resolveProxmoxAuth(server,session);const payload={vmid,storage,mode:['snapshot','suspend','stop'].includes(body.mode)?body.mode:'snapshot',compress:String(body.compress||'zstd')};if(body.notes)payload.notes=String(body.notes);const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/vzdump`,{method:'POST',auth,body:payload});audit(req,'backup.run',String(vmid),{node,storage,task});return sendJson(res,202,{ok:true,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const restoreBackup=url.pathname.match(/^\/api\/servers\/([^/]+)\/backups\/restore$/);
  if(restoreBackup&&req.method==='POST'){
    const server=findServer(restoreBackup[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);if(!body.volid||!body.node||!['qemu','lxc'].includes(body.type))return sendJson(res,400,{error:'volid, node et type requis.'});
    try{const auth=await resolveProxmoxAuth(server,session);const vmid=safeInteger(body.vmid)||await getNextVmid(server,auth);let task;if(body.type==='qemu')task=await proxmoxApi(server,`/nodes/${encodeURIComponent(body.node)}/qemu`,{method:'POST',auth,body:{vmid,archive:body.volid,unique:body.unique===false?0:1,start:body.start?1:0,storage:body.storage||undefined}});else task=await proxmoxApi(server,`/nodes/${encodeURIComponent(body.node)}/lxc`,{method:'POST',auth,body:{vmid,ostemplate:body.volid,restore:1,start:body.start?1:0,storage:body.storage||undefined}});audit(req,'backup.restore',String(body.volid),{vmid,node:body.node,task});return sendJson(res,202,{ok:true,vmid,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  const cloneMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/clone$/);
  if(cloneMatch&&req.method==='POST'){
    const server=findServer(cloneMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);
    try{const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,cloneMatch[2],cloneMatch[3]);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const newid=safeInteger(body.newid)||await getNextVmid(server,auth);const payload={newid,full:body.full===false||body.full===0?0:1};if(body.target)payload.target=String(body.target);if(body.storage)payload.storage=String(body.storage);if(machine.type==='qemu'&&body.name)payload.name=String(body.name);if(machine.type==='lxc'&&body.hostname)payload.hostname=String(body.hostname);if(body.description)payload.description=String(body.description);const task=await proxmoxApi(server,`${machineBasePath(machine)}/clone`,{method:'POST',auth,body:payload});audit(req,'machine.clone',`${machine.name||machine.vmid} → ${newid}`,{full:payload.full,target:payload.target,task});return sendJson(res,202,{ok:true,newid,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const migrateMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/migrate$/);
  if(migrateMatch&&req.method==='POST'){
    const server=findServer(migrateMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);if(!body.target)return sendJson(res,400,{error:'Nœud cible requis.'});
    try{const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,migrateMatch[2],migrateMatch[3]);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const payload={target:String(body.target)};if(machine.type==='qemu'){payload.online=body.online===false?0:1;if(body.withLocalDisks!==false)payload['with-local-disks']=1;}else payload.restart=body.restart===false?0:1;const task=await proxmoxApi(server,`${machineBasePath(machine)}/migrate`,{method:'POST',auth,body:payload});audit(req,'machine.migrate',`${machine.name||machine.vmid} → ${payload.target}`,{task});return sendJson(res,202,{ok:true,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  const createMachine=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)$/);
  if(createMachine&&req.method==='POST'){
    const server=findServer(createMachine[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const type=createMachine[2],body=await readBody(req);const node=String(body.node||'');if(!node)return sendJson(res,400,{error:'Nœud requis.'});
    try{const auth=await resolveProxmoxAuth(server,session);const vmid=safeInteger(body.vmid)||await getNextVmid(server,auth);let payload={vmid};
      if(type==='qemu'){
        payload={...payload,name:String(body.name||`vm-${vmid}`),cores:safeInteger(body.cores,1,512,2),sockets:safeInteger(body.sockets,1,8,1),memory:safeInteger(body.memory,128,1048576,2048),onboot:body.onboot?1:0,agent:body.agent===false?0:1,ostype:String(body.ostype||'l26'),scsihw:String(body.scsihw||'virtio-scsi-single')};
        if(body.storage&&body.diskGb)payload.scsi0=`${body.storage}:${safeInteger(body.diskGb,1,1048576,32)},iothread=1`;
        if(body.bridge){payload.net0=`virtio,bridge=${body.bridge}${body.vlan?`,tag=${safeInteger(body.vlan,1,4094)}`:''}`;}
        if(body.iso)payload.ide2=`${body.iso},media=cdrom`;if(body.bios)payload.bios=String(body.bios);if(body.machine)payload.machine=String(body.machine);
      } else {
        if(!body.ostemplate)return sendJson(res,400,{error:'Template LXC requis.'});payload={...payload,hostname:String(body.hostname||`ct-${vmid}`),cores:safeInteger(body.cores,1,512,2),memory:safeInteger(body.memory,64,1048576,1024),swap:safeInteger(body.swap,0,1048576,512),ostemplate:String(body.ostemplate),unprivileged:body.unprivileged===false?0:1,onboot:body.onboot?1:0};
        if(body.storage&&body.diskGb)payload.rootfs=`${body.storage}:${safeInteger(body.diskGb,1,1048576,8)}`;if(body.bridge)payload.net0=`name=eth0,bridge=${body.bridge},ip=${body.ip||'dhcp'}${body.vlan?`,tag=${safeInteger(body.vlan,1,4094)}`:''}`;if(body.password)payload.password=String(body.password);
      }
      const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/${type}`,{method:'POST',auth,body:payload});audit(req,'machine.create',`${type}/${vmid}`,{node,task});return sendJson(res,202,{ok:true,vmid,task});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const configMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/(qemu|lxc)\/(\d+)\/config$/);
  if(configMatch){
    const server=findServer(configMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,configMatch[2],configMatch[3]);if(!machine)return sendJson(res,404,{error:'Machine introuvable.'});const p=`${machineBasePath(machine)}/config`;
      if(req.method==='GET'){return sendJson(res,200,await proxmoxApi(server,p,{auth}));}
      if(req.method==='PUT'){const body=await readBody(req);const allow=['cores','sockets','memory','balloon','cpu','scsihw','bios','machine','onboot','agent','tags','description','name','hostname','net0','net1','net2','scsi0','scsi1','scsi2','virtio0','virtio1','sata0','sata1','ide0','ide2','boot','bootdisk','delete','revert'];const payload=cleanConfigBody(body,allow);if(!Object.keys(payload).length)return sendJson(res,400,{error:'Aucune modification autorisée.'});const task=await proxmoxApi(server,p,{method:'PUT',auth,body:payload});audit(req,'machine.config',`${machine.name||machine.vmid} (${machine.vmid})`,{changes:Object.keys(payload),task});return sendJson(res,200,{ok:true,task});}
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const spiceMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/machines\/qemu\/(\d+)\/spice$/);
  if(spiceMatch&&req.method==='POST'){
    const server=findServer(spiceMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const machine=await findMachineResource(server,auth,'qemu',spiceMatch[2]);if(!machine)return sendJson(res,404,{error:'VM introuvable.'});const data=await proxmoxApi(server,`${machineBasePath(machine)}/spiceproxy`,{method:'POST',auth,body:{proxy:server.url}});return sendJson(res,200,{data,vv:buildSpiceVv(data)});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  const nodesMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes$/);
  if(nodesMatch&&req.method==='GET'){
    const server=findServer(nodesMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const rows=await proxmoxApi(server,'/nodes',{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const nodeDetail=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes\/([^/]+)\/detail$/);
  if(nodeDetail&&req.method==='GET'){
    const server=findServer(nodeDetail[1]),node=decodeURIComponent(nodeDetail[2]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const opt=async(p,f=[])=>{try{return await proxmoxApi(server,p,{auth})}catch{return f}};const [status,services,updates,disks]=await Promise.all([opt(`/nodes/${encodeURIComponent(node)}/status`,{}),opt(`/nodes/${encodeURIComponent(node)}/services`,[]),opt(`/nodes/${encodeURIComponent(node)}/apt/update`,[]),opt(`/nodes/${encodeURIComponent(node)}/disks/list`,[])]);const tempDash={nodes:[{node}],metrics:{}};await enrichNodeTemperatures(server,auth,tempDash);return sendJson(res,200,{node,status,temperature:tempDash.nodes[0]||null,services:Array.isArray(services)?services:[],updates:Array.isArray(updates)?updates:[],disks:Array.isArray(disks)?disks:[]});}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const smartMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes\/([^/]+)\/smart$/);
  if(smartMatch&&req.method==='GET'){
    const server=findServer(smartMatch[1]),node=decodeURIComponent(smartMatch[2]),disk=String(url.searchParams.get('disk')||'');if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});if(!disk)return sendJson(res,400,{error:'disk requis.'});try{const auth=await resolveProxmoxAuth(server,session);const data=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/disks/smart?disk=${encodeURIComponent(disk)}`,{auth});return sendJson(res,200,data||{});}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const nodePower=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes\/([^/]+)\/power$/);
  if(nodePower&&req.method==='POST'){
    const server=findServer(nodePower[1]),node=decodeURIComponent(nodePower[2]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req),command=String(body.command||'');if(!['reboot','shutdown'].includes(command))return sendJson(res,400,{error:'Commande invalide.'});if(command==='shutdown'&&String(body.confirm||'')!==node)return sendJson(res,400,{error:'Pour arrêter le nœud, saisis exactement son nom.'});try{const auth=await resolveProxmoxAuth(server,session);const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/status`,{method:'POST',auth,body:{command}});audit(req,`node.${command}`,node,{task});return sendJson(res,202,{ok:true,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  const storageContent=url.pathname.match(/^\/api\/servers\/([^/]+)\/storage\/([^/]+)\/([^/]+)\/content$/);
  if(storageContent&&req.method==='GET'){
    const server=findServer(storageContent[1]),node=decodeURIComponent(storageContent[2]),storage=decodeURIComponent(storageContent[3]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const c=String(url.searchParams.get('content')||'');const rows=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content${c?`?content=${encodeURIComponent(c)}`:''}`,{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const storageDownload=url.pathname.match(/^\/api\/servers\/([^/]+)\/storage\/([^/]+)\/([^/]+)\/download-url$/);
  if(storageDownload&&req.method==='POST'){
    const server=findServer(storageDownload[1]),node=decodeURIComponent(storageDownload[2]),storage=decodeURIComponent(storageDownload[3]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);if(!body.url||!body.filename||!body.content)return sendJson(res,400,{error:'url, filename et content requis.'});try{const auth=await resolveProxmoxAuth(server,session);const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/download-url`,{method:'POST',auth,body:{url:String(body.url),filename:path.basename(String(body.filename)),content:String(body.content),checksum:body.checksum||undefined,'checksum-algorithm':body.checksumAlgorithm||undefined}});audit(req,'storage.download-url',`${node}/${storage}`,{url:body.url,filename:body.filename,task});return sendJson(res,202,{ok:true,task});}catch(e){return sendJson(res,502,{error:`Le téléchargement direct par URL n’est peut-être pas disponible sur cette version/storage : ${e.message}`});}
  }
  const storageUpload=url.pathname.match(/^\/api\/servers\/([^/]+)\/storage\/([^/]+)\/([^/]+)\/upload$/);
  if(storageUpload&&req.method==='POST'){
    const server=findServer(storageUpload[1]),node=decodeURIComponent(storageUpload[2]),storage=decodeURIComponent(storageUpload[3]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const filename=decodeURIComponent(String(req.headers['x-filename']||'')),content=String(req.headers['x-content-type']||'iso');if(!filename)return sendJson(res,400,{error:'Header X-Filename requis.'});const tmp=path.join(UPDATE_UPLOAD_DIR,`file-${Date.now()}-${crypto.randomUUID()}-${path.basename(filename)}`);try{await receiveRawFile(req,tmp);const auth=await resolveProxmoxAuth(server,session);const task=await proxmoxUploadFile(server,auth,node,storage,content,filename,tmp);audit(req,'storage.upload',`${node}/${storage}`,{filename,content,task});fs.rmSync(tmp,{force:true});return sendJson(res,202,{ok:true,task});}catch(e){try{fs.rmSync(tmp,{force:true})}catch{}return sendJson(res,502,{error:e.message});}
  }

  const applianceMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/nodes\/([^/]+)\/appliances$/);
  if(applianceMatch){
    const server=findServer(applianceMatch[1]),node=decodeURIComponent(applianceMatch[2]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);if(req.method==='GET'){const rows=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/aplinfo`,{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}if(req.method==='POST'){const body=await readBody(req);if(!body.template||!body.storage)return sendJson(res,400,{error:'template et storage requis.'});const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/aplinfo`,{method:'POST',auth,body:{template:String(body.template),storage:String(body.storage)}});audit(req,'appliance.download',String(body.template),{node,storage:body.storage,task});return sendJson(res,202,{ok:true,task});}}catch(e){return sendJson(res,502,{error:e.message});}
  }

  // Firewall routes are deliberately parsed separately. A single permissive regex can
  // confuse `cluster/rules/0` with a node name and leave edit/delete buttons broken.
  const fwCluster=url.pathname.match(/^\/api\/servers\/([^/]+)\/firewall\/cluster\/rules(?:\/(\d+))?$/);
  const fwNode=url.pathname.match(/^\/api\/servers\/([^/]+)\/firewall\/node\/([^/]+)\/rules(?:\/(\d+))?$/);
  const fwMachine=url.pathname.match(/^\/api\/servers\/([^/]+)\/firewall\/machine\/([^/]+)\/(qemu|lxc)\/(\d+)\/rules(?:\/(\d+))?$/);
  if(fwCluster||fwNode||fwMachine){
    const match=fwCluster||fwNode||fwMachine;
    const server=findServer(match[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    const scope=fwCluster?'cluster':fwNode?'node':'machine';
    const node=fwNode?decodeURIComponent(fwNode[2]):fwMachine?decodeURIComponent(fwMachine[2]):'';
    const type=fwMachine?fwMachine[3]:'';
    const vmid=fwMachine?fwMachine[4]:'';
    const pos=fwCluster?fwCluster[2]:fwNode?fwNode[3]:fwMachine[5];
    const base=scope==='cluster'?'/cluster/firewall/rules':scope==='node'?`/nodes/${encodeURIComponent(node)}/firewall/rules`:`/nodes/${encodeURIComponent(node)}/${type}/${vmid}/firewall/rules`;
    try{
      const auth=await resolveProxmoxAuth(server,session);
      if(req.method==='GET'&&pos===undefined){const rows=await proxmoxApi(server,base,{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}
      if(req.method==='POST'&&pos===undefined){const body=await readBody(req);const payload=cleanConfigBody(body,['type','action','source','dest','proto','dport','sport','iface','macro','comment','enable','log']);if(!payload.type||!payload.action)return sendJson(res,400,{error:'type et action requis.'});const out=await proxmoxApi(server,base,{method:'POST',auth,body:payload});audit(req,'firewall.add',scope,{node,type,vmid});return sendJson(res,201,{ok:true,result:out});}
      if(req.method==='PUT'&&pos!==undefined){const body=await readBody(req);const payload=cleanConfigBody(body,['type','action','source','dest','proto','dport','sport','iface','macro','comment','enable','log','moveto']);const out=await proxmoxApi(server,`${base}/${pos}`,{method:'PUT',auth,body:payload});audit(req,'firewall.update',`${scope}/${pos}`,{node,type,vmid});return sendJson(res,200,{ok:true,result:out});}
      if(req.method==='DELETE'&&pos!==undefined){const out=await proxmoxApi(server,`${base}/${pos}`,{method:'DELETE',auth});audit(req,'firewall.delete',`${scope}/${pos}`,{node,type,vmid});return sendJson(res,200,{ok:true,result:out});}
      return sendJson(res,405,{error:'Méthode firewall non prise en charge.'});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }

  const tasksMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/tasks$/);
  if(tasksMatch&&req.method==='GET'){
    const server=findServer(tasksMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const limit=safeInteger(url.searchParams.get('limit'),1,1000,250);const rows=await proxmoxApi(server,'/cluster/tasks',{auth});return sendJson(res,200,Array.isArray(rows)?rows.slice(0,limit):[]);}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const taskMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/tasks\/([^/]+)\/(status|log|stop)$/);
  if(taskMatch){
    const server=findServer(taskMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const upid=decodeURIComponent(taskMatch[2]),node=taskNodeFromUpid(upid);if(!node)return sendJson(res,400,{error:'UPID invalide.'});try{const auth=await resolveProxmoxAuth(server,session);if(taskMatch[3]==='status'&&req.method==='GET')return sendJson(res,200,await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/tasks/${taskIdEncode(upid)}/status`,{auth}));if(taskMatch[3]==='log'&&req.method==='GET'){const rows=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/tasks/${taskIdEncode(upid)}/log?start=0&limit=1000`,{auth});return sendJson(res,200,Array.isArray(rows)?rows:[]);}if(taskMatch[3]==='stop'&&req.method==='POST'){const out=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/tasks/${taskIdEncode(upid)}`,{method:'DELETE',auth});audit(req,'task.stop',upid,{node});return sendJson(res,200,{ok:true,result:out});}}catch(e){return sendJson(res,502,{error:e.message});}
  }

  // ----- Change Center (machine config preview/apply) -----
  if(url.pathname==='/api/changes'&&req.method==='GET')return sendJson(res,200,jsonRead(CHANGES_FILE,[]).slice(0,500));
  if(url.pathname==='/api/changes'&&req.method==='POST'){
    const body=await readBody(req);const server=findServer(body.serverId);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});if(!['qemu','lxc'].includes(body.type)||!Number(body.vmid))return sendJson(res,400,{error:'VM/LXC invalide.'});
    try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});const m=(resources||[]).find(x=>x.type===body.type&&Number(x.vmid)===Number(body.vmid));if(!m)return sendJson(res,404,{error:'Machine introuvable.'});const before=await proxmoxApi(server,`/nodes/${encodeURIComponent(m.node)}/${m.type}/${m.vmid}/config`,{auth});const changes={};for(const[k,v]of Object.entries(body.changes||{}))if(k&&!['digest','pending','current'].includes(k))changes[k]=v; if(!Object.keys(changes).length)return sendJson(res,400,{error:'Aucune modification.'});
      const row={id:crypto.randomUUID(),createdAt:new Date().toISOString(),createdBy:session.username,status:'pending',serverId:server.id,serverName:server.name,node:m.node,type:m.type,vmid:m.vmid,machineName:m.name||`${m.type}-${m.vmid}`,reason:String(body.reason||''),before:Object.fromEntries(Object.keys(changes).map(k=>[k,before?.[k]])),after:changes};const all=jsonRead(CHANGES_FILE,[]);all.unshift(row);jsonWrite(CHANGES_FILE,all.slice(0,1000));audit(req,'change.create',`${row.machineName} (${row.vmid})`,{changes});return sendJson(res,201,row);
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const changeApply=url.pathname.match(/^\/api\/changes\/([^/]+)\/(apply|cancel)$/);
  if(changeApply&&req.method==='POST'){
    const rows=jsonRead(CHANGES_FILE,[]);const row=rows.find(x=>x.id===changeApply[1]);if(!row)return sendJson(res,404,{error:'Changement introuvable.'});if(row.status!=='pending')return sendJson(res,409,{error:`Changement déjà ${row.status}.`});
    if(changeApply[2]==='cancel'){row.status='cancelled';row.finishedAt=new Date().toISOString();jsonWrite(CHANGES_FILE,rows);audit(req,'change.cancel',`${row.machineName} (${row.vmid})`);return sendJson(res,200,row);}
    const server=findServer(row.serverId);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});
    try{const auth=await resolveProxmoxAuth(server,session);const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(row.node)}/${row.type}/${row.vmid}/config`,{method:'PUT',auth,body:row.after});row.status='applied';row.appliedAt=new Date().toISOString();row.appliedBy=session.username;row.task=task||null;jsonWrite(CHANGES_FILE,rows);audit(req,'change.apply',`${row.machineName} (${row.vmid})`,{before:row.before,after:row.after});return sendJson(res,200,row);}catch(e){row.lastError=e.message;jsonWrite(CHANGES_FILE,rows);return sendJson(res,502,{error:e.message});}
  }

  // ----- Backups + restore test -----
  if(url.pathname==='/api/restore-tests'&&req.method==='GET')return sendJson(res,200,jsonRead(RESTORE_TESTS_FILE,[]).slice(0,500));
  const restoreMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/backups\/restore-test$/);
  if(restoreMatch&&req.method==='POST'){
    const server=findServer(restoreMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);if(!body.volid||!body.node||!['qemu','lxc'].includes(body.type))return sendJson(res,400,{error:'volid, nœud et type requis.'});
    try{const auth=await resolveProxmoxAuth(server,session);const nextId=Number(await proxmoxApi(server,'/cluster/nextid',{auth}));let task;if(body.type==='qemu')task=await proxmoxApi(server,`/nodes/${encodeURIComponent(body.node)}/qemu`,{method:'POST',auth,body:{vmid:nextId,archive:body.volid,unique:1,start:0}});else task=await proxmoxApi(server,`/nodes/${encodeURIComponent(body.node)}/lxc`,{method:'POST',auth,body:{vmid:nextId,ostemplate:body.volid,restore:1,start:0}});
      const row={id:crypto.randomUUID(),at:new Date().toISOString(),serverId:server.id,sourceVmid:Number(body.sourceVmid||0)||null,restoreVmid:nextId,type:body.type,node:body.node,volid:body.volid,status:'started',task,verified:false};const all=jsonRead(RESTORE_TESTS_FILE,[]);all.unshift(row);jsonWrite(RESTORE_TESTS_FILE,all.slice(0,500));audit(req,'backup.restore-test',`${body.volid}`,{restoreVmid:nextId,node:body.node,task});return sendJson(res,202,row);
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const restoreVerify=url.pathname.match(/^\/api\/restore-tests\/([^/]+)\/verify$/);
  if(restoreVerify&&req.method==='POST'){const rows=jsonRead(RESTORE_TESTS_FILE,[]);const row=rows.find(x=>x.id===restoreVerify[1]);if(!row)return sendJson(res,404,{error:'Test introuvable.'});row.verified=true;row.verifiedAt=new Date().toISOString();row.status='verified';jsonWrite(RESTORE_TESTS_FILE,rows);audit(req,'backup.restore-verified',String(row.restoreVmid),{volid:row.volid});return sendJson(res,200,row);}

  // ----- Guided maintenance -----
  const maintPlan=url.pathname.match(/^\/api\/servers\/([^/]+)\/maintenance\/plan$/);
  if(maintPlan&&req.method==='POST'){
    const server=findServer(maintPlan[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);
    try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});const dashboard=calcDashboard(resources,[],[],[]);return sendJson(res,200,buildMaintenancePlan(dashboard,String(body.node||'')));}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const maintMigrate=url.pathname.match(/^\/api\/servers\/([^/]+)\/maintenance\/migrate$/);
  if(maintMigrate&&req.method==='POST'){
    const server=findServer(maintMigrate[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const node=String(body.node||'');
    try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});const plan=buildMaintenancePlan(calcDashboard(resources,[],[],[]),node);if(!plan.canMigrate&&plan.machines.length)return sendJson(res,409,{error:'Aucun nœud cible disponible.'});const results=[];
      for(const m of plan.machines){try{const endpoint=`/nodes/${encodeURIComponent(node)}/${m.type}/${m.vmid}/migrate`;const task=await proxmoxApi(server,endpoint,{method:'POST',auth,body:m.type==='qemu'?{target:m.target,online:1}:{target:m.target,restart:1}});results.push({vmid:m.vmid,target:m.target,ok:true,task});}catch(e){results.push({vmid:m.vmid,target:m.target,ok:false,error:e.message});}}
      audit(req,'maintenance.migrate',node,{results});return sendJson(res,200,{ok:results.every(x=>x.ok),results});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const maintUpdates=url.pathname.match(/^\/api\/servers\/([^/]+)\/maintenance\/updates$/);
  if(maintUpdates&&req.method==='POST'){
    const server=findServer(maintUpdates[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const node=String(body.node||'');
    try{const auth=await resolveProxmoxAuth(server,session);let task=null;try{task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/update`,{method:'POST',auth});}catch{}const updates=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/apt/update`,{auth});audit(req,'maintenance.check-updates',node,{count:Array.isArray(updates)?updates.length:0});return sendJson(res,200,{ok:true,task,updates:Array.isArray(updates)?updates:[],note:'ProxPanel rafraîchit et liste les paquets. L’installation se fait dans le shell du nœud pour rester explicite et contrôlée.'});}catch(e){return sendJson(res,502,{error:e.message});}
  }
  const maintReboot=url.pathname.match(/^\/api\/servers\/([^/]+)\/maintenance\/reboot$/);
  if(maintReboot&&req.method==='POST'){
    const server=findServer(maintReboot[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const node=String(body.node||'');
    try{const auth=await resolveProxmoxAuth(server,session);const task=await proxmoxApi(server,`/nodes/${encodeURIComponent(node)}/status`,{method:'POST',auth,body:{command:'reboot'}});audit(req,'maintenance.reboot',node,{task});return sendJson(res,200,{ok:true,task});}catch(e){return sendJson(res,502,{error:e.message});}
  }

  // ----- Integrations + Docker / Portainer -----
  if(url.pathname==='/api/integrations'&&req.method==='GET')return sendJson(res,200,jsonRead(INTEGRATIONS_FILE,[]).map(redactIntegration));
  if(url.pathname==='/api/integrations'&&req.method==='POST'){
    const body=await readBody(req),type=String(body.type||'').toLowerCase();
    if(!['pbs','uptimekuma','portainer','npm','grafana'].includes(type))return sendJson(res,400,{error:'Type d’intégration invalide.'});
    let cleanUrl;try{cleanUrl=validateIntegrationUrl(body.url);}catch(e){return sendJson(res,400,{error:e.message});}
    if(type==='portainer'&&!String(body.apiKey||body.token||'').trim())return sendJson(res,400,{error:'Une API Key Portainer est requise.'});
    const row={
      id:crypto.randomUUID(),type,name:String(body.name||type).trim()||type,url:cleanUrl,
      username:String(body.username||''),statusPageSlug:String(body.statusPageSlug||''),
      allowSelfSigned:!!body.allowSelfSigned,enabled:body.enabled!==false,createdAt:new Date().toISOString(),
      lastStatus:'pending',lastTestAt:'',lastError:''
    };
    if(body.password)row.passwordEnc=encryptText(String(body.password));
    if(body.apiKey)row.apiKeyEnc=encryptText(String(body.apiKey));
    if(body.token)row.tokenEnc=encryptText(String(body.token));
    try{
      if(type==='portainer'){
        const test=await testIntegration(row);
        row.lastStatus='ok';row.lastTestAt=new Date().toISOString();row.lastError='';
        row.portainerVersion=String(test.version||'');row.portainerEdition=String(test.edition||'');
        row.environmentCount=Number(test.environmentCount||0);row.supportedDockerCount=Number(test.supportedDockerCount||0);
      }
    }catch(error){
      return sendJson(res,502,{error:`Connexion Portainer impossible : ${error.message}`});
    }
    const all=jsonRead(INTEGRATIONS_FILE,[]);all.push(row);jsonWrite(INTEGRATIONS_FILE,all);
    audit(req,'integration.add',row.name,{type,url:row.url,environmentCount:row.environmentCount||0});
    return sendJson(res,201,redactIntegration(row));
  }
  if(url.pathname==='/api/docker/dashboard'&&req.method==='GET'){
    try{return sendJson(res,200,await dockerDashboardData(url.searchParams.get('force')==='1'));}
    catch(e){return sendJson(res,502,{error:e.message});}
  }
  if(url.pathname==='/api/docker/history'&&req.method==='GET'){
    return sendJson(res,200,dockerHistoryData(url.searchParams.get('range')||'day',url.searchParams.get('scope')||'all'));
  }
  if(url.pathname==='/api/docker/topology-mappings'&&req.method==='GET'){
    return sendJson(res,200,{mappings:dockerTopologyMappings()});
  }
  if(url.pathname==='/api/docker/topology-mappings'&&req.method==='PUT'){
    const body=await readBody(req),portainerId=String(body.portainerId||''),endpointId=dockerEndpointId(body.endpointId),key=dockerTopologyKey(portainerId,endpointId);
    const rows=dockerTopologyMappings();
    if(body.mapping===null||body.clear===true)delete rows[key];
    else rows[key]=normalizeDockerTopologyMapping(body.mapping||{});
    jsonWrite(DOCKER_TOPOLOGY_FILE,rows);audit(req,'docker.topology.map',key,{mapping:rows[key]||null});
    return sendJson(res,200,{mappings:rows});
  }
  if(url.pathname==='/api/docker/alerts'&&req.method==='GET'){
    return sendJson(res,200,{alerts:activeDockerAlerts(),checkedAt:dockerMonitorState().checkedAt||''});
  }
  if(url.pathname==='/api/docker/overview'&&req.method==='GET'){
    if(DEMO_MODE)return sendJson(res,200,demoDockerOverview());
    const rows=jsonRead(INTEGRATIONS_FILE,[]).filter(x=>x.type==='portainer'&&x.enabled!==false);
    if(!rows.length)return sendJson(res,200,{configured:false,portainers:[],summary:{portainers:0,environments:0,reachable:0,supported:0,containers:0,running:0,stopped:0,unhealthy:0}});
    const force=url.searchParams.get('force')==='1';
    const portainers=await Promise.all(rows.map(async item=>{
      try{return {...await cachedPortainerOverview(item,force),status:'online',error:''};}
      catch(error){return {id:item.id,name:item.name||'Portainer',url:item.url,type:'portainer',status:'error',error:String(error?.message||error),version:item.portainerVersion||'',edition:item.portainerEdition||'',environmentCount:Number(item.environmentCount||0),reachableCount:0,supportedDockerCount:Number(item.supportedDockerCount||0),containers:{total:0,running:0,stopped:0,healthy:0,unhealthy:0,restarting:0,paused:0},environments:[]};}
    }));
    const summary=portainers.reduce((acc,p)=>{
      acc.portainers++;acc.environments+=Number(p.environmentCount||0);acc.reachable+=Number(p.reachableCount||0);acc.supported+=Number(p.supportedDockerCount||0);
      acc.containers+=Number(p.containers?.total||0);acc.running+=Number(p.containers?.running||0);acc.stopped+=Number(p.containers?.stopped||0);acc.unhealthy+=Number(p.containers?.unhealthy||0);
      return acc;
    },{portainers:0,environments:0,reachable:0,supported:0,containers:0,running:0,stopped:0,unhealthy:0});
    return sendJson(res,200,{configured:true,portainers,summary});
  }
  const dockerContainersMatch=url.pathname.match(/^\/api\/docker\/portainers\/([^/]+)\/environments\/(\d+)\/containers$/);
  if(dockerContainersMatch&&req.method==='GET'){
    const item=findPortainerIntegration(dockerContainersMatch[1]);if(!item)return sendJson(res,404,{error:'Portainer introuvable.'});
    try{
      const endpointId=dockerEndpointId(dockerContainersMatch[2]);
      if(DEMO_MODE){
        const containers=demoDockerContainers(endpointId),stacks=demoDockerStacks(endpointId);
        const stackByName=Object.fromEntries(stacks.map(s=>[s.name,s]));
        return sendJson(res,200,{endpointId,containers:containers.map(x=>({...x,stackInfo:x.stack?stackByName[x.stack]||null:null})),summary:summarizeDockerContainers(containers)});
      }
      const containers=await portainerContainerList(item,endpointId);
      const stacks=await portainerStackList(item,endpointId).catch(()=>[]);
      const stackByName=Object.fromEntries(stacks.map(s=>[s.name,s]));
      return sendJson(res,200,{endpointId,containers:containers.map(x=>({...x,stackInfo:x.stack?stackByName[x.stack]||null:null})),summary:summarizeDockerContainers(containers)});
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const dockerContainerMatch=url.pathname.match(/^\/api\/docker\/portainers\/([^/]+)\/environments\/(\d+)\/containers\/([^/]+)(?:\/(logs|action|exec))?$/);
  if(dockerContainerMatch){
    const item=findPortainerIntegration(dockerContainerMatch[1]);if(!item)return sendJson(res,404,{error:'Portainer introuvable.'});
    let endpointId,containerId;try{endpointId=dockerEndpointId(dockerContainerMatch[2]);containerId=dockerObjectId(decodeURIComponent(dockerContainerMatch[3]));}catch(e){return sendJson(res,400,{error:e.message});}
    const op=dockerContainerMatch[4]||'inspect';
    try{
      if(DEMO_MODE&&req.method==='GET'&&op==='inspect'){
        const details=demoDockerContainerDetails(endpointId,containerId);
        if(!details)return sendJson(res,404,{error:'Conteneur de démonstration introuvable.'});
        return sendJson(res,200,details);
      }
      if(DEMO_MODE&&req.method==='GET'&&op==='logs'){
        const tail=Math.max(20,Math.min(1000,Number(url.searchParams.get('tail')||250)));
        return sendJson(res,200,{logs:demoDockerLogs(endpointId,containerId,tail),tail});
      }
      if(req.method==='GET'&&op==='inspect'){
        const inspect=await portainerDockerJson(item,endpointId,`/containers/${encodeURIComponent(containerId)}/json`);
        const stats=String(inspect?.State?.Status||'').toLowerCase()==='running'?await dockerContainerStats(item,endpointId,containerId):null;
        return sendJson(res,200,{inspect:redactDockerInspect(inspect),stats});
      }
      if(req.method==='GET'&&op==='logs'){
        const tail=Math.max(20,Math.min(1000,Number(url.searchParams.get('tail')||250)));
        const r=await portainerDockerBuffer(item,endpointId,`/containers/${encodeURIComponent(containerId)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`);
        return sendJson(res,200,{logs:dockerStreamText(r.data),tail});
      }
      if(req.method==='POST'&&op==='action'){
        const body=await readBody(req),action=String(body.action||'').toLowerCase();
        const map={start:'start',stop:'stop?t=10',restart:'restart?t=10',pause:'pause',resume:'unpause'};
        if(!map[action])return sendJson(res,400,{error:'Action conteneur invalide.'});
        await portainerDockerJson(item,endpointId,`/containers/${encodeURIComponent(containerId)}/${map[action]}`,{method:'POST'});
        if(['stop','pause','restart'].includes(action))recordDockerManualIntent(item.id,endpointId,containerId,action);
        audit(req,`docker.container.${action}`,containerId,{portainer:item.name,endpointId});
        PORTAINER_OVERVIEW_CACHE.delete(String(item.id));
        return sendJson(res,200,{ok:true,action});
      }
      if(req.method==='POST'&&op==='exec'){
        const body=await readBody(req),command=String(body.command||'').trim();
        if(!command||command.length>4000)return sendJson(res,400,{error:'Commande requise (4000 caractères maximum).'});
        const created=await portainerDockerJson(item,endpointId,`/containers/${encodeURIComponent(containerId)}/exec`,{
          method:'POST',body:{AttachStdout:true,AttachStderr:true,Tty:false,Cmd:['/bin/sh','-lc',command]}
        });
        const execId=dockerObjectId(created?.Id||created?.id||'');
        const r=await portainerDockerBuffer(item,endpointId,`/exec/${encodeURIComponent(execId)}/start`,{
          method:'POST',body:JSON.stringify({Detach:false,Tty:false}),headers:{'Content-Type':'application/json'}
        });
        audit(req,'docker.container.exec',containerId,{portainer:item.name,endpointId,commandLength:command.length});
        return sendJson(res,200,{ok:true,output:dockerStreamText(r.data)});
      }
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const dockerStacksMatch=url.pathname.match(/^\/api\/docker\/portainers\/([^/]+)\/environments\/(\d+)\/stacks(?:\/(\d+)(?:\/(action))?)?$/);
  if(dockerStacksMatch){
    const item=findPortainerIntegration(dockerStacksMatch[1]);if(!item)return sendJson(res,404,{error:'Portainer introuvable.'});
    let endpointId;try{endpointId=dockerEndpointId(dockerStacksMatch[2]);}catch(e){return sendJson(res,400,{error:e.message});}
    const stackId=Number(dockerStacksMatch[3]||0),op=dockerStacksMatch[4]||'';
    try{
      if(DEMO_MODE&&req.method==='GET'&&!stackId){
        const stacks=demoDockerStacks(endpointId),containers=demoDockerContainers(endpointId);
        const counts={};for(const ct of containers)if(ct.stack)counts[ct.stack]=(counts[ct.stack]||0)+1;
        return sendJson(res,200,{endpointId,stacks:stacks.map(s=>({...s,containerCount:Number(counts[s.name]||0)}))});
      }
      if(DEMO_MODE&&req.method==='GET'&&stackId&&!op){
        const stack=demoDockerStacks(endpointId).find(s=>Number(s.id)===stackId);
        if(!stack)return sendJson(res,404,{error:'Stack de démonstration introuvable.'});
        return sendJson(res,200,{stack});
      }
      if(req.method==='GET'&&!stackId){
        const stacks=await portainerStackList(item,endpointId),containers=await portainerContainerList(item,endpointId).catch(()=>[]);
        const counts={};for(const ct of containers)if(ct.stack)counts[ct.stack]=(counts[ct.stack]||0)+1;
        return sendJson(res,200,{endpointId,stacks:stacks.map(s=>({...s,containerCount:Number(counts[s.name]||0)}))});
      }
      if(req.method==='GET'&&stackId&&!op){
        const rows=await integrationJson(item.url,'/api/stacks',{headers:portainerHeaders(item),rejectUnauthorized:!item.allowSelfSigned});
        const raw=(Array.isArray(rows)?rows:[]).find(x=>Number(x.Id||x.id)===stackId&&Number(x.EndpointId||x.EndpointID)===endpointId);
        if(!raw)return sendJson(res,404,{error:'Stack introuvable.'});
        return sendJson(res,200,{stack:normalizePortainerStack(raw)});
      }
      if(req.method==='POST'&&stackId&&op==='action'){
        const body=await readBody(req),action=String(body.action||'').toLowerCase();
        if(!['start','stop','redeploy'].includes(action))return sendJson(res,400,{error:'Action stack invalide.'});
        const baseHeaders=portainerHeaders(item),rejectUnauthorized=!item.allowSelfSigned;
        if(action==='start'||action==='stop'){
          await integrationJson(item.url,`/api/stacks/${stackId}/${action}?endpointId=${endpointId}`,{method:'POST',headers:baseHeaders,rejectUnauthorized});
        }else{
          const rows=await integrationJson(item.url,'/api/stacks',{headers:baseHeaders,rejectUnauthorized});
          const raw=(Array.isArray(rows)?rows:[]).find(x=>Number(x.Id||x.id)===stackId&&Number(x.EndpointId||x.EndpointID)===endpointId);
          if(!raw)throw new Error('Stack introuvable.');
          if(raw.GitConfig){
            await integrationJson(item.url,`/api/stacks/${stackId}/git/redeploy?endpointId=${endpointId}`,{method:'PUT',headers:baseHeaders,rejectUnauthorized,body:{PullImage:true,Prune:false}});
          }else{
            const file=await integrationJson(item.url,`/api/stacks/${stackId}/file`,{headers:baseHeaders,rejectUnauthorized});
            const stackFile=String(file?.StackFileContent||file?.stackFileContent||'');
            if(!stackFile)throw new Error('Contenu Compose indisponible pour le redeploy.');
            await integrationJson(item.url,`/api/stacks/${stackId}?endpointId=${endpointId}`,{
              method:'PUT',headers:baseHeaders,rejectUnauthorized,body:{StackFileContent:stackFile,Env:Array.isArray(raw.Env)?raw.Env:[],PullImage:true,Prune:false}
            });
          }
        }
        audit(req,`docker.stack.${action}`,String(stackId),{portainer:item.name,endpointId});
        PORTAINER_OVERVIEW_CACHE.delete(String(item.id));
        return sendJson(res,200,{ok:true,action});
      }
    }catch(e){return sendJson(res,502,{error:e.message});}
  }
  const integrationMatch=url.pathname.match(/^\/api\/integrations\/([^/]+)(?:\/(test))?$/);
  if(integrationMatch&&req.method==='DELETE'&&!integrationMatch[2]){
    const all=jsonRead(INTEGRATIONS_FILE,[]),row=all.find(x=>x.id===integrationMatch[1]);
    if(!row)return sendJson(res,404,{error:'Intégration introuvable.'});
    jsonWrite(INTEGRATIONS_FILE,all.filter(x=>x.id!==row.id));PORTAINER_OVERVIEW_CACHE.delete(String(row.id));
    audit(req,'integration.delete',row.name,{type:row.type});return sendJson(res,200,{ok:true});
  }
  if(integrationMatch&&req.method==='POST'&&integrationMatch[2]==='test'){
    const all=jsonRead(INTEGRATIONS_FILE,[]),row=all.find(x=>x.id===integrationMatch[1]);
    if(!row)return sendJson(res,404,{error:'Intégration introuvable.'});
    try{
      const result=await testIntegration(row);
      row.lastStatus='ok';row.lastTestAt=new Date().toISOString();row.lastError='';
      if(row.type==='portainer'){
        row.portainerVersion=String(result.version||'');row.portainerEdition=String(result.edition||'');
        row.environmentCount=Number(result.environmentCount||0);row.supportedDockerCount=Number(result.supportedDockerCount||0);
      }
      jsonWrite(INTEGRATIONS_FILE,all);audit(req,'integration.test',row.name,{...result,containers:undefined});
      return sendJson(res,200,result);
    }catch(e){
      row.lastStatus='error';row.lastTestAt=new Date().toISOString();row.lastError=String(e.message||e);jsonWrite(INTEGRATIONS_FILE,all);
      audit(req,'integration.test',row.name,{error:row.lastError},'error');return sendJson(res,502,{error:e.message});
    }
  }
  if(url.pathname==='/api/dependencies/manual'&&req.method==='GET')return sendJson(res,200,jsonRead(DEPENDENCIES_FILE,[]));
  if(url.pathname==='/api/dependencies/manual'&&req.method==='POST'){const body=await readBody(req);if(!body.from||!body.to)return sendJson(res,400,{error:'from et to requis.'});const row={id:crypto.randomUUID(),from:String(body.from),to:String(body.to),fromType:String(body.fromType||'service'),toType:String(body.toType||'machine'),label:String(body.label||'dépend de')};const all=jsonRead(DEPENDENCIES_FILE,[]);all.push(row);jsonWrite(DEPENDENCIES_FILE,all);audit(req,'dependency.add',`${row.from} → ${row.to}`);return sendJson(res,201,row);}
  const depDelete=url.pathname.match(/^\/api\/dependencies\/manual\/([^/]+)$/);if(depDelete&&req.method==='DELETE'){const all=jsonRead(DEPENDENCIES_FILE,[]);jsonWrite(DEPENDENCIES_FILE,all.filter(x=>x.id!==depDelete[1]));return sendJson(res,200,{ok:true});}
  const depGraph=url.pathname.match(/^\/api\/servers\/([^/]+)\/dependencies$/);if(depGraph&&req.method==='GET'){const server=findServer(depGraph[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const resources=await proxmoxApi(server,'/cluster/resources',{auth});const graph=await buildDependencyGraph(server,auth,calcDashboard(resources,[],[],[]));return sendJson(res,200,graph);}catch(e){return sendJson(res,502,{error:e.message});}}

  // ----- Automations -----
  if(url.pathname==='/api/automations'&&req.method==='GET')return sendJson(res,200,jsonRead(AUTOMATIONS_FILE,[]));
  if(url.pathname==='/api/automations'&&req.method==='POST'){
    const body=await readBody(req);const name=String(body.name||'').trim();const steps=Array.isArray(body.steps)?body.steps.slice(0,100):[];if(!name||!steps.length)return sendJson(res,400,{error:'Nom et étapes requis.'});
    for(const s of steps){if(!['wait','machine-action'].includes(s.type))return sendJson(res,400,{error:`Étape ${s.type} non prise en charge.`});}
    const scheduleTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.scheduleTime||''))?String(body.scheduleTime):'';const scheduleDays=Array.isArray(body.scheduleDays)?body.scheduleDays.map(Number).filter(x=>x>=0&&x<=6):[];
    const row={id:crypto.randomUUID(),name,description:String(body.description||''),steps,serverId:String(body.serverId||''),scheduleTime,scheduleDays,createdAt:new Date().toISOString(),enabled:body.enabled!==false,lastScheduledRunKey:''};const all=jsonRead(AUTOMATIONS_FILE,[]);all.push(row);jsonWrite(AUTOMATIONS_FILE,all);audit(req,'automation.add',name,{steps:steps.length,scheduleTime});return sendJson(res,201,row);
  }
  const autoMatch=url.pathname.match(/^\/api\/automations\/([^/]+)(?:\/(run))?$/);
  if(autoMatch&&req.method==='DELETE'&&!autoMatch[2]){const all=jsonRead(AUTOMATIONS_FILE,[]);jsonWrite(AUTOMATIONS_FILE,all.filter(x=>x.id!==autoMatch[1]));return sendJson(res,200,{ok:true});}
  if(autoMatch&&req.method==='POST'&&autoMatch[2]==='run'){const scenario=jsonRead(AUTOMATIONS_FILE,[]).find(x=>x.id===autoMatch[1]);if(!scenario)return sendJson(res,404,{error:'Scénario introuvable.'});const body=await readBody(req);const server=findServer(body.serverId);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});try{const auth=await resolveProxmoxAuth(server,session);const run=await runAutomation(server,auth,scenario,req);audit(req,'automation.start',scenario.name,{runId:run.id});return sendJson(res,202,run);}catch(e){return sendJson(res,502,{error:e.message});}}
  if(url.pathname==='/api/automation-runs'&&req.method==='GET')return sendJson(res,200,[...AUTOMATION_RUNS.values()].sort((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,100));

  // ----- Wake-on-LAN -----
  const wolMatch=url.pathname.match(/^\/api\/servers\/([^/]+)\/wol$/);if(wolMatch&&req.method==='POST'){const server=findServer(wolMatch[1]);if(!server)return sendJson(res,404,{error:'Serveur introuvable.'});const body=await readBody(req);const w=body.mac?body:server.wol;if(!w?.mac)return sendJson(res,400,{error:'Adresse MAC WOL non configurée.'});try{await sendWakeOnLan(w.mac,w.broadcast||'255.255.255.255',w.port||9);audit(req,'wol.send',server.name,{mac:w.mac});return sendJson(res,200,{ok:true});}catch(e){return sendJson(res,502,{error:e.message});}}

  return sendJson(res, 404, { error: 'API introuvable.' });
}

const BACKGROUND_POLL_STATE = new Map();
async function buildBackgroundDashboard(server, auth) {
  const resources = await proxmoxApi(server, '/cluster/resources', { auth });
  const optional = async (p, fallback=[]) => { try { return await proxmoxApi(server,p,{auth}); } catch { return fallback; } };
  const [tasks,jobs] = await Promise.all([optional('/cluster/tasks',[]),optional('/cluster/backup',[])]);
  let dashboard=calcDashboard(Array.isArray(resources)?resources:[],Array.isArray(tasks)?tasks:[],Array.isArray(jobs)?jobs:[],[]);
  try { dashboard=enrichBackupState(dashboard,await fetchBackupInventory(server,auth,dashboard)); } catch {}
  return dashboard;
}
async function runBackgroundAlerts() {
  const settings=getSettings(); if(settings.alerts?.enabled===false)return;
  const interval=Math.max(1,Number(settings.alerts?.pollMinutes||5))*60000,now=Date.now();
  try{await runDockerBackgroundAlerts(settings,now);}catch(e){addAuditSystem('alerts.docker.poll','Docker',{error:e.message},'error');}
  const alertState=jsonRead(ALERT_STATE_FILE,{}); let changed=false;
  for(const server of jsonRead(SERVERS_FILE,[])) {
    if(!(server.passwordEnc||server.apiTokenSecretEnc))continue;
    if(now-Number(BACKGROUND_POLL_STATE.get(server.id)||0)<interval)continue;
    BACKGROUND_POLL_STATE.set(server.id,now);
    try {
      const auth=await proxmoxLogin(server); const dashboard=await buildBackgroundDashboard(server,auth); const rawProblems=listAlertsForDashboard(dashboard,settings);
      const previousState=alertState[server.id]||{};
      const previousProblems=Array.isArray(previousState.problems)?previousState.problems:[];
      const missingConfirmations={...(previousState.backupMissingConfirmations||{})};
      const absentTargets=new Set(rawProblems.filter(p=>p.code==='backup-absent').map(p=>String(p.target||'')));
      for(const target of Object.keys(missingConfirmations))if(!absentTargets.has(target))delete missingConfirmations[target];
      for(const target of absentTargets)missingConfirmations[target]=Math.min(10,Number(missingConfirmations[target]||0)+1);
      const problems=rawProblems.filter(p=>p.code!=='backup-absent'||Number(missingConfirmations[String(p.target||'')]||0)>=2);
      const previousIds=new Set(Array.isArray(previousState.ids)?previousState.ids:previousProblems.map(p=>p.id));
      const fresh=problems.filter(p=>!previousIds.has(p.id)&&!['backup-task-warning','backup-task-failed'].includes(String(p.code||'')));
      for(const p of fresh){
        const type=problemEventType(p);
        const upids=(p.items||[]).map(i=>i.upid).filter(Boolean).slice(0,3);
        const excerpts=[];
        for(const upid of upids){const excerpt=await proxmoxTaskLogExcerpt(server,auth,upid,30);if(excerpt)excerpts.push(`UPID ${upid}\n${excerpt}`);}
        await sendAlertChannels(settings,`ProxPanel · ${p.title}`,p.detail,{
          type,severity:p.severity,serverName:server.name,target:p.target||'',recommendation:p.recommendation||'',
          details:[...(p.facts||[]).map(f=>`${f.label}: ${f.value}`),...(p.items||[]).map(i=>`${i.label}: ${i.meta||''}`)],
          source:'Proxmox API',upid:upids[0]||'',
          technicalDetails:[
            {label:'Code incident',value:p.code||type},
            {label:'Identifiant incident',value:p.id||''},
            p.route?{label:'Page ProxPanel',value:p.route}:null,
            upids.length>1?{label:'UPID supplémentaires',value:upids.slice(1).join('\n')}:null
          ].filter(Boolean),
          logExcerpt:excerpts.join('\n\n---\n\n')
        });
        addAuditSystem('alerts.sent',server.name,{type,problem:p.id});
      }
      // Recovery notifications for nodes that were offline and are now back.
      const currentIds=new Set(problems.map(p=>p.id));
      for(const old of previousProblems){
        if(old.code==='node-offline'&&!currentIds.has(old.id)){
          await sendAlertChannels(settings,'Nœud de nouveau en ligne',`${old.target||old.detail||'Le nœud'} répond de nouveau.`,{type:'node.recovered',severity:'info',serverName:server.name,target:old.target||''});
          addAuditSystem('alerts.recovery',server.name,{type:'node.recovered',target:old.target||''});
        }
      }
      // Granular completed backup notifications. First poll is used as a baseline to avoid replaying old tasks.
      const backupTasks=(dashboard.tasks||[]).filter(t=>String(t.type||'').toLowerCase()==='vzdump'&&Number(t.endtime||0)>0&&t.upid);
      const knownBackupIds=new Set(Array.isArray(previousState.backupTaskIds)?previousState.backupTaskIds:[]);
      if(previousState.checkedAt){
        for(const t of backupTasks.filter(t=>!knownBackupIds.has(t.upid)).sort((a,b)=>Number(a.endtime||0)-Number(b.endtime||0))){
          const outcome=classifyProxmoxTaskStatus(t.status);
          const target=t.id?`VM/LXC ${t.id}`:'Job de sauvegarde';
          const needsDiagnostics=outcome.kind==='warning'||outcome.kind==='failure';
          const logExcerpt=needsDiagnostics?await proxmoxTaskLogExcerpt(server,auth,t.upid,80):'';
          const logSummary=summarizeProxmoxTaskLog(logExcerpt);
          const start=Number(t.starttime||0),end=Number(t.endtime||0),duration=start&&end&&end>=start?end-start:0;
          const title=outcome.kind==='success'?'Sauvegarde terminée':outcome.kind==='warning'?'Sauvegarde terminée avec avertissement':'Sauvegarde échouée';
          const type=outcome.kind==='success'?'backup.success':outcome.kind==='warning'?'backup.warning':'backup.failed';
          const severity=outcome.kind==='success'?'info':outcome.kind==='warning'?'warning':'critical';
          const message=outcome.kind==='warning'
            ?`${target} sur ${t.node||server.name} est terminé avec ${outcome.warningCount||1} avertissement(s) · statut ${outcome.raw||'WARNINGS'}.`
            :`${target} sur ${t.node||server.name} · statut ${outcome.raw||'inconnu'}.`;
          const details=[
            `Nœud: ${t.node||server.name}`,
            `Type de tâche: ${t.type||'vzdump'}`,
            `ID / cible Proxmox: ${t.id||'job multi-machines / non fourni'}`,
            `Utilisateur: ${t.user||'inconnu'}`,
            `Statut Proxmox brut: ${outcome.raw||'inconnu'}`,
            outcome.kind==='warning'?`Nombre d’avertissements: ${outcome.warningCount||1}`:'',
            `Début: ${start?new Date(start*1000).toLocaleString('fr-FR'):'—'}`,
            `Fin: ${end?new Date(end*1000).toLocaleString('fr-FR'):'—'}`,
            `Durée: ${duration?Math.floor(duration/60)+'m '+(duration%60)+'s':'—'}`,
            logSummary.vmids.length?`Machines détectées dans le log: ${logSummary.vmids.join(', ')}`:''
          ].filter(Boolean);
          const technicalDetails=[
            {label:'Classification ProxPanel',value:outcome.kind},
            logSummary.warnings.length?{label:'Avertissements détectés',value:logSummary.warnings.join('\n')}:null,
            logSummary.errors.length?{label:'Erreurs détectées',value:logSummary.errors.join('\n')}:null
          ].filter(Boolean);
          await sendAlertChannels(settings,title,message,{type,severity,serverName:server.name,target,details,source:'Proxmox vzdump',upid:t.upid,technicalDetails,logExcerpt});
          addAuditSystem('alerts.backup',server.name,{type,upid:t.upid,status:t.status,id:t.id||'',classification:outcome.kind,warningCount:outcome.warningCount||0},outcome.kind==='failure'?'error':outcome.kind==='warning'?'warning':'ok');
        }
      }
      alertState[server.id]={
        ids:problems.map(p=>p.id),
        problems:problems.map(p=>({id:p.id,code:p.code,title:p.title,detail:p.detail,target:p.target,severity:p.severity})),
        backupTaskIds:backupTasks.slice(0,100).map(t=>t.upid),
        backupMissingConfirmations:missingConfirmations,
        backupInventoryStatus:dashboard.backup?.inventoryStatus||null,
        checkedAt:new Date().toISOString()
      }; changed=true;
    } catch(e){addAuditSystem('alerts.poll',server.name,{error:e.message},'error');}
  }
  if(changed)jsonWrite(ALERT_STATE_FILE,alertState);
}

async function runScheduledAutomations() {
  const settings=getSettings(),tz=settings.timezone||'UTC',now=new Date();
  let parts;try{parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}catch{parts={year:now.getFullYear(),month:String(now.getMonth()+1).padStart(2,'0'),day:String(now.getDate()).padStart(2,'0'),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()],hour:String(now.getHours()).padStart(2,'0'),minute:String(now.getMinutes()).padStart(2,'0')}}
  const time=`${parts.hour}:${parts.minute}`,day={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday]??0;
  const dateKey=`${parts.year}-${parts.month}-${parts.day} ${time}`;
  const rows=jsonRead(AUTOMATIONS_FILE,[]);let save=false;
  for(const scenario of rows){
    if(scenario.enabled===false||!scenario.scheduleTime||scenario.scheduleTime!==time||scenario.lastScheduledRunKey===dateKey)continue;
    if(Array.isArray(scenario.scheduleDays)&&scenario.scheduleDays.length&&!scenario.scheduleDays.includes(day))continue;
    const server=findServer(scenario.serverId);scenario.lastScheduledRunKey=dateKey;save=true;
    if(!server){addAuditSystem('automation.schedule',scenario.name,{error:'Serveur planifié introuvable'},'error');continue;}
    try{const auth=await proxmoxLogin(server);await runAutomation(server,auth,scenario);addAuditSystem('automation.schedule',scenario.name,{server:server.name,time});}catch(e){addAuditSystem('automation.schedule',scenario.name,{error:e.message},'error');}
  }
  if(save)jsonWrite(AUTOMATIONS_FILE,rows);
}

const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon' };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const candidate = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!candidate.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');
  fs.stat(candidate, (err, stat) => {
    if (err || !stat.isFile()) {
      const index = path.join(PUBLIC_DIR, 'index.html');
      return fs.readFile(index, (e, data) => e ? sendText(res, 404, 'Not found') : (res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}), res.end(data)));
    }
    const ext = path.extname(candidate).toLowerCase();
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const isVersionedStatic = url.searchParams.has('v') && ['.js','.css'].includes(ext);
    const criticalFresh = pathname === '/index.html' || pathname === '/sw.js' || pathname === '/manifest.webmanifest';
    const cacheControl = criticalFresh
      ? 'no-store, max-age=0'
      : isVersionedStatic
        ? 'public, max-age=31536000, immutable'
        : ['.html','.webmanifest','.json','.js','.css'].includes(ext)
          ? 'no-cache'
          : 'public, max-age=86400';
    if (String(req.headers['if-none-match'] || '') === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
      return res.end();
    }
    const headers = {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl,
      'ETag': etag
    };
    const compressible = ['.html','.js','.css','.svg','.json','.webmanifest'].includes(ext);
    if (compressible && /(?:^|[,\s])gzip(?:[,\s]|$)/i.test(String(req.headers['accept-encoding'] || ''))) {
      headers['Content-Encoding']='gzip'; headers['Vary']='Accept-Encoding';
      res.writeHead(200, headers);
      return fs.createReadStream(candidate).pipe(zlib.createGzip({level:5})).pipe(res);
    }
    headers['Content-Length']=stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(candidate).pipe(res);
  });
}

function setSecurityHeaders(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https'||req.socket?.encrypted)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(req,res);
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') return sendJson(res, 200, { status:'ok', product:'ProxPanel', version:APP_VERSION, channel:APP_CHANNEL });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: e.message || 'Erreur serveur' }); else res.end();
  }
});
server.on('upgrade', handleConsoleUpgrade);
server.listen(PORT, '0.0.0.0', () => console.log(`ProxPanel listening on :${PORT}`));
setTimeout(()=>runBackgroundAlerts().catch(()=>{}),8000).unref();
setInterval(()=>runBackgroundAlerts().catch(()=>{}),60000).unref();
setInterval(()=>runScheduledAutomations().catch(()=>{}),30000).unref();
setTimeout(()=>runAutomaticUpdateCheck().catch(()=>{}),12000).unref();
setInterval(()=>runAutomaticUpdateCheck().catch(()=>{}),300000).unref();
setTimeout(()=>runAutomaticUpdateInstall().catch(()=>{}),20000).unref();
setInterval(()=>runAutomaticUpdateInstall().catch(()=>{}),300000).unref();
setTimeout(()=>runAutomaticPveUpdateCheck().catch(()=>{}),15000).unref();
setInterval(()=>runAutomaticPveUpdateCheck().catch(()=>{}),300000).unref();
setTimeout(()=>sendOtaHeartbeat().catch(()=>{}),5000).unref();
setInterval(()=>sendOtaHeartbeat().catch(()=>{}),6*60*60*1000).unref();
