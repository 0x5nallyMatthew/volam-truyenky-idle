"use strict";
/* =============================================================
 *  VÕ LÂM IDLE — LỆNH TRONG CHAT (GM / QTV)
 * =============================================================
 *  Gõ TRONG khung chat (kênh nào cũng được) hoặc bấm phím "/" ở
 *  ngoài ô nhập để bấm nhanh — lệnh được xử lý NGAY tại máy này,
 *  KHÔNG được gửi lên kênh chat chung (không spam, không để lộ).
 *
 *  LÆNH HỖ TRỢ:
 *    /level120            → lên cấp 120 (mặc định 120)
 *    /level <N>           → lên/về cấp N (tự +tiềm năng & điểm kỹ năng)
 *    /item-<d>_<k> [số]   → nhận đồ theo mã (vd /item-10_33 = Bạch Hổ)
 *    /item-<tên> [số]     → tìm đồ theo tên (vd /item-bạch hổ)
 *    /item-<khóa KTC> [s] → KVã Trân Các (vlmt, ttk, rngua, bk150…)
 *    /items [từ khóa]     → mở bảng chọn đồ theo cấp hiện tại
 *    /help-commands       → hướng dẫn (gõ /help cũng được)
 *
 *  QUYỀN: chỉ QTV (tên trong ADMIN_NAMES) hoặc máy đã nhập mã GM
 *  (gm_token / hàm openGmAccessModal), hoặc bản chơi offline.
 *  Phần thưởng chỉ tác động lên SAVE của mình rồi save() như luồng
 *  game bình thường — không nhảy tới nhân vật của người chơi khác.
 * ============================================================= */

function cmdFold(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9_]+/g, "");
}

function cmdAuthed() {
  try { if (localStorage.getItem("gm_token")) return true; } catch {}
  try {
    if (typeof isAdminName === "function" && typeof chatName === "function" && isAdminName(chatName())) return true;
  } catch {}
  try { if (typeof netOn === "function" && !netOn()) return true; } catch {}
  return false;
}

/* ---------- cấp độ ---------- */
function cmdSetLevel(n) {
  if (!S || !S.fac) { toast("Chưa có nhân vật"); return; }
  const cap = (typeof MAX_LEVEL === "number" ? MAX_LEVEL : 200);
  n = Math.max(1, Math.min(cap, Math.round(+n || 120)));
  if (n === S.lvl) { toast("Nhân vật đang ở cấp " + n); return; }
  const up = n > S.lvl, d0 = Math.abs(n - S.lvl);
  S.lvl = n;
  S.xp = 0;
  if (up) {
    // giống luồng lên cấp chuẩn của combat.js: +tiềm năng và +điểm kỹ năng
    S.attrPts = (S.attrPts || 0) + d0 * PTS_PER_LEVEL;
    S.skPts = (S.skPts || 0) + d0 * SKILL_PTS_PER_LEVEL;
    R.dirty = true;
    if (typeof uiSfx === "function") uiSfx("levelup");
    if (typeof onLevelUp === "function") onLevelUp();
  }
  log(up
    ? `⚡ Lệnh /level: nhân vật <b>lên cấp ${S.lvl}</b>! +${d0 * PTS_PER_LEVEL} tiềm năng, +${d0 * SKILL_PTS_PER_LEVEL} điểm kỹ năng`
    : `⚡ Lệnh /level: nhân vật về cấp <b>${S.lvl}</b>`);
  toast("Nhân vật cấp " + S.lvl + (up ? " · +" + (d0 * PTS_PER_LEVEL) + " tiềm năng" : ""));
  if (typeof recalc === "function") recalc();
  if (typeof titleCheck === "function") titleCheck();
  save();
  if (typeof refresh === "function") refresh();
  cmdSync();
}

/* ---------- tìm & cấp đồ ---------- */
function cmdRowLvl() { return Math.max(1, Math.min(10, Math.round((S && S.lvl || 1) / 10) || 1)); }

function cmdFindItem(q) {
  q = cmdFold(q);
  if (!q) return null;
  let best = null;
  for (const dKey in (J && J.items || {})) {
    const g = J.items[dKey]; if (!g || !g.list) continue;
    for (const r of g.list) {
      if (!r || !r.n) continue;
      const f = cmdFold(r.n), d = +dKey, k = +r.k;
      let score = 0;
      if (f === q) score = 100; else if (f.indexOf(q) === 0) score = 80; else if (f.indexOf(q) >= 0) score = 60;
      if (!score) continue;
      if (d === 10) score += 5;                       // ưu tiên ngựa khi trùng tên?
      if (!best || score > best.score) best = { d, k, n: r.n, score };
    }
  }
  return best;
}

function cmdGiveRaw(d, k, q) {
  let given = 0;
  for (let i = 0; i < q; i++) {
    const it = makeItem(d, k, cmdRowLvl(), 0, d <= 9 ? heroSeries() : undefined);
    if (!it) break;
    if (d === 10 && typeof horseFixReq === "function") horseFixReq(it);
    if (addItem(it, true, true, true)) given++;
  }
  return given;
}

function cmdItemGive(body) {
  if (!S || !S.fac) { toast("Chưa có nhân vật"); return true; }
  // tách số lượng ở cuối: "/item-0_10 3"
  let code = String(body || "").trim(), q = 1;
  const m = /^(.+?)[\s]+(\d{1,3})$/.exec(code);
  if (m) { code = m[1].trim(); q = Math.max(1, Math.min(99, +m[2])); }
  if (!code) { cmdHelp(); return true; }

  // 1) mã chuẩn <d>_<k>
  const mk = /^(\d{1,2})_(\d{1,4})$/.exec(code);
  if (mk) {
    const d = +mk[1], k = +mk[2];
    if (!(J && J.items && J.items[d])) { toast("Mã đồ " + code + " không hợp lệ"); return true; }
    const given = cmdGiveRaw(d, k, q);
    if (!given) { toast("Không tạo được đồ " + code + " (bậc cấp hiện tại không có?)"); return true; }
    cmdAfterGive(`Đã nhận ${given} ${cmdNameOf(d, k) || "[" + code + "]"}`);
    return true;
  }

  // 2) khóa Kỳ Trân Các (vlmt, ttk, rngua, bk90, bk150, ldt…)
  const kc = (typeof KTC !== "undefined" && KTC.find(x => x.k === code)) || null;
  if (kc) {
    const ok = typeof ktcItemAdd === "function" ? ktcItemAdd(kc.k, q) : false;
    if (!ok) { toast("Hành trang đầy"); return true; }
    invDirty = true; R.dirty = true; save();
    log(`🎁 Lệnh /item: <span style="color:${RAR_COL[kc.r || 0]}">${esc(kc.n)}</span> ×${q}`);
    toast("Đã nhận " + kc.n + " ×" + q);
    if (typeof refresh === "function") refresh();
    cmdSync();
    return true;
  }

  // 3) tên đồ (bỏ dấu để gõ nhanh)
  const hit = cmdFindItem(code);
  if (!hit) { toast("Không tìm thấy đồ: " + code + " — /items để chọn từ bảng"); return true; }
  const given = cmdGiveRaw(hit.d, hit.k, q);
  if (!given) { toast("Không tạo được đồ này"); return true; }
  cmdAfterGive(`Đã nhận ${given} ${hit.n}`);
  return true;
}

function cmdNameOf(d, k) {
  try {
    const g = J.items[d], r = g && g.list.find(x => +x.k === +k);
    return r && r.n;
  } catch { return null; }
}

function cmdAfterGive(text) {
  invDirty = true; R.dirty = true; save();
  log(`🎁 Lệnh /item: ${esc(text)}`);
  toast(text);
  if (typeof refresh === "function") refresh();
  cmdSync();
}

/* ---------- bảng chọn đồ (/items) ---------- */
function cmdPicker(q0) {
  if (!S || !S.fac) { toast("Chưa có nhân vật"); return; }
  const tier = cmdRowLvl(), fold = cmdFold(q0), rows = [];
  for (const dKey in (J && J.items || {})) {
    const g = J.items[dKey]; if (!g || !g.list) continue;
    for (const r of g.list) {
      if (!r || !r.n) continue;
      if (r.lvl != null && r.lvl > tier) continue;
      if (fold && cmdFold(r.n).indexOf(fold) < 0) continue;
      rows.push({ d: +dKey, k: +r.k, n: r.n, lvl: r.lvl, ic: r.ic || "" });
    }
  }
  rows.sort((a, b) => (a.d - b.d) || (a.n.localeCompare(b.n, "vi")));
  const max = 500;
  const list = rows.slice(0, max).map(r =>
    `<button class="btn sm" data-cmdgive="${r.d}_${r.k}" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;text-align:left">
       ${r.ic ? `<img src="${esc(r.ic)}" style="width:22px;height:22px;object-fit:contain">` : `<span style="width:22px"></span>`}
       <b style="flex:1">${esc(r.n)}</b><small class="dim">${r.d}_${r.k}</small>
     </button>`).join("");
  modal(`<h3>🎁 Bảng chọn đồ — bậc ${tier} (cấp ${S.lvl}) <small>${rows.length > max ? "*" + max + "/" + rows.length + " dòng" : rows.length + " món"}</small></h3>
    <div class="row" style="margin-bottom:10px"><input id="cmdQ" placeholder="Lọc theo tên (vd: kiếm, bạch hổ…)" value="${esc(q0 || "")}" style="width:100%"></div>
    <div style="max-height:52vh;overflow:auto">${list || '<p class="dim">Không tìm thấy món nào</p>'}</div>
    <p class="small dim">Bấm để nhận vào Hành trang (lệnh này chỉ tác động lên nhân vật của bạn).</p>`,
    () => {
      document.querySelectorAll("#mBody [data-cmdgive]").forEach(b => {
        b.onclick = () => { const [d, k] = b.dataset.cmdgive.split("_"); const g = cmdGiveRaw(+d, +k, 1); if (g) cmdAfterGive(`Đã nhận 1 ${cmdNameOf(+d, +k) || b.dataset.cmdgive}`); };
      });
      const i = document.getElementById("cmdQ");
      if (i) i.oninput = () => cmdRefreshPickerDeb(i.value);
    });
}
let __cmdPickT;
function cmdRefreshPickerDeb(q) {
  clearTimeout(__cmdPickT);
  __cmdPickT = setTimeout(() => cmdPicker(q), 250);
}

/* ---------- hướng dẫn ---------- */
function cmdHelp() {
  modal(`<h3>⌘ Lệnh trong chat</h3>
  <p class="desc">Lệnh chạy NGAY tại máy bạn, không gửi lên kênh chat. Gõ ở khung chat bất cứ kênh nào, hoặc bấm phím <b>/</b> để mở thanh lệnh nhanh.</p>
  <table style="width:100%;font-size:13px;line-height:2">
    <tr><td><b>/level120</b></td><td>lên cấp 120 (có thể <b>/level N</b> để chỉ cấp khác)</td></tr>
    <tr><td><b>/item-10_33</b></td><td>thần thú Bạch Hổ (mã ngựa dạng <i>d</i>_<i>k</i>:</td></tr>
    <tr><td><b>/item-bạch hổ</b></td><td>theo tên (không dấu vẫn tìm được)</td></tr>
    <tr><td><b>/item-vlmt 2</b></td><td>Võ Lâm Mật Tịch ×2 (khóa Kỳ Trân Các: vlmt, ttk, rngua, bk90, bk150, ldt…)</td></tr>
    <tr><td><b>/items</b></td><td>bảng chọn đồ theo cấp hiện tại, có ô lọc</td></tr>
    <tr><td><b>/help-commands</b></td><td>hướng dẫn này</td></tr>
  </table>
  <p class="small dim">Số lượng: ghi cuối lệnh, ví dụ <b>/item-0_6 3</b> = 3 món. Điểm sau lệnh cấp: +5 tiềm năng / +1 điểm kỹ năng trên mỗi cấp (giống đánh quái lên cấp thật).</p>`);
}

/* bộ nhận & điều phối — tên chatCmdRun được js/chat.js gọi (alias cmdRun) */
function chatCmdRun(t){ return cmdRun(t); }
function cmdRun(t) {
  t = String(t || "").trim().replace(/^／/, "/");
  if (!t || t[0] !== "/") return false;
  const inp = document.getElementById("chatTxt");
  if (inp) inp.value = "";
  const body = t.slice(1).trim();

  let m;
  if ((m = /^(help-commands|lenh|help-commands)\b/i.exec(body))) { cmdHelp(); return true; }
  if (/^gm\b/i.test(body)) {
    if (typeof openGmAccessModal === "function") openGmAccessModal();
    else toast("Máy chủ này không có trang quản trị");
    return true;
  }
  if ((m = /^items(?:\s+([\s\S]+))?$/.exec(body))) {
    if (!cmdAuthed()) { cmdDeny(); return true; }
    cmdPicker((m[1] || "").trim());
    return true;
  }
  if ((m = /^(?:level|cap)\s*[-_ ]?\s*([0-9]{0,3})\s*$/i.exec(body))) {
    if (!cmdAuthed()) { cmdDeny(); return true; }
    cmdSetLevel(+m[1] || 120);
    return true;
  }
  if ((m = /^item[-_ ]?([\s\S]+)$/i.exec(body))) {
    if (!cmdAuthed()) { cmdDeny(); return true; }
    cmdItemGive(m[1]);
    return true;
  }
  // lệnh không rõ: KHÔNG gửi ra kênh — chỉ gợi ý
  toast("Lệnh không rõ: " + body + " — /help-commands để xem hướng dẫn");
  log(`<span class="dim">${esc(body ? "/" + body : "/")} — không phải lệnh hợp lệ. /help-commands để xem hướng dẫn.</span>`);
  return true;
}
function cmdDeny() {
  toast("⛔ Lệnh quản trị: chỉ QTV. Mở lệnh /gm rồi nhập mã quản trị để mở khóa cho trình duyệt này");
  log(`<span class="dim">Lệnh bị chặn. Gõ <b>/gm</b> → nhập mã quản trị → sau đó /level và /item sẽ hoạt động.</span>`);
}

function cmdSync() {
  try {
    if (typeof netOn === "function" && netOn() && typeof netUpload === "function") netUpload();
  } catch {}
}

/* ---------- thanh lệnh nhanh (bấm phím /)/(mở) ---------- */
function cmdBarToggle(open) {
  const bar = document.getElementById("cmdBar");
  if (!bar) return;
  bar.hidden = !open;
  if (open) {
    const i = document.getElementById("cmdInput");
    if (i) { i.value = ""; i.focus(); }
  }
}
function cmdBarDispatch() {
  const i = document.getElementById("cmdInput");
  if (!i) return;
  const v = i.value.trim();
  if (!v) { cmdBarToggle(false); return; }
  cmdRun(v);
  i.value = "";
}
function cmdBarInit() {
  if (document.getElementById("cmdBar")) return;
  const css = document.createElement("style");
  css.textContent = `
#cmdBar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:340;display:flex;align-items:center;gap:8px;background:rgba(14,20,18,.95);border:1px solid #78afbe;border-radius:8px;padding:6px 10px;box-shadow:0 4px 12px rgba(0,0,0,.6);max-width:94vw}
#cmdBar[hidden]{display:none!important}
#cmdBar .tag{color:#ffcc66;font-weight:700;white-space:nowrap;font-size:12px}
#cmdBar input{flex:1;min-width:180px;background:#0b1210;border:1px solid #2c3940;color:#eaf7ff;border-radius:5px;padding:5px 8px;font-size:13px;outline:none}
#cmdBar small{color:#8fb8c6;white-space:nowrap}
#cmdOpen{position:fixed;right:10px;bottom:52px;z-index:340;background:rgba(14,20,18,.92);border:1px solid #78afbe;color:#d7fbff;border-radius:999px;padding:4px 12px;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px}
#cmdOpen:active{filter:brightness(1.2)}
@media(max-width:600px){#cmdBar{bottom:8px;padding:5px 8px}#cmdBar input{min-width:120px}#cmdOpen{bottom:44px}}
`;
  document.head.appendChild(css);

  const bar = document.createElement("div");
  bar.id = "cmdBar";
  bar.hidden = true;
  bar.innerHTML = `<span class="tag">⌘ Lệnh</span><input id="cmdInput" maxlength="60" autocomplete="off" spellcheck="false" placeholder="/level120 · /item-10_33 · /item-vlmt · /items"><small>Enter</small>`;
  document.body.appendChild(bar);

  const open = document.createElement("button");
  open.id = "cmdOpen";
  open.type = "button";
  open.title = "Bảng lệnh GM (/help-commands)";
  open.textContent = "⌘";
  document.body.appendChild(open);
  open.onclick = () => cmdBarToggle(document.getElementById("cmdBar").hidden);

  bar.querySelector("#cmdInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); cmdBarDispatch(); }
    else if (e.key === "Escape") { e.preventDefault(); cmdBarToggle(false); }
  });

  window.addEventListener("keydown", e => {
    // "/" opens the command bar — bỏ qua khi đang gõ trong ô nào đó
    if (e.key !== "/" && e.key !== "／" && e.key !== "?") return;
    const tgt = e.target || {}, tag = String(tgt.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tgt.isContentEditable) return;
    const mdl = document.getElementById("modal");
    if (mdl && !mdl.classList.contains("hidden")) return;
    if (!cmdAuthed()) return; // bản online chưa đăng nhập GM: bấm / sẽ không mở
    e.preventDefault();
    cmdBarToggle(document.getElementById("cmdBar").hidden);
  }, { capture: true });
}

/* hậu mã: khởi tạo khi DOM sẵn sàng (bundle chạy sau play.html nên body đã có) */
try { cmdBarInit(); } catch {}
