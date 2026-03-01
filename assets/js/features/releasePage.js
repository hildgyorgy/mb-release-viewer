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
export function renderReleasePage(out, { rel, cover, covers }) {
  function pickStreamingLinksFromRelease(rel) {
    const rels = Array.isArray(rel?.relations) ? rel.relations : [];

    // Qobuz normalize to play.qobuz.com if possible (purchase pages are common, but we want the streaming page)
    function normalizeQobuzToPlay(url) {
      const s = String(url || "").trim();
      if (!s) return "";

      let u;
      try { u = new URL(s); } catch { return s; }

      const host = u.hostname.toLowerCase();

      // Already streaming page
      if (host === "play.qobuz.com") return u.toString();

      // Convert purchase page -> play page (extract album id from the end)
      if (host.endsWith("qobuz.com")) {
        const m = u.pathname.match(/\/album\/[^/]+\/([a-z0-9]+)$/i);
        if (m && m[1]) return `https://play.qobuz.com/album/${m[1]}`;
      }

      return s;
    }

    let spotifyUrl = "";
    let appleMusicUrl = "";
    let tidalUrl = "";
    let qobuzUrl = "";


    for (const r of rels) {
      const tt = r.target_type ?? r["target-type"];
      if (tt !== "url") continue;

      const u = r.url?.resource || r.target?.resource || "";
      const url = String(u || "").trim();
      if (!url) continue;

      const low = url.toLowerCase();

      if (!spotifyUrl && low.includes("spotify.com")) spotifyUrl = url;
      if (!appleMusicUrl && low.includes("music.apple.com")) appleMusicUrl = url;
      if (!tidalUrl && low.includes("tidal.com")) tidalUrl = url;
      if (low.includes("qobuz.com")) {
        if (low.includes("play.qobuz.com")) qobuzUrl = url;
        else if (!qobuzUrl) qobuzUrl = url;
      }

      if (spotifyUrl && appleMusicUrl && tidalUrl && qobuzUrl) break;
    }

    qobuzUrl = normalizeQobuzToPlay(qobuzUrl);
    return { spotifyUrl, appleMusicUrl, tidalUrl, qobuzUrl };
  }
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
  const streaming = pickStreamingLinksFromRelease(rel);

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

  out.innerHTML = `
    ${renderHeader({ title, cover, mbLink, artist, date, country, label, catno, barcode, releaseNotes, streaming })}
    <div class="views">
      ${renderTracksView(mediaWithTracks, annotation)}
      ${renderRecordingsViewShell()}
    </div>
  `;

  hydrateUI(out, flatTracks);

  // layout pass (desktop sizing etc.)
  layoutSync(out);

  // cover image load can change intrinsic sizing; re-sync once
  const img = out.querySelector("#coverImg");
  if (img) {
    const relock = () => layoutSync(out);
    img.addEventListener("load", relock, { once: true });
    if (img.complete) relock();
  }
}