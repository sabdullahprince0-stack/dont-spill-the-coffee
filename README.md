# Don't Spill the Coffee!

**Six routes. One cup of coffee. One chance at love. And Newton's laws standing in your way.**

A first-person, 2D physics-based arcade simulation with narrative elements, developed as a collaborative college Physics project. You promised to bring your crush coffee at campus. Survive a reckless Filipino jeepney commute by balancing an open takeaway cup against acceleration, braking and potholes. The quality of your delivery determines the ending.

## Play locally

No npm packages, build tools or internet connection are required for the V0.7 baseline.

```bash
git clone https://github.com/sabdullahprince0-stack/dont-spill-the-coffee.git
cd dont-spill-the-coffee
```

Open `index.html` in Chrome or Edge, or open the folder in VS Code and use Live Server. Keep the `assets/`, `css/` and `js/` folders alongside the HTML. Direct `file://` opening works without a server or internet connection.

| Control | Action |
| --- | --- |
| A / Left arrow | Tilt left |
| D / Right arrow | Tilt right |
| R | Restart current route |
| P | Pause / resume |
| I | Toggle Physics Monitor |
| On-screen arrows | Touch / pointer tilt controls |

Sound and motion settings are available in the menu and during gameplay. Gentle, Minimal and Still motion modes do not change the simulation difficulty.

## Routes

| Route | Environment | Duration |
| --- | --- | ---: |
| 01 — The Neighborhood | Personalized Filipino neighborhood at dusk | 32 s |
| 02 — City Traffic | Urban blue hour | 38 s |
| 03 — Pothole Province | Sunny provincial road | 42 s |
| 04 — Mountain Road | Foggy highlands | 46 s |
| 05 — Highway Madness | Nighttime expressway | 48 s |
| 06 — The Jeepney Final Boss | Nighttime campus district | 55 s |

Deliver at least 40% of the coffee to pass. Each route starts with a full cup. The game stores the best result for each route locally; failed attempts cannot overwrite a successful best result. Complete all six routes successfully to unlock an ending based on the mean of their best scores.

| Grade | Coffee remaining / overall score | Ending |
| --- | --- | --- |
| S | 95–100% | The Perfect Delivery |
| A | 80% to less than 95% | A Little Closer |
| B | 60% to less than 80% | It's the Thought That Counts |
| C | 40% to less than 60% | The Friendzone |
| F | Less than 40% | Failed route; retry |

F is not an unlocked campaign ending in V0.7.

## Physics applications

| Course unit | Current implementation |
| --- | --- |
| Unit 1 — Mechanics: Motion and Newton's Laws | Vehicle speed, acceleration and distance; inertia-inspired liquid response. Newton's first law is the central gameplay concept. |
| Unit 2 — Work, Energy, and Momentum | Specific kinetic energy (J/kg) is displayed in the monitor. Explicit work and momentum calculations remain planned. |
| Unit 3 — Gravitation and Fluid Mechanics | Gravity (9.81 m/s²), effective gravity, liquid surface tilt and a simplified overflow model. |
| Unit 4 — Oscillations, Waves, and Thermodynamics | Damped liquid oscillations are simulated. Cooling is planned, not implemented. |

The simulation uses a fixed 120 Hz timestep. The fluid model is an educational approximation, not a full fluid dynamics solver. Visual splash particles are stylized, and their screen-space acceleration should not be presented as a calibrated physical measurement. Sound synthesis is primarily for atmosphere. Press I to inspect live simulation values.

## Project structure

V0.7 is separated into plain HTML, CSS and ordered classic scripts. The scripts share one explicit `window.CoffeeGame` namespace; mutable values live in `CoffeeGame.state`. Keep the script order in `index.html`, with `main.js` last. No ES module imports, runtime JSON fetches, dependencies or build step are required.

| File | Responsibility |
| --- | --- |
| `index.html` | Markup, accessible labels, existing DOM IDs and local stylesheet/script links |
| `assets/` | Unchanged approved artwork and HUD metadata |
| `css/styles.css` | All styles, including responsive layout |
| `js/config.js` | Namespace, physical/model constants, motion modes and clamp helper |
| `js/state.js` | Shared state, preferences, save migration and progress persistence |
| `js/assets.js` | Base images, readiness and embedded HUD glyph metadata |
| `js/routes.js` | Six route parameters and matching artwork/lighting |
| `js/audio.js` | Procedural Web Audio soundscape and its separate random stream |
| `js/physics.js` | Events, fixed-step simulation, slosh, overflow and droplets |
| `js/render.js` | Canvas scenery, cup/liquid geometry and raster HUD lettering |
| `js/endings.js` | Grade thresholds, precise campaign average, results and dialogue |
| `js/ui.js` | Menus, route buttons, settings, monitor and input wiring |
| `js/main.js` | Initialization, route reset and animation loop |
| `tools/` | Development-only original-versus-refactor checks using Node built-ins |

Route-specific image creation stays with its route mapping. Droplet spawn positions still use the renderer's cup geometry, as in V0.7. Cross-file callbacks run after all scripts load. The HUD metadata remains embedded in JavaScript so local JSON loading is unnecessary. See [AGENTS.md](AGENTS.md) for invariants and [the refactor review](docs/refactor-review.md) for the inventory and validation evidence.

Optional development checks (Node 24 and Git; neither is needed to play):

```bash
node tools/refactor-check.mjs
node tools/browser-check.mjs
```

The first compares against the original V0.7 source at Git commit `0762552`, including seeded physics replays and asset checksums. The second uses an installed Chrome with a temporary profile to compare both versions over `file://`; pass an executable path as its first argument to use another Chrome/Edge installation. Browser screenshots and observations are written to a temporary folder printed by the command. These tools do not read or change your regular browser saves.

## Contributing

After cloning once, start each task from an up-to-date main branch:

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/your-task
```

Make and test your changes, then stage only the files relevant to your task:

```bash
git status
git add path/to/changed-file
git commit -m "feat: describe your change"
git push -u origin feature/your-task
```

Open a pull request on GitHub targeting `main`. Explain your changes, the physics involved (if applicable), and your test results. Ask a teammate to review before merging. Do not force-push or overwrite someone else's work. Collaborators should agree on module ownership and avoid editing the same code simultaneously. For a public repository, cloning and pulling do not require an invitation; pushing requires appropriate access.

## Roadmap

- [x] Six-route gameplay, physics and difficulty balancing
- [x] Painterly graphics, route lighting, HUD and reduced motion
- [x] Procedural soundscape and interactive menu
- [x] Physics Monitor and overall-grade text endings
- [ ] Separate the codebase without changing behavior
- [ ] Add educational work and momentum calculations
- [ ] Consider route-dependent coffee cooling and secondary dialogue, subject to team approval
- [ ] Design character art and illustrated grade-dependent cutscenes
- [ ] Complete credits, physics documentation and final playtesting

## Credits and asset use

College Physics group project. Final member names and responsibilities should be filled in by the team based on actual contributions. The current visuals were created with AI image-generation assistance under the project's art direction; programming also used AI assistance. The HUD uses rasterized Hogfish DEMO lettering. Confirm typography licensing and review storefront branding before public distribution. No project license is asserted here; agree on one with the group before granting reuse rights.
