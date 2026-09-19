'use strict';

function normalizeReauthCode(value='') {
  return String(value||'').replace(/\D/g,'').slice(0,6);
}

function strongReauthAllowed(actor,credentials={},verifiers={}) {
  if(!actor||actor.active===false||actor.totpEnabled!==true)return false;
  const password=String(credentials.password||'');
  const code=normalizeReauthCode(credentials.code);
  if(!password||code.length!==6)return false;
  const passwordOk=typeof verifiers.password==='function'&&verifiers.password(actor,password)===true;
  const totpOk=typeof verifiers.totp==='function'&&verifiers.totp(actor,code)===true;
  return passwordOk&&totpOk;
}

function nextSensitiveAttempt(previous={},now=Date.now(),{limit=5,windowMs=15*60*1000,blockMs=15*60*1000}={}) {
  const old=previous&&typeof previous==='object'?previous:{};
  if(old.blockedUntil&&Number(old.blockedUntil)>now)return {...old,blocked:true,retryAfterMs:Number(old.blockedUntil)-now};
  const firstAt=Number(old.firstAt||0);
  const within=firstAt>0&&now-firstAt<windowMs;
  const count=within?Number(old.count||0)+1:1;
  const blockedUntil=count>=limit?now+blockMs:0;
  return {count,firstAt:within?firstAt:now,blockedUntil,blocked:blockedUntil>now,retryAfterMs:blockedUntil>now?blockMs:0};
}

function sensitiveAttemptBlocked(row={},now=Date.now()) {
  return Number(row?.blockedUntil||0)>now;
}

module.exports={normalizeReauthCode,strongReauthAllowed,nextSensitiveAttempt,sensitiveAttemptBlocked};
