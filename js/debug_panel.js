"use strict";
(function () {
  function isDebugAllowed() {
    try {
      const t = String(location.hostname || "").toLowerCase();
      if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(t)) return true;
      if (localStorage.getItem("gm_token")) return true;
      if (typeof netOn === "function" && !netOn()) return true;
    } catch (e) {}
    return false;
  }
  if (!isDebugAllowed()) return;

  function ensurePanel() {
    if (document.getElementById("dbgFab")) return;
    const fab = document.createElement("button");
    fab.id = "dbgFab";
    fab.textContent = "Test";
    fab.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:92px;z-index:9999;padding:6px 14px;border-radius:14px;border:1px solid #e6c67a;background:#1a221e;color:#ffe08a;font:700 12px Tahoma,Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px #000a;";
    document.body.appendChild(fab);

    const panel = document.createElement("div");
    panel.id = "dbgPanel";
    panel.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:128px;z-index:9999;display:none;flex-direction:column;gap:6px;padding:10px;border-radius:8px;border:1px solid #e6c67a;background:#0d1318;box-shadow:0 4px 16px #000c;min-width:220px;align-items:stretch;";
    panel.innerHTML = `
      <div style="color:#e6c67a;font:700 13px Tahoma,Arial,sans-serif;margin-bottom:4px;text-align:center">Bang Test</div>
      <button class="btn sm" data-dbg="lvl180">Thang cap 180</button>
      <button class="btn sm" data-dbg="items">Hien thi tat ca vat pham</button>
      <button class="btn sm" data-dbg="faction">Doi mon phai</button>
      <button class="btn sm" data-dbg="books">Mat tich / Ky nang tran phai</button>
      <button class="btn sm" data-dbg="horse">Ruong ngua</button>
      <button class="btn sm" data-dbg="vip" style="background:#3a2a10;border-color:#ffd24a;color:#ffd24a">Lay do VIP (Hoang Kim)</button>
      <button class="btn sm" data-dbg="hoangkim90" style="background:#2a1a3a;border-color:#c896ff;color:#c896ff">Bo Hoang Kim 90</button>
      <button class="btn sm" data-dbg="equipbest" style="background:#1a3a2a;border-color:#6aff9a;color:#9affc8">Mac do tot nhat</button>
      <button class="btn sm" data-dbg="unequip" style="background:#3a1a1a;border-color:#ff6a6a;color:#ff9a9a">Thao het do dang mac</button>
      <button class="btn sm" data-dbg="close" style="margin-top:4px">Dong</button>
    `;
    document.body.appendChild(panel);

    fab.onclick = function() { panel.style.display = panel.style.display === "none" ? "flex" : "none"; };
    panel.querySelectorAll("[data-dbg]").forEach(function(b) {
      b.onclick = function() { handle(b.dataset.dbg); };
    });
  }

  function handle(act) {
    if (act === "close") { document.getElementById("dbgPanel").style.display = "none"; return; }
    if (!S || (!S.fac && act !== "faction")) { if (toast) toast("Chua co nhan vat"); return; }

    if (act === "lvl180") {
      if (typeof cmdSetLevel === "function") cmdSetLevel(180);
      else { S.lvl = 180; S.xp = 0; if (typeof recalc === "function") recalc(); if (typeof save === "function") save(); }
      if (toast) toast("Da thang cap 180");
      return;
    }

    if (act === "items") {
      if (typeof cmdPicker === "function") cmdPicker("");
      else if (toast) toast("Khong co cmdPicker");
      return;
    }

    if (act === "faction") {
      if (typeof modal !== "function") { if (toast) toast("Khong co modal"); return; }
      const facs = (typeof JX !== "undefined" && JX.factions) ? JX.factions : [];
      const list = facs.map(function(f) { return f.key; });
      const names = facs.map(function(f) { return f.n; });
      const html = "<h3>Doi mon phai (Test)</h3><div style=\"max-height:52vh;overflow:auto\">" +
        list.map(function(k, i) { return "<button class=\"btn sm\" data-fac=\"" + esc(k) + "\" style=\"display:block;width:100%;margin-bottom:6px;text-align:left\">" + esc(names[i]) + "</button>"; }).join("") +
        "</div>";
      modal(html, function() {
        document.querySelectorAll("#mBody [data-fac]").forEach(function(b) {
          b.onclick = function() {
            const k = b.dataset.fac;
            S.fac = k;
            S.sk = {}; S.skPts = (S.skPts || 0) + 5; S.main = 0; S.mainLock = false;
            if (typeof recalc === "function") recalc();
            if (typeof save === "function") save();
            if (typeof refresh === "function") refresh();
            if (toast) toast("Da doi mon phai: " + k);
            if (typeof closeModal === "function") closeModal(true);
          };
        });
      });
      return;
    }

    if (act === "books") {
      if (typeof modal !== "function") { if (toast) toast("Khong co modal"); return; }
      const tr = [];
      const fac = (typeof JX !== "undefined" && JX.factions) ? JX.factions.find(function(f) { return f.key === S.fac; }) : null;
      if (fac && Array.isArray(fac.skills)) {
        fac.skills.forEach(function(id) {
          const sk = (typeof SK !== "undefined" ? SK[id] : null);
          if (sk && sk.tier === 90) tr.push({ id: id, n: sk.n });
        });
      }
      const html = "<h3>Mat tich / Ky nang tran phai (Test)</h3>" +
        "<div class=\"btnrow\" style=\"flex-wrap:wrap\">" +
          "<button class=\"btn sm\" data-book=\"vlmt\">VLMT x1</button>" +
          "<button class=\"btn sm\" data-book=\"ttk\">TTK x1</button>" +
          "<button class=\"btn sm\" data-book=\"all90\">Hoc tat ca tran phai (90)</button>" +
          "<button class=\"btn sm\" data-book=\"skpts\">+50 diem ky nang</button>" +
        "</div>" +
        "<div style=\"margin-top:8px\" class=\"small dim\">Tran phai: " + (tr.map(function(t) { return t.n; }).join(", ") || "—") + "</div>";
      modal(html, function() {
        document.querySelectorAll("#mBody [data-book]").forEach(function(b) {
          b.onclick = function() {
            const k = b.dataset.book;
            if (k === "vlmt" || k === "ttk") {
              if (typeof matAdd === "function") matAdd("misc", k, 1);
              if (typeof bookUse === "function") bookUse(k);
            } else if (k === "all90") {
              tr.forEach(function(t) { if (typeof SK !== "undefined" && SK[t.id]) { S.sk = S.sk || {}; S.sk[t.id] = Math.max(1, S.sk[t.id] || 0); } });
              if (typeof recalc === "function") recalc();
            } else if (k === "skpts") {
              S.skPts = (S.skPts || 0) + 50;
            }
            if (typeof save === "function") save();
            if (typeof refresh === "function") refresh();
            if (toast) toast("Da ap dung: " + k);
          };
        });
      });
      return;
    }

    if (act === "horse") {
      if (typeof horseBoxUse === "function") {
        horseBoxUse(1);
        if (toast) toast("Da mo 1 Ruong Ngua");
      } else {
        if (typeof matAdd === "function") matAdd("misc", "rngua", 1);
        if (toast) toast("Da them Ruong Ngua (chua mo)");
      }
      if (typeof save === "function") save();
      if (typeof refresh === "function") refresh();
      return;
    }

    if (act === "vip") {
      if (typeof JX === "undefined" || !JX.sets || !JX.sets.gold) { if (toast) toast("Khong co du lieu sets.gold"); return; }
      const fac = JX.factions ? JX.factions.find(function(f) { return f.key === S.fac; }) : null;
      const series = fac ? fac.series : null;
      if (series == null) { if (toast) toast("Khong xac dinh mon phai"); return; }
      const gold = JX.sets.gold.filter(function(g) { return g.s === series; });
      const best = {};
      for (const it of gold) {
        if (!best[it.d] || it.k > best[it.d].k || (it.k === best[it.d].k && it.lvl > best[it.d].lvl)) {
          best[it.d] = it;
        }
      }
      const parts = Object.values(best);
      if (!parts.length) { if (toast) toast("Khong co do Hoang Kim cho mon phai nay"); return; }
      let given = 0;
      for (const it of parts) {
        if (typeof makeItem === "function") {
          const obj = makeItem(it.d, it.k, it.lvl, 0, series);
          if (obj) {
            obj.n = it.n;
            obj.ic = it.ic || obj.ic;
            obj.set = { kind: "gold", grp: it.grp, n1: it.n1 || 99, n2: it.n2 || 99, sid: it.sid };
            obj.r = 4;
            S.inv.push(obj); given++; invDirty = true;
            const slot = (typeof DETAIL_SLOT !== "undefined") ? DETAIL_SLOT[obj.d] : null;
            if (slot) S.eq[slot] = obj;
          }
        }
      }
      if (typeof recalc === "function") recalc();
      if (typeof save === "function") save();
      if (typeof renderInv === "function") renderInv();
      if (typeof renderInv20 === "function") try { renderInv20(); } catch (e) {}
      if (typeof renderChar === "function") renderChar();
      if (typeof renderChar20 === "function") try { renderChar20(); } catch (e) {}
      if (typeof refresh === "function") refresh();
      if (toast) toast("Da nhan " + given + " mon Hoang Kim (" + (fac ? fac.n : S.fac) + ")");
      return;
    }

    if (act === "hoangkim90") {
      const norm = function(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
      const targets = [
        "Ma Hoàng Kim Giáp Khôi",
        "Ma Hoàng án Xuất Hổ Hạng Khuyên",
        "Ma Hoàng Khê Cốc Thúc Yêu Đái",
        "Ma Hoàng Huyết Y Thú Trạc",
        "Ma Hoàng Đăng Đạp Ngoa",
      ];
      const targetNorms = targets.map(norm);
      const picked = [];
      for (const tn of targetNorms) {
        const cands = JX.sets.gold.filter(function(g) { return norm(g.n) === tn; });
        if (!cands.length) continue;
        cands.sort(function(a, b) { return (b.k - a.k) || (b.lvl - a.lvl); });
        picked.push(cands[0]);
      }
      const ringCands = JX.sets.gold.filter(function(g) { return norm(g.n) === norm("Vô Danh Chỉ Hoàn"); });
      ringCands.sort(function(a, b) { return (b.k - a.k) || (b.lvl - a.lvl); });
      if (ringCands.length) { picked.push(ringCands[0]); picked.push(ringCands[0]); }

      const weaponCands = JX.sets.gold.filter(function(g) { return g.d === 0 || g.d === 1; });
      weaponCands.sort(function(a, b) { return (b.k - a.k) || (b.lvl - a.lvl); });
      // Vu khi cung pham voi mon phai: moi loai (Con/Dao/Thuong/Tien...) 1 mon, dong bang Hoang Kim 90 (cua 80-99)
      const wFac = JX.factions.find(function(f) { return f.key === S.fac; }) || {};
      const wFacId = wFac.id;
      const wpLv = function(r) { const e = (r.req || []).find(function(q) { return q[0] === 36; }); return e ? e[1] : 0; };
      const wpFacOf = function(r) { const e = (r.req || []).find(function(q) { return q[0] === 39; }); return e ? e[1] : -1; };
      if (wFacId != null) {
        const wpAll = weaponCands.filter(function(r) { return wpFacOf(r) === wFacId && wpLv(r) >= 80 && wpLv(r) <= 99 && r.n.indexOf("[") < 0; });
        const wpBest = {};
        for (const r of wpAll) {
          const cur = wpBest[r.k];
          if (!cur || wpLv(r) > wpLv(cur) || (wpLv(r) === wpLv(cur) && r.k > cur.k)) wpBest[r.k] = r;
        }
        const wpPicks = Object.values(wpBest).sort(function(a, b) { return wpLv(b) - wpLv(a) || (b.k - a.k); });
        if (wpPicks.length) { for (const r of wpPicks) picked.push(r); }
        else picked.push(weaponCands[0]);
      } else if (weaponCands.length) picked.push(weaponCands[0]);

      const armorCands = JX.sets.gold.filter(function(g) { return g.d === 2; });
      armorCands.sort(function(a, b) { return (b.k - a.k) || (b.lvl - a.lvl); });
      if (armorCands.length) picked.push(armorCands[0]);

      const pendantCands = JX.sets.gold.filter(function(g) { return g.d === 9; });
      pendantCands.sort(function(a, b) { return (b.k - a.k) || (b.lvl - a.lvl); });
      if (pendantCands.length) picked.push(pendantCands[0]);

      if (!picked.length) { if (toast) toast("Khong tim thay items"); return; }
      let given = 0;
      for (const it of picked) {
        let obj = null;
        if (typeof makeItem === "function") {
          obj = makeItem(it.d, it.k, it.lvl, 0, (JX.factions.find(function(f) { return f.key === S.fac; }) || {}).series);
        }
        if (obj) {
          obj.n = it.n;
          obj.ic = it.ic || obj.ic;
          obj.set = { kind: "gold", grp: it.grp, n1: it.n1 || 99, n2: it.n2 || 99, sid: it.sid };
          obj.r = 4;
          S.inv.push(obj); given++; invDirty = true;
        }
      }
      if (typeof recalc === "function") recalc();
      if (typeof save === "function") save();
      if (typeof renderInv === "function") renderInv();
      if (typeof renderInv20 === "function") try { renderInv20(); } catch (e) {}
      if (typeof renderChar === "function") renderChar();
      if (typeof renderChar20 === "function") try { renderChar20(); } catch (e) {}
      if (typeof refresh === "function") refresh();
      if (toast) toast("Da nhan " + given + " mon Bo Hoang Kim 90 (" + picked.map(function(p) { return p.n; }).join(", ") + ")");
      return;
    }

    if (act === "equipbest") {
      if (!S || !S.inv) { if (toast) toast("Chua co nhan vat"); return; }
      let equipped = 0;
      const slots = ["weapon", "armor", "helm", "boot", "belt", "cuff", "amulet", "pendant", "ring"];
      for (const sl of slots) {
        let best = null, bestPow = -1;
        for (const it of S.inv) {
          if (!it) continue;
          const s = (typeof DETAIL_SLOT !== "undefined") ? DETAIL_SLOT[it.d] : null;
          if (s !== sl) continue;
          const p = (typeof power === "function" && typeof calc === "function") ? power(calc(Object.assign({}, S.eq, { [sl]: it }))) : 0;
          if (p > bestPow) { bestPow = p; best = it; }
        }
        if (best) {
          const idx = S.inv.indexOf(best);
          if (idx >= 0) S.inv.splice(idx, 1);
          if (S.eq[sl]) S.inv.push(S.eq[sl]);
          S.eq[sl] = best;
          equipped++;
          invDirty = true;
        }
      }
      if (typeof recalc === "function") recalc();
      if (typeof save === "function") save();
      if (typeof renderInv === "function") renderInv();
      if (typeof renderInv20 === "function") try { renderInv20(); } catch (e) {}
      if (typeof renderChar === "function") renderChar();
      if (typeof renderChar20 === "function") try { renderChar20(); } catch (e) {}
      if (typeof refresh === "function") refresh();
      if (toast) toast("Da mac " + equipped + " mon do tot nhat");
      return;
    }

    if (act === "unequip") {
      if (!S || !S.eq) { if (toast) toast("Khong co nhan vat"); return; }
      const slots = Object.keys(S.eq);
      let moved = 0;
      for (const sl of slots) {
        const it = S.eq[sl];
        if (!it) continue;
        S.inv.push(it); moved++; invDirty = true;
        delete S.eq[sl];
      }
      if (typeof recalc === "function") recalc();
      if (typeof save === "function") save();
      if (typeof renderInv === "function") renderInv();
      if (typeof renderInv20 === "function") try { renderInv20(); } catch (e) {}
      if (typeof renderChar === "function") renderChar();
      if (typeof renderChar20 === "function") try { renderChar20(); } catch (e) {}
      if (typeof refresh === "function") refresh();
      if (toast) toast("Da thao " + moved + " mon do ve tui do");
      return;
    }
  }

  function waitReady() {
    if (document.body && typeof S !== "undefined") {
      ensurePanel();
    } else {
      setTimeout(waitReady, 500);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitReady);
  else waitReady();
})();
