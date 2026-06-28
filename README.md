# Memory

A card-match memory game on a 4×4 board with 8 emoji pairs, a smooth flip animation, and a Top‑3 leaderboard. Pure HTML / CSS / JS — no server, no build step, no dependencies.

## Quick start

Just open `index.html` in a browser.

If you prefer serving it locally (some browsers restrict `file://` for things like fonts), any one-liner static server works, e.g.:

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

## How to play

- Click or tap a card to flip it face-up.
- Flip a second card. If they match, they stay face-up; if not, they flip back after a short delay.
- Match all **8 pairs** to win.
- Lower moves and faster time = higher score.

**Final score:** `max(0, 1000 − moves × 10 − seconds × 5)`

## How scores are stored

Everything is stored in this browser's `localStorage`:

| Key | What |
| --- | ---- |
| `memory.leaderboard` | The Top 3 leaderboard. |
| `memory.player`      | Your current player name on this device. |

Clearing site data (or the **Clear** button in the leaderboard) wipes scores. Scores are per‑browser/per‑device — they don't sync across machines.

## Controls

| Key                              | Action            |
| -------------------------------- | ----------------- |
| **Click / Tap** a card           | Flip card         |
| `Space`                          | Pause / Resume    |
| `R`                              | Restart           |
| **Change** (top right)           | Switch player     |
| **Clear** (leaderboard header)   | Wipe Top 3        |

Notes:

- The timer pauses with the game; pausing greys out the board so you can't peek.
- A move = one *pair* of flips (so picking two cards counts as one move).
- The tab auto-pauses when hidden, so you don't lose a run by alt-tabbing.

## Files

```
memory/
├── index.html       # Markup
├── styles.css       # Theme
├── game.js          # Game state, flips, matches, timer, leaderboard
└── README.md
```
