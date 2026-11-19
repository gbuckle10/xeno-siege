# Xeno Siege

A 3D alien swarm tower defense game. Hundreds of aliens pour out of a rift and march down the lane toward your base. Build and upgrade towers to stop them.

**Play / install:** https://gbuckle10.github.io/xeno-siege/

## Installing it as an app

It's a Progressive Web App: no app store, and it works offline once installed.

- **Android (Chrome):** open the link, then **⋮ → Install app**. Opens full screen in landscape.
- **PC (Chrome or Edge):** open the link and click the install icon in the address bar, or the **⬇ Install as app** button in the side panel.
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.

Installed copies update themselves the next time they're opened online.

## Maps

Pick a map on the home screen. Each one keeps its own best score.

| Map | Difficulty | Layout |
|---|---|---|
| The Spiral | Easy | One very long lane coiling inward to a base in the centre |
| Rift Valley | Normal | A single winding lane (the original map) |
| Twin Rifts | Hard | Two rifts whose lanes merge halfway |
| Hive Breach | Brutal | Three rifts converging on a short run to the base |

### Map editor
**＋ Create a map** on the home screen opens the editor:
- Pick a size, tap a tile to place your **base**, then draw **lanes**: tap an edge tile where the rift should be, then tap turn points (straight lines or L-turns). End a lane on the base, or on another lane to merge into it.
- Set **wave rules**: swarm size, alien toughness and speed, starting credits and shields, how often Hive Queens and mega swarms appear, which aliens show up, the wave timer, and an optional "win after wave N" goal.
- **Test play**, **Save** (it appears under *Your maps*), or **Copy share code** to send it to someone. They paste it under *Import map code*.

Adding a built-in map: add an entry to `MAPS` in `js/game.js` (lanes are lists of `[col, row]` waypoints that start just outside the grid and end on the base tile), then run `node tools/balance.mjs <mapId>` and adjust `hpScale` until it lands where you want.

## How to play

| | |
|---|---|
| **Build** | Pick a tower (or press 1–5), then tap/click an empty pad. Hold Shift to place several. |
| **Upgrade** | Tap a placed tower. Level 1 → Level 2 → **choose a specialization** → Mk II. Upgrading takes a few seconds and the tower stops firing until it finishes. |
| **Sell** | Tap a tower → Sell (70% refund). |
| **Waves** | **Launch Wave** (or Space) starts the game. After that a timer brings each next wave automatically; calling it early pays a bonus. |
| **Sunlance** | Tap it (or press F), then tap the map: a beam fires across the whole map in that direction. Optional auto-fire along your last shot. |
| **Powers** | Kills and wave clears charge **Energy**. Spend it on powers (buttons bottom-left, or keys Z X C V B). |
| **Camera** | Drag (or arrow keys / WASD) to pan, scroll wheel or pinch to zoom, ⤢ to see the whole map. |
| **Other** | Esc cancels or opens the menu, right-click cancels, P pauses, U upgrades the selected tower, **Gfx** switches High/Low graphics. **☰ Menu** to restart or quit to the home screen. |

### Towers and specializations

| Tower | Cost | Base role | Specialization A | Specialization B |
|---|---|---|---|---|
| Gatling Turret | 60 | Rapid-fire single target | **Minigun**: sprays the whole swarm | **Railgun**: pierces every alien in a line, ignores armor |
| Plasma Mortar | 100 | Splash damage | **Cluster Bombard**: shells burst into bomblets | **Singularity Shell**: black hole holds aliens, then detonates |
| Cryo Field | 80 | Slows everything in range | **Absolute Zero**: chance to freeze solid | **Shatter Field**: chilled aliens take extra damage |
| Arc Coil | 140 | Chain lightning, ignores armor | **Storm Coil**: forks through huge chunks of the swarm | **Ion Lance**: continuous beam that ramps up, locks onto the toughest target |
| Missile Battery | 160 | Homing missile salvos | **Hydra Pods**: huge salvos, one alien each | **Tactical Nuke**: one giant warhead at the densest cluster |
| Sunlance | 220 | You aim it: a map-wide beam, long cooldown | **Prism Splitter**: a fan of 3 (Mk II: 5) beams | **Scorch Line**: leaves a burning strip on the ground |

Mortars and Cryo Fields can't hit flying Wasps; every other tower can.

### Powers
| Power | Energy | Cooldown | Effect |
|---|---|---|---|
| Meteor Shower | 35 | 18s | 14 meteors pound a small area |
| Orbital Strike | 50 | 30s | After a 1.2s charge, a beam from orbit hits one spot very hard |
| Stasis Field | 35 | 25s | Freezes aliens in an area for 4s (bosses are slowed) |
| Overdrive | 60 | 45s | All towers fire twice as fast for 8s |
| Repair Drones | 70 | 60s | Restores 20 shields |

Power damage scales with the wave so they stay useful.

### Aliens
- **Skitter:** tiny, fast, arrives in hundreds.
- **Grunt:** the standard foot soldier.
- **Shellback:** slow and armored. Armor soaks bullets, splash and missiles.
- **Brood Sac:** bursts into 8 Skitters when killed.
- **Wasp** (wave 4+): flies straight from the rift to your base, ignoring the lanes.
- **Warden** (wave 5+): projects a shield that halves damage to nearby aliens. Kill it first.
- **Hive Queen:** a boss every 10th wave.

Every 5th wave is a **mega swarm**. As waves go on, aliens get more numerous, faster and more armored, and the timer between waves gets shorter.

## Project layout

```
index.html              page layout and styles
js/game.js              game rules: maps, towers, aliens, waves, upgrades (no graphics, runs in Node too)
js/view.js              3D rendering with Three.js: instanced aliens, effects, camera
js/models.js            3D models for aliens and every tower form, built from simple shapes
js/main.js              home screen + demo battle, game loop, input, side panel, power bar, menus
js/editor.js            map editor, wave rules, saving and share codes
vendor/three.bundle.js  Three.js + bloom post-processing, bundled (MIT licence in vendor/)
tools/balance.mjs       balance bot: plays the game headlessly and reports per wave
manifest.webmanifest    app name, icons, display mode for installing
sw.js                   service worker: offline support and updates
icons/  fonts/          app icons; Orbitron and Rajdhani fonts (SIL Open Font License)
```

No build step. To run locally: `python3 -m http.server 8000`, then open http://localhost:8000.

**Balance testing:** `node tools/balance.mjs [mapId|all] [seed] [--verbose]` runs a scripted player (3 seeds) on each map. It reports the first wave it leaked, how many waves leaked, the share of "tense" waves (aliens got over 70% of the way to the base), and the wave it lost on. Difficulty knobs live in `TUNING`, `hpMult`, `countGrowth`, `speedGrowth` and `armorGrowth` in `js/game.js`; `--tune=hpB:1.14` overrides them for a run.

**Releasing a change:** edit, bump `VERSION` in `sw.js` so installed copies refresh, commit, push. GitHub Pages redeploys automatically.
