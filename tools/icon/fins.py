import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from fish import *
from skin import srgb, sstep

def bez(p0, p1, p2, n=24):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * np.array(p0) + 2 * (1 - t) * t * np.array(p1) + t ** 2 * np.array(p2)

def P(X, Y):
    """TL-unit point -> fish canvas px"""
    return np.array([px(X), py(Y)], np.float32)

def seg_dist(xx, yy, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy + 1e-9
    t = np.clip(((xx - a[0]) * vx + (yy - a[1]) * vy) / L2, 0, 1)
    dx = xx - (a[0] + t * vx); dy = yy - (a[1] + t * vy)
    return np.sqrt(dx * dx + dy * dy), t, np.sqrt(L2)

def ray_field(xx, yy, rays, w0=2.6, taper=0.55):
    """rays: polylines (N,2) base->tip, or (polyline, width_start, width_end) tuples.
    Returns (ray intensity 0..1, nearest-ray param 0..1, s = position between two nearest rays: 0 on a ray .. .5 midway)."""
    best = np.full(xx.shape, 1e9, np.float32); second = np.full(xx.shape, 1e9, np.float32)
    par = np.zeros(xx.shape, np.float32)
    ws = np.full(xx.shape, 1.0, np.float32); we = np.full(xx.shape, 1 - taper, np.float32)
    for r in rays:
        if isinstance(r, tuple):
            r, rs, re_ = r
        else:
            rs, re_ = 1.0, 1 - taper
        seglen = np.sqrt(((r[1:] - r[:-1]) ** 2).sum(1)); cum = np.concatenate([[0], np.cumsum(seglen)]); tot = cum[-1]
        dr = np.full(xx.shape, 1e9, np.float32); pr_ = np.zeros(xx.shape, np.float32)
        for i in range(len(r) - 1):
            d, t, L = seg_dist(xx, yy, r[i], r[i + 1])
            g = (cum[i] + t * L) / tot
            upd = d < dr
            dr = np.where(upd, d, dr); pr_ = np.where(upd, g, pr_)
        better = dr < best
        second = np.where(better, best, np.minimum(second, dr))
        par = np.where(better, pr_, par); ws = np.where(better, rs, ws); we = np.where(better, re_, we)
        best = np.where(better, dr, best)
    w = w0 * (ws + (we - ws) * par)
    s = best / (best + second + 1e-6)
    return np.exp(-(best / np.maximum(w, .3)) ** 2), par, s

class Layer:
    """Accumulates premultiplied RGB + alpha on the fish canvas."""
    def __init__(self):
        self.rgb = np.zeros((FH, FW, 3), np.float32); self.a = np.zeros((FH, FW), np.float32)
    def over(self, rgb, a):
        a = np.clip(a, 0, 1)
        self.rgb = rgb * a[..., None] + self.rgb * (1 - a[..., None])
        self.a = a + self.a * (1 - a)

def fin_mask(points, bbox_pad=6):
    m = poly_mask([tuple(p) for p in points])
    return m

def bbox_grid(points, pad=12):
    pts = np.array(points); x0 = int(max(0, pts[:, 0].min() - pad)); x1 = int(min(FW, pts[:, 0].max() + pad))
    y0 = int(max(0, pts[:, 1].min() - pad)); y1 = int(min(FH, pts[:, 1].max() + pad))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    return (y0, y1, x0, x1), xx, yy

def paint(layer, bb, rgb_local, a_local):
    y0, y1, x0, x1 = bb
    full_rgb = np.zeros((FH, FW, 3), np.float32); full_a = np.zeros((FH, FW), np.float32)
    full_rgb[y0:y1, x0:x1] = rgb_local; full_a[y0:y1, x0:x1] = a_local
    layer.over(full_rgb, full_a)

def soft_disc(xx, yy, cx, cy, r, soft=.5):
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return 1 - sstep(r * (1 - soft), r, d)

def fin_common(layer, outline, rays, base_col, tip_col, mem_a, ray_col, ray_a, t_of, spots=None,
               ray_w=2.6, glow=0.0, edge_col=None, edge_w=0.0, fade_base=0.0, fade_x=None, hl=0.22, edge_hl=0.18):
    """Generic translucent fin. t_of(xx,yy)->0 at base, 1 at outer edge."""
    bb, xx, yy = bbox_grid(outline)
    y0, y1, x0, x1 = bb
    mask = fin_mask(outline)[y0:y1, x0:x1]
    ray, par, sfrac = ray_field(xx, yy, rays, w0=ray_w)
    t = np.clip(t_of(xx, yy), 0, 1)
    col = srgb(base_col)[None, None] * (1 - t[..., None]) + srgb(tip_col)[None, None] * t[..., None]
    rc = srgb(ray_col)
    rgb = col * (1 - ray[..., None] * .55) + rc[None, None] * ray[..., None] * .55
    # light passing through the membrane: brighter, warmer toward the free edge
    rgb = rgb * (1.0 + glow * t[..., None])
    # membrane relief: slightly bowed between rays, plus a little mottling
    bulge = np.sin(np.pi * np.clip(2 * sfrac, 0, 1))
    mot = gaussian_filter(np.random.default_rng(int(xx.mean()) % 997).standard_normal(xx.shape).astype(np.float32), 6)
    mot = mot / (mot.std() + 1e-6)
    rgb = rgb * (1 + 0.16 * bulge[..., None] + 0.07 * mot[..., None])
    if hl > 0:                                   # specular glint running along each ray, on the lit side
        sh = np.array([-1.7, -2.1], np.float32)
        shifted = [((r[0] + sh, r[1] * .6, r[2] * .6) if isinstance(r, tuple) else r + sh) for r in rays]
        hlf, _, _ = ray_field(xx, yy, shifted, w0=ray_w * .55)
        rgb = rgb + (hlf * (1 - ray))[..., None] * np.array([.30, .27, .18], np.float32) * hl * 3.0
    if edge_hl > 0:                              # light transmitted through the thin free edge
        eh = sstep(.86, 1.0, t)
        rgb = rgb + eh[..., None] * np.array([.30, .26, .12], np.float32) * edge_hl * (0.6 + 0.8 * mot[..., None] * 0 + 0.4)
    a = mem_a * (1 - fade_base * (1 - sstep(0, .35, t))) * (1 + 0.06 * bulge + 0.05 * mot) + ray_a * ray
    if edge_col is not None:
        e = sstep(1 - edge_w, 1.0, t); rgb = rgb * (1 - e[..., None]) + srgb(edge_col)[None, None] * e[..., None]
    if spots:
        s = np.zeros_like(xx)
        for (cx, cy, r) in spots:
            s = np.maximum(s, soft_disc(xx, yy, cx, cy, r))
        sc = srgb('#16110a')
        rgb = rgb * (1 - s[..., None] * .8) + sc[None, None] * s[..., None] * .8
        a = np.maximum(a, s * .85)
    af = np.clip(a, 0, 1) * mask
    if fade_x is not None:
        af = af * sstep(px(fade_x[0]), px(fade_x[1]), xx)
    paint(layer, bb, rgb * 1.15, af)
