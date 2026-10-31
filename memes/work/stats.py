from PIL import Image
import numpy as np, sys, os
sys.path.insert(0, r"D:\projects\news_feed\memes")
from composite import rgb_to_lab, palette_stats

base = Image.open(r"D:\projects\news_feed\memes\in\img1.jpg").convert("RGB")
man = Image.open(r"D:\projects\news_feed\memes\in\img2.jpg").convert("RGB")

scene = np.asarray(base.resize((160, 160))).astype(np.float32)
# local ring around the destination
loc = np.asarray(base.crop((300, 600, 730, 1000))).astype(np.float32)
ring = loc.copy()
ring[100:280, 110:310] = 0        # crude hole where the figure goes
lm = ring.reshape(-1, 3).sum(1) > 0
m = np.asarray(man.resize((200, 356))).astype(np.float32)

for name, px in [("scene(all)", scene.reshape(-1, 3)), ("local ring", ring.reshape(-1, 3)[lm]),
                 ("man", m.reshape(-1, 3))]:
    mu, sd = palette_stats(px)
    print(f"{name:12s} L={mu[0]:6.1f} a={mu[1]:6.1f} b={mu[2]:6.1f}   sd=({sd[0]:.1f},{sd[1]:.1f},{sd[2]:.1f})")
