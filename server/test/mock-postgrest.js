"use strict";
/**
 * Võ Lâm Idle - PostgREST giả lập (chỉ dùng cho test tự động)
 *
 * Mô phỏng đủ các hành vi PostgREST mà server sử dụng:
 *   GET    /rest/v1/                      -> OpenAPI schema
 *   GET    /rest/v1/<table>?col=eq.x      -> lọc
 *   POST   /rest/v1/<table>?on_conflict=id-> insert / upsert
 *   PATCH  /rest/v1/<table>?id=eq.x       -> cập nhật
 *   DELETE /rest/v1/<table>?id=eq.x       -> xoá
 *   POST   /rest/v1/rpc/<fn>              -> hàm rpc
 */

const http = require("http");
const { URL } = require("url");

function makeMock(opts) {
  opts = opts || {};
  const tables = Object.create(null);
  const seq = Object.create(null);

  const SCHEMA = {
    users: { id: { type: "string" }, username: { type: "string" }, pass_hash: { type: "string" }, password: { type: "string" }, created_at: { type: "string" }, last_active: { type: "string" } },
    saves: { id: { type: "string" }, user_id: { type: "string" }, slot: { type: "integer" }, name: { type: "string" }, lvl: { type: "integer" }, reborn: { type: "integer" }, power: { type: "integer" }, fac: { type: "string" }, sex: { type: "integer" }, data: { type: "string" }, updated_at: { type: "string" } },
    rankings: { id: { type: "string" }, name: { type: "string" }, owner: { type: "string" }, fac: { type: "string" }, sex: { type: "integer" }, lvl: { type: "integer" }, reborn: { type: "integer" }, power: { type: "integer" }, tower: { type: "integer" }, bosses: { type: "integer" }, gear: { type: "object" }, updated_at: { type: "string" } },
    market_items: { id: { type: "integer" }, seller_id: { type: "string" }, seller_name: { type: "string" }, item_data: { type: "object" }, item_name: { type: "string" }, item_type: { type: "string" }, item_level: { type: "integer" }, price_type: { type: "string" }, price: { type: "integer" }, status: { type: "string" }, created_at: { type: "string" }, updated_at: { type: "string" } },
    chat: { id: { type: "integer" }, cid: { type: "string" }, name: { type: "string" }, fac: { type: "string" }, lvl: { type: "integer" }, msg: { type: "string" }, item: { type: "object" }, created_at: { type: "string" } },
    chars: { owner: { type: "string" }, name: { type: "string" }, fac: { type: "string" }, lvl: { type: "integer" }, updated: { type: "string" } },
    server_settings: { id: { type: "integer" }, exp_rate: { type: "number" }, notice: { type: "string" }, updated_at: { type: "string" } }
  };

  for (const t of Object.keys(SCHEMA)) {
    tables[t] = [];
    seq[t] = 0;
  }

  function matchValue(row, filter) {
    // filter dạng "eq.xxx" hoặc "gte.xxx"
    const m = /^(eq|gte|gt|lte|lt)\.(.*)$/.exec(filter);
    if (!m) return true;
    const op = m[1];
    let want = m[2];
    if (want.startsWith('"') && want.endsWith('"')) want = want.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const cols = Object.keys(row);
    let got = undefined;
    for (const c of cols) {
      if (c === "id" || c === "user_id" || c === "owner" || c === "name" || c === "username" || c === "fac" || c === "status" || c === "updated" || c === "updated_at") {
        if (String(row[c]) === String(want)) { got = row[c]; break; }
      }
    }
    if (got === undefined) return false;
    if (op === "eq") return String(got) === String(want);
    const a = Date.parse(got), b = Date.parse(want);
    if (!isNaN(a) && !isNaN(b)) {
      if (op === "gte") return a >= b;
      if (op === "gt") return a > b;
      if (op === "lte") return a <= b;
      if (op === "lt") return a < b;
    }
    const na = Number(got), nb = Number(want);
    if (!isNaN(na) && !isNaN(nb)) {
      if (op === "gte") return na >= nb;
      if (op === "gt") return na > nb;
      if (op === "lte") return na <= nb;
      if (op === "lt") return na < nb;
    }
    return false;
  }

  function applyQuery(rows, query) {
    let out = rows.slice();
    for (const [k, v] of query.entries()) {
      if (["select", "limit", "offset", "order", "on_conflict", "columns"].includes(k)) continue;
      out = out.filter(r => matchValue(r, v));
    }
    const order = query.get("order");
    if (order) {
      const parts = order.split(".");
      const col = parts[0];
      const dir = (parts[1] || "asc").toLowerCase();
      out.sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return dir === "desc" ? -cmp : cmp;
      });
    }
    const off = parseInt(query.get("offset") || "0", 10) || 0;
    if (off) out = out.slice(off);
    const lim = parseInt(query.get("limit") || "0", 10);
    if (lim > 0) out = out.slice(0, lim);
    return out;
  }

  function project(row, select) {
    if (!select || select === "*") return row;
    const cols = select.split(",").map(s => s.trim()).filter(Boolean);
    const out = {};
    for (const c of cols) out[c] = row[c];
    return out;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", c => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve(null);
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
      req.on("error", reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/^\/rest\/v1/, "") || "/";
    const send = (status, body, headers) => {
      const s = body === null || body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body));
      res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}));
      res.end(s);
    };

    try {
      // OpenAPI schema
      if (path === "/" || path === "") {
        const defs = {};
        for (const t of Object.keys(SCHEMA)) defs[t] = { properties: SCHEMA[t] };
        return send(200, { definitions: defs, swagger: "2.0", info: { title: "mock", version: "1" } });
      }

      // rpc
      if (path.indexOf("/rpc/") === 0) {
        const fn = path.slice(5);
        if (fn === "jx_online") {
          const since = Date.now() - 5 * 60 * 1000;
          const n = tables.chars.filter(r => Date.parse(r.updated || 0) > since).length;
          return send(200, n);
        }
        return send(404, { message: "rpc not found" });
      }

      const table = path.replace(/^\//, "");
      if (!Object.prototype.hasOwnProperty.call(SCHEMA, table)) {
        return send(404, { code: "PGRST205", message: "Could not find the table 'public." + table + "'" });
      }

      const prefer = String(req.headers["prefer"] || "");
      const method = req.method.toUpperCase();

      if (method === "GET") {
        const rows = applyQuery(tables[table], url.searchParams);
        const select = url.searchParams.get("select");
        const count = tables[table].length;
        const headers = {};
        if (/count=exact/.test(prefer)) headers["Content-Range"] = "0-" + Math.max(0, rows.length - 1) + "/" + count;
        return send(200, rows.map(r => project(r, select)), headers);
      }

      if (method === "POST") {
        const body = await readBody(req);
        const arr = Array.isArray(body) ? body : [body];
        const onConflict = url.searchParams.get("on_conflict");
        const result = [];
        for (const row of arr) {
          const key = row.id !== undefined ? "id" : Object.keys(SCHEMA[table])[0];
          const keyVal = row[key];
          let existing = null;
          if (keyVal !== undefined) existing = tables[table].find(r => String(r[key]) === String(keyVal));
          if (existing && /merge-duplicates/.test(prefer)) {
            Object.assign(existing, row);
            result.push(existing);
          } else if (existing) {
            return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
          } else {
            seq[table] += 1;
            const newRow = Object.assign({ id: seq[table] }, row);
            tables[table].push(newRow);
            result.push(newRow);
          }
        }
        if (/return=representation/.test(prefer)) return send(201, result);
        return send(201, "");
      }

      if (method === "PATCH") {
        const body = await readBody(req);
        const rows = applyQuery(tables[table], url.searchParams);
        for (const r of rows) Object.assign(r, body || {});
        if (/return=representation/.test(prefer)) return send(200, rows);
        return send(200, "");
      }

      if (method === "DELETE") {
        const rows = applyQuery(tables[table], url.searchParams);
        for (const r of rows) {
          const i = tables[table].indexOf(r);
          if (i >= 0) tables[table].splice(i, 1);
        }
        return send(204, "");
      }

      return send(405, { message: "method not allowed" });
    } catch (e) {
      return send(500, { message: String(e && e.message ? e.message : e) });
    }
  });

  return {
    server,
    listen(port) {
      return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server.address().port)));
    },
    close() {
      return new Promise(resolve => server.close(() => resolve()));
    },
    tables,
    SCHEMA
  };
}

module.exports = { makeMock };
