/* ============================================================
   Versions view — all releases in the same release group
   sorted oldest → newest, current release highlighted
   ============================================================ */

import { STATE } from "../core/state.js";
import { escHtml } from "../core/util.js";
import { fetchJSON } from "../services/api.js";

// Format the medium list: "CD", "2× Vinyl", "CD + DVD" etc.
function formatMedia(media) {
  if (!media?.length) return "";

  // Count occurrences of each format
  const counts = new Map();
  for (const m of media) {
    const fmt = (m.format || "Unknown").trim();
    counts.set(fmt, (counts.get(fmt) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([fmt, n]) => (n > 1 ? `${n}× ${fmt}` : fmt))
    .join(" + ");
}

// Fetch all releases in a release group with media info
async function loadReleaseVersions(rgId) {
  const url =
    `https://musicbrainz.org/ws/2/release` +
    `?release-group=${rgId}&fmt=json&inc=labels+media&limit=100`;
  const data = await fetchJSON(url);
  return data?.releases || [];
}

// Fetch front cover thumb for one release (best effort)
async function fetchThumb(releaseId) {
  try {
    const ca = await fetchJSON(`https://coverartarchive.org/release/${releaseId}`);
    const front = ca?.images?.find((i) => i.front) || ca?.images?.[0];
    if (!front) return null;
    const thumb =
      front.thumbnails?.small ||
      front.thumbnails?.[120] ||
      front.thumbnails?.large ||
      front.image;
    return thumb ? String(thumb).replace(/^http:/, "https:") : null;
  } catch {
    return null;
  }
}

// Sort releases oldest → newest
function sortByDate(releases) {
  return [...releases].sort((a, b) => {
    const da = String(a.date || "9999").padEnd(10, "-0");
    const db = String(b.date || "9999").padEnd(10, "-0");
    return da.localeCompare(db);
  });
}

// Render one version card (cover + metadata)
function renderVersionCard(rel, thumbUrl, isCurrent, onNavigate) {
  const id = escHtml(rel.id);
  const fmt = escHtml(formatMedia(rel.media));
  const date = escHtml(rel.date || "–");
  const country = escHtml(rel.country || "–");

  const labelInfo = (rel["label-info"] || [])[0];
  const label = escHtml(labelInfo?.label?.name || "–");
  const catno = escHtml(labelInfo?.["catalog-number"] || "–");
  const barcode = escHtml(rel.barcode || "–");
  const note = escHtml(rel.disambiguation || "–");

  const imgHtml = thumbUrl
    ? `<img src="${escHtml(thumbUrl)}" alt="cover" class="ver-thumb${isCurrent ? " ver-thumb--current" : ""}" loading="lazy">`
    : `<div class="ver-thumb ver-thumb--empty${isCurrent ? " ver-thumb--current" : ""}"></div>`;

  return `
    <div class="ver-card${isCurrent ? " ver-card--current" : ""}" data-rel-id="${id}">
      <div class="ver-art">${imgHtml}</div>
      <div class="ver-meta">
        <div class="ver-row"><span class="ver-k">Format:</span> <span class="ver-v">${fmt || "–"}</span></div>
        <div class="ver-row"><span class="ver-k">Date:</span> <span class="ver-v">${date}</span></div>
        <div class="ver-row"><span class="ver-k">Country:</span> <span class="ver-v">${country}</span></div>
        <div class="ver-row"><span class="ver-k">Label:</span> <span class="ver-v">${label}</span></div>
        <div class="ver-row"><span class="ver-k">Cat. no.:</span> <span class="ver-v">${catno}</span></div>
        <div class="ver-row"><span class="ver-k">Barcode:</span> <span class="ver-v">${barcode}</span></div>
        <div class="ver-row"><span class="ver-k">Note:</span> <span class="ver-v">${note}</span></div>
      </div>
    </div>
  `;
}

export async function buildVersionsView(onNavigate) {
  const view = document.querySelector('section.view[data-view="versions"]');
  if (!view) return;

  const rgId = STATE.views.releaseGroupId;
  const currentId = STATE.views.currentReleaseId;

  if (!rgId) {
    view.innerHTML = `<div class="muted ver-empty">No release group data available.</div>`;
    return;
  }

  view.innerHTML = `<div class="muted ver-loading">Loading versions…</div>`;

  let releases;
  try {
    releases = await loadReleaseVersions(rgId);
  } catch {
    view.innerHTML = `<div class="muted ver-empty">Could not load versions.</div>`;
    return;
  }

  const sorted = sortByDate(releases);

  // Render cards immediately with no covers (fast)
  const cards = sorted.map((rel) => ({
    rel,
    isCurrent: rel.id === currentId,
  }));

  const renderAll = (thumbMap) => {
    const html = cards
      .map(({ rel, isCurrent }) =>
        renderVersionCard(rel, thumbMap.get(rel.id) || null, isCurrent, onNavigate)
      )
      .join("");
    view.innerHTML = `<div class="ver-list">${html}</div>`;

    // Bind click handlers
    view.querySelectorAll(".ver-card:not(.ver-card--current)").forEach((card) => {
      card.addEventListener("click", () => {
        const relId = card.dataset.relId;
        if (relId && typeof onNavigate === "function") onNavigate(relId);
      });
    });
  };

  // First pass: render without covers
  renderAll(new Map());

  // Second pass: fetch covers and update incrementally
  const thumbMap = new Map();
  for (const { rel, isCurrent } of cards) {
    // Current release already has cover from the main load — reuse STATE
    if (isCurrent && STATE.cover?.gallery?.[0]) {
      const existing = STATE.cover.gallery.find((c) => c.front) || STATE.cover.gallery[0];
      if (existing?.thumb) {
        thumbMap.set(rel.id, existing.thumb);
        const img = view.querySelector(`[data-rel-id="${rel.id}"] .ver-thumb`);
        if (img && img.tagName === "IMG") img.src = existing.thumb;
        else if (img) {
          img.outerHTML = `<img src="${escHtml(existing.thumb)}" alt="cover" class="ver-thumb ver-thumb--current" loading="lazy">`;
        }
        continue;
      }
    }

    const thumb = await fetchThumb(rel.id);
    if (thumb) {
      thumbMap.set(rel.id, thumb);
      const card = view.querySelector(`[data-rel-id="${rel.id}"]`);
      if (card) {
        const placeholder = card.querySelector(".ver-thumb");
        if (placeholder) {
          const isCur = card.classList.contains("ver-card--current");
          const newImg = document.createElement("img");
          newImg.src = thumb;
          newImg.alt = "cover";
          newImg.className = `ver-thumb${isCur ? " ver-thumb--current" : ""}`;
          newImg.loading = "lazy";
          placeholder.replaceWith(newImg);
        }
      }
    }

    // Small gap to be polite to CAA
    await new Promise((r) => setTimeout(r, 300));
  }
}