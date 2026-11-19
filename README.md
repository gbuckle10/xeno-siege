# Xeno Siege

A 3D alien swarm tower defense game. Hundreds of aliens pour out of a rift and march down the lane toward your base. Build and upgrade towers to stop them.

**Play / install:** https://gbuckle10.github.io/xeno-siege/

## Installing it as an app

It's a Progressive Web App: no app store, and it works offline once installed.

- **Android (Chrome):** open the link, then **⋮ → Install app**. Opens full screen in landscape.
- **PC (Chrome or Edge):** open the link and click the install icon in the address bar, or the **⬇ Install as app** button in the side panel.
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.

Installed copies update themselves the next time they're opened online.

## How to play

| | |
|---|---|
| **Build** | Pick a tower (or press 1–5), then tap/click an empty pad. Hold Shift to place several. |
| **Upgrade** | Tap a placed tower. Level 1 → Level 2 → **choose a specialization** → Mk II. Upgrading takes a few seconds and the tower stops firing until it finishes. |
| **Sell** | Tap a tower → Sell (70% refund). |
| **Waves** | **Launch Wave** (or Space). Calling the next wave early earns bonus credits. |
| **Camera** | Drag (or arrow keys / WASD) to pan, scroll wheel or pinch to zoom, ⤢ to see the whole map. |
| **Other** | Esc / right-click cancels, P pauses, U upgrades the selected tower, **Gfx** switches High/Low graphics. |

### Towers and specializations

| Tower | Cost | Base role | Specialization A | Specialization B |
|---|---|---|---|---|
| Gatling Turret | 60 | Rapid-fire single target | **Minigun**: sprays the whole swarm | **Railgun**: pierces every alien in a line, ignores armor |
| Plasma Mortar | 100 | Splash damage | **Cluster Bombard**: shells burst into bomblets | **Singularity Shell**: black hole holds aliens, then detonates |
| Cryo Field | 80 | Slows everything in range | **Absolute Zero**: chance to freeze solid | **Shatter Field**: chilled aliens take extra damage |
| Arc Coil | 140 | Chain lightning, ignores armor | **Storm Coil**: forks through huge chunks of the swarm | **Ion Lance**: continuous beam that ramps up, locks onto the toughest target |
| Missile Battery | 160 | Homing missile salvos | **Hydra Pods**: huge salvos, one alien each | **Tactical Nuke**: one giant warhead at the densest cluster |

### Aliens
- **Skitter:** tiny, fast, arrives in hundreds.
- **Grunt:** the standard foot soldier.
- **Shellback:** slow and armored. Armor soaks bullets, splash and missiles.
- **Brood Sac:** bursts into 8 Skitters when killed.
- **Hive Queen:** a boss every 10th wave.

Every 5th wave starting at wave 3 is a **mega swarm**.

## Project layout

```
index.html              page layout and styles
js/game.js              game rules: towers, aliens, waves, upgrades (no graphics, runs in Node too)
js/view.js              3D rendering with Three.js: instanced aliens, effects, camera
js/models.js            3D models for aliens and every tower form, built from simple shapes
js/main.js              game loop, mouse/touch input, side panel, install prompt
vendor/three.bundle.js  Three.js + bloom post-processing, bundled (MIT licence in vendor/)
tools/balance.mjs       balance bot: plays the game headlessly and reports per wave
manifest.webmanifest    app name, icons, display mode for installing
sw.js                   service worker: offline support and updates
icons/  fonts/          app icons; Orbitron and Rajdhani fonts (SIL Open Font License)
```

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000.

**Balance testing:** `node tools/balance.mjs [seed]` runs a scripted player through the waves and prints shields, credits, tower levels and peak alien count per wave.

**Releasing a change:** edit, bump `VERSION` in `sw.js` so installed copies refresh, commit, push. GitHub Pages redeploys automatically.
