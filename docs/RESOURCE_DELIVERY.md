# Võ Lâm Idle — Tài liệu minh chứng cách hoạt động & đưa tài nguyên lên web

> Tài liệu này tổng hợp kết quả reverse-engineering runtime của bản web tại
> `https://hoainiem2003.net/vltk/` (đối chiếu với source local `D:\VolamIDLE\VolamIDLE`),
> tập trung vào: (1) cách source hoạt động, (2) cách các tài nguyên (bản đồ, kỹ năng,
> hoạt ảnh, âm thanh, …) được đưa lên web, kèm bằng chứng runtime.

- Ngày kiểm chứng: 2026-10-23
- Target: `https://hoainiem2003.net/vltk/`
- Công cụ: headless Chromium (Playwright) — goto/eval/network/console/screenshot + đọc source local.

---

## 1. Tổng quan kiến trúc

Bản web là **SPA thuần tĩnh** (không framework): một trang HTML + 8 file JS toàn cục
+ CSS, dữ liệu game nhúng trong các object toàn cục (`window.JX`, `window.JW`, …),
render bằng Canvas 2D. Không có bundler runtime — các file được phục vụ trực tiếp
từ origin, có version hash trong query string.

**Các global object chính (runtime evidence — `Object.keys`):**

| Global | Nội dung | Quy mô (runtime) |
|---|---|---|
| `JX` | dữ liệu tĩnh game | series 5, factions 11, **skills 280**, npcs 2151, items 11 (định nghĩa), **maps 992**, sets 2 (gold/platina), potions 10, shops 4, drop 20 |
| `JW` | thế giới | **zones 37**, mon 111, hero, **anim 117**, town |
| `JXLOOK` | look/hoạt ảnh nhân vật | kinds: free/melee/range/double, groups: helm/armor/weapon/horse |
| `JFX` | hiệu ứng kỹ năng/quái | **m 160** (quái), **f 241** (skill), **c 13** (common) |
| `JMO` | chướng ngại vật bản đồ | **41 zone** |
| `JS` | âm thanh | music 13, npc 79, skill 87, ui 11 |
| `RCP` | công thức | recipes 15, shards 196 |

**Script được nạp (network evidence):**
`style.css`, `world.js`, `data.js`, `rdata.js`, `jmo.js`, `sound.js`, `look.js`,
`fx.js`, `js/g.js` (engine chính). Service Worker `sw.js` được đăng ký và đang
điều khiển trang (`navigator.serviceWorker.controller` → `…/sw.js`).

---

## 2. Cách source hoạt động

### 2.1. Điểm vào & anti-piracy

- Trang game phục vụ tại `/vltk/` (tương đương `play.html` local). `<head>` khai báo
  `<link rel="manifest" href="manifest.json">` (PWA), `style.css?v=…`.
- Engine `js/g.js` chứa **domain lock** (bằng chứng trích từ bundle, đã decode):
  ```js
  const t = String(location.hostname).toLowerCase();
  const n = atob("aG9haW5pZW0yMDAzLm5ldA=="); // "hoainiem2003.net"
  if (!(t === n || t.endsWith("."+n) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(t) || …)) {
    // xoá body, hiện "Bản sao trái phép"
    throw new Error("host");
  }
  ```
  → chỉ chạy trên domain được phép (hoặc localhost), chống sao chép trái phép.
- Console log: `Võ Lâm Idle © 2026 N.T.T` (g.js).

### 2.2. Vòng lặp & render

- Render Canvas 2D (`CV`/`CX`), `img()` cache ảnh theo URL (`IMG` map).
- `frame()`/`init()` điều khiển update + draw; reserved names được bảo vệ khi obfuscate.
- Nhân vật vẽ qua `drawJxHero` (look_engine.js) — ghép nhiều sprite layer theo thứ tự
  `order` (head/hair/shoulder/body/lhand/rhand/lweapon/rweapon/horse).

### 2.3. Lưu trữ & đồng bộ

- Save local + cloud qua `/api/*` (net.js fetch `/api` + endpoint).
- `ver.json` (version `1792057110`, `v` timestamp) được poll `no-store` mỗi 60s để
  tự reload khi bảo trì xong (`checkUpdateVer`).
- Service Worker cache ảnh 7 ngày, code/CSS/HTML no-cache (xem §4).

---

## 3. Cách đưa tài nguyên lên web

### 3.1. Bản đồ (maps)

**Dữ liệu bản đồ** nằm trong `window.JW.zones` (37 zone), mỗi zone:
```js
{ "id":2, "n":"Hoa Sơn", "lo":1, "hi":10,
  "bg":"img/z/2.jpg", "sw":[20,20,20,20,20], "m":[11,12,42,43,31,5], "boss":141 }
```
- `bg`: ảnh nền JPG served tĩnh tại `img/z/{id}.jpg`.
- `sw`: tỷ lệ spawn quái theo element.
- `m`: danh sách monster id spawn.
- `boss`: boss id.

**Chướng ngại vật / tilemap** trong `window.JMO` (41 zone) — served lazy khi vào zone
(`obsLoad`). Bản đồ Tống Kim dùng `img/z/tk.jpg` + `JMO.tk`.

**Dungeon** (`js/dungeon.js`): `map:397` → `img/z/397.jpg` (dùng chung 1 ảnh nền
cho 7 phó bản, phân biệt bằng room/boss).

**Bằng chứng network (runtime):**
```
200 GET https://hoainiem2003.net/vltk/img/z/... (backgrounds)
```
và local `img/z/*.jpg` tồn tại trong repo.

### 3.2. Kỹ năng (skills)

- **Dữ liệu kỹ năng**: `JX.skills` (280 skill) trong `data.js` (bundle 1, không obfuscate).
- **Hiệu ứng kỹ năng**: `JFX` object:
  - `JFX.m` (160): hiệu ứng quái (fly/hit webp).
  - `JFX.f` (241): hiệu ứng skill (form, num, spd, pre/hit/fly).
  - `JFX.c` (13): common effect.
  - Skill state effect `JXST` (fx/st_*.webp) và `JXCS` (fx/cs_*.webp) cho curse/buff.
- Mỗi effect khai báo sprite sheet WebP + atlas metadata (n, w, h, ax, ay, ms, d):
  ```js
  "2": { "fly":{"f":"fx/m2_fly.webp","n":4,"d":16,"w":109,"h":82,"ax":53,"ay":58,"ms":56},
         "hit":{"f":"fx/m2_hit.webp","n":7,"d":1,"w":71,"h":70,"ax":34,"ay":39,"ms":56},
         "spd":360 }
  ```
- Render: `skillFx()` (render.js) đọc `JFX.f[id]`, chọn form (0–12) để spawn `mis`/`boom`
  sprite animation; `drawState()` (skillfx.js) dùng `img(t.f)` + frame slicing.

**Bằng chứng network (runtime):**
```
200 GET https://hoainiem2003.net/vltk/fx/m139_hitb.webp
200 GET https://hoainiem2003.net/vltk/fx/m139_hit.webp
200 GET https://hoainiem2003.net/vltk/fx/m135_hit.webp
200 GET https://hoainiem2003.net/vltk/fx/m135_flyb.webp
200 GET https://hoainiem2003.net/vltk/fx/m135_fly.webp
```

### 3.3. Hoạt ảnh nhân vật (look system)

- **Metadata** `JXLOOK` (look.js / look_remote.js): anchor, kinds (free/melee/range/double),
  ride, groups (helm/armor/weapon/horse), detailGroup, res (row index per item),
  none (fallback row), sets (gold/platina), have/havex (danh sách id khả dụng),
  order (thứ tự vẽ layer theo hướng), xa (animation list).
- **Sprite sheet**: `img/look/{sex}/{part}_{rowId}.webp` (ví dụ `img/look/m/body_55.webp`)
  + metadata JSON `img/look/{sex}/{part}_{rowId}.json` (chứa `a[targetAct]` với frames).
- **Loader** (`look_engine.js` → `jxLoadSprite`):
  ```js
  const path = "img/look/" + sex + "/" + partName + "_" + rowId;
  cached.img.src = path + ".webp";          // ảnh
  fetch(path + ".json")                     // atlas metadata
    .then(r => r.ok ? r.json() : null)
    .then(data => { cached.meta = data; });
  ```
  → **lazy load**: ảnh qua `<img>`, metadata qua `fetch()`, cache trong `JX_SPRITE_CACHE` Map.
- **Ghép trang bị vào row**: `jxGetItemRow(item, groupName)` tra `JXL.res[resKey][p]`
  (p = index item trong `J.items` list) hoặc set mapping `JXL.sets[kind][idx]`.
- **Render**: `drawJxHero()` ghép các part theo `order[dirKey]`, slice frame từ webp.

**Bằng chứng network (runtime):**
```
200 GET https://hoainiem2003.net/vltk/img/look/m/body_55.json
200 GET https://hoainiem2003.net/vltk/img/look/m/lhand_55.json
200 GET https://hoainiem2003.net/vltk/img/look/m/head_3.json
...
200 GET https://hoainiem2003.net/vltk/img/look/m/body_55.webp
200 GET https://hoainiem2003.net/vltk/img/look/m/head_3.webp
```
(12 JSON + 12 WEBP cho nhân vật đang hiển thị.)

### 3.4. Âm thanh

- `window.JS` (sound.js) map:
  - `music`: zone id → `music/music*.mp3`
  - `npc`: ani id → `snd/sound_a*.mp3` (hurt/die/at)
  - `skill`: skill id → sfx
  - `ui`: ui sound
- `audio.js`: Web Audio API (`AudioContext`), `fetch()` mp3 → `decodeAudioData` → buffer cache
  (`AUD.buf`), phát SFX qua `BufferSource`; nhạc nền qua `<Audio>` loop.
- `preloadZoneSounds(zone)` preload sfx của quái trong zone.

**Bằng chứng:** `js/audio.js` dùng `fetch(n)` + `AUD.ctx.decodeAudioData`.

### 3.5. UI / icon / font

- CSS sprite: `ui/*.png`, `ui/jx/*.png`, `ui/ic_*.png`, `ui/bar_*.png`,
  `ui/kc.png`, `ui/age18.png`, `ui/cursor.png`.
- Nhân vật chọn faction: `ui/chon_nv/*.webp`, `ui/tao_nv/*.webp`.
- Font: Google Fonts (Cinzel, Nunito, Playfair Display) qua `<link>` + local woff.
- Emoticon: `ui/emo.png` sprite sheet.

---

## 4. Cơ chế publish / caching / versioning

### 4.1. Build & bundling (local → web)

`build_obfuscate.js` đóng gói source thành 4 bundle:
| Bundle | Tier | Nội dung | Obfuscate |
|---|---|---|---|
| `1.data.bundle.js` | tier1 | data.js, setvi.js, setfix.js, bkvng.js, world.js, zones2.js, sound.js, fx.js, fx_bosung.js, fx_native_motion.js, fx_trangthai.js, fx_tucthoi.js, jmo.js, jmo2.js | ❌ (chỉ minify) |
| `2.skills_data.bundle.js` | tier2 | skstd.js, skills-120.js, skills-150-all.js, core.js, mapobs.js, stats.js, vocong.js, skillsys.js, kytran.js, loot.js, rdata.js, sets.js, recipes.js, procs.js | ❌ |
| `3.engine.bundle.js` | tier3 | combat.js, field.js, ride.js, save.js, guard.js, render.js, vltk_missiles.js, jxmis.js, jxstate.js, fx2.js, fx3.js, skillfx.js, vli-skill-visuals-v7.js, look.js, jxparts.js, look_engine.js, audio.js, ui.js, control.js | ✅ (JS-obfuscator: stringArray base64, splitStrings, rotate/shuffle) |
| `4.features.bundle.js` | tier4 | shop, potsel, rewards, title, realm, records, horse, thanma, duel, tyvo, tongkim, tk_battle_dev, real_tk, dungeon, giangho, forge, epdo, thuyen, mode, tabs2, auto, guide, stash, donkho, name, net, chatcfg, chat, chatcmd, market, vip, pwa, party, guild, presence, ui20, ui20win, csel, skills-120-active, tooltip, main | ✅ |

- Tên file bundle có **hash MD5 8 ký tự** (`assets/1.data.9dbf6e8f.bundle.js`) → cache busting.
- `play.html` được rewrite tự động để trỏ đúng hash.
- `ver.json.v` được cập nhật `Date.now()`.

### 4.2. HTTP caching (server/index.js)

```js
const NO_CACHE = new Set([".html", ".js", ".css", ".json", ".webmanifest"]);
// code: Cache-Control: no-cache, no-store, must-revalidate
// assets (png/jpg/webp/mp3/ogg/woff): Cache-Control: public, max-age=604800 (7 ngày)
```
- Code/data luôn no-cache → cập nhật tức thì.
- Ảnh/âm thanh cache 7 ngày → giảm tải, tăng tốc.

### 4.3. Service Worker (sw.js)

- Cache name `jxidle-v535` (code) + `jxidle-img-1` (ảnh).
- **Ảnh/âm thanh/font** (`ASSET` regex): cache-first, fetch background revalidate,
  bỏ qua nếu content-type là `text/html` (chống cache trang lỗi).
- **Code/CSS/HTML**: network-first, fallback cache.
- Bỏ qua `/sb/`, `/api/`, `/gm` (không cache API).
- `BUST` list: xóa cache của 11 ảnh cụ thể khi activate.
- `skipWaiting` + `clients.claim` → cập nhật SW ngay.

**Bằng chứng runtime:** `swController = https://hoainiem2003.net/vltk/sw.js`.

### 4.4. Version check realtime

`main.js`: `checkUpdateVer()` fetch `ver.json?t=Date.now()` (no-store), nếu `v` thay đổi
→ `location.reload()`. Poll mỗi 60s (`maintT` interval). Bảo trì: nếu `bt` true hiện banner.

---

## 5. Evidence tổng hợp

### 5.1. Network capture (runtime, truncate)

```
200 GET https://hoainiem2003.net/vltk/
200 GET https://hoainiem2003.net/vltk/style.css?v=d44e5c0249
200 GET https://hoainiem2003.net/vltk/world.js?v=65d82a91
200 GET https://hoainiem2003.net/vltk/rdata.js?v=e78e6174
200 GET https://hoainiem2003.net/vltk/jmo.js?v=36a0086d
200 GET https://hoainiem2003.net/vltk/sound.js?v=e1779ce5
200 GET https://hoainiem2003.net/vltk/look.js?v=d0c30cfd
200 GET https://hoainiem2003.net/vltk/fx.js?v=3838a4e4
200 GET https://hoainiem2003.net/vltk/img/look/m/head_3.json
200 GET https://hoainiem2003.net/vltk/img/look/m/body_55.json
200 GET https://hoainiem2003.net/vltk/img/look/m/body_55.webp
200 GET https://hoainiem2003.net/vltk/img/look/m/head_3.webp
200 GET https://hoainiem2003.net/vltk/fx/m139_hit.webp
200 GET https://hoainiem2003.net/vltk/fx/m135_fly.webp
200 GET https://hoainiem2003.net/vltk/img/pl/shaolin.png
200 GET https://hoainiem2003.net/vltk/img/pl/tianwang.png
200 POST https://hoainiem2003.net/vltk/api/?action=online
```
→ Tất cả tài nguyên là **static file GET** theo convention path; không có CDN riêng,
không có asset manifest động — URL suy ra từ dữ liệu (id → path).

### 5.2. Console (runtime)

```
[2026-10-23] log: Võ Lâm Idle © 2026 N.T.T — bản quyền thuộc về N.T.T
```

### 5.3. Screenshot

Ảnh chụp màn hình runtime đã lưu tại (server-local):
`C:\Users\TPHAN\AppData\Local\Temp\opencode-browser-6hkgdM\screenshot.png`
(trang game hiển thị canvas + UI, xác nhận load thành công.)

### 5.4. Aggregate runtime (eval)

Xem bảng §1 — số liệu lấy trực tiếp từ `window.*` trên trang live.

---

## 6. Bảng tóm tắt đường dẫn tài nguyên

| Loại tài nguyên | Đường dẫn pattern | Dữ liệu điều khiển | Cache |
|---|---|---|---|
| Bản đồ nền | `img/z/{zoneId}.jpg` | `JW.zones[].bg` | 7 ngày (HTTP) + SW |
| Chướng ngại vật | `img/z/...` + JMO data | `JMO[zoneId]` | 7 ngày |
| Phó bản | `img/z/397.jpg` (chung) | `DUNGEONS[].map` | 7 ngày |
| Tống Kim | `img/z/tk.jpg` | `TK_MAP_BG` | 7 ngày |
| Nhân vật sprite | `img/look/{m|f}/{part}_{row}.webp` + `.json` | `JXLOOK.res/sets/have` | 7 ngày |
| Hiệu ứng skill/quái | `fx/m{id}_{fly|hit}.webp` | `JFX.m/f/c` | 7 ngày |
| Hiệu ứng trạng thái | `fx/st_{n}.webp`, `fx/cs_{n}.webp` | `JXST`, `JXCS` | 7 ngày |
| Bẫy native | `fx/trap_native_{id}.webp` | `JFX_NATIVE_MOTION` | 7 ngày |
| Âm thanh SFX | `snd/sound_a{id}_{hurt|die|at}.mp3` | `JS.npc` | 7 ngày |
| Nhạc nền | `music/music{id}.mp3` | `JS.music` | 7 ngày |
| UI icon | `ui/*.png`, `ui/jx/*.png`, `ui/ic_*.png` | CSS | 7 ngày |
| Nhân vật chọn faction | `ui/chon_nv/*.webp`, `ui/tao_nv/*.webp` | `FOCUS_SPRITES` | 7 ngày |
| Code/data | `*.js?v={hash}` | build_obfuscate.js | no-cache |
| PWA manifest | `manifest.json` | — | no-cache |

---

## 7. Kết luận

1. **Source hoạt động** như một SPA Canvas 2D: dữ liệu nhúng trong global object, render
   frame-based, save/cloud qua REST `/api`, realtime version-check qua `ver.json`.
2. **Tài nguyên được "đưa lên web" theo convention path tĩnh**: id trong data → URL suy ra
   (`img/z/{id}.jpg`, `img/look/{sex}/{part}_{row}.webp`, `fx/m{id}_fly.webp`, …),
   served trực tiếp từ origin, **không qua CDN/asset server**.
3. **Hoạt ảnh** dùng sprite sheet WebP + atlas JSON lazy-load + cache Map; nhân vật ghép
   nhiều layer theo thứ tự `JXLOOK.order`.
4. **Kỹ năng** = data (`JX.skills`) + FX metadata (`JFX`) + sprite sheet; render theo
   `form` (0–12) cho missile/boom.
5. **Publish pipeline**: `build_obfuscate.js` → 4 bundle (hash MD5 trong tên) → rewrite
   `play.html` → bump `ver.json`; server phân biệt no-cache (code) vs 7 ngày (media);
   SW cache-first media / network-first code; domain lock chống sao chép.

---

*Nguồn: runtime live `hoainiem2003.net/vltk/` + source local `D:\VolamIDLE\VolamIDLE`
(src_archive, js, server, build_obfuscate.js).*
