import { escHtml } from "../core/util.js";
import { loadWork, loadRecording } from "../services/api.js";

// === Kill switch ===
export const ENABLE_COMPOSER_HEADERS = true;

export function bindComposerHeadersOnce(root = document) {
  if (!ENABLE_COMPOSER_HEADERS) return;

  const host = root?.querySelector?.(".tracks") ? root : document;
  const marker = document.documentElement;

  // ne fussunk párhuzamosan, de később újra lehessen hívni
  if (marker.dataset.composerHeadersRunning === "1") return;
  marker.dataset.composerHeadersRunning = "1";

  hydrateComposerHeaders(host)
    .catch((err) => {
      console.warn("[composerHeaders] hydrate failed:", err);
    })
    .finally(() => {
      marker.dataset.composerHeadersRunning = "0";
    });
}

// --- Caches to minimize API calls ---
const recToWorkId = new Map();    // recId -> workId|null
const workToComposer = new Map(); // workId -> "NAME"|null

function normName(s) {
  return String(s || "").trim().toLowerCase();
}

function isFirstWorkInMedium(workRow) {
  let p = workRow?.previousElementSibling || null;

  while (p) {
    if (p.classList?.contains("composer-row")) {
      p = p.previousElementSibling;
      continue;
    }
    if (p.classList?.contains("details") || p.classList?.contains("track")) {
      p = p.previousElementSibling;
      continue;
    }
    if (p.classList?.contains("work-row")) return false;
    if (p.classList?.contains("medium-row")) return true;

    // if some other row type appears, still keep scanning
    p = p.previousElementSibling;
  }
  return true;
}

async function hydrateComposerHeaders(root) {
  const workRows = Array.from(root.querySelectorAll("tr.work-row[data-rec]"));
  if (!workRows.length) return;

  let lastComposerNorm = null; // mediumon belül értelmezett "utolsó kiírt composer"

  // Process sequentially (gentle on rate limit)
  for (const wr of workRows) {
    // If this is the first work of a medium, reset composer run
    if (isFirstWorkInMedium(wr)) lastComposerNorm = null;

    // Already inserted for THIS work row?
    if (wr.previousElementSibling?.classList?.contains("composer-row")) {
      // Ha már van composer-row, akkor azt tekintsük "utolsó composer"-nek is,
      // hogy a run-compression stabil maradjon akkor is, ha újrahívódna.
      const prevText = wr.previousElementSibling.querySelector(".composer-cell")?.textContent || "";
      if (prevText) lastComposerNorm = normName(prevText);
      continue;
    }

    const recId = String(wr.getAttribute("data-rec") || "").trim();
    if (!recId) continue;

    const workId = await getPrimaryWorkIdFromRecordingId(recId);
    if (!workId) continue;

    const composerName = await getComposerNameFromWorkId(workId);
    if (!composerName) continue;

    const composerNorm = normName(composerName);
    if (!composerNorm) continue;

    // Run compression within medium: only insert if changed
    if (lastComposerNorm === composerNorm) {
      continue;
    }

// Insert composer header row above work-row
const tr = document.createElement("tr");
tr.className = "composer-row";
tr.innerHTML = `
  <td colspan="3" class="composer-cell">${escHtml(composerName)}</td>
`.trim();

wr.parentNode.insertBefore(tr, wr);

// trigger opacity animation
requestAnimationFrame(() => {
  tr.classList.add("is-in");
});

    lastComposerNorm = composerNorm;
  }
}

async function getPrimaryWorkIdFromRecordingId(recId) {
  if (recToWorkId.has(recId)) return recToWorkId.get(recId);

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