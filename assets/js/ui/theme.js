import { $ } from "../core/util.js";

const THEME_STORAGE_KEY = "mb_theme";

const ICON_MOON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
</svg>`;

const ICON_SUN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="4"></circle>
  <path d="M12 2v2"></path>
  <path d="M12 20v2"></path>
  <path d="M4.93 4.93l1.41 1.41"></path>
  <path d="M17.66 17.66l1.41 1.41"></path>
  <path d="M2 12h2"></path>
  <path d="M20 12h2"></path>
  <path d="M6.34 17.66l-1.41 1.41"></path>
  <path d="M19.07 4.93l-1.41 1.41"></path>
</svg>`;

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
}