# Xeno Siege

An alien sci-fi tower defense game. The swarm pours out of a rift and marches down the lane toward your base. Build towers along the way to stop them.

**Play / install:** https://gbuckle10.github.io/xeno-siege/

## Installing it as an app

It's a Progressive Web App, so there's no app store involved and it works offline once installed.

- **Android (Chrome):** open the link, then tap **⋮ → Install app** (or "Add to Home screen"). It gets its own icon and opens full screen. Play with the phone sideways for the best layout.
- **PC (Chrome or Edge):** open the link and click the install icon at the right end of the address bar (or the **⬇ Install as app** button in the game's side panel). It opens in its own window and shows up in the Start menu.
- **iPhone/iPad (Safari):** Share → **Add to Home Screen**.

Installed copies update themselves the next time they're opened online.

## How to play

| | |
|---|---|
| **Build** | Pick a tower (or press 1–4), then click an empty tile. Hold Shift to place several. |
| **Upgrade / sell** | Click a placed tower. Towers go up to level 3; selling refunds 70%. |
| **Waves** | Press **Launch Wave** (or Space). Calling the next wave early earns bonus credits. |
| **Other keys** | Esc / right-click cancels, P pauses, U upgrades the selected tower. |

### Towers
| Tower | Cost | Role |
|---|---|---|
| Pulse Laser | 50 | Fast single-target beam. Armor soaks a lot of each hit. |
| Plasma Mortar | 90 | Slow lobbed shells with splash damage. |
| Cryo Field | 70 | Slows every alien in range. |
| Arc Coil | 130 | Chain lightning that ignores armor. |

### Aliens
Skitters (fast, fragile), Grunts (standard), Shellbacks (armored, slow), and a Hive Queen boss every 10th wave. Every 5th wave starting at wave 3 is a Skitter swarm.

## Project layout

```
index.html              the whole game (HTML + CSS + JavaScript, no build step)
manifest.webmanifest    app name, icons, display mode for installing
sw.js                   service worker: offline support and updates
icons/                  app icons
fonts/                  Orbitron and Rajdhani (SIL Open Font License)
```

To run locally, serve the folder with any static server, e.g. `python3 -m http.server`, then open http://localhost:8000. Opening `index.html` directly also works, but the install/offline features need a server.

**Releasing a change:** edit, then bump `VERSION` in `sw.js` so installed copies refresh their cache, commit, and push. GitHub Pages redeploys automatically.
