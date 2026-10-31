from PIL import Image, ImageDraw, ImageFont
import os

IN = r"D:\projects\news_feed\memes\in"
OUT = r"D:\projects\news_feed\memes\work"
os.makedirs(OUT, exist_ok=True)

def font(sz=14):
    for f in ("arialbd.ttf", "arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()

a = Image.open(os.path.join(IN, "img1.jpg"))
b = Image.open(os.path.join(IN, "img2.jpg"))
print("img1", a.size, "img2", b.size)

# ---- grid on img1 ----
g = a.copy().convert("RGB")
d = ImageDraw.Draw(g)
W, H = g.size
f = font(16)
for i in range(1, 20):
    x = int(W * i / 20)
    y = int(H * i / 20)
    d.line([(x, 0), (x, H)], fill=(255, 0, 0), width=1)
    d.line([(0, y), (W, y)], fill=(255, 0, 0), width=1)
    d.text((x + 3, 4), f"{i*5}", fill=(255, 255, 0), font=f)
    d.text((4, y + 1), f"{i*5}", fill=(255, 255, 0), font=f)
g.save(os.path.join(OUT, "grid1.png"))

# ---- zoomed grid on img2 around the man ----
box = (200, 480, 720, 1080)
c = b.crop(box).resize(((box[2]-box[0])*2, (box[3]-box[1])*2), Image.LANCZOS)
d = ImageDraw.Draw(c)
f2 = font(15)
for x in range(box[0], box[2] + 1, 20):
    px = (x - box[0]) * 2
    col = (255, 0, 0) if x % 100 == 0 else (255, 140, 140)
    d.line([(px, 0), (px, c.height)], fill=col, width=1)
    if x % 100 == 0:
        d.text((px + 2, 2), str(x), fill=(255, 0, 0), font=f2)
for y in range(box[1], box[3] + 1, 20):
    py = (y - box[1]) * 2
    col = (255, 0, 0) if y % 100 == 0 else (255, 140, 140)
    d.line([(0, py), (c.width, py)], fill=col, width=1)
    if y % 100 == 0:
        d.text((2, py + 1), str(y), fill=(255, 0, 0), font=f2)
c.save(os.path.join(OUT, "grid2.png"))
print("saved")
