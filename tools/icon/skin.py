import numpy as np
from scipy.ndimage import gaussian_filter
from fish import *

def srgb(h):
    h = h.lstrip('#'); return (np.array([int(h[i:i+2], 16) for i in (0, 2, 4)], np.float32) / 255.0) ** 2.2

# flank colour ramp, back (v=0) -> belly (v=1)
RAMP = [(0.00, '#4a3f12'), (0.10, '#74641c'), (0.24, '#9a8326'), (0.40, '#bb9a35'),
        (0.54, '#d0b04c'), (0.68, '#e0cc88'), (0.82, '#ece3bf'), (0.93, '#f5f0de'), (1.00, '#f5f4ec')]

def ramp(v):
    xs = [r[0] for r in RAMP]; cols = np.stack([srgb(r[1]) for r in RAMP])
    out = np.zeros(v.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(v, xs, cols[:, c])
    return out

def hash2(ci, ri, seed=0):
    h = (ci.astype(np.int64) * 73856093) ^ (ri.astype(np.int64) * 19349663) ^ (seed * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h & 0xFFFF) / 65535.0).astype(np.float32)

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def scales(a, b, ratio=1.5, R=1.06, shadow_w=0.34, warp=None, seed=0):
    """Overlapping fish scales. a: scale index along body, b: row coordinate.
    Returns dict of per-pixel fields. Scales are painted so that the most forward
    covering scale is on top (its rear edge overlies the scale behind it)."""
    if warp is not None:
        a = a + warp[0]; b = b + warp[1]
    xp = a * ratio           # physical x in row-pitch units
    yp = b
    j0 = np.floor(yp - 0.5).astype(np.int32)
    cands = []
    for dj in (-1, 0, 1, 2):
        j = j0 + dj
        off = 0.5 * (j % 2)
        i0 = np.floor(xp / ratio - off + 0.5).astype(np.int32)
        for di in (-2, -1, 0, 1, 2):
            i = i0 + di
            cx = (i + off) * ratio
            cy = j + 0.5
            dx, dy = xp - cx, yp - cy
            cands.append((i, j, cx, dx, dy, np.sqrt(dx * dx + dy * dy)))
    big = np.float32(1e9)
    best_cx = np.full(xp.shape, big, np.float32)
    best = [np.zeros(xp.shape, np.float32) for _ in range(5)]    # dx, dy, dist, i, j
    for (i, j, cx, dx, dy, d) in cands:
        take = (d <= R) & (cx < best_cx)
        best_cx = np.where(take, cx, best_cx)
        for arr, val in zip(best, (dx, dy, d, i.astype(np.float32), j.astype(np.float32))):
            arr[:] = np.where(take, val, arr)
    # fallback: nearest centre for any uncovered pixel
    uncovered = best_cx >= big
    if uncovered.any():
        nd = np.full(xp.shape, big, np.float32)
        for (i, j, cx, dx, dy, d) in cands:
            t = uncovered & (d < nd)
            nd = np.where(t, d, nd)
            for arr, val in zip(best, (dx, dy, d, i.astype(np.float32), j.astype(np.float32))):
                arr[:] = np.where(t, val, arr)
            best_cx = np.where(t, cx, best_cx)
    dx, dy, dist, ii, jj = best
    # soft shadow cast on this scale by the (more forward) scales whose edge it sits behind
    shadow = np.zeros(xp.shape, np.float32)
    for (i, j, cx, ddx, ddy, d) in cands:
        fwd = (cx < best_cx - 1e-3) & (d > R)
        shadow = np.maximum(shadow, np.where(fwd, 1 - sstep(0, shadow_w, d - R), 0))
    u, w = dx / R, dy / R
    h = 0.55 * (0.5 * u + 0.5) + 0.45 * np.clip(1 - (u * u + w * w), 0, 1)
    return dict(h=h.astype(np.float32), shadow=shadow, u=u, w=w, i=ii, j=jj, dist=dist)

class Skin:
    def __init__(self, b, n_rows=32, seed=5, vis=None):
        self.b = b
        X, v = b.X, b.v
        Xc = np.clip(X, 0, XB)
        shape = X.shape
        Xs = np.linspace(0, XB, 4000)
        depth = (BOT(Xs) - TOP(Xs)) * TL
        pitch = np.maximum(depth / n_rows, 4)              # row pitch in px
        aX = np.concatenate([[0], np.cumsum(TL * np.diff(Xs) / (pitch[1:] * 1.5))])
        a = np.interp(Xc, Xs, aX).astype(np.float32)
        bb = (v * n_rows).astype(np.float32)
        wa = fbm(shape, [26, 60], [1, 1], seed + 20) * 0.22
        wb = fbm(shape, [26, 60], [1, 1], seed + 21) * 0.16
        sc = scales(a, bb, warp=(wa, wb), seed=seed)
        self.sc = sc
        head_fade = sstep(.040, .20, Xc) if vis is None else vis
        self.vis = head_fade
        row_px = np.interp(Xc, Xs, pitch).astype(np.float32)
        rnd = hash2(sc['i'], sc['j'], seed)
        self.rnd = rnd
        self.h = (sc['h'] * (0.92 + 0.16 * rnd) * row_px * 0.30 * head_fade).astype(np.float32)

        # --- colour ---------------------------------------------------------
        alb = ramp(np.clip(v + 0.02 * (Xc - .3), 0, 1))
        lo = fbm(shape, [18, 40], [1, 1], seed + 1)
        mid = fbm(shape, [5, 11], [1, 1], seed + 2)
        hi = fbm(shape, [1.3, 2.6], [1, 1], seed + 3)
        warpx = fbm(shape, [28, 60], [1, 1], seed + 4) * 0.009 + fbm(shape, [8, 16], [1, 1], seed + 5) * 0.003
        Xw = X + warpx
        sad = np.zeros(shape, np.float32)
        vv = v + 0.035 * lo
        for (xc, wd, dv) in [(.215, .016, .28), (.292, .024, .46), (.372, .028, .53), (.452, .028, .53),
                              (.534, .027, .50), (.614, .024, .46), (.694, .019, .40)]:
            wk = wd * (1 - 0.40 * sstep(0, dv, v))             # bars taper toward the belly
            d = np.abs(Xw - xc - 0.020 * v) / wk
            col = np.exp(-d ** 3)                              # flat top, soft shoulders
            fade = 1 - sstep(dv - 0.22, dv, vv)
            sad += col * fade
        sad = np.clip(sad, 0, 1) * (0.80 + 0.20 * mid)
        sad *= sstep(.17, .24, Xc) * (1 - sstep(.78, .88, Xc) * .7)
        dark = srgb('#33280b')
        mott = 1 + 0.12 * lo[..., None] * (1 - sstep(.45, .85, v))[..., None] + 0.05 * mid[..., None]
        alb = alb * mott
        alb = alb * (1 - sad[..., None] * .80) + dark * sad[..., None] * .80
        freckle = sstep(1.3, 2.4, hi) * (1 - sstep(.30, .62, v)) * .22
        alb = alb * (1 - freckle[..., None]) + dark * freckle[..., None]
        # per-scale tint, soft shadow behind every ledge, tiny rim highlight on the rear edge
        alb = alb * (1 + 0.09 * (rnd - .5) * 2 * head_fade)[..., None]
        # per-scale hue drift (some scales greener, some more red-gold) and a brassy lateral band
        h2 = (hash2(sc['i'], sc['j'], seed + 7) - .5) * 2
        alb = alb * np.stack([1 + 0.045 * h2, 1 + 0.012 * h2, 1 - 0.10 * h2], -1) * 1.0
        band = np.exp(-((v - .44) / .12) ** 2)[..., None] * sstep(.12, .3, Xc)[..., None]
        alb = alb * (1 + 0.09 * band * np.array([1.0, .90, .35], np.float32))
        alb = alb * (1 - 0.30 * (sc['shadow'] * head_fade))[..., None]
        # lateral line: dark pore on the rear of each scale in the row nearest v~0.40
        latrow = np.round(0.40 * n_rows - 0.5)
        pore = np.exp(-(((sc['u'] - .62) ** 2 + sc['w'] ** 2) / (2 * .11 ** 2))) * (np.abs(sc['j'] - latrow) < .5)
        pore *= sstep(.25, .30, Xc) * (1 - sstep(.82, .90, Xc))
        alb = alb * (1 - 0.65 * pore[..., None])
        self.albedo = alb.astype(np.float32)
        self.sad = sad
        self.v = v

if __name__ == '__main__':
    b = Body()
    sk = Skin(b)
    N = b.normals(extra_height=sk.h, sigma=0.7)
    glint = (0.55 + 0.9 * sk.rnd)
    rgb = shade(sk.albedo, N, spec=.42, gloss=38, spec_mask=glint * (0.4 + 0.6 * sstep(.0, .35, 1 - sk.v)))
    save_preview(rgb, b.alpha, 'step2.png')
    save_preview(rgb[250:600, 350:1150], b.alpha[250:600, 350:1150], 'step2_crop.png')
    print('ok')
