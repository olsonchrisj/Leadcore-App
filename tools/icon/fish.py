"""Procedural walleye renderer (numpy + Pillow + scipy).

Everything is drawn in a straight 'fish space' canvas, then composed into the
icon scene by compose.py.  Units: X in [0,1] is fraction of total length TL,
Y in the same units, positive down, 0 = snout-tip height.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter, map_coordinates

TL = 1800                 # total length in fish-space pixels
FW, FH = 2100, 800        # fish-space canvas
X0, Y0 = 70, 400          # snout tip position
XB = 0.90                 # scaled caudal base ends here; caudal fin continues

def _interp(pts):
    xs = np.array([p[0] for p in pts], float)
    ys = np.array([p[1] for p in pts], float)
    return PchipInterpolator(xs, ys)

TOP = _interp([(0, 0), (.005, -.010), (.018, -.022), (.045, -.040), (.080, -.056), (.120, -.071),
               (.170, -.087), (.230, -.102), (.300, -.113), (.380, -.115), (.450, -.109),
               (.530, -.096), (.610, -.079), (.690, -.061), (.760, -.047), (.820, -.040)])
BOT = _interp([(0, 0), (.005, .009), (.018, .021), (.045, .034), (.080, .046), (.120, .060),
               (.170, .075), (.230, .088), (.300, .095), (.380, .095), (.450, .091),
               (.530, .083), (.610, .071), (.690, .058), (.760, .046), (.820, .040), (.860, .037), (.900, .036)])

def px(X):  return X0 + np.asarray(X) * TL
def py(Y):  return Y0 + np.asarray(Y) * TL

def fbm(shape, sigmas, weights, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    for s, w in zip(sigmas, weights):
        n = gaussian_filter(rng.standard_normal(shape).astype(np.float32), s, mode='wrap')
        n /= (n.std() + 1e-9)
        out += w * n
    return out / sum(weights)

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def poly_mask(points, ss=4):
    """Anti-aliased polygon coverage on the fish canvas (points in canvas px)."""
    im = Image.new('L', (FW * ss, FH * ss), 0)
    ImageDraw.Draw(im).polygon([(x * ss, y * ss) for x, y in points], fill=255)
    im = im.resize((FW, FH), Image.BOX)
    return np.asarray(im, np.float32) / 255.0

def body_polygon():
    Xs = np.concatenate([np.linspace(0, .03, 200) ** 1.0, np.linspace(.03, XB, 1400)])
    top = [(px(x), py(TOP(x))) for x in Xs]
    bot = [(px(x), py(BOT(x))) for x in Xs[::-1]]
    return top + bot

class Body:
    def __init__(self):
        yy, xx = np.mgrid[0:FH, 0:FW].astype(np.float32)
        self.xx, self.yy = xx, yy
        self.X = (xx - X0) / TL
        Xc = np.clip(self.X, 0, XB)
        self.yt = py(TOP(Xc)).astype(np.float32)
        self.yb = py(BOT(Xc)).astype(np.float32)
        self.depth = np.maximum(self.yb - self.yt, 1e-3)
        self.v = np.clip((yy - self.yt) / self.depth, 0, 1)      # 0 back .. 1 belly
        self.alpha = poly_mask(body_polygon())
        # lateral half-thickness: heads are fat, the body is compressed
        head = smoothstep(.30, .08, Xc)
        self.T = (0.36 + 0.14 * head) * self.depth * (1 - 0.60 * smoothstep(.80, .90, Xc))
        K = 2.5
        w = np.abs(2 * self.v - 1)
        self.z = (self.T * np.clip(1 - w ** K, 0, 1) ** (1 / K)).astype(np.float32)
        self.z *= (self.alpha > 0.02)

    def normals(self, extra_height=None, sigma=1.6):
        z = self.z if extra_height is None else self.z + extra_height
        zs = gaussian_filter(z, sigma)
        dzdy, dzdx = np.gradient(zs)
        n = np.stack([-dzdx, -dzdy, np.ones_like(zs)], -1)
        n[..., 2] = np.maximum(n[..., 2], 0.10)     # tame the silhouette rim
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        return n

def unit(v):
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)

def shade(albedo, N, key_dir=(-.32, -.78, .54), key_col=(1.0, .93, .80), key_i=1.25,
          amb_up=(.17, .33, .38), amb_dn=(.11, .17, .17), spec=.35, gloss=48, wrap=.35, spec_mask=None, rim=(.10, .32, .36)):
    L = unit(key_dir)
    ndl = np.einsum('hwc,c->hw', N, L)
    diff = np.clip((ndl + wrap) / (1 + wrap), 0, 1)[..., None]
    up = np.clip(-N[..., 1], 0, 1)[..., None] * .5 + .5          # 1 facing up (toward the surface)
    amb = up * np.array(amb_up, np.float32) + (1 - up) * np.array(amb_dn, np.float32)
    H = unit(L + np.array([0, 0, 1], np.float32))
    ndh = np.clip(np.einsum('hwc,c->hw', N, H), 0, 1)
    sp = (ndh ** gloss)[..., None] * spec * (1 if spec_mask is None else spec_mask[..., None])
    rimf = ((1 - N[..., 2]) ** 3 * (0.35 + 0.65 * np.clip(N[..., 1], 0, 1)))[..., None] * np.array(rim, np.float32)
    sun = ((1 - N[..., 2]) ** 2.2 * np.clip(-N[..., 1], 0, 1))[..., None] * np.array([.50, .58, .50], np.float32) * 0.55
    col = albedo * (diff * key_i * np.array(key_col, np.float32) + amb) + sp * np.array(key_col, np.float32) + rimf + sun
    return col

def save_preview(rgb, alpha, path, bg=(0.07, 0.30, 0.40)):
    bgimg = np.ones(rgb.shape, np.float32) * np.array(bg, np.float32)
    out = rgb * alpha[..., None] + bgimg * (1 - alpha[..., None])
    Image.fromarray((np.clip(out, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(path)

if __name__ == '__main__':
    b = Body()
    N = b.normals()
    albedo = np.ones((FH, FW, 3), np.float32) * np.array([.78, .60, .18], np.float32)
    rgb = shade(albedo, N)
    save_preview(rgb, b.alpha, 'step1.png')
    print('ok', b.alpha.max(), b.z.max())
