import { $ } from "../core/util.js";
import { ICON_MOON, ICON_SUN } from "./icons.js";

// Session-only override: reload után null lesz (pont ez kell)
let sessionOverride = null; // "light" | "dark" | null

export function getPreferredTheme() {
  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }
}

export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || getPreferredTheme();
  sessionOverride = cur === "dark" ? "light" : "dark";
  applyTheme(sessionOverride);
}

export function bindThemeToggleOnce(root = document) {
  const btn = $("#themeToggle", root);
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", toggleTheme);

  // induláskor: rendszer (ha nincs session override)
  applyTheme(sessionOverride || getPreferredTheme());

  // Ha a rendszer téma vált futás közben, kövessük – de csak ha nincs override
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq && !mq.__mbThemeBound) {
    mq.__mbThemeBound = true;
    mq.addEventListener("change", () => {
      if (!sessionOverride) applyTheme(getPreferredTheme());
    });
  }
}