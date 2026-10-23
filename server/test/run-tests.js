"use strict";
/**
 * Võ Lâm Idle - Kiểm thử tự động API máy chủ (Phase 1)
 *
 * Chạy:  node server/test/run-tests.js
 *
 * Tự dựng PostgREST giả lập, khởi chạy máy chủ thật (tiến trình con) rồi
 * chạy trọn luồng: đăng ký -> đăng nhập -> lưu đám mây -> xếp hạng -> cấu hình -> GM.
 */

const path = require("path");
const { spawn } = require("child_process");
const { makeMock } = require("./mock-postgrest");

const ROOT = path.resolve(__dirname, "..", "..");

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log("  ✅ " + label);
  } else {
    fail++;
    console.log("  ❌ " + label + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
  }
}
function section(t) {
  console.log("\n[" + t + "]");
}

const PORT = 18080 + Math.floor(Math.random() * 400);

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("   VÕ LÂM IDLE - KIỂM THƯ API MÁY CHỦ (PHASE 1)");
  console.log("══════════════════════════════════════════════════════════");

  // 1. PostgREST giả lập
  const mock = makeMock();
  const mockPort = await mock.listen(0);
  console.log("\n  PostgREST giả lập: http://127.0.0.1:" + mockPort);

  // 2. Khởi chạy máy chủ thật
  const env = Object.assign({}, process.env, {
    SUPABASE_URL: "http://127.0.0.1:" + mockPort,
    SUPABASE_SERVICE_KEY: "test-service-role-key",
    TOKEN_SECRET: "test-token-secret-0123456789",
    GM_TOKEN: "test-gm-token",
    PORT: String(PORT),
    HOST: "127.0.0.1"
  });
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: ROOT,
    env: env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let serverLog = "";
  child.stdout.on("data", d => { serverLog += d.toString(); });
  child.stderr.on("data", d => { serverLog += d.toString(); });

  // Chờ máy chủ sẵn sàng
  const base = "http://127.0.0.1:" + PORT;
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) { up = true; break; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 120));
  }
  if (!up) {
    console.log("\n❌ Máy chủ không khởi động được:\n" + serverLog);
    child.kill();
    await mock.close();
    process.exit(1);
  }
  console.log("  Máy chủ: " + base);

  const call = async (method, p, body, headers) => {
    const res = await fetch(base + p, {
      method: method,
      headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body))
    });
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
    return { status: res.status, json: json, text: text };
  };

  try {
    /* ---------------- health ---------------- */
    section("Máy chủ");
    const h = await call("GET", "/api/health");
    ok(h.status === 200, "GET /api/health trả 200");
    ok(h.json && h.json.db === "up", "Supabase kết nối được (db=up)", h.json);
    ok(h.json && h.json.tables && h.json.tables.users !== false, "Bảng users được nhận diện");

    /* ---------------- đăng ký ---------------- */
    section("Đăng ký / đăng nhập");
    const reg = await call("POST", "/api/auth/register", { username: "hiepho", password: "matkhau123" });
    ok(reg.status === 200, "Đăng ký thành công", reg.json);
    ok(reg.json && reg.json.user && reg.json.user.id === "usr_hiepho", "Trả về user.id đúng định dạng", reg.json);
    ok(reg.json && typeof reg.json.token === "string" && reg.json.token.length > 20, "Trả về token hợp lệ");
    const token = reg.json.token;
    const authH = { Authorization: "Bearer " + token };

    const dup = await call("POST", "/api/auth/register", { username: "hiepho", password: "matkhau123" });
    ok(dup.status === 409, "Đăng ký trùng tên bị từ chối (409)", dup.json);
    ok(dup.json && /đã tồn tại/.test(dup.json.msg || ""), "Thông điệp lỗi chứa \"đã tồn tại\"", dup.json);

    const badName = await call("POST", "/api/auth/register", { username: "AB", password: "matkhau123" });
    ok(badName.status === 400, "Tên đăng ký sai định dạng bị từ chối (400)", badName.json);

    const badPass = await call("POST", "/api/auth/register", { username: "nguoi moi", password: "123" });
    ok(badPass.status === 400, "Mật khẩu ngắn bị từ chối (400)", badName.json);

    const noUser = await call("POST", "/api/auth/login", { username: "khongtontai", password: "matkhau123" });
    ok(noUser.status === 404, "Đăng nhập tài khoản không tồn tại (404)", noUser.json);
    ok(noUser.json && /không tồn tại/.test(noUser.json.msg || ""), "Thông điệp chứa \"không tồn tại\"", noUser.json);

    const wrongPw = await call("POST", "/api/auth/login", { username: "hiepho", password: "saisairoi" });
    ok(wrongPw.status === 401, "Sai mật khẩu bị từ chối (401)", wrongPw.json);
    ok(wrongPw.json && /không chính xác/.test(wrongPw.json.msg || ""), "Thông điệp chứa \"không chính xác\"", wrongPw.json);

    const login = await call("POST", "/api/auth/login", { username: "hiepho", password: "matkhau123" });
    ok(login.status === 200, "Đăng nhập đúng mật khẩu thành công", login.json);
    ok(login.json && login.json.user && login.json.user.username === "hiepho", "Đúng thông tin người chơi");

    const noAuth = await call("GET", "/api/save/list");
    ok(noAuth.status === 401, "API lưu đám mây chặn khi chưa đăng nhập (401)", noAuth.json);

    /* ---------------- lưu đám mây ---------------- */
    section("Lưu đám mây");
    const payload = JSON.stringify({ v: 2, d: "PACKED_STATE", k: "STASH" });
    const up = await call("POST", "/api/save/upload", {
      slot: 0, name: "Đại hiệp", lvl: 42, fac: "tangmen", data: payload, updated: "2026-10-21T10:00:00.000Z"
    }, authH);
    ok(up.status === 200, "Upload bản lưu thành công", up.json);

    const list = await call("GET", "/api/save/list", undefined, authH);
    ok(list.status === 200 && Array.isArray(list.json.list) && list.json.list.length === 1, "Danh sách bản lưu có 1 mục", list.json);
    ok(list.json.list[0] && list.json.list[0].name === "Đại hiệp" && list.json.list[0].lvl === 42, "Đúng thông tin bản lưu", list.json.list[0]);
    ok(list.json.list[0] && list.json.list[0].updated === "2026-10-21T10:00:00.000Z", "Giữ nguyên mốc thời gian của client", list.json.list[0]);

    const dl = await call("GET", "/api/save/download?slot=0", undefined, authH);
    ok(dl.status === 200 && dl.json.data === payload, "Tải bản lưu trả đúng dữ liệu", dl.json);

    const dl404 = await call("GET", "/api/save/download?slot=7", undefined, authH);
    ok(dl404.status === 404, "Tải bản lưu không tồn tại (404)", dl404.json);
    ok(dl404.json && /không tồn tại/.test(dl404.json.msg || ""), "Thông điệp chứa \"không tồn tại\"");

    /* ---------------- xếp hạng ---------------- */
    section("Bảng xếp hạng");
    const rs = await call("POST", "/api/rank/sync", {
      name: "Đại Hiệp", fac: "tangmen", sex: 1, lvl: 120, reborn: 3, power: 99000, tower: 55, bosses: 40, gear: { a: 1 }
    }, authH);
    ok(rs.status === 200, "Đồng bộ nhân vật lên bảng xếp hạng", rs.json);

    const rl = await call("GET", "/api/rank/list?col=lvl", undefined, authH);
    ok(rl.status === 200 && Array.isArray(rl.json.list) && rl.json.list.length === 1, "Lấy bảng xếp hạng", rl.json);
    ok(rl.json.list[0] && rl.json.list[0].name === "Đại Hiệp" && rl.json.list[0].power === 99000, "Đúng dữ liệu xếp hạng", rl.json.list[0]);

    const rlFac = await call("GET", "/api/rank/list?col=lvl&fac=wudang", undefined, authH);
    ok(rlFac.status === 200 && rlFac.json.list.length === 0, "Lọc theo phái phía server (wudang = rỗng)", rlFac.json);
    const rlFacOk = await call("GET", "/api/rank/list?col=lvl&fac=tangmen", undefined, authH);
    ok(rlFacOk.json.list.length === 1, "Lọc theo phái phía server (tangmen = có)", rlFacOk.json);

    const ins = await call("GET", "/api/rank/inspect?name=" + encodeURIComponent("Đại Hiệp"), undefined, authH);
    ok(ins.status === 200 && ins.json.char && ins.json.char.lvl === 120, "Soi nhân vật trả đúng dữ liệu", ins.json);
    const ins404 = await call("GET", "/api/rank/inspect?name=khongco", undefined, authH);
    ok(ins404.status === 404, "Soi nhân vật không tồn tại (404)", ins404.json);

    /* ---------------- cấu hình server ---------------- */
    section("Cấu hình toàn server");
    const st = await call("GET", "/api/server/settings");
    ok(st.status === 200 && st.json.exp_rate === 1, "Đọc cấu hình mặc định", st.json);

    const gmBad = await call("POST", "/api/gm/settings", { exp_rate: 2, notice: "X" }, { "x-gm-token": "sai" });
    ok(gmBad.status === 403, "GM sai mã bị từ chối (403)", gmBad.json);

    const gmOk = await call("POST", "/api/gm/settings", { exp_rate: 3.5, notice: "Bảo trì lúc 3h sáng" }, { "x-gm-token": "test-gm-token" });
    ok(gmOk.status === 200, "GM lưu cấu hình thành công", gmOk.json);
    const st2 = await call("GET", "/api/server/settings");
    ok(st2.json.exp_rate === 3.5 && st2.json.notice === "Bảo trì lúc 3h sáng", "Cấu hình được áp dụng", st2.json);

    const stats = await call("GET", "/api/gm/stats", undefined, { "x-gm-token": "test-gm-token" });
    ok(stats.status === 200 && stats.json.counts.users === 1, "Thống kê người chơi", stats.json);

    /* ---------------- proxy PostgREST ---------------- */
    section("Proxy /api/sb/* (kèm kiểm tra sở hữu)");
    const proxyNoAuth = await call("GET", "/api/sb/users?select=id,username");
    ok(proxyNoAuth.status === 401, "Đọc bảng users khi chưa đăng nhập bị chặn (401)", proxyNoAuth.json);

    const proxy = await call("GET", "/api/sb/users?select=id,username", undefined, authH);
    ok(proxy.status === 200 && Array.isArray(proxy.json) && proxy.json.length === 1, "Proxy đọc bảng users bằng token", proxy.json);
    ok(proxy.json[0] && proxy.json[0].pass_hash === undefined && proxy.json[0].password === undefined, "Không lộ mật khẩu ra ngoài", proxy.json[0]);

    const proxyRank = await call("GET", "/api/sb/rankings?select=name,lvl");
    ok(proxyRank.status === 200 && Array.isArray(proxyRank.json), "Bảng xếp hạng được đọc công khai", proxyRank.json);

    const proxyBad = await call("GET", "/api/sb/bang_bi_cam");
    ok(proxyBad.status === 403, "Proxy chặn bảng ngoài allowlist (403)", proxyBad.json);

    // Ghi bản lưu: server phải ép user_id = chủ sở hữu
    const proxySave = await call("POST", "/api/sb/saves", {
      slot: 2, name: "Hậu Sinh", lvl: 7, fac: "wudang", data: "X", updated_at: "2026-10-21T11:00:00.000Z"
    }, authH);
    ok(proxySave.status === 201, "Proxy ghi bản lưu thành công", proxySave.json);
    const savedRow = mock.tables.saves.find(s => String(s.slot) === "2");
    ok(savedRow && savedRow.user_id === "usr_hiepho", "Server ép user_id đúng chủ sở hữu", savedRow);

    // Không được ghi vào bản lưu của người khác
    const proxySaveOther = await call("PATCH", "/api/sb/saves?id=eq.usr_nguoi_khac_1", { data: "HACK" }, authH);
    ok(proxySaveOther.status === 403, "Không sửa được bản lưu của người khác (403)", proxySaveOther.json);

    // Đăng ký tài khoản không đi qua proxy
    const proxyUserIns = await call("POST", "/api/sb/users", { id: "x", username: "x" }, authH);
    ok(proxyUserIns.status === 403, "Không tạo tài khoản qua proxy (403)", proxyUserIns.json);

    /* ---------------- trang GM ---------------- */
    section("Trang quản trị");
    const gmPage = await fetch(base + "/gm?token=test-gm-token");
    const gmHtml = await gmPage.text();
    ok(gmPage.status === 200 && gmHtml.includes("BẢNG ĐIỀU KHIỂN"), "Trang /gm trả về HTML", gmPage.status);
    const gmPageBad = await fetch(base + "/gm?token=sai-token");
    ok(gmPageBad.status === 403, "Trang /gm sai mã bị chặn (403)", gmPageBad.status);

    /* ---------------- file tĩnh ---------------- */
    section("Phục vụ file game");
    const play = await fetch(base + "/play.html");
    ok(play.status === 200, "Phục vụ /play.html", play.status);
    const notFound = await fetch(base + "/khong-co-file.html");
    ok(notFound.status === 404, "File không tồn tại trả 404", notFound.status);
    const traversal = await fetch(base + "/../../Windows/win.ini");
    ok(traversal.status === 404 || traversal.status === 400, "Chặn path traversal", traversal.status);

  } catch (e) {
    fail++;
    console.log("\n❌ Lỗi trong quá trình test: " + (e && e.stack ? e.stack : e));
  }

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("   KẾT QUẢ:  " + pass + " đạt  /  " + fail + " lỗi");
  console.log("══════════════════════════════════════════════════════════\n");

  child.kill();
  await mock.close();
  setTimeout(() => process.exit(fail ? 1 : 0), 300);
}

main();
