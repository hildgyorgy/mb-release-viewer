// Centralised role policy: music-first vs technical-first

export const PERFORMER_REL_TYPES = new Set([
  // already treated as performers in many UIs
  "instrument",
  "vocal",

  // your “music-first” additions
  "conductor",
  "orchestra",
  "ensemble",
  "choir",
  "concertmaster",
  "soloist",
  "narrator",
  "spoken vocals",
  "performing orchestra",
]);