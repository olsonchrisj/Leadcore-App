"""Regenerate every app icon from the procedural walleye renderer.

    pip install numpy scipy pillow
    python3 tools/icon/export_icons.py

Writes the 1024 App Store master to assets/, the PWA / touch icons and favicon to public/.
The first run renders the fish (about a minute); it is cached in tools/icon/fish_cache.npz.
"""
import os
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
os.chdir(HERE)                      # the fish render is cached next to the scripts

import compose                      # noqa: E402


def render(variant, zoom=1.0):
    compose.set_variant(variant, zoom)
    img, _ = compose.build(zoom)
    return Image.fromarray(compose.finalize(img))


def save(im, size, path):
    out = ROOT / path
    out.parent.mkdir(parents=True, exist_ok=True)
    im.resize((size, size), Image.LANCZOS).convert('RGB').save(out, optimize=True)
    print('wrote', path)


if __name__ == '__main__':
    main = render('close')                 # close-up: bold at small sizes
    safe = render('close', 0.78)           # Android maskable: everything inside the safe circle
    full = render('full')                  # whole-fish alternative
    save(main, 1024, 'assets/app-store-icon-1024.png')     # App Store: opaque RGB, no pre-rounded corners
    save(main, 512, 'public/icon-512.png')
    save(main, 192, 'public/icon-192.png')
    save(main, 180, 'public/apple-touch-icon.png')
    save(main, 64, 'public/favicon-64.png')
    save(safe, 512, 'public/icon-maskable-512.png')
    save(full, 1024, 'assets/alt-icon-fullbody-1024.png')
