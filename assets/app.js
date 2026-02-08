/* MB Release Viewer – Tracklist + Recordings
   - Track details: 3 columns (Performers | Creators | Work hierarchy)
   - Recordings tab: per-recording "technical / organizational" credits (2-col, tracklist-like)
*/

// ------------------------------------------------------------
// 0) Tiny DOM helpers
// ------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ------------------------------------------------------------
// 1) Small formatting helpers
// ------------------------------------------------------------
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

// MB recording relationships often come like:
// type="recording" + attributes=["engineer"] => should display "recording engineer"
function formatRecordingRole(r) {
  const type = String(r?.type || "").trim().toLowerCase();
  const attrs = Array.isArray(r?.attributes) ? r.attributes : [];
  const cleanAttrs = attrs.map((a) => String(a || "").trim()).filter(Boolean);

  if (type === "recording" && cleanAttrs.length) {
    return `recording ${cleanAttrs.join(", ")}`;
  }
  return type;
}

// ------------------------------------------------------------
// 2) Tabs (Tracklist / Recordings)
// ------------------------------------------------------------
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
    // the MB link also has .tab class but no data-view → ignore it
    if (!view) return;

    setActiveView(view);

    if (view === "recordings" && !recordingsBuilt) {
      recordingsBuilt = true;
      await buildRecordingsView();
    }
  });
}

// ------------------------------------------------------------
// 2.5) Cover sizing lock (prevents "image-load jump")
// ------------------------------------------------------------
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

function bindCoverSizerOnce() {
  if (coverSizerBound) return;
  coverSizerBound = true;

  window.addEventListener("resize", () => {
    const out = $("#out");
    if (!out) return;
    lockCoverSquareToTabs(out);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const out = $("#out");
      if (!out) return;
      lockCoverSquareToTabs(out);
    });
  }
}

// ------------------------------------------------------------
// 3) Credits parsing (performers + creators) + Work hierarchy
// ------------------------------------------------------------
function mbArtistLink(artist) {
  if (!artist?.id) return "";
  const name = artist.name || artist["name"] || "(unknown)";
  return `<a href="https://musicbrainz.org/artist/${artist.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
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

/**
 * Performers from recording relations:
 * - instrument
 * - vocal (+ vocal-ish attributes)
 */
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

  if (!items.length) {
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

  return renderRoleList(items);
}

/**
 * Recording -> (primary) Work (first work relation)
 */
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
    return i === -1 ? 999 : i; // ismeretlen role-ok menjenek a végére
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
      // ha mindkettő "ismeretlen", maradjon stabil és értelmes: abc a role szerint
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

/**
 * Work hierarchy ("part of") — no track-title parsing.
 */
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
    if (i === 0) {
      display.push(full[i].title);
    } else {
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

// ------------------------------------------------------------
// 4.5) Recordings tab (technical / organizational credits)
// ------------------------------------------------------------

/**
 * We exclude "performer" + "creator" + "work-ish" from the Recordings list:
 * - instrument / vocal
 * - composer / lyricist / librettist
 * - work relations (target_type = work) are ignored entirely here
 */
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
  const aLc = a.map(x => x.toLowerCase());

  // engineer specializations
  if (typeLc === "engineer") {
    if (aLc.includes("recording")) {
      return { role: "recording engineer", rest: a.filter(x => x.toLowerCase() !== "recording") };
    }
    if (aLc.includes("mix")) {
      return { role: "mixing engineer", rest: a.filter(x => x.toLowerCase() !== "mix") };
    }
    if (aLc.includes("mastering")) {
      return { role: "mastering engineer", rest: a.filter(x => x.toLowerCase() !== "mastering") };
    }
  }

  // producer specializations
  if (typeLc === "producer") {
    if (aLc.includes("executive")) {
      return { role: "executive producer", rest: a.filter(x => x.toLowerCase() !== "executive") };
    }
    if (aLc.includes("co")) {
      return { role: "co-producer", rest: a.filter(x => x.toLowerCase() !== "co") };
    }
  }

  // fallback: if there is exactly one attribute, prepend it (nice for many 2-word roles)
  if (a.length === 1) {
    return { role: `${a[0]} ${type}`.trim(), rest: [] };
  }

  return { role: type, rest: a };
}

function parseRecordingTechCredits(recording) {
  const rels = Array.isArray(recording?.relations) ? recording.relations : [];
  const rows = [];

  // disambiguation ("recording comment" jelleg) – később notes-ként, legalul
  const dis = String(recording?.disambiguation || "").trim();

  for (const r of rels) {
    const tt = r.target_type ?? r["target-type"];
    const typeRaw = String(r.type || "").trim();
    if (!typeRaw) continue;

    // ignore work rels here
    if (tt === "work") continue;

    const typeLc = typeRaw.toLowerCase();
    if (tt === "artist" && EXCLUDE_ARTIST_REL_TYPES.has(typeLc)) continue;

const showDate = tt === "place";   // csak place relációknál
const date = showDate ? relDateLabel(r) : "";
const dateTxt = date ? ` <span class="muted">${escHtml(date)}</span>` : "";

    const attrs = Array.isArray(r.attributes) ? r.attributes : [];
    const pr = prettyRelRole(typeRaw, attrs);
    const roleLabel = pr.role; // <- EZ A LÉNYEG: ne a typeRaw menjen ki
    const attrsTxt = pr.rest.length ? ` (${pr.rest.map(escHtml).join(", ")})` : "";

    if (tt === "artist") {
      const artist = r.artist || r.target || null;
      if (!artist?.id) continue;

      rows.push({
        role: roleLabel,
        value: `${mbArtistLink(artist)}${attrsTxt}${dateTxt}`,
      });
      continue;
    }

    if (tt === "place") {
      const place = r.place || r.target || null;
      if (!place?.id) continue;

      rows.push({
        role: roleLabel,
        value: `${mbPlaceLink(place)}${attrsTxt}${dateTxt}`,
      });
      continue;
    }

    if (tt === "recording") {
      const rec = r.recording || r.target || null;
      if (!rec) continue;

      rows.push({
        role: roleLabel,
        value: `${mbRecordingLink(rec)}${attrsTxt}${dateTxt}`,
      });
      continue;
    }

    // url rels could exist, but you said links don't matter → skip quietly
  }

  // group by role
  const grouped = new Map();
  for (const row of rows) {
    const k = row.role;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k).push(row.value);
  }

  // notes: add AFTER grouping, so we can force it to the bottom
  if (dis) {
    grouped.set("notes", [dis]); // itt még PLAIN szöveg, rendernél escHtml-eljük
  }

  // roles sorted, but notes always last
  const roles = Array.from(grouped.keys()).sort((a, b) => {
    const al = String(a || "").toLowerCase();
    const bl = String(b || "").toLowerCase();
    if (al === "notes") return 1;
    if (bl === "notes") return -1;
    return al.localeCompare(bl);
  });

  return roles.map((role) => ({
    role,
    values: uniq(grouped.get(role)),
  }));
}
function renderRecordingTechGrid(items) {
  if (!items.length) return `<div class="muted">N/A</div>`;

  const rows = items
    .map((it) => {
      const role = escHtml(it.role);

      // notes érték: muted + escHtml, és ne fehér
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

async function buildRecordingsView() {
  const view = $(`section.view[data-view="recordings"]`);
  if (!view) return;

  const media = Array.isArray(__mediaForRecordings) ? __mediaForRecordings : [];

  let html = `
    <div class="tracks">
      <table>
        <tbody>
  `;

  for (const m of media) {
    // --- medium header row ---
html += `
  <tr class="medium-row">
    <td class="medium-cell" colspan="3">CD ${escHtml(m.index)}</td>
  </tr>
`;

    // unique recording IDs within this medium, keeping order
    const seen = new Set();
    const orderedRecIds = [];

    for (const t of (m.tracks || [])) {
      const id = t?.rec?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orderedRecIds.push(id);
    }

    // render each recording
    for (let idx = 0; idx < orderedRecIds.length; idx++) {
      const recId = orderedRecIds[idx];
      let rec = null;

      try {
        rec = await loadRecording(recId);
      } catch {
        rec = null;
      }

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

      const items = parseRecordingTechCredits(rec);
      const grid = renderRecordingTechGrid(items);

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

// ------------------------------------------------------------
// 5) MusicBrainz API + caches
// ------------------------------------------------------------
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.json();
}

const recordingCache = new Map();
async function loadRecording(recId) {
  if (!recId) return null;
  if (recordingCache.has(recId)) return recordingCache.get(recId);

  // IMPORTANT: we include more rels for the Recordings tab
  const rec = await fetchJSON(
    `https://musicbrainz.org/ws/2/recording/${recId}?fmt=json&inc=` +
      `artist-rels+work-rels+place-rels+recording-rels+url-rels`
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

// ------------------------------------------------------------
// 6) Rendering + UI binding
// ------------------------------------------------------------
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
            
            ${releaseNotes
    		  ? `<div><span class="meta-k">Notes:</span> <span class="muted">${escHtml(releaseNotes)}</span></div>`
    		  : ""
  			}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTracksView(mediaWithTracks, annotation) {
  const mediumLabel = (m) => {
    const fmt = String(m.format || "").toLowerCase();
    const base = fmt.includes("cd") ? "CD" : "Disc";
    let s = `${base} ${m.index}`;
    // optional but still minimal: show format/title if useful
    const extra = [];
    if (m.format && !fmt.includes("cd")) extra.push(m.format);
    if (m.title) extra.push(m.title);
    if (extra.length) s += ` · ${extra.map(escHtml).join(" · ")}`;
    return s;
  };

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
                      <span class="muted" style="font-size:12px; letter-spacing:0.08em;">${mediumLabel(m)}</span>
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

      ${
        annotation
          ? `
        <div class="annotation">
          <div class="body">${escHtml(annotation)}</div>
        </div>
      `
          : ""
      }
    </section>
  `;
}

function renderRecordingsViewShell() {
  // no heading (as requested)
  return `
    <section class="view" data-view="recordings" hidden>
      <div class="muted">Loading…</div>
    </section>
  `;
}

// ---- Track details open/close ----
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

      if (!hasWork || !hasArtist) {
        recording = await loadRecording(recId);
      }
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
    requestAnimationFrame(() => {
      wrap.style.maxHeight = wrap.scrollHeight + "px";
    });
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
      _i: flatTracks.length, // global index for toggles
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

// for recordings view (medium-aware)
__mediaForRecordings = mediaWithTracks; // <-- ez nálad már megvan a CD headeres tracklist miatt
recordingsBuilt = false;

  const out = $("#out");
  out.innerHTML = `
    ${renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes })}
    <div class="views">
      ${renderTracksView(mediaWithTracks, annotation)}
      ${renderRecordingsViewShell()}
    </div>
  `;

  // bind UI
  bindTabsOnce();
  setActiveView("tracks");
  bindTrackToggles(out, flatTracks);

  // cover sizing lock
  bindCoverSizerOnce();
  lockCoverSquareToTabs(out);

  // re-lock once the cover image finishes loading (prevents the "jump")
  const img = $("#coverImg", out);
  if (img) {
    const relock = () => lockCoverSquareToTabs(out);
    img.addEventListener("load", relock, { once: true });
    if (img.complete) relock();
  }
}

// ------------------------------------------------------------
// 7) App entry
// ------------------------------------------------------------
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
  } catch (e) {
    $("#out").innerHTML = `<div class="err">Hiba: ${escHtml(e.message)}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("#go")?.addEventListener("click", go);
  $("#mbid")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
});