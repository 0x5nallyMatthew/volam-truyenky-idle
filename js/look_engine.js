"use strict";

const JX_PART_NAME = {
  0: "head",
  1: "hair",
  4: "shoulder",
  5: "body",
  6: "lhand",
  7: "rhand",
  8: "lweapon",
  9: "rweapon",
  12: "horsef",
  13: "horsem",
  14: "horseb"
};

const JX_FRAME_MS = 1000 / 18;
const JX_SPRITE_CACHE = new Map();

function jxLoadSprite(sex, partName, rowId) {
  const path = "img/look/" + sex + "/" + partName + "_" + rowId;
  let cached = JX_SPRITE_CACHE.get(path);
  if (!cached) {
    cached = {
      img: new Image(),
      meta: null,
      tries: 0,
      retryAt: 0,
      base: path
    };
    cached.img.src = path + ".webp";
    JX_SPRITE_CACHE.set(path, cached);
  }
  const now = performance.now();
  if (!cached.meta && !cached.loading && now >= cached.retryAt && cached.tries < 5) {
    cached.loading = true;
    cached.tries++;
    fetch(path + ".json")
      .then(r => r.ok ? r.json() : null)
      .then(data => { cached.meta = data; })
      .catch(() => {})
      .finally(() => {
        cached.loading = false;
        cached.retryAt = performance.now() + 2000;
      });
  }
  return (cached.meta && cached.img.complete && cached.img.naturalWidth) ? cached : null;
}

const JX_SET_MAP = new Map();
function jxMapSet(list, keyFn) {
  let m = JX_SET_MAP.get(list);
  if (!m) {
    m = new Map(list.map((it, idx) => [keyFn(it), idx]));
    JX_SET_MAP.set(list, m);
  }
  return m;
}

function jxGetItemRow(item, groupName) {
  const JXL = window.JXLOOK;
  if (!JXL || !item) return 0;
  if (item.set && J.sets && J.sets[item.set.kind]) {
    const list = J.sets[item.set.kind];
    const map = jxMapSet(list, it => it.d + "|" + it.n);
    const idx = map.get(item.d + "|" + item.n);
    const row = idx != null ? (JXL.sets[item.set.kind] || [])[idx] : 0;
    if (row) return row;
  }
  const resKey = groupName === "weapon" ? (item.d === 1 ? "range" : "melee") : groupName;
  let p = item.p;
  if (p == null) {
    const itDef = J.items && J.items.find(x => x.detail === item.d);
    const itList = itDef ? itDef.list : null;
    const map = itList ? jxMapSet(itList, x => x.n) : null;
    const idx = map ? map.get(item.n) : null;
    p = idx != null ? itList[idx].p : -1;
  }
  return (JXL.res[resKey] || [])[p] || 0;
}

const JX_HORSE_FALLBACK = { 15: 14, 17: 16 };
let jxLookCacheKey = "";
let jxCurrentLook = null;

function jxHeroSetup() {
  const JXL = window.JXLOOK;
  if (!JXL || !S || !S.fac) return null;
  const isRiding = !!(R.mounted && S.eq && S.eq.horse && reqOk(S.eq.horse));
  const key = [
    S.sex || 0,
    isRiding,
    S.eq.weapon ? S.eq.weapon.uid : 0,
    S.eq.armor ? S.eq.armor.uid : 0,
    S.eq.helm ? S.eq.helm.uid : 0,
    S.eq.horse ? S.eq.horse.uid : 0
  ].join("|");

  if (key === jxLookCacheKey && jxCurrentLook) return jxCurrentLook;
  jxLookCacheKey = key;

  const sex = S.sex ? "f" : "m";
  const sexLook = JXL[sex] || JXL.m;
  const rows = {
    helm: jxGetItemRow(S.eq.helm, "helm") || JXL.none.helm || 1,
    armor: jxGetItemRow(S.eq.armor, "armor") || JXL.none.armor || 1,
    weapon: jxGetItemRow(S.eq.weapon, "weapon") || 1,
    horse: isRiding ? (jxGetItemRow(S.eq.horse, "horse") || 1) : 0
  };

  if (rows.horse && !(JXL.m.have.horsem || []).includes(rows.horse) && JX_HORSE_FALLBACK[rows.horse]) {
    rows.horse = JX_HORSE_FALLBACK[rows.horse];
  }

  if (
    !(sexLook.have.rweapon || []).includes(rows.weapon) &&
    !(sexLook.have.lweapon || []).includes(rows.weapon)
  ) {
    rows.weapon = 1;
  }

  const wKind = sexLook.wkind[rows.weapon - 1] || "free";
  const parts = {};
  for (const [grp, partList] of Object.entries(JXL.groups)) {
    for (const part of partList) {
      const val = rows[grp];
      if (val && ((grp === "horse" ? JXL.m : sexLook).have[part] || []).includes(val)) {
        parts[part] = val;
      }
    }
  }

  const acts = isRiding && parts.horsem ? JXL.ride : JXL.kinds[wKind];
  jxCurrentLook = {
    sex: sex,
    parts: parts,
    acts: acts,
    riding: isRiding && !!parts.horsem
  };
  return jxCurrentLook;
}

function jxBuildLook(sexCode, eq, isRiding) {
  const JXL = window.JXLOOK;
  if (!JXL) return null;
  const sex = sexCode ? "f" : "m";
  const sexLook = JXL[sex] || JXL.m;
  eq = eq || {};
  const rows = {
    helm: jxGetItemRow(eq.helm, "helm") || JXL.none.helm || 1,
    armor: jxGetItemRow(eq.armor, "armor") || JXL.none.armor || 1,
    weapon: jxGetItemRow(eq.weapon, "weapon") || 1,
    horse: isRiding ? (jxGetItemRow(eq.horse, "horse") || 1) : 0
  };

  if (rows.horse && !(JXL.m.have.horsem || []).includes(rows.horse) && JX_HORSE_FALLBACK[rows.horse]) {
    rows.horse = JX_HORSE_FALLBACK[rows.horse];
  }

  if (
    !(sexLook.have.rweapon || []).includes(rows.weapon) &&
    !(sexLook.have.lweapon || []).includes(rows.weapon)
  ) {
    rows.weapon = 1;
  }

  const wKind = sexLook.wkind[rows.weapon - 1] || "free";
  const parts = {};
  for (const [grp, partList] of Object.entries(JXL.groups)) {
    for (const part of partList) {
      const val = rows[grp];
      if (val && ((grp === "horse" ? JXL.m : sexLook).have[part] || []).includes(val)) {
        parts[part] = val;
      }
    }
  }

  const acts = isRiding && parts.horsem ? JXL.ride : JXL.kinds[wKind];
  return {
    sex: sex,
    parts: parts,
    acts: acts,
    riding: isRiding && !!parts.horsem
  };
}

function drawJxHero(act, dir, actTime, x, y, scale = 1, alpha = 1, customLook = null) {
  const look = customLook || jxHeroSetup();
  if (!look) return false;

  const JXL = window.JXLOOK;
  const sexLook = JXL[look.sex] || JXL.m;
  const loadedSprites = {};
  for (const pName in look.parts) {
    const s = pName.startsWith("horse") ? "m" : look.sex;
    loadedSprites[pName] = jxLoadSprite(s, pName, look.parts[pName]);
  }

  if (!loadedSprites.body && !loadedSprites.horsem) return false;

  const actIdx = act === "run" ? 1 : act === "at" ? 2 : 0;
  const targetAct = look.acts[actIdx] || look.acts[0];
  const refSprite = loadedSprites.horsem || loadedSprites.body;
  if (!refSprite || !refSprite.meta) return false;

  const actData = refSprite.meta.a[targetAct] || refSprite.meta.a[look.acts[0]];
  if (!actData) return false;

  const framesPerSec = actData.i * JX_FRAME_MS;
  let frameIdx = Math.floor((actTime * 1000) / framesPerSec);
  if (act === "at" || act === "die") {
    frameIdx = Math.min(frameIdx, actData.n - 1);
  } else {
    frameIdx = frameIdx % actData.n;
  }

  const dirCount = actData.d >= 8 ? dir : Math.floor((dir * actData.d) / 8);
  const dirKey = String(2 * dirCount + 1);
  const order = (sexLook.order[targetAct] && sexLook.order[targetAct][dirKey]) ||
                sexLook.order.DEFAULT[dirKey] || [5];

  let minBottom = 0;
  CX.globalAlpha = alpha;

  const drawScale = scale * 0.95;

  for (const partCode of order) {
    const partName = JX_PART_NAME[partCode];
    const sprite = partName && loadedSprites[partName];
    if (!sprite || !sprite.meta) continue;

    const pAct = sprite.meta.a[targetAct] || sprite.meta.a[look.acts[0]];
    if (!pAct) continue;

    const frameList = pAct.f;
    const fIdx = dirCount * pAct.n + Math.min(frameIdx, pAct.n - 1);
    const f = frameList[fIdx];
    if (f) {
      const isWeapon = partName === "rweapon" || partName === "lweapon";
      const glow = isWeapon && (look.glow || (R.look && R.look.glow));

      if (glow && glow.enh >= 5) {
        CX.save();
        const pulse = 0.5 + 0.5 * Math.sin((R.clock || 0) * 4);
        const enh = glow.enh;
        // Cấp phát sáng: +5..+6 nhẹ, +7..+8 vừa, +9..+10 rực rỡ
        const blurRadius = enh >= 10 ? (12 + pulse * 6) : enh >= 8 ? (8 + pulse * 4) : enh >= 7 ? 6 : 4;
        CX.shadowColor = glow.c;
        CX.shadowBlur = blurRadius;

        // Vẽ lớp phát sáng viền hào quang ngũ hành
        CX.drawImage(
          sprite.img,
          f[0], f[1], f[2], f[3],
          x + f[4] * drawScale,
          y + f[5] * drawScale,
          f[2] * drawScale,
          f[3] * drawScale
        );

        // Với +9 và +10, thêm lớp ánh sáng lõi bloom rực rỡ
        if (enh >= 9) {
          CX.shadowColor = glow.core || "#ffffff";
          CX.shadowBlur = 6 + pulse * 4;
          CX.globalAlpha = alpha * (enh >= 10 ? 0.8 : 0.5);
          CX.drawImage(
            sprite.img,
            f[0], f[1], f[2], f[3],
            x + f[4] * drawScale,
            y + f[5] * drawScale,
            f[2] * drawScale,
            f[3] * drawScale
          );
        }
        CX.restore();
      }

      CX.drawImage(
        sprite.img,
        f[0], f[1], f[2], f[3],
        x + f[4] * drawScale,
        y + f[5] * drawScale,
        f[2] * drawScale,
        f[3] * drawScale
      );
      if (partName === "body" || partName === "head" || partName === "horsem") {
        minBottom = Math.min(minBottom, f[5] * drawScale);
      }
    }
  }

  CX.globalAlpha = 1;
  return -minBottom || 50;
}
