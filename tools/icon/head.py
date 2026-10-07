import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter
from fish import *
from skin import srgb, sstep, ramp
from fins import seg_dist

from scipy.interpolate import CubicSpline
def pts(points, n=80):
    P_ = np.array([[px(x), py(y)] for x, y in points], np.float64)
    t = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P_, axis=0).T))])
    cs = CubicSpline(t, P_, bc_type='natural')
    return cs(np.linspace(0, t[-1], n)).astype(np.float32)

PREOP = pts([(.138, -.110), (.150, -.080), (.162, -.045), (.169, -.008), (.167, .030), (.158, .064), (.143, .098)])
OPREAR = pts([(.198, -.120), (.228, -.096), (.250, -.062), (.262, -.025), (.263, .012), (.254, .048), (.236, .078), (.208, .106)])
GAPE = pts([(.001, .0040), (.030, .0098), (.070, .0172), (.113, .0236)], n=60)
G0 = 19.0                       # jaw drop at the front of the mouth (fish-space px)
def gape_y(xpx):
    return np.interp(xpx, GAPE[:, 0], GAPE[:, 1])
def gape_gap(xpx):
    t = np.clip((xpx - GAPE[0, 0]) / (GAPE[-1, 0] - GAPE[0, 0]), 0, 1)
    return np.maximum(G0 * (1 - t) ** 1.15, 2.4)
def mouth_open_point():
    x = GAPE[0, 0] + 3.0
    return np.array([x, gape_y(x) + gape_gap(x) * 0.5], np.float32)
EYE = np.array([px(.088), py(-.019)], np.float32)
EYE_R = 0.0255 * TL

def signed_dist(xx, yy, line):
    best = np.full(xx.shape, 1e9, np.float32); side = np.ones(xx.shape, np.float32)
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        d, t, L = seg_dist(xx, yy, a, b)
        cr = (b[0] - a[0]) * (yy - a[1]) - (b[1] - a[1]) * (xx - a[0])
        upd = d < best
        best = np.where(upd, d, best); side = np.where(upd, np.where(cr >= 0, 1.0, -1.0), side)
    return best * side          # (+) = head side for lines drawn top -> bottom

class HeadGeom:
    """Signed distances + region masks for the head; cheap, used before skin is built."""
    def __init__(self, body):
        xx, yy = body.xx, body.yy
        self.sd_pre = signed_dist(xx, yy, PREOP)       # + = cheek side
        self.sd_rear = signed_dist(xx, yy, OPREAR)     # + = operculum side
        # mouth line: signed (+) above the gape
        best = np.full(xx.shape, 1e9, np.float32); side = np.ones(xx.shape, np.float32)
        for i in range(len(GAPE) - 1):
            a, b = GAPE[i], GAPE[i + 1]
            d, t, L = seg_dist(xx, yy, a, b)
            upd = d < best
            side = np.where(upd, np.where(yy < a[1] + (b[1] - a[1]) * t, 1.0, -1.0), side); best = np.where(upd, d, best)
        self.d_gape = best; self.sd_gape = best * side
        # beyond the mouth corner the gape line stops
        self.past_corner = sstep(GAPE[-1][0] - 4, GAPE[-1][0] + 8, xx)
        self.oper = sstep(-1.5, 1.5, -self.sd_pre) * sstep(-1.5, 1.5, self.sd_rear)       # operculum plate
        self.cheek = sstep(-1.5, 1.5, self.sd_pre) * (1 - sstep(-3, 3, np.sqrt((xx - EYE[0]) ** 2 + (yy - EYE[1]) ** 2) - EYE_R * 1.15))
        deye = np.sqrt((xx - EYE[0]) ** 2 + (yy - EYE[1]) ** 2)
        self.deye = deye
        Xc = np.clip(body.X, 0, XB)
        behind = sstep(-1.5, 1.5, -self.sd_rear)                   # everything behind the operculum
        # scale visibility: full on the flank, reduced on the cheek, none on operculum / snout / jaws
        self.vis = np.clip(behind + 0.55 * self.cheek * sstep(.10, .15, Xc), 0, 1).astype(np.float32)
        self.vis *= (1 - 0.0)

    def height(self, body):
        """Extra relief for the head (px)."""
        z = np.zeros_like(body.xx)
        z += 4 * self.oper * sstep(0, 60, self.sd_rear) * sstep(0, 60, -self.sd_pre)       # raised operculum plate
        z += 6 * self.cheek
        ring = np.exp(-((self.deye - EYE_R * 1.10) / (EYE_R * .13)) ** 2)
        z -= 10 * ring * body.alpha
        # maxilla ridge above the gape, groove at the gape itself
        band = np.exp(-((self.sd_gape - 9) / 8.0) ** 2) * (1 - self.past_corner)
        z += 5 * band
        y1 = gape_y(body.xx); gp = gape_gap(body.xx)
        inx = sstep(GAPE[0, 0] - 2, GAPE[0, 0] + 2, body.xx) * (1 - sstep(GAPE[-1, 0] - 3, GAPE[-1, 0] + 2, body.xx))
        wedge = sstep(y1 - 1, y1 + 1, body.yy) * (1 - sstep(y1 + gp - 1, y1 + gp + 1, body.yy)) * inx
        z -= 14 * gaussian_filter(wedge, 2.0)
        # step along the preopercle (operculum overlaps cheek)
        z += 4 * np.exp(-((self.sd_pre + 4) / 3.5) ** 2) * (self.sd_pre < 0)
        return z.astype(np.float32)

    def albedo(self, alb, body):
        v = body.v
        Xc = np.clip(body.X, 0, XB)
        head = sstep(.0, .02, Xc) * (1 - sstep(.255, .30, Xc))
        # dorsal head dark olive, cheeks brassy, operculum pale gold with a green-silver cast
        top_dark = (1 - sstep(.05, .34, v)) * head
        alb = alb * (1 - 0.36 * top_dark[..., None]) + srgb('#2d2a0f') * (0.22 * top_dark[..., None])
        cheek_c = srgb('#b79e3e'); op_c = srgb('#d9cb85')
        low = sstep(.16, .48, v)[..., None]
        alb = alb * (1 - 0.22 * self.cheek[..., None] * low) + cheek_c * (0.22 * self.cheek[..., None] * low)
        alb = alb * (1 - 0.10 * self.oper[..., None] * low) + op_c * (0.10 * self.oper[..., None] * low)
        # shadowed creases
        vwin = sstep(.12, .36, v) * (1 - sstep(.86, .98, v))
        pre = np.exp(-((self.sd_pre + 1) / 2.3) ** 2) * vwin
        rear = np.exp(-((self.sd_rear - 2.0) / 3.2) ** 2) * (0.25 + 0.75 * vwin)
        alb = alb * (1 - 0.20 * pre[..., None]) * (1 - 0.28 * rear[..., None])
        y1 = gape_y(body.xx); gp = gape_gap(body.xx)
        inx = sstep(GAPE[0, 0] - 2, GAPE[0, 0] + 2, body.xx) * (1 - sstep(GAPE[-1, 0] - 3, GAPE[-1, 0] + 2, body.xx))
        wedge = sstep(y1 - .9, y1 + .9, body.yy) * (1 - sstep(y1 + gp - .9, y1 + gp + .9, body.yy)) * inx
        tdepth = np.clip((body.xx - GAPE[0, 0]) / (GAPE[-1, 0] - GAPE[0, 0]), 0, 1)
        inner = srgb('#3a1710')[None, None] * (1 - tdepth[..., None]) + srgb('#0a0404')[None, None] * tdepth[..., None]
        # shadow cast by the upper lip into the cavity
        inner = inner * (0.55 + 0.45 * sstep(0, 7, body.yy - y1)[..., None])
        alb = alb * (1 - wedge[..., None]) + inner * wedge[..., None]
        # lip rims: a soft light line on the lower jaw's edge, a darker crease on the upper lip
        lowrim = np.exp(-(((body.yy - (y1 + gp) - 1.8) / 2.0) ** 2)) * inx * (1 - 0.0)
        alb = alb * (1 + 0.10 * lowrim[..., None])
        uplip = np.exp(-(((body.yy - y1 + 1.5) / 2.2) ** 2)) * inx
        alb = alb * (1 - 0.35 * uplip[..., None])
        self.wedge = wedge; self.lowrim = lowrim
        # nostril
        nx, ny = px(.043), py(-.0185)
        nos = np.exp(-(((body.xx - nx) / 7) ** 2 + ((body.yy - ny) / 5.5) ** 2) ** 1.5)
        alb = alb * (1 - 0.85 * nos[..., None])
        # cephalic pores along the lower jaw
        for k in range(7):
            X_ = .022 + k * .0125
            cy = py(BOT(X_)) - 0.020 * TL * (1 - k * .05)
            cxp = px(X_)
            pore = np.exp(-(((body.xx - cxp) ** 2 + (body.yy - cy) ** 2) / (2 * 3.0 ** 2)))
            alb = alb * (1 - 0.55 * pore[..., None])
        return alb

def draw_teeth(rgb, geom, body):
    """Canine teeth on both jaws, drawn into the open gape."""
    ss = 4
    im = Image.new('L', (FW * ss, FH * ss), 0); d = ImageDraw.Draw(im)
    top = [(.007, 19), (.031, 15), (.060, 10)]
    low = [(.016, 16), (.046, 13), (.076, 8)]
    for X_, hgt in top:
        x = px(X_); y = float(gape_y(x)); gp = float(gape_gap(x)); hh = min(hgt, gp + 5)
        d.polygon([((x - 4.6) * ss, (y - 1) * ss), ((x + 4.6) * ss, (y - 1) * ss), ((x + 1.6) * ss, (y + hh * .6) * ss), ((x - .2) * ss, (y + hh) * ss)], fill=255)
    lm = Image.new('L', (FW * ss, FH * ss), 0); d2 = ImageDraw.Draw(lm)
    for X_, hgt in low:
        x = px(X_); y = float(gape_y(x) + gape_gap(x)); hh = min(hgt, gape_gap(x) + 6)
        d2.polygon([((x - 4.2) * ss, (y + 1) * ss), ((x + 4.2) * ss, (y + 1) * ss), ((x - 1.4) * ss, (y - hh * .6) * ss), ((x - .4) * ss, (y - hh) * ss)], fill=255)
    mt = np.asarray(im.resize((FW, FH), Image.BOX), np.float32) / 255
    ml = np.asarray(lm.resize((FW, FH), Image.BOX), np.float32) / 255
    xs_ = np.arange(FW, dtype=np.float32)[None, :]
    band_x = sstep(GAPE[0, 0] + 4, GAPE[0, 0] + 14, body.xx) * (1 - sstep(GAPE[-1, 0] - 24, GAPE[-1, 0] - 6, body.xx))
    y1_ = gape_y(body.xx); gp_ = gape_gap(body.xx)
    jit = fbm(body.xx.shape, [2.0], [1], 41) * 1.6
    fine = (0.5 + 0.5 * np.sin(body.xx * 1.05 + jit)) ** 4 * (0.4 + 0.6 * (0.5 + 0.5 * np.sin(body.xx * .21 + jit)))
    vil = (np.exp(-((body.yy - y1_ - 2.0) / 1.6) ** 2) + np.exp(-((body.yy - (y1_ + gp_) + 2.0) / 1.6) ** 2)) * fine * band_x * 0.30
    m = np.maximum(np.maximum(mt, ml), vil)
    # ivory with a soft shaded edge, a touch warmer toward the base
    tooth = np.array([.88, .84, .72], np.float32)
    shade_ = 0.78 + 0.22 * gaussian_filter(m, 1.2)
    out = rgb * (1 - 0.92 * m[..., None]) + tooth * shade_[..., None] * (0.92 * m[..., None])
    return out, m

def render_eye(rgb, body):
    """Shaded glassy walleye eye composited into rgb (fish canvas)."""
    xx, yy = body.xx, body.yy
    dx, dy = (xx - EYE[0]), (yy - EYE[1])
    r = np.sqrt(dx * dx + dy * dy)
    R = EYE_R
    inside = 1 - sstep(R - 1.2, R + 1.2, r)
    u, v = dx / R, dy / R
    zz = np.sqrt(np.clip(1 - u * u - v * v, 0, 1))
    N = np.stack([u * .9, v * .9, zz], -1); N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    # base: silvery milky tapetum, dark golden margin, big black pupil
    pr = 0.47
    pupil = 1 - sstep(pr - .035, pr + .02, np.sqrt(u * u + v * v))
    base = np.array([.50, .50, .30], np.float32)
    rim = sstep(.62, 1.0, np.sqrt(u * u + v * v))
    col = base * (1 - rim[..., None] * .55) + srgb('#4a4415') * rim[..., None] * .55
    ring = np.exp(-((np.sqrt(u * u + v * v) - .50) / .09) ** 2)
    col = col * (1 - ring[..., None] * .45) + srgb('#b08f2f') * ring[..., None] * .55
    # soft iris striations
    ang = np.arctan2(v, u)
    stri = 0.5 + 0.5 * np.sin(ang * 38 + 3 * np.sin(ang * 7))
    col *= (1 - 0.10 * stri[..., None] * (1 - pupil[..., None]) * sstep(.4, .6, np.sqrt(u * u + v * v))[..., None])
    col = col * (1 - pupil[..., None]) + np.array([.004, .006, .005], np.float32) * pupil[..., None]
    L = unit([-.35, -.70, .62])
    ndl = np.clip(np.einsum('hwc,c->hw', N, L), 0, 1)
    shade_ = 0.28 + 0.80 * ndl
    col = col * shade_[..., None] * 1.15
    # environment reflection: bright sky/surface on top, dark teal below
    sky = np.clip(-N[..., 1] * .9 + .1, 0, 1)
    refl = (sky ** 2.2)[..., None] * np.array([.55, .78, .85], np.float32) * (0.35 * (1 - pupil))[..., None]
    deep = np.clip(N[..., 1], 0, 1) ** 1.6
    col += refl + deep[..., None] * np.array([.02, .10, .12], np.float32) * (1 - pupil[..., None])
    # specular glints: soft window + pinpoint
    H = unit(L + np.array([0, 0, 1], np.float32))
    ndh = np.clip(np.einsum('hwc,c->hw', N, H), 0, 1)
    g1 = np.exp(-(((u + .30) / .22) ** 2 + ((v + .34) / .15) ** 2))
    g2 = np.exp(-(((u - .26) / .05) ** 2 + ((v - .30) / .05) ** 2))
    col += (g1 * .85 + g2 * .55 + ndh ** 90 * .5)[..., None]
    # socket: dark golden-brown lid ring with a soft shadow
    sock = np.exp(-((r - R * 1.10) / (R * .13)) ** 2) * (r > R)
    shadow = np.exp(-((r - R * 1.02) / (R * .35)) ** 2) * (r > R) * .5
    out = rgb * (1 - shadow[..., None]) * (1 - sock[..., None] * .55) + srgb('#2a2108') * sock[..., None] * .55 * rgb.mean(-1, keepdims=True)
    out = out * (1 - inside[..., None]) + np.clip(col, 0, 3) * inside[..., None]
    return out

if __name__ == '__main__':
    from skin import Skin
    b = Body(); g = HeadGeom(b)
    sk = Skin(b, vis=g.vis)
    N = b.normals(extra_height=sk.h + g.height(b), sigma=0.9)
    alb = g.albedo(sk.albedo, b)
    gm = (0.55 + 0.9 * sk.rnd) * (1 + 0.15 * g.oper)
    rgb = shade(alb, N, spec=.30, gloss=38, spec_mask=gm)
    rgb, tm = draw_teeth(rgb, g, b)
    rgb = render_eye(rgb, b)
    bgc = np.array([.07, .30, .40], np.float32) ** 2.2 * 2
    out = rgb * b.alpha[..., None] + bgc * (1 - b.alpha[..., None])
    # eye bulges slightly outside the head silhouette near the top; keep it visible
    xx, yy = b.xx, b.yy
    eye_a = 1 - sstep(EYE_R - 1.2, EYE_R + 1.2, np.sqrt((xx - EYE[0]) ** 2 + (yy - EYE[1]) ** 2))
    out = out * (1 - eye_a[..., None]) + rgb * eye_a[..., None]
    img = (np.clip(out, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)
    Image.fromarray(img).save('step4.png')
    Image.fromarray(img[230:560, 50:700]).resize((1300, 660), Image.LANCZOS).save('step4_head.png')
    print('ok')
