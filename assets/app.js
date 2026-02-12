/*!
 * MB Release Viewer
 * Version: 0.9.0
 * © 2026 György Hild
 * https://github.com/hildgyorgy/mb-release-viewer
 */

/* ============================================================
   0) Tiny DOM helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ============================================================
   1) Small utilities (formatting, escaping, dedupe)
   ============================================================ */
function extractMBID(value) {
  const m = String(value || "")
    .trim()
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

function fmtMs(ms) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function artistCreditToText(ac) {
  if (!ac) return "";
  return ac.map((x) => x.name + (x.joinphrase || "")).join("");
}

function escHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function relDateLabel(r) {
  const b = String(r?.begin || "").trim();
  const e = String(r?.end || "").trim();
  if (b && e && b !== e) return `${b} → ${e}`;
  if (b) return b;
  if (e) return e;
  return "";
}

/**
 * Medium label policy:
 * - Digital media: NO "Disc 1" prefix (ever)
 * - Vinyl: only show "Disc N" if release has multiple media
 * - CD: "CD N"
 * - Other formats: "Disc N" only if multiple media; otherwise just format (or "Disc" fallback)
 * - Medium title appended as " · Title"
 */
function mediumLabel(m, totalMediaCount) {
  const fmtRaw = String(m?.format || "").trim();
  const fmt = fmtRaw.toLowerCase();
  const title = String(m?.title || "").trim();

  const isDigital = fmt.includes("digital");
  const isVinyl = fmt.includes("vinyl");
  const isCD = fmt.includes("cd");

  const extra = [];
  if (title) extra.push(title);

  const joinExtra = (base) => (extra.length ? `${base} · ${extra.join(" · ")}` : base);

  // DIGITAL → no numbering
  if (isDigital) {
    return joinExtra(fmtRaw || "Digital media");
  }

  // VINYL → numbering only if multiple media
  if (isVinyl) {
    if (totalMediaCount > 1) return joinExtra(`Disc ${m.index} · ${fmtRaw || "Vinyl"}`);
    return joinExtra(fmtRaw || "Vinyl");
  }

  // CD → classic numbering
  if (isCD) {
    return joinExtra(`CD ${m.index}`);
  }

  // OTHER
  if (totalMediaCount > 1) {
    return joinExtra(`Disc ${m.index}${fmtRaw ? ` · ${fmtRaw}` : ""}`.trim());
  }
  return joinExtra(fmtRaw || "Disc");
}

/* ============================================================
   2) Theme system (light/dark) + icons
   ============================================================ */
const THEME_STORAGE_KEY = "mb_theme";

const ICON_MOON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
</svg>`;

const ICON_SUN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="4"></circle>
  <path d="M12 2v2"></path>
  <path d="M12 20v2"></path>
  <path d="M4.93 4.93l1.41 1.41"></path>
  <path d="M17.66 17.66l1.41 1.41"></path>
  <path d="M2 12h2"></path>
  <path d="M20 12h2"></path>
  <path d="M6.34 17.66l-1.41 1.41"></path>
  <path d="M19.07 4.93l-1.41 1.41"></path>
</svg>`;

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_STORAGE_KEY, t);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON; // dark-ban nap, light-ban hold
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

function bindThemeToggleOnce(root = document) {
  const btn = $("#themeToggle", root);
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", toggleTheme);
}

/* ============================================================
   3) Layout helpers (cover-lock + theme button positioning)
   ============================================================ */
let coverSizerBound = false;

function lockCoverSquareToTabs(root = document) {
  const cover = $(".cover", root);
  const box = $(".cover-box", root);
  const navRow = $(".cover-nav-row", root);
  const tabs = $("#tabs", root);
  if (!cover || !box || !navRow || !tabs) return;

  const w = Math.ceil(tabs.getBoundingClientRect().width);
  cover.style.width = w + "px";
  navRow.style.width = w + "px";
  box.style.width = w + "px";
  box.style.height = w + "px";
}

function positionThemeToggle(root = document) {
  const row = $(".row", root);
  const main = $(".main", root);
  const tabs = $("#tabs", root);
  const btn = $("#themeToggle", root);
  if (!row || !main || !tabs || !btn) return;

  const rowRect = row.getBoundingClientRect();
  const mainRect = main.getBoundingClientRect();
  const tabsRect = tabs.getBoundingClientRect();

  const bw = btn.offsetWidth || 38;
  const bh = btn.offsetHeight || 38;

  // a gomb közepe essen a cover/tabs és a meta blokk határvonalára (+ finom offset)
  const x = (mainRect.left - rowRect.left) - bw / 2 + 15;

  // a tabs sor középvonalára igazítjuk
  const y = (tabsRect.top - rowRect.top) + (tabsRect.height - bh) / 2;

  btn.style.left = `${Math.round(x)}px`;
  btn.style.top = `${Math.round(y)}px`;
}

function bindCoverSizerOnce() {
  if (coverSizerBound) return;
  coverSizerBound = true;

  const rerun = () => {
    const out = $("#out");
    if (!out) return;
    lockCoverSquareToTabs(out);
    positionThemeToggle(out);
  };

  window.addEventListener("resize", rerun);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rerun);
  }
}

/* ============================================================
   4) Tabs / view switching
   ============================================================ */
function setActiveView(viewName) {
  $$(".view").forEach((sec) => {
    sec.hidden = sec.dataset.view !== viewName;
  });

  $$(".tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewName);
  });
}

let recordingsBuilt = false;

function bindTabsOnce() {
  const tabs = $("#tabs");
  if (!tabs) return;

  if (tabs.dataset.bound === "1") return;
  tabs.dataset.bound = "1";

  tabs.addEventListener("click", async (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;

    const view = btn.dataset.view;
    if (!view) return; // MB link: nincs data-view

    setActiveView(view);

    if (view === "recordings" && !recordingsBuilt) {
      recordingsBuilt = true;
      await buildRecordingsView();
    }
  });
}

/* ============================================================
   Cover lightbox (single image) helper
   ============================================================ */
function ensureLightboxOnce() {
  let lb = document.getElementById("lb");
  if (lb) return lb;

  lb = document.createElement("div");
  lb.id = "lb";
  lb.className = "lb";
  lb.innerHTML = `<img id="lbImg" alt="">`;
  document.body.appendChild(lb);

  // click outside image closes
lb.addEventListener("click", (e) => {
  // háttérre kattintás vagy a képre kattintás is bezár
  if (e.target === lb || e.target.id === "lbImg") closeLightbox();
});

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  return lb;
}

function openLightbox(src, alt = "") {
  if (!src) return;

  const lb = ensureLightboxOnce();
  const img = document.getElementById("lbImg");

  img.src = src;
  img.alt = alt || "";

  // 1) biztosan legyen "zárt" state-ben
  lb.classList.remove("is-open");

  // 2) következő frame-ben nyitjuk -> animáció garantált elsőre is
  requestAnimationFrame(() => {
    lb.classList.add("is-open");
  });

  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const lb = document.getElementById("lb");
  if (!lb) return;
  lb.classList.remove("is-open");
  document.body.style.overflow = "";
}

function bindCoverLightboxOnce(root = document) {
  const img = $("#coverImg", root);
  if (!img || img.dataset.lbBound === "1") return;
  img.dataset.lbBound = "1";

  img.addEventListener("click", () => {
    openLightbox(img.src, img.alt || "Cover");
  });
}

/* ============================================================
   5) MusicBrainz link helpers (HTML linkek)
   ============================================================ */
function mbArtistLink(artist) {
  if (!artist?.id) return "";
  const name = artist.name || artist["name"] || "(unknown)";
  return `<a href="https://musicbrainz.org/artist/${artist.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
}

function artistCreditToLinks(ac) {
  if (!Array.isArray(ac) || !ac.length) return "";
  return ac
    .map((x) => {
      // MB artist-credit elem: { name, joinphrase, artist: { id, name } }
      const a = x?.artist || null;
      const name = x?.name || a?.name || "(unknown)";
      const link = a?.id
        ? `<a href="https://musicbrainz.org/artist/${a.id}" target="_blank" rel="noreferrer">${escHtml(name)}</a>`
        : escHtml(name);
      return link + (x?.joinphrase || "");
    })
    .join("");
}

function mbWorkUrl(work) {
  if (!work?.id) return "";
  return `https://musicbrainz.org/work/${work.id}`;
}

function mbPlaceLink(place) {
  if (!place?.id) return "";
  const name = place.name || "(place)";
  return `<a href="https://musicbrainz.org/place/${place.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
}

function mbRecordingLink(rec) {
  if (!rec?.id) return escHtml(rec?.title || "(recording)");
  const title = escHtml(rec?.title || "(recording)");
  return `<a href="https://musicbrainz.org/recording/${rec.id}" target="_blank" rel="noreferrer">${title}</a>`;
}

/* ============================================================
   6) Track details (Performers / Creators / Work hierarchy)
   ============================================================ */
function parsePerformersFromRecording(recording) {
  const rels = recording?.relations || [];

  const perf = rels.filter((r) => {
    const tt = r.target_type ?? r["target-type"];
    return tt === "artist";
  });

  const byRole = new Map();

  for (const r of perf) {
    const artist = r.artist || r.target || null;
    if (!artist?.id) continue;

    const attrs = Array.isArray(r.attributes) ? r.attributes : [];
    const baseType = r.type || "";

    const isInstrument = baseType === "instrument";
    const isVocal =
      baseType === "vocal" ||
      attrs.some((a) =>
        [
          "vocals",
          "soprano",
          "mezzo-soprano",
          "alto",
          "tenor",
          "baritone",
          "bass",
        ].includes(String(a).toLowerCase())
      );

    if (!isInstrument && !isVocal) continue;

    const role = attrs.length ? attrs.join(", ") : isVocal ? "vocals" : "instrument";

    if (!byRole.has(role)) byRole.set(role, new Map());
    byRole.get(role).set(artist.id, artist);
  }

  return Array.from(byRole.entries())
    .map(([role, artistMap]) => ({
      role,
      artists: Array.from(artistMap.values()).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      ),
    }))
    .sort((a, b) => a.role.localeCompare(b.role));
}

function renderRoleList(items) {
  return `
    <div class="perf">
      <div class="grid">
        ${items
          .map(
            (it) => `
          <div>
            <div class="inst">${escHtml(it.role)}</div>
            <div class="artists">${it.artists.map(mbArtistLink).join(" ")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderPerformers(recording) {
  const items = parsePerformersFromRecording(recording);

  // 1) ha van BÁRMILYEN instrument/vocal performer -> csak azt mutatjuk
  if (items.length) return renderRoleList(items);

  // 2) nincs performer rel -> fallback: recording artist-credit (offer: "performer")
  const ac = recording?.["artist-credit"];
  const acHtml = artistCreditToLinks(ac);

  if (acHtml) {
    return `
      <div class="perf">
        <div class="grid">
          <div>
            <div class="inst">performer</div>
            <div class="artists">${acHtml}</div>
          </div>
        </div>
      </div>
    `;
  }

  // 3) nincs performer és nincs recording artist-credit -> N/A (no release fallback)
  return `
    <div class="perf">
      <div class="grid">
        <div>
          <div class="inst">performer</div>
          <div class="artists"><span class="muted">N/A</span></div>
        </div>
      </div>
    </div>
  `;
}

function getPrimaryWorkIdFromRecording(recording) {
  const rels = recording?.relations || [];

  const workRel = rels.find((r) => {
    const tt = r.target_type ?? r["target-type"];
    return tt === "work";
  });
  if (!workRel) return null;

  const w = workRel.work || workRel.target || null;
  if (!w) return null;

  return typeof w === "string" ? w : w.id || null;
}

function parseCreatorsFromWork(work) {
  const rels = work?.relations || [];
  const creatorTypes = new Set(["composer", "lyricist", "librettist", "arranger", "writer"]);
  const byRole = new Map();

  for (const r of rels) {
    const tt = r.target_type ?? r["target-type"];
    if (tt !== "artist") continue;

    const role = (r.type || "").toLowerCase();
    if (!creatorTypes.has(role)) continue;

    const artist = r.artist || r.target || null;
    if (!artist?.id) continue;

    if (!byRole.has(role)) byRole.set(role, new Map());
    byRole.get(role).set(artist.id, artist);
  }

  const CREATOR_ROLE_ORDER = ["composer", "lyricist", "librettist", "writer", "arranger"];
  const rank = (role) => {
    const i = CREATOR_ROLE_ORDER.indexOf(String(role || "").toLowerCase());
    return i === -1 ? 999 : i;
  };

  return Array.from(byRole.entries())
    .map(([role, artistMap]) => ({
      role,
      artists: Array.from(artistMap.values()).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      ),
    }))
    .sort((a, b) => {
      const ra = rank(a.role);
      const rb = rank(b.role);
      if (ra !== rb) return ra - rb;
      return String(a.role || "").localeCompare(String(b.role || ""));
    });
}

function renderCreators(work) {
  if (!work) {
    return `
      <div class="perf">
        <div class="grid">
          <div>
            <div class="inst">writer</div>
            <div class="artists"><span class="muted">N/A</span></div>
          </div>
        </div>
      </div>
    `;
  }

  const items = parseCreatorsFromWork(work);

  if (!items.length) {
    return `
      <div class="perf">
        <div class="grid">
          <div>
            <div class="inst">writer</div>
            <div class="artists"><span class="muted">N/A</span></div>
          </div>
        </div>
      </div>
    `;
  }

  return renderRoleList(items);
}

function getParentWorkIdFromWork(work) {
  const rels = Array.isArray(work?.relations) ? work.relations : [];

  const parentRel =
    rels.find((r) => {
      const tt = r.target_type ?? r["target-type"];
      if (tt !== "work") return false;
      const type = String(r.type || "").toLowerCase();
      const dir = String(r.direction || "").toLowerCase();
      return type === "parts" && dir === "backward";
    }) ||
    rels.find((r) => {
      const tt = r.target_type ?? r["target-type"];
      if (tt !== "work") return false;
      const type = String(r.type || "").toLowerCase();
      return type.includes("part of");
    });

  if (!parentRel) return null;

  const w = parentRel.work || parentRel.target || null;
  if (!w) return null;

  return typeof w === "string" ? w : w.id || null;
}

function stripParentPrefix(childTitle, parentTitle) {
  const child = String(childTitle || "").trim();
  const parent = String(parentTitle || "").trim();
  if (!child || !parent) return child;

  const candidates = [
    parent + ": ",
    parent + " ",
    parent + " - ",
    parent + " – ",
    parent + " — ",
    parent + ". ",
    parent + " . ",
  ];

  for (const p of candidates) {
    if (child.startsWith(p)) return child.slice(p.length);
  }
  return child;
}

async function getWorkHierarchyLines(leafWork) {
  if (!leafWork?.id && !leafWork?.title) return ["", "", ""];

  const chain = [];
  const seen = new Set();
  let cur = leafWork;

  for (let depth = 0; depth < 8; depth++) {
    const curId = cur?.id || "";
    const curTitle = String(cur?.title || "").trim();
    if (curTitle) chain.push({ id: curId, title: curTitle });

    if (!curId || seen.has(curId)) break;
    seen.add(curId);

    const parentId = getParentWorkIdFromWork(cur);
    if (!parentId) break;

    const parent = await loadWork(parentId);
    if (!parent) break;

    cur = parent;
  }

  const full = chain.reverse().filter((x) => x.title);
  if (!full.length) return ["", "", ""];

  const display = [];
  for (let i = 0; i < full.length; i++) {
    if (i === 0) display.push(full[i].title);
    else {
      const raw = full[i].title;
      const parentRaw = full[i - 1].title;
      const parentDisp = display[i - 1];
      let out = stripParentPrefix(raw, parentRaw);
      if (out === raw) out = stripParentPrefix(raw, parentDisp);
      display.push(out);
    }
  }

  if (display.length === 1) return ["", "", display[0]];
  if (display.length === 2) return [display[0], "", display[1]];
  return [display[0], display[1], display[display.length - 1]];
}

async function renderWorkHierarchyBlock(work) {
  if (!work?.id) {
    return `
      <div class="perf">
        <div class="grid">
          <div>
            <div class="inst">work</div>
            <div class="artists"><span class="muted">N/A</span></div>
          </div>
        </div>
      </div>
    `;
  }

  const [l1, l2, l3] = await getWorkHierarchyLines(work);

  const a = String(l1 || "").trim();
  const b = String(l2 || "").trim();
  const c = String(l3 || "").trim();

  const link = mbWorkUrl(work);
  const leaf = (c || b || a).trim();

  const linkHtml = `<a href="${link}" target="_blank" rel="noreferrer">${escHtml(
    leaf || work.title || "(work)"
  )}</a>`;

  let html = "";
  if (a && a !== leaf) html += `<div>${escHtml(a)}</div>`;
  if (b && b !== leaf) html += `<div>${escHtml(b)}</div>`;
  html += `<div class="artists">${linkHtml}</div>`;

  return `
    <div class="perf">
      <div class="grid">
        <div>
          <div class="inst">work</div>
          ${html}
        </div>
      </div>
    </div>
  `;
}

async function renderTrackDetails(recording, work) {
  const left = renderPerformers(recording);
  const mid = renderCreators(work);
  const right = await renderWorkHierarchyBlock(work);

  return `
    <div class="detail-cols">
      <div class="detail-col">${left}</div>
      <div class="detail-col">${mid}</div>
      <div class="detail-col">${right}</div>
    </div>
  `;
}

/* ============================================================
   7) Recordings tab (technical / organizational credits)
   ============================================================ */
const EXCLUDE_ARTIST_REL_TYPES = new Set([
  "instrument",
  "vocal",
  "composer",
  "lyricist",
  "librettist",
]);

function prettyRelRole(typeRaw, attrs) {
  const type = String(typeRaw || "").trim();
  const typeLc = type.toLowerCase();

  const a = Array.isArray(attrs) ? attrs.map(String) : [];
  const aLc = a.map((x) => x.toLowerCase());

  if (typeLc === "engineer") {
    if (aLc.includes("recording")) {
      return { role: "recording engineer", rest: a.filter((x) => x.toLowerCase() !== "recording") };
    }
    if (aLc.includes("mix")) {
      return { role: "mixing engineer", rest: a.filter((x) => x.toLowerCase() !== "mix") };
    }
    if (aLc.includes("mastering")) {
      return { role: "mastering engineer", rest: a.filter((x) => x.toLowerCase() !== "mastering") };
    }
  }

  if (typeLc === "producer") {
    if (aLc.includes("executive")) {
      return { role: "executive producer", rest: a.filter((x) => x.toLowerCase() !== "executive") };
    }
    if (aLc.includes("co")) {
      return { role: "co-producer", rest: a.filter((x) => x.toLowerCase() !== "co") };
    }
  }

  if (a.length === 1) {
    return { role: `${a[0]} ${type}`.trim(), rest: [] };
  }

  return { role: type, rest: a };
}

function parseRecordingTechCredits(recording) {
  const rels = Array.isArray(recording?.relations) ? recording.relations : [];
  const rows = [];
  const dis = String(recording?.disambiguation || "").trim();

  for (const r of rels) {
    const tt = r.target_type ?? r["target-type"];
    const typeRaw = String(r.type || "").trim();
    if (!typeRaw) continue;

    if (tt === "work") continue;

    const typeLc = typeRaw.toLowerCase();
    if (tt === "artist" && EXCLUDE_ARTIST_REL_TYPES.has(typeLc)) continue;

    const showDate = tt === "place";
    const date = showDate ? relDateLabel(r) : "";
    const dateTxt = date ? ` <span class="muted">${escHtml(date)}</span>` : "";

    const attrs = Array.isArray(r.attributes) ? r.attributes : [];
    const pr = prettyRelRole(typeRaw, attrs);
    const roleLabel = pr.role;
    const attrsTxt = pr.rest.length ? ` (${pr.rest.map(escHtml).join(", ")})` : "";

    if (tt === "artist") {
      const artist = r.artist || r.target || null;
      if (!artist?.id) continue;
      rows.push({ role: roleLabel, value: `${mbArtistLink(artist)}${attrsTxt}${dateTxt}` });
      continue;
    }

    if (tt === "place") {
      const place = r.place || r.target || null;
      if (!place?.id) continue;
      rows.push({ role: roleLabel, value: `${mbPlaceLink(place)}${attrsTxt}${dateTxt}` });
      continue;
    }

    if (tt === "recording") {
      const rec = r.recording || r.target || null;
      if (!rec) continue;
      rows.push({ role: roleLabel, value: `${mbRecordingLink(rec)}${attrsTxt}${dateTxt}` });
      continue;
    }
  }

  const grouped = new Map();
  for (const row of rows) {
    const k = row.role;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(row.value);
  }

  if (dis) grouped.set("notes", [dis]);

  const roles = Array.from(grouped.keys()).sort((a, b) => {
    const al = String(a || "").toLowerCase();
    const bl = String(b || "").toLowerCase();
    if (al === "notes") return 1;
    if (bl === "notes") return -1;
    return al.localeCompare(bl);
  });

  return roles.map((role) => ({ role, values: uniq(grouped.get(role)) }));
}

function renderRecordingTechGrid(items) {
  if (!items.length) return `<div class="muted">N/A</div>`;

  const rows = items
    .map((it) => {
      const role = escHtml(it.role);
      const isNotes = String(it.role || "").toLowerCase() === "notes";

      const value = isNotes
        ? `<span class="muted">${it.values.map((v) => escHtml(String(v))).join("<br>")}</span>`
        : it.values.join("<br>");

      return `
        <div style="display:contents">
          <div class="muted" style="padding:2px 0;">${role}</div>
          <div style="padding:2px 0;">${value}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div style="
      margin-left: 10px;
      padding: 10px 10px 12px;
      display: grid;
      grid-template-columns: 220px 1fr;
      column-gap: 16px;
      row-gap: 2px;
      font-size: 13px;
      line-height: 1.35;
    ">
      ${rows}
    </div>
  `;
}

// Built from the current release media (set in renderAll)
let __mediaForRecordings = [];

function itemsToRoleMap(items) {
  const map = new Map();
  for (const it of (items || [])) {
    const role = String(it.role || "").trim();
    if (!role) continue;
    if (role.toLowerCase() === "notes") continue;
    const vals = (it.values || []).filter(Boolean).map(String);
    map.set(role, new Set(vals));
  }
  return map;
}

function intersectRoleMaps(roleMaps) {
  const common = new Map();
  if (!roleMaps.length) return common;

  for (const [role, set] of roleMaps[0].entries()) {
    common.set(role, new Set(set));
  }

  for (let i = 1; i < roleMaps.length; i++) {
    const cur = roleMaps[i];

    for (const [role, commonSet] of Array.from(common.entries())) {
      const curSet = cur.get(role);
      if (!curSet) {
        common.delete(role);
        continue;
      }

      for (const v of Array.from(commonSet)) {
        if (!curSet.has(v)) commonSet.delete(v);
      }
      if (commonSet.size === 0) common.delete(role);
    }
  }

  return common;
}

function getCommonNotesFromItemsList(itemsList) {
  let common = null;

  for (const items of (itemsList || [])) {
    const notesItem = (items || []).find((it) => String(it.role || "").toLowerCase() === "notes");
    const txt = String(notesItem?.values?.[0] || "").trim();

    if (!txt) return "";
    if (common === null) common = txt;
    else if (common !== txt) return "";
  }

  return common || "";
}

function subtractCommon(items, commonMap, commonNotes = "") {
  const out = [];
  const commonNotesNorm = String(commonNotes || "").trim();

  for (const it of (items || [])) {
    const role = String(it.role || "").trim();
    if (!role) continue;

    if (role.toLowerCase() === "notes") {
      const txt = String(it.values?.[0] || "").trim();
      if (!commonNotesNorm || txt !== commonNotesNorm) out.push(it);
      continue;
    }

    const commonSet = commonMap.get(role);
    if (!commonSet) {
      out.push(it);
      continue;
    }

    const diffVals = (it.values || []).filter((v) => !commonSet.has(String(v)));
    if (diffVals.length) out.push({ role, values: diffVals });
  }

  return out;
}

async function buildRecordingsView() {
  const view = $(`section.view[data-view="recordings"]`);
  if (!view) return;

  const media = Array.isArray(__mediaForRecordings) ? __mediaForRecordings : [];
  const mediaCount = media.length;

  // album-szintű unique recording ID-k
  const seenGlobal = new Set();
  const albumRecIds = [];
  for (const m of media) {
    for (const t of (m.tracks || [])) {
      const id = t?.rec?.id;
      if (!id || seenGlobal.has(id)) continue;
      seenGlobal.add(id);
      albumRecIds.push(id);
    }
  }

  const recData = new Map();
  const recItems = new Map();
  const roleMaps = [];
  const itemsListForCommon = [];

  for (const recId of albumRecIds) {
    let rec = null;
    try {
      rec = await loadRecording(recId);
    } catch {
      rec = null;
    }
    recData.set(recId, rec);

    if (!rec) continue;
    const items = parseRecordingTechCredits(rec);
    recItems.set(recId, items);
    roleMaps.push(itemsToRoleMap(items));
    itemsListForCommon.push(items);
  }

  const commonMap = intersectRoleMaps(roleMaps);
  const commonItems = Array.from(commonMap.entries())
    .map(([role, set]) => ({
      role,
      values: Array.from(set).sort((a, b) => String(a).localeCompare(String(b))),
    }))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  const commonNotes = getCommonNotesFromItemsList(itemsListForCommon);
  if (commonNotes) commonItems.push({ role: "notes", values: [commonNotes] });

  let html = `
    <div class="tracks">
      <table>
        <tbody>
  `;

  if (commonItems.length) {
    html += `
      <tr>
        <td class="num"></td>
        <td class="title">${escHtml("Common credits/notes")}</td>
        <td class="len"></td>
      </tr>
      <tr>
        <td></td>
        <td colspan="2">${renderRecordingTechGrid(commonItems)}</td>
      </tr>
    `;
  }

  for (const m of media) {
    html += `
      <tr class="medium-row">
        <td class="medium-cell" colspan="3">${escHtml(mediumLabel(m, mediaCount))}</td>
      </tr>
    `;

    const seen = new Set();
    const orderedRecIds = [];
    for (const t of (m.tracks || [])) {
      const id = t?.rec?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orderedRecIds.push(id);
    }

    for (let idx = 0; idx < orderedRecIds.length; idx++) {
      const recId = orderedRecIds[idx];
      const rec = recData.get(recId) ?? null;
      const title = rec?.title || "(untitled recording)";

      html += `
        <tr>
          <td class="num">${idx + 1}</td>
          <td class="title">${escHtml(title)}</td>
          <td class="len"></td>
        </tr>
      `;

      if (!rec) {
        html += `
          <tr>
            <td></td>
            <td colspan="2">
              <div class="muted" style="margin-left:10px; padding: 10px 10px 12px;">(could not load recording)</div>
            </td>
          </tr>
        `;
        continue;
      }

      const items = recItems.get(recId) || [];
      const diffItems = subtractCommon(items, commonMap, commonNotes);

      const grid = diffItems.length
        ? renderRecordingTechGrid(diffItems)
        : `<div class="muted" style="margin-left:10px; padding: 10px 10px 12px;">--</div>`;

      html += `
        <tr>
          <td></td>
          <td colspan="2">${grid}</td>
        </tr>
      `;
    }
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  view.innerHTML = html;
}

/* ============================================================
   8) MusicBrainz API + caches
   ============================================================ */
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

const recordingCache = new Map();
async function loadRecording(recId) {
  if (!recId) return null;
  if (recordingCache.has(recId)) return recordingCache.get(recId);

  const rec = await fetchJSON(
    `https://musicbrainz.org/ws/2/recording/${recId}?fmt=json&inc=` +
      `artist-credits+artist-rels+work-rels+place-rels+recording-rels+url-rels`
  );
  recordingCache.set(recId, rec);
  return rec;
}

const workCache = new Map();
async function loadWork(workId) {
  if (!workId) return null;
  if (workCache.has(workId)) return workCache.get(workId);

  const w = await fetchJSON(
    `https://musicbrainz.org/ws/2/work/${workId}?fmt=json&inc=artist-rels+work-rels`
  );
  workCache.set(workId, w);
  return w;
}

async function loadRelease(mbid) {
  const relUrl =
    `https://musicbrainz.org/ws/2/release/${mbid}` +
    `?fmt=json&inc=recordings+artists+labels+release-groups+artist-credits+recording-rels+work-rels+annotation+release-rels+artist-rels+label-rels`;
  const rel = await fetchJSON(relUrl);

  let cover = null;
  try {
    const ca = await fetchJSON(`https://coverartarchive.org/release/${mbid}`);
    const front = (ca.images || []).find((img) => img.front) || (ca.images || [])[0];
    cover = front ? front.thumbnails?.large || front.image : null;
  } catch {
    cover = null;
  }

  return { rel, cover };
}

/* ============================================================
   9) Rendering + UI binding
   ============================================================ */
function renderHeader({
  title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes
}) {
  return `
    <div class="row">
      <div class="cover">
        <div class="cover-box">
          ${cover ? `<img id="coverImg" src="${cover}" alt="Cover">` : ""}
        </div>

        <div class="cover-nav-row">
          <div class="tabs cover-tabs" id="tabs">
            <button class="tab is-active" data-view="tracks">Tracklist</button>
            <button class="tab" data-view="recordings">Recordings</button>
            <a class="tab mb-link" href="${mbLink}" target="_blank" rel="noreferrer">MusicBrainz</a>
          </div>
        </div>
      </div>

      <!-- Theme gomb: a navon kívül, a határvonalra pozicionálva -->
      <button class="theme-fab" id="themeToggle" type="button"></button>

      <div class="main">
        <h1>${escHtml(title)}</h1>

        <div class="meta">
          <div class="artist">
            ${artist ? escHtml(artist) : "<span class='muted'>(n/a)</span>"}
          </div>

          <div class="meta-list">
            <div><span class="meta-k">Date:</span> ${date ? escHtml(date) : "<span class='muted'>(n/a)</span>"}</div>
            <div><span class="meta-k">Country:</span> ${country ? escHtml(country) : "<span class='muted'>(n/a)</span>"}</div>
            <div><span class="meta-k">Label:</span> ${label ? escHtml(label) : "<span class='muted'>(n/a)</span>"}</div>
            <div><span class="meta-k">Cat. no.:</span> ${catno ? escHtml(catno) : "<span class='muted'>(n/a)</span>"}</div>
            <div><span class="meta-k">Barcode:</span> ${barcode ? escHtml(barcode) : "<span class='muted'>(n/a)</span>"}</div>
            ${releaseNotes ? `<div><span class="meta-k">Notes:</span> <span class="muted">${escHtml(releaseNotes)}</span></div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTracksView(mediaWithTracks, annotation) {
  const mediaCount = mediaWithTracks.length;

  return `
    <section class="view" data-view="tracks">
      <div class="tracks">
        <table>
          <tbody>
            ${mediaWithTracks
              .map((m) => {
                const head = `
				  <tr class="medium-row">
				    <td colspan="3" class="medium-cell">
				      ${escHtml(mediumLabel(m, mediaCount))}
				    </td>
				  </tr>
				`;

                const rows = m.tracks
                  .map((t) => {
                    const idx = t._i;
                    const recId = t.rec?.id || "";
                    return `
                      <tr class="track" data-i="${idx}" data-rec="${recId}">
                        <td class="num">${t.pos ?? ""}</td>
                        <td class="title">${escHtml(t.title || "")}</td>
                        <td class="len">${escHtml(t.len || "")}</td>
                      </tr>

                      <tr class="details" data-i="${idx}">
                        <td></td>
                        <td colspan="2">
                          <div class="details-wrap">
                            <div class="details-inner">
                              <div class="muted">Loading…</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  })
                  .join("");

                return head + rows;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      ${annotation ? `<div class="annotation"><div class="body">${escHtml(annotation)}</div></div>` : ""}
    </section>
  `;
}

function renderRecordingsViewShell() {
  return `
    <section class="view" data-view="recordings" hidden>
      <div class="muted">Loading…</div>
    </section>
  `;
}

function closeDetails(detailsRow, trackRow) {
  const wrap = $(".details-wrap", detailsRow);
  if (!wrap) return;

  wrap.style.maxHeight = wrap.scrollHeight + "px";
  requestAnimationFrame(() => {
    wrap.style.maxHeight = "0px";
    detailsRow.classList.remove("is-open");
    trackRow.classList.remove("is-open");
  });
}

function openDetails(detailsRow, trackRow) {
  const wrap = $(".details-wrap", detailsRow);
  if (!wrap) return;

  detailsRow.classList.add("is-open");
  trackRow.classList.add("is-open");

  wrap.style.maxHeight = "0px";
  requestAnimationFrame(() => {
    wrap.style.maxHeight = wrap.scrollHeight + "px";
  });
}

function bindTrackToggles(outEl, tracks) {
  const trackTable = $(".tracks table", outEl);
  if (!trackTable) return;

  trackTable.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr.track");
    if (!tr) return;

    const i = tr.dataset.i;
    const details = $(`tr.details[data-i="${i}"]`, outEl);
    if (!details) return;

    const wrap = $(".details-wrap", details);
    const inner = $(".details-inner", details);
    if (!wrap || !inner) return;

    const isOpen = details.classList.contains("is-open");
    if (isOpen) {
      closeDetails(details, tr);
      return;
    }

    $$("tr.details.is-open", outEl).forEach((d) => {
      if (d === details) return;
      const ti = d.dataset.i;
      const openTr = $(`tr.track[data-i="${ti}"]`, outEl);
      if (openTr) closeDetails(d, openTr);
    });

    inner.innerHTML = `<div class="muted">Loading…</div>`;
    openDetails(details, tr);

    const fromRelease = tracks[Number(i)]?.rec || null;
    const recId = tr.dataset.rec || fromRelease?.id || "";
    let recording = fromRelease;

    try {
      const rels = Array.isArray(recording?.relations) ? recording.relations : [];
      const hasWork = rels.some((r) => (r.target_type ?? r["target-type"]) === "work");
      const hasArtist = rels.some((r) => (r.target_type ?? r["target-type"]) === "artist");
      if (!hasWork || !hasArtist) recording = await loadRecording(recId);
    } catch {
      inner.innerHTML = `<div class="muted">Could not load recording credits.</div>`;
      requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
      return;
    }

    if (!recording) {
      inner.innerHTML = `<div class="muted">No recording data.</div>`;
      requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
      return;
    }

    let work = null;
    try {
      const workId = getPrimaryWorkIdFromRecording(recording);
      if (workId) work = await loadWork(workId);
    } catch {
      work = null;
    }

    inner.innerHTML = await renderTrackDetails(recording, work);
    requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
  });
}

function renderAll({ rel, cover }) {
  const title = rel.title || "(untitled)";
  const artist = artistCreditToText(rel["artist-credit"]);
  const date = rel.date || rel["release-events"]?.[0]?.date || "";
  const country = rel.country || rel["release-events"]?.[0]?.area?.name || "";

  const labelInfo = (rel["label-info"] || [])[0];
  const label = labelInfo?.label?.name || "";
  const catno = labelInfo?.["catalog-number"] || "";
  const barcode = rel.barcode || "";
  const releaseNotes = String(rel.disambiguation || "").trim();

  const annotation = (rel.annotation || "").trim();
  const mbLink = `https://musicbrainz.org/release/${rel.id}`;

  const media = rel.media || [];
  const flatTracks = [];

  const mediaWithTracks = media.map((m, mi) => {
    const mt = (m.tracks || []).map((t) => {
      const obj = {
        pos: t.position,
        title: t.title,
        len: fmtMs(t.length),
        rec: t.recording,
        _i: flatTracks.length,
      };
      flatTracks.push(obj);
      return obj;
    });

    return {
      index: mi + 1,
      format: m.format || "",
      title: m.title || "",
      trackCount: mt.length,
      tracks: mt,
    };
  });

  __mediaForRecordings = mediaWithTracks;
  recordingsBuilt = false;

  const out = $("#out");
  out.innerHTML = `
    ${renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes })}
    <div class="views">
      ${renderTracksView(mediaWithTracks, annotation)}
      ${renderRecordingsViewShell()}
    </div>
  `;

  // Theme init + bind + icon
  applyTheme(getPreferredTheme());
  bindThemeToggleOnce(out);

  // UI bind
  bindTabsOnce();
  setActiveView("tracks");
  bindTrackToggles(out, flatTracks);
    bindCoverLightboxOnce(out);

  // cover + theme gomb pozicionálás
  bindCoverSizerOnce();
  lockCoverSquareToTabs(out);
  positionThemeToggle(out);

  const img = $("#coverImg", out);
  if (img) {
    const relock = () => {
      lockCoverSquareToTabs(out);
      positionThemeToggle(out);
    };
    img.addEventListener("load", relock, { once: true });
    if (img.complete) relock();
  }
}

/* ============================================================
   10) App entry
   ============================================================ */
async function go() {
  const mbid = extractMBID($("#mbid")?.value);
  if (!mbid) {
    $("#out").innerHTML =
      `<div class="err">Adj meg egy érvényes release MBID-t vagy egy MusicBrainz release URL-t.</div>`;
    return;
  }

  $("#out").innerHTML = `<div class="muted">Loading…</div>`;

  try {
    const data = await loadRelease(mbid);
    renderAll(data);
    
    const input = document.getElementById("mbid");
    input.classList.add("is-loaded");
  } catch (e) {
    $("#out").innerHTML = `<div class="err">Hiba: ${escHtml(e.message)}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(getPreferredTheme());

  $("#go")?.addEventListener("click", go);
  $("#mbid")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });

  const input = document.getElementById("mbid");
  if (!input) return;

  // gépelés / paste → még nem "betöltött"
  input.addEventListener("input", () => {
    input.classList.remove("is-loaded");
  });

  // --- autoload from URL (?mbid=... or full MB release URL) ---
  const qs = new URLSearchParams(window.location.search);
  const q = (qs.get("mbid") || "").trim();

  if (q) {
    input.value = q;
    input.classList.remove("is-loaded");
    go();
  }
});
