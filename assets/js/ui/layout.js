import { CONFIG } from "../core/config.js";
import { $ } from "../core/util.js";

let coverSizerBound = false;

export function isMobileLayout() {
  return window.matchMedia(`(max-width: ${CONFIG.MOBILE_BP}px)`).matches;
}

export function lockCoverSquareToTabs(root = document) {
  const cover = $(".cover", root);
  const box = $(".cover-box", root);
  const navRow = $(".cover-nav-row", root);
  const tabs = $("#tabs", root);
  if (!cover || !box || !navRow || !tabs) return;

  const w = Math.ceil(tabs.getBoundingClientRect().width);
  cover.style.width = w + "px";
  navRow.style.width = w + "px";
  box.style.width = w + "px";
  box.style.height = w + "px";
}

export function positionThemeToggle(root = document) {
  const row = $(".row", root);
  const main = $(".main", root);
  const tabs = $("#tabs", root);
  const btn = $("#themeToggle", root);
  if (!row || !main || !tabs || !btn) return;

  const rowRect = row.getBoundingClientRect();
  const mainRect = main.getBoundingClientRect();
  const tabsRect = tabs.getBoundingClientRect();

  const bw = btn.offsetWidth || 38;
  const bh = btn.offsetHeight || 38;

  const x = (mainRect.left - rowRect.left) - bw / 2 + 15;
  const y = (tabsRect.top - rowRect.top) + (tabsRect.height - bh) / 2;

  btn.style.left = `${Math.round(x)}px`;
  btn.style.top = `${Math.round(y)}px`;
}

export function clearInlineLayout(root = document) {
  const cover = $(".cover", root);
  const box = $(".cover-box", root);
  const navRow = $(".cover-nav-row", root);
  const btn = $("#themeToggle", root);

  cover?.style.removeProperty("width");
  box?.style.removeProperty("width");
  box?.style.removeProperty("height");
  navRow?.style.removeProperty("width");

  btn?.style.removeProperty("left");
  btn?.style.removeProperty("top");
}

export function layoutSync(root = document) {
  if (isMobileLayout()) {
    clearInlineLayout(root);
    return;
  }
  lockCoverSquareToTabs(root);
  positionThemeToggle(root);
}

export function bindCoverSizerOnce() {
  if (coverSizerBound) return;
  coverSizerBound = true;

  const rerun = () => {
    const out = document.getElementById("out");
    if (!out) return;
    layoutSync(out);
  };

  window.addEventListener("resize", rerun);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(rerun);
  }
}