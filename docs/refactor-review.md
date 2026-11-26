# V0.7 code separation review

Branch: `refactor/separate-codebase`. Original baseline: `0762552` (`docs: add project documentation and Codex instructions`). The working tree was clean on `main` before the branch was created. No assets, gameplay features, tuning, dependencies, save formats or launch requirements are changed. No commit, merge or push has been performed.

## Baseline inventory

The original `index.html` contained all markup, one style block and one script block. Styles covered the stage, controls, overlays, café menu, physics monitor and ending scores, with narrow-screen and landscape media queries. The controls hint also had an inline `text-align:center`; it now lives in `.controls .small` in the stylesheet.

There were no external libraries, network resources or build tools. Browser APIs used include Canvas 2D, Image, Web Audio, localStorage, matchMedia, pointer capture, performance.now and requestAnimationFrame. Image paths are relative to the document. The glyph atlas data was already embedded in the script as well as present in `assets/hud-lettering.json`; that arrangement is preserved.

Original functions and their destinations:

| Destination | Original functions / data |
| --- | --- |
| `config.js` | `G`, `W`, `H`, `fill0`, `CW`, `CH`, `motionModes`, `clamp` |
| `state.js` | Mutable simulation/UI state, save/preference reads, `hasProgress`; original progress write extracted as `persistProgress` |
| `assets.js` | `images`, `glyphs`, `ready` |
| `routes.js` | `levels`, `routeArt`, `routeImage` (exported as `imageFor`) |
| `audio.js` | `soundscape`: `rand`, `smooth`, `init`, `motor`, `unlock`, `pulse`, `spill`, `rattle`, `cue`, `environment`, `update`, `warning`, `result`, `reset`, context/status getters |
| `physics.js` | `newEvent`, `step` |
| `render.js` | `text`, `cupPoint`, `drawStreet`, `drawCup`, `draw`, cup cavity and sprite geometry |
| `endings.js` | `grade`, `campaignScore`, `percent`, `showEnding`, `finish`, `endings` dialogue |
| `ui.js` | `panel`, `routes`, `pause`, `updatePhysics`, `togglePhysics`, `updateMotion`, `updateSound`, `closeCafeDialog`, `cafePanel`, `showCafe`, `cafeSettings`, `cafeReturn`; existing listeners grouped in `bindControls` |
| `main.js` | `start`, `loop`, frame clock/accumulator and startup calls |

All 38 DOM IDs are retained in their original order:

```text
cafe menuStart menuContinue menuSettings menuCredits cafe-dialog
menuTitle menuDesc menuActions game menuBack motion mute physicsToggle
route coffee accel distance c panel pt pd endingScores actions left right
routes physicsMonitor pv pax pay pdist ptheta pslosh pg pangle pke pcoffee
```

Storage keys and formats are unchanged:

- `coffee-delivery-v03`: `{unlocked: 0, best: []}`, with the original `coffee-delivery-v1` migration.
- `coffee-motion-v03`: `gentle`, `minimal`, `still`, with the original reduced-motion fallback.
- `coffee-sound-v04`: original `on`/`off` preference.

The 23 original asset/data files remain byte-for-byte unchanged: `coffee.jpg`, `hand-empty.png`, `hand-original.png`, `hud-lettering.png`, `hud-lettering.json`, `interior.png`, `menu.jpg`, `street.jpg`, plus `hand-empty-2.webp` through `hand-empty-6.webp`, `interior-2.webp` through `interior-6.webp`, and `street-2.jpg` through `street-6.jpg`.

## Separation decisions

Classic scripts use closure-local variables and the single `window.CoffeeGame` namespace. Each file reads the shared state object explicitly. Immutable module data is exposed by its owning file. The entry point loads last and installs callbacks only after all modules are available. No ES modules or local-file fetches are introduced.

Grade thresholds remain beside the original grading algorithm in `endings.js`. Route image creation stays beside artwork/lighting mappings in `routes.js`. The simulation retains its call to the renderer's cup geometry when spawning screen-space droplets, preserving particle positions and random-call order. These small adaptations avoid duplicating data or changing the original model.

The original equations, precision, event probabilities and fixed-step accumulator are preserved. The original failed-attempt recording behavior also remains: a failed fraction can be recorded when there is no higher best, but cannot overwrite a successful best or unlock a route. F never unlocks a campaign ending.

## Validation

`node tools/refactor-check.mjs` compares the original inline source from Git with the separated scripts in isolated VM contexts. It uses a browser API test double for deterministic canvas and audio command comparison. This is automated regression testing, not a human playtest.

- 216 route replays: six routes × three motion settings × six input policies × two seeds.
- 1,103,460 paired 120 Hz steps, with exact serialized state, random-call count, events, droplets, completion time, progress writes and unlock equality at every step.
- Sampled canvas commands and synthesized audio parameter traces match throughout the replays.
- Holding left or right for an entire route failed all six sampled routes (about 21–28% remaining). The sampled short corrective-tap policy passed all six (about 47–100%). Both outcomes match the original.
- Save migration, existing records, malformed/blocked storage, reduced-motion fallback, failed best preservation, Continue, Start without erasing, settings, credits, keyboard/pointer controls, retry, pause/resume and blur-to-pause match.
- Grade/pass thresholds, campaign availability/precision, all four dialogues, monitor values, frame-delta cap and accumulator match.
- Original DOM IDs and CSS declarations match; entry-point paths exist; all 23 original asset/data SHA-256 checksums match.

`node tools/browser-check.mjs` passed in headless Chrome 158.0.8127.37 over real `file://` URLs, using a temporary browser profile and a baseline copy outside the working tree:

- All gameplay images and the menu loaded without missing requests or JavaScript/console errors in either version.
- Actual DevTools keyboard and mouse input exercised menus, the dialog focus trap, Escape, tilt, retry, pause/resume, monitor and preferences. Pointer cancel/lost capture and storage-error cases are additionally covered by the VM checks.
- All six route scenes, live monitor values, four ending texts and responsive layouts matched. Eleven screenshot pairs (menus at 1280×800, 390×844 and 844×390; six route views; two responsive gameplay views) had identical decoded pixels. Matching initial viewports avoids Chromium's viewport-dependent JPEG decode cache differences.
- Fresh runs with no animation-clock instrumentation exercised the real animation loop and native Web Audio running state and play/pause/menu fades in both versions.
- All ten game scripts and both development scripts passed `node --check`; `git diff --check` passed. The final diff contains only the separation, documentation and development checks; `AGENTS.md` and all assets are unchanged.

Limitations: tests used headless desktop Chrome with emulated viewport sizes and automated inputs. No human playtest, physical touchscreen/mobile device test, speaker/listening assessment or separate Edge/HTTP run was performed. Audio parameter equivalence and native gain fades were checked; perceived sound quality was not assessed. Playing still requires only opening `index.html` directly; Node and Chrome automation are development tools, not game dependencies.
