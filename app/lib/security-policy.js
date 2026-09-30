'use strict';
const net=require('net');
const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);
// 'docker.exec' (arbitrary shell in a container) is intentionally absent from every
// built-in role, including operator: grant it only via a 'custom' role permission list.
const ROLE_PERMISSIONS={
  admin:['*'],
  operator:['dashboard.view','machines.view','machines.control','console.use','backups.run','tasks.manage','pve.updates','audit.view','health.manage','changes.manage','pbs.control','automations.view','automations.manage','automations.run','dependencies.manage','groups.manage','wazuh.manage'],
  viewer:['dashboard.view','machines.view']
};
function requiredPermissionForMutation(pathname,method='GET'){
  const verb=String(method||'GET').toUpperCase();if(SAFE_METHODS.has(verb))return null;const p=String(pathname||'');
  if(/^\/api\/sessions\/[^/]+$/.test(p))return'admin.users';
  if(/^\/api\/health-center(?:\/|$)/.test(p))return'health.manage';
  if(/^\/api\/(?:dashboard-groups|groups)(?:\/|$)/.test(p))return'groups.manage';
  if(/^\/api\/pve-updates(?:\/|$)/.test(p))return'pve.updates';
  if(/^\/api\/changes(?:\/|$)/.test(p))return'changes.manage';
  if(/^\/api\/restore-tests\/[^/]+\/verify$/.test(p))return'backups.run';
  if(/^\/api\/pbs\/actions\/(verify|prune|sync|gc)$/.test(p))return'pbs.control';
  if(p==='/api/wazuh/panel-notifications/read')return'dashboard.view';
  if(p==='/api/wazuh/topology-mappings'||p==='/api/wazuh/test-notification')return'wazuh.manage';
  if(/^\/api\/docker\/portainers\/[^/]+\/environments\/\d+\/containers\/[^/]+\/exec$/.test(p))return'docker.exec';
  if(/^\/api\/docker(?:\/|$)/.test(p))return'machines.control';
  if(/^\/api\/dependencies\/manual(?:\/|$)/.test(p))return'dependencies.manage';
  if(p==='/api/automations/preview'||/^\/api\/automations\/[^/]+\/preview$/.test(p))return'automations.view';
  if(/^\/api\/automations\/[^/]+\/run$/.test(p))return'automations.run';
  if(p==='/api/automations'||/^\/api\/automations\/[^/]+$/.test(p))return'automations.manage';
  if(p==='/api/servers'||/^\/api\/servers\/[^/]+$/.test(p)||/^\/api\/servers\/[^/]+\/(?:test|wol|ssh-key\/generate)$/.test(p))return'admin.manage';
  if(/^\/api\/servers\/[^/]+\/(?:pve-login|pve-session)$/.test(p))return'machines.view';
  if(/^\/api\/servers\/[^/]+\/console\/session$/.test(p)||/^\/api\/servers\/[^/]+\/machines\/qemu\/\d+\/spice$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/ssh-shell\/session$/.test(p))return'console.use';
  if(/^\/api\/servers\/[^/]+\/backups\/(?:run|restore|restore-test)$/.test(p))return'backups.run';
  if(/^\/api\/servers\/[^/]+\/tasks\/[^/]+\/stop$/.test(p))return'tasks.manage';
  if(/^\/api\/servers\/[^/]+\/machines\/(?:qemu|lxc)(?:\/\d+)?(?:\/(?:action|snapshots(?:\/[^/]+(?:\/rollback)?)?|clone|migrate|config))?$/.test(p)||/^\/api\/servers\/[^/]+\/bulk-action$/.test(p)||/^\/api\/servers\/[^/]+\/maintenance\/(?:plan|migrate|updates|reboot)$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/power$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/fans$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/sensors-detect$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/load-driver$/.test(p)||/^\/api\/servers\/[^/]+\/storage\/[^/]+\/[^/]+\/(?:download-url|upload)$/.test(p)||/^\/api\/servers\/[^/]+\/nodes\/[^/]+\/appliances$/.test(p)||/^\/api\/servers\/[^/]+\/firewall\/(?:cluster|node|machine)\//.test(p))return'machines.control';
  if(p==='/api/settings'||p==='/api/notifications/test'||/^\/api\/discord-channels(?:\/|$)/.test(p)||/^\/api\/mail(?:\/|$)/.test(p)||/^\/api\/update(?:\/|$)/.test(p)||/^\/api\/integrations(?:\/|$)/.test(p))return'admin.manage';
  return'admin.manage';
}
function automationStepPermissions(steps=[]){const r=new Set(),walk=rows=>{for(const s of Array.isArray(rows)?rows:[]){if(s?.type==='machine-action'||s?.type==='docker-action')r.add('machines.control');else if(s?.type==='backup')r.add('backups.run');else if(s?.type==='condition'){walk(s.then);walk(s.else);}}};walk(steps);return[...r];}
function normalizeIp(v){let ip=String(v||'').trim();if(ip.startsWith('[')&&ip.endsWith(']'))ip=ip.slice(1,-1);const z=ip.indexOf('%');if(z>=0)ip=ip.slice(0,z);if(ip.toLowerCase().startsWith('::ffff:'))ip=ip.slice(7);return net.isIP(ip)?ip:'';}
function ipv4ToInt(ip){const p=String(ip||'').split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return null;return(((p[0]<<24)>>>0)+(p[1]<<16)+(p[2]<<8)+p[3])>>>0;}
function ipv4InCidr(ip,c){const[base,bitsRaw]=String(c||'').split('/'),bits=Number(bitsRaw),a=ipv4ToInt(ip),b=ipv4ToInt(base);if(a===null||b===null||!Number.isInteger(bits)||bits<0||bits>32)return false;const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return(a&mask)===(b&mask);}
function trustedProxySpecs(raw=process.env.PROXPANEL_TRUSTED_PROXIES||''){return[...new Set(['127.0.0.1','::1',...String(raw||'').split(',')].map(x=>x.trim()).filter(Boolean))];}
function isTrustedProxyAddress(address,rawSpecs){const ip=normalizeIp(address);if(!ip)return false;const specs=Array.isArray(rawSpecs)?rawSpecs:trustedProxySpecs(rawSpecs);return specs.some(spec=>{const s=String(spec||'').trim();if(!s)return false;if(s.includes('/'))return net.isIP(ip)===4&&ipv4InCidr(ip,s);return normalizeIp(s)===ip;});}
function directRemoteIp(req){return normalizeIp(req?.socket?.remoteAddress||'');}
function isTrustedProxyRequest(req,rawSpecs){return isTrustedProxyAddress(directRemoteIp(req),rawSpecs===undefined?trustedProxySpecs():rawSpecs);}
function firstForwarded(req,name,rawSpecs){if(!isTrustedProxyRequest(req,rawSpecs))return'';return String(req?.headers?.[name]||'').split(',')[0].trim();}
function effectiveClientIp(req,rawSpecs){
  const direct=directRemoteIp(req);if(!isTrustedProxyRequest(req,rawSpecs))return direct;
  const specs=rawSpecs===undefined?trustedProxySpecs():rawSpecs;
  const chain=String(req?.headers?.['x-forwarded-for']||'').split(',').map(normalizeIp).filter(Boolean);
  let current=direct;
  for(let i=chain.length-1;i>=0;i--){if(!isTrustedProxyAddress(current,specs))break;current=chain[i];}
  return current||direct;
}
function effectiveRequestHttps(req,rawSpecs){return!!req?.socket?.encrypted||firstForwarded(req,'x-forwarded-proto',rawSpecs).toLowerCase()==='https';}
function effectiveRequestHost(req,rawSpecs){return firstForwarded(req,'x-forwarded-host',rawSpecs)||String(req?.headers?.host||'').split(',')[0].trim();}
// Only blocks loopback, link-local (incl. 169.254.169.254 cloud metadata) and 0.0.0.0 — NOT
// RFC1918 private ranges (10/8, 172.16/12, 192.168/16), because ProxPanel's whole purpose is
// reaching Portainer/PBS/Wazuh on the user's own LAN, which is almost always a private IP.
// This stops an integration URL from reaching the ProxPanel host itself or a cloud metadata
// endpoint, without breaking the normal HomeLab deployment this product is built for.
function isBlockedSsrfIp(ip){
  const kind=net.isIP(ip);
  if(kind===4){
    const p=ip.split('.').map(Number);
    return p[0]===127||p[0]===0||(p[0]===169&&p[1]===254);
  }
  if(kind===6){
    const low=ip.toLowerCase();
    if(low==='::1'||low==='::')return true;
    if(low.startsWith('::ffff:'))return isBlockedSsrfIp(low.slice(7));
    return low.startsWith('fe80:');
  }
  return false;
}
module.exports={ROLE_PERMISSIONS,requiredPermissionForMutation,automationStepPermissions,normalizeIp,trustedProxySpecs,isTrustedProxyAddress,isTrustedProxyRequest,effectiveClientIp,effectiveRequestHttps,effectiveRequestHost,isBlockedSsrfIp};
