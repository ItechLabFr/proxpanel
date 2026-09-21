'use strict';

function wazuhTone(severity='') {
  const s=String(severity||'').toLowerCase();return s==='critical'?'danger':s==='high'?'warning':s==='medium'?'warning':'neutral';
}
function wazuhPriorityLabel(value='ok') {
  return value==='critical'?'Critique':value==='attention'?'Attention':'OK';
}
function wazuhPriorityTone(value='ok') {
  return value==='critical'?'danger':value==='attention'?'warning':'ok';
}
function wazuhHasFix(v={}) { return !!String(v.fixedVersion||'').trim(); }
function wazuhMachineMapping(agentId='') { return state.wazuhOverview?.topologyMappings?.[String(agentId)]||null; }
function wazuhSuggestedMachine(agent={}) {
  const name=String(agent.agentName||agent.name||'').toLowerCase(),ip=String(agent.ip||agent.agentIp||'');
  if(!name&&!ip)return null;
  const machines=d().machines||[];
  const exact=machines.filter(m=>String(m.name||'').toLowerCase()===name);
  return exact.length===1?exact[0]:null;
}
function wazuhMappingText(mapping) {
  if(!mapping)return '';
  return [mapping.name||`VM/LXC ${mapping.vmid||''}`,mapping.vmid?`VMID ${mapping.vmid}`:'',mapping.node||''].filter(Boolean).join(' · ');
}
function wazuhTrendDelta(rows=[],key='critical',days=7) {
  const cutoff=Date.now()-days*86400000,filtered=(rows||[]).filter(x=>Date.parse(x.at||0)>=cutoff).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(filtered.length<2)return null;return Number(filtered.at(-1)?.[key]||0)-Number(filtered[0]?.[key]||0);
}
function wazuhTrendBadge(value) {
  if(value==null)return badge('Historique en collecte','neutral');
  if(value===0)return badge('Stable','neutral');
  return badge(`${value>0?'+':''}${value}`,value>0?'danger':'ok');
}
function wazuhFilteredVulnerabilities() {
  const rows=state.wazuhOverview?.vulnerabilities||[],severity=state.wazuhSeverity||'all',q=String(state.wazuhQuery||'').trim().toLowerCase();
  return rows.filter(v=>{
    if(severity!=='all'&&v.severity!==severity)return false;
    if(!q)return true;
    const hay=[v.id,v.agentName,v.agentId,v.agentIp,v.packageName,v.packageVersion,v.fixedVersion,v.os].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
function wazuhVulnerabilityRow(v={}) {
  const mapping=v.mapping||wazuhMachineMapping(v.agentId),score=v.score==null?'CVSS N/D':`CVSS ${v.score}`;
  const search=[v.id,v.agentName,v.agentId,v.agentIp,v.packageName,v.packageVersion,v.fixedVersion,v.os].join(' ').toLowerCase();
  return `<article class="wazuh-vuln-row" data-wazuh-row data-severity="${esc(v.severity)}" data-search="${esc(search)}">
    <div class="wazuh-vuln-main"><div class="wazuh-vuln-title"><strong>${esc(v.id||'CVE non renseignée')}</strong>${badge(v.severity==='critical'?'Critique':v.severity==='high'?'Élevée':v.severity,wazuhTone(v.severity))}${badge(score,'neutral')}${wazuhHasFix(v)?badge('Correctif identifié','ok'):''}</div>
    <p>${esc(v.description||v.packageName||'Vulnérabilité active détectée par Wazuh')}</p></div>
    <div class="wazuh-vuln-grid">
      <div><span>Machine</span><strong>${esc(v.agentName||v.agentId||'—')}</strong><small>${esc(v.agentIp||v.os||'')}</small></div>
      <div><span>Paquet / logiciel</span><strong>${esc(v.packageName||'—')}</strong><small>${esc(v.packageVendor||'')}</small></div>
      <div><span>Version installée</span><strong>${esc(v.packageVersion||'—')}</strong><small>${esc(v.packageArchitecture||'')}</small></div>
      <div><span>Version corrigée</span><strong>${esc(v.fixedVersion||'Non fournie par Wazuh')}</strong><small>${wazuhHasFix(v)?'Donnée source disponible':'Aucune version inventée'}</small></div>
    </div>
    <div class="wazuh-vuln-foot"><div>${mapping?`<span class="wazuh-correlation">↳ ${esc(wazuhMappingText(mapping))}</span>`:badge('Non associé à Proxmox','neutral')}</div><div class="row-actions">${button(mapping?'Modifier association':'Associer VM/LXC',`wazuh-map:${encodeURIComponent(v.agentId||v.agentName||'')}`,'tiny')}${state.wazuhOverview?.integration?.dashboardUrl?`<a class="btn tiny secondary" target="_blank" rel="noopener noreferrer" href="${esc(state.wazuhOverview.integration.dashboardUrl)}">Ouvrir Wazuh</a>`:''}</div></div>
  </article>`;
}
function wazuhAlertRow(a={}) {
  const mapping=a.mapping||wazuhMachineMapping(a.agentId);
  return `<article class="wazuh-alert-row"><div class="wazuh-alert-level ${Number(a.level||0)>=15?'critical':''}">${Number(a.level||0)}</div><div class="wazuh-alert-copy"><div><strong>${esc(a.description||'Alerte Wazuh')}</strong>${badge(`Règle ${a.ruleId||'—'}`,'neutral')}</div><p>${esc(a.agentName||a.agentId||'Endpoint')} · ${esc(fmtDate(a.timestamp))}</p>${a.mitreTactics?.length?`<small>MITRE · ${esc(a.mitreTactics.join(', '))}${a.mitreTechniques?.length?` · ${esc(a.mitreTechniques.join(', '))}`:''}</small>`:''}${mapping?`<small class="wazuh-correlation">↳ ${esc(wazuhMappingText(mapping))}</small>`:''}</div></article>`;
}
function wazuhPage() {
  if(state.wazuhError&&!state.wazuhOverview)return `<div class="page-head"><div><h1>Wazuh Security</h1><p>Security Essentials · CVE, agents et alertes prioritaires.</p></div>${button('Réessayer','wazuh-refresh','primary')}</div><section class="panel wazuh-error"><strong>Collecte Wazuh indisponible</strong><p>${esc(state.wazuhError)}</p></section>`;
  const o=state.wazuhOverview;
  if(!o)return `<div class="page-head"><div><h1>Wazuh Security</h1><p>Chargement des données de sécurité…</p></div></div><section class="panel loading">Collecte Wazuh…</section>`;
  const s=o.summary||{},vulns=wazuhFilteredVulnerabilities(),alerts=o.alerts||[],endpoints=(o.byEndpoint||[]).slice(0,8),software=(o.bySoftware||[]).slice(0,8);
  const delta7=wazuhTrendDelta(o.history,'critical',7),delta30=wazuhTrendDelta(o.history,'critical',30);
  const statusTone=o.status==='online'?'ok':o.status==='degraded'?'warning':'danger',statusLabel=o.status==='online'?'Opérationnel':o.status==='degraded'?'Dégradé':'Indisponible';
  return `<div class="page-head wazuh-page-head"><div><div class="wazuh-title-line"><h1>Wazuh Security</h1>${badge(statusLabel,statusTone)}</div><p>Les informations essentielles pour prioriser les incidents et les remédiations, sans dupliquer le dashboard Wazuh complet.</p></div><div class="actions wrap">${button('Tester les notifications','wazuh-test-notification','secondary')}${button('Actualiser','wazuh-refresh','primary')}</div></div>
  ${o.errors?.length?`<div class="wazuh-degraded-banner"><strong>Données Wazuh partielles</strong><span>${esc(o.errors.map(e=>`${e.component}: ${e.message}`).join(' · '))}</span></div>`:''}
  <div class="wazuh-metrics">
    <section class="panel wazuh-metric"><span>État Wazuh</span><strong>${esc(statusLabel)}</strong><small>Manager ${o.manager?.ok?'OK':'KO'} · Indexer ${o.indexer?.ok?'OK':'KO'}</small></section>
    <section class="panel wazuh-metric"><span>Agents</span><strong>${Number(s.agentsActive||0)} / ${Number(s.agentsTotal||0)}</strong><small>${Number(s.agentsDisconnected||0)} déconnecté(s) · ${Number(s.agentsNeverConnected||0)} jamais connecté(s)</small></section>
    <section class="panel wazuh-metric critical"><span>CVE critiques</span><strong>${Number(s.critical||0)}</strong><small>${Number(s.affectedEndpoints||0)} endpoint(s) concernés</small></section>
    <section class="panel wazuh-metric warning"><span>CVE élevées</span><strong>${Number(s.high||0)}</strong><small>${Number(s.vulnerablePackages||0)} paquet(s) / logiciel(s)</small></section>
    <section class="panel wazuh-metric"><span>Alertes importantes</span><strong>${Number(s.importantAlerts||0)}</strong><small>Niveau ≥ ${Number(o.integration?.alertThreshold||12)} · ${esc(state.wazuhPeriod)}</small></section>
  </div>
  <div class="wazuh-toolbar panel"><div class="wazuh-periods">${['24h','7d','30d'].map(p=>button(p,p===state.wazuhPeriod?`wazuh-period-active:${p}`:`wazuh-period:${p}`,p===state.wazuhPeriod?'primary':'secondary',p===state.wazuhPeriod?'disabled':'')).join('')}</div><label class="wazuh-search"><span>⌕</span><input id="wazuhSearch" value="${esc(state.wazuhQuery||'')}" placeholder="CVE, machine, paquet, logiciel…"></label><div class="wazuh-severity-filter">${[['all','Toutes'],['critical','Critiques'],['high','Élevées']].map(([k,l])=>button(l,`wazuh-severity:${k}`,state.wazuhSeverity===k?'primary':'secondary')).join('')}</div></div>
  <div class="wazuh-main-grid">
    <section class="panel wazuh-vulnerabilities"><div class="panel-head"><div><h3>Vulnérabilités à traiter</h3><p>CVE → machine → paquet / logiciel → version installée / corrigée</p></div>${badge(`${vulns.length} résultat(s)`,'neutral')}</div><div class="wazuh-vuln-list" id="wazuhVulnList">${vulns.map(wazuhVulnerabilityRow).join('')||'<div class="empty-inline">Aucune vulnérabilité ne correspond aux filtres.</div>'}</div></section>
    <div class="wazuh-side-stack">
      <section class="panel"><div class="panel-head"><div><h3>Endpoints prioritaires</h3><p>Critiques + élevées + alertes</p></div></div><div class="wazuh-ranking">${endpoints.map(ep=>`<div class="wazuh-rank-row"><div><strong>${esc(ep.agentName||ep.agentId)}</strong><small>${ep.critical} critique(s) · ${ep.high} élevée(s) · ${ep.alerts} alerte(s)</small></div>${badge(wazuhPriorityLabel(ep.priority),wazuhPriorityTone(ep.priority))}</div>`).join('')||'<div class="empty-inline">Aucun endpoint concerné.</div>'}</div></section>
      <section class="panel"><div class="panel-head"><div><h3>Paquets / logiciels exposés</h3><p>Priorité de remédiation</p></div></div><div class="wazuh-ranking">${software.map(sw=>`<div class="wazuh-rank-row"><div><strong>${esc(sw.name)}</strong><small>${sw.machines.length} machine(s) · ${sw.cves.length} CVE</small></div><span>${sw.critical?badge(`${sw.critical} critique(s)`,'danger'):badge(`${sw.high} élevée(s)`,'warning')}</span></div>`).join('')||'<div class="empty-inline">Aucun logiciel vulnérable.</div>'}</div></section>
      <section class="panel"><div class="panel-head"><div><h3>Évolution critiques</h3><p>Historique agrégé local, pas les logs Wazuh</p></div></div><div class="wazuh-trends"><div><span>7 jours</span>${wazuhTrendBadge(delta7)}</div><div><span>30 jours</span>${wazuhTrendBadge(delta30)}</div></div></section>
    </div>
  </div>
  <section class="panel wazuh-important-alerts"><div class="panel-head"><div><h3>Alertes importantes récentes</h3><p>Uniquement les niveaux configurés comme prioritaires.</p></div>${badge(`${alerts.length} événement(s)`,'neutral')}</div><div class="wazuh-alert-list">${alerts.slice(0,20).map(wazuhAlertRow).join('')||'<div class="empty-inline">Aucune alerte prioritaire sur cette période.</div>'}</div></section>
  <section class="panel wazuh-notification-history"><div class="panel-head"><div><h3>Notifications sécurité ProxPanel</h3><p>Historique Panel des alertes Wazuh envoyées ou récupérées.</p></div>${(state.wazuhPanelNotifications||[]).some(n=>!n.read)?button('Marquer comme lues','wazuh-mark-read','tiny'):''}</div><div class="wazuh-panel-events">${(state.wazuhPanelNotifications||[]).slice(0,15).map(n=>`<div class="wazuh-panel-event ${n.read?'':'unread'}"><div><strong>${esc(n.title)}</strong><small>${esc(n.message)}</small></div><span>${esc(fmtDate(n.at))}</span></div>`).join('')||'<div class="empty-inline">Aucune notification Wazuh enregistrée.</div>'}</div></section>`;
}

function filterWazuhRows() {
  const input=qs('#wazuhSearch');state.wazuhQuery=input?.value||'';
  const q=state.wazuhQuery.trim().toLowerCase();let visible=0;
  qsa('[data-wazuh-row]').forEach(row=>{const okSeverity=state.wazuhSeverity==='all'||row.dataset.severity===state.wazuhSeverity,okQuery=!q||String(row.dataset.search||'').includes(q),show=okSeverity&&okQuery;row.hidden=!show;if(show)visible++;});
  const count=qs('.wazuh-vulnerabilities .pill');if(count)count.textContent=`${visible} résultat(s)`;
}

async function openWazuhMappingModal(agentId) {
  const agent=(state.wazuhOverview?.byEndpoint||[]).find(x=>String(x.agentId||x.agentName)===String(agentId))||(state.wazuhOverview?.agents||[]).find(x=>String(x.id||x.name)===String(agentId));
  if(!agent)return toast('Agent Wazuh introuvable.','error');
  const current=wazuhMachineMapping(agentId),suggestion=!current?wazuhSuggestedMachine(agent):null,machines=(d().machines||[]);
  const options=[{value:'',label:'Non associé'},...machines.map(m=>({value:[m.serverId||'',m.type,m.vmid,encodeURIComponent(m.node||''),encodeURIComponent(m.name||'')].join('|'),label:`${m.name||'VM/LXC'} · ${String(m.type||'').toUpperCase()} ${m.vmid} · ${m.node||''}`}))];
  const selected=current?[current.serverId||'',current.type,current.vmid,encodeURIComponent(current.node||''),encodeURIComponent(current.name||'')].join('|'):suggestion?[suggestion.serverId||'',suggestion.type,suggestion.vmid,encodeURIComponent(suggestion.node||''),encodeURIComponent(suggestion.name||'')].join('|'):'';
  modal(`Associer Wazuh · ${esc(agent.agentName||agent.name||agentId)}`,`<div class="info-box"><strong>Corrélation explicite</strong><p>ProxPanel peut suggérer une VM/LXC si le hostname correspond exactement. L’association n’est jamais enregistrée sans validation.</p></div>${suggestion&&!current?`<div class="wazuh-suggestion">Suggestion : <strong>${esc(suggestion.name)}</strong> · VMID ${suggestion.vmid}</div>`:''}${selectField('VM/LXC Proxmox','wazuhMappingMachine',options,selected)}`,`<button class="btn secondary" data-action="close-modal">Annuler</button><button class="btn primary" data-action="wazuh-map-save:${encodeURIComponent(agentId)}">Enregistrer</button>`);
}

function wazuhMachineSecurityMarkup(machine={}) {
  if(!state.wazuhOverview)return '';
  const machineName=String(machine.name||'').toLowerCase(),machineId=String(machine.vmid||'');
  const ep=(state.wazuhOverview.byEndpoint||[]).find(x=>{const m=x.mapping;return m?(String(m.vmid)===machineId&&String(m.type||'')===String(machine.type||'')):String(x.agentName||'').toLowerCase()===machineName;});
  if(!ep)return '';
  const vulns=(state.wazuhOverview.vulnerabilities||[]).filter(v=>String(v.agentId||v.agentName)===String(ep.agentId||ep.agentName));
  return `<section class="panel machine-detail-section wazuh-machine-security"><div class="machine-detail-section-head"><div><h3>Wazuh Security</h3><span>Agent ${esc(ep.agentName||ep.agentId)}</span></div>${badge(wazuhPriorityLabel(ep.priority),wazuhPriorityTone(ep.priority))}</div><div class="wazuh-machine-summary"><div><span>CVE critiques</span><strong>${ep.critical||0}</strong></div><div><span>CVE élevées</span><strong>${ep.high||0}</strong></div><div><span>Alertes importantes</span><strong>${ep.alerts||0}</strong></div><div><span>Agent</span><strong>${ep.disconnected?'Déconnecté':'Actif'}</strong></div></div>${vulns.length?`<div class="wazuh-machine-packages">${[...new Set(vulns.map(v=>v.packageName).filter(Boolean))].slice(0,8).map(p=>`<code>${esc(p)}</code>`).join('')}</div>`:''}<div class="actions">${button('Ouvrir Wazuh Security','go-wazuh','secondary')}</div></section>`;
}
