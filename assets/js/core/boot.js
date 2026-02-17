/* ============================================================
   Boot helpers (URL → initial load)
   ============================================================ */

import { extractMBID } from "./util.js";

/**
 * If URL has ?mbid=..., push it into #omni and trigger load.
 *
 * @param {Object} opts
 * @param {(mbid:string)=>Promise<void>|void} opts.onGoByMbid
 */
export function bootFromUrl({ onGoByMbid }) {
  const omni = document.getElementById("omni");
  if (!omni) return;

  const qs = new URLSearchParams(window.location.search);
  const mbidParam = String(qs.get("mbid") || "").trim();
  if (!mbidParam) return;

  omni.value = mbidParam;
  omni.classList.remove("is-loaded");

  const mbid = extractMBID(mbidParam);
  if (mbid && typeof onGoByMbid === "function") onGoByMbid(mbid);
}