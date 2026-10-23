"use strict";
/**
 * Võ Lâm Idle - Chạy máy chủ thật + PostgREST giả lập (dùng để thử tay offline)
 *
 * Chạy:  node server/test/dev-mock-server.js
 *   -> Game:      http://localhost:8080/play.html
 *   -> GM Panel:  http://localhost:8080/gm?token=45ee7406856f702ada59e06b44941c6a
 *
 * Dữ liệu nằm trong RAM nên mất khi tắt chương trình.
 */

const path = require("path");
const { spawn } = require("child_process");
const { makeMock } = require("./mock-postgrest");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = process.env.PORT || "8080";

(async () => {
  const mock = makeMock();
  const mockPort = await mock.listen(0);
  console.log("  PostgREST giả lập: http://127.0.0.1:" + mockPort);

  const env = Object.assign({}, process.env, {
    SUPABASE_URL: "http://127.0.0.1:" + mockPort,
    SUPABASE_SERVICE_KEY: "dev-mock-service-role-key",
    TOKEN_SECRET: "dev-mock-token-secret",
    PORT: PORT,
    HOST: "127.0.0.1"
  });
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: ROOT,
    env: env,
    stdio: "inherit"
  });
  process.on("SIGINT", () => { child.kill(); mock.close().then(() => process.exit(0)); });
})();
