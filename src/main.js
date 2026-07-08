import "./style.css";
import { Coin } from "./coin.js";
import { fairFlip } from "./physics.js";

// Textures live in /public/textures and are served relative to the app's base URL.
const urlFor = (name) => `${import.meta.env.BASE_URL}textures/${name}`;

const stage = document.getElementById("stage");
const statusEl = document.getElementById("status");
const headsEl = document.querySelector("#tally-heads .count");
const tailsEl = document.querySelector("#tally-tails .count");
const hintEl = document.getElementById("hint");

const coin = new Coin(stage, urlFor);

const tally = { Heads: 0, Tails: 0 };
let flips = 0;

async function flip() {
  if (coin.busy) return; // ignore clicks mid-toss
  hintEl.classList.add("hidden");
  statusEl.textContent = "Flipping…";
  statusEl.dataset.face = "";

  const { seed } = fairFlip();
  const result = await coin.flip(seed);

  tally[result] += 1;
  flips += 1;
  headsEl.textContent = tally.Heads;
  tailsEl.textContent = tally.Tails;
  statusEl.textContent = result;
  statusEl.dataset.face = result.toLowerCase();
}

// Click anywhere on the stage to flip; ignore clicks on the UI chrome.
stage.addEventListener("click", flip);

// Space / Enter also flips, for keyboard users.
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    flip();
  }
});
