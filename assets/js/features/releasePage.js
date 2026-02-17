/* ============================================================
   Release page pipeline: render + hydrate + state prep
   ============================================================ */

import { STATE, setCoverState, setViewsState } from "../core/state.js";
import { artistCreditToText, fmtMs } from "../core/util.js";

import { bindThemeToggleOnce } from "../ui/theme.js";
import { bindCoverSizerOnce, layoutSync } from "../ui/layout.js";
import { bindCoverGalleryOnce } from "../ui/coverGallery.js";
import { renderHeader, renderTracksView, renderRecordingsViewShell } from "../ui/render.js";

import { bindTabsOnce, setActiveView } from "../ui/tabs.js";
import { buildRecordingsView } from "./recordings.js";
import { bindTrackToggles } from "./tracks.js";

function hydrateUI(out, flatTracks) {
  // Theme is applied in App.init(); here we only bind UI behaviour.
  bindThemeToggleOnce(out);

  bindTabsOnce({
    onViewActivated: async (view) => {
      if (view === "recordings" && !STATE.views.recordingsBuilt) {
        setViewsState({ recordingsBuilt: true });
        await buildRecordingsView();
      }
    },
  });

  setActiveView("tracks");

  // tracks table toggles (lazy load details)
  bindTrackToggles(out, flatTracks);

  // cover interactions + sizing
  bindCoverGalleryOnce(out);
  bindCoverSizerOnce();
}

/**
 * Render the whole release page into #out, update STATE, then hydrate UI.
 *
 * @param {{rel:Object, cover:string|null, covers:Array}} param0
 */
export function renderReleasePage({ rel, cover, covers }) {
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

  // cover gallery state
  const gallery = Array.isArray(covers) ? covers : [];
  let idx = gallery.findIndex((x) => x.front);
  if (idx < 0) idx = 0;
  setCoverState({ gallery, index: idx });

  // tracks
  const media = rel.media || [];
  const flatTracks = [];

  const mediaWithTracks = media.map((m, mi) => {
    const mt = (m.tracks || []).map((t) => {
      const obj = {
        pos: t.position,
        title: t.title,
        len: fmtMs(t.length),
        rec: t.recording,
        _i: flatTracks.length,
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

  // recordings data source
  setViewsState({
    recordingsBuilt: false,
    recordingsMedia: mediaWithTracks,
  });

  const out = document.getElementById("out");
  if (!out) return;

  out.innerHTML = `
    ${renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes })}
    <div class="views">
      ${renderTracksView(mediaWithTracks, annotation)}
      ${renderRecordingsViewShell()}
    </div>
  `;

  hydrateUI(out, flatTracks);

  // layout pass (desktop sizing etc.)
  layoutSync(out);

  // cover image load can change intrinsic sizing; re-sync once
  const img = document.getElementById("coverImg");
  if (img) {
    const relock = () => layoutSync(out);
    img.addEventListener("load", relock, { once: true });
    if (img.complete) relock();
  }
}