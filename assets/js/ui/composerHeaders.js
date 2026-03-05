// assets/js/ui/composerHeaders.js
import { $ } from "../core/util.js";
import { escHtml } from "../core/util.js"; // ha innen jön; ha máshonnan, igazítsd
import { loadWork, loadRecording } from "../services/api.js"; // <-- lehet, hogy nálad más a név/export

// === Feature flag: easy kill switch ===
export const ENABLE_COMPOSER_HEADERS = true;

/**
 * Insert composer headers above each classical work header row.
 * We only touch rows that already exist: <tr.work-row data-rec="...">
 *
 * Idempotent: won't insert twice.
 */
export function bindComposerHeadersOnce(root = document) {
  if (!ENABLE_COMPOSER_HEADERS) return;

  // Avoid double-binding
  const host = root?.querySelector?.(".tracks") ? root : document;
  const marker = host.documentElement || document.documentElement;
  if (marker.dataset.composerHeadersBound === "1") return;
  marker.dataset.composerHeadersBound = "1";

  hydrateComposerHeaders(host).catch((err) => {
    // silent fail: feature should never break the page
    console.warn("[composerHeaders] hydrate failed:", err);
  });
}

// --- Caches to minimize API calls ---
const recToWorkId = new Map();   // recId -> workId|null
const workToComposer = new Map(); // workId -> "NAME"|null

async function hydrateComposerHeaders(root) {
  const workRows = Array.from(root.querySelectorAll("tr.work-row[data-rec]"));
  if (!workRows.length) return;

  // Process sequentially (gentle on rate limit)
  for (const wr of workRows) {
    // Already inserted?
    if (wr.previousElementSibling?.classList?.contains("composer-row")) continue;

    const recId = String(wr.getAttribute("data-rec") || "").trim();
    if (!recId) continue;

    const workId = await getPrimaryWorkIdFromRecordingId(recId);
    if (!workId) continue;

    const composerName = await getComposerNameFromWorkId(workId);
    if (!composerName) continue;

    // Insert composer header row above work-row
    const tr = document.createElement("tr");
    tr.className = "composer-row";
    tr.innerHTML = `
      <td colspan="3" class="composer-cell">${escHtml(composerName)}</td>
    `.trim();

    wr.parentNode.insertBefore(tr, wr);
  }
}

async function getPrimaryWorkIdFromRecordingId(recId) {
  if (recToWorkId.has(recId)) return recToWorkId.get(recId);

  // You must have something like loadRecording() in services/api.js.
  // It needs to include work relations. If your current loader doesn't,
  // make a dedicated loader or adjust the inc=... there.
  const rec = await loadRecording(recId);
  const rels = Array.isArray(rec?.relations) ? rec.relations : [];

  const workRel = rels.find((r) => (r.target_type ?? r["target-type"]) === "work");
  const w = workRel?.work || workRel?.target || null;
  const workId = typeof w === "string" ? w : (w?.id || null);

  recToWorkId.set(recId, workId);
  return workId;
}

async function getComposerNameFromWorkId(workId) {
  if (workToComposer.has(workId)) return workToComposer.get(workId);

  const w = await loadWork(workId);
  const rels = Array.isArray(w?.relations) ? w.relations : [];

  // Find "composer" artist relation
  const compRel = rels.find((r) => {
    const tt = r.target_type ?? r["target-type"];
    if (tt !== "artist") return false;
    return String(r.type || "").toLowerCase() === "composer";
  });

  const a = compRel?.artist || compRel?.target || null;
  const name = String(a?.name || "").trim() || null;

  workToComposer.set(workId, name);
  return name;
}