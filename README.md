# Coin Flip

A standalone 3D coin flip, extracted from the **Clickflip** browser extension and
rebuilt as a Vite 8 app. Click the coin (or press Space / Enter) to keep flipping it. A
running Heads/Tails tally sits at the bottom.

It currently flips a Canadian quarter — the caribou 25¢. A US Washington quarter is
also included; see [Coins](#coins).

**Live:** https://projects.ahmadjalil.com/coinflip-app/
(also at https://ahzs645.github.io/coinflip-app/)

Every push to `main` builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## How it works

- **`src/physics.js`** — the deterministic coin simulation, from the extension. A single
  32-bit seed fully determines the toss, so the outcome can be picked with a fair crypto
  RNG (`fairFlip`) while the bounce is still real physics. It takes a thickness ratio, so
  each coin tumbles and settles on its own proportions.
- **`src/coins.js`** — the coin profiles. Everything coin-specific lives here: real-world
  proportions, texture set, and how the alloy catches the light.
- **`src/coin.js`** — the three.js renderer (a `Coin` class): a metallic coin lit by a
  `RoomEnvironment`, with a soft contact shadow. `flip(seed)` resolves with the landed
  face.
- **`src/main.js`** — wires clicks/keys to a flip and updates the tally.
- **`public/textures/`** — each coin's color + bump maps (obverse, reverse, edge).
- **`tools/make-coin-textures.py`** — turns a straight-down photo of a coin face into the
  texture pair the renderer expects.

## Coins

`src/coins.js` holds one profile per coin. Change `DEFAULT_COIN` to switch which one the
app flips:

| Coin | Diameter | Thickness | Alloy |
| --- | --- | --- | --- |
| `COINS.ca` — Canadian quarter | 23.88 mm | 1.58 mm | nickel-plated steel |
| `COINS.us` — US quarter | 24.26 mm | 1.75 mm | cupronickel |

Only the thickness-to-diameter ratio reaches the simulation; the coin is always drawn at
the same on-screen size. The two ratios settle indistinguishably (both land in under
2.3 s and never hit the solver's safety net), so the difference is one of looks, not odds
— and `fairFlip` keeps the result a true 50/50 either way.

### Adding a coin

Photograph both faces square-on against a dark backdrop, then:

```bash
python3 tools/make-coin-textures.py obverse.jpg public/textures/<name>-obverse
python3 tools/make-coin-textures.py reverse.jpg public/textures/<name>-reverse
```

That writes a colour map and a bump map for each face, normalised to the same contrast as
the existing sets. Add a profile to `src/coins.js` pointing at them. The reeded edge strip
(`quarter-edge`) is shared — any milled coin can reuse it.

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
