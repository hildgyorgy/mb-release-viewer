import { STATE } from "../core/state.js";

let __lbBound = false;

export function ensureLightboxOnce() {
  let lb = document.getElementById("lb");
  if (lb) return lb;

  lb = document.createElement("div");
  lb.id = "lb";
  lb.className = "lb";
  lb.innerHTML = `
    <div class="lb-ui" style="
      position:absolute; inset:0; display:grid; place-items:center; padding:24px;
      pointer-events:none;
    ">
      <button id="lbPrev" type="button" aria-label="Previous cover"
        style="pointer-events:auto; position:absolute; left:14px; top:50%; transform:translateY(-50%);
               width:40px; height:40px; border-radius:999px; border:0; background:rgba(0,0,0,.35);
               color:#fff; cursor:pointer; display:grid; place-items:center; z-index:3;">
        ‹
      </button>
      <button id="lbNext" type="button" aria-label="Next cover"
        style="pointer-events:auto; position:absolute; right:14px; top:50%; transform:translateY(-50%);
               width:40px; height:40px; border-radius:999px; border:0; background:rgba(0,0,0,.35);
               color:#fff; cursor:pointer; display:grid; place-items:center; z-index:3;">
        ›
      </button>

      <div id="lbCount"
        style="pointer-events:none; position:absolute; bottom:14px; left:50%; transform:translateX(-50%);
               font-size:12px; color:#fff; opacity:.85; background:rgba(0,0,0,.35);
               padding:6px 10px; border-radius:999px;">
      </div>

      <img id="lbImg" alt="" style="pointer-events:auto; position:relative; z-index:1;">
    </div>
  `;
  document.body.appendChild(lb);

  // Click background OR image closes
  lb.addEventListener("click", (e) => {
    if (e.target === lb || e.target.id === "lbImg") closeLightbox();
  });

  // ESC closes (bound once)
  if (!__lbBound) {
    __lbBound = true;

    document.addEventListener("keydown", (e) => {
      const open = document.getElementById("lb")?.classList.contains("is-open");
      if (!open) return;

      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowLeft") { e.preventDefault(); lbPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); lbNext(); }
      else if (e.key === "n") { e.preventDefault(); lbNext(); }
      else if (e.key === "N") { e.preventDefault(); lbPrev(); }
    });
  }

  const img = lb.querySelector("#lbImg");
  img?.addEventListener("pointerup", (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  lb.querySelector("#lbPrev")?.addEventListener("click", (e) => { e.stopPropagation(); lbPrev(); });
  lb.querySelector("#lbNext")?.addEventListener("click", (e) => { e.stopPropagation(); lbNext(); });

  // Wheel navigation (throttled)
  let wheelLock = false;
  lb.addEventListener("wheel", (e) => {
    const open = lb.classList.contains("is-open");
    if (!open) return;
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 120);

    if (Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    if (e.deltaY > 0) lbNext();
    else lbPrev();
  }, { passive: false });

  // Basic swipe (touch) navigation
  let sx = 0, sy = 0, touching = false;
  lb.addEventListener("touchstart", (e) => {
    if (!lb.classList.contains("is-open")) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    touching = true;
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });

  lb.addEventListener("touchend", (e) => {
    if (!touching) return;
    touching = false;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) lbNext();
      else lbPrev();
    }
  }, { passive: true });

  return lb;
}

export function updateLightboxUI() {
  const lb = document.getElementById("lb");
  if (!lb) return;
  const img = document.getElementById("lbImg");
  const count = document.getElementById("lbCount");
  if (!img || !count) return;

  const item = STATE.cover.gallery[STATE.cover.index] || null;
  if (!item) return;

  img.src = item.full || item.large || item.thumb || "";
  img.alt = item.alt || "Cover";

  const n = STATE.cover.gallery.length;
  count.textContent = n > 1 ? `${STATE.cover.index + 1} / ${n}` : "";

  const prev = lb.querySelector("#lbPrev");
  const next = lb.querySelector("#lbNext");
  if (prev) prev.style.display = n > 1 ? "grid" : "none";
  if (next) next.style.display = n > 1 ? "grid" : "none";
}

export function openLightboxAt(index = 0) {
  const lb = ensureLightboxOnce();
  const n = STATE.cover.gallery.length;
  STATE.cover.index = n ? ((index % n) + n) % n : 0;

  updateLightboxUI();

  lb.classList.remove("is-open");
  requestAnimationFrame(() => lb.classList.add("is-open"));
  document.body.style.overflow = "hidden";
}

export function closeLightbox() {
  const lb = document.getElementById("lb");
  if (!lb) return;
  lb.classList.remove("is-open");
  document.body.style.overflow = "";
}

export function lbNext() {
  const n = STATE.cover.gallery.length;
  if (n <= 1) return;
  STATE.cover.index = (STATE.cover.index + 1) % n;
  updateLightboxUI();
}

export function lbPrev() {
  const n = STATE.cover.gallery.length;
  if (n <= 1) return;
  STATE.cover.index = (STATE.cover.index - 1 + n) % n;
  updateLightboxUI();
}