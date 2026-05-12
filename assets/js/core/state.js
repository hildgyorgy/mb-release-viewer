export const STATE = {
  search: {
    open: false,
    items: [],
    active: 0,
    req: 0,
  },
  cover: {
    gallery: [],
    index: 0,
    lightboxBound: false,
  },
  views: {
    versionsBuilt: false,
  },
};

// Set to true to log state changes to the console
export const DEBUG_STATE = false;

function log(tag) {
  if (!DEBUG_STATE) return;
  console.log(`[STATE] ${tag}`, JSON.parse(JSON.stringify(STATE)));
}

export function setSearchState(patch) {
  Object.assign(STATE.search, patch);
  log("search");
}

export function setCoverState(patch) {
  Object.assign(STATE.cover, patch);
  log("cover");
}

export function setViewsState(patch) {
  Object.assign(STATE.views, patch);
  log("views");
}