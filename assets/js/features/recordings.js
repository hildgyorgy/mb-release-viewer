// ============================================================
// Recordings view (technical / organisational credits)
// Incremental fill (1 req / ~1s), common credits computed at end
// ============================================================

import { STATE } from "../core/state.js";
import { escHtml, relDateLabel, uniq, mediumLabel } from "../core/util.js";
import { mbArtistLink, mbPlaceLink, mbRecordingLink, artistPanelLink, mbWorkUrl } from "../core/mbLinks.js";
import { loadRecording, loadWork } from "../services/api.js";
import {
  parsePerformersFromRecording,
  parseCreatorsFromWork,
  getWorkHierarchyLines,
  getPrimaryWorkIdFromRecording,
} from "./trackDetails.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startAsciiSpinner(setText) {
  const frames = ["|", "/", "-", "\\"]; // klasszikus :)
  let i = 0;
  const t = setInterval(() => setText(frames[i++ % frames.length]), 120);
  return () => clearInterval(t);
}

// throttle target ~1 request / second (MB WS etiquette)
const REQUEST_GAP_MS = 1050;

// Roles that should NOT appear on Recordings tab (moved to Tracklist performers etc.)
const EXCLUDE_ARTIST_REL_TYPES = new Set([
  "instrument",
  "vocal",
  "composer",
  "lyricist",
  "librettist",
  "arranger",
  "writer",

  "conductor",
  "orchestra",
  "ensemble",
  "choir",
  "chorus",
  "concertmaster",
  "leader",
  "soloist",
  "narrator",
  "spoken vocals",
  "performing orchestra",
]);

function prettyRelRole(typeRaw, attrs) {
  const type = String(typeRaw || "").trim();
  const typeLc = type.toLowerCase();

  const a = Array.isArray(attrs) ? attrs.map(String) : [];
  const aLc = a.map((x) => x.toLowerCase());

  // MusicBrainz convention: engineer + attribute refinement
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

  // Producer + attribute refinement
  if (typeLc === "producer") {
    if (aLc.includes("executive")) {
      return { role: "executive producer", rest: a.filter((x) => x.toLowerCase() !== "executive") };
    }
    if (aLc.includes("co")) {
      return { role: "co-producer", rest: a.filter((x) => x.toLowerCase() !== "co") };
    }
  }

  // If there's a single attribute, MB often intends "<attr> <type>"
  if (a.length === 1) return { role: `${a[0]} ${type}`.trim(), rest: [] };
  return { role: type, rest: a };
}

export function parseRecordingTechCredits(recording) {
  const rels = Array.isArray(recording?.relations) ? recording.relations : [];
  const rows = [];
  const dis = String(recording?.disambiguation || "").trim();

  for (const r of rels) {
    const tt = r.target_type ?? r["target-type"];
    const typeRaw = String(r.type || "").trim();
    if (!typeRaw) continue;

    // Work relations are handled in Tracklist details, not here
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

  // Group by role and dedupe values
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.role)) grouped.set(row.role, []);
    grouped.get(row.role).push(row.value);
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

export function renderRecordingTechGrid(items) {
  if (!items.length) return `<div class="muted">N/A</div>`;

  const rows = items
    .map((it) => {
      const role = escHtml(it.role);
      const isNotes = String(it.role || "").toLowerCase() === "notes";

      const value = isNotes
        ? `<span class="muted">${it.values.map((v) => escHtml(String(v))).join("<br>")}</span>`
        : it.values.map((v) => `<span class="rec-person">${v}</span>`).join("");

      return `
        <div class="rec-row">
          <div class="rec-role muted">${role}</div>
          <div class="rec-value">${value}</div>
        </div>
      `;
    })
    .join("");

  return `<div class="recording-grid">${rows}</div>`;
}

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

function collectAlbumRecordingIds(media) {
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
  return albumRecIds;
}

function collectMediumRecordingIds(medium) {
  const seen = new Set();
  const orderedRecIds = [];
  for (const t of medium.tracks || []) {
    const id = t?.rec?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    orderedRecIds.push(id);
  }
  return orderedRecIds;
}

// --- DOM helpers ------------------------------------------------------------

function setAllRecCellsHtml(view, recId, html) {
  const nodes = view.querySelectorAll(`[data-rec-id="${recId}"]`);
  nodes.forEach((el) => {
    el.innerHTML = `<div class="rec-reveal">${html}</div>`;
    const wrap = el.querySelector(".rec-reveal");
    requestAnimationFrame(() => wrap?.classList.add("is-in"));
  });
}

function setCommonCellHtml(view, html) {
  const el = view.querySelector("#recCommonCell");
  if (!el) return;
  el.innerHTML = `<div class="rec-reveal">${html}</div>`;
  const wrap = el.querySelector(".rec-reveal");
  requestAnimationFrame(() => wrap?.classList.add("is-in"));
}

function renderInlineSpinner() {
  return `<div class="rec-empty muted"><span class="rec-spin">|</span></div>`;
}

function startSpinnerInside(containerEl) {
  const spinEl = containerEl?.querySelector?.(".rec-spin");
  if (!spinEl) return () => { };
  return startAsciiSpinner((ch) => (spinEl.textContent = ch));
}

// ------------------------------------------------------------
// Public builder (entry point)
// ------------------------------------------------------------

export async function buildRecordingsView() {
  const view = document.querySelector('section.view[data-view="recordings"]');
  if (!view) return;

  const media = Array.isArray(STATE.views.recordingsMedia) ? STATE.views.recordingsMedia : [];
  const mediaCount = media.length;

  const albumRecIds = collectAlbumRecordingIds(media);
  const total = albumRecIds.length;

  // 0) Render skeleton IMMEDIATELY (titles come from STATE media tracks)
  let html = `

    <div class="tracks">
      <table>
        <tbody>

          <tr>
            <td class="num"></td>
            <td class="title">${escHtml("Common credits/notes")}</td>
            <td class="len"></td>
          </tr>
          <tr>
            <td class="num"></td>
            <td colspan="3" id="recCommonCell">
              <div class="rec-empty muted">
                Computing <span id="recCommonProg">(0/${total})</span>
                <span class="rec-spin">|</span>
              </div>
            </td>
          </tr>
  `;

  for (const m of media) {
    html += `
      <tr class="medium-row">
        <td class="medium-cell" colspan="3">${escHtml(mediumLabel(m, mediaCount))}</td>
      </tr>
    `;

    const orderedRecIds = collectMediumRecordingIds(m);

    for (let idx = 0; idx < orderedRecIds.length; idx++) {
      const recId = orderedRecIds[idx];
      const titleFromState = m?.tracks?.[idx]?.rec?.title || "(recording)";

      html += `
        <tr>
          <td class="num">${idx + 1}</td>
          <td class="title">${escHtml(titleFromState)}</td>
          <td class="len"></td>
        </tr>
        <tr>
          <td></td>
          <td colspan="2" data-rec-id="${escHtml(recId)}">
            ${renderInlineSpinner()}
          </td>
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

  // start spinners inside every row placeholder + common placeholder
  const rowStopFns = [];
  view.querySelectorAll('[data-rec-id] .rec-spin').forEach((el) => {
    rowStopFns.push(startAsciiSpinner((ch) => (el.textContent = ch)));
  });
  // common spinner
  const commonCell = view.querySelector("#recCommonCell");
  const stopCommonSpin = commonCell ? startSpinnerInside(commonCell) : () => { };

  // 1) Load recordings one-by-one, fill rows as they arrive
  const recData = new Map();
  const recItems = new Map();
  const roleMaps = [];
  const itemsListForCommon = [];

  let loaded = 0;
  const commonProgEl = view.querySelector("#recCommonProg");

  for (let k = 0; k < albumRecIds.length; k++) {

    const recId = albumRecIds[k];

    let rec = null;
    try {
      rec = await loadRecording(recId);
    } catch {
      rec = null;
    }

    recData.set(recId, rec);

    if (!rec) {
      setAllRecCellsHtml(
        view,
        recId,
        `<div class="rec-empty muted">(could not load recording)</div>`
      );
    } else {
      const items = parseRecordingTechCredits(rec);
      recItems.set(recId, items);
      roleMaps.push(itemsToRoleMap(items));
      itemsListForCommon.push(items);

      // TEMP: show full credits immediately (common subtraction later)
      const gridNow = items.length ? renderRecordingTechGrid(items) : `<div class="rec-empty muted">--</div>`;
      setAllRecCellsHtml(view, recId, gridNow);
    }

    loaded++;
    if (commonProgEl) commonProgEl.textContent = `(${loaded}/${total})`;

    // throttle (no extra backoff)
    if (k < albumRecIds.length - 1) await sleep(REQUEST_GAP_MS);
  }

  // 2) Compute common and update (final polish)
  const commonMap = intersectRoleMaps(roleMaps);
  const commonItems = Array.from(commonMap.entries())
    .map(([role, set]) => ({
      role,
      values: Array.from(set).sort((a, b) => String(a).localeCompare(String(b))),
    }))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  const commonNotes = getCommonNotesFromItemsList(itemsListForCommon);
  if (commonNotes) commonItems.push({ role: "notes", values: [commonNotes] });

  // show common (or --)
  stopCommonSpin();
  setCommonCellHtml(
    view,
    commonItems.length ? renderRecordingTechGrid(commonItems) : `<div class="rec-empty muted">--</div>`
  );

  // now update every loaded recording cell to show diff (subtract common)
  for (const recId of albumRecIds) {
    const rec = recData.get(recId) ?? null;
    if (!rec) continue;

    const items = recItems.get(recId) || [];
    const diffItems = subtractCommon(items, commonMap, commonNotes);

    const grid = diffItems.length ? renderRecordingTechGrid(diffItems) : `<div class="rec-empty muted">--</div>`;
    setAllRecCellsHtml(view, recId, grid);
  }

  const loadLine = view.querySelector("#recLoadLine");
  if (loadLine) loadLine.remove();
}
// ============================================================
// Full Credits view — all credit types per track
// creators → work → performers → tech credits
// Common credits summarised on top (same logic as above)
// ============================================================

// Render a simple role/value block in the shared perf style
function renderFullCreditsSection(items) {
  if (!items.length) return "";
  return items.map((it) => {
    const isNotes = String(it.role || "").toLowerCase() === "notes";
    const valuesHtml = isNotes
      ? `<span class="muted">${(it.values || []).map((v) => escHtml(String(v))).join("<br>")}</span>`
      : (it.values || []).map((v) => `<div class="fc-value-line">${v}</div>`).join("");
    return `
      <div class="fc-row">
        <div class="fc-role">${escHtml(it.role)}</div>
        <div class="fc-values">${valuesHtml}</div>
      </div>`;
  }).join("");
}

// Performers: convert parsePerformersFromRecording output → {role, values[]} shape
function performerItemsToRows(items) {
  return items.map((it) => ({
    role: it.role,
    values: it.artists.map((a) => artistPanelLink(a)),
  }));
}

// Creators: convert parseCreatorsFromWork output → {role, values[]} shape
function creatorItemsToRows(items) {
  return items.map((it) => ({
    role: it.role,
    values: it.artists.map((a) => artistPanelLink(a)),
  }));
}

// Work hierarchy block: returns simple {role, values[]} rows
async function workRows(work) {
  if (!work?.id) return [];
  const [l1, l2, l3] = await getWorkHierarchyLines(work);
  const a = String(l1 || "").trim();
  const b = String(l2 || "").trim();
  const c = String(l3 || "").trim();
  const leaf = (c || b || a).trim();
  if (!leaf) return [];

  const link = mbWorkUrl(work);
  const leafLink = `<a href="${link}" target="_blank" rel="noreferrer">${escHtml(leaf)}</a>`;

  const rows = [];
  if (a && a !== leaf) rows.push({ role: "work", values: [escHtml(a)] });
  if (b && b !== leaf) rows.push({ role: "", values: [escHtml(b)] });
  rows.push({ role: rows.length ? "" : "work", values: [leafLink] });
  return rows;
}

// Render one track's complete credit block
// Collect all creditable items for one track (excludes work titles)
// Returns {role, values[]} array ready for itemsToRoleMap
async function collectAllCreditRows(recording, work) {
  const rows = [];

  if (work) {
    const creatorItems = parseCreatorsFromWork(work);
    rows.push(...creatorItemsToRows(creatorItems));
  }

  const perfItems = parsePerformersFromRecording(recording);
  rows.push(...performerItemsToRows(perfItems));

  const techItems = parseRecordingTechCredits(recording);
  rows.push(...techItems);

  return rows;
}

// Subtract commonMap from a rows array — same logic as subtractCommon
function subtractCommonFromRows(rows, commonMap) {
  return rows
    .map((it) => {
      const commonSet = commonMap.get(String(it.role || "").trim());
      if (!commonSet) return it;
      const diffVals = (it.values || []).filter((v) => !commonSet.has(String(v)));
      return diffVals.length ? { role: it.role, values: diffVals } : null;
    })
    .filter(Boolean);
}

async function renderTrackFullCredits(recording, work, commonMap = new Map()) {
  const sections = [];

  // 1. Creators (minus common)
  if (work) {
    const creatorItems = parseCreatorsFromWork(work);
    const rows = subtractCommonFromRows(creatorItemsToRows(creatorItems), commonMap);
    if (rows.length) sections.push(renderFullCreditsSection(rows));
  }

  // 2. Work hierarchy — never subtracted, always per-track
  if (work) {
    const wRows = await workRows(work);
    if (wRows.length) sections.push(renderFullCreditsSection(wRows));
  }

  // 3. Performers (minus common)
  const perfItems = parsePerformersFromRecording(recording);
  const perfRows = subtractCommonFromRows(performerItemsToRows(perfItems), commonMap);
  if (perfRows.length) sections.push(renderFullCreditsSection(perfRows));

  // 4. Tech credits (minus common)
  const techItems = parseRecordingTechCredits(recording);
  const techRows = subtractCommonFromRows(techItems, commonMap);
  if (techRows.length) sections.push(renderFullCreditsSection(techRows));

  if (!sections.length) return `<div class="fc-empty muted">—</div>`;
  return `<div class="fc-track-credits">${sections.join('<div class="fc-section-gap"></div>')}</div>`;
}

export async function buildFullCreditsView() {
  const view = document.querySelector('section.view[data-view="recordings"]');
  if (!view) return;

  const media = Array.isArray(STATE.views.recordingsMedia) ? STATE.views.recordingsMedia : [];
  const mediaCount = media.length;
  const albumRecIds = collectAlbumRecordingIds(media);
  const total = albumRecIds.length;

  // Render skeleton immediately — same track list structure
  let html = `
    <div class="tracks">
      <table><tbody>
        <tr>
          <td class="num"></td>
          <td class="title">${escHtml("Common credits")}</td>
          <td class="len"></td>
        </tr>
        <tr>
          <td class="num"></td>
          <td colspan="3" id="recCommonCell">
            <div class="rec-empty muted">
              Computing <span id="recCommonProg">(0/${total})</span>
              <span class="rec-spin">|</span>
            </div>
          </td>
        </tr>`;

  for (const m of media) {
    html += `
      <tr class="medium-row">
        <td class="medium-cell" colspan="3">${escHtml(mediumLabel(m, mediaCount))}</td>
      </tr>`;

    const orderedRecIds = collectMediumRecordingIds(m);
    for (let idx = 0; idx < orderedRecIds.length; idx++) {
      const recId = orderedRecIds[idx];
      const track = m?.tracks?.[idx];
      const pos = track?.pos ?? (idx + 1);
      const title = track?.title || track?.rec?.title || "(recording)";

      html += `
        <tr>
          <td class="num">${pos}</td>
          <td class="title">${escHtml(title)}</td>
          <td class="len">${escHtml(track?.len || "")}</td>
        </tr>
        <tr>
          <td></td>
          <td colspan="2" data-rec-id="${escHtml(recId)}">${renderInlineSpinner()}</td>
        </tr>`;
    }
  }

  html += `</tbody></table></div>`;
  view.innerHTML = html;

  // Start spinners
  view.querySelectorAll('[data-rec-id] .rec-spin').forEach((el) => {
    startAsciiSpinner((ch) => (el.textContent = ch));
  });
  const commonCell = view.querySelector("#recCommonCell");
  const stopCommonSpin = commonCell ? startSpinnerInside(commonCell) : () => {};

  // Load recordings one by one — collect all credit rows for common computation
  const recData = new Map();           // recId → { rec, work }
  const allCreditRowsByRec = new Map(); // recId → rows (for common subtraction)
  const allRoleMaps = [];              // one roleMap per track (for intersection)
  let loaded = 0;
  const commonProgEl = view.querySelector("#recCommonProg");

  for (let k = 0; k < albumRecIds.length; k++) {
    const recId = albumRecIds[k];

    let rec = null;
    let work = null;
    try {
      rec = await loadRecording(recId);
      if (rec) {
        const workId = getPrimaryWorkIdFromRecording(rec);
        if (workId) work = await loadWork(workId);
      }
    } catch {
      rec = null;
    }

    recData.set(recId, { rec, work });

    if (!rec) {
      setAllRecCellsHtml(view, recId, `<div class="fc-empty muted">(could not load)</div>`);
    } else {
      // Show full credits immediately (common not yet subtracted — updated below)
      const htmlFull = await renderTrackFullCredits(rec, work);
      setAllRecCellsHtml(view, recId, htmlFull);

      // Collect all credit rows for this track (excluding work titles)
      const rows = await collectAllCreditRows(rec, work);
      allCreditRowsByRec.set(recId, rows);
      allRoleMaps.push(itemsToRoleMap(rows));
    }

    loaded++;
    if (commonProgEl) commonProgEl.textContent = `(${loaded}/${total})`;

    if (k < albumRecIds.length - 1) await sleep(REQUEST_GAP_MS);
  }

  // Compute common across ALL credit types (creators + performers + tech)
  const commonMap = intersectRoleMaps(allRoleMaps);
  const commonItems = Array.from(commonMap.entries())
    .map(([role, set]) => ({
      role,
      values: Array.from(set).sort((a, b) => String(a).localeCompare(String(b))),
    }))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  // Show common section
  stopCommonSpin();
  setCommonCellHtml(
    view,
    commonItems.length
      ? `<div class="fc-track-credits">${renderFullCreditsSection(commonItems)}</div>`
      : `<div class="fc-empty muted">—</div>`
  );

  // Re-render every track with common credits subtracted
  for (const recId of albumRecIds) {
    const { rec, work } = recData.get(recId) || {};
    if (!rec) continue;
    const htmlDiff = await renderTrackFullCredits(rec, work, commonMap);
    setAllRecCellsHtml(view, recId, htmlDiff);
  }
}