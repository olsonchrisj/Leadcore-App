import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates
from scipy.spatial import cKDTree
from fish import px, py, fbm, smoothstep, unit
from skin import srgb, sstep
from render_fish import render_fish
from head import mouth_open_point

S = 2048                      # working canvas (downsampled 2x to 1024)
VARIANTS = {
    # name: (scale, rot, nose target in scene px, cord hw, crimp hw, leader hw, ferrule offset from nose)
    'full':  dict(scale=1.00, rot=8.0,  nose=(150.0, 1030.0), cord_hw=19.0, crimp_hw=17.5, lead_hw=2.6, ferrule=(-10.0, -310.0)),
    'close': dict(scale=1.90, rot=11.0, nose=(135.0, 985.0), cord_hw=28.0, crimp_hw=25.0, lead_hw=3.7, ferrule=(-8.0, -430.0)),
}
V = dict(VARIANTS['full'])
SCALE = V['scale']; ROT = V['rot']
C_F = np.array([px(.5), 410.0])
C_S = np.array([1012.0, 1215.0])

def set_variant(name, zoom=1.0):
    """zoom<1 shrinks the whole composition about the canvas centre (used for the maskable icon)."""
    global V, SCALE, ROT, C_S
    V = dict(VARIANTS[name]); SCALE = V['scale'] * zoom; ROT = V['rot']
    nose_f = np.array([px(0.0), 400.0])
    tgt = np.array(V['nose'], np.float32); tgt = np.array([S / 2, S / 2], np.float32) + (tgt - S / 2) * zoom
    C_S = tgt - rot(ROT) @ ((nose_f - C_F) * SCALE)
    return zoom
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

def rot(deg):
    a = np.deg2rad(deg); return np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]], np.float32)

def to_scene(p):
    p = np.asarray(p, np.float32)
    return C_S + (rot(ROT) @ ((p - C_F) * SCALE).T).T if p.ndim == 2 else C_S + rot(ROT) @ ((p - C_F) * SCALE)

# ---------------------------------------------------------------- water
def water():
    v = yy / S; u = xx / S
    top, mid, bot = srgb('#2b9fb8'), srgb('#0e506d'), srgb('#02141f')
    t = np.clip(v, 0, 1)[..., None]
    col = np.where(t < .5, top * (1 - t / .5) + mid * (t / .5), mid * (1 - (t - .5) / .5) + bot * ((t - .5) / .5)) * 1.0
    glow = np.exp(-(((u - .36) / .55) ** 2 + ((v + .05) / .60) ** 2))[..., None]
    col = col + glow * np.array([.04, .16, .20], np.float32)
    # volumetric light shafts, leaning to the right, streaky noise along them
    rng = np.random.default_rng(2)
    streak = fbm((S, S), [(90.0), (40.0)], [1, 1], 7)    # placeholder (replaced below)
    nz = gaussian_filter(rng.standard_normal((S // 4, S // 4)).astype(np.float32), (24, 2.2))
    nz = (nz - nz.mean()) / (nz.std() + 1e-6)
    nz = np.asarray(Image.fromarray(nz).resize((S, S), Image.BICUBIC), np.float32)
    shafts = np.zeros((S, S), np.float32)
    tilt = 0.33
    for x0, w, amp in [(.12, .030, .50), (.22, .055, .85), (.36, .040, .60), (.50, .070, 1.0), (.64, .035, .55), (.78, .050, .70), (.92, .040, .40)]:
        d = u - x0 - v * tilt
        shafts += amp * np.exp(-(d / w) ** 2) * (0.75 + 0.35 * nz)
    shafts = np.clip(shafts, 0, None) * (1 - v) ** 1.4
    col = col + shafts[..., None] * np.array([.075, .17, .19], np.float32)
    # slow caustic shimmer near the top
    cz = gaussian_filter(rng.standard_normal((S // 2, S // 2)).astype(np.float32), 9)
    cz = np.asarray(Image.fromarray((cz - cz.mean()) / (cz.std() + 1e-6)).resize((S, S), Image.BICUBIC), np.float32)
    caust = np.clip(cz - .6, 0, 1) ** 1.5 * (1 - sstep(0, .5, v))
    return col.astype(np.float32)

def particles(col):
    rng = np.random.default_rng(9)
    layer = np.zeros((S, S), np.float32)
    for _ in range(170):
        cx, cy = rng.uniform(0, S), rng.uniform(0, S)
        r = rng.choice([2.0, 2.6, 3.4, 5.0], p=[.4, .3, .2, .1]); br = rng.uniform(.10, .45) * (1 - cy / S * .5)
        x0, x1 = int(max(cx - 4 * r, 0)), int(min(cx + 4 * r, S)); y0, y1 = int(max(cy - 4 * r, 0)), int(min(cy + 4 * r, S))
        if x1 <= x0 or y1 <= y0: continue
        gx, gy = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
        layer[y0:y1, x0:x1] += br * np.exp(-((gx - cx) ** 2 + (gy - cy) ** 2) / (2 * (r * .7) ** 2))
    # bokeh discs, large and faint, hugging the edges
    for cx, cy, r, br in [(1880, 260, 62, .07), (1760, 150, 34, .06), (1960, 520, 44, .05), (140, 1700, 70, .05), (300, 1860, 40, .05), (1700, 1850, 56, .05), (1900, 1500, 36, .045)]:
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        disc = (1 - sstep(r - 2.5, r + 1.5, d)) * (0.55 + 0.45 * sstep(r * .55, r, d))
        layer += br * disc
    return col + layer[..., None] * np.array([.55, .85, .95], np.float32)

def caustics(seed=5):
    rng = np.random.default_rng(seed); out = np.zeros((S, S), np.float32)
    for sig, amp in [(30, 1.0), (15, .55)]:
        n = gaussian_filter(rng.standard_normal((S // 2, S // 2)).astype(np.float32), sig / 2)
        n = (n - n.mean()) / (n.std() + 1e-6)
        n = np.asarray(Image.fromarray(n).resize((S, S), Image.BICUBIC), np.float32)
        out += amp * np.exp(-(n / .30) ** 2)
    return out / 1.55

# ---------------------------------------------------------------- fish
def place_fish(base):
    pr, pa = render_fish()
    R = rot(ROT)
    sx = xx - C_S[0]; sy = yy - C_S[1]
    Rinv = R.T
    fx = (Rinv[0, 0] * sx + Rinv[0, 1] * sy) / SCALE + C_F[0]
    fy = (Rinv[1, 0] * sx + Rinv[1, 1] * sy) / SCALE + C_F[1]
    coords = np.stack([fy, fx])
    out = np.empty_like(base)
    a = map_coordinates(pa, coords, order=1, mode='constant', cval=0.0)
    chans = [map_coordinates(pr[..., c], coords, order=1, mode='constant', cval=0.0) for c in range(3)]
    prm = np.stack(chans, -1)
    # soft contact shadow below the fish
    sh = gaussian_filter(a, 38)
    sh = np.roll(np.roll(sh, 70, axis=0), -10, axis=1)
    base = base * (1 - 0.30 * sh[..., None])
    # shallow depth of field: sharp head, progressively softer body toward the right edge
    if V.get('dof', True) and SCALE > 1.5:
        a_p = a.copy(); blur_a = gaussian_filter(a, 4.0)
        blur_c = np.stack([gaussian_filter(prm[..., ch], 4.0) for ch in range(3)], -1)
        wdof = sstep(1250, 2100, xx) * 0.85
        prm = prm * (1 - wdof[..., None]) + blur_c * wdof[..., None]
        a = a * (1 - wdof) + blur_a * wdof
    cz = caustics()
    wtop = np.clip(1 - (yy - 780) / 760, 0, 1) ** 1.1
    prm = prm * (1 + 0.20 * (cz * wtop)[..., None])
    return prm + base * (1 - a[..., None]), a

# ---------------------------------------------------------------- cord / crimp / leader
def bezier(p0, p1, p2, p3, n=900):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

def tube_coords(path, region):
    """for pixels in region: nearest path sample -> (offset, along, valid-dist)."""
    tree = cKDTree(path)
    ys, xs = region
    d, idx = tree.query(np.stack([xs.ravel(), ys.ravel()], -1), workers=-1)
    tang = np.gradient(path, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    nrm = np.stack([-tang[:, 1], tang[:, 0]], -1)
    seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    P = np.stack([xs.ravel(), ys.ravel()], -1) - path[idx]
    off = (P * nrm[idx]).sum(1); along = seg[idx] + (P * tang[idx]).sum(1)
    sh = xs.shape
    return off.reshape(sh), along.reshape(sh), d.reshape(sh), nrm[idx].reshape(sh + (2,))

SEG = [srgb('#A6192E'), srgb('#EFE1C6'), srgb('#EAAA00'), srgb('#1d7a52'), srgb('#8a1226')]

def draw_cord(img, path, hw=19.0, seg_len=152.0, t_end=None):
    pad = int(hw + 6)
    x0, x1 = int(max(path[:, 0].min() - pad, 0)), int(min(path[:, 0].max() + pad, S))
    y0, y1 = int(max(path[:, 1].min() - pad, 0)), int(min(path[:, 1].max() + pad, S))
    gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    off, along, dist, nrm = tube_coords(path, (gy, gx))
    u = np.clip(off / hw, -1.2, 1.2)
    inside = 1 - sstep(hw - 1.2, hw + 1.2, np.abs(off))
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    Nv = np.stack([u * nrm[..., 0], u * nrm[..., 1], nz], -1)
    L = unit([-.32, -.78, .54])
    ndl = np.clip(np.einsum('hwc,c->hw', Nv, L), 0, 1)
    # colour by segment with a short blend between dyes
    k = along / seg_len
    i0 = np.floor(k).astype(int); f = k - i0
    blend = sstep(.94, 1.0, f)
    c0 = np.stack([np.take(np.array([s[c] for s in SEG]), i0 % 5) for c in range(3)], -1)
    c1 = np.stack([np.take(np.array([s[c] for s in SEG]), (i0 + 1) % 5) for c in range(3)], -1)
    col = c0 * (1 - blend[..., None]) + c1 * blend[..., None]
    # braid: two crossing strand sets, subtle luminance modulation
    pitch = 16.0
    a1 = np.cos(2 * np.pi * (along / pitch + u * .55)); a2 = np.cos(2 * np.pi * (along / pitch - u * .55 + .5))
    braid = np.maximum(a1, a2) * .5 + .5
    col = col * (0.80 + 0.28 * braid[..., None])
    # ring of dye at each colour change (slightly darker)
    col = col * (1 - 0.16 * (np.exp(-((f) / .018) ** 2) + np.exp(-((1 - f) / .018) ** 2)))[..., None]
    amb = 0.22
    lit = col * (amb + 1.05 * ndl[..., None] * np.array([1.0, .97, .90], np.float32))
    H = unit(L + np.array([0, 0, 1], np.float32))
    spec = np.clip(np.einsum('hwc,c->hw', Nv, H), 0, 1) ** 36 * .20
    lit = lit + spec[..., None]
    # rim of cool bounce light from the water on the shaded side
    rim = (1 - nz) ** 2.0 * (1 - ndl) * .10
    lit = lit + rim[..., None] * np.array([.2, .7, .9], np.float32)
    a = inside
    if t_end is not None:
        a = a * (along <= t_end)
    # shadow on the water
    sh = np.zeros((S, S), np.float32); sh[y0:y1, x0:x1] = a
    sh = gaussian_filter(sh, 7); sh = np.roll(np.roll(sh, 10, 0), 7, 1)
    img = img * (1 - 0.35 * sh[..., None])
    sl = (slice(y0, y1), slice(x0, x1))
    img[sl] = lit * a[..., None] + img[sl] * (1 - a[..., None])
    return img

def draw_crimp(img, p_start, direction, length=58.0, hw=17.0):
    d = unit(direction)[:2]; d = d / np.linalg.norm(d)
    path = np.stack([p_start + d * s for s in np.linspace(-6, length, 120)])
    pad = int(hw + 6)
    x0, x1 = int(max(path[:, 0].min() - pad, 0)), int(min(path[:, 0].max() + pad, S))
    y0, y1 = int(max(path[:, 1].min() - pad, 0)), int(min(path[:, 1].max() + pad, S))
    gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    nrm = np.array([-d[1], d[0]], np.float32)
    rel = np.stack([gx - p_start[0], gy - p_start[1]], -1)
    along = (rel * d).sum(-1); off = (rel * nrm).sum(-1)
    u = np.clip(off / hw, -1, 1)
    inside = (1 - sstep(hw - 1.2, hw + 1.2, np.abs(off))) * sstep(-7, -5, along) * (1 - sstep(length - 1, length + 1, along))
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    # chrome-like environment: bright sky band upper-left, dark teal lower-right, tight specular streak
    env = 0.30 + 0.55 * np.exp(-((u + .45) / .30) ** 2) + 0.25 * np.exp(-((u - .62) / .22) ** 2) - 0.2 * sstep(.2, .9, u)
    col = np.stack([env * .80, env * .88, env * .92], -1) * (0.55 + 0.45 * nz[..., None])
    ridge = 1 - 0.25 * np.exp(-(((along - 12) / 2.2) ** 2)) - 0.25 * np.exp(-(((along - 29) / 2.2) ** 2)) - 0.25 * np.exp(-(((along - 46) / 2.2) ** 2))
    col = col * ridge[..., None]
    col += (np.exp(-((u + .50) / .08) ** 2) * .55)[..., None]
    col *= 1 - 0.5 * sstep(.82, 1.0, np.abs(u))[..., None]
    sh = np.zeros((S, S), np.float32); sh[y0:y1, x0:x1] = inside
    sh = gaussian_filter(sh, 5); sh = np.roll(np.roll(sh, 8, 0), 6, 1)
    img = img * (1 - 0.32 * sh[..., None])
    sl = (slice(y0, y1), slice(x0, x1))
    img[sl] = col * inside[..., None] + img[sl] * (1 - inside[..., None])
    return img, p_start + d * length

def draw_leader(img, path, hw=2.6):
    pad = int(hw + 6)
    x0, x1 = int(max(path[:, 0].min() - pad, 0)), int(min(path[:, 0].max() + pad, S))
    y0, y1 = int(max(path[:, 1].min() - pad, 0)), int(min(path[:, 1].max() + pad, S))
    gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    off, along, dist, nrm = tube_coords(path, (gy, gx))
    u = np.clip(off / hw, -1, 1)
    inside = 1 - sstep(hw - .9, hw + .9, np.abs(off))
    nz = np.sqrt(np.clip(1 - u * u, 0, 1))
    col = np.array([.78, .90, .92], np.float32) * (0.40 + 0.60 * nz[..., None]) + (np.exp(-((u + .45) / .25) ** 2) * .5)[..., None]
    a = inside * .92
    sh = np.zeros((S, S), np.float32); sh[y0:y1, x0:x1] = inside
    sh = gaussian_filter(sh, 3); sh = np.roll(np.roll(sh, 6, 0), 4, 1)
    img = img * (1 - 0.30 * sh[..., None])
    sl = (slice(y0, y1), slice(x0, x1))
    img[sl] = col * a[..., None] + img[sl] * (1 - a[..., None])
    return img

# ---------------------------------------------------------------- grade / export
def finalize(img):
    bright = np.clip(img - .62, 0, None)
    img = img + 0.32 * gaussian_filter(bright, (16, 16, 0))
    v = (yy / S - .5); u = (xx / S - .5)
    vig = 1 - 0.42 * np.clip((u ** 2 + v ** 2) * 2.0, 0, 1) ** 1.2
    img = img * vig[..., None]
    # filmic shoulder on highlights, then sRGB
    img = np.clip(img, 0, None)
    img = np.where(img > .78, .78 + (1 - np.exp(-(img - .78) * 3.2)) * .22 / 1.0 * 1.0, img)
    srgb_ = np.clip(img, 0, 1) ** (1 / 2.2)
    # gentle contrast + warm/cool split
    srgb_ = np.clip((srgb_ - .5) * 1.06 + .5, 0, 1)
    lum = (srgb_ * np.array([.30, .59, .11], np.float32)).sum(-1, keepdims=True)
    srgb_ = np.clip(lum + (srgb_ - lum) * 1.09, 0, 1)
    rng = np.random.default_rng(1)
    srgb_ += rng.normal(0, .004, srgb_.shape).astype(np.float32)
    return (np.clip(srgb_, 0, 1) * 255 + .5).astype(np.uint8)

def build(zoom=1.0):
    bg = water(); bg = particles(bg)
    img, fish_a = place_fish(bg)
    nose = to_scene(np.array([px(0.0) + 2.0, 0.0]))
    mouth = to_scene(mouth_open_point())
    k = zoom
    ferrule = mouth + np.array(V['ferrule'], np.float32) * k
    top_y = -140.0 if zoom >= .999 else -1800.0
    P0 = np.array([ferrule[0] + 190.0 * k, top_y]); P3 = ferrule
    path = bezier(P0, P0 + np.array([-30.0 * k, 420.0 * k + (0 if zoom >= .999 else 900.0)]), P3 + np.array([26.0 * k, -330.0 * k]), P3, 1800)
    img = draw_cord(img, path, hw=V['cord_hw'] * k, seg_len=152.0 * V['cord_hw'] / 19.0 * k)
    tangent = path[-1] - path[-6]
    img, crimp_end = draw_crimp(img, path[-1] - tangent / np.linalg.norm(tangent) * 6 * k, tangent, length=62.0 * V['crimp_hw'] / 17.5 * k, hw=V['crimp_hw'] * k)
    lead = bezier(crimp_end, crimp_end + np.array([-4.0, 150.0]) * k, mouth + np.array([-70.0, -14.0]) * k, mouth + np.array([6.0, 0.0]) * k, 240)
    img = draw_leader(img, lead, hw=V['lead_hw'] * k)
    return img, fish_a

if __name__ == '__main__':
    import sys
    name = sys.argv[1] if len(sys.argv) > 1 else 'full'
    zoom = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    set_variant(name, zoom)
    img, fa = build(zoom)
    out = finalize(img)
    tag = name + ('' if zoom >= .999 else '_zoom')
    Image.fromarray(out).resize((1024, 1024), Image.LANCZOS).save(f'scene_{tag}.png')
    Image.fromarray(out).save(f'scene_{tag}_2048.png')
    print('ok', tag)
