/* ============================================================
   App entry (ES modules)
   ============================================================ */

import { bootFromUrl } from "./core/boot.js";
import { createReleaseNavigator } from "./services/navigation.js";
import { applyTheme, getPreferredTheme } from "./ui/theme.js";
import { createSearchController } from "./ui/searchController.js";

import { loadRelease } from "./services/api.js";
import { renderReleasePage } from "./features/releasePage.js";

import { createMobileHeaderController } from "./ui/mobileHeader.js";

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

const MobileHdr = createMobileHeaderController();
MobileHdr.bind();

const goByMbidWrapped = async (mbid) => {
  await Nav.goByMbid(mbid);
  MobileHdr.onReleaseLoaded();
};

const Search = createSearchController({
  onGoByMbid: goByMbidWrapped,
  onGoFallback: goFallback,
});
Search.init();

bootFromUrl({ onGoByMbid: goByMbidWrapped });
  },
});

document.addEventListener("DOMContentLoaded", App.init);