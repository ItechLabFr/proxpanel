function renderAuth(setup){
  let secondFactorMode='totp',twoFactorInfo=null,emailExpiryTimer=null,emailResendTimer=null,submitting=false;
  const at=(fr,en)=>currentLanguage()==='en'?en:fr;
  const authTitle=setup?at('Créer le compte administrateur','Create administrator account'):'ProxPanel';
  const authSubtitle=setup
    ?at('Première installation · configure le compte principal et son adresse de secours.','First setup · configure the primary account and its recovery e-mail.')
    :at('Connexion sécurisée à la console','Secure console sign-in');

  app.innerHTML=`<div class="auth-screen auth-v15">
    <div class="auth-language"><label><span aria-hidden="true">🌐</span><select id="authLanguage" aria-label="${esc(at('Langue de l’interface','Interface language'))}"><option value="fr" ${currentLanguage()==='fr'?'selected':''}>FR</option><option value="en" ${currentLanguage()==='en'?'selected':''}>EN</option></select></label></div>
    <main class="auth-shell">
      <form class="auth-card" id="authForm" novalidate>
        <div class="auth-brand-row">
          <div class="auth-logo">${brandMarkSvg()}</div>
          <div class="auth-product"><strong>ProxPanel</strong><span class="beta-badge">BETA</span></div>
        </div>
        <div class="auth-heading">
          <div class="auth-step" id="authStep">${setup?at('Configuration initiale','Initial setup'):at('Connexion','Sign in')}</div>
          <h1 id="authTitle">${esc(authTitle)}</h1>
          <p id="authSubtitle">${esc(authSubtitle)}</p>
        </div>
        <div class="auth-error" id="authError" role="alert" aria-live="polite" hidden></div>

        <div class="auth-primary" id="authPrimary">
          ${setup?`<div class="setup-progress" aria-label="${esc(at('Étape 1 sur 2','Step 1 of 2'))}"><span class="active"></span><span></span></div>`:''}
          <label class="auth-field"><span>${at('Utilisateur','Username')}</span><input id="authUser" autocomplete="username" required value="" placeholder="admin" autocapitalize="none" spellcheck="false"></label>
          ${setup?`<label class="auth-field"><span>${at('Adresse e-mail','E-mail address')}</span><input id="authEmail" type="email" autocomplete="email" required placeholder="admin@domaine.fr" inputmode="email"></label><small class="auth-security">${at('Utilisée pour la récupération 2FA et les alertes configurées.','Used for 2FA recovery and configured alerts.')}</small>`:''}
          <label class="auth-field"><span>${at('Mot de passe','Password')}</span><div class="password-wrap"><input id="authPass" type="password" autocomplete="${setup?'new-password':'current-password'}" required ${setup?'minlength="12"':''}><button type="button" class="password-toggle" id="toggleAuthPass" aria-label="${esc(at('Afficher le mot de passe','Show password'))}" title="${esc(at('Afficher le mot de passe','Show password'))}">◉</button></div><small class="caps-warning" id="capsWarning" hidden>${at('Verr. Maj est activé','Caps Lock is on')}</small></label>
          ${setup?`<label class="auth-field"><span>${at('Confirmer le mot de passe','Confirm password')}</span><div class="password-wrap"><input id="authPassConfirm" type="password" autocomplete="new-password" required minlength="12"><button type="button" class="password-toggle" id="toggleAuthPassConfirm" aria-label="${esc(at('Afficher le mot de passe','Show password'))}" title="${esc(at('Afficher le mot de passe','Show password'))}">◉</button></div></label><div class="password-strength" id="passwordStrength"><div class="password-strength-track"><i></i></div><div class="password-strength-copy"><span>${at('12 caractères minimum','12 characters minimum')}</span><strong>${at('À définir','Not set')}</strong></div></div>`:''}
          ${!setup?`<small class="auth-security auth-security-login">${at('Session signée · protection anti-bruteforce · Authenticator, récupération et secours e-mail','Signed session · brute-force protection · Authenticator, recovery codes and e-mail fallback')}</small>`:''}
          <button class="btn primary auth-submit" id="authSubmit" type="submit"><span>${setup?at('Créer le compte','Create account'):at('Se connecter','Sign in')}</span></button>
        </div>

        <div id="panelOtpSlot" class="auth-mfa-slot" aria-live="polite"></div>
      </form>
      <div class="auth-footer">${at('Projet personnel indépendant · Non affilié à Proxmox','Independent personal project · Not affiliated with Proxmox')}</div>
    </main>
  </div>`;

  applyRuntimeLanguage(app);

  const form=qs('#authForm'),slot=qs('#panelOtpSlot'),errorBox=qs('#authError'),submitBtn=qs('#authSubmit');
  const setError=(message='')=>{if(!errorBox)return;if(message){errorBox.textContent=message;errorBox.hidden=false}else{errorBox.textContent='';errorBox.hidden=true}};
  const clearTimers=()=>{if(emailExpiryTimer)clearInterval(emailExpiryTimer);if(emailResendTimer)clearInterval(emailResendTimer);emailExpiryTimer=null;emailResendTimer=null};
  const focusLater=selector=>setTimeout(()=>qs(selector)?.focus({preventScroll:false}),60);
  const setBusy=(busy,label='')=>{submitting=busy;if(submitBtn){submitBtn.disabled=busy;const span=qs('span',submitBtn);if(span)span.textContent=busy?(label||at('Connexion…','Signing in…')):(setup?at('Créer le compte','Create account'):at('Se connecter','Sign in'))}};
  const attachAutoSubmit=(selector,mode)=>{const input=qs(selector);if(!input)return;input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,6);setError('');if(input.value.length===6&&secondFactorMode===mode&&!submitting)setTimeout(()=>{if(input.value.length===6&&secondFactorMode===mode)form.requestSubmit()},120)})};

  const authLanguage=qs('#authLanguage');
  if(authLanguage)authLanguage.addEventListener('change',e=>setUiLanguage(e.target.value,{remember:true,render:true}));

  const bindPasswordToggle=(inputSelector,buttonSelector)=>{
    const input=qs(inputSelector),button=qs(buttonSelector);if(!input||!button)return;
    button.onclick=()=>{const showing=input.type==='text';input.type=showing?'password':'text';button.classList.toggle('active',!showing);button.setAttribute('aria-label',!showing?at('Masquer le mot de passe','Hide password'):at('Afficher le mot de passe','Show password'))};
  };
  bindPasswordToggle('#authPass','#toggleAuthPass');
  bindPasswordToggle('#authPassConfirm','#toggleAuthPassConfirm');

  const pass=qs('#authPass'),caps=qs('#capsWarning');
  if(pass&&caps){const updateCaps=e=>{caps.hidden=!e.getModifierState?.('CapsLock')};pass.addEventListener('keyup',updateCaps);pass.addEventListener('keydown',updateCaps);pass.addEventListener('blur',()=>caps.hidden=true)}

  if(setup&&pass){
    const confirmPass=qs('#authPassConfirm'),strength=qs('#passwordStrength'),bar=strength?qs('i',strength):null,label=strength?qs('strong',strength):null;
    const updateStrength=()=>{
      const v=pass.value||'';let score=0;if(v.length>=12)score++;if(v.length>=16)score++;if(/[a-z]/.test(v)&&/[A-Z]/.test(v))score++;if(/\d/.test(v))score++;if(/[^A-Za-z0-9]/.test(v))score++;
      const pct=Math.min(100,score*20),labels=currentLanguage()==='en'?['Not set','Weak','Fair','Good','Strong','Very strong']:['À définir','Faible','Moyen','Bon','Fort','Très fort'];
      if(bar)bar.style.width=`${pct}%`;if(label)label.textContent=v?labels[Math.min(score,5)]:labels[0];
      if(confirmPass?.value)setError(confirmPass.value!==v?at('Les deux mots de passe ne correspondent pas.','Passwords do not match.'):'');
    };
    pass.addEventListener('input',updateStrength);confirmPass?.addEventListener('input',updateStrength);
  }

  const leave2fa=()=>{
    clearTimers();secondFactorMode='totp';twoFactorInfo=null;slot.innerHTML='';form.classList.remove('mfa-active');setError('');
    qs('#authStep').textContent=at('Connexion','Sign in');qs('#authTitle').textContent='ProxPanel';qs('#authSubtitle').textContent=at('Connexion sécurisée à la console','Secure console sign-in');
    focusLater('#authPass');
  };

  const mfaHeader=(title,description)=>`<div class="mfa-head"><div class="mfa-shield" aria-hidden="true">✓</div><div><div class="auth-step">${at('Étape 2 sur 2','Step 2 of 2')}</div><h2>${title}</h2><p>${description}</p></div></div>`;

  const renderRecovery=()=>{
    clearTimers();secondFactorMode='recovery';setError('');
    slot.innerHTML=`<div class="login-2fa login-2fa-v15">${mfaHeader(at('Code de récupération','Recovery code'),at('Utilise l’un des codes enregistrés lors de l’activation de la 2FA.','Use one of the codes saved when two-factor authentication was enabled.'))}<label class="auth-field"><span>${at('Code de récupération','Recovery code')}</span><input id="authRecoveryCode" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label><button type="submit" class="btn primary mfa-verify">${at('Continuer','Continue')}</button><button type="button" class="mfa-back" id="backTotp">← ${at('Utiliser Authenticator','Use Authenticator')}</button></div>`;
    applyRuntimeLanguage(slot);qs('#backTotp').onclick=()=>render2fa(twoFactorInfo);focusLater('#authRecoveryCode');
  };

  const renderEmailStep=emailMasked=>{
    clearTimers();secondFactorMode='email';setError('');
    let expires=10*60,resend=60;
    slot.innerHTML=`<div class="login-2fa login-2fa-v15">${mfaHeader(at('Code envoyé','Code sent'),`${at('Un code à 6 chiffres a été envoyé à','A 6-digit code was sent to')} <strong>${esc(emailMasked||twoFactorInfo?.emailMasked||'')}</strong>.`)}<label class="auth-field"><span>${at('Code reçu par e-mail','Code received by e-mail')}</span><input id="authEmailCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" class="otp-input" placeholder="000000"></label><div class="mfa-timers"><span id="emailExpiry">${at('Expire dans','Expires in')} 10:00</span><button type="button" id="resendEmail2fa" disabled>${at('Renvoyer dans','Resend in')} 60 s</button></div><button type="submit" class="btn primary mfa-verify">${at('Vérifier','Verify')}</button><button type="button" class="mfa-back" id="backTotp">← ${at('Utiliser Authenticator','Use Authenticator')}</button></div>`;
    applyRuntimeLanguage(slot);qs('#backTotp').onclick=()=>render2fa(twoFactorInfo);
    const expiryEl=qs('#emailExpiry'),resendBtn=qs('#resendEmail2fa');
    emailExpiryTimer=setInterval(()=>{expires=Math.max(0,expires-1);const m=String(Math.floor(expires/60)).padStart(2,'0'),s=String(expires%60).padStart(2,'0');if(expiryEl)expiryEl.textContent=`${at('Expire dans','Expires in')} ${m}:${s}`;if(!expires){clearInterval(emailExpiryTimer);emailExpiryTimer=null}},1000);
    emailResendTimer=setInterval(()=>{resend=Math.max(0,resend-1);if(resendBtn){resendBtn.textContent=resend?`${at('Renvoyer dans','Resend in')} ${resend} s`:at('Renvoyer un code','Resend code');resendBtn.disabled=resend>0}if(!resend){clearInterval(emailResendTimer);emailResendTimer=null}},1000);
    resendBtn.onclick=async()=>{try{resendBtn.disabled=true;const r2=await api('/api/login/recovery-email',{method:'POST',body:JSON.stringify({username:qs('#authUser').value,password:qs('#authPass').value})});toast(at('Nouveau code envoyé.','New code sent.'));renderEmailStep(r2.emailMasked)}catch(err){setError(err.message);resendBtn.disabled=false}};
    attachAutoSubmit('#authEmailCode','email');focusLater('#authEmailCode');
  };

  const sendEmailCode=async button=>{
    try{if(button)button.disabled=true;setError('');const r2=await api('/api/login/recovery-email',{method:'POST',body:JSON.stringify({username:qs('#authUser').value,password:qs('#authPass').value})});renderEmailStep(r2.emailMasked)}
    catch(err){setError(err.message);if(button)button.disabled=false}
  };

  const render2fa=r=>{
    clearTimers();twoFactorInfo=r;secondFactorMode='totp';setError('');form.classList.add('mfa-active');
    qs('#authStep').textContent=at('Vérification','Verification');qs('#authTitle').textContent=at('Double authentification','Two-factor authentication');qs('#authSubtitle').textContent=at('Une vérification supplémentaire est requise.','An additional verification step is required.');
    slot.innerHTML=`<div class="login-2fa login-2fa-v15">${mfaHeader(at('Vérification 2FA','2FA verification'),at('Entre le code affiché dans ton application Authenticator.','Enter the code shown in your Authenticator app.'))}<label class="auth-field"><span>${at('Code Authenticator','Authenticator code')}</span><input id="authOtp" class="otp-input" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label><button type="submit" class="btn primary mfa-verify">${at('Vérifier','Verify')}</button><div class="mfa-divider"><span>${at('Autre méthode','Another method')}</span></div><div class="mfa-methods"><button type="button" id="useRecoveryCode"><span class="mfa-method-icon">#</span><span><strong>${at('Code de récupération','Recovery code')}</strong><small>${at('Utiliser un code à usage unique','Use a one-time recovery code')}</small></span><b>›</b></button>${r.emailRecoveryAvailable?`<button type="button" id="sendEmail2fa"><span class="mfa-method-icon">@</span><span><strong>${at('Code par e-mail','E-mail code')}</strong><small>${at('Envoyer à','Send to')} ${esc(r.emailMasked||at('mon e-mail','my e-mail'))}</small></span><b>›</b></button>`:`<div class="mfa-method-disabled"><span class="mfa-method-icon">@</span><span><strong>${at('Secours e-mail indisponible','E-mail fallback unavailable')}</strong><small>${r.mailConfigured?at('Méthode indisponible pour ce compte','Method unavailable for this account'):at('Configure d’abord l’envoi d’e-mails dans ProxPanel','Configure e-mail sending in ProxPanel first')}</small></span></div>`}</div><button type="button" class="mfa-back" id="backLogin">← ${at('Retour à la connexion','Back to sign in')}</button></div>`;
    applyRuntimeLanguage(slot);qs('#useRecoveryCode').onclick=renderRecovery;qs('#backLogin').onclick=leave2fa;const mailBtn=qs('#sendEmail2fa');if(mailBtn)mailBtn.onclick=()=>sendEmailCode(mailBtn);attachAutoSubmit('#authOtp','totp');focusLater('#authOtp');
  };

  form.addEventListener('submit',async e=>{
    e.preventDefault();if(submitting)return;setError('');
    const password=qs('#authPass')?.value||'';
    if(setup){
      if(password.length<12){setError(at('Le mot de passe doit contenir au moins 12 caractères.','Password must contain at least 12 characters.'));focusLater('#authPass');return}
      if(password!==(qs('#authPassConfirm')?.value||'')){setError(at('Les deux mots de passe ne correspondent pas.','Passwords do not match.'));focusLater('#authPassConfirm');return}
    }
    try{
      setBusy(true,setup?at('Création…','Creating…'):secondFactorMode==='totp'&&twoFactorInfo?at('Vérification…','Verifying…'):at('Connexion…','Signing in…'));
      const payload={username:qs('#authUser').value,email:qs('#authEmail')?.value||'',password,otp:secondFactorMode==='totp'?(qs('#authOtp')?.value||''):'',recoveryCode:secondFactorMode==='recovery'?(qs('#authRecoveryCode')?.value||''):'',emailCode:secondFactorMode==='email'?(qs('#authEmailCode')?.value||''):''};
      const r=await api(setup?'/api/setup':'/api/login',{method:'POST',body:JSON.stringify(payload)});
      if(!setup&&r.needTotp){setBusy(false);render2fa(r);return}
      clearTimers();state.status=await api('/api/status');await loadBase();if(setup&&state.servers.length===0)setTimeout(()=>openAddServer(true),80);
    }catch(err){
      setBusy(false);setError(err.message||at('Connexion impossible.','Unable to sign in.'));
      const active=secondFactorMode==='email'?'#authEmailCode':secondFactorMode==='recovery'?'#authRecoveryCode':twoFactorInfo?'#authOtp':'#authPass';focusLater(active);
    }
  });
}