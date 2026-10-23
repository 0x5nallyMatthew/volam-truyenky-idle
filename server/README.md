# Võ Lâm Idle - Máy chủ (Server)

Máy chủ Node.js cho game Võ Lâm Idle: phục vụ file game + API đăng nhập / lưu đám mây /
xếp hạng, dữ liệu nằm trong **Supabase** của bạn.

> Phase 1 (giai đoạn hiện tại): HTTP API + trang quản trị.
> Realtime (WebSocket) và Tống Kim 10v10 sẽ bổ sung ở các phase sau.

## 1. Yêu cầu

- Node.js v20 trở lên (đã kiểm tra với Node v24) — **không cần cài thêm thư viện nào**.
- Một project Supabase (đã có sẵn hoặc tạo mới ở [supabase.com](https://supabase.com)).

## 2. Tạo bảng trong Supabase

1. Vào Supabase Dashboard → **SQL Editor** → **New query**
2. Dán toàn bộ nội dung file `server/schema.sql` → **Run**
3. Kiểm tra bằng lệnh:

```bash
node server/check.js
```

Script `schema.sql` chạy lại nhiều lần được và **không xoá dữ liệu cũ**.

## 3. Cấu hình kết nối

File `server/config.json` đã có sẵn — chỉ cần dán key của bạn vào:

```json
{
  "supabaseUrl": "https://abcxyz.supabase.co",
  "supabaseServiceKey": "eyJhbGciOi...service_role...",
  "gmToken": "45ee7406856f702ada59e06b44941c6a"
}
```

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `supabaseUrl` | ✅ | URL project Supabase |
| `supabaseServiceKey` | ✅ | Key `service_role` (Supabase Dashboard → Project Settings → API). Chỉ dùng ở server, **không** đưa vào client |
| `supabaseKey` | ⬜ | Key `anon` — chỉ dùng khi không có service key |
| `tokenSecret` | ⬜ | Chuỗi ký token. Bỏ trống thì server tự sinh và lưu vào `server/.secret` |
| `gmToken` | ✅ | Mã truy cập trang `/gm`. Đặt `""` để **tắt hẳn** trang quản trị |
| `port` / `host` | ⬜ | Mặc định `8080` / `0.0.0.0` |
| `corsOrigin` | ⬜ | Cho phép domain khác gọi API (mặc định chỉ cùng origin) |

Cũng có thể dùng biến môi trường thay cho file: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`SUPABASE_KEY`, `TOKEN_SECRET`, `GM_TOKEN`, `PORT`, `HOST`, `CORS_ORIGIN`.

> ⚠️ `server/config.json` và `server/.secret` chứa bí mật — đừng chia sẻ hay commit lên git.

> 💡 Mặc định `gmToken` trùng với mã client đang hardcode (`js/ui.js`) nên nút GM trong game vẫn
> mở được ngay. Nếu bạn **đổi mã này**, hãy sửa luôn `js/ui.js` (dòng mở `/gm?token=...`)
> rồi chạy lại `node build_obfuscate.js`.

## 4. Chạy máy chủ

```bash
node server/index.js
```

- Game: <http://localhost:8080/play.html>
- API: <http://localhost:8080/api/health>
- GM Panel: <http://localhost:8080/gm?token=GM_TOKEN_CUA_BAN>

Trên Windows có thể chạy thẳng `Chay_Game.bat` (nó sẽ mở trình duyệt và khởi động server).

## 5. API có sẵn

| Method | Đường dẫn | Body / Query | Trả về |
|---|---|---|---|
| POST | `/api/auth/register` | `{username,password}` | `{user:{id,username}, token}` |
| POST | `/api/auth/login` | `{username,password}` | `{user:{id,username}, token}` |
| POST | `/api/save/upload` | `{slot,name,lvl,fac,data,updated}` | `{ok,updated}` |
| GET | `/api/save/list` | — | `{list:[{slot,name,lvl,reborn,power,fac,updated}]}` |
| GET | `/api/save/download` | `?slot=N` | `{data,updated}` |
| POST | `/api/rank/sync` | `{name,fac,sex,lvl,reborn,power,tower,bosses,gear}` | `{ok,name}` |
| GET | `/api/rank/list` | `?col=lvl&fac=tangmen` | `{list:[...]}` |
| GET | `/api/rank/inspect` | `?name=X` | `{char}` |
| GET | `/api/server/settings` | — | `{exp_rate,notice}` |
| GET | `/api/health` | — | `{ok,db,tables,time}` |
| GET | `/api/online` | — | `{count,players}` |
| GET | `/api/gm/stats` | header `x-gm-token` | `{counts,tables}` |
| POST | `/api/gm/settings` | header `x-gm-token`, `{exp_rate,notice}` | `{ok,settings}` |
| GET | `/api/gm/players` | header `x-gm-token` | `{players}` |
| ANY | `/api/sb/<table>` | PostgREST-compatible | dùng cho market/chat/guild ở phase sau |

Header xác thực: `Authorization: Bearer <token>` (token lấy từ `/api/auth/login`).

### Chuỗi lỗi quan trọng

Client bắt chuỗi trong thông điệp lỗi, vì vậy server giữ nguyên các từ khoá:

| Tình huống | Thông điệp server | HTTP |
|---|---|---|
| Trùng tên đăng ký | `Tên đăng ký đã tồn tại` | 409 |
| Sai mật khẩu | `Mật khẩu không chính xác!` | 401 |
| Không có tài khoản | `Tài khoản không tồn tại` | 404 |
| Không có bản lưu | `Bản lưu không tồn tại trên Cloud` | 404 |
| Trùng tên nhân vật | `Tên nhân vật đã tồn tại, vui lòng chọn tên khác` | 409 |
| Thiếu bảng trong DB | `Bảng \`saves\` chưa tồn tại...` | 503 |

## 6. Bảo mật

- Mật khẩu được băm bằng **scrypt** (`node:crypto`), không lưu bản rõ.
  Bản ghi cũ (client cũ lưu mật khẩu thô) sẽ tự được nâng cấp sang scrypt ngay lần đăng nhập đầu tiên.
- Token ký bằng HMAC-SHA256, hạn 30 ngày.
- Service key chỉ nằm trong máy chủ, client chỉ gọi qua `/api/*` — không lộ key ra gói JS.
- Bảng `users`/`saves` bật RLS, không có policy cho `anon` ⇒ key `anon` không đọc/ghi được.
- Trang `/gm` kiểm tra `GM_TOKEN` (query `?token=` hoặc header `x-gm-token`).

## 7. Cấu trúc thư mục

```
server/
  index.js      máy chủ HTTP (file tĩnh + API + /gm + proxy /api/sb)
  config.js     đọc cấu hình (env > config.json > mặc định)
  supabase.js   client PostgREST tự viết (fetch, không cần SDK)
  schema.js     dò cấu trúc bảng Supabase (id uuid/text, bảng nào tồn tại)
  auth.js       scrypt + token HMAC
  api.js        các route /api/*
  sb.js         proxy PostgREST tương thích Supabase (/api/sb/*)
  gm.js         trang quản trị
  schema.sql    DDL tạo bảng (chạy trong Supabase SQL Editor)
  check.js      script kiểm tra cấu hình + kết nối
  test/
    run-tests.js       bộ kiểm thử end-to-end (50 case)
    mock-postgrest.js  PostgREST giả lập để test không cần Supabase
    dev-mock-server.js chạy server thật + PostgREST giả lập để thử tay
  README.md     file này
```

## 8. Kiểm thử

```bash
node server/test/run-tests.js
```

Bộ test tự dựng PostgREST giả lập + khởi chạy máy chủ thật (tiến trình con) rồi kiểm tra
trọn luồng: đăng ký, đăng nhập, lưu đám mây, xếp hạng, cấu hình GM, proxy, trang `/gm`,
phục vụ file tĩnh và chặn path traversal.

Muốn thử tay mà chưa có Supabase:

```bash
node server/test/dev-mock-server.js
```

## 9. Ghi chú triển khai

- Muốn chạy nhiều máy cùng lúc: chạy `node server/index.js` trên mỗi máy, hoặc dùng PM2.
- Khi đưa lên VPS, nhớ chuyển sang HTTPS + `wss://` cho WebSocket (phase realtime).
- `PORT` khác 8080 thì sửa `Chay_Game.bat` cho khớp.

## 10. Các giai đoạn tiếp theo

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| P1 | Máy chủ HTTP + API (đăng nhập, lưu đám mây, xếp hạng, cấu hình GM) + trang `/gm` | ✅ xong |
| P2 | Realtime WebSocket (presence, chat thế giới, tổ đội, bang hội) — mở lại `js/presence.js`, bật `sbCall()` qua proxy `/api/sb` | ⬜ chưa làm |
| P3 | Thế giới chung / Tống Kim 10v10 (`js/shared_world.js`, `window.SHARED_WORLD`) | ⬜ chưa làm |
| P4 | GM panel đầy đủ phía server (ban nick, ban IP, cấp quyền, log) | ⬜ chưa làm |
