import { escHtml, stripParentPrefix } from "../core/util.js";
import { loadWork } from "../services/api.js";
import { mbArtistLink, artistPanelLink, artistCreditToLinks, mbWorkUrl } from "../core/mbLinks.js";

/* ============================================================
   Track details (Performers / Creators / Work hierarchy)
   ============================================================ */

const EXTRA_PERFORMER_REL_TYPES = new Set([
  "conductor",
  "orchestra",
  "ensemble",
  "choir",
  "chorus",
  "concertmaster",
  "leader",
  "soloist",
  "performing orchestra",
]);

function parsePerformersFromRecording(recording) {
  const rels = recording?.relations || [];
  const perf = rels.filter((r) => (r.target_type ?? r["target-type"]) === "artist");
  const byRole = new Map();

  for (const r of perf) {
    const artist = r.artist || r.target || null;
    if (!artist?.id) continue;

    const attrs = Array.isArray(r.attributes) ? r.attributes : [];
    const baseType = r.type || "";

    const typeLc = String(baseType || "").toLowerCase();

    const isInstrument = typeLc === "instrument";
    const isVocal =
      typeLc === "vocal" ||
      attrs.some((a) => {
        const al = String(a).toLowerCase();
        return [
          "vocals",
          "spoken vocals",
          "narrator",
          "soprano",
          "mezzo-soprano",
          "alto",
          "tenor",
          "baritone",
          "bass",
        ].includes(al);
      });

    const isExtra = EXTRA_PERFORMER_REL_TYPES.has(typeLc);

    if (!isInstrument && !isVocal && !isExtra) continue;

    // role label
    let role = "";
    if (isInstrument || isVocal) {
      role = attrs.length ? attrs.join(", ") : isVocal ? "vocals" : "instrument";
    } else {
      // conductor / orchestra / choir / soloist / etc.
      role = baseType || "performer";
      // ha vannak attribútumok, őszintén kiírjuk zárójelben (nem “hekkeljük”)
      if (attrs.length) role += ` (${attrs.join(", ")})`;
    }

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
            <div class="artists">${it.artists.map(a => `<div class="artist-line">${artistPanelLink(a)}</div>`).join("")}</div>
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

// Ezt kívülről is használod (track-toggle során)
export function getPrimaryWorkIdFromRecording(recording) {
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

export async function renderTrackDetails(recording, work) {
  const left = renderPerformers(recording);
  const mid = renderCreators(work);
  const right = await renderWorkHierarchyBlock(work);

  return `
  <div class="detail-cols">
    <div class="detail-col detail-col--perf">${left}</div>

    <div class="detail-col detail-col--meta">
      <div class="detail-col detail-col--creators">${mid}</div>
      <div class="detail-col detail-col--work">${right}</div>
    </div>
  </div>
`;
}