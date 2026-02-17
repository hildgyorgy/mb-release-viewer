export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function extractMBID(value) {
  const m = String(value || "")
    .trim()
    .match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

export function fmtMs(ms) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

export function artistCreditToText(ac) {
  if (!ac) return "";
  return ac.map((x) => x.name + (x.joinphrase || "")).join("");
}

export function escHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// attribútum-escape (href/src/title)
export function escAttr(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

export function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function relDateLabel(r) {
  const b = String(r?.begin || "").trim();
  const e = String(r?.end || "").trim();
  if (b && e && b !== e) return `${b} → ${e}`;
  if (b) return b;
  if (e) return e;
  return "";
}

/**
 * Medium label policy:
 * - Digital media: NO "Disc 1" prefix (ever)
 * - Vinyl: only show "Disc N" if release has multiple media
 * - CD: "CD N"
 * - Other formats: "Disc N" only if multiple media; otherwise just format (or "Disc" fallback)
 * - Medium title appended as " · Title"
 */
export function mediumLabel(m, totalMediaCount) {
  const fmtRaw = String(m?.format || "").trim();
  const fmt = fmtRaw.toLowerCase();
  const title = String(m?.title || "").trim();

  const isDigital = fmt.includes("digital");
  const isVinyl = fmt.includes("vinyl");
  const isCD = fmt.includes("cd");

  const extra = [];
  if (title) extra.push(title);

  const joinExtra = (base) => (extra.length ? `${base} · ${extra.join(" · ")}` : base);

  if (isDigital) return joinExtra(fmtRaw || "Digital media");
  if (isVinyl) {
    if (totalMediaCount > 1) return joinExtra(`Disc ${m.index} · ${fmtRaw || "Vinyl"}`);
    return joinExtra(fmtRaw || "Vinyl");
  }
  if (isCD) return joinExtra(`CD ${m.index}`);

  if (totalMediaCount > 1) return joinExtra(`Disc ${m.index}${fmtRaw ? ` · ${fmtRaw}` : ""}`.trim());
  return joinExtra(fmtRaw || "Disc");
}

export function stripParentPrefix(childTitle, parentTitle) {
  const child = String(childTitle || "").trim();
  const parent = String(parentTitle || "").trim();
  if (!child || !parent) return child;

  const candidates = [
    parent + ": ",
    parent + " ",
    parent + " - ",
    parent + " – ",
    parent + " — ",
    parent + ". ",
    parent + " . ",
  ];

  for (const p of candidates) {
    if (child.startsWith(p)) return child.slice(p.length);
  }
  return child;
}