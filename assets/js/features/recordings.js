// ============================================================
// Recordings view (technical / organisational credits)
// Incremental fill (1 req / ~1s), common credits computed at end
// ============================================================

import { STATE } from "../core/state.js";
import { escHtml, relDateLabel, uniq, mediumLabel } from "../core/util.js";
import { mbArtistLink, mbPlaceLink, mbRecordingLink } from "../core/mbLinks.js";
import { loadRecording } from "../services/api.js";

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

function parseRecordingTechCredits(recording) {
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

function renderRecordingTechGrid(items) {
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
  // update every occurrence (same recording reused on a medium)
  const nodes = view.querySelectorAll(`[data-rec-id="${recId}"]`);
  nodes.forEach((el) => {
    el.innerHTML = html;
  });
}

function setCommonCellHtml(view, html) {
  const el = view.querySelector("#recCommonCell");
  if (el) el.innerHTML = html;
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