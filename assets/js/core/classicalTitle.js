// assets/js/core/classicalTitle.js
import { escHtml } from "./util.js";

/**
 * Split a classical-ish track title into:
 * - workLine: the "work" (CD booklet style)
 * - movLine:  the movement/part line
 *
 * Goal: nicer layout immediately (no API calls).
 */
export function splitClassicalTitle(titleRaw) {
  const s = String(titleRaw || "").trim();
  if (!s) return { workLine: "", movLine: "" };

  // Normalizáljuk a dash-eket
  const t = s.replace(/\s*[–—]\s*/g, " – ").replace(/\s+/g, " ").trim();

  // Római tételkezdet: I. / II. / III. / IV. stb.
  const romanMovStart = /^([IVXLCDM]{1,7})\s*[.:]\s+/i;

  // --------------------------------------------------
  // 1) Split az ELSŐ ":" után (ha van),
  //    és csak akkor, ha a jobb oldal római tétellel indul
  //    (ha több ":" van, azokat békén hagyjuk a jobb oldalon)
  // --------------------------------------------------
  const colonPos = t.indexOf(":");
  if (colonPos !== -1) {
    const left = t.slice(0, colonPos).trim();
    const right = t.slice(colonPos + 1).trim(); // minden további ":" marad

    if (romanMovStart.test(right)) {
      return { workLine: left, movLine: right };
    }
  }

  // --------------------------------------------------
  // 2) Split utolsó ". I." típusú mintára
  // pl: "... Op. 64. I. Allegro"
  // --------------------------------------------------
  const dotSplit = t.match(/\.\s*([IVXLCDM]{1,7}\s*[.:]\s+.+)$/i);

  if (dotSplit) {
    const movLine = dotSplit[1].trim();
    const workLine = t.slice(0, dotSplit.index).trim();

    if (romanMovStart.test(movLine)) {
      return {
        workLine,
        movLine
      };
    }
  }

  // --------------------------------------------------
  // 3) Ha maga a cím római számmal kezdődik
  // --------------------------------------------------
  if (romanMovStart.test(t)) {
    return {
      workLine: "",
      movLine: t
    };
  }

  // --------------------------------------------------
  // 4) Fallback: nem klasszikus-szerű
  // --------------------------------------------------
  return {
    workLine: t,
    movLine: ""
  };
}