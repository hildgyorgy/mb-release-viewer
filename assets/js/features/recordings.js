import { STATE } from "../core/state.js";
import { escHtml, relDateLabel, uniq, mediumLabel } from "../core/util.js";
import { mbArtistLink, mbPlaceLink, mbRecordingLink } from "../core/mbLinks.js";
import { loadRecording } from "../services/api.js";

// ============================================================
// Recordings view (technical / organisational credits)
// Ported from legacy app.js (v0.9.6), adapted to modular code.
// ============================================================

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

  const rows = items.map((it) => {
    const role = escHtml(it.role);
    const isNotes = String(it.role || "").toLowerCase() === "notes";

    const value = isNotes
      ? `<span class="muted">${it.values.map((v) => escHtml(String(v))).join("<br>")}</span>`
 //   : it.values.join("<br>");
      : it.values.map(v => `<span class="rec-person">${v}</span>`).join("");

    return `
      <div class="rec-row">
        <div class="rec-role muted">${role}</div>
        <div class="rec-value">${value}</div>
      </div>
    `;
  }).join("");

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

// ------------------------------------------------------------
// Public builder (entry point)
// ------------------------------------------------------------

export async function buildRecordingsView() {
  const view = document.querySelector('section.view[data-view="recordings"]');
  if (!view) return;

  view.innerHTML = `<div class="muted">Loading…</div>`;

  const media = Array.isArray(STATE.views.recordingsMedia) ? STATE.views.recordingsMedia : [];
  const mediaCount = media.length;

  // 1) Load all unique recordings once (album-scope cache)
  const albumRecIds = collectAlbumRecordingIds(media);

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

  // 2) Common credits/notes (intersection across recordings)
  const commonMap = intersectRoleMaps(roleMaps);
  const commonItems = Array.from(commonMap.entries())
    .map(([role, set]) => ({
      role,
      values: Array.from(set).sort((a, b) => String(a).localeCompare(String(b))),
    }))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)));

  const commonNotes = getCommonNotesFromItemsList(itemsListForCommon);
  if (commonNotes) commonItems.push({ role: "notes", values: [commonNotes] });

  // 3) Render
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

    const orderedRecIds = collectMediumRecordingIds(m);

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
  : `<div class="rec-empty muted">--</div>`;

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
