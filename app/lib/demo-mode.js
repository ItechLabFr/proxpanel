
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
  demoTemperatureForNode
};
