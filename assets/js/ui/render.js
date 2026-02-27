import { escHtml, artistCreditToText, fmtMs, mediumLabel } from "../core/util.js";
import { ICON_SPOTIFY, ICON_APPLE_MUSIC } from "./icons.js";

export function renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes, streaming }) {
  return `
    <div class="row header-row">
      <div class="cover">
        <div class="cover-box">
          ${cover ? `<img id="coverImg" src="${cover}" alt="Cover">` : ""}
        </div>
      </div>

      <div class="main header-main">
        <h1>${escHtml(title)}</h1>

        <div class="artist">
          ${artist ? escHtml(artist) : "<span class='muted'>(n/a)</span>"}
        </div>

                ${(() => {
          const sp = streaming?.spotifyUrl || "";
          const am = streaming?.appleMusicUrl || "";
          if (!sp && !am) return "";
          return `
            <div class="streaming">
              ${sp ? `<a class="stream-btn" href="${sp}" target="_blank" rel="noreferrer noopener" aria-label="Spotify">${ICON_SPOTIFY}</a>` : ""}
              ${am ? `<a class="stream-btn" href="${am}" target="_blank" rel="noreferrer noopener" aria-label="Apple Music">${ICON_APPLE_MUSIC}</a>` : ""}
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
    </div>

    <div class="header-nav">
      <div class="cover-nav-row">
        <div class="tabs cover-tabs" id="tabs">
          <button class="tab is-active" data-view="tracks">Tracklist</button>
          <button class="tab" data-view="recordings">Recordings</button>
          <a class="tab mb-link" href="${mbLink}" target="_blank" rel="noreferrer">MusicBrainz</a>
        </div>

        <button class="theme-fab" id="themeToggle" type="button"></button>
      </div>
    </div>
  `;
}

export function renderTracksView(mediaWithTracks, annotation) {
  const mediaCount = mediaWithTracks.length;

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
				      ${escHtml(mediumLabel(m, mediaCount))}
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

      ${annotation ? `<div class="annotation"><div class="body">${escHtml(annotation)}</div></div>` : ""}
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