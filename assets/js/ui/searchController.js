import { CONFIG } from "../core/config.js";
import { STATE, setSearchState } from "../core/state.js";
import { extractMBID, debounce, escAttr, escHtml } from "../core/util.js";
import { searchReleases } from "../services/api.js";

const $ = (id) => document.getElementById(id);
let searchClickOutsideBound = false;

function renderResultItem(it, i, isActive) {
  return `
    <div class="result ${isActive ? "is-active" : ""}" data-i="${escAttr(i)}">
      <img
        class="res-thumb"
        src="${escAttr(`https://coverartarchive.org/release/${it.mbid}/front-250`)}"
        alt=""
        loading="lazy"
        decoding="async"
        onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'res-thumb is-empty',ariaHidden:'true'}));"
      />
      <div class="res-text">
        <div class="res-title">${escHtml(it.title)}</div>
        <div class="sub">${escHtml(it.sub || "")}</div>
      </div>
    </div>
  `;
}

export function openSearch() {
  setSearchState({ open: true });
  const res = $("results");
  if (res) res.hidden = false;
}

export function closeSearch() {
  setSearchState({ open: false });
  const res = $("results");
  if (res) res.hidden = true;
}

export function renderSearchResults(items) {
  const res = $("results");
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
    .map((it, i) => renderResultItem(it, i, i === 0))
    .join("");
}

export function setActiveResult(i) {
  const res = $("results");
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

/* SearchController: csak UI + keresés + választás.
 * A tényleges “load MBID” műveletet kívülről injektáljuk: onGoByMbid(mbid)
 */
export function createSearchController({ onGoByMbid, onGoFallback }) {
  let omni = null;
  let goBtn = null;
  let resEl = null;

  const getInputValue = () => String(omni?.value || "").trim();

  const runSearch = debounce(async () => {
    if (!omni || !resEl) return;

    const val = getInputValue();
    const mbid = extractMBID(val);

    if (mbid) {
      closeSearch();
      return;
    }

    if (val.length < CONFIG.SEARCH_MIN_CHARS) {
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
    return it?.mbid || "";
  }

  async function goByInput() {
    if (!omni) return;
    const val = getInputValue();
    const mbid = extractMBID(val);

    if (mbid) {
      await onGoByMbid(mbid);
      return;
    }

    const pick = pickActiveOrFirst();
    if (pick) {
      await onGoByMbid(pick);
      return;
    }

    if (onGoFallback) await onGoFallback();
  }

  function bindUIOnce() {
    if (!omni || !resEl) return;

    if (omni.dataset.bound_searchctrl === "1") return;
    omni.dataset.bound_searchctrl = "1";

    omni.addEventListener("pointerdown", (e) => {
      if (document.activeElement !== omni) {
        e.preventDefault();
        omni.focus();
        setTimeout(() => omni.select(), 0);
      }
    });

    omni.addEventListener("focus", () => {
      setTimeout(() => omni.select(), 0);

      const val = getInputValue();
      const mbid = extractMBID(val);
      if (mbid) return;

      openSearch();
      if (val.length >= CONFIG.SEARCH_MIN_CHARS) runSearch();
      else renderSearchResults([]);
    });

    omni.addEventListener("input", () => {
      omni.classList.remove("is-loaded");
      runSearch();
    });

    omni.addEventListener("paste", () => {
      setTimeout(async () => {
        const val = getInputValue();
        const mbid = extractMBID(val);
        if (mbid) await onGoByMbid(mbid);
        else runSearch();
      }, 0);
    });

    omni.addEventListener("keydown", async (e) => {
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
        await goByInput();
      }
    });

    resEl.addEventListener("click", async (e) => {
      const item = e.target.closest(".result");
      if (!item) return;
      const idx = Number(item.dataset.i);
      if (Number.isFinite(idx)) setActiveResult(idx);

      const it = STATE.search.items[idx];
      if (it?.mbid) await onGoByMbid(it.mbid);
    });

    resEl.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".result");
      if (!item) return;
      const idx = Number(item.dataset.i);
      if (Number.isFinite(idx)) setActiveResult(idx);
    });

    resEl.addEventListener("mousedown", (e) => e.preventDefault());

    goBtn?.addEventListener("click", async () => {
      await goByInput();
    });

    // click-outside closes (guarded once)
    if (!searchClickOutsideBound) {
      searchClickOutsideBound = true;

      document.addEventListener("click", (e) => {
        if (!STATE.search.open) return;

        const omniNow = document.getElementById("omni");
        const resNow = document.getElementById("results");
        if (!omniNow || !resNow) return;

        const searchWrap = omniNow.closest(".search") || omniNow.parentElement;
        if (searchWrap && searchWrap.contains(e.target)) return;
        if (resNow.contains(e.target)) return;

        closeSearch();
      });
    }
  }

  function init() {
    omni = document.getElementById("omni");
    goBtn = document.getElementById("go");
    resEl = document.getElementById("results");
    if (!omni || !resEl) return;

    bindUIOnce();
  }

  return Object.freeze({ init });
}