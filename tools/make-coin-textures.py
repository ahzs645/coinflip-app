#!/usr/bin/env python3
"""Turn a straight-down photo of a coin face into the texture set src/coin.js expects.

For each face it emits a colour map and a bump map:

  <out>/<name>.png        1024x1024 RGBA, coin centred at (512,512) at COIN_DIAM px,
                          transparent outside the rim, silver bleed under the alpha
                          so filtering never drags the black backdrop onto the rim.
  <out>/<name>-bump.png   1024x1024 L, a luminance height map normalised to the same
                          contrast as the original US quarter set, flat 128 outside.

The photo only has to be shot square-on against a dark backdrop; the coin is located
and re-centred automatically. Usage:

  python3 tools/make-coin-textures.py photo.png public/textures/quarter-ca-obverse
"""

import sys
import numpy as np
from PIL import Image

SIZE = 1024          # texture is SIZE x SIZE
COIN_DIAM = 967      # matches the original US quarter set (94.4% of the frame)
BG_THRESHOLD = 35    # luminance above which a pixel is coin, not backdrop

# Contrast targets measured off the original quarter-*.png set, so the new faces sit
# at the same exposure under the existing lighting/material setup in coin.js.
COLOR_MEAN, COLOR_STD = 108.0, 48.0
BUMP_MEAN, BUMP_STD = 132.0, 46.0
BUMP_FLAT = 128      # neutral height outside the coin


def coin_mask(gray):
    """A filled disc mask, closing over dark recesses in the relief."""
    m = gray > BG_THRESHOLD
    filled = np.zeros_like(m)
    for axis in (1, 0):
        acc = np.zeros_like(m)
        idx = np.arange(m.shape[axis])
        shaped = idx.reshape((1, -1) if axis == 1 else (-1, 1))
        any_hit = m.any(axis=axis, keepdims=True)
        lo = np.where(m, shaped, m.shape[axis]).min(axis=axis, keepdims=True)
        hi = np.where(m, shaped, -1).max(axis=axis, keepdims=True)
        acc = (shaped >= lo) & (shaped <= hi) & any_hit
        filled = acc if not filled.any() else (filled & acc)
    return filled


def fit_circle(mask):
    """Least-squares (Kasa) circle through the mask boundary."""
    pts = []
    for axis in (1, 0):
        idx = np.arange(mask.shape[axis])
        shaped = idx.reshape((1, -1) if axis == 1 else (-1, 1))
        rows = np.nonzero(mask.any(axis=axis))[0]
        lo = np.where(mask, shaped, mask.shape[axis]).min(axis=axis)
        hi = np.where(mask, shaped, -1).max(axis=axis)
        for r in rows:
            pts.append((lo[r], r) if axis == 1 else (r, lo[r]))
            pts.append((hi[r], r) if axis == 1 else (r, hi[r]))
    p = np.array(pts, float)
    x, y = p[:, 0], p[:, 1]
    A = np.column_stack([x, y, np.ones(len(x))])
    b = x * x + y * y
    a1, a2, a3 = np.linalg.lstsq(A, b, rcond=None)[0]
    cx, cy = a1 / 2, a2 / 2
    return cx, cy, float(np.sqrt(a3 + cx * cx + cy * cy))


def renormalize(arr, inside, mean, std):
    """Linear gain/offset so `inside` hits the target mean and std."""
    cur = arr[inside]
    gain = std / max(cur.std(), 1e-6)
    return gain, mean - gain * cur.mean()


def main(src_path, out_stem):
    src = Image.open(src_path).convert("RGB")
    # Pad so a coin that runs right up to the frame edge still leaves room for the
    # crop box below; the padding lands outside the rim and is overwritten anyway.
    pad = max(src.size) // 4
    padded = Image.new("RGB", (src.size[0] + 2 * pad, src.size[1] + 2 * pad), (0, 0, 0))
    padded.paste(src, (pad, pad))
    src = padded
    gray = np.array(src.convert("L")).astype(float)
    mask = coin_mask(gray)
    cx, cy, r = fit_circle(mask)

    ys, xs = np.nonzero(mask)
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    print(f"{src_path}: {src.size[0]}x{src.size[1]}  circle=({cx:.1f},{cy:.1f}) r={r:.1f}")
    print(f"  bbox {w}x{h}px, ovality {100 * abs(w - h) / max(w, h):.2f}% "
          f"({'round enough' if abs(w - h) / max(w, h) < 0.01 else 'CHECK: not circular'})")

    # Resample so the fitted circle lands at COIN_DIAM centred in a SIZE frame.
    half = r * (SIZE / COIN_DIAM)
    box = (cx - half, cy - half, cx + half, cy + half)
    face = src.resize((SIZE, SIZE), Image.LANCZOS, box=box)
    rgb = np.array(face).astype(float)

    # Antialiased disc: 1px feather at the rim.
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    dist = np.hypot(xx - (SIZE - 1) / 2, yy - (SIZE - 1) / 2)
    alpha = np.clip(COIN_DIAM / 2 - dist + 0.5, 0, 1)
    inside = alpha > 0.99

    # --- colour map ---
    lum = rgb @ [0.299, 0.587, 0.114]
    gain, offset = renormalize(lum, inside, COLOR_MEAN, COLOR_STD)
    out = np.clip(rgb * gain + offset, 0, 255)
    # Bleed the mean rim colour outward so mip/aniso filtering can't pull in the backdrop.
    rim = (dist > COIN_DIAM / 2 - 12) & inside
    out[~inside] = out[rim].mean(axis=0)
    rgba = np.dstack([out, alpha * 255]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(f"{out_stem}.png")

    # --- bump map ---
    bgain, boff = renormalize(lum, inside, BUMP_MEAN, BUMP_STD)
    bump = np.clip(lum * bgain + boff, 0, 255)
    bump = bump * alpha + BUMP_FLAT * (1 - alpha)   # feather into the flat surround
    bump[~inside] = BUMP_FLAT
    Image.fromarray(bump.astype(np.uint8), "L").save(f"{out_stem}-bump.png")

    print(f"  -> {out_stem}.png (RGBA) + {out_stem}-bump.png (L)")
    print(f"     colour inside: mean {out[inside].mean():.1f}  bump inside: mean "
          f"{bump[inside].mean():.1f} std {bump[inside].std():.1f}\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
