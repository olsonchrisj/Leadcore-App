"""Render the full walleye in straight fish-space -> premultiplied linear RGB + alpha. Cached to .npz."""
import os, numpy as np
from fish import *
from skin import Skin, srgb, sstep
from head import HeadGeom, draw_teeth, render_eye, EYE, EYE_R
from build_fins import make_fins

CACHE = 'fish_cache.npz'

def render_fish(force=False):
    if os.path.exists(CACHE) and not force:
        d = np.load(CACHE); return d['rgb'], d['a']
    b = Body(); g = HeadGeom(b)
    sk = Skin(b, vis=g.vis)
    N = b.normals(extra_height=sk.h + g.height(b), sigma=0.9)
    alb = g.albedo(sk.albedo, b)
    rgb = shade(alb, N, spec=.30, gloss=38, spec_mask=(0.55 + 0.9 * sk.rnd) * (1 + .15 * g.oper))
    rgb, _ = draw_teeth(rgb, g, b)
    rgb = render_eye(rgb, b)
    Lb, Lf = make_fins()
    xx, yy = b.xx, b.yy
    eye_a = 1 - sstep(EYE_R - 1.2, EYE_R + 1.2, np.sqrt((xx - EYE[0]) ** 2 + (yy - EYE[1]) ** 2))
    a_body = np.maximum(b.alpha * (1 - .96 * sstep(.82, .90, b.X)), eye_a)
    # composite: back fins -> body -> front fins (premultiplied)
    from scipy.ndimage import gaussian_filter, shift as nd_shift
    # ambient occlusion where the back fins tuck behind the body
    ao = gaussian_filter(b.alpha, 11)
    pr = Lb.rgb * (1 - 0.42 * ao[..., None]); pa = Lb.a.copy()
    pr = rgb * a_body[..., None] + pr * (1 - a_body[..., None]); pa = a_body + pa * (1 - a_body)
    # the pectoral fin casts a soft shadow on the flank
    sh = nd_shift(gaussian_filter(Lf.a, 9), (9, 6), order=1)
    pr = pr * (1 - 0.42 * sh[..., None] * a_body[..., None])
    # the pectoral fin disappears under the gill cover
    tuck = sstep(-1.0, 3.0, -g.sd_rear)
    Lf.rgb = Lf.rgb * tuck[..., None]; Lf.a = Lf.a * tuck
    pr = Lf.rgb + pr * (1 - Lf.a[..., None]); pa = Lf.a + pa * (1 - Lf.a)
    np.savez_compressed(CACHE, rgb=pr.astype(np.float32), a=pa.astype(np.float32))
    return pr.astype(np.float32), pa.astype(np.float32)

if __name__ == '__main__':
    pr, pa = render_fish(force=True)
    print(pr.shape, pa.max())
