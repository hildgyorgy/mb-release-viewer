import { escHtml } from "./util.js";

export function mbArtistLink(artist) {
  if (!artist?.id) return "";
  const name = artist.name || artist["name"] || "(unknown)";
  return `<a href="https://musicbrainz.org/artist/${artist.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
}

export function mbPlaceLink(place) {
  if (!place?.id) return "";
  const name = place.name || "(place)";
  return `<a href="https://musicbrainz.org/place/${place.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
}

export function mbRecordingLink(rec) {
  if (!rec?.id) return escHtml(rec?.title || "(recording)");
  const title = escHtml(rec?.title || "(recording)");
  return `<a href="https://musicbrainz.org/recording/${rec.id}" target="_blank" rel="noreferrer">${title}</a>`;
}

export function artistCreditToLinks(ac) {
  if (!Array.isArray(ac) || !ac.length) return "";
  return ac
    .map((x) => {
      const a = x?.artist || null;
      const name = x?.name || a?.name || "(unknown)";
      const link = a?.id
        ? `<a href="https://musicbrainz.org/artist/${a.id}" target="_blank" rel="noreferrer">${escHtml(
            name
          )}</a>`
        : escHtml(name);
      return link + (x?.joinphrase || "");
    })
    .join("");
}

export function mbWorkUrl(work) {
  if (!work?.id) return "";
  return `https://musicbrainz.org/work/${work.id}`;
}

export function artistPanelLink(artist) {
  if (!artist?.id) return escHtml(artist?.name || "(unknown)");
  const name = escHtml(artist.name || "(unknown)");
  return `<a href="#" class="artist-panel-link" data-artist-id="${artist.id}"
             aria-label="Show ${name} details">${name}</a>`;
}