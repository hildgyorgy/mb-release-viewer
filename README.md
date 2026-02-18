# MusicBrainz Release Viewer

A small, framework-free web app for reading **MusicBrainz releases**  
like a human being who actually cares about credits.

👉 https://hildgyorgy.github.io/mb-release-viewer/

---

## What this is

An alternative way to look at a release:

- Track-first layout  
- Performers separated from creators  
- Technical / production credits clearly grouped  
- Explicit work hierarchy (based strictly on MB relations)  
- “Common credits” detection across recordings  

No backend.  
No database.  
No tracking.  
No magic.

Just structured MB data.

---

## How to use

- Paste a MusicBrainz release URL or MBID  
- Or search directly  

Optional structured search:
Artist, Album

---

## Architecture

Plain HTML, CSS and vanilla ES modules.
core/       state & utilities
services/   MusicBrainz API layer
ui/         layout, theme, search, lightbox
features/   tracks / recordings
No build step.  
No dependencies.  
No excuses.

---

## Tech

- MusicBrainz Web Service v2  
- Cover Art Archive  
- GitHub Pages  

---

## Version

**v1.0.0-rc1**

Modular. Clean.  
Finally not a 2000-line single file.

---

© 2026 György Hild  
Data: MusicBrainz contributors — CC BY-NC-SA 3.0
