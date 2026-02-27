import { $ } from "../core/util.js";
import { ICON_MOON, ICON_SUN } from "./icons.js";

const THEME_STORAGE_KEY = "mb_theme";

export function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_STORAGE_KEY, t);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = t === "dark" ? ICON_SUN : ICON_MOON;
    btn.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
    btn.setAttribute("aria-label", btn.title);
  }
}

export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}

export function bindThemeToggleOnce(root = document) {
  const btn = $("#themeToggle", root);
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", toggleTheme);

  applyTheme(document.documentElement.dataset.theme || getPreferredTheme());
}