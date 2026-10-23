"use strict";
/**
 * Võ Lâm Idle - Client PostgREST tự viết (không cần thư viện ngoài)
 *
 * Supabase = Postgres + PostgREST. Ta gọi thẳng REST:
 *   GET    {url}/rest/v1/<table>?select=*&limit=10
 *   POST   {url}/rest/v1/<table>            (thêm Prefer: resolution=merge-duplicates để upsert)
 *   PATCH  {url}/rest/v1/<table>?id=eq.xxx
 *   DELETE {url}/rest/v1/<table>?id=eq.xxx
 *   POST   {url}/rest/v1/rpc/<func>
 *
 * Header bắt buộc: apikey + Authorization: Bearer <key>
 */

const cfg = require("./config");

class SbError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "SbError";
    this.status = status || 0;
    this.data = data === undefined ? null : data;
  }
}

function buildHeaders(extra) {
  return Object.assign(
    {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    extra || {}
  );
}

/** Gọi PostgREST, trả về { status, headers, data } */
async function raw(method, p, opts) {
  opts = opts || {};
  if (!cfg.hasDb) {
    throw new SbError("Chưa cấu hình Supabase: thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY", 503, null);
  }
  const url = new URL(cfg.restBase + p);
  if (opts.query) {
    for (const k of Object.keys(opts.query)) {
      const v = opts.query[k];
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method: method,
    headers: buildHeaders(opts.headers),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }
  return { status: res.status, headers: res.headers, data: data, ok: res.ok };
}

/** Gọi PostgREST, tự ném lỗi khi HTTP != 2xx */
async function request(method, p, opts) {
  const r = await raw(method, p, opts);
  if (!r.ok) {
    let msg = "Lỗi Supabase (HTTP " + r.status + ")";
    const d = r.data;
    if (d && typeof d === "object") {
      msg = d.message || d.error_description || d.hint || d.error || msg;
    } else if (typeof d === "string" && d) {
      msg = d;
    }
    throw new SbError(String(msg), r.status, d);
  }
  return r.data;
}

/** Tạo filter so sánh PostgREST an toàn với giá trị đặc biệt (dấu phẩy, ngoặc, khoảng trắng...) */
function eq(value) {
  const s = String(value === undefined || value === null ? "" : value);
  if (/[,()"\\:\s]/.test(s)) {
    return 'eq."' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return "eq." + s;
}

const select = (table, query, headers) => request("GET", "/" + table, { query: query, headers: headers });
const insert = (table, body, headers) => request("POST", "/" + table, { body: body, headers: headers });

/** Upsert theo khoá chính (on_conflict) */
function upsert(table, body, onConflict, headers) {
  const query = onConflict ? { on_conflict: onConflict } : null;
  const prefer = Object.assign({ Prefer: "resolution=merge-duplicates,return=minimal" }, headers || {});
  return request("POST", "/" + table, { query: query, body: body, headers: prefer });
}

const update = (table, filterQuery, body) =>
  request("PATCH", "/" + table, { query: filterQuery, body: body, headers: { Prefer: "return=minimal" } });

const remove = (table, filterQuery) =>
  request("DELETE", "/" + table, { query: filterQuery, headers: { Prefer: "return=minimal" } });

const rpc = (fn, body) => request("POST", "/rpc/" + fn, { body: body || {} });

/** Đếm số dòng (dùng content-range + Prefer: count=exact) */
async function count(table, filterQuery) {
  const query = Object.assign({}, filterQuery || {}, { select: "id", limit: "1" });
  const r = await raw("GET", "/" + table, { query: query, headers: { Prefer: "count=exact", Range: "0-0" } });
  if (!r.ok) throw new SbError("Không đếm được " + table + " (HTTP " + r.status + ")", r.status, r.data);
  const cr = r.headers.get("content-range") || "";
  const m = /\/(\d+)\s*$/.exec(cr);
  return m ? parseInt(m[1], 10) : 0;
}

/** Kiểm tra kết nối tới Supabase (GET /rest/v1/ trả về OpenAPI) */
async function ping() {
  const r = await raw("GET", "/", {});
  return { ok: r.ok, status: r.status, spec: r.data };
}

/** Lấy OpenAPI schema (dùng để dò cột/bảng) */
async function spec() {
  const r = await raw("GET", "/", {});
  if (!r.ok) throw new SbError("Không đọc được schema Supabase (HTTP " + r.status + ")", r.status, r.data);
  return r.data;
}

/** Bảng có tồn tại không (PostgREST trả 404/PGRST205 nếu không có) */
async function tableExists(table) {
  try {
    const r = await raw("GET", "/" + table, { query: { select: "*", limit: "1" } });
    return r.ok;
  } catch (e) {
    return false;
  }
}

module.exports = {
  SbError,
  raw,
  request,
  select,
  insert,
  upsert,
  update,
  remove,
  rpc,
  count,
  ping,
  spec,
  tableExists,
  eq
};
