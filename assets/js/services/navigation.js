/* ============================================================
   Navigation / loading helpers
   ============================================================ */

import { closeSearch } from "../ui/searchController.js";

/**
 * Update ?mbid=... in the URL (bookmarkable), without reload.
 */
export function setUrlMbid(mbid) {
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("mbid", mbid);
    history.replaceState({}, "", u.toString());
  } catch {
    // ignore
  }
}

/**
 * Reflect loaded MBID in the omnibox UI.
 */
export function setOmniLoadedValue(mbid) {
  const omni = document.getElementById("omni");
  if (!omni) return;
  omni.value = mbid;
  omni.classList.add("is-loaded");
}

/**
 * Create a loader that:
 * - closes search dropdown
 * - shows Loading…
 * - loads release via loadRelease
 * - calls renderAll({rel, cover, covers})
 * - updates omnibox + URL param
 */
export function createReleaseNavigator({ loadRelease, renderAll }) {
  if (typeof loadRelease !== "function") throw new Error("createReleaseNavigator: loadRelease missing");
  if (typeof renderAll !== "function") throw new Error("createReleaseNavigator: renderAll missing");

  async function goByMbid(mbid) {
    if (!mbid) return;

    closeSearch();

    const out = document.getElementById("out");
    if (out) out.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const data = await loadRelease(mbid);
      renderAll(data);

      setOmniLoadedValue(mbid);
      setUrlMbid(mbid);
    } catch (e) {
      if (out) out.innerHTML = `<div class="err">Hiba: ${String(e?.message || e)}</div>`;
    }
  }

  return Object.freeze({ goByMbid });
}