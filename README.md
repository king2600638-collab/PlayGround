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

An original open-world creature-taming shooter built with Three.js. Rift energy has cracked the island of Verdant Rift: wild Anima roam the groves and ridges, Hollow stalkers guard the ruins, and a Rift Warden holds the gate. Choose a starter, build a pack, evolve it, break the Warden, and seal the breach.

The creature loop is Pokémon-inspired — starters, a ten-species roster, elemental types, evolution, a species codex, and a three-Anima party — but every Anima, model, name, weapon, and location is original to Wildline.

### Highlights

- **Open world:** a hand-built island with landmarks, floating islands, roaming wildlife, camps, and ruins.
- **Three starters:** choose **Sprigbyte** (Nature), **Cinderkit** (Ember), or **Rivulet** (Aqua). Each starter counts as your first bond and evolves through bond and battle.
- **Ten Anima species:** Nature, Ember, Aqua, Volt, Void, Earth, Gale, Frost, and Lumen creatures with distinct models, stats, rarities, moves, and evolution paths.
- **Creature bonding:** shoot an Anima down to roughly a third of its vitality, then spend a Prism Orb to bind it. Bound Anima follow you, fight beside you, and can be rallied, petted, swapped, and evolved.
- **Type matchups:** attacks deal **1.55×** damage against a weakness and **0.7×** against a resistance. Weapon elements and companion moves both use the chart.
- **Anima Codex:** press **B** to open the ten-entry species archive. Entries unlock as you see and bond species, with type, rarity, weakness, bio, and evolution data.
- **Three camera modes:** first-person gunner, third-person overwatch, and second-person "bond sight" that looks through your active Anima's eyes.
- **Four original weapons:** VX-9 Havoc rifle (Kinetic), Manticore-12 shotgun (Ember), Sidewinder .45 pistol (Volt), and the Rift Cleaver (Void).
- **Rift mission:** a four-step objective chain that ends with the Warden fight and the gate seal, plus a results screen with run stats.
- **Touch-ready:** a mobile HUD and on-screen stick/fire/bind/camera/codex/interact controls for phones and tablets.

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
| Anima Codex | `B` |
| Field stim | `Q` |
| Map | `M` |
| Pause | `Esc` or `P` |

Touch devices get a movement stick, drag-to-look area, and FIRE / BIND / INTERACT / CAMERA / CODEX buttons. The codex is also reachable from the field-intel panel.

### Creature system

- **Starter trial:** the run begins with a three-card starter choice. The chosen Anima joins at level 6 and carries a head start on bond.
- **Type chart:** Nature resists Aqua/Earth; Ember beats Nature/Frost; Aqua beats Ember/Earth; Volt beats Aqua/Gale/Void; Frost beats Gale/Nature/Earth; Lumen beats Void; Earth beats Volt/Ember. The target card shows the current target's weakness.
- **Evolution:** raise a companion's bond and level. At roughly 90+ bond and the species evolution level, the next interaction triggers evolution into its apex form, with higher stats, a new move, and a larger model.
- **Encounter variety:** each species has its own spawn location, rarity, movement style, attack range, elemental projectile color, and codex entry. Wild creatures respawn after a cooldown.

### Tech

- Three.js is vendored under `vendor/three/`; the game runs directly from `index.html`, `style.css`, and `game.js`.
- Every creature, weapon, icon, and model is generated in code. No official Pokémon or *Blood Strike* assets are included.
- No network calls or external game assets are required at runtime.


