export interface Env { STORE: KVNamespace; DB: D1Database; SERVICE_NAME: string; VERSION: string; }
const SVC = "roadside";
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d,null,2),{status:s,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","X-BlackRoad-Service":SVC}}); }
async function track(env: Env, req: Request, path: string) { const cf=(req as any).cf||{}; env.DB.prepare("INSERT INTO analytics(subdomain,path,country,ua,ts)VALUES(?,?,?,?,?)").bind(SVC,path,cf.country||"",req.headers.get("User-Agent")?.slice(0,150)||"",Date.now()).run().catch(()=>{}); }

const SERVICES=["roadtrip","roadie","roadview","backroad","roadcode","roadwork","carkeys","roadchain","roadcoin","roadbook","roadworld","officeroad","carpool","oneway","roadside","blackboard","highway","os","kpi","pulse","codex","oracle","signals","math","stream","telemetry","recap","roadlog","velocity","cdn"];

async function getPulseData(env: Env) {
  const snap=await env.DB.prepare("SELECT services_healthy,services_total,services_down,avg_uptime FROM pulse_snapshots ORDER BY ts DESC LIMIT 1").first().catch(()=>null);
  const incidents=await env.DB.prepare("SELECT services_down,ts FROM pulse_snapshots WHERE services_down!='[]' AND ts>(strftime('%s','now')-86400)*1000 ORDER BY ts DESC LIMIT 10").all().catch(()=>({results:[]}));
  return {snap,incidents:incidents.results};
}

function page(pulse: any): Response {
  const snap=pulse.snap as any;
  const down=snap?JSON.parse(snap.services_down||'[]'):[];
  const up=snap?snap.services_healthy:0;
  const total=snap?snap.services_total:SERVICES.length;
  const uptime=snap?.avg_uptime?.toFixed(1)||'--';
  const status=down.length===0?'all_green':down.length<=3?'mostly_up':'degraded';

  const html=`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RoadSide — Platform Status</title>
<meta name="description" content="Live platform status, incident tracking, and service health for BlackRoad OS.">
<link rel="canonical" href="https://roadside.blackroad.io/">
<meta property="og:title" content="RoadSide — Platform Status">
<meta property="og:description" content="Live platform status, incident tracking, and service health for BlackRoad OS.">
<meta property="og:url" content="https://roadside.blackroad.io/">
<meta property="og:type" content="website">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication","name":"RoadSide","url":"https://roadside.blackroad.io/","description":"Live platform status, incident tracking, and service health for BlackRoad OS.","applicationCategory":"WebApplication","publisher":{"@type":"Organization","name":"BlackRoad OS, Inc.","url":"https://blackroad.io"}}</script>
<meta http-equiv="refresh" content="60">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#030303;--card:#0a0a0a;--border:#111;--text:#f0f0f0;--sub:#444;--green:#00E676;--red:#FF2255;--yellow:#FF6B2B;--grad:linear-gradient(135deg,#00E676,#3E84FF)}
html,body{min-height:100vh;background:var(--bg);color:var(--text);font-family:'Space Grotesk',sans-serif}
.grad-bar{height:2px;background:var(--grad)}
.wrap{max-width:900px;margin:0 auto;padding:32px 20px}
h1{font-size:2rem;font-weight:700;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.sub{font-size:.75rem;color:var(--sub);font-family:'JetBrains Mono',monospace;margin-bottom:24px}
.status-hero{background:var(--card);border:1px solid ${status==='all_green'?'rgba(0,230,118,.2)':status==='mostly_up'?'rgba(245,166,35,.2)':'rgba(255,34,85,.2)'};border-radius:12px;padding:24px;margin-bottom:20px;text-align:center}
.status-indicator{font-size:1.4rem;font-weight:700;color:${status==='all_green'?'var(--green)':status==='mostly_up'?'var(--yellow)':'var(--red)'};margin-bottom:4px}
.status-sub{font-size:.78rem;color:var(--sub);font-family:'JetBrains Mono',monospace}
.stats{display:flex;gap:12px;margin-bottom:20px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px;flex:1;text-align:center}
.stat-n{font-size:1.6rem;font-weight:700}
.stat-l{font-size:.65rem;color:var(--sub);font-family:'JetBrains Mono',monospace;margin-top:3px}
.ct{font-size:.65rem;color:var(--sub);text-transform:uppercase;letter-spacing:.08em;font-family:'JetBrains Mono',monospace;margin-bottom:12px}
.svc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:5px;margin-bottom:20px}
.svc{display:flex;align-items:center;gap:7px;padding:7px 10px;background:var(--card);border:1px solid var(--border);border-radius:6px;font-size:.72rem;font-family:'JetBrains Mono',monospace}
.svc-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.incident{background:rgba(255,34,85,.06);border:1px solid rgba(255,34,85,.15);border-radius:8px;padding:12px;margin-bottom:6px;font-size:.78rem}
.inc-services{color:var(--red);font-weight:600;margin-bottom:3px}
.inc-ts{font-size:.65rem;font-family:'JetBrains Mono',monospace;color:var(--sub)}
.ticket-form{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-top:20px}
input,textarea,select{width:100%;padding:9px 12px;background:#0d0d0d;border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Space Grotesk',sans-serif;font-size:.82rem;outline:none;margin-bottom:8px}
input:focus,textarea:focus{border-color:var(--green)}
.btn{padding:9px 20px;background:var(--green);color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:.82rem}
</style></head><body>
<div class="grad-bar"></div>
<div class="wrap">
<h1>RoadSide</h1>
<div class="sub">roadside.blackroad.io · platform status · incident tracker · auto-refresh 60s</div>
<div class="status-hero">
  <div class="status-indicator">${status==='all_green'?'All Systems Operational':status==='mostly_up'?'Partial Degradation':'System Degradation'}</div>
  <div class="status-sub">${up}/${total} services up · ${uptime}% uptime · last check: ${new Date().toLocaleTimeString()}</div>
</div>
<div class="stats">
  <div class="stat"><div class="stat-n" style="color:var(--green)">${up}</div><div class="stat-l">up</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--red)">${down.length}</div><div class="stat-l">down</div></div>
  <div class="stat"><div class="stat-n" style="color:var(--yellow)">${uptime}%</div><div class="stat-l">uptime</div></div>
  <div class="stat"><div class="stat-n">${pulse.incidents.length}</div><div class="stat-l">incidents (24h)</div></div>
</div>
<div class="ct">Service Status</div>
<div class="svc-grid">
${SERVICES.map(s=>{const isDown=down.includes(s);return`<div class="svc"><div class="svc-dot" style="background:${isDown?'var(--red)':'var(--green)'}"></div>${s}</div>`;}).join("")}
</div>
${pulse.incidents.length?`<div class="ct">Recent Incidents (24h)</div>${(pulse.incidents as any[]).map(i=>`<div class="incident"><div class="inc-services">⚠ ${JSON.parse(i.services_down||'[]').join(', ')}</div><div class="inc-ts">${new Date(i.ts).toLocaleString()}</div></div>`).join('')}`:''}
<div class="ticket-form">
  <div class="ct">Report an Issue</div>
  <input type="text" id="t-title" placeholder="Short description">
  <select id="t-svc">${SERVICES.map(s=>`<option>${s}</option>`).join('')}</select>
  <textarea id="t-body" placeholder="Details, steps to reproduce, what you expected..."></textarea>
  <button class="btn" onclick="submit()">Submit Ticket</button>
  <span id="t-status" style="font-size:.75rem;color:var(--sub);margin-left:12px"></span>
</div>
</div>
<script src="https://cdn.blackroad.io/br.js"></script>
<script>
async function submit(){
  var title=document.getElementById('t-title').value.trim();
  var svc=document.getElementById('t-svc').value;
  var body=document.getElementById('t-body').value.trim();
  if(!title)return;
  var r=await fetch('/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,service:svc,body})});
  var d=await r.json();
  if(d.ok){document.getElementById('t-status').textContent='✓ Ticket submitted #'+d.id.slice(0,8);document.getElementById('t-title').value='';document.getElementById('t-body').value='';}
}
</script>
</body></html>`;
  return new Response(html,{headers:{"Content-Type":"text/html;charset=UTF-8"}});
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*"}});
    const url=new URL(req.url);const path=url.pathname;
    track(env,req,path);
    if(path==="/health")return json({service:SVC,status:"ok",version:env.VERSION,ts:Date.now()});
    if(path==="/api/status"){
      const pulse=await getPulseData(env);
      return json({...pulse,ts:Date.now()});
    }
    if(path==="/api/tickets"&&req.method==="POST"){
      const b=await req.json() as any;
      const id=crypto.randomUUID();
      await env.STORE.put(`ticket:${id}`,JSON.stringify({id,title:b.title,service:b.service,body:b.body,status:"open",ts:Date.now()}));
      return json({ok:true,id});
    }
    if(path==="/api/tickets"&&req.method==="GET"){
      const list=await env.STORE.list({prefix:"ticket:"});
      const tickets=await Promise.all(list.keys.map(async k=>{const v=await env.STORE.get(k.name);return v?JSON.parse(v):null;}));
      return json({tickets:tickets.filter(Boolean).sort((a:any,b:any)=>b.ts-a.ts)});
    }
    const pulse=await getPulseData(env);
    return page(pulse);
  }
};
