# Track Day

A daily 5-event track meet in chunky, bright retro pixel art. Pure touch skill: no typing, no trivia.
Everyone gets the same meet each day (same wind, weather and rivals) and one go at it.

## The five events

| Event | Touch control | What makes it skillful |
|---|---|---|
| **100m Dash** | Tap **L** and **R** in turn | Cadence drives speed; same-foot taps stumble you; tapping before the gun is a false start (two = disqualified) |
| **110m Hurdles** | Tap anywhere to jump | Auto-run; take off on the white mark. Perfect jumps chain a speed combo, clipping or crashing a hurdle (with hurdle physics) slows you |
| **Long Jump** | L/R to sprint, **hold** JUMP, release, tap to land | Take off close to the board without fouling; release the swinging angle gauge near 20–25° (the physics optimum); tap just before touchdown to stick the landing |
| **Javelin** | Press, pull back, **flick** up and forward | Flick speed is the power, flick direction is the angle (~35° is best); throw before the line. Real drag and wind; the javelin pitches with its velocity and sticks in the turf |
| **Hammer Throw** | Draw circles around the thrower, lift to release | Driven-pendulum physics: keep your finger *ahead* of the ball to add speed. Release in the green zone or it flies out of the sector or into the cage |

Two tries on field events, best counts. Marks are converted into decathlon-style points
(600 = bronze, 750 = silver, 900 = gold). Points use the real World Athletics scoring curves.

## Feel-good stuff
- Slow-motion finishes and peak-of-jump moments, screen shake, flashes, confetti, particle bursts (sand, turf, chalk, sparkles)
- Bouncy pixel pop-up text: PERFECT X3, TOP SPEED, NEW PB, WORLD RECORD
- A pixel crowd that jumps up and cheers harder the better you do, plus a synthesized crowd roar
- All sound is chiptune synthesized live with Web Audio (no audio files)

## Track artifacts (collectibles)
Scoring 560+ in an event of the **daily** meet gives a chance to dig up an artifact. Better scores mean better odds
and rarer finds: **Common, Rare, Epic, Legendary**. Setting a world record guarantees that event's legendary.
Strong whole-meet results add a bonus artifact (Laurel Wreath, Victory Torch, Golden Trophy, Champion's Crown).
29 artifacts in all, shown in the Trophy Room. Artifacts are revealed by tapping a shaking loot box.

## Tech
- Plain HTML/CSS/JS, no build step and no dependencies (fonts from Google Fonts with a monospace fallback)
- Rendered on a 360px-wide pixel canvas scaled up crisply (`image-rendering: pixelated`)
- Progress, streaks, personal bests and the collection are saved in `localStorage`
- Daily conditions come from a seeded RNG keyed on the local date, so everyone gets the same meet

```
trackday/
  index.html, style.css, manifest.webmanifest, icon.svg
  js/engine.js   canvas, pixel drawing, FX, stadium scenery, athlete rig
  js/art.js      bitmap font, artifact pixel art, collectible list + drop odds
  js/audio.js    synthesized sound effects
  js/events.js   the five events (physics + drawing)
  js/main.js     loop, input, daily meet flow, menus
```

## Run it locally
```
cd trackday && python3 -m http.server 8000
# open http://localhost:8000
```
Desktop keys for testing: ← / → for L / R, Space for jump.

## Deploy
It is a static site. On Cloudflare Pages: create a new project from this repo, set **Root directory** to `trackday`,
leave the build command empty and the output directory as `/`. It is completely separate from Honeydle's Worker.
