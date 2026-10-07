# App icon generator

The icon is rendered procedurally (numpy + scipy + Pillow), not drawn by hand: a lit, scaled walleye
(per-scale relief, saddles, translucent ray fins, glassy eye, open gape) taking a braided leadcore cord
and steel leader, in an underwater scene.

    pip install numpy scipy pillow
    python3 tools/icon/export_icons.py

| file | role |
| --- | --- |
| `fish.py` | body outline, height field, lighting |
| `skin.py` | colour ramp, saddles, overlapping scales |
| `head.py` | eye, mouth, teeth, gill plates |
| `fins.py`, `build_fins.py` | fin geometry and translucent ray rendering |
| `render_fish.py` | assembles the fish layer (cached) |
| `compose.py` | water, light shafts, cord, crimp, leader, grade; `close` / `full` compositions |
| `export_icons.py` | writes all sizes |

Everything is deterministic (fixed seeds). The 1024 App Store master is `assets/app-store-icon-1024.png`;
`assets/alt-icon-fullbody-1024.png` is the whole-fish alternative.
