'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ROLE_PERMISSIONS,requiredPermissionForMutation,automationStepPermissions,effectiveClientIp,effectiveRequestHttps,effectiveRequestHost,isBlockedSsrfIp}=require('../app/lib/security-policy');
const allowed=(role,path,method)=>{const r=requiredPermissionForMutation(path,method),p=ROLE_PERMISSIONS[role]||[];return !r||p.includes('*')||p.includes(r)};
const req=(remoteAddress,headers={},encrypted=false)=>({socket:{remoteAddress,encrypted},headers});
test('viewer denied critical mutations',()=>{for(const [p,m] of [['/api/changes','POST'],['/api/changes/id/apply','POST'],['/api/pbs/actions/prune','POST'],['/api/pbs/actions/gc','POST'],['/api/automations','POST'],['/api/automations/id/run','POST'],['/api/dependencies/manual','POST']])assert.equal(allowed('viewer',p,m),false,p);});
test('operator keeps operational access without server admin',()=>{for(const p of ['/api/servers/s1/machines/qemu/100/action','/api/servers/s1/console/session','/api/servers/s1/backups/run','/api/servers/s1/maintenance/reboot','/api/changes/id/apply','/api/pbs/actions/prune'])assert.equal(allowed('operator',p,'POST'),true,p);assert.equal(allowed('operator','/api/servers/s1','PUT'),false);assert.equal(allowed('operator','/api/servers/s1/wol','POST'),false);});
test('unknown mutations fail closed',()=>{assert.equal(requiredPermissionForMutation('/api/future-dangerous','POST'),'admin.manage');assert.equal(allowed('operator','/api/future-dangerous','POST'),false);assert.equal(allowed('admin','/api/future-dangerous','POST'),true);});
test('automation nested permissions',()=>assert.deepEqual(automationStepPermissions([{type:'machine-action'},{type:'condition',then:[{type:'backup'}],else:[{type:'docker-action'}]}]).sort(),['backups.run','machines.control']));
test('untrusted forwarded headers ignored',()=>{const r=req('203.0.113.10',{'x-forwarded-for':'198.51.100.7','x-forwarded-proto':'https','x-forwarded-host':'evil','host':'panel.local'});assert.equal(effectiveClientIp(r,''),'203.0.113.10');assert.equal(effectiveRequestHttps(r,''),false);assert.equal(effectiveRequestHost(r,''),'panel.local');});
test('trusted forwarded headers accepted',()=>{const r=req('172.18.0.12',{'x-forwarded-for':'198.51.100.8','x-forwarded-proto':'https','x-forwarded-host':'panel.example'});assert.equal(effectiveClientIp(r,'172.18.0.0/16'),'198.51.100.8');assert.equal(effectiveRequestHttps(r,'172.18.0.0/16'),true);assert.equal(effectiveRequestHost(r,'172.18.0.0/16'),'panel.example');});
test('trusted proxy chain ignores a spoofed left-most XFF value',()=>{const r=req('172.18.0.12',{'x-forwarded-for':'203.0.113.99, 198.51.100.8'});assert.equal(effectiveClientIp(r,'172.18.0.0/16'),'198.51.100.8');});
test('docker exec requires a dedicated permission, not granted to operator by default',()=>{
  assert.equal(requiredPermissionForMutation('/api/docker/portainers/p1/environments/2/containers/abc123/exec','POST'),'docker.exec');
  assert.equal(allowed('operator','/api/docker/portainers/p1/environments/2/containers/abc123/exec','POST'),false);
  assert.equal(allowed('admin','/api/docker/portainers/p1/environments/2/containers/abc123/exec','POST'),true);
  assert.equal(allowed('operator','/api/docker/portainers/p1/environments/2/containers/abc123/action','POST'),true);
});
test('isBlockedSsrfIp blocks loopback/link-local/metadata but allows private LAN ranges',()=>{
  for(const ip of ['127.0.0.1','0.0.0.0','169.254.169.254','169.254.0.1','::1','fe80::1'])
    assert.equal(isBlockedSsrfIp(ip),true,ip);
  for(const ip of ['10.0.0.5','172.16.0.5','192.168.1.10','8.8.8.8','2001:db8::1'])
    assert.equal(isBlockedSsrfIp(ip),false,ip);
});
test('SSH key generation for temperature monitoring requires admin.manage, like the rest of server management',()=>{
  assert.equal(requiredPermissionForMutation('/api/servers/s1/ssh-key/generate','POST'),'admin.manage');
  assert.equal(allowed('operator','/api/servers/s1/ssh-key/generate','POST'),false);
  assert.equal(allowed('admin','/api/servers/s1/ssh-key/generate','POST'),true);
});
test('node fan control requires machines.control',()=>{
  assert.equal(requiredPermissionForMutation('/api/servers/s1/nodes/n1/fans','POST'),'machines.control');
  assert.equal(allowed('viewer','/api/servers/s1/nodes/n1/fans','POST'),false);
  assert.equal(allowed('operator','/api/servers/s1/nodes/n1/fans','POST'),true);
});
test('direct SSH node shell session requires console.use, like the Proxmox termproxy console',()=>{
  assert.equal(requiredPermissionForMutation('/api/servers/s1/nodes/n1/ssh-shell/session','POST'),'console.use');
  assert.equal(allowed('viewer','/api/servers/s1/nodes/n1/ssh-shell/session','POST'),false);
  assert.equal(allowed('operator','/api/servers/s1/nodes/n1/ssh-shell/session','POST'),true);
});
