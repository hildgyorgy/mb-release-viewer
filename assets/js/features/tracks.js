import { $, $$, escHtml } from "../core/util.js";
import { loadRecording, loadWork } from "../services/api.js";
import { renderTrackDetails, getPrimaryWorkIdFromRecording } from "./trackDetails.js";

/* ============================================================
   Tracks: open/close + lazy-load details
   ============================================================ */

function closeDetails(detailsRow, trackRow) {
  const wrap = $(".details-wrap", detailsRow);
  if (!wrap) return;

  // set current height, then animate to 0
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

// “release payload” recording sometimes lacks full rels; decide whether to refetch
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

/**
 * Bind click-to-toggle behaviour for the track table.
 *
 * @param {HTMLElement} outEl - root container (the #out element)
 * @param {Array} flatTracks - the flat track list you already build in renderAll
 */
export function bindTrackToggles(outEl, flatTracks) {
  const trackTable = $(".tracks table", outEl);
  if (!trackTable) return;

  // guard
  if (trackTable.dataset.boundTracks === "1") return;
  trackTable.dataset.boundTracks = "1";

  trackTable.addEventListener("click", async (e) => {
    const tr = e.target.closest("tr.track");
    if (!tr) return;

    const i = tr.dataset.i;
    const details = $(`tr.details[data-i="${i}"]`, outEl);
    if (!details) return;

    const wrap = $(".details-wrap", details);
    const inner = $(".details-inner", details);
    if (!wrap || !inner) return;

    // toggle close
    const isOpen = details.classList.contains("is-open");
    if (isOpen) {
      closeDetails(details, tr);
      return;
    }

    // close others
    closeAllOtherDetails(outEl, details);

    // open and load
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

    // re-measure after async content injection
    requestAnimationFrame(() => (wrap.style.maxHeight = wrap.scrollHeight + "px"));
  });
}