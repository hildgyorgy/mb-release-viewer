import { escHtml, escAttr, artistCreditToText, fmtMs, mediumLabel } from "../core/util.js";
import { ICON_SPOTIFY, ICON_APPLE_MUSIC, ICON_TIDAL, ICON_QOBUZ, ICON_DISCOGS } from "./icons.js";
import { buildTrackRows } from "../core/classicalTitle.js";

export function renderHeader({
  title,
  cover,
  mbLink,
  artist,
  date,
  country,
  label,
  labelId,
  catno,
  barcode,
  releaseNotes,
  streaming,
}) {
    const labelHtml = label
    ? labelId
      ? `<a href="https://musicbrainz.org/label/${escAttr(labelId)}" target="_blank" rel="noreferrer noopener">${escHtml(label)}</a>`
      : escHtml(label)
    : "<span class='muted'>(n/a)</span>";
  return `
    <section class="header-hero">
      <div class="header-cover">
        <div class="cover-box">
          ${cover ? `<img id="coverImg" src="${cover}" alt="Cover">` : ""}
        </div>
      </div>

      <div class="header-main">
        <h1>${escHtml(title)}</h1>

        <div class="artist">
          ${artist ? escHtml(artist) : "<span class='muted'>(n/a)</span>"}
        </div>

        ${(() => {
          const sp = streaming?.spotifyUrl || "";
          const am = streaming?.appleMusicUrl || "";
          const td = streaming?.tidalUrl || "";
          const qb = streaming?.qobuzUrl || "";
          const dg = streaming?.discogsUrl || "";

          if (!sp && !am && !td && !qb && !dg) return "";
          return `
            <div class="streaming">
              ${sp ? `<a class="stream-btn pill" href="${sp}" target="_blank" rel="noreferrer noopener" aria-label="Spotify">${ICON_SPOTIFY}</a>` : ""}
              ${am ? `<a class="stream-btn pill" href="${am}" target="_blank" rel="noreferrer noopener" aria-label="Apple Music">${ICON_APPLE_MUSIC}</a>` : ""}
              ${td ? `<a class="stream-btn pill" href="${td}" target="_blank" rel="noreferrer noopener" aria-label="Tidal">${ICON_TIDAL}</a>` : ""}
              ${qb ? `<a class="stream-btn pill" href="${qb}" target="_blank" rel="noreferrer noopener" aria-label="Qobuz">${ICON_QOBUZ}</a>` : ""}
              ${dg ? `<a class="stream-btn pill" href="${dg}" target="_blank" rel="noreferrer noopener" aria-label="Discogs">${ICON_DISCOGS}</a>` : ""}
            </div>
          `;
        })()}

        <div class="meta">
          <div><span class="meta-k">Date:</span> ${date ? escHtml(date) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Country:</span> ${country ? escHtml(country) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Label:</span> ${labelHtml}</div>
          <div><span class="meta-k">Cat. no.:</span> ${catno ? escHtml(catno) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Barcode:</span> ${barcode ? escHtml(barcode) : "<span class='muted'>(n/a)</span>"}</div>
          ${releaseNotes ? `<div><span class="meta-k">Notes:</span> <span class="muted">${escHtml(releaseNotes)}</span></div>` : ""}
        </div>
      </div>

      <div class="header-tabs tabs" id="tabs">
        <button class="tab pill is-active" data-view="tracks">Tracklist</button>
        <button class="tab pill" data-view="versions">Versions</button>
        <a class="tab pill mb-link" href="${mbLink}" target="_blank" rel="noreferrer">MusicBrainz</a>
      </div>
    </section>
  `;
}

export function renderTracksView(mediaWithTracks, releaseLevelCreditsHtml = "", annotationHtml = "") {
  const mediaCount = mediaWithTracks.length;

  return `
    <section class="view" data-view="tracks">
      <div class="tracks">
        <table>
          <tbody>
            ${mediaWithTracks.map((m) => renderMedium(m, mediaCount)).join("")}
          </tbody>
        </table>
      </div>
      ${releaseLevelCreditsHtml}
      ${annotationHtml}
    </section>
  `;
}

export function renderAnnotation(annotation) {
  const text = String(annotation || "").trim();
  if (!text) return "";

  return `
    <div class="annotation">
    <div class="section-label">ANNOTATION</div>
      <div class="body">${escHtml(text)}</div>
    </div>
  `;
}

export function renderReleaseLevelCredits(rel) {
  const relations = Array.isArray(rel?.relations) ? rel.relations : [];
  const grouped = groupReleaseRelations(relations);

  if (!grouped.length) return "";

  return `
    <section class="release-level-credits">
      <div class="section-label">RELEASE-LEVEL CREDITS</div>
      <div class="rlc-grid">
        ${grouped.map(renderReleaseRelationGroup).join("")}
      </div>
    </section>
  `;
}

function groupReleaseRelations(relations) {
  const map = new Map();

  relations.forEach((rel) => {
  const type = String(rel.type || "").trim();
  if (!type) return;

  const targetType = rel.target_type ?? rel["target-type"] ?? "";

  // Skip release external links from the regular Edit release page.
  // We only want real release-level relationships from the Edit relationships page.
  if (targetType === "url") return;

  const target = getReleaseRelationTarget(rel);
  if (!target.label) return;

  if (!map.has(type)) map.set(type, []);
  map.get(type).push(target);
});

  return Array.from(map.entries())
    .map(([type, targets]) => ({
      type,
      targets: dedupeTargets(targets),
    }))
    .filter((group) => group.targets.length)
    .sort((a, b) => a.type.localeCompare(b.type));
}

function getReleaseRelationTarget(rel) {
  const targetType = rel.target_type ?? rel["target-type"] ?? "";

  const target =
    rel.artist ||
    rel.label ||
    rel.place ||
    rel.area ||
    rel.work ||
    rel.recording ||
    rel.release ||
    rel["release-group"] ||
    rel.target ||
    null;

  const label = target?.name || target?.title || target?.id || "";
  const mbid = target?.id || "";
  const url = mbid && targetType
    ? `https://musicbrainz.org/${targetType}/${mbid}`
    : "";

  return { label, url };
}

function dedupeTargets(targets) {
  const seen = new Set();

  return targets.filter((target) => {
    const key = `${target.label}|||${target.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderReleaseRelationGroup(group) {
  return `
    <div class="rlc-role">${escHtml(formatRelationType(group.type))}</div>
    <div class="rlc-values">
      ${group.targets.map(renderReleaseRelationTarget).join("")}
    </div>
  `;
}

function renderReleaseRelationTarget(target) {
  const label = escHtml(target.label);
  const url = String(target.url || "").trim();

  if (!url) {
    return `<span class="rlc-value">${label}</span>`;
  }

  return `
    <a class="rlc-value" href="${escAttr(url)}" target="_blank" rel="noreferrer noopener">
      ${label}
    </a>
  `;
}

function formatRelationType(type) {
  return String(type || "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderMedium(m, mediaCount) {
  const header = `
    <tr class="medium-row">
      <td colspan="3" class="medium-cell">${escHtml(mediumLabel(m, mediaCount))}</td>
    </tr>
  `;

  const rows = buildTrackRows(m.tracks).map((row) => renderRow(row)).join("");

  return header + rows;
}

function renderRow(row) {
  if (row.type === "work") {
    return `
      <tr class="work-row" data-rec="">
        <td colspan="3" class="work-cell">${escHtml(row.work)}</td>
      </tr>
    `;
  }

  // track row
  const titleHtml = row.isMovement
    ? `<div class="trk-mov">${escHtml(row.title)}</div>`
    : `<div class="trk-title">${escHtml(row.title)}</div>`;

  return `
    <tr class="track" data-i="${row.recId}" data-rec="${row.recId}">
      <td class="num">${row.pos ?? ""}</td>
      <td class="title">${titleHtml}</td>
      <td class="len">${escHtml(row.len)}</td>
    </tr>
    <tr class="details" data-i="${row.recId}">
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
}

export function renderVersionsViewShell() {
  return `
    <section class="view" data-view="versions" hidden>
      <div class="muted">Loading…</div>
    </section>
  `;
}