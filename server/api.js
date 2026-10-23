"use strict";
/**
 * Võ Lâm Idle - API máy chủ (Phase 1)
 *
 * Hợp đồng API (client gọi tương đối: /api/...):
 *   POST /api/auth/register   {username,password}      -> {user:{id,username}, token}
 *   POST /api/auth/login      {username,password}      -> {user:{id,username}, token}
 *   POST /api/save/upload     {slot,name,lvl,fac,data,updated,...} -> {ok:true, updated}
 *   GET  /api/save/list                              -> {list:[{slot,name,lvl,reborn,power,fac,updated}]}
 *   GET  /api/save/download?slot=N                    -> {data, updated}
 *   POST /api/rank/sync       {owner,name,fac,...}     -> {ok:true}
 *   GET  /api/rank/list?col=lvl&fac=tangmen           -> {list:[...]}
 *   GET  /api/rank/inspect?name=X                     -> {char:{...}}
 *   GET  /api/server/settings                         -> {exp_rate, notice}
 *   GET  /api/health                                  -> {ok, db, tables, time}
 *   GET  /api/online                                  -> {count, players}
 *
 * Mọi lỗi trả về {msg:"..."} (client đọc json.msg || json.error).
 * Client bắt chuỗi lỗi: "đã tồn tại" (trùng tên), "không chính xác" (sai mật khẩu),
 * "không tồn tại" (không có tài khoản / bản lưu) - vì vậy thông điệp phải chứa đúng các từ này.
 */

const crypto = require("crypto");
const cfg = require("./config");
const sb = require("./supabase");
const auth = require("./auth");
const schema = require("./schema");

const USERNAME_RE = /^[a-z0-9_]{3,16}$/;
const MAX_BODY = 8 * 1024 * 1024; // 8MB - bản lưu game có thể khá lớn

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

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
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Dữ liệu gửi lên quá lớn"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("JSON không hợp lệ"));
      }
    });
    req.on("error", reject);
  });
}

function nowISO() {
  return new Date().toISOString();
}

/** Sinh id người dùng đúng kiểu cột id của bảng users (uuid hoặc text) */
function makeUserId(username, idType) {
  if (idType === "uuid") return crypto.randomUUID();
  return "usr_" + username;
}

function normFac(v) {
  return String(v || "tangmen").slice(0, 32);
}

function normName(v) {
  return String(v || "Tân thủ").trim().slice(0, 64) || "Tân thủ";
}

/** Bọc handler: bắt lỗi và trả JSON thay vì làm sập server */
function handler(fn) {
  return async (req, res, url) => {
    try {
      await fn(req, res, url);
    } catch (e) {
      const msg = e && e.message ? e.message : "Lỗi máy chủ";
      console.error("[API] " + (req.method || "?") + " " + (url ? url.pathname : "") + " -> " + msg);
      if (!res.headersSent) {
        const status = e && e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
        json(res, status, { msg: msg });
      } else {
        try { res.end(); } catch (e2) {}
      }
    }
  };
}

/** Bảng bắt buộc còn tồn tại không - nếu không thì báo rõ ràng cho người quản trị */
async function requireTable(table) {
  const ok = await schema.ensureTable(table);
  if (!ok) {
    const err = new Error("Bảng `" + table + "` chưa tồn tại trong Supabase. Hãy chạy file server/schema.sql trong Supabase SQL Editor.");
    err.status = 503;
    throw err;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Tài khoản                                                           */
/* ------------------------------------------------------------------ */

async function authRegister(req, res) {
  await requireTable("users");
  const body = await readBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!USERNAME_RE.test(username)) {
    return json(res, 400, { msg: "Tên đăng ký không hợp lệ: 3-16 ký tự, chữ không dấu, số hoặc _" });
  }
  if (password.length < 6) {
    return json(res, 400, { msg: "Mật khẩu tối thiểu 6 ký tự" });
  }

  const info = schema.get() || (await schema.load());
  const idType = (info.users && info.users.idType) || "text";

  // Kiểm tra trùng tên
  const existing = await sb.select("users", { username: sb.eq(username), select: "id,username" });
  if (Array.isArray(existing) && existing.length) {
    return json(res, 409, { msg: "Tên đăng ký đã tồn tại" });
  }

  const id = makeUserId(username, idType);
  const hash = auth.hashPassword(password);
  const now = nowISO();
  const row = { id: id, username: username, created_at: now, last_active: now };

  // Lưu mật khẩu vào đúng cột đang có sẵn
  if (info.users && info.users.hasPassHash) row.pass_hash = hash;
  else if (info.users && info.users.hasPassword) row.password = hash;
  else row.pass_hash = hash;

  try {
    await sb.insert("users", row);
  } catch (e) {
    if (e && (e.status === 409 || e.status === 23505 || /duplicate key|already exists/i.test(e.message || ""))) {
      return json(res, 409, { msg: "Tên đăng ký đã tồn tại" });
    }
    throw e;
  }

  const token = auth.signToken({ id: id, username: username });
  return json(res, 200, { user: { id: id, username: username }, token: token });
}

async function authLogin(req, res) {
  await requireTable("users");
  const body = await readBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!username || !password) {
    return json(res, 400, { msg: "Thiếu tên đăng ký hoặc mật khẩu" });
  }

  const rows = await sb.select("users", { username: sb.eq(username), select: "*" });
  if (!Array.isArray(rows) || !rows.length) {
    return json(res, 404, { msg: "Tài khoản không tồn tại" });
  }

  const user = rows[0];
  if (!auth.verifyLegacy(user, password)) {
    return json(res, 401, { msg: "Mật khẩu không chính xác!" });
  }

  // Tự nâng cấp mật khẩu thô (bản ghi cũ) thành scrypt
  try {
    const info = schema.get() || (await schema.load());
    const patch = {};
    const hash = auth.hashPassword(password);
    if (!user.pass_hash) {
      if (info.users && info.users.hasPassHash) patch.pass_hash = hash;
      else if (info.users && info.users.hasPassword) patch.password = hash;
    }
    patch.last_active = nowISO();
    await sb.update("users", { id: sb.eq(user.id) }, patch);
  } catch (e) {
    console.warn("[API] Không nâng cấp mật khẩu/last_active được:", e.message);
  }

  const token = auth.signToken({ id: user.id, username: user.username });
  return json(res, 200, { user: { id: user.id, username: user.username }, token: token });
}

/* ------------------------------------------------------------------ */
/* Lưu đám mây                                                          */
/* ------------------------------------------------------------------ */

async function saveUpload(req, res) {
  const user = auth.userFromRequest(req);
  if (!user) return json(res, 401, { msg: "Chưa đăng nhập" });
  await requireTable("saves");

  const body = await readBody(req);
  const slot = parseInt(body.slot, 10);
  if (!Number.isInteger(slot) || slot < 0 || slot > 50) {
    return json(res, 400, { msg: "Slot bản lưu không hợp lệ" });
  }
  const data = typeof body.data === "string" ? body.data : "";
  if (!data) return json(res, 400, { msg: "Dữ liệu bản lưu rỗng" });
  if (data.length > MAX_BODY) return json(res, 413, { msg: "Dữ liệu bản lưu quá lớn" });

  // Giữ nguyên mốc thời gian do client gửi để so sánh "cloud mới hơn local" chính xác
  const stamp = typeof body.updated === "string" && body.updated ? body.updated : nowISO();
  const row = {
    id: user.id + "_" + slot,
    user_id: user.id,
    slot: slot,
    name: normName(body.name),
    lvl: parseInt(body.lvl, 10) || 0,
    reborn: parseInt(body.reborn, 10) || 0,
    power: Math.round(Number(body.power) || 0),
    fac: normFac(body.fac),
    sex: parseInt(body.sex, 10) || 0,
    data: data,
    updated_at: stamp
  };

  await sb.upsert("saves", row, "id");
  return json(res, 200, { ok: true, updated: stamp, slot: slot });
}

async function saveList(req, res) {
  const user = auth.userFromRequest(req);
  if (!user) return json(res, 401, { msg: "Chưa đăng nhập" });
  await requireTable("saves");

  const rows = await sb.select("saves", {
    user_id: sb.eq(user.id),
    select: "slot,name,lvl,reborn,power,fac,updated_at",
    order: "slot.asc"
  });

  const list = (Array.isArray(rows) ? rows : []).map(r => ({
    slot: r.slot | 0,
    name: r.name || "Tân thủ",
    lvl: r.lvl | 0,
    reborn: r.reborn | 0,
    power: Math.round(Number(r.power) || 0),
    fac: r.fac || "tangmen",
    updated: r.updated_at || null
  }));
  return json(res, 200, { list: list });
}

async function saveDownload(req, res, url) {
  const user = auth.userFromRequest(req);
  if (!user) return json(res, 401, { msg: "Chưa đăng nhập" });
  await requireTable("saves");

  const slot = parseInt(url.searchParams.get("slot"), 10);
  if (!Number.isInteger(slot)) return json(res, 400, { msg: "Slot không hợp lệ" });

  const rows = await sb.select("saves", { id: sb.eq(user.id + "_" + slot), select: "data,updated_at" });
  if (!Array.isArray(rows) || !rows.length || !rows[0].data) {
    return json(res, 404, { msg: "Bản lưu không tồn tại trên Cloud" });
  }
  return json(res, 200, { data: rows[0].data, updated: rows[0].updated_at || null, slot: slot });
}

/* ------------------------------------------------------------------ */
/* Bảng xếp hạng                                                        */
/* ------------------------------------------------------------------ */

const RANK_COLS = ["lvl", "power", "tower", "bosses"];

function rankSort(a, b, col) {
  if (col === "lvl") {
    const ra = Math.min(5, a.reborn | 0), rb = Math.min(5, b.reborn | 0);
    if (rb !== ra) return rb - ra;
    if ((b.lvl | 0) !== (a.lvl | 0)) return (b.lvl | 0) - (a.lvl | 0);
    return (Number(b.power) || 0) - (Number(a.power) || 0);
  }
  const key = col === "power" ? "power" : col === "tower" ? "tower" : col === "bosses" ? "bosses" : "power";
  return (Number(b[key]) || 0) - (Number(a[key]) || 0);
}

async function rankSync(req, res) {
  const user = auth.userFromRequest(req);
  if (!user) return json(res, 401, { msg: "Chưa đăng nhập" });
  await requireTable("rankings");

  const body = await readBody(req);
  const name = String(body.name || "").trim().slice(0, 64);
  if (!name) return json(res, 400, { msg: "Thiếu tên nhân vật" });

  // Chống trùng tên: mỗi nhân vật chỉ thuộc 1 chủ sở hữu
  const dup = await sb.select("rankings", { name: sb.eq(name), select: "id,owner" });
  if (Array.isArray(dup) && dup.length && dup[0].owner && dup[0].owner !== user.id) {
    return json(res, 409, { msg: "Tên nhân vật đã tồn tại, vui lòng chọn tên khác" });
  }

  const stamp = typeof body.updated === "string" && body.updated ? body.updated : nowISO();
  const row = {
    id: name,
    name: name,
    owner: user.id,
    fac: normFac(body.fac),
    sex: parseInt(body.sex, 10) || 0,
    lvl: parseInt(body.lvl, 10) || 0,
    reborn: parseInt(body.reborn, 10) || 0,
    power: Math.round(Number(body.power) || 0),
    tower: parseInt(body.tower, 10) || 0,
    bosses: parseInt(body.bosses, 10) || 0,
    gear: body.gear && typeof body.gear === "object" ? body.gear : {},
    updated_at: stamp
  };
  await sb.upsert("rankings", row, "id");
  return json(res, 200, { ok: true, name: name });
}

async function rankList(req, res, url) {
  await requireTable("rankings");
  const colRaw = url.searchParams.get("col") || "lvl";
  const col = RANK_COLS.indexOf(colRaw) >= 0 ? colRaw : "lvl";
  const fac = url.searchParams.get("fac") || "";

  const query = { select: "*", limit: "150" };
  if (fac) query.fac = sb.eq(fac);

  const rows = await sb.select("rankings", query);
  const list = (Array.isArray(rows) ? rows : []).slice();
  list.sort((a, b) => rankSort(a, b, col));
  return json(res, 200, { list: list, col: col, fac: fac });
}

async function rankInspect(req, res, url) {
  await requireTable("rankings");
  const name = String(url.searchParams.get("name") || "").trim();
  if (!name) return json(res, 400, { msg: "Thiếu tên nhân vật" });

  const rows = await sb.select("rankings", { name: sb.eq(name), select: "*" });
  if (!Array.isArray(rows) || !rows.length) {
    return json(res, 404, { msg: "Không tìm thấy nhân vật này" });
  }
  return json(res, 200, { char: rows[0] });
}

/* ------------------------------------------------------------------ */
/* Cấu hình server / sức khoẻ / online                                */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = { exp_rate: 1, notice: "" };

async function serverSettings(req, res) {
  try {
    const ok = await schema.ensureTable("server_settings");
    if (!ok) return json(res, 200, Object.assign({}, DEFAULT_SETTINGS));
    const rows = await sb.select("server_settings", { id: sb.eq("1"), select: "*" });
    if (!Array.isArray(rows) || !rows.length) return json(res, 200, Object.assign({}, DEFAULT_SETTINGS));
    const s = rows[0];
    return json(res, 200, {
      id: 1,
      exp_rate: Number(s.exp_rate) || 1,
      notice: String(s.notice || ""),
      updated_at: s.updated_at || null
    });
  } catch (e) {
    return json(res, 200, Object.assign({}, DEFAULT_SETTINGS));
  }
}

async function health(req, res) {
  const out = {
    ok: true,
    service: "volam-idle-server",
    version: cfg.version,
    time: nowISO(),
    db: "down",
    tables: {}
  };
  if (!cfg.hasDb) {
    out.ok = false;
    out.error = "Chưa cấu hình Supabase (SUPABASE_URL / SUPABASE_SERVICE_KEY)";
    return json(res, 200, out);
  }
  try {
    const info = await schema.load(true);
    out.tables = info.tables || {};
    out.idType = info.users ? info.users.idType : "text";
    const usersOk = await schema.ensureTable("users");
    out.db = usersOk ? "up" : "missing-tables";
    if (!usersOk) out.error = "Bảng `users` chưa tồn tại. Hãy chạy server/schema.sql trong Supabase SQL Editor.";
  } catch (e) {
    out.db = "down";
    out.error = e.message;
  }
  return json(res, 200, out);
}

async function online(req, res) {
  const players = [];
  let count = 0;
  try {
    const ok = await schema.ensureTable("chars");
    if (ok) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const rows = await sb.select("chars", { updated: "gte." + since, select: "*", limit: "500" });
      if (Array.isArray(rows)) {
        count = rows.length;
        for (const r of rows) {
          players.push({
            owner: r.owner || null,
            name: r.name || null,
            lvl: r.lvl | 0,
            fac: r.fac || null,
            updated: r.updated || null
          });
        }
      }
    }
  } catch (e) {
    console.warn("[API] /api/online lỗi:", e.message);
  }
  return json(res, 200, { count: count, players: players });
}

/* ------------------------------------------------------------------ */
/* GM (quản trị) - cần mã GM_TOKEN                                     */
/* ------------------------------------------------------------------ */

function gmCheck(req, url) {
  const header = req.headers["x-gm-token"] || req.headers["X-GM-Token"];
  const q = url.searchParams.get("token");
  const token = String(header || q || "");
  if (!cfg.gmToken) {
    const err = new Error("Máy chủ chưa cấu hình GM_TOKEN");
    err.status = 503;
    throw err;
  }
  if (token !== cfg.gmToken) {
    const err = new Error("Mã quản trị không hợp lệ");
    err.status = 403;
    throw err;
  }
  return true;
}

async function gmStats(req, res, url) {
  gmCheck(req, url);
  const out = { ok: true, counts: {}, db: "down" };
  try {
    const info = await schema.load(true);
    out.tables = info.tables || {};
    out.db = "up";
    for (const t of ["users", "saves", "rankings", "market_items", "chat"]) {
      try {
        out.counts[t] = await sb.count(t, null);
      } catch (e) {
        out.counts[t] = null;
      }
    }
  } catch (e) {
    out.db = "down";
    out.error = e.message;
  }
  return json(res, 200, out);
}

async function gmSaveSettings(req, res, url) {
  gmCheck(req, url);
  await requireTable("server_settings");
  const body = await readBody(req);
  const patch = {};
  if (body.exp_rate !== undefined) patch.exp_rate = Number(body.exp_rate) || 1;
  if (body.notice !== undefined) patch.notice = String(body.notice).slice(0, 500);
  if (!Object.keys(patch).length) return json(res, 400, { msg: "Không có dữ liệu cập nhật" });
  patch.updated_at = nowISO();

  const existing = await sb.select("server_settings", { id: sb.eq("1"), select: "id" });
  if (Array.isArray(existing) && existing.length) {
    await sb.update("server_settings", { id: sb.eq("1") }, patch);
  } else {
    await sb.insert("server_settings", Object.assign({ id: "1" }, patch));
  }
  return json(res, 200, { ok: true, settings: Object.assign({ id: 1 }, DEFAULT_SETTINGS, patch) });
}

async function gmPlayers(req, res, url) {
  gmCheck(req, url);
  const out = { ok: true, players: [] };
  try {
    const ok = await schema.ensureTable("chars");
    if (ok) {
      const rows = await sb.select("chars", { select: "*", order: "updated.desc", limit: "200" });
      out.players = Array.isArray(rows) ? rows : [];
    }
  } catch (e) {
    out.error = e.message;
  }
  return json(res, 200, out);
}

/* ------------------------------------------------------------------ */
/* Bảng định tuyến                                                      */
/* ------------------------------------------------------------------ */

const routes = [
  ["POST", "/api/auth/register", handler(authRegister)],
  ["POST", "/api/auth/login", handler(authLogin)],
  ["POST", "/api/save/upload", handler(saveUpload)],
  ["GET", "/api/save/list", handler(saveList)],
  ["GET", "/api/save/download", handler(saveDownload)],
  ["POST", "/api/rank/sync", handler(rankSync)],
  ["GET", "/api/rank/list", handler(rankList)],
  ["GET", "/api/rank/inspect", handler(rankInspect)],
  ["GET", "/api/server/settings", handler(serverSettings)],
  ["GET", "/api/health", handler(health)],
  ["GET", "/api/online", handler(online)],
  ["GET", "/api/gm/stats", handler(gmStats)],
  ["POST", "/api/gm/settings", handler(gmSaveSettings)],
  ["GET", "/api/gm/players", handler(gmPlayers)]
];

/** Xử lý 1 request API. Trả true nếu đã xử lý. */
async function handle(req, res, url) {
  const method = (req.method || "GET").toUpperCase();
  for (const [m, p, fn] of routes) {
    if (m === method && p === url.pathname) {
      await fn(req, res, url);
      return true;
    }
  }
  return false;
}

module.exports = { handle, routes, json, readBody };
