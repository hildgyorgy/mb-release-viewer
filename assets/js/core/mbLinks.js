import { escHtml } from "./util.js";

export function mbArtistLink(artist) {
  if (!artist?.id) return "";
  const name = artist.name || artist["name"] || "(unknown)";
  return `<a href="https://musicbrainz.org/artist/${artist.id}" target="_blank" rel="noreferrer">${escHtml(
    name
  )}</a>`;
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