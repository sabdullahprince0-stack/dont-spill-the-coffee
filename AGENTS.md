# AGENTS.md — Don't Spill the Coffee!

## Scope and current baseline

These instructions apply throughout this repository. This is a collaborative college Physics project: an atmospheric first-person 2D arcade simulation about delivering coffee to a crush via a reckless Filipino jeepney. Respect the team's approved design and keep the code approachable for classmates learning programming and physics.

Baseline: V0.7 (Physics & Endings). The original package was inspected for this guide; the live repository may have newer changes. Inspect the current working tree, git status and actual source before editing. Do not assume the target architecture below already exists. Preserve uncommitted work and ask the user before destructive operations or changing unrelated features. Do not commit, push, merge, change repository settings or publish unless requested.

## First priority: behavior-preserving separation

Create a dedicated refactor branch (suggested `refactor/separate-codebase`). First inventory the current inline styles, script functions, dependencies, DOM IDs, storage keys and assets. Separate code in small, reviewable steps. Do not introduce gameplay features, balance changes, art changes, dependencies, a framework, a bundler or a new server requirement in this refactor.

Target architecture (adapt if the actual source demands it; explain deviations):

```
index.html          # semantic markup, existing DOM IDs, script/style links
assets/             # all approved artwork and existing data files
css/styles.css      # extracted styles and responsive layout
js/config.js        # constants, thresholds, motion settings
js/state.js         # state and persistence
js/assets.js        # image loading, sprite metadata, readiness
js/audio.js         # procedural Web Audio soundscape
js/physics.js       # event generation, fixed-step simulation, spill and droplets
js/routes.js        # route data, art mapping and difficulty parameters
js/ui.js            # menus, route controls, overlays, monitor and input wiring
js/render.js        # canvas drawing, liquid geometry, lettering, scenery
js/endings.js       # grade calculations, campaign score and ending dialogue
js/main.js          # initialization, update/draw loop and orchestration
README.md
AGENTS.md
```

**Offline compatibility:** V0.7 runs by double-clicking `index.html` (`file://`) as well as via Live Server. Preserve this. Prefer ordered classic scripts with an explicit shared namespace (for example `window.CoffeeGame`) or an equivalently local-file-compatible approach. Do not blindly convert to `type="module"`/ES imports or runtime `fetch()` of local JSON, which can fail under file:// restrictions. If true ES modules are desired, get approval for a server-based launch workflow and document it. Preserve relative asset paths, avoid absolute disk paths, and load the entry point last. Minimize circular dependencies and avoid relying on implicit globals.

## Gameplay invariants

- Six routes; each starts with a full cup and runs for its existing fixed duration unless the cup empties first. Keep route order, artwork and lighting mapping unchanged.
- Inputs: A/D, arrow keys, pointer controls; R restart, P pause, I Physics Monitor. Preserve blur-to-pause, key clearing, menu keyboard behavior and accessible labels.
- Pass threshold 40%; unlock next route only on success. Continue resumes the highest unlocked route or completed campaign options; Start does not erase progress.
- Grades: S >= .95, A >= .80, B >= .60, C >= .40, otherwise F. Overall score averages six best successful deliveries and is unavailable until each route passes. Preserve numeric precision and existing save compatibility. F is a failed attempt, not a completed-campaign ending.
- Preserve all text endings and existing menu flow. Character art and temperature features are not yet implemented.

## Physics invariants (V0.7)

Do not retune the following values or algorithms during a structural refactor. The team has approved the difficulty following the V0.6.1 sustained-tilt fix.

- Fixed 120 Hz step (1/120 s), rendered with requestAnimationFrame. Existing frame-delta cap and accumulator behavior must remain equivalent.
- Gravity `G=9.81`; cup model `W=160`, `H=180`, initial fill fraction `0.87` (model dimensions, not SI measurements).
- Speed starts at 8 m/s; clamp to 3–23 m/s. Integrate speed and distance with the existing time step.
- Preserve event types, warning intervals, random force envelopes, bump oscillations, chaining probabilities and random call order for gameplay. Keep the audio random stream separate.
- Preserve brief tilt target `.73` radians and sustained target `.73+.32` radians, blended after `.42` s over `.50` s. Keep existing angular response and damping. Holding either direction must not be an easy winning strategy.
- Effective gravity direction uses `atan2(-ax*1.22, max(2,G+ay))`. Preserve clamped equilibrium, damped slosh update, overflow and deep-tilt capacity calculation, spill rate and particle behavior. The acceleration gain and other tuning factors are game-model approximations.
- Gentle, Minimal and Still settings affect rendering only. Existing scroll scale `[4.2,1.5,0]`, smoothing and route tinting remain unchanged. Do not feed visual motion back into physical simulation.
- Monitor currently reports speed, horizontal/vertical acceleration, distance, cup angle, slosh angle, effective gravity magnitude/angle, coffee percentage and specific kinetic energy `0.5*v*v` (J/kg). Preserve the 0.1 s display refresh and default hidden state.

Route parameters (name, duration in seconds, configured horizontal intensity, bump intensity):

| Route | Duration | Horizontal | Bump |
| --- | ---: | ---: | ---: |
| The neighborhood | 32 | 2.8 | 0.45 |
| City traffic | 38 | 4.2 | 0.7 |
| Pothole province | 42 | 4.8 | 1.5 |
| Mountain road | 46 | 5.8 | 1.25 |
| Highway madness | 48 | 7 | 1.0 |
| The jeepney final boss | 55 | 8.2 | 2.1 |

## Persistence and assets

Keep exact localStorage keys and data format unless a separately approved migration is implemented:

- `coffee-delivery-v03`: `{unlocked: 0, best: []}`; zero-based route index, fractions 0–1. Preserve migration from `coffee-delivery-v1` and safe storage-error handling.
- `coffee-motion-v03`: `gentle`, `minimal`, `still`; honor existing prefers-reduced-motion fallback.
- `coffee-sound-v04`: existing on/off preference.

Keep existing artwork files and names, including `coffee.jpg`, `hand-empty.png`, `hand-original.png`, `hud-lettering.png`, `hud-lettering.json`, `interior.png`, `menu.jpg`, `street.jpg` and route variants `hand-empty-2.webp` through `hand-empty-6.webp`, `interior-2.webp` through `interior-6.webp`, and `street-2.jpg` through `street-6.jpg`. Check actual tree before changes. Do not regenerate, delete, recolor or replace approved assets without explicit instruction. Do not redistribute raw font files; Hogfish DEMO licensing and storefront branding need review before public release.

## Art and narrative direction

- Rough painterly oil-brush visuals, warm earth tones and atmospheric Filipino settings. First-person passenger view, one hand holding an open takeaway cup. No glossy generic UI.
- Preserve personalized route landmarks and six distinct environments: dusk neighborhood, blue-hour city, sunny province, foggy mountain, nighttime highway, nighttime campus.
- Menu: café at dusk, coffee and handwritten note; preserve the existing artwork and functional menu options.
- Story: a student bringing coffee to a crush; lighthearted romantic comedy. The four successful ending grades retain their approved dialogue. No redesign or new character art without approval.

## Collaboration and next features

Keep `main` stable; propose changes in small feature branches and pull requests. Team members should agree on responsibilities; possible divisions include physics, UI/endings, assets, QA and documentation. Do not assign authorship or contribution credit without confirmation.

After the refactor passes review, tackle new features in independent branches:

- Work/energy/momentum: add explicit educational calculations with documented assumptions (mass, units, coordinate frame); distinguish specific kinetic energy from total energy. Do not claim conservation or full fluid simulation if not implemented.
- Thermodynamics (optional, pending approval): Newton's law of cooling with route-specific ambient temperatures and documented coefficients. Temperature is secondary and may affect dialogue, not the existing score or controls. Do not implement as part of refactor.
- Endings: illustrated character expressions, consistent campus setting, grade-dependent dialogue; retain score thresholds.
- QA, accessibility, credits and documentation: verify usability, attribution and licensing.

## Required checks before reporting a refactor complete

1. Confirm clean script syntax and no missing image/style/script paths; compare asset checksums to the baseline.
2. Run via local `file://` and optionally a local HTTP server. Check browser console, all assets, responsive layout, menu buttons and navigation. If an environment blocks a test, report that limitation honestly.
3. Test every route, retry, pause/resume, both keyboard and pointer controls, sound toggle and all motion settings. Verify sound stays tied to events and pause/menu fades.
4. Compare old and new physics with identical initial state, fixed inputs and a seeded/random replay. Check velocity, acceleration, slosh, tilt, spill amount, completion time and route unlocking. Confirm sustained maximum tilt remains risky and short corrective taps remain viable.
5. Test old save keys, existing progress, failed attempt preservation, Continue, Start without erase and campaign score thresholds. Verify all four ending dialogues and monitor values.
6. Keep physics/difficulty unchanged, preserve all art and relative paths, and verify no unintended changes in git diff. Update README only to reflect actual structure and launch workflow.
7. Report files changed, tests actually run, outcomes and outstanding limitations. Do not claim a browser test or human playtest that was not performed.

When changes are requested, prefer simple code with clear function boundaries and comments that explain physics and non-obvious assumptions. Preserve the game's personality and player experience.
