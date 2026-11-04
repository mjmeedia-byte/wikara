# Pixel Surf 64

A small Mario 64-style surfing game for the browser. Ride the swell, pull tricks, collect coins and earn all six stars.

## Play

Open `index.html` in a modern browser. No install and no build step: three.js (r128) is vendored in `vendor/`, so it also works offline.

## Controls

| Input                 | Action                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| W / ↑                 | Pump forward (paddle and speed up; holding it slides you down the face)                     |
| S / ↓                 | Brake (climbs you back up the face toward the lip)                                          |
| A / ← and D / →       | Turn the board (in the air: spin)                                                           |
| Space                 | Jump off the lip. A quick tap gives a small hop, a hold gives full height                   |
| Shift + W / S         | In the air: flip forward or backward                                                        |
| Q / E, or drag, wheel | Orbit and zoom the camera; C recentres it                                                   |
| P or Esc              | Pause                                                                                       |
| M                     | Sound on/off                                                                                |
| R                     | Restart                                                                                     |
| Gamepad               | Left stick steer and throttle, A jump, RB trick, right stick camera, Start begins or pauses |

## Scoring and stars

- Riding the face earns points each second. The combo multiplier grows the longer you stay on the wave.
- Coins sit on the swell you are riding (and in arcs over the lip).
- Spins and flips score when you land cleanly. A bad landing is a wipeout.
- Wipeouts happen when you wash out the back, get caught inside the flat bottom, or land badly.
- Six stars: FIRST RIDE, COIN HUNTER, SKY HIGH, DOUBLE SPIN, LONG LINE, BIG WAVE.

Your best score is saved in this browser's local storage.

## How it is built

| File                    | What it does                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `js/ocean.js`           | The swell: a sharp-crested Gerstner-style wave. Pure math, no DOM                                                                                                            |
| `js/surfer.js`          | Surfer physics as a state machine: riding, jumping, spinning, wipeouts. Pure, so it can be tested in Node                                                                    |
| `js/scene.js`           | three.js rendering. The canvas renders at 240 rows and is scaled up with nearest-neighbour filtering, and the ocean colours are banded to a small palette for the pixel look |
| `js/game.js`            | Input (keyboard, gamepad, mouse), state, scoring, stars, coins, camera and HUD                                                                                               |
| `js/sfx.js`             | Chiptune sound effects synthesised with WebAudio, so there are no audio files                                                                                                |
| `tests/physics.test.js` | Physics tests                                                                                                                                                                |

## Tests

```bash
node --test games/pixel-surf/tests/physics.test.js
```
