'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {findSessionUser,ROLE_PERMISSIONS,effectivePermissionsForUser,userHasPermission,requiredPermissionForMutation,automationStepPermissions,effectiveClientIp,effectiveRequestHttps,effectiveRequestHost}=require('../app/lib/security-policy');
const allowed=(role,path,method)=>{const r=requiredPermissionForMutation(path,method),p=ROLE_PERMISSIONS[role]||[];return !r||p.includes('*')||p.includes(r)};
const req=(remoteAddress,headers={},encrypted=false)=>({socket:{remoteAddress,encrypted},headers});
test('viewer denied critical mutations',()=>{for(const [p,m] of [['/api/changes','POST'],['/api/changes/id/apply','POST'],['/api/pbs/actions/prune','POST'],['/api/pbs/actions/gc','POST'],['/api/automations','POST'],['/api/automations/id/run','POST'],['/api/dependencies/manual','POST']])assert.equal(allowed('viewer',p,m),false,p);});
test('operator keeps operational access without server admin',()=>{for(const p of ['/api/servers/s1/machines/qemu/100/action','/api/servers/s1/console/session','/api/servers/s1/backups/run','/api/servers/s1/maintenance/reboot','/api/changes/id/apply','/api/pbs/actions/prune'])assert.equal(allowed('operator',p,'POST'),true,p);assert.equal(allowed('operator','/api/servers/s1','PUT'),false);assert.equal(allowed('operator','/api/servers/s1/wol','POST'),false);});
test('unknown mutations fail closed',()=>{assert.equal(requiredPermissionForMutation('/api/future-dangerous','POST'),'admin.manage');assert.equal(allowed('operator','/api/future-dangerous','POST'),false);assert.equal(allowed('admin','/api/future-dangerous','POST'),true);});
test('automation nested permissions',()=>assert.deepEqual(automationStepPermissions([{type:'machine-action'},{type:'condition',then:[{type:'backup'}],else:[{type:'docker-action'}]}]).sort(),['backups.run','machines.control']));
test('untrusted forwarded headers ignored',()=>{const r=req('203.0.113.10',{'x-forwarded-for':'198.51.100.7','x-forwarded-proto':'https','x-forwarded-host':'evil','host':'panel.local'});assert.equal(effectiveClientIp(r,''),'203.0.113.10');assert.equal(effectiveRequestHttps(r,''),false);assert.equal(effectiveRequestHost(r,''),'panel.local');});
test('trusted forwarded headers accepted',()=>{const r=req('172.18.0.12',{'x-forwarded-for':'198.51.100.8','x-forwarded-proto':'https','x-forwarded-host':'panel.example'});assert.equal(effectiveClientIp(r,'172.18.0.0/16'),'198.51.100.8');assert.equal(effectiveRequestHttps(r,'172.18.0.0/16'),true);assert.equal(effectiveRequestHost(r,'172.18.0.0/16'),'panel.example');});
test('trusted proxy chain ignores a spoofed left-most XFF value',()=>{const r=req('172.18.0.12',{'x-forwarded-for':'203.0.113.99, 198.51.100.8'});assert.equal(effectiveClientIp(r,'172.18.0.0/16'),'198.51.100.8');});

test('admin.manage is scoped and cannot bypass unrelated RBAC permissions',()=>{
  const scopedAdmin={role:'custom',permissions:['admin.manage'],active:true};
  assert.deepEqual(effectivePermissionsForUser(scopedAdmin),['admin.manage']);
  assert.equal(userHasPermission(scopedAdmin,'admin.manage'),true);
  assert.equal(userHasPermission(scopedAdmin,'*'),false);
  for(const [endpoint,method] of [
    ['/api/servers/s1/machines/qemu/100/action','POST'],
    ['/api/servers/s1/backups/restore','POST'],
    ['/api/pbs/actions/prune','POST'],
    ['/api/automations/auto1/run','POST'],
    ['/api/sessions/session1','DELETE']
  ]){
    const permission=requiredPermissionForMutation(endpoint,method);
    assert.notEqual(permission,'admin.manage',endpoint);
    assert.equal(userHasPermission(scopedAdmin,permission),false,endpoint);
  }
  assert.equal(userHasPermission(scopedAdmin,requiredPermissionForMutation('/api/settings','PUT')),true);
});

test('only wildcard grants global access and inactive accounts get none',()=>{
  assert.equal(userHasPermission({role:'admin',active:true},'*'),true);
  assert.equal(userHasPermission({role:'custom',permissions:['*'],active:true},'backups.run'),true);
  assert.equal(userHasPermission({role:'operator',permissions:['*'],active:true},'*'),false);
  assert.equal(userHasPermission({role:'custom',permissions:['*'],active:false},'*'),false);
  assert.equal(userHasPermission(null,'admin.manage'),false);
});

test('deleted account sessions cannot attach to a reused username',()=>{
  const original={id:'old-account-id',username:'operator',role:'viewer'};
  const replacement={id:'new-account-id',username:'operator',role:'admin'};
  assert.equal(findSessionUser([original],{userId:original.id,username:'operator'}),original);
  assert.equal(findSessionUser([replacement],{userId:original.id,username:'operator'}),null);
  assert.equal(findSessionUser([replacement],{username:'operator'}),null,'legacy cookies without immutable IDs must reauthenticate');
  assert.equal(findSessionUser([replacement],{userId:replacement.id,username:'operator'}),replacement);
});
