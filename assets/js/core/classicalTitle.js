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

  const t = s.replace(/\s+/g, " ").trim();

  // Roman movement start: I. / II. / III. / IV. ... (accept "." or ":" after the roman)
  const romanMovStart = /^([IVXLCDM]{1,7})\s*[.:]\s+/i;

  // Split at FIRST ":" only
  const colonPos = t.indexOf(":");
  if (colonPos !== -1) {
    const left = t.slice(0, colonPos).trim();
    const right = t.slice(colonPos + 1).trim();

    if (romanMovStart.test(right)) {
      return { workLine: left, movLine: right };
    }
  }

  // Fallback: no split
  return { workLine: t, movLine: "" };
}

// ------------------------------------------------------------
// Track row types (mirrors Swift TrackDisplayRow enum)
// ------------------------------------------------------------

/**
 * @typedef {{ type: "work",     work: string }} WorkRow
 * @typedef {{ type: "track",    pos: number|null, title: string, len: string, recId: string, isMovement: boolean }} TrackRow
 * @typedef {WorkRow | TrackRow} DisplayRow
 */

/**
 * Build the display row sequence for one medium's track list.
 *
 * Rules:
 *   1. Base split (splitClassicalTitle): colon + Roman numeral movement → always a classical group
 *   2. Colon-gate: plain "Work: movement" where the same work prefix repeats
 *      consecutively ≥2 times within the medium → also a classical group
 *   3. Anything else → plain track row, no work header
 *
 * @param {Array<{title: string, pos: number|null, len: string, rec: {id:string}|null}>} tracks
 * @returns {DisplayRow[]}
 */
export function buildTrackRows(tracks) {
  const prepared = prepareTracks(tracks);
  const runLengths = computeRunLengths(prepared);

  const rows = [];
  let lastWork = "";

  for (let idx = 0; idx < prepared.length; idx++) {
    const p = prepared[idx];
    const runLen = runLengths[idx];

    const hasBaseSplit = !!(p.baseWork && p.baseMov);

    let workLine = p.baseWork;
    let movLine = p.baseMov;
    let usedColonGate = false;

    // Colon-gate: no roman split, but same "Work:" prefix repeats ≥2 times
    if (!hasBaseSplit && p.hasColon && p.colonWork && p.colonMov && runLen >= 2) {
      usedColonGate = true;
      workLine = p.colonWork;
      movLine = p.colonMov;
    }

    const work = String(workLine || "").trim();
    const mov = String(movLine || "").trim();
    const isClassicalGroup = hasBaseSplit || usedColonGate;

    // Emit work header when we enter a new work group
    if (isClassicalGroup && work && work !== lastWork) {
      rows.push({ type: "work", work });
      lastWork = work;
    }

    rows.push({
      type: "track",
      pos: p.track.pos ?? null,
      title: isClassicalGroup && mov ? mov : p.rawTitle,
      len: p.track.len || "",
      recId: p.track.rec?.id || "",
      isMovement: isClassicalGroup && !!mov,
    });
  }

  return rows;
}

// ------------------------------------------------------------
// Private helpers
// ------------------------------------------------------------

function splitFirstColon(raw) {
  const s = String(raw || "");
  const i = s.indexOf(":");
  if (i === -1) return null;
  return {
    left: s.slice(0, i).trim(),
    right: s.slice(i + 1).trim(),
  };
}

function prepareTracks(tracks) {
  return tracks.map((track) => {
    const rawTitle = String(track.title || "").trim();
    const base = splitClassicalTitle(rawTitle);
    const colon = splitFirstColon(rawTitle);

    return {
      track,
      rawTitle,
      baseWork: String(base.workLine || "").trim(),
      baseMov: String(base.movLine || "").trim(),
      hasColon: !!colon,
      colonWork: String(colon?.left || "").trim(),
      colonMov: String(colon?.right || "").trim(),
    };
  });
}

function computeRunLengths(prepared) {
  const runLengths = new Array(prepared.length).fill(0);
  let i = 0;

  while (i < prepared.length) {
    const cur = prepared[i];

    if (!cur.hasColon || !cur.colonWork) {
      runLengths[i] = 0;
      i += 1;
      continue;
    }

    const work = cur.colonWork;
    let j = i + 1;

    while (
      j < prepared.length &&
      prepared[j].hasColon &&
      prepared[j].colonWork === work
    ) {
      j += 1;
    }

    const runLen = j - i;
    for (let k = i; k < j; k++) runLengths[k] = runLen;

    i = j;
  }

  return runLengths;
}