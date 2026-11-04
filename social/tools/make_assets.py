# -*- coding: utf-8 -*-
"""Build the social assets (5 images + 2 vertical shorts) for Η ΗΜΕΡΗΣΙΑ."""
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "social" / "2026-11-01" / "source"
OUT = ROOT / "social" / "2026-11-01"
IMAGES = OUT / "images"
VIDEO = OUT / "video"
SCENES = OUT / "scenes"

W_IMG, H_IMG = 1080, 1350
W_VID, H_VID = 1080, 1920

PAPER = "#f4efe1"
PAPER_HI = "#fbf7ee"
PAPER_DEEP = "#e9e0cb"
INK = "#1c1a17"
INK_SOFT = "#49423a"
MUTED = "#6d6453"
ACCENT = "#8f2b23"
ACCENT_BRIGHT = "#c4553f"
LINE = "#d8d0c1"
DARK = "#14120f"

F_GEORGIA_B = "C:/Windows/Fonts/georgiab.ttf"
F_GEORGIA = "C:/Windows/Fonts/georgia.ttf"
F_SEGOE_B = "C:/Windows/Fonts/segoeuib.ttf"
F_SEGOE_SB = "C:/Windows/Fonts/seguisb.ttf"
F_SEGOE = "C:/Windows/Fonts/segoeui.ttf"
F_MONO_B = "C:/Windows/Fonts/consolab.ttf"
F_MONO = "C:/Windows/Fonts/consola.ttf"

_font_cache = {}


def font(path, size):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


def text_len(draw, s, f):
    return draw.textlength(s, font=f)


def wrap(draw, text, f, max_w):
    lines = []
    for part in str(text).split("\n"):
        words = part.split()
        if not words:
            lines.append("")
            continue
        line = ""
        for word in words:
            test = (line + " " + word).strip()
            if text_len(draw, test, f) <= max_w or not line:
                line = test
            else:
                lines.append(line)
                line = word
        if line:
            lines.append(line)
    return lines


def fit_headline(draw, text, max_w, max_lines, start, minimum=54):
    size = start
    while size >= minimum:
        f = font(F_GEORGIA_B, size)
        lines = wrap(draw, text, f, max_w)
        if len(lines) <= max_lines:
            return f, lines
        size -= 2
    f = font(F_GEORGIA_B, minimum)
    return f, wrap(draw, text, f, max_w)


def draw_lines(draw, x, y, lines, f, fill, line_h, tracking=0):
    for line in lines:
        if tracking:
            draw_tracked(draw, (x, y), line, f, fill, tracking)
        else:
            draw.text((x, y), line, font=f, fill=fill)
        y += line_h
    return y


def draw_tracked(draw, xy, s, f, fill, tracking=2):
    x, y = xy
    for ch in s:
        draw.text((x, y), ch, font=f, fill=fill)
        x += text_len(draw, ch, f) + tracking


def tracked_width(draw, s, f, tracking=2):
    return sum(text_len(draw, ch, f) for ch in s) + tracking * max(0, len(s) - 1)


def paper_bg(w, h):
    import random

    random.seed(7)
    img = Image.new("RGB", (w, h), PAPER)
    draw = ImageDraw.Draw(img, "RGBA")
    # newspaper column guides
    for x in range(0, w, 54):
        draw.line((x, 0, x, h), fill=(28, 26, 23, 5), width=1)
    for y in range(0, h, 54):
        draw.line((0, y, w, y), fill=(28, 26, 23, 4), width=1)
    # paper grain
    noise = Image.effect_noise((w, h), 18).convert("L")
    grain = Image.merge("RGB", (noise, noise, noise))
    img = Image.blend(img, grain, 0.035)
    # a few fibers
    draw = ImageDraw.Draw(img, "RGBA")
    for _ in range(70):
        x = random.randint(0, w)
        y = random.randint(0, h)
        ln = random.randint(8, 40)
        draw.line((x, y, x + ln, y + random.randint(-2, 2)), fill=(80, 65, 45, 10), width=1)
    return img


def shadow(canvas, box, radius=22, offset=(0, 16), blur=26, alpha=60):
    x0, y0, x1, y1 = box
    w, h = int(x1 - x0), int(y1 - y0)
    pad = int(blur * 2)
    layer = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((pad, pad, pad + w, pad + h), radius=radius, fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur / 2))
    canvas.alpha_composite(layer, (x0 - pad + offset[0], y0 - pad + offset[1]))


def contain(img, w, h, bg=PAPER_HI):
    scale = min(w / img.width, h / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    out = Image.new("RGB", (w, h), bg)
    out.paste(img.resize((nw, nh), Image.LANCZOS), ((w - nw) // 2, (h - nh) // 2))
    return out


def cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    im = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return im.crop((left, top, left + w, top + h))


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    return m


def add_window(canvas, img, box, title="Η ΗΜΕΡΗΣΙΑ", radius=16, fit="contain"):
    x, y, w, h = box
    shadow(canvas, (x, y, x + w, y + h), radius=radius, blur=24, alpha=55)
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((0, 0, w, h), radius=radius, fill=PAPER_HI, outline=LINE, width=2)
    d.rounded_rectangle((0, 0, w, 34), radius=radius, fill=PAPER_DEEP)
    d.rectangle((0, 20, w, 34), fill=PAPER_DEEP)
    for i, col in enumerate(("#c9c0ae", "#d6cbb6", "#bfb3a0")):
        d.ellipse((14 + i * 17, 12, 22 + i * 17, 20), fill=col)
    d.text((76, 9), title, font=font(F_MONO, 12), fill=MUTED)
    content_w, content_h = w - 16, h - 50
    if fit == "cover":
        content = cover(img, content_w, content_h)
    else:
        content = contain(img, content_w, content_h)
    mask = rounded_mask(content_w, content_h, 9)
    card.paste(content, (8, 42), mask)
    d.rounded_rectangle((8, 42, 8 + content_w, 42 + content_h), radius=9, outline=(216, 208, 193, 255), width=1)
    canvas.alpha_composite(card, (x, y))


def add_page(canvas, img, box, radius=12, angle=0):
    x, y, w, h = box
    page = contain(img, w, h, PAPER_HI)
    page = page.convert("RGBA")
    mask = rounded_mask(w, h, radius)
    page.putalpha(mask)
    if angle:
        page = page.rotate(angle, expand=True, resample=Image.BICUBIC)
    px = x - (page.width - w) // 2
    py = y - (page.height - h) // 2
    shadow(canvas, (px, py, px + page.width, py + page.height), radius=radius, blur=22, alpha=50)
    border = Image.new("RGBA", page.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle((0, 0, page.width - 1, page.height - 1), radius=radius, outline=LINE, width=2)
    page = Image.alpha_composite(page, border)
    canvas.alpha_composite(page, (px, py))


def add_inset(canvas, img, box, dest, label=None, radius=14, zoom=2):
    x0, y0, x1, y1 = box
    crop = img.crop((x0, y0, x1, y1))
    dw, dh = dest[2], dest[3]
    crop = cover(crop, dw, dh).convert("RGBA")
    crop.putalpha(rounded_mask(dw, dh, radius))
    shadow(canvas, (dest[0], dest[1], dest[0] + dw, dest[1] + dh), radius=radius, blur=18, alpha=62)
    border = Image.new("RGBA", (dw, dh), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle((0, 0, dw - 1, dh - 1), radius=radius, outline=ACCENT_BRIGHT, width=4)
    crop = Image.alpha_composite(crop, border)
    canvas.alpha_composite(crop, (dest[0], dest[1]))
    if label:
        d = ImageDraw.Draw(canvas)
        f = font(F_SEGOE_B, 22)
        tw = text_len(d, label, f)
        lx = dest[0] + dw // 2 - tw // 2
        ly = dest[1] + dh + 12
        d.rounded_rectangle((lx - 12, ly - 5, lx + tw + 12, ly + 32), radius=18, fill=ACCENT)
        d.text((lx, ly), label, font=f, fill="#fff")


def add_chip(canvas, xy, text, f=None, fill=PAPER_HI, outline=LINE, color=INK, pad_x=18, pad_y=10):
    d = ImageDraw.Draw(canvas)
    f = f or font(F_SEGOE_SB, 22)
    tw = text_len(d, text, f)
    x, y = xy
    w, h = int(tw + pad_x * 2), int(f.size + pad_y * 2)
    d.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=fill, outline=outline, width=2)
    d.text((x + pad_x, y + pad_y - 2), text, font=f, fill=color)
    return w, h


def add_callout_line(draw, start, end, color=ACCENT, width=4):
    draw.line((start, end), fill=color, width=width)
    # arrow head
    import math
    ang = math.atan2(end[1] - start[1], end[0] - start[0])
    for delta in (0.5, -0.5):
        p = (end[0] - 18 * math.cos(ang + delta), end[1] - 18 * math.sin(ang + delta))
        draw.line((end, p), fill=color, width=width)


def brand(canvas, w, y=46, small=False):
    d = ImageDraw.Draw(canvas)
    size = 30 if small else 36
    sub = 11 if small else 13
    m = 64 if small else 72
    d.rectangle((m, y + 6, m + 12, y + 18), fill=ACCENT)
    d.text((m + 24, y - 4), "Η ΗΜΕΡΗΣΙΑ", font=font(F_GEORGIA_B, size), fill=INK)
    draw_tracked(d, (m + 26, y + size + 2), "THE DAILY · DESK", font(F_MONO_B, sub), MUTED, tracking=3)
    rule_y = y + size + sub + 22
    d.line((m, rule_y, w - m, rule_y), fill=LINE, width=2)
    d.line((m, rule_y, m + 78, rule_y), fill=ACCENT, width=5)
    return rule_y


def footer(canvas, w, h, label="Η ΗΜΕΡΗΣΙΑ", num=None, small=False):
    d = ImageDraw.Draw(canvas)
    m = 64 if small else 72
    y = h - (46 if small else 54)
    d.line((m, y - 16, w - m, y - 16), fill=LINE, width=2)
    d.text((m, y), label, font=font(F_MONO_B, 15 if small else 17), fill=MUTED)
    if num:
        s = f"{num:02d}"
        tw = text_len(d, s, font(F_MONO_B, 15 if small else 17))
        d.text((w - m - tw, y), s, font=font(F_MONO_B, 15 if small else 17), fill=ACCENT)


def kicker(canvas, text, y, video=True):
    d = ImageDraw.Draw(canvas)
    m = 72 if video else 64
    f = font(F_MONO_B, 20 if video else 18)
    d.rectangle((m, y + 7, m + 34, y + 12), fill=ACCENT)
    draw_tracked(d, (m + 50, y), text.upper(), f, ACCENT, tracking=4)


def headline(canvas, text, y, video=True, max_lines=3):
    d = ImageDraw.Draw(canvas)
    m = 72 if video else 64
    start = 96 if video else 82
    f, lines = fit_headline(d, text, 1080 - 2 * m, max_lines, start)
    lh = int(f.size * 1.06)
    draw_lines(d, m, y, lines, f, INK, lh)
    return y + lh * len(lines)


def body(canvas, text, y, video=True, max_w=None, color=INK_SOFT):
    d = ImageDraw.Draw(canvas)
    m = 72 if video else 64
    f = font(F_SEGOE, 36 if video else 31)
    lines = wrap(d, text, f, max_w or 1080 - 2 * m)
    lh = int(f.size * 1.32)
    draw_lines(d, m, y, lines, f, color, lh)
    return y + lh * len(lines)


def label_pill(canvas, xy, text, bg=ACCENT, fg="#fff", f=None):
    d = ImageDraw.Draw(canvas)
    f = f or font(F_SEGOE_B, 20)
    tw = text_len(d, text, f)
    x, y = xy
    d.rounded_rectangle((x, y, x + int(tw) + 26, y + f.size + 14), radius=18, fill=bg)
    d.text((x + 13, y + 6), text, font=f, fill=fg)


def cta(canvas, y, platform="ig", video=True, sub=True):
    d = ImageDraw.Draw(canvas)
    f = font(F_SEGOE_B, 42 if video else 34)
    text = "Link in bio  →"
    tw = text_len(d, text, f)
    w = int(tw + 80)
    h = int(f.size + 44)
    x = (1080 - w) // 2
    shadow(canvas, (x, y, x + w, y + h), radius=h // 2, blur=20, alpha=60)
    d.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=ACCENT)
    d.text((x + 40, y + 18), text, font=f, fill="#fff")
    if not sub:
        return y + h
    sub_text = "Ακολούθησε για περισσότερα" if platform == "ig" else "Κοινοποίησε σε έναν φίλο"
    sf = font(F_SEGOE, 24 if video else 21)
    sw = text_len(d, sub_text, sf)
    d.text(((1080 - sw) // 2, y + h + 18), sub_text, font=sf, fill=MUTED)
    return y + h + 18 + sf.size


def progress_strip(canvas, x, y, w, pct=64, label="Σελιδοποίηση", video=True):
    d = ImageDraw.Draw(canvas)
    f = font(F_MONO_B, 18 if video else 15)
    d.text((x, y), label.upper(), font=f, fill=MUTED)
    ps = f"{pct}%"
    tw = text_len(d, ps, f)
    d.text((x + w - tw, y), ps, font=f, fill=ACCENT)
    by = y + (29 if video else 24)
    h = 12 if video else 10
    d.rounded_rectangle((x, by, x + w, by + h), radius=h // 2, fill=LINE)
    d.rounded_rectangle((x, by, x + int(w * pct / 100), by + h), radius=h // 2, fill=ACCENT)


# ---------------------------------------------------------------- screenshots
def load(name):
    return Image.open(SOURCE / name).convert("RGB")


def today_img():
    return load("today-light.png")


def sources_img():
    return load("sources-light.png").crop((250, 120, 1422, 913))


def settings_img(dark=False):
    im = load("settings-dark.png" if dark else "settings-light.png")
    return im.crop((250, 120, 1130, 913))


def language_img():
    return load("language-light.png")


def progress_img():
    return load("progress-light.png")


def fullscreen_img():
    return load("fullscreen-light.png")


def theme_split_img():
    light = settings_img(False)
    dark = settings_img(True)
    h = 720
    lw = round(light.width * h / light.height)
    dw = round(dark.width * h / dark.height)
    out = Image.new("RGB", (lw + dw + 8, h), PAPER_HI)
    out.paste(light.resize((lw, h), Image.LANCZOS), (0, 0))
    out.paste(dark.resize((dw, h), Image.LANCZOS), (lw + 8, 0))
    d = ImageDraw.Draw(out)
    d.rectangle((lw, 0, lw + 7, h), fill=ACCENT)
    return out


def newspaper_img():
    # Ουδέτερο πρωτοσέλιδο από τα υπάρχοντα docs assets (Nasdaq lead).
    im = Image.open(ROOT / "site" / "assets" / "01-arxiki.png").convert("RGB")
    return im.crop((665, 80, 1440, 720))


# ------------------------------------------------------------------- images
def image_cover():
    c = paper_bg(W_IMG, H_IMG).convert("RGBA")
    brand(c, W_IMG, 44, small=True)
    kicker(c, "Κάθε πρωί", 158, video=False)
    y = headline(c, "Η εφημερίδα σου.\nΈτοιμη.", 205, video=False, max_lines=3)
    body(c, "Από τις πηγές σου. Χωρίς κόπο. Με ένα κλικ.", y + 24, video=False)
    add_page(c, newspaper_img(), (130, 660, 820, 560), angle=-2.2)
    label_pill(c, (690, 612), "ΑΥΤΟΜΑΤΑ")
    footer(c, W_IMG, H_IMG, "Η ΗΜΕΡΗΣΙΑ · 01")
    return c.convert("RGB")


def image_sources():
    c = paper_bg(W_IMG, H_IMG).convert("RGBA")
    brand(c, W_IMG, 44, small=True)
    kicker(c, "Πηγές", 158, video=False)
    y = headline(c, "Βάλε τις πηγές σου.", 205, video=False, max_lines=2)
    body(c, "Sites & YouTube. Μία φορά. Από εκεί και πέρα, το φύλλο φτιάχνεται μόνο του.", y + 24, video=False)
    add_window(c, sources_img(), (80, 560, 920, 560), title="Πηγές")
    add_chip(c, (92, 1160), "BBC", f=font(F_SEGOE_B, 20))
    add_chip(c, (196, 1160), "CNN", f=font(F_SEGOE_B, 20))
    add_chip(c, (300, 1160), "YouTube", f=font(F_SEGOE_B, 20))
    footer(c, W_IMG, H_IMG, "Η ΗΜΕΡΗΣΙΑ · 02")
    return c.convert("RGB")


def image_progress():
    c = paper_bg(W_IMG, H_IMG).convert("RGBA")
    brand(c, W_IMG, 44, small=True)
    kicker(c, "Πώς φτιάχνεται", 158, video=False)
    y = headline(c, "Από την πηγή\nστο φύλλο.", 205, video=False, max_lines=3)
    body(c, "Συλλογή · Μετάφραση · Εικόνες · Σελιδοποίηση. Όλα αυτόματα.", y + 24, video=False)
    add_window(c, progress_img(), (80, 560, 920, 500), title="Νέο φύλλο")
    progress_strip(c, 80, 1082, 920, 64, video=False)
    steps = [("01", "Πηγές"), ("02", "Άρθρα"), ("03", "Εικόνες"), ("04", "Σελίδες")]
    x = 80
    for n, t in steps:
        w, h = add_chip(c, (x, 1138), f"{n}  {t}", f=font(F_SEGOE_SB, 19), pad_x=14)
        x += w + 10
    footer(c, W_IMG, H_IMG, "Η ΗΜΕΡΗΣΙΑ · 03")
    return c.convert("RGB")


def image_result():
    c = paper_bg(W_IMG, H_IMG).convert("RGBA")
    brand(c, W_IMG, 44, small=True)
    kicker(c, "Το αποτέλεσμα", 158, video=False)
    y = headline(c, "20 σελίδες.\nΈτοιμες.", 205, video=False, max_lines=3)
    body(c, "Ενότητες, φωτογραφίες και πηγές — όπως σε ένα κανονικό φύλλο.", y + 24, video=False)
    add_page(c, newspaper_img(), (140, 630, 800, 520), angle=1.2)
    label_pill(c, (700, 580), "20 ΣΕΛΙΔΕΣ")
    chips = ["ΕΙΔΗΣΕΙΣ", "ΠΟΛΙΤΙΚΗ", "ΑΘΛΗΤΙΚΑ", "ΟΙΚΟΝΟΜΙΑ"]
    x = 80
    for i, t in enumerate(chips):
        w, _ = add_chip(c, (x, 1174), t, f=font(F_SEGOE_SB, 17), pad_x=12)
        x += w + 8
    footer(c, W_IMG, H_IMG, "Η ΗΜΕΡΗΣΙΑ · 04")
    return c.convert("RGB")


def image_features():
    c = paper_bg(W_IMG, H_IMG).convert("RGBA")
    brand(c, W_IMG, 44, small=True)
    kicker(c, "Διάβασε όπως θέλεις", 158, video=False)
    y = headline(c, "Ελληνικά. Αγγλικά.\nLight. Dark.", 205, video=False, max_lines=3)
    body(c, "Fullscreen με έξοδο — όχι παγίδα.", y + 20, video=False)
    add_window(c, fullscreen_img(), (80, 530, 920, 450), title="Fullscreen")
    add_inset(c, language_img(), (0, 820, 250, 913), (80, 1000, 420, 84), label="ΕΛ / EN", zoom=2)
    split = theme_split_img()
    add_inset(c, split, (0, 0, split.width, split.height), (520, 1000, 220, 84), label="Light / Dark", zoom=2)
    add_inset(c, fullscreen_img(), (1280, 0, 1422, 62), (760, 1000, 230, 84), label="✕ Exit", zoom=2)
    cta(c, 1145, platform="ig", video=False, sub=False)
    footer(c, W_IMG, H_IMG, "Η ΗΜΕΡΗΣΙΑ · 05")
    return c.convert("RGB")


# -------------------------------------------------------------------- scenes
def scene_hook():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Κάθε πρωί", 174)
    y = headline(c, "Η εφημερίδα σου.\nΈτοιμη.", 220, max_lines=3)
    body(c, "Από τις πηγές σου. Χωρίς κόπο. Με ένα κλικ.", y + 26)
    add_page(c, newspaper_img(), (130, 830, 820, 700), angle=-2.2)
    label_pill(c, (710, 780), "ΑΥΤΟΜΑΤΑ")
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 01")
    return c.convert("RGB")


def scene_sources():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Πηγές", 174)
    y = headline(c, "Βάλε τις πηγές σου.", 220, max_lines=2)
    body(c, "Sites & YouTube. Μία φορά.\nΑπό εκεί και πέρα, το φύλλο φτιάχνεται μόνο του.", y + 26)
    add_window(c, sources_img(), (80, 760, 920, 630), title="Πηγές")
    add_chip(c, (82, 1440), "BBC", f=font(F_SEGOE_B, 21))
    add_chip(c, (186, 1440), "CNN", f=font(F_SEGOE_B, 21))
    add_chip(c, (290, 1440), "YouTube", f=font(F_SEGOE_B, 21))
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 02")
    return c.convert("RGB")


def scene_click():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Ένα κλικ", 174)
    y = headline(c, "Πάτα\n«Νέο φύλλο».", 220, max_lines=3)
    body(c, "Η έκδοση ξεκινά μόνη της.", y + 26)
    top = today_img().crop((820, 0, 1422, 125))
    # ring around the red button inside the crop
    draw = ImageDraw.Draw(top)
    draw.rounded_rectangle((480, 56, 610, 100), radius=16, outline=ACCENT_BRIGHT, width=5)
    add_window(c, top, (90, 790, 900, 330), title="Νέο φύλλο")
    add_callout_line(ImageDraw.Draw(c), (900, 980), (820, 1080))
    label_pill(c, (700, 1080), "1 ΚΛΙΚ")
    add_chip(c, (90, 1210), "20 σελίδες", f=font(F_SEGOE_SB, 22))
    add_chip(c, (280, 1210), "Αυτόματα", f=font(F_SEGOE_SB, 22))
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 03")
    return c.convert("RGB")


def scene_progress():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Πώς φτιάχνεται", 174)
    y = headline(c, "Συλλογή. Μετάφραση.\nΣελιδοποίηση.", 220, max_lines=3)
    body(c, "Όλα αυτόματα, με έλεγχο γλώσσας.", y + 26)
    add_window(c, progress_img(), (80, 760, 920, 590), title="Νέο φύλλο")
    progress_strip(c, 80, 1380, 920, 64, video=True)
    steps = [("01", "Πηγές"), ("02", "Άρθρα"), ("03", "Εικόνες"), ("04", "Σελίδες")]
    x = 80
    for n, t in steps:
        w, _ = add_chip(c, (x, 1445), f"{n}  {t}", f=font(F_SEGOE_SB, 20), pad_x=13)
        x += w + 9
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 04")
    return c.convert("RGB")


def scene_result():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Το αποτέλεσμα", 174)
    y = headline(c, "20 σελίδες.\nΈτοιμες.", 220, max_lines=3)
    body(c, "Ενότητες, φωτογραφίες και πηγές — όπως σε ένα κανονικό φύλλο.", y + 26)
    add_page(c, newspaper_img(), (140, 760, 800, 730), angle=1.0)
    label_pill(c, (700, 710), "20 ΣΕΛΙΔΕΣ")
    chips = ["ΕΙΔΗΣΕΙΣ", "ΠΟΛΙΤΙΚΗ", "ΑΘΛΗΤΙΚΑ", "ΟΙΚΟΝΟΜΙΑ"]
    x = 80
    for t in chips:
        w, _ = add_chip(c, (x, 1530), t, f=font(F_SEGOE_SB, 17), pad_x=11)
        x += w + 7
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 05")
    return c.convert("RGB")


def scene_features():
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Διάβασε όπως θέλεις", 174)
    y = headline(c, "Ελληνικά. Αγγλικά.\nLight. Dark.", 220, max_lines=3)
    body(c, "Fullscreen με έξοδο — όχι παγίδα.", y + 22)
    add_window(c, fullscreen_img(), (80, 700, 920, 600), title="Fullscreen")
    add_inset(c, language_img(), (0, 820, 250, 913), (80, 1320, 420, 100), label="ΕΛ / EN", zoom=2)
    split = theme_split_img()
    add_inset(c, split, (0, 0, split.width, split.height), (520, 1320, 220, 100), label="Light / Dark", zoom=2)
    add_inset(c, fullscreen_img(), (1280, 0, 1422, 62), (760, 1320, 230, 100), label="✕ Exit", zoom=2)
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 06")
    return c.convert("RGB")


def scene_cta(platform):
    c = paper_bg(W_VID, H_VID).convert("RGBA")
    brand(c, W_VID)
    kicker(c, "Η ΗΜΕΡΗΣΙΑ", 174)
    y = headline(c, "Έτοιμη για\nανάγνωση.", 220, max_lines=3)
    body(c, "Κάθε πρωί. Μία εφημερίδα. Δική σου.", y + 26)
    # small page card as a visual anchor
    add_page(c, newspaper_img(), (190, 820, 700, 520), angle=-2.0)
    label_pill(c, (690, 780), "ΚΑΘΕ ΜΕΡΑ")
    cta(c, 1450, platform=platform)
    footer(c, W_VID, H_VID, "Η ΗΜΕΡΗΣΙΑ · 07")
    return c.convert("RGB")


# -------------------------------------------------------------------- video
def render_video(scene_paths, out_path):
    fps = 25
    dur = 4.0
    fade = 0.5
    inputs = []
    for p in scene_paths:
        inputs += ["-loop", "1", "-t", str(dur), "-i", str(p)]
    filters = []
    for i in range(len(scene_paths)):
        filters.append(
            f"[{i}:v]scale=1080:1920,zoompan=z='min(zoom+0.0006,1.05)'"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={int(fps*dur)}:s=1080x1920:fps={fps},"
            f"trim=duration={dur},setpts=PTS-STARTPTS[v{i}]"
        )
    prev = "v0"
    for i in range(1, len(scene_paths)):
        offset = i * (dur - fade) - fade
        out = f"x{i}"
        filters.append(f"[{prev}][v{i}]xfade=transition=fade:duration={fade}:offset={offset:.2f}[{out}]")
        prev = out
    total = len(scene_paths) * dur - (len(scene_paths) - 1) * fade
    cmd = [
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", f"[{prev}]", "-t", f"{total:.2f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-an", str(out_path),
    ]
    subprocess.run(cmd, check=True)


def main():
    for d in (IMAGES, VIDEO, SCENES / "ig", SCENES / "fb"):
        d.mkdir(parents=True, exist_ok=True)

    builders = [
        (image_cover, "01-cover.png"),
        (image_sources, "02-sources.png"),
        (image_progress, "03-progress.png"),
        (image_result, "04-result.png"),
        (image_features, "05-features.png"),
    ]
    for fn, name in builders:
        im = fn()
        im.save(IMAGES / name, "PNG", optimize=True)
        print("image", name, im.size)

    scene_fns = [
        ("01", scene_hook),
        ("02", scene_sources),
        ("03", scene_click),
        ("04", scene_progress),
        ("05", scene_result),
        ("06", scene_features),
    ]
    for name, fn in scene_fns:
        im = fn()
        im.save(SCENES / "ig" / f"{name}.png", "PNG", optimize=True)
        im.save(SCENES / "fb" / f"{name}.png", "PNG", optimize=True)
        print("scene", name, im.size)

    for platform in ("ig", "fb"):
        im = scene_cta(platform)
        im.save(SCENES / platform / "07.png", "PNG", optimize=True)
        print("scene 07", platform, im.size)

    ig = [SCENES / "ig" / f"{i:02d}.png" for i in range(1, 8)]
    fb = [SCENES / "fb" / f"{i:02d}.png" for i in range(1, 8)]
    render_video(ig, VIDEO / "instagram-reels-1080x1920.mp4")
    print("video instagram")
    render_video(fb, VIDEO / "facebook-reels-1080x1920.mp4")
    print("video facebook")


if __name__ == "__main__":
    main()
