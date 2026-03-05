import { escHtml, artistCreditToText, fmtMs, mediumLabel } from "../core/util.js";
import { ICON_SPOTIFY, ICON_APPLE_MUSIC, ICON_TIDAL, ICON_QOBUZ } from "./icons.js";
import { splitClassicalTitle } from "../core/classicalTitle.js";

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
              ${sp
          ? `<a class="stream-btn" href="${sp}" target="_blank" rel="noreferrer noopener" aria-label="Spotify">${ICON_SPOTIFY}</a>`
          : ""
        }
              ${am
          ? `<a class="stream-btn" href="${am}" target="_blank" rel="noreferrer noopener" aria-label="Apple Music">${ICON_APPLE_MUSIC}</a>`
          : ""
        }
              ${td
          ? `<a class="stream-btn" href="${td}" target="_blank" rel="noreferrer noopener" aria-label="Tidal">${ICON_TIDAL}</a>`
          : ""
        }
              ${qb
          ? `<a class="stream-btn" href="${qb}" target="_blank" rel="noreferrer noopener" aria-label="Qobuz">${ICON_QOBUZ}</a>`
          : ""
        }
            </div>
          `;
    })()}

        <div class="meta">
          <div><span class="meta-k">Date:</span> ${date ? escHtml(date) : "<span class='muted'>(n/a)</span>"
    }</div>
          <div><span class="meta-k">Country:</span> ${country ? escHtml(country) : "<span class='muted'>(n/a)</span>"
    }</div>
          <div><span class="meta-k">Label:</span> ${label ? escHtml(label) : "<span class='muted'>(n/a)</span>"
    }</div>
          <div><span class="meta-k">Cat. no.:</span> ${catno ? escHtml(catno) : "<span class='muted'>(n/a)</span>"
    }</div>
          <div><span class="meta-k">Barcode:</span> ${barcode ? escHtml(barcode) : "<span class='muted'>(n/a)</span>"
    }</div>
          ${releaseNotes
      ? `<div><span class="meta-k">Notes:</span> <span class="muted">${escHtml(
        releaseNotes
      )}</span></div>`
      : ""
    }
        </div>
      </div>

      <div class="header-tabs tabs" id="tabs">
        <button class="tab is-active" data-view="tracks">Tracklist</button>
        <button class="tab" data-view="recordings">Recordings</button>
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
            ${mediaWithTracks
      .map((m) => {
        const head = `
				  <tr class="medium-row">
				    <td colspan="3" class="medium-cell">
				      ${escHtml(mediumLabel(m, mediaCount))}
				    </td>
				  </tr>
				`;

        const rows = (() => {
          let lastWork = ""; // mediumon belül

          // --- helper: split az ELSŐ ":"-nál ---
          const splitFirstColon = (str) => {
            const s = String(str || "");
            const i = s.indexOf(":");
            if (i === -1) return null;
            return {
              left: s.slice(0, i).trim(),
              right: s.slice(i + 1).trim(), // további ":" maradnak
            };
          };

          // 1) előszámítás (base split + colon split)
          const prepared = m.tracks.map((t, idx) => {
            const rawTitle = String(t.title || "").trim();

            // A) base: (:) + római, vagy ". I." stb. (splitClassicalTitle intézi)
            const base = splitClassicalTitle(rawTitle);
            const baseWork = String(base.workLine || "").trim();
            const baseMov = String(base.movLine || "").trim();

            // B) colon: csak az első ":" mentén
            const colon = splitFirstColon(rawTitle);
            const colonWork = String(colon?.left || "").trim();
            const colonMov = String(colon?.right || "").trim();

            return {
              _idx: idx, // fontos a runLenByIndex-hez
              t,
              rawTitle,
              baseWork,
              baseMov,
              hasColon: !!colon,
              colonWork,
              colonMov,
            };
          });

          // 2) egymást követő azonos colonWork futamok hossza (mediumon belül)
          const runLenByIndex = new Array(prepared.length).fill(0);

          let i = 0;
          while (i < prepared.length) {
            const cur = prepared[i];

            if (!cur.hasColon || !cur.colonWork) {
              runLenByIndex[i] = 0;
              i += 1;
              continue;
            }

            const w = cur.colonWork;
            let j = i + 1;

            while (
              j < prepared.length &&
              prepared[j].hasColon &&
              prepared[j].colonWork &&
              prepared[j].colonWork === w
            ) {
              j += 1;
            }

            const runLen = j - i;
            for (let k = i; k < j; k++) runLenByIndex[k] = runLen;

            i = j;
          }

          // 3) render
          return prepared
            .map((p) => {
              const t = p.t;
              const idx = t._i;
              const recId = t.rec?.id || "";

              // --- Döntés trackenként ---
              let workLine = p.baseWork;
              let movLine = p.baseMov;

              // jelző: használtuk-e a colon+repeat(2) kaput?
              let usedColonGate = false;

              // base split csak akkor "igazi", ha VAN work + mov
              // (ez pont megfelel annak, hogy "van : és utána római" vagy ". I." stb.)
              const hasBaseSplit = !!(p.baseMov && p.baseWork);

              // colon+repeat(2, consecutive) gate:
              // - nincs base split
              // - van ":" (colonWork)
              // - a colonWork ugyanazon mediumon belül egymást követően >=2× ismétlődik
              const runLen = runLenByIndex[p._idx] || 0;

              if (!hasBaseSplit && p.hasColon && p.colonWork && p.colonMov && runLen >= 2) {
                usedColonGate = true;
                workLine = p.colonWork;
                movLine = p.colonMov;
              }

              const work = String(workLine || "").trim();
              const mov = String(movLine || "").trim();

              // Klasszikus-csoport csak akkor, ha tényleges split történt:
              // - base split (work+mov)
              // - vagy colonGate (repeat futam)
              const isClassicalGroup = hasBaseSplit || usedColonGate;

              // work-header csak klasszikus-csoportban, és csak ha változott
              const showWorkHeader = isClassicalGroup && !!work && work !== lastWork;
              if (showWorkHeader) lastWork = work;

              // Track sor tartalma:
              // - klasszikus-csoport + movLine: csak a "tétel" (mov)
              // - különben: eredeti track cím (jazz/pop ne essen szét)
              const trackTitleHtml =
                isClassicalGroup && mov
                  ? `<div class="trk-mov">${escHtml(mov)}</div>`
                  : `<div class="trk-title">${escHtml(t.title || "")}</div>`;

              return `
        ${showWorkHeader
                  ? `
            <tr class="work-row" data-rec="${recId}">
  <td colspan="3" class="work-cell">${escHtml(work)}</td>
</tr>
          `
                  : ""
                }

        <tr class="track" data-i="${idx}" data-rec="${recId}">
          <td class="num">${t.pos ?? ""}</td>
          <td class="title">${trackTitleHtml}</td>
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
        })();

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