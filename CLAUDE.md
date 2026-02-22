# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with hot reload
- `npm run build` — Production build (outputs to `dist/`)
- `npm run preview` — Preview production build locally

No tests or linter configured.

## Stack

Vite 5 + Three.js 0.170, ES modules, static site. Change `CONFIG.username` in `src/main.js` to switch GitHub user.

## Architecture

```
main.js (CONFIG, scene/renderer, game loop, raycaster, collision)
├── github.js    — GitHub REST API + raw.githubusercontent.com + jogruber.de contributions proxy
├── lobby.js     — InstancedMesh contribution graph (52×7), 3D username text, walls/columns
├── museum.js    — hallway + per-repo rooms (walls, panels, neon signs, README/file-tree lazy loading)
├── controls.js  — PointerLockControls WASD wrapper (no collision built-in)
├── ui.js        — loading bar, instructions overlay, tooltip, minimap
└── materials.js — material cache (Map-based), LANG_COLORS, LEVEL_COLORS, marble textures
```

**Spatial layout:** Lobby at Z > 0 (player starts Z ≈ 11 facing Z=0). Museum hallway runs in −Z. Rooms alternate left/right (±X) off hallway, spaced every `hallLength` units. Room width scales with star count.

**Data flow:** `fetchAllData()` → repos/languages/contributions → `buildLobby()` + `buildMuseum()` → game loop. README + file tree lazy-load on room entry via `getPlayerRoom()` camera bounds check.

## Key Patterns

- **Wall collision:** All wall meshes tagged `userData.isWall = true`. World-space `Box3` AABBs collected at init. Circle-vs-AABB resolution runs 3 iterations/frame in XZ plane (radius 0.35).
- **Canvas textures:** Used for README panels, file tree, info cards, language bars, neon signs. Use `MeshBasicMaterial` (unaffected by scene lighting). Set `texture.needsUpdate = true` after drawing.
- **Material cache:** `materials.js` caches via string-keyed `Map`. Marble textures use procedural canvas with veins + tile grout.
- **Lazy loading guards:** `room.readmeLoaded` / `room.fileTreeLoaded` flags set before fetch to prevent double-loading.
- **README fetch:** Uses `raw.githubusercontent.com` (no API rate limit) trying multiple filename variants. File tree uses Contents API.
- **Portal tooltips:** Portal meshes stored in `portalMeshes[]` for raycaster. Distance threshold 8 units.

## Gotchas

- `InstancedMesh.instanceColor` must be initialized before `needsUpdate = true`
- `PointerLockControls.getObject()` returns the camera — add THAT to scene
- Vite doesn't like complex inline ternary expressions with `new` calls inside args
- GitHub unauthenticated API limit: 60 req/hr. Initial load uses ~22 calls (repos + languages). README uses raw CDN to avoid this.
- Room inner side wall has a doorway cutout (constants `INNER_DOOR_W`/`INNER_DOOR_H` in museum.js) — the only entry point per room
