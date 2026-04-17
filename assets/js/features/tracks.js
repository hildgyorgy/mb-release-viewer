import { $, $$, escHtml } from "../core/util.js";
import { loadRecording, loadWork } from "../services/api.js";
import { renderTrackDetails, getPrimaryWorkIdFromRecording } from "./trackDetails.js";
import { openArtistPanel, closeArtistPanel } from "./artistPanel.js";

/* ============================================================
   Tracks: open/close + lazy-load details
   ============================================================ */

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

function closeAllOtherDetails(outEl, keepDetailsRow) {
  $$("tr.details.is-open", outEl).forEach((d) => {
    if (d === keepDetailsRow) return;
    const ti = d.dataset.i;
    const openTr = $(`tr.track[data-i="${ti}"]`, outEl);
    if (openTr) closeDetails(d, openTr);
  });
}

// "release payload" recording sometimes lacks full rels; decide whether to refetch
async function ensureFullRecording(fromRelease, recId) {
  let recording = fromRelease;

  try {
    const rels = Array.isArray(recording?.relations) ? recording.relations : [];
    const hasWork = rels.some((r) => (r.target_type ?? r["target-type"]) === "work");
    const hasArtist = rels.some((r) => (r.target_type ?? r["target-type"]) === "artist");

    if (!hasWork || !hasArtist) {
      recording = await loadRecording(recId);
    }
  } catch {
    recording = null;
  }

  return recording;
}

// Re-measure the details-wrap after content changes (panel open/close)
function remeasureWrap(detailsRow) {
  const wrap = $(".details-wrap", detailsRow);
  if (wrap) wrap.style.maxHeight = wrap.scrollHeight + "px";
}

/**
 * Bind click-to-toggle behaviour for the track table.
 *
 * @param {HTMLElement} outEl       - root container (the #out element)
 * @param {Array}       flatTracks  - flat track list built in renderReleasePage
 * @param {Function}    onLoadRelease - called with rgId when artist panel discography is clicked
 */
export function bindTrackToggles(outEl, flatTracks, onLoadRelease) {
  const trackTable = $(".tracks table", outEl);
  if (!trackTable) return;

  // Guard — only bind once
  if (trackTable.dataset.boundTracks === "1") return;
  trackTable.dataset.boundTracks = "1";

  // ----------------------------------------------------------
  // Artist panel — must be bound FIRST so stopPropagation
  // prevents the track toggle handler from also firing
  // ----------------------------------------------------------
  trackTable.addEventListener("click", async (e) => {
    const link = e.target.closest(".artist-panel-link");
    if (!link) return;

    // Stop the click reaching the track row toggle handler
    e.stopPropagation();
    e.preventDefault();

    const artistId = link.dataset.artistId;
    if (!artistId) return;

    // Find the .details-inner that contains this link
    const detailsRow = link.closest("tr.details");
    if (!detailsRow) return;
    const inner = $(".details-inner", detailsRow);
    if (!inner) return;

    // Open the panel — passing onLoadRelease so discography items can navigate
    await openArtistPanel(artistId, inner, async (rgId) => {
      if (typeof onLoadRelease === "function") {
        closeArtistPanel();
        await onLoadRelease(rgId);
      }
    });

    // Re-measure after panel opens
    remeasureWrap(detailsRow);

    // Watch for panel removal (✕ or click-outside) and re-measure
    const obs = new MutationObserver(() => {
      remeasureWrap(detailsRow);
      if (!inner.querySelector(".artist-panel")) obs.disconnect();
    });
    obs.observe(inner, { childList: true, subtree: false });
  });

  // ----------------------------------------------------------
  // Track row toggle — open/close details on track click
  // ----------------------------------------------------------
  trackTable.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr.track");
    if (!tr) return;

    const i = tr.dataset.i;
    const details = $(`tr.details[data-i="${i}"]`, outEl);
    if (!details) return;

    const wrap = $(".details-wrap", details);
    const inner = $(".details-inner", details);
    if (!wrap || !inner) return;

    // Toggle close
    const isOpen = details.classList.contains("is-open");
    if (isOpen) {
      closeArtistPanel();
      closeDetails(details, tr);
      return;
    }

    // Close other open rows (and their artist panels)
    closeArtistPanel();
    closeAllOtherDetails(outEl, details);

    // Open and load credits
    inner.innerHTML = `<div class="muted">Loading…</div>`;
    openDetails(details, tr);

    const fromRelease = flatTracks[Number(i)]?.rec || null;
    const recId = tr.dataset.rec || fromRelease?.id || "";

    if (!recId && !fromRelease) {
      inner.innerHTML = `<div class="muted">No recording id.</div>`;
      requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
      return;
    }

    const recording = await ensureFullRecording(fromRelease, recId);
    if (!recording) {
      inner.innerHTML = `<div class="muted">Could not load recording credits.</div>`;
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

    try {
      inner.innerHTML = await renderTrackDetails(recording, work);
    } catch (err) {
      inner.innerHTML = `<div class="muted">Details render error: ${escHtml(err?.message || String(err))}</div>`;
    }

    requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
  });
}