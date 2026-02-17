import { $, } from "../core/util.js";
import { STATE } from "../core/state.js";
import { isMobileLayout } from "./layout.js";
import { openLightboxAt } from "./lightbox.js";

export function bindCoverGalleryOnce(root = document) {
  const img = $("#coverImg", root);
  const box = $(".cover-box", root);
  if (!img || !box || box.dataset.covBound === "1") return;
  box.dataset.covBound = "1";

  // mode-specific listeners via AbortController
  let mode = ""; // "mobile" | "desktop"
  let ctrl = null;

  let badge = null;

  const ensureBadge = () => {
    if (badge) return badge;
    badge = box.querySelector(".cov-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "cov-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.style.cssText = `
        position:absolute; right:10px; bottom:10px;
        font-size:12px; padding:6px 10px; border-radius:999px;
        background:rgba(0,0,0,.35); color:#fff; opacity:.9;
        pointer-events:none;
      `;
      box.style.position = "relative";
      box.appendChild(badge);
    }
    return badge;
  };

  const setCoverToIndex = () => {
    const it = STATE.cover.gallery[STATE.cover.index] || null;
    if (!it) return;
    img.src = it.large || it.full || it.thumb || "";
    img.alt = it.alt || "Cover";
  };

  const updateBadge = () => {
    const b = ensureBadge();
    const n = STATE.cover.gallery.length;
    b.textContent = n > 1 ? `${STATE.cover.index + 1} / ${n}` : "";
  };

  const bindMobile = (signal) => {
    if (!STATE.cover.gallery.length) return;

    setCoverToIndex();
    updateBadge();

    let sx = 0, sy = 0, touching = false;

    box.addEventListener("touchstart", (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      touching = true;
      sx = t.clientX;
      sy = t.clientY;
    }, { passive: true, signal });

    box.addEventListener("touchend", (e) => {
      if (!touching) return;
      touching = false;

      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - sx;
      const dy = t.clientY - sy;

      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        const n = STATE.cover.gallery.length;
        if (n <= 1) return;

        if (dx < 0) STATE.cover.index = (STATE.cover.index + 1) % n;
        else STATE.cover.index = (STATE.cover.index - 1 + n) % n;

        setCoverToIndex();
        updateBadge();
      }
    }, { passive: true, signal });

    // tap cycles
    box.addEventListener("click", () => {
      const n = STATE.cover.gallery.length;
      if (n <= 1) return;
      STATE.cover.index = (STATE.cover.index + 1) % n;
      setCoverToIndex();
      updateBadge();
    }, { signal });
  };

  const bindDesktop = (signal) => {
    if (!STATE.cover.gallery.length) return;

    const frontIdx = STATE.cover.gallery.findIndex((x) => x.front);
    STATE.cover.index = frontIdx >= 0 ? frontIdx : 0;
    setCoverToIndex();

    const desktopHandler = () => {
      if (!STATE.cover.gallery.length) return;
      openLightboxAt(STATE.cover.index || 0);
    };

    box.addEventListener("click", desktopHandler, { signal });
    img.style.cursor = "zoom-in";

    if (badge) badge.textContent = "";
  };

  const applyMode = () => {
    const want = isMobileLayout() ? "mobile" : "desktop";
    if (want === mode) return;
    mode = want;

    if (ctrl) ctrl.abort();
    ctrl = new AbortController();

    if (mode === "mobile") bindMobile(ctrl.signal);
    else bindDesktop(ctrl.signal);
  };

  applyMode();
  window.addEventListener("resize", applyMode);
}