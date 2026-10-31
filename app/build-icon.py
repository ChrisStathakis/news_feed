# -*- coding: utf-8 -*-
"""Παράγει το εικονίδιο της εφαρμογής (διπλωμένη εφημερίδα, κρεμ/μελάνι).

Χρήση (από τον φάκελο app):
    python build-icon.py
Παράγει:
    build/icon.ico      16,24,32,48,64,128,256
    build/icon.png      512
    assets/icon.png     256
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

APP = Path(__file__).resolve().parent
BUILD = APP / "build"
ASSETS = APP / "assets"
BUILD.mkdir(exist_ok=True)
ASSETS.mkdir(exist_ok=True)

PAPER = (244, 239, 225)
PAPER_DEEP = (226, 217, 198)
INK = (28, 26, 23)
RED = (143, 43, 35)
SHADOW = (196, 185, 164)


def _font(size: int) -> ImageFont.FreeTypeFont:
    for name in ("georgiab.ttf", "georgia.ttf", "timesbd.ttf", "times.ttf", "segoeuib.ttf"):
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except Exception:
                continue
    return ImageFont.load_default()


def _noise(img: Image.Image, amount: int = 6) -> Image.Image:
    noise = Image.effect_noise(img.size, amount).convert("L")
    grain = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(img, grain, 0.035)


def draw(size: int) -> Image.Image:
    scale = size / 512
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)

    # χαρτί + κόκκος
    img = _noise(img, 8 if size >= 128 else 4)
    d = ImageDraw.Draw(img)

    def px(value: float) -> int:
        return max(1, int(round(value * scale)))

    # διπλό καρέ
    d.rectangle((px(14), px(14), size - px(14), size - px(14)), outline=INK, width=px(6))
    d.rectangle((px(26), px(26), size - px(26), size - px(26)), outline=INK, width=px(1.5))

    # σώμα εφημερίδας: διπλωμένο φύλλο με ελαφριά κλίση
    cx, cy = size * 0.5, size * 0.54
    w, h = size * 0.50, size * 0.40
    angle = -6 * math.pi / 180

    def rot(x: float, y: float) -> tuple[float, float]:
        dx, dy = x - cx, y - cy
        return (cx + dx * math.cos(angle) - dy * math.sin(angle),
                cy + dx * math.sin(angle) + dy * math.cos(angle))

    front = [rot(cx - w / 2, cy - h / 2), rot(cx + w / 2, cy - h / 2),
             rot(cx + w / 2, cy + h / 2), rot(cx - w / 2, cy + h / 2)]

    # σκιά
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.polygon([(x + px(5), y + px(6)) for x, y in front], fill=(90, 74, 48, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(px(5)))
    img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
    d = ImageDraw.Draw(img)

    # σελίδα
    d.polygon(front, fill=(250, 246, 236), outline=INK)
    if size >= 96:
        d.line(front + [front[0]], fill=INK, width=px(2))
    else:
        d.line(front + [front[0]], fill=INK, width=px(3))

    # δίπλωμα δεξιά
    fold = [rot(cx + w / 2, cy - h / 2), rot(cx + w / 2 + w * 0.16, cy - h / 2 + h * 0.10),
            rot(cx + w / 2 + w * 0.16, cy + h / 2 - h * 0.06), rot(cx + w / 2, cy + h / 2)]
    d.polygon(fold, fill=PAPER_DEEP, outline=INK)

    # masthead: κείμενο σε μεγάλα μεγέθη, μπάρα στα μικρά
    if size >= 160:
        label = "Η ΗΜΕΡΗΣΙΑ"
        f = _font(px(40))
        tw = d.textlength(label, font=f)
        max_w = w * 0.86
        if tw > max_w:
            f = _font(max(10, int(px(40) * max_w / tw)))
            tw = d.textlength(label, font=f)
        pos = rot(cx - tw / 2, cy - h * 0.40)
        d.text(pos, label, font=f, fill=INK)

        # λεπτή διπλή γραμμή κάτω από τον τίτλο
        for offset, width in ((0.0, 2.4), (0.045, 1.2)):
            a = rot(cx - w * 0.36, cy - h * 0.16 + h * offset)
            b = rot(cx + w * 0.30, cy - h * 0.16 + h * offset)
            d.line([a, b], fill=INK, width=px(width))
    else:
        m_top = rot(cx - w * 0.36, cy - h * 0.30)
        m_bot = rot(cx + w * 0.30, cy - h * 0.18)
        d.line([m_top, m_bot], fill=INK, width=px(12))

    if size >= 32:
        # κόκκινη γραμμή
        r1 = rot(cx - w * 0.36, cy - h * 0.08)
        r2 = rot(cx + w * 0.30, cy - h * 0.08)
        d.line([r1, r2], fill=RED, width=px(3))

    if size >= 64:
        # στήλες
        for i, offset in enumerate((-0.24, 0.0, 0.24)):
            x = cx + w * offset
            top = rot(x, cy - h * 0.02)
            bot = rot(x, cy + h * 0.34)
            d.line([top, bot], fill=(70, 64, 55), width=px(2.2))
        # μικρές «γραμμές κειμένου»
        for row in range(3):
            y = cy + h * (0.10 + row * 0.09)
            left = rot(cx - w * 0.34, y)
            right = rot(cx + w * 0.06, y)
            d.line([left, right], fill=(120, 111, 97), width=px(1.4))
    elif size >= 32:
        # απλοποιημένες γραμμές για μικρά μεγέθη
        for row in range(3):
            y = cy + h * (0.04 + row * 0.11)
            left = rot(cx - w * 0.34, y)
            right = rot(cx + w * 0.26, y)
            d.line([left, right], fill=(110, 102, 89), width=px(2.6))

    return img


def save_ico(path: Path, images: list[Image.Image]) -> None:
    """Γράφει .ico με PNG payload ανά μέγεθος (διατηρεί το adaptive detail)."""
    import io
    import struct

    payloads = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        payloads.append(buf.getvalue())

    count = len(images)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    for img, data in zip(images, payloads):
        w = 0 if img.width >= 256 else img.width
        h = 0 if img.height >= 256 else img.height
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    path.write_bytes(header + entries + b"".join(payloads))


def main() -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [draw(s) for s in sizes]

    save_ico(BUILD / "icon.ico", images)
    draw(512).save(BUILD / "icon.png")
    draw(256).save(ASSETS / "icon.png")

    print("Έτοιμα:", BUILD / "icon.ico", BUILD / "icon.png", ASSETS / "icon.png")


if __name__ == "__main__":
    main()
