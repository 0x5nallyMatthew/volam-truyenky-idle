"use strict";
/**
 * Võ Lâm Idle - Xác thực & token (Phase 1)
 *
 * - Mật khẩu: băm bằng scrypt (node:crypto), định dạng lưu: scrypt$N$r$p$salt$hash
 * - Token: HMAC-SHA256, định dạng: base64url(payload).base64url(chữ ký)
 *   payload gồm { id, username, iat, exp }
 */

const crypto = require("crypto");
const cfg = require("./config");

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000; // 30 ngày

/** Băm mật khẩu (đồng bộ, ~50ms) */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return "scrypt$" + SCRYPT_N + "$" + SCRYPT_r + "$" + SCRYPT_p + "$" + salt.toString("base64") + "$" + hash.toString("base64");
}

/** Kiểm tra mật khẩu với chuỗi đã băm */
function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  if (!N || !r || !p) return false;
  let salt, expect;
  try {
    salt = Buffer.from(parts[4], "base64");
    expect = Buffer.from(parts[5], "base64");
  } catch (e) {
    return false;
  }
  if (!expect.length) return false;
  let hash;
  try {
    hash = crypto.scryptSync(String(password), salt, expect.length, { N, r, p });
  } catch (e) {
    return false;
  }
  return hash.length === expect.length && crypto.timingSafeEqual(hash, expect);
}

/** Kiểm tra mật khẩu với bản ghi cũ (hỗ trợ tự nâng cấp plaintext -> scrypt) */
function verifyLegacy(user, password) {
  if (!user) return false;
  const passHash = user.pass_hash || null;
  if (passHash) return verifyPassword(password, passHash);
  if (user.password) {
    // Bản ghi cũ của client lưu mật khẩu thô - so sánh rồi nâng cấp
    return String(user.password) === String(password);
  }
  return false;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(s + "=".repeat((4 - (s.length % 4)) % 4), "base64");
}

/** Tạo token đăng nhập */
function signToken(payload, ttlMs) {
  const body = Object.assign({}, payload, {
    iat: Date.now(),
    exp: Date.now() + (ttlMs || TOKEN_TTL_MS)
  });
  const data = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac("sha256", cfg.tokenSecret).update(data).digest());
  return data + "." + sig;
}

/** Kiểm tra token, trả về payload hoặc null */
function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const sig = b64url(crypto.createHmac("sha256", cfg.tokenSecret).update(parts[0]).digest());
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(parts[1], "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64url(parts[0]).toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    if (!payload.id) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/** Lấy user từ header Authorization: Bearer <token> */
function userFromRequest(req) {
  try {
    const raw = req.headers["authorization"] || req.headers["Authorization"] || "";
    const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
    if (!m) return null;
    return verifyToken(m[1]);
  } catch (e) {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  verifyLegacy,
  signToken,
  verifyToken,
  userFromRequest,
  TOKEN_TTL_MS
};
