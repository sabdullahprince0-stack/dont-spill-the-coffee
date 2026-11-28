# Scenery event response review

The previous renderer used a linear mapping from velocity to scenery displacement, with no horizontal smoothing remaining. Gentle produced `velocity × 4.2 × 0.58` canvas pixels/s; Minimal used `velocity × 1.5 × 0.58`. Short events only changed vehicle velocity modestly, and the approved 23 m/s physical limit prevented further acceleration once reached. There was no separate visual emphasis for throttle or braking.

The renderer now eases a visual gain toward 1.9 during active full throttle and 0.45 during active braking. Warnings leave the target at 1. Gain follows an exponential response with a 0.1 s time constant during either event and 1/6 s during recovery to cruising. Approximately 95% of the event transition completes in 0.3 s. Each fixed step adds the new visual rate times delta time to the existing displacement; changing conditions never rescales or resets panorama position.

The gain is applied only to presentation. Scaled velocity is capped at 32 before the existing motion scales and window factor, limiting Gentle to 77.952 canvas pixels/s and Minimal to 27.84. At high vehicle speeds this cap can reduce the throttle ratio below 1.9. Still freezes displacement. Zero velocity stops scrolling regardless of gain; normal gameplay retains its minimum of 3 m/s. Bump response, artwork, looping, camera shake, cup drawing, physics, difficulty and HUD calculations are unchanged by this adjustment.

## Measured before and after

Measurements use the first naturally generated throttle and brake events on each route, seed 123, Gentle mode, and identical corrective keyboard inputs. No force, event timing, duration or speed is injected. Each sample is the simulation step closest to 60% of that event's duration. Before and after use identical vehicle velocity and physical state at that step. Rates are absolute horizontal canvas pixels/s, including the existing 0.58 window factor, before camera scale (1.017) and responsive viewport scaling. Throttle and brake columns refer to separate events.

| Route | Throttle before | Throttle after | Ratio | Braking before | Braking after |
| --- | ---: | ---: | ---: | ---: | ---: |
| 01 — The Neighborhood | 15.10 | 28.68 | 1.90× | 15.44 | 6.95 |
| 02 — City Traffic | 16.40 | 31.15 | 1.90× | 13.41 | 6.04 |
| 03 — Pothole Province | 19.98 | 37.96 | 1.90× | 12.54 | 5.65 |
| 04 — Mountain Road | 16.84 | 31.99 | 1.90× | 11.10 | 5.00 |
| 05 — Highway Madness | 18.94 | 35.92 | 1.90× | 9.36 | 4.21 |
| 06 — The Jeepney Final Boss | 30.46 | 57.87 | 1.90× | 7.62 | 3.43 |

`tools/scenery-event-check.mjs` measured all six routes with seeds 123 and 731291 in all three motion modes. The previous renderer was saved before editing and executed in a separate VM. Every physical state, save and RNG call matched on every step. Plateau samples after the first 0.4 s verified throttle ratios of 1.8–2.0 where uncapped, brake ratios of 0.45–0.50, comfort caps and zero movement in Still. Completed routes are excluded from moving-rate comparisons.

The same tool can reproduce the default before mapping without an archived file. Its optional `--baseline` argument executes an actual previous renderer. `tools/scenery-check.mjs` additionally captures naturally generated events in offline Chrome, measures displacement per fixed step, checks both scrolling wrap boundaries on every route, and creates a live review copy with actual rate counters. Scripted event timing in the live copy is labeled and exists only in the temporary review artifact; its Natural gameplay button restores the game's normal event generation.

## Validation performed

- `tools/scenery-event-check.mjs`, both with the saved previous renderer and with the default velocity-only baseline: passed across six routes, three motion modes and two seeds.
- `tools/scenery-check.mjs`: passed at 20, 30, 60, 120 and 144 FPS plus irregular timing. Verified gain transitions, warning intervals, phase continuity, comfort cap, zero velocity, pause/restart and motion switching. Offline Chrome loaded all assets and checked both loop boundaries on every route. Twelve screenshots captured real generated throttle/brake events, and the live review copy's route and motion controls passed.
- `tools/panorama-check.mjs`: 108 seeded full-route physics replays passed with 562,392 identical paired steps. Original asset checksums, matching-coordinate artwork comparisons, Route 01 fallback, offline loading and responsive screenshots passed.
- JavaScript syntax and `git diff --check` passed. Testing was automated in Chrome and Node VMs.
