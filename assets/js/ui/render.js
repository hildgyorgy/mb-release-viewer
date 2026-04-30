import { escHtml, artistCreditToText, fmtMs, mediumLabel } from "../core/util.js";
import { ICON_SPOTIFY, ICON_APPLE_MUSIC, ICON_TIDAL, ICON_QOBUZ } from "./icons.js";
import { buildTrackRows } from "../core/classicalTitle.js";

export function renderHeader({
  title,
  cover,
  mbLink,
  artist,
  date,
  country,
  label,
  catno,
  barcode,
  releaseNotes,
  streaming,
}) {
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
          if (!sp && !am && !td && !qb) return "";
          return `
            <div class="streaming">
              ${sp ? `<a class="stream-btn" href="${sp}" target="_blank" rel="noreferrer noopener" aria-label="Spotify">${ICON_SPOTIFY}</a>` : ""}
              ${am ? `<a class="stream-btn" href="${am}" target="_blank" rel="noreferrer noopener" aria-label="Apple Music">${ICON_APPLE_MUSIC}</a>` : ""}
              ${td ? `<a class="stream-btn" href="${td}" target="_blank" rel="noreferrer noopener" aria-label="Tidal">${ICON_TIDAL}</a>` : ""}
              ${qb ? `<a class="stream-btn" href="${qb}" target="_blank" rel="noreferrer noopener" aria-label="Qobuz">${ICON_QOBUZ}</a>` : ""}
            </div>
          `;
        })()}

        <div class="meta">
          <div><span class="meta-k">Date:</span> ${date ? escHtml(date) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Country:</span> ${country ? escHtml(country) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Label:</span> ${label ? escHtml(label) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Cat. no.:</span> ${catno ? escHtml(catno) : "<span class='muted'>(n/a)</span>"}</div>
          <div><span class="meta-k">Barcode:</span> ${barcode ? escHtml(barcode) : "<span class='muted'>(n/a)</span>"}</div>
          ${releaseNotes ? `<div><span class="meta-k">Notes:</span> <span class="muted">${escHtml(releaseNotes)}</span></div>` : ""}
        </div>
      </div>

      <div class="header-tabs tabs" id="tabs">
        <button class="tab is-active" data-view="tracks">Tracklist</button>
        <button class="tab" data-view="versions">Versions</button>
        <a class="tab mb-link" href="${mbLink}" target="_blank" rel="noreferrer">MusicBrainz</a>
      </div>
    </section>
  `;
}

export function renderTracksView(mediaWithTracks, annotation) {
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
      ${annotation ? `<div class="annotation"><div class="body">${escHtml(annotation)}</div></div>` : ""}
    </section>
  `;
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

export function renderRecordingsViewShell() {
  return `
    <section class="view" data-view="recordings" hidden>
      <div class="muted">Loading…</div>
    </section>
  `;
}