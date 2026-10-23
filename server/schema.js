"use strict";
/**
 * Võ Lâm Idle - Dò cấu trúc bảng trong Supabase
 *
 * Supabase đã có sẵn có thể dùng nhiều kiểu cột (uuid / text) và nhiều bảng có thể
 * thiếu. Module này đọc OpenAPI schema của PostgREST 1 lần rồi cache lại, để server
 * tự thích ứng: biết bảng nào tồn tại, cột nào có, kiểu id là uuid hay text.
 */

const sb = require("./supabase");

const TABLES = ["users", "saves", "rankings", "market_items", "chat", "chars", "server_settings"];

let cache = null;

function pickDefs(spec) {
  if (!spec || typeof spec !== "object") return {};
  if (spec.definitions && typeof spec.definitions === "object") return spec.definitions;
  if (spec.components && spec.components.schemas && typeof spec.components.schemas === "object") {
    return spec.components.schemas;
  }
  return {};
}

/** Đọc & cache schema. Trả về null nếu chưa cấu hình/không kết nối được. */
async function load(force) {
  if (cache && !force) return cache;
  const info = {
    ok: false,
    tables: {},
    users: { idType: "text", hasPassHash: false, hasPassword: false, columns: [] },
    saves: { userIdType: "text", columns: [] },
    rankings: { columns: [] }
  };
  try {
    const spec = await sb.spec();
    const defs = pickDefs(spec);
    for (const t of Object.keys(defs)) {
      const props = (defs[t] && defs[t].properties) || {};
      const cols = Object.keys(props);
      info.tables[t] = cols;
    }
    for (const t of TABLES) {
      if (!info.tables[t]) info.tables[t] = null; // chưa biết -> coi như thiếu, sẽ xác minh bằng tableExists
    }

    // users
    const usersDef = defs["users"];
    if (usersDef && usersDef.properties) {
      const u = usersDef.properties;
      info.users.columns = Object.keys(u);
      info.users.hasPassHash = !!u["pass_hash"];
      info.users.hasPassword = !!u["password"];
      info.users.idType = u["id"] && u["id"].format === "uuid" ? "uuid" : "text";
    }

    // saves
    const savesDef = defs["saves"];
    if (savesDef && savesDef.properties) {
      const s = savesDef.properties;
      info.saves.columns = Object.keys(s);
      info.saves.userIdType = s["user_id"] && s["user_id"].format === "uuid" ? "uuid" : "text";
    }

    // rankings
    const rankDef = defs["rankings"];
    if (rankDef && rankDef.properties) {
      info.rankings.columns = Object.keys(rankDef.properties);
    }

    info.ok = true;
  } catch (e) {
    info.error = e && e.message ? e.message : String(e);
  }
  cache = info;
  return cache;
}

function get() {
  return cache;
}

/** Kiểm tra bảng có tồn tại thật không (gọi 1 lần, cache kết quả) */
async function ensureTable(table) {
  const info = await load();
  if (info.tables && Object.prototype.hasOwnProperty.call(info.tables, table)) {
    const cols = info.tables[table];
    if (cols === null) {
      const exists = await sb.tableExists(table);
      info.tables[table] = exists ? [] : false;
      return exists;
    }
    return true;
  }
  const exists = await sb.tableExists(table);
  info.tables[table] = exists ? [] : false;
  return exists;
}

function tableMissing(table) {
  const info = get();
  if (!info) return false;
  return info.tables && info.tables[table] === false;
}

module.exports = { load, get, ensureTable, tableMissing, TABLES };
