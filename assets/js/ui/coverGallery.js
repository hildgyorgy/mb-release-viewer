import { $, } from "../core/util.js";
import { STATE } from "../core/state.js";
import { openLightboxAt } from "./lightbox.js"; // nálad lehet más útvonal/név

export function bindCoverGalleryOnce(root = document) {
  const img = $("#coverImg", root);
  const box = $(".cover-box", root);
  if (!img || !box || box.dataset.covBound === "1") return;
  box.dataset.covBound = "1";

  const setCoverToIndex = () => {
    const it = STATE.cover.gallery[STATE.cover.index] || null;
    if (!it) return;
    img.src = it.large || it.full || it.thumb || "";
    img.alt = it.alt || "Cover";
  };

  // keep "front" as the displayed cover initially
  const frontIdx = STATE.cover.gallery.findIndex((x) => x.front);
  STATE.cover.index = frontIdx >= 0 ? frontIdx : 0;
  setCoverToIndex();

  // one behaviour everywhere: click/tap opens lightbox
  const handler = () => {
    if (!STATE.cover.gallery.length) return;
    openLightboxAt(STATE.cover.index || 0);
  };

  box.addEventListener("click", handler);
  img.style.cursor = "zoom-in";
}