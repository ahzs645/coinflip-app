# Coin Flip

A standalone 3D coin flip, extracted from the **Clickflip** browser extension and
rebuilt as a Vite 8 app. Click the coin (or press Space / Enter) to keep flipping it. A
running Heads/Tails tally sits at the bottom.

**Live:** https://ahzs645.github.io/coinflip-app/

Every push to `main` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## How it works

- **`src/physics.js`** — the deterministic coin simulation, copied verbatim from the
  extension. A single 32-bit seed fully determines the toss, so the outcome can be picked
  with a fair crypto RNG (`fairFlip`) while the bounce is still real physics.
- **`src/coin.js`** — the three.js renderer (a `Coin` class): a metallic quarter lit by a
  `RoomEnvironment`, with a soft contact shadow. `flip(seed)` resolves with the landed
  face.
- **`src/main.js`** — wires clicks/keys to a flip and updates the tally.
- **`public/textures/`** — the quarter's color + bump maps (obverse, reverse, edge).

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

Requires Node 20.19+ / 22.12+ (Vite 8).
