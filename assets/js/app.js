/* ============================================================
   App entry (ES modules)
   ============================================================ */

import { bootFromUrl } from "./core/boot.js";
import { createReleaseNavigator } from "./services/navigation.js";
import { applyTheme, getPreferredTheme } from "./ui/theme.js";
import { createSearchController } from "./ui/searchController.js";

import { loadRelease } from "./services/api.js";
import { renderReleasePage } from "./features/releasePage.js";

// ------------------------------
// Loading / navigation
// ------------------------------

async function goFallback() {
  // korábbi “go()” fallback – most no-op
  return;
}

// ------------------------------
// App init
// ------------------------------
export const App = Object.freeze({
  init() {
    applyTheme(getPreferredTheme());

const Nav = createReleaseNavigator({
  getOut: () => document.getElementById("out"),
  loadRelease,
  renderReleasePage,
});

const Search = createSearchController({
  onGoByMbid: Nav.goByMbid,
  onGoFallback: goFallback,
});
Search.init();

bootFromUrl({ onGoByMbid: Nav.goByMbid });
  },
});

document.addEventListener("DOMContentLoaded", App.init);