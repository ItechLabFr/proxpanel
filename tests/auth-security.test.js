'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {
  normalizeReauthCode,strongReauthAllowed,nextSensitiveAttempt,sensitiveAttemptBlocked
}=require('../app/lib/auth-security');

test('strong reauthentication requires password and a six digit TOTP',()=>{
  const actor={id:'u1',active:true,totpEnabled:true};
  assert.equal(strongReauthAllowed(actor,{password:'correct',code:'123456'},{password:()=>true,totp:()=>true}),true);
  assert.equal(strongReauthAllowed(actor,{password:'wrong',code:'123456'},{password:()=>false,totp:()=>true}),false);
  assert.equal(strongReauthAllowed(actor,{password:'correct',code:'123'},{password:()=>true,totp:()=>true}),false);
  assert.equal(strongReauthAllowed({...actor,totpEnabled:false},{password:'correct',code:'123456'},{password:()=>true,totp:()=>true}),false);
});

test('TOTP input is normalized without accepting more than six digits',()=>{
  assert.equal(normalizeReauthCode(' 12 34-56 '),'123456');
  assert.equal(normalizeReauthCode('123456789'),'123456');
});

test('sensitive reauthentication locks after five failures in fifteen minutes',()=>{
  const now=1_700_000_000_000;
  let row={};
  for(let i=0;i<4;i++)row=nextSensitiveAttempt(row,now+i*1000);
  assert.equal(row.blocked,false);
  row=nextSensitiveAttempt(row,now+5000);
  assert.equal(row.count,5);
  assert.equal(row.blocked,true);
  assert.equal(sensitiveAttemptBlocked(row,now+6000),true);
  assert.equal(sensitiveAttemptBlocked(row,now+16*60*1000),false);
});

test('failure counter resets outside the rolling window',()=>{
  const now=1_700_000_000_000;
  const first=nextSensitiveAttempt({},now);
  const later=nextSensitiveAttempt(first,now+16*60*1000);
  assert.equal(later.count,1);
  assert.equal(later.blocked,false);
});
