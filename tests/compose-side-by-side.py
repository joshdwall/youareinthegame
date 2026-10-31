#!/usr/bin/env python3
import sys
from pathlib import Path
from PIL import Image

out = Path(sys.argv[1])
shots = Path(sys.argv[2])
shots.mkdir(parents=True, exist_ok=True)
for a, b, name in [
    ('envivo-header.png', 'cambio-header.png', 'side-by-side-header.png'),
    ('envivo-list.png', 'cambio-list.png', 'side-by-side-list.png'),
    ('envivo-sidebar.png', 'cambio-sidebar.png', 'side-by-side-sidebar.png'),
]:
    L = Image.open(out / a).convert('RGB')
    R = Image.open(out / b).convert('RGB')
    h = max(L.height, R.height)

    def fit(im):
        if im.height == h:
            return im
        w = max(1, int(im.width * h / im.height))
        return im.resize((w, h), Image.Resampling.LANCZOS)

    L, R = fit(L), fit(R)
    canvas = Image.new('RGB', (L.width + R.width + 8, h), (30, 36, 48))
    canvas.paste(L, (0, 0))
    canvas.paste(R, (L.width + 8, 0))
    canvas.save(out / name)
    canvas.save(shots / name)
    print('shot', out / name)
