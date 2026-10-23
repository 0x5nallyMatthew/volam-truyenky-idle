"use strict";
/**
 * Võ Lâm Idle - Cấu hình máy chủ (Phase 1)
 *
 * Nguồn cấu hình (theo thứ tự ưu tiên):
 *   1. Biến môi trường (process.env)
 *   2. File server/config.json  (KHÔNG commit lên git)
 *   3. Giá trị mặc định
 *
 * Biến môi trường:
 *   PORT                   cổng HTTP (mặc định 8080)
 *   HOST                   địa chỉ lắng nghe (mặc định 0.0.0.0)
 *   SUPABASE_URL           https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   service_role key (khuyến nghị - dùng phía server)
 *   SUPABASE_KEY           anon/public key (dùng khi không có service key)
 *   TOKEN_SECRET           chuỗi bí mật ký token (tự sinh & lưu vào server/.secret nếu thiếu)
 *   GM_TOKEN               mã truy cập trang /gm
 *   CORS_ORIGIN            cho phép domain khác gọi API (mặc định: chỉ cùng origin)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DIR = __dirname;

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

const fileCfg = readJSON(path.join(DIR, "config.json")) || {};
const env = process.env;

function pick(envKey, fileKey, def) {
  const v = env[envKey];
  if (v !== undefined && v !== null && String(v) !== "") return v;
  if (fileCfg[fileKey] !== undefined && fileCfg[fileKey] !== null && String(fileCfg[fileKey]) !== "") return fileCfg[fileKey];
  return def;
}

// Giống pick nhưng tôn trọng giá trị rỗng có chủ đích trong config.json
// (vd "gmToken": "" => TẮT hẳn trang quản trị thay vì lấy mặc định)
function pickStrict(envKey, fileKey, def) {
  const v = env[envKey];
  if (v !== undefined && v !== null && String(v) !== "") return String(v);
  if (Object.prototype.hasOwnProperty.call(fileCfg, fileKey) && fileCfg[fileKey] !== null) {
    return String(fileCfg[fileKey]).trim();
  }
  return def;
}

// Secret ký token: ưu tiên env -> config.json -> file .secret (tự sinh 1 lần để token sống lâu)
function resolveTokenSecret() {
  const fromCfg = pick("TOKEN_SECRET", "tokenSecret", "");
  if (fromCfg) return String(fromCfg);
  const secretFile = path.join(DIR, ".secret");
  try {
    if (fs.existsSync(secretFile)) {
      const s = fs.readFileSync(secretFile, "utf8").trim();
      if (s) return s;
    }
  } catch (e) {}
  const gen = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(secretFile, gen, { encoding: "utf8" });
  } catch (e) {}
  return gen;
}

const cfg = {
  host: String(pick("HOST", "host", "0.0.0.0")),
  port: parseInt(pick("PORT", "port", "8080"), 10) || 8080,
  root: path.resolve(DIR, ".."),
  version: "1.0.0",

  // Supabase
  supabaseUrl: String(pick("SUPABASE_URL", "supabaseUrl", "")).trim().replace(/\/+$/, ""),
  supabaseKey: String(pick("SUPABASE_KEY", "supabaseKey", "")).trim(),
  serviceKey: String(pick("SUPABASE_SERVICE_KEY", "supabaseServiceKey", "")).trim(),

  // Bảo mật
  tokenSecret: resolveTokenSecret(),
  // Mã truy cập trang GM - mặc định lấy theo token cũ đã hardcode trong client để không phá luồng cũ.
  // Đặt "gmToken": "" trong config.json để TẮT hẳn trang quản trị.
  gmToken: pickStrict("GM_TOKEN", "gmToken", "45ee7406856f702ada59e06b44941c6a"),

  // CORS: rỗng = chỉ cho phép cùng origin (an toàn mặc định)
  corsOrigin: String(pick("CORS_ORIGIN", "corsOrigin", "")).trim()
};

// Key dùng để gọi PostgREST: ưu tiên service_role (bỏ qua RLS) rồi mới tới anon key
cfg.key = cfg.serviceKey || cfg.supabaseKey;
cfg.hasDb = !!(cfg.supabaseUrl && cfg.key);
cfg.restBase = cfg.supabaseUrl ? cfg.supabaseUrl + "/rest/v1" : "";

module.exports = cfg;
