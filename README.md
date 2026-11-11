# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/king2600638-collab/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/king2600638-collab/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/king2600638-collab/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/king2600638-collab/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/king2600638-collab/PlayGround).
- 🛠️ [Check build runs](https://github.com/king2600638-collab/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/king2600638-collab/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/king2600638-collab).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## Wildline: Bloodrift

An original open-world creature-taming shooter built with Three.js. Rift energy has cracked the island of Verdant Rift: wild Anima roam the groves and ridges, Hollow stalkers guard the ruins, and a Rift Warden holds the gate. Weaken and bind three Anima, break the Warden, and seal the breach.

### Highlights

- **Open world:** a hand-built island with five landmarks, floating islands, roaming wildlife, camps, and ruins.
- **Creature bonding:** shoot an Anima down to roughly a third of its vitality, then spend a Prism Orb to bind it. Bound Anima follow you, fight beside you, and can be rallied or swapped.
- **Three camera modes:** first-person gunner, third-person overwatch, and second-person "bond sight" that looks through your active Anima's eyes.
- **Four original weapons:** VX-9 Havoc rifle, Manticore-12 shotgun, Sidewinder .45 pistol, and the Rift Cleaver.
- **Rift mission:** a four-step objective chain that ends with the Warden fight and the gate seal, plus a results screen with run stats.
- **Touch-ready:** a mobile HUD and on-screen stick/fire/bind/camera/interact controls for phones and tablets.

### Run

There is no build step. Serve the folder with any static web server and open it:

```bash
python3 -m http.server 3002
```

Then visit `http://localhost:3002`.

### Controls

| Action | Keyboard / Mouse |
| --- | --- |
| Move | `WASD` |
| Sprint / jump | `Shift` / `Space` |
| Aim / fire | Mouse / left click |
| Aim down sights | Right click |
| Reload | `R` |
| Switch weapon | `1`–`4` or mouse wheel |
| Bind weakened Anima | `F` |
| Interact / seal rift | `E` |
| Cycle camera | `C` |
| Rally pack / pet / swap Anima | `T` / `H` / `V` |
| Field stim | `Q` |
| Map | `M` |
| Pause | `Esc` or `P` |

Touch devices get a movement stick, drag-to-look area, and FIRE / BIND / INTERACT / CAMERA buttons.

### Tech

- Three.js is vendored under `vendor/three/`; the game runs directly from `index.html`, `style.css`, and `game.js`.
- No network calls or external game assets are required at runtime.


