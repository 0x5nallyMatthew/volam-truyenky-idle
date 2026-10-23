"use strict";
/**
 * Võ Lâm Idle - Máy chủ (Phase 1)
 *
 * Chạy:  node server/index.js
 * Mở:   http://localhost:8080/play.html
 *
 * Máy chủ này gộp 3 việc:
 *   1. Phục vụ file tĩnh của game (thay thế local_server.js)
 *   2. Cung cấp API /api/*  (đăng ký, đăng nhập, lưu đám mây, xếp hạng, cấu hình server)
 *   3. Phục vụ trang quản trị /gm và proxy PostgREST /api/sb/*
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const cfg = require("./config");
const api = require("./api");
const sbProxy = require("./sb");
const gm = require("./gm");
const schema = require("./schema");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const NO_CACHE = new Set([".html", ".js", ".css", ".json", ".webmanifest"]);

/** Phục vụ file tĩnh */
function serveStatic(req, res, url) {
  let rawPath = decodeURIComponent(url.pathname.split("?")[0]);
  if (rawPath === "/" || rawPath === "") rawPath = "/play.html";
  if (rawPath.endsWith("/")) rawPath += "index.html";

  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(cfg.root, safePath);

  // Chặn truy cập ra ngoài thư mục dự án
  if (!filePath.startsWith(cfg.root)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 Truy cập bị từ chối");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Không tìm thấy: " + rawPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stats.size
    };
    if (NO_CACHE.has(ext)) {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
      headers["Pragma"] = "no-cache";
    } else {
      headers["Cache-Control"] = "public, max-age=604800";
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function applyCors(req, res) {
  if (!cfg.corsOrigin) return;
  res.setHeader("Access-Control-Allow-Origin", cfg.corsOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gm-token, Prefer");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (e) {
    res.writeHead(400);
    return res.end("400 URL không hợp lệ");
  }

  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // 1. API chính
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/sb" && url.pathname.indexOf("/api/sb/") !== 0) {
      const done = await api.handle(req, res, url);
      if (!done) {
        api.json(res, 404, { msg: "API không tồn tại: " + url.pathname });
      }
      return;
    }

    // 2. Proxy PostgREST tương thích Supabase
    if (url.pathname.indexOf("/api/sb/") === 0) {
      await sbProxy.handle(req, res, url);
      return;
    }

    // 3. Trang quản trị
    if (url.pathname === "/gm" || url.pathname === "/gm/") {
      gm.handle(req, res, url);
      return;
    }

    // 4. File tĩnh
    serveStatic(req, res, url);
  } catch (e) {
    console.error("[SERVER] " + (req.method || "?") + " " + url.pathname + " -> " + (e && e.message));
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ msg: "Lỗi máy chủ: " + (e && e.message ? e.message : "không rõ") }));
    } else {
      try { res.end(); } catch (e2) {}
    }
  }
});

// Hook cho WebSocket (giai đoạn 2 - realtime). Hiện tại chỉ từ chối kết nối WS.
server.on("upgrade", (req, socket) => {
  try {
    socket.write("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n");
    socket.destroy();
  } catch (e) {
    try { socket.destroy(); } catch (e2) {}
  }
});

function banner() {
  const line = "─".repeat(52);
  console.log("");
  console.log("  ⚔️  " + line);
  console.log("   VÕ LÂM IDLE - Máy chủ " + cfg.version);
  console.log("  " + line);
  console.log("   🌐 Game      : http://localhost:" + cfg.port + "/play.html");
  console.log("   🛠️  GM Panel  : http://localhost:" + cfg.port + "/gm?token=" + (cfg.gmToken || "<chưa cấu hình>"));
  console.log("   📡 API       : http://localhost:" + cfg.port + "/api/health");
  console.log("   🗄️  Supabase  : " + (cfg.hasDb ? cfg.supabaseUrl : "⚠ CHƯA CẤU HÌNH (server/config.json)"));
  if (!cfg.hasDb) {
    console.log("   ⚠  Server sẽ chạy nhưng mọi tính năng online sẽ báo lỗi.");
    console.log("   📖 Xem server/README.md để cấu hình.");
  }
  console.log("  " + line);
  console.log("");
}

server.listen(cfg.port, cfg.host, async () => {
  banner();
  if (cfg.hasDb) {
    try {
      const info = await schema.load();
      const missing = Object.keys(info.tables || {}).filter(k => info.tables[k] === false);
      if (info.error) console.log("  ⚠  Không đọc được schema Supabase: " + info.error);
      else if (missing.length) console.log("  ⚠  Thiếu bảng: " + missing.join(", ") + " → hãy chạy server/schema.sql trong Supabase SQL Editor.");
      else console.log("  ✅ Đã kết nối Supabase, sẵn sàng phục vụ.");
    } catch (e) {
      console.log("  ⚠  Lỗi kiểm tra Supabase: " + (e && e.message ? e.message : e));
    }
  }
});

process.on("SIGINT", () => {
  console.log("\n  Đang tắt máy chủ...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
