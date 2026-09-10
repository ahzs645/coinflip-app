import "./style.css";
import { Coin } from "./coin.js";
import { fairFlip } from "./physics.js";
import { COINS, DEFAULT_COIN } from "./coins.js";

// Textures live in /public/textures and are served relative to the app's base URL.
const urlFor = (name) => `${import.meta.env.BASE_URL}textures/${name}`;

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const headsEl = document.querySelector("#tally-heads .count");
const tailsEl = document.querySelector("#tally-tails .count");
const hintEl = document.getElementById("hint");
const pickerEl = document.getElementById("coin-picker");
const pickerButtons = [...pickerEl.querySelectorAll("button[data-coin]")];

let profile = DEFAULT_COIN;
const coin = new Coin(stage, urlFor, profile);

// The tally counts tosses, not coins, so it carries across a coin change.
const tally = { Heads: 0, Tails: 0 };

async function flip() {
  if (coin.busy) return; // ignore clicks mid-toss
  hintEl.classList.add("hidden");
  statusEl.textContent = "Flipping…";
  statusEl.dataset.face = "";
  setPickerEnabled(false); // a coin can't change shape mid-air

  const { seed } = fairFlip(profile.thicknessRatio);
  const result = await coin.flip(seed);

  tally[result] += 1;
  headsEl.textContent = tally.Heads;
  tailsEl.textContent = tally.Tails;
  statusEl.textContent = result;
  statusEl.dataset.face = result.toLowerCase();
  setPickerEnabled(true);
}

function setPickerEnabled(enabled) {
  pickerButtons.forEach((b) => {
    b.disabled = !enabled;
  });
}

function selectCoin(id) {
  if (coin.busy || !COINS[id] || id === profile.id) return;
  profile = COINS[id];
  coin.setProfile(profile);
  pickerButtons.forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.coin === id));
  });
}

pickerEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-coin]");
  if (!btn) return;
  selectCoin(btn.dataset.coin);
  // A pointer click shouldn't leave the button holding focus, or the next Space would
  // press it again instead of flipping. Keyboard activation (detail 0) keeps focus.
  if (e.detail > 0) btn.blur();
});

// Click anywhere on the stage to flip; ignore clicks on the UI chrome.
stage.addEventListener("click", flip);

// Space / Enter also flips, for keyboard users.
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.code !== "Enter") return;
  // Leave the picker's own buttons alone — Space/Enter should press them, not flip.
  if (e.target.closest?.("#coin-picker")) return;
  e.preventDefault();
  flip();
});
