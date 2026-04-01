// features/artistPanel.js
// Inline artist panel — opens between track row and credits when an artist name is clicked.

import { loadArtist, loadArtistReleaseGroups, fetchWikipediaSummary } from "../services/api.js";
import { escHtml } from "../core/util.js";

// The panel is always inserted into a specific anchor element inside the track detail.
// Only one panel exists at a time across the whole page.

let currentArtistId = null;
let currentAnchorEl = null;
let outsideClickHandler = null;

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Open (or replace) the artist panel for a given artist.
 *
 * @param {string} artistId  - MusicBrainz artist MBID
 * @param {HTMLElement} anchorEl - the .details-inner element to inject into
 * @param {(mbid: string) => void} onLoadRelease - callback when user picks a release
 */
export async function openArtistPanel(artistId, anchorEl, onLoadRelease) {
  if (!artistId || !anchorEl) return;

  // Same artist already showing — do nothing
  if (currentArtistId === artistId && currentAnchorEl === anchorEl) return;

  // Clean up any existing panel
  closeArtistPanel();

  currentArtistId = artistId;
  currentAnchorEl = anchorEl;

  // Insert loading state immediately
  const panel = createPanelShell();
  anchorEl.insertBefore(panel, anchorEl.firstChild);

  // Bind close on click outside (deferred so this click doesn't immediately close)
  setTimeout(() => bindOutsideClick(panel), 0);

  // Load data
  try {
    const [artist, releaseGroups] = await Promise.all([
      loadArtist(artistId),
      loadArtistReleaseGroups(artistId),
    ]);

    // Wikipedia requires artist url-rels to find wikidata link
    const wikidataUrl = findWikidataUrl(artist);
    const wiki = wikidataUrl
      ? await fetchWikipediaSummary(wikidataUrl).catch(() => null)
      : null;

    // Re-check panel is still current (user may have closed it while loading)
    if (currentArtistId !== artistId) return;

    renderPanelContent(panel, artist, wiki, releaseGroups, onLoadRelease);

  } catch (err) {
    if (currentArtistId !== artistId) return;
    panel.querySelector(".ap-body").innerHTML =
      `<div class="muted">Could not load artist details.</div>`;
  }
}

export function closeArtistPanel() {
  if (outsideClickHandler) {
    document.removeEventListener("pointerdown", outsideClickHandler);
    outsideClickHandler = null;
  }

  if (currentAnchorEl) {
    const existing = currentAnchorEl.querySelector(".artist-panel");
    existing?.remove();
  }

  currentArtistId = null;
  currentAnchorEl = null;
}

// ------------------------------------------------------------
// Panel shell (loading state)
// ------------------------------------------------------------

function createPanelShell() {
  const panel = document.createElement("div");
  panel.className = "artist-panel";
  panel.innerHTML = `
    <div class="ap-header">
      <span class="ap-name muted">Loading…</span>
      <button class="ap-close" type="button" aria-label="Close artist panel">✕</button>
    </div>
    <div class="ap-body">
      <div class="muted ap-loading">Loading artist data…</div>
    </div>
  `;

  panel.querySelector(".ap-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeArtistPanel();
  });

  return panel;
}

// ------------------------------------------------------------
// Render full panel content
// ------------------------------------------------------------

function renderPanelContent(panel, artist, wiki, releaseGroups, onLoadRelease) {
  const name = escHtml(artist?.name || "(unknown)");
  const mbUrl = `https://musicbrainz.org/artist/${artist.id}`;
  const meta = buildMetaLine(artist);
  const wikiHtml = buildWikiHtml(wiki);
  const discoHtml = buildDiscographyHtml(releaseGroups, onLoadRelease);

  // Update header name
  panel.querySelector(".ap-name").innerHTML =
    `<span class="ap-name-text">${name}</span>`;

  // Build body
  panel.querySelector(".ap-body").innerHTML = `
    <div class="ap-mb-link">
      <a href="${mbUrl}" target="_blank" rel="noreferrer noopener" class="ap-mb-btn">
        <svg class="ap-mb-icon" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5"
             stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        Edit on MusicBrainz
      </a>
    </div>
    ${meta ? `<div class="ap-meta muted">${meta}</div>` : ""}
    ${wikiHtml}
    ${discoHtml}
  `;
}

// ------------------------------------------------------------
// Meta line: "Person · HU · 1935–2002"
// ------------------------------------------------------------

function buildMetaLine(artist) {
  const parts = [];

  if (artist?.type) parts.push(escHtml(artist.type));
  if (artist?.country) parts.push(escHtml(artist.country));

  const begin = artist?.["life-span"]?.begin || "";
  const end = artist?.["life-span"]?.end || "";
  const ended = artist?.["life-span"]?.ended;

  if (begin || end) {
    const b = begin ? begin.slice(0, 4) : "";
    const e = end ? end.slice(0, 4) : (ended ? "" : "");
    if (b && e) parts.push(`${b}–${e}`);
    else if (b) parts.push(b);
  }

  return parts.join(" · ");
}

// ------------------------------------------------------------
// Wikipedia block
// ------------------------------------------------------------

function buildWikiHtml(wiki) {
  if (!wiki?.extract) return "";

  const MAX = 200;
  const text = wiki.extract.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
  const shortened = text.length > MAX
    ? text.slice(0, MAX).trim() + "…"
    : text;

  const wikiUrl = wiki.url || `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.title || "")}`;

  return `
    <div class="ap-section">
      <div class="ap-section-label">WIKIPEDIA</div>
      <div class="ap-wiki-text">
        ${escHtml(shortened)}
        <a href="${wikiUrl}" target="_blank" rel="noreferrer noopener"
           class="ap-wiki-link"> Continue reading</a>
      </div>
    </div>
  `;
}

// ------------------------------------------------------------
// Discography block
// ------------------------------------------------------------

function buildDiscographyHtml(releaseGroups, onLoadRelease) {
  if (!releaseGroups?.length) return "";

  // Show only Albums and EPs, sorted by date, max 10
  const filtered = releaseGroups
    .filter((rg) => {
      const t = (rg["primary-type"] || "").toLowerCase();
      return t === "album" || t === "ep";
    })
    .sort((a, b) => {
      const da = a["first-release-date"] || "9999";
      const db = b["first-release-date"] || "9999";
      return da.localeCompare(db);
    })
    .slice(0, 10);

  if (!filtered.length) return "";

  const rows = filtered.map((rg) => {
    const year = (rg["first-release-date"] || "").slice(0, 4);
    const title = escHtml(rg.title || "(untitled)");
    const type = rg["primary-type"] || "";

    return `
      <div class="ap-disco-row" data-rg-id="${escHtml(rg.id)}">
        <span class="ap-disco-year muted">${year}</span>
        <span class="ap-disco-title">${title}</span>
        ${type === "EP" ? `<span class="ap-disco-type muted">EP</span>` : ""}
      </div>
    `;
  }).join("");

  // Bind clicks after HTML is injected via event delegation on the section
  // We use a data attribute and handle in the returned HTML's container
  const sectionId = `ap-disco-${Date.now()}`;

  // We need to bind after insertion — use a microtask
  setTimeout(() => {
    const section = document.getElementById(sectionId);
    if (!section || typeof onLoadRelease !== "function") return;

    section.addEventListener("click", async (e) => {
      const row = e.target.closest(".ap-disco-row");
      if (!row) return;
      const rgId = row.dataset.rgId;
      if (!rgId) return;

      // Load the first release of this release group
      await onLoadRelease(rgId);
    });
  }, 0);

  return `
    <div class="ap-section" id="${sectionId}">
      <div class="ap-section-label">DISCOGRAPHY</div>
      ${rows}
    </div>
  `;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function findWikidataUrl(artist) {
  const rels = Array.isArray(artist?.relations) ? artist.relations : [];
  return rels.find((r) => r.type === "wikidata")?.url?.resource || null;
}

function bindOutsideClick(panel) {
  outsideClickHandler = (e) => {
    if (!panel.contains(e.target)) {
      closeArtistPanel();
    }
  };
  document.addEventListener("pointerdown", outsideClickHandler);
}