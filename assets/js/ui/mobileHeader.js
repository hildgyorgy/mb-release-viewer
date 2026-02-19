// ui/mobileHeader.js
// Mobile collapsible header controller (Music-app-ish)
// - default: closed when a release is loaded
// - opens on "intent" (tap/ focus)
// - auto-closes on inactivity OR after successful load

const MOBILE_BP = 640;

function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BP}px)`).matches;
}

export function createMobileHeaderController({
  getRoot = () => document.documentElement,
  getTop = () => document.querySelector(".top"),
  getOmni = () => document.getElementById("omni"),
  getResults = () => document.getElementById("results"),
  idleMs = 5000,
} = {}) {
  let idleTimer = null;
  let open = false;
  let suppressIdle = false; // true while user is interacting w/ dropdown

  const root = getRoot();

  function setState(nextOpen) {
    open = !!nextOpen;
    root.dataset.hdr = open ? "open" : "closed";
  }

  function clearIdle() {
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = null;
  }

  function armIdle() {
    clearIdle();
    if (!isMobile()) return;
    if (!open) return;
    if (suppressIdle) return;

    idleTimer = window.setTimeout(() => {
      // only close if we still aren't interacting
      if (!suppressIdle) close();
    }, idleMs);
  }

  function poke() {
    // call on any “activity” (typing / moving in dropdown)
    if (!isMobile()) return;
    if (!open) return;
    armIdle();
  }

  function openHeader() {
    if (!isMobile()) return;
    setState(true);
    armIdle();
  }

  function close() {
    if (!isMobile()) return;
    suppressIdle = false;
    clearIdle();
    setState(false);
  }

  function onReleaseLoaded() {
    // policy: whenever a release is loaded -> header should be closed
    close();
  }

  function bind() {
    // default state on init
    // If a release is already rendered, start closed; otherwise open.
    // (You can simplify this later if you prefer always closed.)
    const hasRelease = !!document.querySelector("#out .row");
    setState(hasRelease ? false : true);

    // Tap on the top bar (grabber area) opens
    const top = getTop();
    top?.addEventListener("pointerdown", () => {
      if (!isMobile()) return;
      if (!open) openHeader();
      else poke();
    });

    // Focusing the input should open (intent)
    const omni = getOmni();
    omni?.addEventListener("focus", () => {
      if (!isMobile()) return;
      openHeader();
    });

    // Any typing / paste resets idle
    omni?.addEventListener("input", poke);
    omni?.addEventListener("keydown", poke);
    omni?.addEventListener("paste", poke);

    // Dropdown interaction should *pause* the idle close
    const res = getResults();
    const enterDropdown = () => {
      if (!isMobile()) return;
      suppressIdle = true;
      clearIdle();
    };
    const leaveDropdown = () => {
      if (!isMobile()) return;
      suppressIdle = false;
      armIdle();
    };

    // Desktop hover doesn't exist on touch, but pointer events cover both
    res?.addEventListener("pointerdown", enterDropdown);
    res?.addEventListener("pointermove", enterDropdown);
    res?.addEventListener("scroll", enterDropdown, { passive: true });

    // When user clicks a result, SearchController will navigate;
    // we still re-arm idle (in case load fails and header remains open).
    res?.addEventListener("click", () => {
      suppressIdle = false;
      armIdle();
    });

    // Clicking outside the search should let idle resume
    document.addEventListener("pointerdown", (e) => {
      if (!isMobile()) return;

      const omniNow = getOmni();
      const resNow = getResults();
      const searchWrap = omniNow?.closest(".search") || omniNow?.parentElement;

      const inSearch =
        (searchWrap && searchWrap.contains(e.target)) ||
        (resNow && resNow.contains(e.target));

      if (!inSearch) {
        suppressIdle = false;
        armIdle();
      }
    });
  }

  return Object.freeze({
    bind,
    open: openHeader,
    close,
    poke,
    onReleaseLoaded,
  });
}