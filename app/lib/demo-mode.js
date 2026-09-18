
'use strict';

const DEMO_MODE = /^(1|true|yes|on)$/i.test(String(process.env.PROXPANEL_DEMO_MODE || ''));
const DEMO_USERNAME = String(process.env.PROXPANEL_DEMO_USER || 'demo').trim() || 'demo';
const DEMO_PASSWORD = String(process.env.PROXPANEL_DEMO_PASSWORD || 'ProxPanelDemo2026!');
const DEMO_EMAIL = String(process.env.PROXPANEL_DEMO_EMAIL || 'demo@proxpanel.fr').trim() || 'demo@proxpanel.fr';

function gib(value) { return Math.round(Number(value || 0) * 1024 * 1024 * 1024); }
function tib(value) { return Math.round(Number(value || 0) * 1024 * 1024 * 1024 * 1024); }

function demoResources() {
  const day = 86400;
  return [
    { type:'node', node:'pve-demo-01', status:'online', cpu:0.31, maxcpu:32, mem:gib(41), maxmem:gib(64), uptime:18*day, disk:gib(18), maxdisk:gib(96) },
    { type:'node', node:'pve-demo-02', status:'online', cpu:0.18, maxcpu:32, mem:gib(29), maxmem:gib(64), uptime:43*day, disk:gib(21), maxdisk:gib(96) },
    { type:'node', node:'pve-demo-03', status:'online', cpu:0.24, maxcpu:24, mem:gib(23), maxmem:gib(48), uptime:11*day, disk:gib(14), maxdisk:gib(96) },

    { type:'qemu', vmid:100, name:'DC01', status:'running', node:'pve-demo-01', cpu:0.12, maxcpu:4, mem:gib(5.8), maxmem:gib(8), disk:gib(42), maxdisk:gib(80), uptime:12*day, tags:'production;windows', netin:17800000, netout:9600000 },
    { type:'qemu', vmid:101, name:'WEB01', status:'running', node:'pve-demo-01', cpu:0.07, maxcpu:4, mem:gib(3.1), maxmem:gib(4), disk:gib(21), maxdisk:gib(40), uptime:8*day, tags:'production;linux;web', netin:9200000, netout:13500000 },
    { type:'qemu', vmid:110, name:'SQL01', status:'running', node:'pve-demo-02', cpu:0.21, maxcpu:8, mem:gib(11.4), maxmem:gib(16), disk:gib(118), maxdisk:gib(200), uptime:22*day, tags:'production;windows;database', netin:7300000, netout:5100000 },
    { type:'qemu', vmid:120, name:'MONITORING', status:'running', node:'pve-demo-03', cpu:0.09, maxcpu:4, mem:gib(6.2), maxmem:gib(8), disk:gib(54), maxdisk:gib(100), uptime:6*day, tags:'monitoring;linux', netin:16200000, netout:4200000 },
    { type:'qemu', vmid:130, name:'WIN-LAB', status:'stopped', node:'pve-demo-03', cpu:0, maxcpu:4, mem:0, maxmem:gib(8), disk:gib(31), maxdisk:gib(64), uptime:0, tags:'lab;windows', netin:0, netout:0 },

    { type:'lxc', vmid:200, name:'npm-proxy', status:'running', node:'pve-demo-01', cpu:0.03, maxcpu:2, mem:gib(1.2), maxmem:gib(2), disk:gib(7), maxdisk:gib(16), uptime:31*day, tags:'network;docker', netin:5700000, netout:8100000 },
    { type:'lxc', vmid:201, name:'uptime-kuma', status:'running', node:'pve-demo-02', cpu:0.02, maxcpu:2, mem:gib(0.8), maxmem:gib(2), disk:gib(5), maxdisk:gib(12), uptime:27*day, tags:'monitoring', netin:2100000, netout:1300000 },
    { type:'lxc', vmid:202, name:'vaultwarden', status:'running', node:'pve-demo-03', cpu:0.01, maxcpu:2, mem:gib(0.7), maxmem:gib(2), disk:gib(4), maxdisk:gib(12), uptime:19*day, tags:'security', netin:900000, netout:700000 },

    { type:'storage', storage:'local-lvm', node:'pve-demo-01', status:'available', disk:gib(620), maxdisk:tib(1), plugintype:'lvmthin', content:'images,rootdir' },
    { type:'storage', storage:'local-lvm', node:'pve-demo-02', status:'available', disk:gib(487), maxdisk:tib(1), plugintype:'lvmthin', content:'images,rootdir' },
    { type:'storage', storage:'local-lvm', node:'pve-demo-03', status:'available', disk:gib(352), maxdisk:gib(768), plugintype:'lvmthin', content:'images,rootdir' },
    { type:'storage', storage:'ISO', node:'pve-demo-01', status:'available', disk:gib(63), maxdisk:gib(250), plugintype:'dir', content:'iso,vztmpl' },
    { type:'storage', storage:'PBS-DEMO', node:'pve-demo-01', status:'available', disk:tib(2.15), maxdisk:tib(4), plugintype:'pbs', content:'backup' }
  ];
}

function demoTasks() {
  const now = Math.floor(Date.now() / 1000);
  return [
    { upid:'UPID:pve-demo-01:0001:demo:vzdump:100:demo@pve:', type:'vzdump', status:'OK', node:'pve-demo-01', user:'demo@pve', id:'100', starttime:now-3900, endtime:now-3600 },
    { upid:'UPID:pve-demo-02:0002:demo:vzdump:110:demo@pve:', type:'vzdump', status:'OK', node:'pve-demo-02', user:'demo@pve', id:'110', starttime:now-7500, endtime:now-7200 },
    { upid:'UPID:pve-demo-03:0003:demo:vzdump:120:demo@pve:', type:'vzdump', status:'OK', node:'pve-demo-03', user:'demo@pve', id:'120', starttime:now-11100, endtime:now-10800 },
    { upid:'UPID:pve-demo-01:0004:demo:qmstart:101:demo@pve:', type:'qmstart', status:'OK', node:'pve-demo-01', user:'demo@pve', id:'101', starttime:now-18500, endtime:now-18494 }
  ];
}

function demoBackupJobs() {
  return [{ id:'backup-daily', storage:'PBS-DEMO', schedule:'02:00', all:1, mode:'snapshot', enabled:1 }];
}

function demoRrd(node) {
  const now = Math.floor(Date.now() / 900) * 900;
  const nodeOffset = String(node || '').endsWith('02') ? 0.05 : (String(node || '').endsWith('03') ? 0.09 : 0);
  return Array.from({ length:96 }, function(_, idx) {
    const wave = (Math.sin(idx / 7) + 1) / 2;
    return {
      time: now - (95 - idx) * 900,
      cpu: Math.min(0.82, 0.12 + nodeOffset + wave * 0.24),
      memused: gib(22 + nodeOffset * 80 + wave * 16),
      memtotal: gib(64),
      netin: 1200000 + wave * 9000000,
      netout: 900000 + wave * 6200000
    };
  });
}

function demoStorageRrd(storage) {
  const now = Math.floor(Date.now() / 900) * 900;
  const total = String(storage || '').toUpperCase().includes('PBS') ? tib(4) : tib(1);
  return Array.from({ length:96 }, function(_, idx) {
    const wave = (Math.sin(idx / 13) + 1) / 2;
    return { time:now - (95 - idx) * 900, used:total * (0.42 + wave * 0.12), total:total };
  });
}

function demoBackupContent() {
  const now = Math.floor(Date.now() / 1000);
  const vmids = [100,101,110,120,130,200,201,202];
  const rows = [];
  vmids.forEach(function(vmid, index) {
    [0,1,2].forEach(function(days) {
      const kind = vmid < 200 ? 'qemu' : 'lxc';
      const day = String(18 - days).padStart(2, '0');
      rows.push({
        volid:'PBS-DEMO:backup/vzdump-' + kind + '-' + vmid + '-2026_09_' + day + '-02_00_00.vma.zst',
        vmid:vmid,
        content:'backup',
        size:gib(4 + index * 3),
        ctime:now - (days * 86400) - (index * 420),
        format:'vma.zst',
        notes:'Sauvegarde fictive de démonstration'
      });
    });
  });
  return rows;
}

function demoMachine(vmid, type) {
  return demoResources().find(function(row) {
    return row.type === type && Number(row.vmid) === Number(vmid);
  }) || null;
}

function demoProxmoxApi(server, apiPath, options) {
  options = options || {};
  const method = String(options.method || 'GET').toUpperCase();
  if (method !== 'GET') throw new Error('Mode démo en lecture seule.');

  const clean = String(apiPath || '');
  if (clean === '/version') return { version:'9.0.3', release:'9.0', repoid:'demo' };
  if (clean === '/cluster/resources') return demoResources();
  if (clean.startsWith('/cluster/tasks')) return demoTasks();
  if (clean === '/cluster/backup') return demoBackupJobs();
  if (clean === '/cluster/nextid') return 900;
  if (clean === '/cluster/status') {
    return [
      { type:'cluster', name:'PROXPANEL-DEMO', nodes:3, quorate:1 },
      { type:'node', name:'pve-demo-01', node:'pve-demo-01', online:1 },
      { type:'node', name:'pve-demo-02', node:'pve-demo-02', online:1 },
      { type:'node', name:'pve-demo-03', node:'pve-demo-03', online:1 }
    ];
  }

  let m = clean.match(/^\/nodes\/([^/]+)\/storage\/([^/?]+)\/rrddata/);
  if (m) return demoStorageRrd(decodeURIComponent(m[2]));
  m = clean.match(/^\/nodes\/([^/?]+)\/rrddata/);
  if (m) return demoRrd(decodeURIComponent(m[1]));

  m = clean.match(/^\/nodes\/([^/]+)\/storage\/([^/?]+)\/content/);
  if (m) {
    const storage = decodeURIComponent(m[2]);
    if (storage === 'PBS-DEMO') return demoBackupContent();
    if (storage === 'ISO') {
      return [
        { volid:'ISO:iso/debian-13.0.0-amd64-netinst.iso', content:'iso', size:gib(0.8), ctime:Math.floor(Date.now()/1000)-86400*9 },
        { volid:'ISO:vztmpl/debian-13-standard.tar.zst', content:'vztmpl', size:gib(0.18), ctime:Math.floor(Date.now()/1000)-86400*12 }
      ];
    }
    return [];
  }

  m = clean.match(/^\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)\/status\/current$/);
  if (m) {
    const row = demoMachine(m[3], m[2]);
    return row ? Object.assign({}, row) : {};
  }

  m = clean.match(/^\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)\/config$/);
  if (m) {
    const row = demoMachine(m[3], m[2]) || {};
    const sizeGiB = Math.max(8, Math.round(Number(row.maxdisk || gib(40)) / 1024 / 1024 / 1024));
    return {
      name:row.name || (m[2] + '-' + m[3]),
      hostname:row.name || (m[2] + '-' + m[3]),
      cores:Number(row.maxcpu || 2),
      memory:Math.max(1024, Math.round(Number(row.maxmem || gib(2)) / 1024 / 1024)),
      agent:m[2] === 'qemu' ? '1' : '',
      ostype:String(row.tags || '').includes('windows') ? 'win11' : 'l26',
      scsi0:'local-lvm:vm-' + m[3] + '-disk-0,size=' + sizeGiB + 'G',
      rootfs:m[2] === 'lxc' ? ('local-lvm:subvol-' + m[3] + '-disk-0,size=' + sizeGiB + 'G') : '',
      net0:'virtio=DE:AD:BE:EF:00:01,bridge=vmbr0',
      onboot:1
    };
  }

  m = clean.match(/^\/nodes\/([^/]+)\/qemu\/(\d+)\/agent\/get-fsinfo$/);
  if (m) {
    const row = demoMachine(m[2], 'qemu') || {};
    const total = Number(row.maxdisk || gib(40));
    const used = Math.min(total, Number(row.disk || total * 0.5));
    const windows = String(row.tags || '').includes('windows');
    return { result:[{ name:'system', mountpoint:windows ? 'C:\\' : '/', type:windows ? 'ntfs' : 'ext4', 'total-bytes':total, 'used-bytes':used }] };
  }

  m = clean.match(/^\/nodes\/([^/]+)\/qemu\/(\d+)\/agent\/network-get-interfaces$/);
  if (m) {
    return { result:[{ name:'eth0', 'ip-addresses':[{'ip-address':'10.20.30.' + (Number(m[2]) % 200 + 20), 'ip-address-type':'ipv4', prefix:24}] }] };
  }

  m = clean.match(/^\/nodes\/([^/]+)\/(qemu|lxc)\/(\d+)\/snapshot$/);
  if (m) return [{ name:'baseline', description:'Snapshot fictif', snaptime:Math.floor(Date.now()/1000)-86400*3 }];

  m = clean.match(/^\/nodes\/([^/?]+)\/status$/);
  if (m) {
    const nodeName = decodeURIComponent(m[1]);
    const row = demoResources().find(function(item) { return item.type === 'node' && item.node === nodeName; }) || {};
    return Object.assign({}, row, { kversion:'Linux 6.14.8-2-pve', pveversion:'pve-manager/9.0.3/demo', loadavg:['0.72','0.65','0.58'] });
  }

  m = clean.match(/^\/nodes\/([^/?]+)\/network$/);
  if (m) {
    return [
      { iface:'vmbr0', type:'bridge', active:1, address:'10.20.30.10', cidr:'10.20.30.10/24', gateway:'10.20.30.1', bridge_ports:'eno1' },
      { iface:'eno1', type:'eth', active:1 }
    ];
  }

  if (/\/disks\/list(?:\?|$)/.test(clean)) {
    return [
      { devpath:'/dev/sda', model:'DEMO NVMe 1TB', size:tib(1), health:'PASSED', wearout:3 },
      { devpath:'/dev/sdb', model:'DEMO SSD 2TB', size:tib(2), health:'PASSED', wearout:7 }
    ];
  }
  if (/\/apt\/update(?:\?|$)/.test(clean)) {
    return [{ Package:'pve-manager', Title:'Proxmox VE Manager', Version:'9.0.4', OldVersion:'9.0.3', Priority:'optional', Section:'admin' }];
  }
  if (/\/aplinfo(?:\?|$)/.test(clean)) {
    return [{ template:'local:vztmpl/debian-13-standard_13.0-1_amd64.tar.zst', type:'system', package:'debian-13-standard', version:'13.0-1' }];
  }
  if (/\/firewall\//.test(clean)) return [];
  if (/\/tasks\//.test(clean) && /\/log(?:\?|$)/.test(clean)) return [{ n:1, t:'Mode démo : journal fictif ProxPanel.' }];
  if (/\/tasks\//.test(clean) && /\/status(?:\?|$)/.test(clean)) return { status:'stopped', exitstatus:'OK' };

  return {};
}


function demoDockerContainers(endpointId=1) {
  const now=Math.floor(Date.now()/1000);
  const network=(name,ip)=>[{name,ip,gateway:'172.20.0.1',mac:''}];
  const port=(privatePort,publicPort=0,type='tcp')=>({ip:publicPort?'0.0.0.0':'',privatePort,publicPort,type});
  const rows1=[
    {id:'demo-npm',name:'nginx-proxy-manager',image:'jc21/nginx-proxy-manager:latest',created:now-86400*46,state:'running',status:'Up 46 days (healthy)',health:'healthy',stack:'edge',labels:{'com.docker.compose.project':'edge'},ports:[port(80,80),port(81,81),port(443,443)],networks:network('edge_default','172.20.0.2')},
    {id:'demo-portainer',name:'portainer',image:'portainer/portainer-ce:lts',created:now-86400*80,state:'running',status:'Up 28 days (healthy)',health:'healthy',stack:'management',labels:{'com.docker.compose.project':'management'},ports:[port(9443,9443),port(8000,8000)],networks:network('management_default','172.20.1.2')},
    {id:'demo-uptime',name:'uptime-kuma',image:'louislam/uptime-kuma:2',created:now-86400*65,state:'running',status:'Up 20 days (healthy)',health:'healthy',stack:'monitoring',labels:{'com.docker.compose.project':'monitoring'},ports:[port(3001,3001)],networks:network('monitoring_default','172.20.2.2')},
    {id:'demo-vaultwarden',name:'vaultwarden',image:'vaultwarden/server:latest',created:now-86400*52,state:'running',status:'Up 18 days (healthy)',health:'healthy',stack:'security',labels:{'com.docker.compose.project':'security'},ports:[port(80,8081)],networks:network('security_default','172.20.3.2')},
    {id:'demo-bookstack',name:'bookstack',image:'lscr.io/linuxserver/bookstack:latest',created:now-86400*32,state:'running',status:'Up 9 days (unhealthy)',health:'unhealthy',stack:'docs',labels:{'com.docker.compose.project':'docs'},ports:[port(80,6875)],networks:network('docs_default','172.20.4.2')},
    {id:'demo-mariadb',name:'bookstack-db',image:'mariadb:11',created:now-86400*32,state:'running',status:'Up 9 days (healthy)',health:'healthy',stack:'docs',labels:{'com.docker.compose.project':'docs'},ports:[port(3306)],networks:network('docs_default','172.20.4.3')},
    {id:'demo-whoami',name:'whoami-test',image:'traefik/whoami:latest',created:now-86400*4,state:'exited',status:'Exited (0) 2 days ago',health:'',stack:'lab',labels:{'com.docker.compose.project':'lab'},ports:[port(80,8099)],networks:network('lab_default','172.20.5.2')}
  ];
  const rows2=[
    {id:'demo-grafana',name:'grafana',image:'grafana/grafana:12.1.0',created:now-86400*58,state:'running',status:'Up 31 days (healthy)',health:'healthy',stack:'observability',labels:{'com.docker.compose.project':'observability'},ports:[port(3000,3000)],networks:network('observability_default','172.21.0.2')},
    {id:'demo-influx',name:'influxdb',image:'influxdb:2.7',created:now-86400*58,state:'running',status:'Up 31 days (healthy)',health:'healthy',stack:'observability',labels:{'com.docker.compose.project':'observability'},ports:[port(8086,8086)],networks:network('observability_default','172.21.0.3')},
    {id:'demo-n8n',name:'n8n',image:'n8nio/n8n:latest',created:now-86400*21,state:'running',status:'Up 12 days',health:'',stack:'automation',labels:{'com.docker.compose.project':'automation'},ports:[port(5678,5678)],networks:network('automation_default','172.21.1.2')},
    {id:'demo-wiki',name:'wikijs',image:'requarks/wiki:2',created:now-86400*73,state:'running',status:'Up 42 days (healthy)',health:'healthy',stack:'wiki',labels:{'com.docker.compose.project':'wiki'},ports:[port(3000,3002)],networks:network('wiki_default','172.21.2.2')},
    {id:'demo-minecraft',name:'minecraft-test',image:'itzg/minecraft-server:latest',created:now-86400*15,state:'exited',status:'Exited (0) 6 hours ago',health:'',stack:'lab-games',labels:{'com.docker.compose.project':'lab-games'},ports:[port(25565,25565)],networks:network('lab-games_default','172.21.3.2')}
  ];
  return Number(endpointId)===2?rows2:rows1;
}

function demoDockerStacks(endpointId=1) {
  const now=Math.floor(Date.now()/1000);
  const rows1=[
    {id:11,name:'edge',endpointId:1,status:1,active:true,createdBy:'demo',creationDate:now-86400*46,entryPoint:'docker-compose.yml',envNames:['TZ'],git:true,autoUpdate:true,additionalFiles:[]},
    {id:12,name:'monitoring',endpointId:1,status:1,active:true,createdBy:'demo',creationDate:now-86400*65,entryPoint:'compose.yml',envNames:['TZ'],git:false,autoUpdate:false,additionalFiles:[]},
    {id:13,name:'security',endpointId:1,status:1,active:true,createdBy:'demo',creationDate:now-86400*52,entryPoint:'compose.yml',envNames:['DOMAIN','TZ'],git:false,autoUpdate:false,additionalFiles:[]},
    {id:14,name:'docs',endpointId:1,status:1,active:true,createdBy:'demo',creationDate:now-86400*32,entryPoint:'docker-compose.yml',envNames:['APP_URL','DB_HOST','DB_DATABASE'],git:true,autoUpdate:false,additionalFiles:[]},
    {id:15,name:'lab',endpointId:1,status:2,active:false,createdBy:'demo',creationDate:now-86400*4,entryPoint:'compose.yml',envNames:[],git:false,autoUpdate:false,additionalFiles:[]}
  ];
  const rows2=[
    {id:21,name:'observability',endpointId:2,status:1,active:true,createdBy:'demo',creationDate:now-86400*58,entryPoint:'docker-compose.yml',envNames:['GF_SERVER_ROOT_URL','TZ'],git:true,autoUpdate:true,additionalFiles:[]},
    {id:22,name:'automation',endpointId:2,status:1,active:true,createdBy:'demo',creationDate:now-86400*21,entryPoint:'compose.yml',envNames:['N8N_HOST','TZ'],git:false,autoUpdate:false,additionalFiles:[]},
    {id:23,name:'wiki',endpointId:2,status:1,active:true,createdBy:'demo',creationDate:now-86400*73,entryPoint:'compose.yml',envNames:['DB_TYPE','DB_HOST'],git:false,autoUpdate:false,additionalFiles:[]},
    {id:24,name:'lab-games',endpointId:2,status:2,active:false,createdBy:'demo',creationDate:now-86400*15,entryPoint:'compose.yml',envNames:['EULA','TYPE'],git:false,autoUpdate:false,additionalFiles:[]}
  ];
  return Number(endpointId)===2?rows2:rows1;
}

function demoDockerSummary(containers=[]) {
  let running=0,stopped=0,healthy=0,unhealthy=0,restarting=0,paused=0;
  for(const c of containers){
    if(c.state==='running')running++;else stopped++;
    if(c.health==='healthy')healthy++;
    if(c.health==='unhealthy')unhealthy++;
    if(c.state==='restarting')restarting++;
    if(c.state==='paused')paused++;
  }
  return {total:containers.length,running,stopped,healthy,unhealthy,restarting,paused};
}

function demoDockerOverview() {
  const c1=demoDockerContainers(1),c2=demoDockerContainers(2),s1=demoDockerSummary(c1),s2=demoDockerSummary(c2);
  const environments=[
    {id:1,name:'DOCKER-PROD',url:'tcp://10.20.30.40:2375',type:1,portainerStatus:1,groupId:1,reachable:true,supported:true,kind:'docker-standalone',kindLabel:'Docker Standalone',dockerVersion:'28.3.3',hostName:'ITL-DCK-PROD01',os:'Debian GNU/Linux 13',architecture:'x86_64',cpus:8,memoryTotal:gib(16),containers:s1,error:''},
    {id:2,name:'DOCKER-LAB',url:'tcp://10.20.30.41:2375',type:1,portainerStatus:1,groupId:1,reachable:true,supported:true,kind:'docker-standalone',kindLabel:'Docker Standalone',dockerVersion:'28.3.3',hostName:'ITL-DCK-LAB01',os:'Debian GNU/Linux 13',architecture:'x86_64',cpus:6,memoryTotal:gib(12),containers:s2,error:''}
  ];
  const totals=demoDockerSummary([...c1,...c2]);
  return {
    configured:true,
    portainers:[{
      id:'demo-portainer',name:'Portainer CE · Démo',url:'https://portainer.demo.local',type:'portainer',
      status:'online',error:'',version:'2.27.1',edition:'Community Edition',
      environmentCount:2,reachableCount:2,supportedDockerCount:2,containers:totals,environments
    }],
    summary:{portainers:1,environments:2,reachable:2,supported:2,containers:totals.total,running:totals.running,stopped:totals.stopped,unhealthy:totals.unhealthy}
  };
}

function demoDockerContainerDetails(endpointId,containerId) {
  const row=demoDockerContainers(endpointId).find(c=>c.id===String(containerId));
  if(!row)return null;
  const running=row.state==='running';
  const cpuMap={'demo-npm':1.8,'demo-portainer':0.7,'demo-uptime':2.4,'demo-vaultwarden':0.9,'demo-bookstack':4.8,'demo-mariadb':1.6,'demo-grafana':3.2,'demo-influx':2.7,'demo-n8n':5.1,'demo-wiki':1.3};
  const memMap={'demo-npm':420,'demo-portainer':180,'demo-uptime':310,'demo-vaultwarden':95,'demo-bookstack':640,'demo-mariadb':520,'demo-grafana':390,'demo-influx':730,'demo-n8n':510,'demo-wiki':460};
  const memMiB=memMap[row.id]||128,limitMiB=row.id==='demo-influx'?2048:1024;
  return {
    inspect:{
      Id:row.id,Name:'/'+row.name,Created:new Date(row.created*1000).toISOString(),
      Path:'/entrypoint.sh',Args:[],State:{Status:row.state,Running:running,Paused:row.state==='paused',Restarting:row.state==='restarting',ExitCode:running?0:0,Health:row.health?{Status:row.health}:undefined},
      Image:row.image,RestartCount:row.id==='demo-bookstack'?3:0,
      Config:{Image:row.image,Labels:row.labels,Env:['TZ=[redacted]','DEMO_SECRET=[redacted]']},
      NetworkSettings:{Networks:Object.fromEntries((row.networks||[]).map(n=>[n.name,{IPAddress:n.ip,Gateway:n.gateway,MacAddress:n.mac}]))},
      HostConfig:{RestartPolicy:{Name:'unless-stopped'}}
    },
    stats:running?{cpuPct:cpuMap[row.id]||1.1,memoryUsed:memMiB*1024*1024,memoryLimit:limitMiB*1024*1024,memoryPct:Number((memMiB/limitMiB*100).toFixed(1))}:null
  };
}

function demoDockerLogs(endpointId,containerId,tail=300) {
  const row=demoDockerContainers(endpointId).find(c=>c.id===String(containerId));
  if(!row)return '';
  const ts=new Date().toISOString();
  const lines=[
    `${ts} [info] ${row.name} started in ProxPanel public demo mode`,
    `${ts} [info] image=${row.image} state=${row.state}`,
    `${ts} [info] health=${row.health||'not-configured'} network=${row.networks?.[0]?.name||'bridge'}`
  ];
  if(row.health==='unhealthy')lines.push(`${ts} [warn] simulated healthcheck failure: HTTP 503 on /health`);
  lines.push(`${ts} [info] These logs are fictitious and contain no production data.`);
  return lines.slice(-Math.max(1,Math.min(Number(tail)||300,300))).join('\n');
}

function demoTemperatureForNode(node) {
  const values = { 'pve-demo-01':51.4, 'pve-demo-02':47.8, 'pve-demo-03':54.2 };
  return Object.prototype.hasOwnProperty.call(values, String(node)) ? values[String(node)] : 49.5;
}

module.exports = {
  DEMO_MODE,
  DEMO_USERNAME,
  DEMO_PASSWORD,
  DEMO_EMAIL,
  demoProxmoxApi,
  demoTemperatureForNode,
  demoDockerOverview,
  demoDockerContainers,
  demoDockerStacks,
  demoDockerContainerDetails,
  demoDockerLogs
};
