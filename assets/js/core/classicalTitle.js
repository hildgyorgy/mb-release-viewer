// assets/js/core/classicalTitle.js

/**
 * Split ONLY when:
 * - there is a ":" and the right side starts with a roman movement (I., II., III., ...)
 *
 * Everything else returns { workLine: fullTitle, movLine: "" }.
 */
export function splitClassicalTitle(titleRaw) {
  const s = String(titleRaw || "").trim();
  if (!s) return { workLine: "", movLine: "" };

  // normalize whitespace (dash normalization not needed anymore for this strict rule)
  const t = s.replace(/\s+/g, " ").trim();

  // Roman movement start: I. / II. / III. / IV. ... (accept "." or ":" after the roman)
  const romanMovStart = /^([IVXLCDM]{1,7})\s*[.:]\s+/i;

  // Split at FIRST ":" only
  const colonPos = t.indexOf(":");
  if (colonPos !== -1) {
    const left = t.slice(0, colonPos).trim();
    const right = t.slice(colonPos + 1).trim(); // keep further ":" in the right side

    if (romanMovStart.test(right)) {
      return { workLine: left, movLine: right };
    }
  }

  // Fallback: no split
  return { workLine: t, movLine: "" };
}