import numpy as np
from fins import *

RNG = np.random.default_rng(11)

def curved(b, t, bend, n=14):
    """Quadratic curve base->tip bowed sideways by `bend` (fraction of length, sign = side)."""
    b = np.asarray(b, np.float32); t = np.asarray(t, np.float32)
    d = t - b; L = np.hypot(*d) + 1e-6
    nrm = np.array([-d[1], d[0]]) / L
    return bez(b, (b + t) / 2 + nrm * bend * L, t, n)

def wavy(b, t, bend=0.0, amp=0.012, phase=0.0, n=16):
    """Base->tip ray with a gentle S-bend, so fins don't look ruled."""
    b = np.asarray(b, np.float32); t = np.asarray(t, np.float32)
    d = t - b; L = np.hypot(*d) + 1e-6; nrm = np.array([-d[1], d[0]]) / L
    u = np.linspace(0, 1, n)[:, None]
    return b + d * u + nrm * (bend * L * np.sin(np.pi * u) + amp * L * np.sin(2 * np.pi * 1.15 * u + phase) * np.sin(np.pi * u))

def jitter_tips(bases, tips, sd=.03):
    out = []
    for b_, t_ in zip(bases, tips):
        d = t_ - b_
        out.append(b_ + d * (1 + RNG.normal(0, sd)) + np.array([-d[1], d[0]]) / (np.hypot(*d) + 1e-6) * RNG.normal(0, sd * .35) * np.hypot(*d))
    return out

def scalloped(bases, tips, sag):
    """Outline: bases left->right then tips back right->left joined by concave arcs."""
    out = [bases[0]]
    for k in range(len(tips)):
        out.append(tips[k])
        if k < len(tips) - 1:
            mid = (tips[k] + tips[k + 1]) / 2
            bm = (bases[k] + bases[k + 1]) / 2
            ctrl = mid + (bm - mid) * sag
            out += list(bez(tips[k], ctrl, tips[k + 1], 7)[1:-1])
    out += [bases[-1]]
    return out

def base_cover(layer, outline, base_pts, height_px, col, strength=.8):
    """Scaled sheath over the lowest part of a fin: opaque, body-coloured, fading out."""
    bb, xx, yy = bbox_grid(outline, 8)
    y0, y1, x0, x1 = bb
    mask = fin_mask(outline)[y0:y1, x0:x1]
    # distance to the base polyline
    dist = np.full(xx.shape, 1e9, np.float32)
    for i in range(len(base_pts) - 1):
        d, t, L = seg_dist(xx, yy, base_pts[i], base_pts[i + 1]); dist = np.minimum(dist, d)
    a = (1 - sstep(0, height_px, dist)) * strength * mask
    paint(layer, bb, np.ones(a.shape + (3,), np.float32) * srgb(col)[None, None], a)

def make_fins():
    L_back = Layer(); L_front = Layer()
    # ============================================================ D1 spiny dorsal
    n = 13
    Xb = np.linspace(.304, .476, n)
    hs = np.array([.050, .064, .076, .084, .089, .090, .088, .083, .077, .070, .063, .055, .047])
    hs = hs * (1 + RNG.normal(0, .02, n))
    lean = .36
    base = [P(x, TOP(x) + .007) for x in Xb]
    tips = [P(x + h * lean, TOP(x) - h) for x, h in zip(Xb, hs)]
    tips = jitter_tips(base, tips, .035)
    outline = scalloped(base, tips, .13)
    outline = [outline[0]] + outline[1:-1] + [P(Xb[-1] + .018, TOP(Xb[-1] + .018) + .006), outline[-1]]
    rays = [wavy(b, t, RNG.normal(0, .02), .010, RNG.uniform(0, 6.3), 12) for b, t in zip(base, tips)]
    spots = []
    for k in range(n - 1):
        for (fy, r) in [(.30, 4.2), (.52, 5.4), (.70, 3.6)]:
            if RNG.random() < .30: continue
            fy_ = fy + RNG.normal(0, .04); cx = (base[k][0] + base[k + 1][0]) / 2 * (1 - fy_) + (tips[k][0] + tips[k + 1][0]) / 2 * fy_
            cy = (base[k][1] + base[k + 1][1]) / 2 * (1 - fy_) + (tips[k][1] + tips[k + 1][1]) / 2 * fy_
            spots.append((cx + RNG.normal(0, 5), cy + RNG.normal(0, 5), r * (1 + RNG.normal(0, .30))))
    top_y = min(t[1] for t in tips); base_y = np.mean([b[1] for b in base])
    fin_common(L_back, outline, rays, '#5a5527', '#a49e68', .66, '#2c2610', .70,
               lambda xx, yy: (base_y - yy) / (base_y - top_y + 1e-6), spots=spots, ray_w=2.3, glow=.35)
    # the dark patch on the membrane at the base of the rear spines: a gradient, not a blob
    bb, xx, yy = bbox_grid(outline, 8); y0, y1, x0, x1 = bb
    t_loc = np.clip((base_y - yy) / (base_y - top_y + 1e-6), 0, 1)
    nz = gaussian_filter(np.random.default_rng(4).standard_normal(xx.shape).astype(np.float32), 7); nz /= nz.std() + 1e-6
    rearw = sstep(px(.385), px(.428), xx + 18 * nz) * (1 - sstep(px(.478), px(.495), xx))
    blot = (1 - sstep(.0, .46 + .05 * nz, t_loc)) * rearw * fin_mask(outline)[y0:y1, x0:x1]
    paint(L_back, bb, np.ones(blot.shape + (3,), np.float32) * srgb('#0d0a04')[None, None], blot * .86)
    base_cover(L_back, outline, base, 24, '#5a4b16')

    # ============================================================ D2 soft dorsal
    n = 20
    Xb = np.linspace(.522, .676, n)
    t_ = np.linspace(0, 1, n)
    hs = (.040 * (1 - t_) ** .9 + .016) * (1 + RNG.normal(0, .02, n))
    base = [P(x, TOP(x) + .006) for x in Xb]
    tips = [P(x + h * .38, TOP(x) - h) for x, h in zip(Xb, hs)]
    tips = jitter_tips(base, tips, .03)
    rays = [wavy(b, t, -.07 * (1 - tt) - .02, .012, RNG.uniform(0, 6.3), 14) for b, t, tt in zip(base, tips, t_)]
    outline = scalloped(base, tips, .09)
    spots = []
    for k in range(1, n - 1):
        for fy in (.30, .58):
            r = rays[k]; i = int(fy * (len(r) - 1))
            if RNG.random() < .25: continue
            spots.append((r[i][0] + 6 + RNG.normal(0, 4), r[i][1] + RNG.normal(0, 5), 3.8 * (1 + RNG.normal(0, .3))))
    top_y = min(t[1] for t in tips); base_y = np.mean([b[1] for b in base])
    fin_common(L_back, outline, rays, '#625a25', '#a89b58', .66, '#2c2610', .70,
               lambda xx, yy: (base_y - yy) / (base_y - top_y + 1e-6), spots=spots, ray_w=2.0, glow=.30)
    base_cover(L_back, outline, base, 20, '#5a4b16')

    # ============================================================ caudal
    n = 17
    base_x = .800
    by = np.linspace(-.036, .036, n)
    trail = np.concatenate([bez(P(1.0, -.096), P(.968, -.040), P(.946, 0), 16)[:-1], bez(P(.946, 0), P(.968, .040), P(1.0, .096), 16)])
    up_edge = bez(P(base_x, -.040), P(.905, -.044), P(1.0, -.096), 22)
    lo_edge = bez(P(1.0, .096), P(.905, .044), P(base_x, .040), 22)
    outline = list(up_edge) + list(trail[1:-1]) + list(lo_edge)
    idx = np.linspace(0, len(trail) - 1, 2 * n).astype(int)
    tips = trail[idx]
    rays = []
    for k in range(n):
        b0 = P(base_x, by[k]); tl, tr = tips[2 * k], tips[2 * k + 1]; tm = (tl + tr) / 2
        fork = b0 + (tm - b0) * .58
        rays.append((wavy(b0, fork, RNG.normal(0, .006), .008, RNG.uniform(0, 6.3), 9), 1.0, .62)); rays.append((np.array([fork, tl]), .62, .30)); rays.append((np.array([fork, tr]), .62, .30))
    spots = []
    for k in range(n):
        r = rays[3 * k][0]
        for fy in (.40, .74):
            if RNG.random() < .40: continue
            q = r[0] + (rays[3 * k + 1][0][1] - r[0]) * fy
            spots.append((q[0] + RNG.normal(0, 5), q[1] + RNG.normal(0, 5), 3.4 * (1 + RNG.normal(0, .3))))
    cx0 = px(base_x)
    fin_common(L_back, outline, rays, '#a8923a', '#665621', .72, '#241d0a', .60,
               lambda xx, yy: (xx - cx0) / (px(1.0) - cx0), spots=spots, ray_w=2.0, glow=.10, fade_x=(.835, .905))
    bb, xx, yy = bbox_grid(outline, 10)
    tipx, tipy = P(1.0, .096)
    d = np.sqrt((xx - tipx) ** 2 + ((yy - tipy) * .9) ** 2)
    wt = (1 - sstep(60, 76, d)) * fin_mask(outline)[bb[0]:bb[1], bb[2]:bb[3]]
    paint(L_back, bb, np.ones(wt.shape + (3,), np.float32) * srgb('#f8f4e8')[None, None], wt * .94)

    # ============================================================ anal
    n = 13
    Xb = np.linspace(.590, .694, n); t_ = np.linspace(0, 1, n)
    hs = (.044 * (1 - .78 * t_ ** 1.7) + .004)
    base = [P(x, BOT(x) - .006) for x in Xb]
    tips = [P(x + h * .50, BOT(x) + h) for x, h in zip(Xb, hs)]
    tips = jitter_tips(base, tips, .03)
    rays = [wavy(b, t, .06 * (1 - tt) + .015, .010, RNG.uniform(0, 6.3), 14) for b, t, tt in zip(base, tips, t_)]
    outline = scalloped(base, tips, .09)
    top_y = max(t[1] for t in tips); base_y = np.mean([b[1] for b in base])
    fin_common(L_back, outline, rays, '#d4c785', '#f5f0dd', .68, '#7a6a2a', .5,
               lambda xx, yy: (yy - base_y) / (top_y - base_y + 1e-6), ray_w=1.9, glow=.06, edge_col='#fbf8ee', edge_w=.14)
    base_cover(L_back, outline, base, 18, '#d9ce98', .7)

    # ============================================================ pelvic (falcate)
    n = 7
    Xb = np.linspace(.294, .342, n)
    base = [P(x, BOT(x) - .007) for x in Xb]
    lead_tip = P(.350, BOT(.316) + .066)
    rear_tip = P(.366, BOT(.340) + .018)
    tipsP = [lead_tip + (rear_tip - lead_tip) * (i / (n - 1)) ** 1.2 + np.array([0, -8 * np.sin(np.pi * i / (n - 1))]) for i in range(n)]
    rays = [wavy(b, t, .05 + .02 * i / n, .010, RNG.uniform(0, 6.3), 12) for i, (b, t) in enumerate(zip(base, tipsP))]
    outline = list(base) + list(bez(tipsP[-1], (tipsP[-1] + tipsP[0]) / 2 + np.array([10, 14]), tipsP[0], 10)) 
    top_y = max(t[1] for t in tipsP); base_y = np.mean([b[1] for b in base])
    fin_common(L_back, outline, rays, '#d9c768', '#f4efdc', .74, '#7a6a2a', .5,
               lambda xx, yy: (yy - base_y) / (top_y - base_y + 1e-6), ray_w=2.0, glow=.10, edge_col='#fbf8ee', edge_w=.20)

    # ============================================================ pectoral (in front, tucked under the gill cover)
    n = 17
    pivot = P(.259, .049)
    ang = np.linspace(-.30, .56, n)
    rays = []
    for k, a_ in enumerate(ang):
        Lr = (.088 - .020 * ((a_ - .13) / .45) ** 2) * TL * (1 + RNG.normal(0, .02))
        d = np.array([np.cos(a_), np.sin(a_)])
        b0 = pivot + np.array([0, (k - n / 2) * 2.4])
        t = b0 + d * Lr
        rays.append(wavy(b0, t, .04, .010, RNG.uniform(0, 6.3), 12))
    tips_ = [r[-1] for r in rays]
    outline = scalloped([r[0] for r in rays], tips_, .045)
    fin_common(L_front, outline, rays, '#bda545', '#e6d996', .56, '#5f5018', .55,
               lambda xx, yy: np.sqrt((xx - pivot[0]) ** 2 + (yy - pivot[1]) ** 2) / (.090 * TL), ray_w=2.0, glow=.16)
    bb, xx, yy = bbox_grid(outline, 8); y0, y1, x0, x1 = bb
    spot = np.exp(-(((xx - (pivot[0] + 16)) / 26) ** 2 + ((yy - pivot[1]) / 15) ** 2) ** 1.4)
    paint(L_front, bb, np.ones(spot.shape + (3,), np.float32) * srgb('#241c08')[None, None], spot * .60 * fin_mask(outline)[y0:y1, x0:x1])
    base_cover(L_front, outline, [rays[0][0], rays[-1][0]], 16, '#a68f3a', .75)
    return L_back, L_front

if __name__ == '__main__':
    from skin import Skin
    from head import HeadGeom, draw_teeth, render_eye, EYE, EYE_R
    b = Body(); g = HeadGeom(b)
    sk = Skin(b, vis=g.vis)
    N = b.normals(extra_height=sk.h + g.height(b), sigma=0.9)
    alb = g.albedo(sk.albedo, b)
    rgb = shade(alb, N, spec=.30, gloss=38, spec_mask=(0.55 + 0.9 * sk.rnd) * (1 + .5 * g.oper))
    rgb, _ = draw_teeth(rgb, g, b)
    rgb = render_eye(rgb, b)
    Lb, Lf = make_fins()
    bg = np.ones((FH, FW, 3), np.float32) * np.array([.07, .30, .40], np.float32) ** 2.2 * 2
    comp = Lb.rgb + bg * (1 - Lb.a[..., None])
    xx, yy = b.xx, b.yy
    eye_a = 1 - sstep(EYE_R - 1.2, EYE_R + 1.2, np.sqrt((xx - EYE[0]) ** 2 + (yy - EYE[1]) ** 2))
    a_body = np.maximum(b.alpha * (1 - .96 * sstep(.82, .90, b.X)), eye_a)
    comp = rgb * a_body[..., None] + comp * (1 - a_body[..., None])
    comp = Lf.rgb + comp * (1 - Lf.a[..., None])
    Image.fromarray((np.clip(comp, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save('step5.png')
    print('ok')
