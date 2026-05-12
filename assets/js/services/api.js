import { artistCreditToText } from "../core/util.js";

const MB_API = "https://musicbrainz.org/ws/2";
const COVER_API = "https://coverartarchive.org";


export async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function withCache(map, key, loader) {
  if (!key) return null;
  if (map.has(key)) return map.get(key);

  const val = await loader();
  map.set(key, val);
  return val;
}

const recordingCache = new Map();
export async function loadRecording(recId) {
  return withCache(recordingCache, recId, async () =>
    fetchJSON(
      `${MB_API}/recording/${recId}?fmt=json&inc=` +
      `artist-credits+artist-rels+work-rels+place-rels+recording-rels+url-rels`
    )
  );
}

const workCache = new Map();
export async function loadWork(workId) {
  return withCache(workCache, workId, async () =>
    fetchJSON(`${MB_API}/work/${workId}?fmt=json&inc=artist-rels+work-rels`)
  );
}

function forceHttps(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (s.startsWith("//")) return "https:" + s;
  return s.replace(/^http:\/\//i, "https://");
}

export async function loadRelease(mbid) {
  const relUrl =
    `${MB_API}/release/${mbid}` +
    `?fmt=json&inc=recordings+artists+labels+release-groups+artist-credits+recording-rels+work-rels+annotation+release-rels+artist-rels+label-rels+url-rels`;

  const rel = await fetchJSON(relUrl);

  // Cover Art Archive: collect ALL images
  let covers = [];
  try {
    const ca = await fetchJSON(`${COVER_API}/release/${mbid}`);
    covers = (ca?.images || [])
      .map((img, i) => {
        const full = forceHttps(img.image || "");
        const large = forceHttps(img.thumbnails?.large || img.thumbnails?.[500] || img.thumbnails?.[250] || full);
        const thumb = forceHttps(img.thumbnails?.small || img.thumbnails?.[120] || large || full);

        const parts = [];
        if (img.front) parts.push("front");
        if (img.back) parts.push("back");
        const alt = parts.length ? `Cover (${parts.join(", ")})` : `Cover ${i + 1}`;

        return {
          full,
          large,
          thumb,
          front: !!img.front,
          back: !!img.back,
          comment: String(img.comment || "").trim(),
          alt,
        };
      })
      .filter((x) => x.full || x.large || x.thumb);
  } catch {
    covers = [];
  }

  const front = covers.find((c) => c.front) || covers[0] || null;
  const cover = front ? (front.large || front.full || front.thumb) : null;

  return { rel, cover, covers };
}

/* ---------- Search endpoint ---------- */

function firstReleaseDateLike(hit) {
  const d = String(hit?.date || "").trim();
  return d || "";
}

function summarizeSearchHit(hit) {
  const mbid = hit?.id || "";
  const titleRaw = String(hit?.title || "").trim();

  const ac = hit?.["artist-credit"];
  const artist = artistCreditToText(ac);

  const date = firstReleaseDateLike(hit);
  const year = date ? String(date).slice(0, 4) : "";

  const format = String(hit?.media?.[0]?.format || hit?.packaging || "").trim();
  const country = String(hit?.country || "").trim();
  const label = String(hit?.["label-info"]?.[0]?.label?.name || "").trim();

  const head = `${artist || "Various Artists"} — ${titleRaw}`.trim();

  const parts = [];
  if (year) parts.push(year);
  if (country) parts.push(country);
  if (label) parts.push(label);
  if (format) parts.push(format);

  return { mbid, title: head, sub: parts.join(" · ") };
}

export function buildReleaseSearchQuery(input) {
  const q0 = String(input || "").trim();
  if (!q0) return "";

  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tok = (t) => `"${esc(t)}"`;

    // comma syntax: "artist, release"
  const commaIdx = q0.indexOf(",");
  if (commaIdx !== -1) {
    const leftRaw = q0.slice(0, commaIdx).trim();
    const rightRaw = q0.slice(commaIdx + 1).trim();

    if (!rightRaw) {
      const t = tok(leftRaw);
      return `(artist:${t} OR release:${t})`;
    }
    if (!leftRaw) {
      const t = tok(rightRaw);
      return `(release:${t} OR artist:${t})`;
    }

    const artistPhrase = `"${esc(leftRaw)}"`;
    const releasePhrase = `"${esc(rightRaw)}"`;

    const artistTokens = leftRaw.split(/\s+/).map(s => s.trim()).filter(Boolean).map(tok);
    const releaseTokens = rightRaw.split(/\s+/).map(s => s.trim()).filter(Boolean).map(tok);

    const artistAND = artistTokens.map(t => `artist:${t}`).join(" AND ");
    const releaseAND = releaseTokens.map(t => `release:${t}`).join(" AND ");

    return `(
      (artist:${artistPhrase} AND release:${releasePhrase})^30
      OR ((${artistAND}) AND (${releaseAND}))^22
      OR (artist:${artistPhrase})^8
      OR (release:${releasePhrase})^6
      OR ((${artistTokens.map(t => `(artist:${t} OR release:${t})`).join(" AND ")}) AND (${releaseTokens.map(t => `(artist:${t} OR release:${t})`).join(" AND ")}))^2
    )`.replace(/\s+/g, " ").trim();
  }

  // spotlight mode
  const rawTokens = q0.split(/\s+/).map(t => t.trim()).filter(Boolean);
  if (!rawTokens.length) return "";

  const tokens = rawTokens.map(tok);

  if (tokens.length === 1) {
    const t = tokens[0];
    return `(release:${t} OR artist:${t})`;
  }

  const phrase = `"${esc(rawTokens.join(" "))}"`;

  if (tokens.length === 2) {
    const [t1, t2] = tokens;
    return `(
      artist:${phrase}^18
      OR (artist:${t1} AND artist:${t2})^12
      OR release:${phrase}^6
      OR (release:${t1} AND release:${t2})^4
      OR ((artist:${t1} OR release:${t1}) AND (artist:${t2} OR release:${t2}))^2
    )`.replace(/\s+/g, " ").trim();
  }

  const broad = tokens.map(t => `(artist:${t} OR release:${t})`).join(" AND ");
  const phraseArtist = `artist:${phrase}^10`;
  const phraseRelease = `release:${phrase}^6`;

  const last = tokens[tokens.length - 1];
  const firstPart = tokens.slice(0, -1);
  const artistPart = firstPart.map(t => `artist:${t}`).join(" AND ");
  const structured = artistPart ? `(${artistPart} AND release:${last})^4` : "";

  return `(
    (${broad})^1
    OR ${phraseArtist}
    OR ${phraseRelease}
    ${structured ? `OR ${structured}` : ""}
  )`.replace(/\s+/g, " ").trim();
}

export async function searchReleases(q, limit) {
  const query = buildReleaseSearchQuery(q);
  if (!query) return [];

  const url =
    `${MB_API}/release/?fmt=json&limit=${encodeURIComponent(
      String(limit)
    )}&query=${encodeURIComponent(query)}`;

  const data = await fetchJSON(url);
  const hits = Array.isArray(data?.releases) ? data.releases : [];

  return hits
    .map(summarizeSearchHit)
    .filter((x) => x.mbid && x.title)
    .slice(0, limit);
}

// ------------------------------------------------------------
// Artist
// ------------------------------------------------------------

const artistCache = new Map();
export async function loadArtist(artistId) {
  return withCache(artistCache, artistId, async () =>
    fetchJSON(`${MB_API}/artist/${artistId}?fmt=json&inc=url-rels`)
  );
}

const releaseGroupCache = new Map();
export async function loadArtistReleaseGroups(artistId) {
  if (!artistId) return [];
  if (releaseGroupCache.has(artistId)) return releaseGroupCache.get(artistId);

  let allGroups = [];
  let offset = 0;
  const pageSize = 100;

  while (allGroups.length < 500) {
    const data = await fetchJSON(
      `${MB_API}/release-group?artist=${artistId}` +
      `&fmt=json&limit=${pageSize}&offset=${offset}`
    );

    const page = data?.["release-groups"] || [];
    allGroups = allGroups.concat(page);

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  releaseGroupCache.set(artistId, allGroups);
  return releaseGroupCache.get(artistId);
}

// ------------------------------------------------------------
// Wikipedia (via Wikidata)
// ------------------------------------------------------------

const wikiCache = new Map();
export async function fetchWikipediaSummary(wikidataUrl) {
  if (!wikidataUrl) return null;
  if (wikiCache.has(wikidataUrl)) return wikiCache.get(wikidataUrl);

  // Step 1: Wikidata entity → English Wikipedia title
  const qid = String(wikidataUrl).split("/").pop();
  if (!qid) return null;

  const wdData = await fetchJSON(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`
  );

  const title = wdData?.entities?.[qid]?.sitelinks?.enwiki?.title;
  if (!title) return null;

  // Step 2: Wikipedia summary API
  const encoded = encodeURIComponent(title.replaceAll(" ", "_"));
  const summary = await fetchJSON(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
  );

  const result = {
    title,
    extract: summary?.extract || "",
    url: `https://en.wikipedia.org/wiki/${encoded}`,
  };

  wikiCache.set(wikidataUrl, result);
  return result;
}

export async function loadFirstReleaseOfGroup(rgId) {
  if (!rgId) return null;
  const data = await fetchJSON(
    `${MB_API}/release?release-group=${rgId}&fmt=json&limit=1`
  );
  return data?.releases?.[0] || null;
}