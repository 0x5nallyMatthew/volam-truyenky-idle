"use strict";
/**
 * Võ Lâm Idle - Proxy PostgREST tương thích Supabase (dành cho các giai đoạn sau)
 *
 * Client gốc gọi Supabase qua đường dẫn kiểu PostgREST:
 *   /users?username=eq.abc&select=id
 *   /saves?id=eq.usr_abc_0
 *   /market_items?seller_id=eq.usr_abc&order=created_at.desc&limit=50
 *
 * Module này mở lại đúng các đường dẫn đó dưới dạng "/api/sb/<table>" và chuyển tiếp
 * tới Supabase bằng service key (phía server) - client KHÔNG cần biết key nào.
 *
 * BẢO MẬT: mọi thao tác ghi đều kiểm tra chủ sở hữu dựa trên token đăng nhập
 * (Authorization: Bearer) - không ai ghi được dữ liệu của người chơi khác.
 * Đọc bảng nhạy cảm (users/saves) cũng bị giới hạn theo chủ sở hữu.
 */

const cfg = require("./config");
const sb = require("./supabase");
const auth = require("./auth");

const ALLOWED = new Set([
  "users",
  "saves",
  "rankings",
  "market_items",
  "chat",
  "chars",
  "server_settings"
]);

// Bảng được đọc công khai (không chứa dữ liệu cá nhân)
const PUBLIC_READ = new Set(["rankings", "chat", "market_items"]);

function json(res, status, body) {
  const s = JSON.stringify(body === undefined ? {} : body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(s)
  });
  res.end(s);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("Dữ liệu gửi lên quá lớn"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

function fail(status, msg) {
  const err = new Error(msg);
  err.status = status;
  throw err;
}

/** Kiểm tra token đăng nhập (bắt buộc với thao tác ghi) */
function requireUser(req) {
  const user = auth.userFromRequest(req);
  if (!user) fail(401, "Chưa đăng nhập");
  return user;
}

/**
 * Áp dụng quy tắc sở hữu dữ liệu.
 * Trả về { body, query } đã được kiểm tra/điều chỉnh.
 */
async function applyRules(table, method, user, query, body) {
  const q = Object.assign({}, query || {});
  const b = body && typeof body === "object" && !Array.isArray(body) ? Object.assign({}, body) : body;

  if (method === "GET") {
    if (table === "users") {
      // Chỉ được đọc chính mình
      q.username = sb.eq(user.username);
      q.select = "id,username,created_at,last_active";
    } else if (table === "saves") {
      q.user_id = sb.eq(user.id);
    } else if (table === "chars") {
      q.owner = sb.eq(user.id);
    }
    return { query: q, body: null };
  }

  // ---- Ghi dữ liệu ----
  switch (table) {
    case "users": {
      if (method === "POST") fail(403, "Đăng ký tài khoản qua /api/auth/register");
      // Chỉ được sửa/xoá chính mình
      const idFilter = q.id || "";
      if (!idFilter.startsWith("eq." + user.id)) fail(403, "Không được sửa tài khoản khác");
      delete b.pass_hash;
      delete b.password;
      return { query: q, body: b };
    }
    case "saves": {
      const slot = b && b.slot !== undefined ? parseInt(b.slot, 10) : 0;
      if (method === "POST") {
        b.user_id = user.id;
        b.id = user.id + "_" + slot;
      } else {
        const idFilter = q.id || "";
        if (!idFilter.startsWith("eq." + user.id + "_")) fail(403, "Không được sửa bản lưu của người khác");
      }
      return { query: q, body: b };
    }
    case "rankings": {
      if (method === "POST") {
        b.owner = user.id;
        b.id = b.name;
        const dup = await sb.select("rankings", { name: sb.eq(b.name), select: "id,owner" });
        if (Array.isArray(dup) && dup.length && dup[0].owner && dup[0].owner !== user.id) {
          fail(409, "Tên nhân vật đã tồn tại, vui lòng chọn tên khác");
        }
      } else {
        if (b) b.owner = user.id;
      }
      return { query: q, body: b };
    }
    case "market_items": {
      if (method === "POST") {
        b.seller_id = user.id;
      } else if (method === "PATCH") {
        // Người bán sửa giá/hủy, người mua đánh dấu đã nhận
        const idFilter = q.id || "";
        const rows = await sb.select("market_items", { id: idFilter, select: "id,seller_id,status" });
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;
        if (!row) fail(404, "Tin đăng bán không tồn tại");
        const isSeller = String(row.seller_id) === String(user.id);
        const isBuyerClaim = String(row.status) === "sold" && b && b.status === "claimed";
        if (!isSeller && !isBuyerClaim) fail(403, "Không được sửa tin đăng của người khác");
        if (isSeller) b.seller_id = row.seller_id;
      }
      return { query: q, body: b };
    }
    case "chat": {
      if (method === "POST") {
        b.cid = user.id;
      }
      return { query: q, body: b };
    }
    case "chars": {
      if (method === "POST" || method === "PATCH") {
        b.owner = user.id;
        b.id = user.id;
        b.updated = new Date().toISOString();
      } else {
        q.owner = sb.eq(user.id);
      }
      return { query: q, body: b };
    }
    case "server_settings": {
      fail(403, "Chỉ GM mới được sửa cấu hình toàn server");
      break;
    }
  }
  return { query: q, body: b };
}

/**
 * Xử lý "/api/sb/..." - trả true nếu đã xử lý.
 */
async function handle(req, res, url) {
  if (url.pathname.indexOf("/api/sb/") !== 0) return false;

  const rest = url.pathname.slice("/api/sb".length); // ví dụ: /users hoặc /rpc/jx_online
  const segments = rest.split("/").filter(Boolean);
  if (!segments.length) {
    json(res, 400, { msg: "Thiếu tên bảng" });
    return true;
  }

  const method = (req.method || "GET").toUpperCase();

  let target;
  let isRpc = false;
  if (segments[0] === "rpc") {
    if (!segments[1]) {
      json(res, 400, { msg: "Thiếu tên hàm rpc" });
      return true;
    }
    target = "/rpc/" + segments[1];
    isRpc = true;
  } else {
    const table = segments[0];
    if (!ALLOWED.has(table)) {
      json(res, 403, { msg: "Bảng không được phép truy cập: " + table });
      return true;
    }
    target = "/" + table;
  }

  if (!cfg.hasDb) {
    json(res, 503, { msg: "Máy chủ chưa cấu hình Supabase" });
    return true;
  }

  const query = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;

  try {
    let body = null;
    if (method !== "GET" && method !== "HEAD") body = await readBody(req);

    // Bảo mật: ghi luôn cần đăng nhập, đọc bảng nhạy cảm cũng cần đăng nhập
    const needAuth = method !== "GET" || (!isRpc && !PUBLIC_READ.has(segments[0]));
    const user = needAuth ? requireUser(req) : auth.userFromRequest(req);

    if (isRpc) {
      if (method !== "GET") {
        const r = await sb.raw(method, target, { body: body || {}, headers: { Prefer: "return=minimal" } });
        return sendRaw(res, r);
      }
      const r = await sb.raw("GET", target, {});
      return sendRaw(res, r);
    }

    if (user) {
      const rules = await applyRules(segments[0], method, user, query, body);
      Object.keys(rules.query).forEach(k => delete query[k]);
      Object.assign(query, rules.query);
      body = rules.body;
    }

    const r = await sb.raw(method, target, {
      query: Object.keys(query).length ? query : null,
      body: body === null ? undefined : body,
      headers: { Prefer: req.headers["prefer"] || "return=minimal" }
    });
    return sendRaw(res, r);
  } catch (e) {
    json(res, e && e.status ? e.status : 500, { msg: e && e.message ? e.message : "Lỗi proxy" });
  }
  return true;
}

function sendRaw(res, r) {
  const text = typeof r.data === "string" ? r.data : r.data === null ? "" : JSON.stringify(r.data);
  const h = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  const cr = r.headers.get("content-range");
  if (cr) h["Content-Range"] = cr;
  res.writeHead(r.status, h);
  res.end(text);
}

module.exports = { handle, ALLOWED };
