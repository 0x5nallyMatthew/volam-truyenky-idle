"use strict";
/**
 * Võ Lâm Idle - Trang quản trị (GM Panel) phía server
 *
 * Truy cập: http://localhost:8080/gm?token=<GM_TOKEN>
 * Trang này tự chứa (không phụ thuộc file ngoài) để có thể deploy riêng.
 */

const cfg = require("./config");

function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HTML = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Võ Lâm Idle - Bảng Điều Khiển Quản Trị</title>
<style>
  :root{ --gold:#c8a45a; --bg:#0b0f12; --card:#131a20; --line:#24313b; --txt:#dbe4ec; --dim:#8ba0b3; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:"Segoe UI",Roboto,system-ui,sans-serif;font-size:14px}
  header{padding:16px 22px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#141c23,#0d1318);display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  header h1{margin:0;font-size:19px;color:var(--gold);letter-spacing:.5px}
  header .tag{color:var(--dim);font-size:12px}
  main{padding:18px 22px;max-width:1180px;margin:0 auto}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-bottom:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
  .card h2{margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);font-weight:600}
  .kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dashed #1e2933}
  .kv:last-child{border-bottom:none}
  .kv b{color:#fff;font-weight:600}
  .ok{color:#4ade80}.bad{color:#f87171}.warn{color:#fbbf24}
  button{background:var(--gold);color:#12171b;border:none;border-radius:5px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:14px}
  button:hover{filter:brightness(1.08)}
  button.ghost{background:#1d2830;color:var(--txt);border:1px solid var(--line);font-weight:500}
  input,textarea{width:100%;background:#0e141a;border:1px solid var(--line);color:var(--txt);border-radius:5px;padding:9px 11px;font-family:inherit;font-size:14px}
  textarea{min-height:78px;resize:vertical}
  label{display:block;margin:10px 0 5px;color:var(--dim);font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{padding:7px 9px;border-bottom:1px solid #1b242c;text-align:left}
  th{color:var(--dim);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  #toast{position:fixed;right:18px;bottom:18px;background:#182129;border:1px solid var(--line);border-left:3px solid var(--gold);padding:11px 15px;border-radius:5px;display:none;max-width:380px}
  #toast.on{display:block}
  code{background:#0e141a;border:1px solid var(--line);border-radius:3px;padding:1px 5px;color:#9fd3ff}
</style>
</head>
<body>
<header>
  <h1>⚔️ VÕ LÂM IDLE - BẢNG ĐIỀU KHIỂN QUẢN TRỊ</h1>
  <span class="tag" id="hTag">Máy chủ v1.0.0</span>
  <span class="tag" style="margin-left:auto"><a href="/play.html" style="color:#c8a45a">← Về game</a></span>
</header>
<main>
  <div class="grid">
    <div class="card">
      <h2>Trạng thái máy chủ</h2>
      <div class="kv"><span>Cổng / phiên bản</span><b id="sVer">-</b></div>
      <div class="kv"><span>Supabase</span><b id="sDb">-</b></div>
      <div class="kv"><span>Thời gian phản hồi</span><b id="sPing">-</b></div>
      <div class="kv"><span>Bảng thiếu</span><b id="sMissing">-</b></div>
    </div>
    <div class="card">
      <h2>Người chơi</h2>
      <div class="kv"><span>Tài khoản</span><b id="cUsers">-</b></div>
      <div class="kv"><span>Bản lưu trên Cloud</span><b id="cSaves">-</b></div>
      <div class="kv"><span>Nhân vật xếp hạng</span><b id="cRanks">-</b></div>
      <div class="kv"><span>Đang online</span><b id="cOnline">-</b></div>
    </div>
    <div class="card">
      <h2>Cấu hình toàn server</h2>
      <label>Tỷ lệ EXP toàn server (xp_rate)</label>
      <input id="expRate" type="number" step="0.1" min="0" value="1">
      <label>Thông báo GM hiển thị cho người chơi</label>
      <textarea id="notice" placeholder="Nội dung thông báo..."></textarea>
      <div class="row" style="margin-top:10px">
        <button onclick="saveSettings()">💾 Lưu cấu hình</button>
        <button class="ghost" onclick="loadAll()">🔄 Tải lại</button>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Nhân vật đang hoạt động gần đây</h2>
    <div class="row" style="margin-bottom:10px">
      <button class="ghost" onclick="loadPlayers()">🔄 Làm mới danh sách</button>
    </div>
    <div style="max-height:380px;overflow:auto">
      <table id="tblPlayers">
        <thead><tr><th>Tên</th><th>Phái</th><th>Cấp</th><th>Chủ sở hữu</th><th>Cập nhật</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</main>
<div id="toast"></div>
<script>
const TOKEN = new URLSearchParams(location.search).get("token") || "";
const $ = s => document.querySelector(s);
let toastT = null;
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove("on"), 3200);
}
async function api(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({"Content-Type":"application/json","x-gm-token":TOKEN}, opts.headers||{});
  if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
  const res = await fetch(path, opts);
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(json.msg || json.error || ("HTTP " + res.status));
  return json;
}
async function loadHealth(){
  const t0 = Date.now();
  try{
    const h = await api("/api/health");
    $("#sPing").textContent = (Date.now()-t0) + " ms";
    $("#sDb").innerHTML = h.db === "up"
      ? '<span class="ok">Đang kết nối</span>'
      : '<span class="bad">' + esc(h.db||"lỗi") + '</span>';
    const missing = Object.keys(h.tables||{}).filter(k => h.tables[k] === false);
    $("#sMissing").innerHTML = missing.length ? '<span class="warn">'+esc(missing.join(", "))+'</span>' : '<span class="ok">Đủ</span>';
    if (h.error) toast("⚠️ " + h.error);
  }catch(e){ $("#sDb").innerHTML = '<span class="bad">Lỗi</span>'; toast("Lỗi kiểm tra: " + e.message); }
}
async function loadStats(){
  try{
    const s = await api("/api/gm/stats");
    $("#cUsers").textContent = s.counts.users ?? "-";
    $("#cSaves").textContent = s.counts.saves ?? "-";
    $("#cRanks").textContent = s.counts.rankings ?? "-";
  }catch(e){ toast("Lỗi thống kê: " + e.message); }
  try{
    const o = await api("/api/online");
    $("#cOnline").textContent = o.count + " người";
  }catch(e){ $("#cOnline").textContent = "-"; }
}
async function loadSettings(){
  try{
    const s = await api("/api/server/settings");
    $("#expRate").value = s.exp_rate ?? 1;
    $("#notice").value = s.notice ?? "";
  }catch(e){ toast("Lỗi tải cấu hình: " + e.message); }
}
async function saveSettings(){
  try{
    await api("/api/gm/settings", {method:"POST", body:{exp_rate:Number($("#expRate").value)||1, notice:$("#notice").value}});
    toast("✅ Đã lưu cấu hình toàn server");
  }catch(e){ toast("❌ " + e.message); }
}
async function loadPlayers(){
  try{
    const p = await api("/api/gm/players");
    const tb = $("#tblPlayers tbody");
    tb.innerHTML = "";
    const list = (p.players||[]).slice(0,200);
    if (!list.length){ tb.innerHTML = '<tr><td colspan="5" style="color:#8ba0b3">Chưa có dữ liệu người chơi</td></tr>'; return; }
    for (const r of list){
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>"+esc(r.name||"-")+"</td><td>"+esc(r.fac||"-")+"</td><td>"+(r.lvl??0)+"</td><td>"+esc(r.owner||"-")+"</td><td>"+esc(r.updated||"-")+"</td>";
      tb.appendChild(tr);
    }
  }catch(e){ toast("Lỗi tải danh sách: " + e.message); }
}
function loadAll(){ loadHealth(); loadStats(); loadSettings(); loadPlayers(); }
loadAll();
setInterval(loadHealth, 15000);
setInterval(loadStats, 30000);
setInterval(loadPlayers, 20000);
</script>
</body>
</html>
`;

function handle(req, res, url) {
  if (url.pathname !== "/gm" && url.pathname !== "/gm/") return false;
  const token = url.searchParams.get("token") || "";
  if (cfg.gmToken && token !== cfg.gmToken) {
    const body = "<!doctype html><meta charset='utf-8'><body style='font-family:sans-serif;background:#0b0f12;color:#f87171;padding:40px'><h2>⛔ Mã quản trị không hợp lệ</h2><p style='color:#8ba0b3'>Kiểm tra lại GM_TOKEN trong server/config.json.</p></body>";
    res.writeHead(403, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
    return true;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(HTML);
  return true;
}

module.exports = { handle };
