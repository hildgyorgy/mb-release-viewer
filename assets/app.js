/*!
 * MB Release Viewer
 * Version: 0.9.6
 * © 2026 György Hild
 * https://github.com/hildgyorgy/mb-release-viewer
 */

/* ============================================================
   0) Tiny DOM helpers
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ============================================================
   0.1) STATE object
   ============================================================ */

const STATE = {
  search: {
    open: false,
    items: [],
    active: 0,
  },
  cover: {
    gallery: [],
    index: 0,
  },
  views: {
    recordingsBuilt: false,
  },
};

/* ============================================================
   0.2) STATE helpers (single controlled entry points)
   ============================================================ */
const DEBUG = false;

function logState(tag = "") {
  if (!DEBUG) return;
  console.log(`[STATE] ${tag}`, JSON.parse(JSON.stringify(STATE)));
}

function setSearchState(patch) {
  Object.assign(STATE.search, patch);
  logState("search");
}

function setCoverState(patch) {
  Object.assign(STATE.cover, patch);
  logState("cover");
}

function setViewsState(patch) {
  Object.assign(STATE.views, patch);
  logState("views");
}

/* ============================================================
   0.5) App config (single source of truth for tunables)
   ============================================================ */
const CONFIG = Object.freeze({
  // Responsive breakpoint (keep in sync with CSS @media)
  MOBILE_BP: 640,

  // Search behaviour
  SEARCH_LIMIT: 50,
  SEARCH_MIN_CHARS: 2,
  SEARCH_DEBOUNCE_MS: 250,
});

/* ============================================================
   1) Small utilities (formatting, escaping, debounce, dedupe)
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

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
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

  if (isDigital) return joinExtra(fmtRaw || "Digital media");
  if (isVinyl) {
    if (totalMediaCount > 1) return joinExtra(`Disc ${m.index} · ${fmtRaw || "Vinyl"}`);
    return joinExtra(fmtRaw || "Vinyl");
  }
  if (isCD) return joinExtra(`CD ${m.index}`);

  if (totalMediaCount > 1) return joinExtra(`Disc ${m.index}${fmtRaw ? ` · ${fmtRaw}` : ""}`.trim());
  return joinExtra(fmtRaw || "Disc");
}

/* ============================================================
   1.5) Omnibox Search UI state
   ============================================================ */
function openSearch() {
  setSearchState({ open: true });
  const res = document.getElementById("results");
  if (res) res.hidden = false;
}

function closeSearch() {
  setSearchState({ open: false });
  const res = document.getElementById("results");
  if (res) res.hidden = true;
}

function renderSearchResults(items) {
  const res = document.getElementById("results");
  if (!res) return;

  setSearchState({
    items: Array.isArray(items) ? items : [],
    active: 0,
  });

  if (!STATE.search.items.length) {
    res.innerHTML = `<div class="result"><span class="muted">No results</span></div>`;
    return;
  }

  res.innerHTML = STATE.search.items
    .map(
      (it, i) => `
      <div class="result ${i === 0 ? "is-active" : ""}" data-i="${i}">
        <div>${escHtml(it.title)}</div>
        <div class="sub">${escHtml(it.sub || "")}</div>
      </div>
    `
    )
    .join("");
}

function setActiveResult(i) {
  const res = document.getElementById("results");
  if (!res) return;
  const n = STATE.search.items.length;
  if (!n) return;

  setSearchState({ active: Math.max(0, Math.min(i, n - 1)) });

  Array.from(res.querySelectorAll(".result")).forEach((el) => {
    el.classList.toggle("is-active", Number(el.dataset.i) === STATE.search.active);
  });

  const activeEl = res.querySelector(`.result[data-i="${STATE.search.active}"]`);
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
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
    btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
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

  const x = (mainRect.left - rowRect.left) - bw / 2 + 15;
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
    layoutSync(out);
  };

  window.addEventListener("resize", rerun);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rerun);
  }
}
/* 3) Layout helpers javítás */

function clearInlineLayout(root = document) {
  const cover = $(".cover", root);
  const box = $(".cover-box", root);
  const navRow = $(".cover-nav-row", root);
  const btn = $("#themeToggle", root);

  cover?.style.removeProperty("width");
  box?.style.removeProperty("width");
  box?.style.removeProperty("height");
  navRow?.style.removeProperty("width");

  btn?.style.removeProperty("left");
  btn?.style.removeProperty("top");
}

function layoutSync(root = document) {
  // Mobile: CSS drives layout; JS clears any leftover inline styles and exits
  if (isMobileLayout()) {
    clearInlineLayout(root);
    return;
  }

  // Desktop: JS drives the pixel-perfect bits
  lockCoverSquareToTabs(root);
  positionThemeToggle(root);
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

function bindTabsOnce() {
  const tabs = $("#tabs");
  if (!tabs) return;
  if (tabs.dataset.bound === "1") return;
  tabs.dataset.bound = "1";

  tabs.addEventListener("click", async (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;

    const view = btn.dataset.view;
    if (!view) return;

    setActiveView(view);

    if (view === "recordings" && !STATE.views.recordingsBuilt) {
      setViewsState({ recordingsBuilt: true });
      await buildRecordingsView();
    }
  });
}

/* ============================================================
   Cover lightbox + cover gallery (desktop lightbox / mobile inline)
   ============================================================ */

/* Escape for HTML attributes */
function escAttr(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// --- lightbox state ---
let __lbBound = false;

function isMobileLayout() {
  return window.matchMedia(`(max-width: ${CONFIG.MOBILE_BP}px)`).matches;
}

// Back-compat alias (older code path)
function ensureLightboxOnce() {
  let lb = document.getElementById("lb");
  if (lb) return lb;

  lb = document.createElement("div");
  lb.id = "lb";
  lb.className = "lb";
  lb.innerHTML = `
    <div class="lb-ui" style="
      position:absolute; inset:0; display:grid; place-items:center; padding:24px;
      pointer-events:none;
    ">
      <button id="lbPrev" type="button" aria-label="Previous cover"
        style="pointer-events:auto; position:absolute; left:14px; top:50%; transform:translateY(-50%);
               width:40px; height:40px; border-radius:999px; border:0; background:rgba(0,0,0,.35);
               color:#fff; cursor:pointer; display:grid; place-items:center;">
        ‹
      </button>
      <button id="lbNext" type="button" aria-label="Next cover"
        style="pointer-events:auto; position:absolute; right:14px; top:50%; transform:translateY(-50%);
               width:40px; height:40px; border-radius:999px; border:0; background:rgba(0,0,0,.35);
               color:#fff; cursor:pointer; display:grid; place-items:center;">
        ›
      </button>

      <div id="lbCount"
        style="pointer-events:none; position:absolute; bottom:14px; left:50%; transform:translateX(-50%);
               font-size:12px; color:#fff; opacity:.85; background:rgba(0,0,0,.35);
               padding:6px 10px; border-radius:999px;">
      </div>

      <img id="lbImg" alt="" style="pointer-events:auto;">
    </div>
  `;
  document.body.appendChild(lb);

  // Click background OR image closes
  lb.addEventListener("click", (e) => {
    if (e.target === lb || e.target.id === "lbImg") closeLightbox();
  });

  // ESC closes (bound once)
  if (!__lbBound) {
    __lbBound = true;

    document.addEventListener("keydown", (e) => {
      const open = document.getElementById("lb")?.classList.contains("is-open");
      if (!open) return;

      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") { e.preventDefault(); lbPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); lbNext(); }
      else if (e.key === "n") { e.preventDefault(); lbNext(); }
      else if (e.key === "N") { e.preventDefault(); lbPrev(); }
    });
  }

  // Also close on tapping the image itself (iOS feels more reliable this way)
  const img = lb.querySelector("#lbImg");
  img?.addEventListener("pointerup", (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  // Prev/Next buttons
  lb.querySelector("#lbPrev")?.addEventListener("click", (e) => { e.stopPropagation(); lbPrev(); });
  lb.querySelector("#lbNext")?.addEventListener("click", (e) => { e.stopPropagation(); lbNext(); });

  // Wheel navigation (throttled)
  let wheelLock = false;
  lb.addEventListener("wheel", (e) => {
    const open = lb.classList.contains("is-open");
    if (!open) return;
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 120);

    if (Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    if (e.deltaY > 0) lbNext();
    else lbPrev();
  }, { passive: false });

  // Basic swipe (touch) navigation
  let sx = 0, sy = 0, touching = false;
  lb.addEventListener("touchstart", (e) => {
    if (!lb.classList.contains("is-open")) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    touching = true;
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });

  lb.addEventListener("touchend", (e) => {
    if (!touching) return;
    touching = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) lbNext();
      else lbPrev();
    }
  }, { passive: true });

  return lb;
}

function updateLightboxUI() {
  const lb = document.getElementById("lb");
  if (!lb) return;
  const img = document.getElementById("lbImg");
  const count = document.getElementById("lbCount");
  if (!img || !count) return;

  const item = STATE.cover.gallery[STATE.cover.index] || null;
  if (!item) return;

  img.src = item.full || item.large || item.thumb || "";
  img.alt = item.alt || "Cover";

  const n = STATE.cover.gallery.length;
  count.textContent = n > 1 ? `${STATE.cover.index + 1} / ${n}` : "";

  // Hide nav buttons if single image
  const prev = lb.querySelector("#lbPrev");
  const next = lb.querySelector("#lbNext");
  if (prev) prev.style.display = n > 1 ? "grid" : "none";
  if (next) next.style.display = n > 1 ? "grid" : "none";
}

function openLightboxAt(index = 0) {
  const lb = ensureLightboxOnce();
  const n = STATE.cover.gallery.length;

  const nextIdx = n ? ((index % n) + n) % n : 0;
  setCoverState({ index: nextIdx });

  updateLightboxUI();

  lb.classList.remove("is-open");
  requestAnimationFrame(() => lb.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const lb = document.getElementById("lb");
  if (!lb) return;
  lb.classList.remove("is-open");
  document.body.style.overflow = "";
}

function lbNext() {
  const n = STATE.cover.gallery.length;
  if (n <= 1) return;
  const nextIdx = (STATE.cover.index + 1) % n;
  setCoverState({ index: nextIdx });
  updateLightboxUI();
}

function lbPrev() {
  const n = STATE.cover.gallery.length;
  if (n <= 1) return;
  const nextIdx = (STATE.cover.index - 1 + n) % n;
  setCoverState({ index: nextIdx });
  updateLightboxUI();
}

function bindCoverGalleryOnce(root = document) {
  const img = $("#coverImg", root);
  const box = $(".cover-box", root);
  if (!img || !box || box.dataset.covBound === "1") return;
  box.dataset.covBound = "1";

  // Desktop: open lightbox gallery
  const desktopHandler = () => {
    if (!STATE.cover.gallery.length) return;
    openLightboxAt(STATE.cover.index || 0);
  };

  // Mobile: inline swipe carousel (no lightbox)
  const mobileBind = () => {
    if (!STATE.cover.gallery.length) return;

    // small count badge (inline style; no CSS changes needed)
    let badge = box.querySelector(".cov-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "cov-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.style.cssText = `
        position:absolute; right:10px; bottom:10px;
        font-size:12px; padding:6px 10px; border-radius:999px;
        background:rgba(0,0,0,.35); color:#fff; opacity:.9;
        pointer-events:none;
      `;
      box.style.position = "relative";
      box.appendChild(badge);
    }

    const updateInline = () => {
      const it = STATE.cover.gallery[STATE.cover.index] || null;
      if (!it) return;
      img.src = it.large || it.full || it.thumb || "";
      img.alt = it.alt || "Cover";
      badge.textContent = STATE.cover.gallery.length > 1 ? `${STATE.cover.index + 1} / ${STATE.cover.gallery.length}` : "";
    };

    updateInline();

    let sx = 0, sy = 0, touching = false;
    box.addEventListener("touchstart", (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      touching = true;
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });

    box.addEventListener("touchend", (e) => {
      if (!touching) return;
      touching = false;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        const n = STATE.cover.gallery.length;
        if (n > 1) {
          const nextIdx =
            dx < 0
              ? (STATE.cover.index + 1) % n
              : (STATE.cover.index - 1 + n) % n;

          setCoverState({ index: nextIdx });
          updateInline();
        }
      }
    }, { passive: true });

    // Tap cycles (nice on mobile)
    box.addEventListener("click", () => {
      const n = STATE.cover.gallery.length;
      if (n <= 1) return;
      const nextIdx = (STATE.cover.index + 1) % n;
      setCoverState({ index: nextIdx });
      updateInline();
    });
  };

  const applyMode = () => {
    // Clean previous click listeners by reassigning (simple & safe here)
    img.onclick = null;
    box.onclick = null;

    if (isMobileLayout()) {
      // Disable desktop lightbox
      mobileBind();
    } else {
      // Ensure front cover remains visible (no inline cycling)
      const frontIdx = STATE.cover.gallery.findIndex((x) => x.front);
      const nextIdx = frontIdx >= 0 ? frontIdx : 0;
      setCoverState({ index: nextIdx });

      const it = STATE.cover.gallery[STATE.cover.index] || null;
      if (it) {
        img.src = it.large || it.full || it.thumb || img.src;
        img.alt = it.alt || img.alt || "Cover";
      }
      box.addEventListener("click", desktopHandler);
      img.style.cursor = "zoom-in";
    }
  };

  applyMode();
  window.addEventListener("resize", applyMode);
}

/* ============================================================
   5) MusicBrainz link helpers (HTML links)
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
  const perf = rels.filter((r) => (r.target_type ?? r["target-type"]) === "artist");
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
        ["vocals", "soprano", "mezzo-soprano", "alto", "tenor", "baritone", "bass"].includes(
          String(a).toLowerCase()
        )
      );

    if (!isInstrument && !isVocal) continue;

    const role = attrs.length ? attrs.join(", ") : isVocal ? "vocals" : "instrument";

    if (!byRole.has(role)) byRole.set(role, new Map());
    byRole.get(role).set(artist.id, artist);
  }

  return Array.from(byRole.entries())
    .map(([role, artistMap]) => ({
      role,
      artists: Array.from(artistMap.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
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
  if (items.length) return renderRoleList(items);

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
  const workRel = rels.find((r) => (r.target_type ?? r["target-type"]) === "work");
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
      artists: Array.from(artistMap.values()).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
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
const EXCLUDE_ARTIST_REL_TYPES = new Set(["instrument", "vocal", "composer", "lyricist", "librettist"]);

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

  if (a.length === 1) return { role: `${a[0]} ${type}`.trim(), rest: [] };
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

let __mediaForRecordings = [];

function itemsToRoleMap(items) {
  const map = new Map();
  for (const it of items || []) {
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

  for (const [role, set] of roleMaps[0].entries()) common.set(role, new Set(set));

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

  for (const items of itemsList || []) {
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

  for (const it of items || []) {
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

  const seenGlobal = new Set();
  const albumRecIds = [];
  for (const m of media) {
    for (const t of m.tracks || []) {
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
    for (const t of m.tracks || []) {
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

  const w = await fetchJSON(`https://musicbrainz.org/ws/2/work/${workId}?fmt=json&inc=artist-rels+work-rels`);
  workCache.set(workId, w);
  return w;
}

async function loadRelease(mbid) {
  const relUrl =
    `https://musicbrainz.org/ws/2/release/${mbid}` +
    `?fmt=json&inc=recordings+artists+labels+release-groups+artist-credits+recording-rels+work-rels+annotation+release-rels+artist-rels+label-rels`;
  const rel = await fetchJSON(relUrl);

  // Cover Art Archive: collect ALL images (not only front) for paging.
  let covers = [];
  try {
    const ca = await fetchJSON(`https://coverartarchive.org/release/${mbid}`);
    covers = (ca?.images || [])
      .map((img, i) => {
        const full = img.image || "";
        const large = img.thumbnails?.large || img.thumbnails?.[500] || img.thumbnails?.[250] || full;
        const thumb = img.thumbnails?.small || img.thumbnails?.[120] || large || full;

        const parts = [];
        if (img.front) parts.push("front");
        if (img.back) parts.push("back");
        const alt = parts.length ? `Cover (${parts.join(", ")})` : `Cover ${i + 1}`;

        return {
          full,
          large,
          thumb,
          front: !!img.front,
          back: !!img.back,
          comment: String(img.comment || "").trim(),
          alt,
        };
      })
      .filter((x) => x.full || x.large || x.thumb);
  } catch {
    covers = [];
  }

  // Pick the visual "front" that the main UI keeps showing
  let cover = null;
  const front = covers.find((c) => c.front) || covers[0] || null;
  cover = front ? (front.large || front.full || front.thumb) : null;

  return { rel, cover, covers };
}

/* ============================================================
   8.5) Release search (omnibox)
   ============================================================ */

function buildReleaseSearchQuery(input) {
  const q0 = String(input || "").trim();
  if (!q0) return "";

  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tok = (t) => `"${esc(t)}"`;

  // ------------------------------------------------------------
  // 0) Optional comma syntax: "artist, release"
  // ------------------------------------------------------------
  const commaIdx = q0.indexOf(",");
  if (commaIdx !== -1) {
    const leftRaw = q0.slice(0, commaIdx).trim();
    const rightRaw = q0.slice(commaIdx + 1).trim();

    if (!rightRaw) {
      const t = tok(leftRaw);
      return `(artist:${t} OR release:${t})`;
    }

    if (!leftRaw) {
      const t = tok(rightRaw);
      return `(release:${t} OR artist:${t})`;
    }

    const artistPhrase = `"${esc(leftRaw)}"`;
    const releasePhrase = `"${esc(rightRaw)}"`;

    const artistTokens = leftRaw.split(/\s+/).map(s => s.trim()).filter(Boolean).map(tok);
    const releaseTokens = rightRaw.split(/\s+/).map(s => s.trim()).filter(Boolean).map(tok);

    const artistAND = artistTokens.map(t => `artist:${t}`).join(" AND ");
    const releaseAND = releaseTokens.map(t => `release:${t}`).join(" AND ");

    return `(
      (artist:${artistPhrase} AND release:${releasePhrase})^30
      OR ((${artistAND}) AND (${releaseAND}))^22
      OR (artist:${artistPhrase})^8
      OR (release:${releasePhrase})^6
      OR ((${artistTokens.map(t => `(artist:${t} OR release:${t})`).join(" AND ")}) AND (${releaseTokens.map(t => `(artist:${t} OR release:${t})`).join(" AND ")}))^2
    )`.replace(/\s+/g, " ").trim();
  }

  // ------------------------------------------------------------
  // 1) Spotlight mode (no comma)
  // ------------------------------------------------------------
  const rawTokens = q0.split(/\s+/).map(t => t.trim()).filter(Boolean);
  if (!rawTokens.length) return "";

  const tokens = rawTokens.map(tok);

  if (tokens.length === 1) {
    const t = tokens[0];
    return `(release:${t} OR artist:${t})`;
  }

  const phrase = `"${esc(rawTokens.join(" "))}"`;

  if (tokens.length === 2) {
    const [t1, t2] = tokens;

    return `(
      artist:${phrase}^18
      OR (artist:${t1} AND artist:${t2})^12
      OR release:${phrase}^6
      OR (release:${t1} AND release:${t2})^4
      OR ((artist:${t1} OR release:${t1}) AND (artist:${t2} OR release:${t2}))^2
    )`.replace(/\s+/g, " ").trim();
  }

  const broad = tokens
    .map(t => `(artist:${t} OR release:${t})`)
    .join(" AND ");

  const phraseArtist = `artist:${phrase}^10`;
  const phraseRelease = `release:${phrase}^6`;

  const last = tokens[tokens.length - 1];
  const firstPart = tokens.slice(0, -1);

  const artistPart = firstPart.map(t => `artist:${t}`).join(" AND ");
  const structured = artistPart
    ? `(${artistPart} AND release:${last})^4`
    : "";

  return `(
    (${broad})^1
    OR ${phraseArtist}
    OR ${phraseRelease}
    ${structured ? `OR ${structured}` : ""}
  )`.replace(/\s+/g, " ").trim();
}

function firstReleaseDateLike(hit) {
  const d = String(hit?.date || "").trim();
  if (d) return d;
  return "";
}

function summarizeSearchHit(hit) {
  const mbid = hit?.id || "";
  const titleRaw = String(hit?.title || "").trim();

  const ac = hit?.["artist-credit"];
  const artist = artistCreditToText(ac);

  const date = firstReleaseDateLike(hit);
  const year = date ? String(date).slice(0, 4) : "";

  const format =
    String(hit?.media?.[0]?.format || hit?.packaging || "").trim();

  const country = String(hit?.country || "").trim();
  const label = String(hit?.["label-info"]?.[0]?.label?.name || "").trim();

  const head = `${artist || "Various Artists"} — ${titleRaw}${year ? ` (${year})` : ""}`.trim();

  const parts = [];
  if (date) parts.push(date);
  if (country) parts.push(country);
  if (label) parts.push(label);
  if (format) parts.push(format);

  return {
    mbid,
    title: head,
    sub: parts.join(" · "),
  };
}

async function searchReleases(q, limit = CONFIG.SEARCH_LIMIT) {
  const query = buildReleaseSearchQuery(q);
  if (!query) return [];

  const url =
    `https://musicbrainz.org/ws/2/release/?fmt=json&limit=${encodeURIComponent(
      String(limit)
    )}&query=${encodeURIComponent(query)}`;

  const data = await fetchJSON(url);
  const hits = Array.isArray(data?.releases) ? data.releases : [];

  return hits
    .map(summarizeSearchHit)
    .filter((x) => x.mbid && x.title)
    .slice(0, limit);
}

/* ============================================================
   9) Rendering + UI binding
   ============================================================ */
function renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes }) {
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

          <button class="theme-fab" id="themeToggle" type="button"></button>
        </div>
      </div>

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

function hydrateUI(out, flatTracks) {
  applyTheme(getPreferredTheme());
  bindThemeToggleOnce(out);

  bindTabsOnce();
  setActiveView("tracks");

  bindTrackToggles(out, flatTracks);
  bindCoverGalleryOnce(out);

  bindCoverSizerOnce();
}

function renderAll({ rel, cover, covers }) {
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

  // Cover gallery state
  const gallery = Array.isArray(covers) ? covers : [];
  let idx = gallery.findIndex((x) => x.front);
  if (idx < 0) idx = 0;

  setCoverState({
    gallery,
    index: idx,
  });

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
  setViewsState({ recordingsBuilt: false });

  const out = $("#out");
  if (!out) return;

  out.innerHTML = `
    ${renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes })}
    <div class="views">
      ${renderTracksView(mediaWithTracks, annotation)}
      ${renderRecordingsViewShell()}
    </div>
  `;

  hydrateUI(out, flatTracks);

  // Initial layout pass
  layoutSync(out);

  // Cover image load can change intrinsic sizing; re-sync once
  const img = $("#coverImg", out);
  if (img) {
    const relock = () => layoutSync(out);
    img.addEventListener("load", relock, { once: true });
    if (img.complete) relock();
  }
}

/* ============================================================
   10) App entry: omnibox + loader
   ============================================================ */
async function goByMbid(mbid) {
  if (!mbid) return;

  closeSearch();

  const out = $("#out");
  if (out) out.innerHTML = `<div class="muted">Loading…</div>`;

  try {
    const data = await loadRelease(mbid);
    renderAll(data);

    const omni = document.getElementById("omni");
    if (omni) {
      omni.value = mbid;
      omni.classList.add("is-loaded");
    }

    // nice-to-have: update URL param (so you can bookmark)
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mbid", mbid);
      history.replaceState({}, "", u.toString());
    } catch {}
  } catch (e) {
    if (out) out.innerHTML = `<div class="err">Hiba: ${escHtml(e.message)}</div>`;
  }
}

async function go() {
  const omni = document.getElementById("omni");
  const raw = String(omni?.value || "").trim();

  const mbid = extractMBID(raw);

  // 1) MBID/URL → load release
  if (mbid) {
    await goByMbid(mbid);
    return;
  }

  // 2) otherwise → search
  const q = raw;
  if (q.length < CONFIG.SEARCH_MIN_CHARS) return;

  openSearch();
  const resEl = document.getElementById("results");
  if (resEl) resEl.innerHTML = `<div class="result"><span class="muted">Searching…</span></div>`;

  try {
    const items = await searchReleases(q, CONFIG.SEARCH_LIMIT);
    renderSearchResults(items);
  } catch {
    if (resEl) resEl.innerHTML = `<div class="result"><span class="muted">Search error</span></div>`;
  }
}

/**
 * Single omnibox binder:
 *  - paste MBID/URL → immediate load
 *  - type text → debounced search results
 *  - Enter → load selected result (or first), or load MBID/URL if present
 */
function bindOmniOnce() {
  const omni = document.getElementById("omni");
  const goBtn = document.getElementById("go");
  const resEl = document.getElementById("results");
  if (!omni || !goBtn || !resEl) return;

  if (omni.dataset.bound === "1") return;
  omni.dataset.bound = "1";

  const runSearch = debounce(async () => {
    const val = String(omni.value || "").trim();
    const mbid = extractMBID(val);
    if (mbid) {
      // if it’s an MBID/URL, don’t show dropdown
      closeSearch();
      return;
    }

    if (val.length < 2) {
      renderSearchResults([]);
      openSearch();
      return;
    }

    openSearch();
    resEl.innerHTML = `<div class="result"><span class="muted">Searching…</span></div>`;

    try {
      const items = await searchReleases(val, CONFIG.SEARCH_LIMIT);
      renderSearchResults(items);
    } catch {
      resEl.innerHTML = `<div class="result"><span class="muted">Search error</span></div>`;
    }
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  function pickActiveOrFirst() {
    const it = STATE.search.items[STATE.search.active] || STATE.search.items[0] || null;
    if (it?.mbid) return it.mbid;
    return "";
  }

  omni.addEventListener("focus", () => {
    const val = String(omni.value || "").trim();
    const mbid = extractMBID(val);
    if (mbid) return; // no dropdown
    openSearch();
    if (val.length >= CONFIG.SEARCH_MIN_CHARS) runSearch();
    else renderSearchResults([]);
  });

  omni.addEventListener("input", () => {
    omni.classList.remove("is-loaded");
    runSearch();
  });

  omni.addEventListener("paste", () => {
    // let paste complete, then decide
    setTimeout(async () => {
      const val = String(omni.value || "").trim();
      const mbid = extractMBID(val);
      if (mbid) {
        await goByMbid(mbid);
      } else {
        runSearch();
      }
    }, 0);
  });

  omni.addEventListener("keydown", async (e) => {
    // arrows/enter only if dropdown is open OR might need to open it
    if (e.key === "ArrowDown") {
      if (!STATE.search.open) openSearch();
      e.preventDefault();
      setActiveResult(STATE.search.active + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!STATE.search.open) openSearch();
      e.preventDefault();
      setActiveResult(STATE.search.active - 1);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();

      const val = String(omni.value || "").trim();
      const mbid = extractMBID(val);

      // MBID/URL wins
      if (mbid) {
        await goByMbid(mbid);
        return;
      }

      // If we have items, open selected/first
      const pick = pickActiveOrFirst();
      if (pick) {
        await goByMbid(pick);
        return;
      }

      // Otherwise run a search
      await go();
    }
  });

  resEl.addEventListener("click", async (e) => {
    const item = e.target.closest(".result");
    if (!item) return;
    const idx = Number(item.dataset.i);
    if (Number.isFinite(idx)) setActiveResult(idx);

    const it = STATE.search.items[idx];
    if (it?.mbid) await goByMbid(it.mbid);
  });

  goBtn.addEventListener("click", async () => {
    const val = String(omni.value || "").trim();
    const mbid = extractMBID(val);
    if (mbid) {
      await goByMbid(mbid);
      return;
    }

    // if dropdown has items, load active/first
    const pick = pickActiveOrFirst();
    if (pick) {
      await goByMbid(pick);
      return;
    }

    await go();
  });

  // click-outside closes
  document.addEventListener("click", (e) => {
    if (!STATE.search.open) return;
    // close only if click is outside the search area
    const searchWrap = omni.closest(".search") || omni.parentElement;
    if (searchWrap && searchWrap.contains(e.target)) return;
    if (resEl.contains(e.target)) return;
    closeSearch();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(getPreferredTheme());

  bindOmniOnce();

  // autoload from URL (?mbid=... or full MB release URL)
  const omni = document.getElementById("omni");
  if (!omni) return;

  const qs = new URLSearchParams(window.location.search);
  const mbidParam = String(qs.get("mbid") || "").trim();
  if (mbidParam) {
    omni.value = mbidParam;
    omni.classList.remove("is-loaded");
    const mbid = extractMBID(mbidParam);
    if (mbid) goByMbid(mbid);
  }
});