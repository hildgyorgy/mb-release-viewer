/* ============================================================
   Navigation / loading helpers
   ============================================================ */

import { escHtml } from "../core/util.js";
import { closeSearch } from "../ui/searchController.js";

const $ = (id) => document.getElementById(id);

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
  const omni = $("omni");
  if (!omni) return;
  omni.value = mbid;
  omni.classList.add("is-loaded");
}

/**
 * Create a navigator that:
 * - closes search dropdown
 * - shows Loading…
 * - loads release via loadRelease
 * - calls renderReleasePage({rel, cover, covers})
 * - updates omnibox + URL param
 */
export function createReleaseNavigator({ getOut, loadRelease, renderReleasePage }) {
  if (typeof loadRelease !== "function") throw new Error("createReleaseNavigator: loadRelease missing");
  if (typeof renderReleasePage !== "function")
    throw new Error("createReleaseNavigator: renderReleasePage missing");

  const resolveOut =
    typeof getOut === "function" ? getOut : () => document.getElementById("out");

    async function goByMbid(mbid) {
    if (!mbid) return;

    closeSearch();

    const out = resolveOut();
    if (out) out.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const data = await loadRelease(mbid);

      renderReleasePage(out, data);

      setOmniLoadedValue(mbid);
      setUrlMbid(mbid);
    } catch (e) {
      if (out) {
        out.innerHTML = `<div class="err">Hiba: ${escHtml(e?.message || e)}</div>`;
      }
    }
  }

  return Object.freeze({ goByMbid });
}