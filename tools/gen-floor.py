"""Procedural polished porcelain floor (cream marble look, square 60 cm tiles, light grout).
Writes assets/tex/floor_diff.jpg, floor_rough.jpg, floor_nor.png (OpenGL normal convention).
usage: python3 tools/gen-floor.py [size]   (texture covers 4x4 tiles = 2.4 m)
"""
import sys
import numpy as np
from PIL import Image

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4096
TILES = 4
T = N // TILES
rng = np.random.default_rng(7)

def fbm(shape, octaves, base, seed, gain=0.5):
    r = np.random.default_rng(seed)
    h, w = shape
    out = np.zeros(shape, np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = base * 2 ** o
        gh, gw = max(2, int(h / f) + 2), max(2, int(w / f) + 2)
        g = r.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((g * 65535).astype(np.uint16)).resize((int((gw - 1) * f), int((gh - 1) * f)), Image.BICUBIC)
        a = np.asarray(img, np.float32)[:h, :w] / 65535.0
        out += a * amp
        tot += amp
        amp *= gain
    return out / tot

def tile_pattern(seed):
    r = np.random.default_rng(seed)
    clouds = fbm((T, T), 6, T / 3.0, seed * 3 + 1)
    clouds2 = fbm((T, T), 5, T / 9.0, seed * 3 + 2)
    # meandering veins from ridged, domain-warped noise (one soft network per tile)
    wx = fbm((T, T), 4, T / 3.0, seed * 3 + 3) - 0.5
    wy = fbm((T, T), 4, T / 3.0, seed * 3 + 4) - 0.5
    n1 = fbm((T, T), 5, T / 2.2, seed * 3 + 6)
    # cheap warp: shift rows/cols by the warp fields
    yy, xx = np.mgrid[0:T, 0:T]
    sx = np.clip((xx + wx * T * 0.25).astype(np.int32), 0, T - 1)
    sy = np.clip((yy + wy * T * 0.25).astype(np.int32), 0, T - 1)
    n1 = n1[sy, sx]
    ridge = 1.0 - np.abs(2.0 * n1 - 1.0)
    vein = ridge ** r.uniform(22, 36) * 0.75 + ridge ** 6 * 0.18
    vein *= fbm((T, T), 3, T / 4.0, seed * 3 + 5) * 1.5
    speck = (fbm((T, T), 2, 3.0, seed * 7 + 9) > 0.78).astype(np.float32) * 0.6
    base = np.array([0.905, 0.855, 0.785]) * r.uniform(0.975, 1.02)
    tint = np.array([r.uniform(-0.004, 0.004), r.uniform(-0.003, 0.003), r.uniform(-0.004, 0.002)])
    c = clouds[..., None] - 0.5
    c2 = clouds2[..., None] - 0.5
    col = base + tint + c * np.array([0.10, 0.10, 0.11]) + c2 * np.array([0.05, 0.05, 0.05])
    col -= vein[..., None] * np.array([0.07, 0.075, 0.08])
    col -= speck[..., None] * np.array([0.02, 0.02, 0.02])
    rough = 0.10 + (clouds2 - 0.5) * 0.04 + fbm((T, T), 3, T / 5.0, seed * 5 + 7) * 0.05
    return np.clip(col, 0, 1), rough

diff = np.zeros((N, N, 3), np.float32)
rough = np.zeros((N, N), np.float32)
for ty in range(TILES):
    for tx in range(TILES):
        c, ro = tile_pattern(1000 + ty * 17 + tx * 131)
        diff[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = c
        rough[ty * T:(ty + 1) * T, tx * T:(tx + 1) * T] = ro

# grout & bevel (distance to tile edge in mm; 600 mm per tile)
mm = 600.0 / T
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
fx = (xx % T) * mm
fy = (yy % T) * mm
dx = np.minimum(fx, 600 - fx)
dy = np.minimum(fy, 600 - fy)
d = np.minimum(dx, dy)
grout_half = 1.2
bevel = 1.6
groutMask = np.clip((grout_half + 0.35 - d) / 0.7, 0, 1)
grout_col = np.array([0.80, 0.765, 0.705])
gnoise = fbm((N, N), 3, 6.0, 99)[..., None]
diff = diff * (1 - groutMask[..., None]) + (grout_col * (0.92 + 0.16 * gnoise)) * groutMask[..., None]
rough = rough * (1 - groutMask) + 0.75 * groutMask
# subtle edge darkening near grout (dirt in the bevel)
edge = np.clip((grout_half + bevel - d) / bevel, 0, 1) * (1 - groutMask)
diff *= (1 - 0.06 * edge[..., None])
rough += edge * 0.12

# height: tiles flat, bevel slopes down into grout, grout recessed
height = np.where(d < grout_half, -0.6, np.where(d < grout_half + bevel, -0.6 * (1 - (d - grout_half) / bevel) ** 2, 0.0)).astype(np.float32)
# per-tile tiny tilt (lippage) to break up reflections
for ty in range(TILES):
    for tx in range(TILES):
        r = np.random.default_rng(55 + ty * 9 + tx)
        ax, ay = r.uniform(-0.0006, 0.0006, 2)
        sl = (slice(ty * T, (ty + 1) * T), slice(tx * T, (tx + 1) * T))
        height[sl] += (fx[sl] - 300) * ax + (fy[sl] - 300) * ay
height += (fbm((N, N), 4, N / 16.0, 77) - 0.5) * 0.05
gy, gx = np.gradient(height, mm)
nrm = np.stack([-gx, gy, np.ones_like(gx)], -1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)

srgb = np.where(diff <= 0.0031308, diff * 12.92, 1.055 * np.power(np.clip(diff, 0, 1), 1 / 2.4) - 0.055)
Image.fromarray((np.clip(diff, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8) if False else (np.clip(diff, 0, 1) * 255 + 0.5).astype(np.uint8)).save('assets/tex/floor_diff.jpg', quality=92)
Image.fromarray((np.clip(rough, 0, 1) * 255 + 0.5).astype(np.uint8)).save('assets/tex/floor_rough.jpg', quality=92)
Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save('assets/tex/floor_nor.png', optimize=True)
print('ok', N)
