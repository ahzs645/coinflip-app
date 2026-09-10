// The coins the app knows how to mint. Everything that differs between one real coin
// and another lives here: its real-world proportions, its texture set, and how its
// alloy catches the light. `src/coin.js` reads a profile; nothing else is coin-specific.
//
// Textures are generated from a straight-down photo of each face by
// tools/make-coin-textures.py — see that file for the format the renderer expects.

export const COINS = {
  // Washington quarter: 24.26 mm across, 1.75 mm thick, cupronickel.
  us: {
    id: "us",
    label: "US quarter",
    thicknessRatio: 1.75 / 24.26,
    obverse: "quarter-obverse",
    reverse: "quarter-reverse",
    edge: "quarter-edge",
    faceTint: 0xd9dadc,
    edgeTint: 0xd9dadc,
    roughness: 0.34,
  },

  // Caribou quarter: 23.88 mm across, 1.58 mm thick — a touch smaller and noticeably
  // thinner than the US one. Nickel-plated steel reads cooler and a little more
  // mirror-like than cupronickel, hence the bluer tint and lower roughness.
  ca: {
    id: "ca",
    label: "Canadian quarter",
    thicknessRatio: 1.58 / 23.88,
    obverse: "quarter-ca-obverse",
    reverse: "quarter-ca-reverse",
    edge: "quarter-edge", // both coins are reeded; the same rim strip serves for each
    faceTint: 0xdfe1e4,
    edgeTint: 0xdfe1e4,
    roughness: 0.3,
  },
};

export const DEFAULT_COIN = COINS.ca;
