# MusicBrainz Release Viewer (experimental)

A lightweight, read-only web viewer for exploring MusicBrainz releases with a focus on
**recordings, works, performers, composers, and recording-level technical credits**.

The project is experimental and intended as a **UI / data-exploration prototype**, not as a replacement for MusicBrainz itself.

Live demo:  
👉 https://hildgyorgy.github.io/mb-release-viewer/

---

## What this viewer tries to do

MusicBrainz contains extremely rich data, but some relationships are hard to read
when you want to **understand a release as music**, not as database entities.

This viewer experiments with a different presentation:

### 1. Track-centric reading
- Tracklist as the main entry point
- Per-track expandable details
- Clear separation of:
  - **Performers** (recording → artist, instruments / vocals)
  - **Creators** (work → composer / lyricist / librettist)
  - **Work hierarchy** (work → part-of relations)

### 2. Recording-level technical credits
A separate **Recordings** view collects *non-musical* relationships per recording, such as:
- producer
- recording / mastering engineer
- recording location
- recording dates
- and other organizational / technical relations

These are intentionally separated from performers and composers.

### 3. Work hierarchy without title heuristics
Work hierarchy is built **only** from MusicBrainz work-to-work relations  
(`parts / part of`), without parsing track titles.

---

## What this viewer does NOT try to do

- No editing or submission to MusicBrainz
- No Discogs-style shopping / streaming links
- No account system
- No attempt to show *all* MB relationships

This is intentionally a **narrow, opinionated view**.

---

## Data sources

All data is fetched live from the official MusicBrainz APIs:

- MusicBrainz Web Service v2
- Cover Art Archive (optional)

No data is stored, tracked, or modified.

---

## Technical notes

- Plain HTML / CSS / vanilla JavaScript
- No frameworks
- No backend
- GitHub Pages hosting
- Read-only API usage

The code is intentionally kept simple and hackable.

---

## Status

Experimental / work in progress.

The structure, terminology, and layout are still evolving.
Feedback from the MusicBrainz community is very welcome.

---

## Feedback & discussion

If you have suggestions, corrections, or strong opinions about:
- role separation (performer vs creator vs technical roles)
- work hierarchy presentation
- missing or misinterpreted relationships

please comment on the MusicBrainz forum thread.

---

## Author

György Hild  
Architect / university lecturer  
MusicBrainz user experimenting with alternative UI ideas

This project is non-commercial and created purely out of curiosity.
