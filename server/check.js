"use strict";
/**
 * Võ Lâm Idle - Script kiểm tra cấu hình & kết nối Supabase
 *
 * Chạy:  node server/check.js
 *
 * - Kiểm tra server/config.json (hoặc biến môi trường) đã đủ chưa
 * - Kết nối Supabase, dò các bảng cần thiết, in kết quả
 * - Hướng dẫn cụ thể cần làm gì tiếp theo
 */

const cfg = require("./config");
const sb = require("./supabase");
const schema = require("./schema");

const NEEDED = [
  { t: "users", desc: "tài khoản người chơi" },
  { t: "saves", desc: "bản lưu đám mây" },
  { t: "rankings", desc: "bảng xếp hạng" },
  { t: "server_settings", desc: "cấu hình toàn server (GM)" },
  { t: "market_items", desc: "chợ (giai đoạn sau)" },
  { t: "chat", desc: "chat thế giới (giai đoạn sau)" },
  { t: "chars", desc: "nhân vật đang hoạt động (giai đoạn sau)" }
];

const L = {
  ok: s => console.log("  ✅ " + s),
  bad: s => console.log("  ❌ " + s),
  warn: s => console.log("  ⚠️  " + s),
  info: s => console.log("  •  " + s)
};

(async () => {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("   VÕ LÂM IDLE - KIỂM TRA CẤU HÌNH MÁY CHỦ");
  console.log("══════════════════════════════════════════════════════════\n");

  console.log("[1] Cấu hình");
  L.info("Thư mục gốc game : " + cfg.root);
  L.info("Cổng HTTP        : " + cfg.port);
  if (cfg.supabaseUrl) L.ok("SUPABASE_URL      : " + cfg.supabaseUrl);
  else L.bad("SUPABASE_URL      : CHƯA CẤU HÌNH");
  if (cfg.serviceKey) L.ok("SUPABASE_SERVICE_KEY: đã có (dùng key này)");
  else if (cfg.supabaseKey) L.warn("SUPABASE_SERVICE_KEY: chưa có - đang dùng anon key (PostgREST có thể bị RLS chặn)");
  else L.bad("SUPABASE_KEY      : CHƯA CẤU HÌNH");
  L.info("GM_TOKEN          : " + (cfg.gmToken ? "đã có" : "CHƯA CẤU HÌNH"));
  L.info("Token secret      : " + (cfg.tokenSecret ? "đã có (dài " + cfg.tokenSecret.length + " ký tự)" : "CHƯA CÓ"));

  if (!cfg.hasDb) {
    console.log("\n[2] Kết nối Supabase");
    L.bad("Thiếu cấu hình. Tạo file server/config.json hoặc đặt biến môi trường.");
    console.log("\n  Mẫu file server/config.json:");
    console.log('  {\n    "supabaseUrl": "https://<project>.supabase.co",\n    "supabaseServiceKey": "<service_role key>",\n    "gmToken": "<mã quản trị>"\n  }\n');
    process.exit(1);
  }

  console.log("\n[2] Kết nối Supabase");
  let pinged = false;
  try {
    const p = await sb.ping();
    pinged = p.ok;
    if (p.ok) L.ok("Kết nối thành công (HTTP " + p.status + ")");
    else L.bad("Kết nối thất bại (HTTP " + p.status + ") - kiểm tra lại URL/key");
  } catch (e) {
    L.bad("Lỗi kết nối: " + (e && e.message ? e.message : e));
  }

  console.log("\n[3] Kiểm tra bảng");
  const info = await schema.load(true);
  let missing = [];
  for (const need of NEEDED) {
    const exists = await schema.ensureTable(need.t);
    if (exists) L.ok("Bảng " + need.t + " (" + need.desc + ")");
    else {
      missing.push(need.t);
      L.bad("Thiếu bảng " + need.t + " (" + need.desc + ")");
    }
  }
  if (info && info.users) L.info("Kiểu cột users.id : " + info.users.idType + (info.users.hasPassHash ? " (có cột pass_hash)" : " (chưa có pass_hash - server sẽ dùng cột password)"));

  console.log("\n[4] Kết quả");
  if (!pinged) {
    L.bad("Chưa kết nối được Supabase - sửa server/config.json rồi chạy lại.");
    process.exit(1);
  }
  if (missing.length) {
    L.bad("Còn thiếu bảng: " + missing.join(", "));
    console.log("\n  ➜ Mở Supabase Dashboard > SQL Editor > dán nội dung file server/schema.sql > Run\n");
    process.exit(1);
  }
  L.ok("Mọi thứ đã sẵn sàng!");
  console.log("\n  ➜ Chạy máy chủ:  node server/index.js");
  console.log("  ➜ Mở game:      http://localhost:" + cfg.port + "/play.html");
  console.log("  ➜ GM Panel:     http://localhost:" + cfg.port + "/gm?token=" + cfg.gmToken + "\n");
  process.exit(0);
})().catch(e => {
  console.error("\n❌ Lỗi không mong đợi:", e && e.stack ? e.stack : e);
  process.exit(1);
});
