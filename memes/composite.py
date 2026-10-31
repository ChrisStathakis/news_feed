"""Composite 'the admiring man' into the background of the gym reel.

Usage:
  python memes/composite.py --scale 0.30 --cx 520 --bottom 905 --flip --rot -4 --out out/v1.png
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- cut-out ---
def man_cutout(path, mode="rembg", polygon=None, cut_y=None):
    """Return (RGBA image cropped to subject, full-size alpha mask)."""
    src = Image.open(path).convert("RGB")

    if mode == "rembg":
        from rembg import remove, new_session

        session = new_session("u2net")
        alpha = remove(src, session=session, only_mask=True)
        a = np.asarray(alpha.convert("L")).astype(np.float32) / 255.0
    else:
        a = np.zeros((src.height, src.width), np.float32)
        ImageDraw.Draw(Image.fromarray((a * 255).astype(np.uint8))).polygon(polygon, fill=255)
        tmp = Image.new("L", src.size, 0)
        ImageDraw.Draw(tmp).polygon(polygon, fill=255)
        a = np.asarray(tmp).astype(np.float32) / 255.0

    m = a > 0.5
    # keep components that are not specks
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = np.zeros_like(m)
        for i, s in enumerate(sizes, start=1):
            if s > 1500:
                keep |= lab == i
        m = keep

    m = ndimage.binary_closing(m, np.ones((5, 5)))
    m = ndimage.binary_fill_holes(m)
    m = ndimage.binary_erosion(m, np.ones((3, 3)))
    if cut_y:
        m[int(cut_y):, :] = False
    alpha = ndimage.gaussian_filter(m.astype(np.float32), 1.2)
    alpha = np.clip((alpha - 0.25) / 0.55, 0, 1)

    ys, xs = np.where(alpha > 0.05)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return src.crop(box), alpha[box[1]:box[3], box[0]:box[2]], box


# ------------------------------------------------------------- tone match ---
def rgb_to_lab(rgb):
    c = np.clip(rgb, 0, 255) / 255.0

    def lin(v):
        return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)

    r, g, b = lin(c[..., 0]), lin(c[..., 1]), lin(c[..., 2])
    X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
    Y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750)
    Z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883

    def f(t):
        return np.where(t > 0.008856, np.cbrt(t), 7.787 * t + 16.0 / 116.0)

    fx, fy, fz = f(X), f(Y), f(Z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], -1)


def lab_to_rgb(lab):
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    fy = (L + 16) / 116.0
    fx = fy + A / 500.0
    fz = fy - B / 200.0

    def fi(t):
        return np.where(t ** 3 > 0.008856, t ** 3, (t - 16.0 / 116.0) / 7.787)

    X, Y, Z = fi(fx) * 0.95047, fi(fy), fi(fz) * 1.08883
    R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314
    G = X * -0.9692660 + Y * 1.8760108 + Z * 0.0415560
    Bc = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252

    def fo(v):
        v = np.clip(v, 0, None)
        return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)

    return np.clip(np.stack([fo(R), fo(G), fo(Bc)], -1) * 255.0, 0, 255)


def palette_stats(pixels):
    lab = rgb_to_lab(pixels.reshape(-1, 3))
    lum = lab[:, 0]
    lo, hi = np.percentile(lum, [2, 98])
    keep = (lum > lo) & (lum < hi)
    lab = lab[keep] if keep.sum() > 100 else lab
    return lab.mean(0), np.maximum(lab.std(0), 1.0)


def color_transfer(rgb, alpha, ref_pixels, strength=0.85, l_gain=1.0):
    """Reinhard transfer in CIELAB: match per-channel mean & std to the scene."""
    lab = rgb_to_lab(rgb)
    mean_s, std_s = palette_stats(rgb[alpha > 0.5])
    mean_r, std_r = palette_stats(ref_pixels)
    matched = (lab - mean_s) / std_s * std_r + mean_r
    out = lab * (1 - strength) + matched * strength
    out[..., 0] *= l_gain
    return lab_to_rgb(out)


def match_tone(sub, alpha, patch_bg, brightness=0.86, desat=0.5, tint=(1.06, 1.0, 0.86), contrast=1.0,
               ref_pixels=None, ct=0.0, l_gain=1.0):
    """Linear luminance match + gym colour cast, applied to RGB float array."""
    if ct > 0 and ref_pixels is not None:
        rgb = color_transfer(sub, alpha, ref_pixels, ct, l_gain)
    else:
        lum = sub @ np.array([0.299, 0.587, 0.114], np.float32)
        bg = patch_bg @ np.array([0.299, 0.587, 0.114], np.float32)

        ml, sl = float(np.median(lum[alpha > 0.5])), float(lum[alpha > 0.5].std())
        mb, sb = float(np.median(bg)), float(bg.std())
        sb = max(sb, 18.0)
        gain = np.clip(sb / max(sl, 12.0), 0.6, 1.6)
        target_med = mb * brightness
        out = (lum - ml) * gain + target_med

        ratio = np.clip(out / np.maximum(lum, 1e-3), 0.25, 2.5)[..., None]
        rgb = sub * ratio

    g = rgb.mean(2, keepdims=True)
    rgb = g + (rgb - g) * desat
    rgb = rgb * np.array(tint, np.float32)
    if contrast != 1.0:
        rgb = np.clip((rgb - 128.0) * contrast + 128.0, 0, 255)
    return rgb


# --------------------------------------------------------------- composite ---
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--woman", default=os.path.join(HERE, "in", "img1.jpg"))
    p.add_argument("--man", default=os.path.join(HERE, "in", "img2.jpg"))
    p.add_argument("--out", default=os.path.join(HERE, "out", "v1.png"))
    p.add_argument("--scale", type=float, default=0.30)
    p.add_argument("--cx", type=float, default=520)      # px, head/hands centre
    p.add_argument("--bottom", type=float, default=905)  # px, bottom of cut-out
    p.add_argument("--flip", action="store_true")
    p.add_argument("--rot", type=float, default=-4.0)
    p.add_argument("--blur", type=float, default=0.9)
    p.add_argument("--grain", type=float, default=5.0)
    p.add_argument("--shadow", type=float, default=0.35)
    p.add_argument("--opacity", type=float, default=1.0)
    p.add_argument("--brightness", type=float, default=0.86)
    p.add_argument("--desat", type=float, default=0.50)
    p.add_argument("--fade", type=float, default=14.0, help="px of soft bottom edge")
    p.add_argument("--mask", default="rembg", choices=["rembg", "poly"])
    p.add_argument("--rim", type=float, default=0.0, help="darken silhouette border")
    p.add_argument("--vgrad", type=float, default=0.0, help="top-brighter vertical light")
    p.add_argument("--occl", type=float, default=0.0, help="luminance below which scene redraws in front")
    p.add_argument("--occl-from", type=float, default=0.45, help="fraction of figure height where occlusion starts")
    p.add_argument("--colorgain", type=float, default=0.35, help="pull colour toward scene average")
    p.add_argument("--skirt", type=float, default=0.0, help="extend trunk downward (fraction of height)")
    p.add_argument("--cut-y", type=float, default=0.0, help="hard horizontal cut in source px")
    p.add_argument("--tint", default="1.06,1.0,0.86", help="RGB gain, e.g. 1.14,1.02,0.80")
    p.add_argument("--contrast", type=float, default=1.0)
    p.add_argument("--ct", type=float, default=0.0, help="LAB palette transfer strength 0..1")
    p.add_argument("--ct-ref", default="mix", choices=["mix", "local", "scene"])
    p.add_argument("--l-gain", type=float, default=1.0, help="scale lightness after the palette transfer")
    p.add_argument("--clean", action="store_true", help="crop story UI")
    args = p.parse_args()

    base = Image.open(args.woman).convert("RGB")
    W, H = base.size

    cut, alpha, box = man_cutout(args.man, args.mask, cut_y=args.cut_y or None)

    s = args.scale
    nw, nh = max(1, int(cut.width * s)), max(1, int(cut.height * s))
    small = cut.resize((nw, nh), Image.LANCZOS)
    asmall = Image.fromarray((alpha * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)

    if args.flip:
        small = small.transpose(Image.FLIP_LEFT_RIGHT)
        asmall = asmall.transpose(Image.FLIP_LEFT_RIGHT)
    if args.rot:
        small = small.rotate(args.rot, resample=Image.BICUBIC, expand=True)
        asmall = asmall.rotate(args.rot, resample=Image.BICUBIC, expand=True)
    nw, nh = small.size

    # background patch for tone matching (area around destination)
    x0 = int(args.cx - nw * 0.75)
    y0 = int(args.bottom - nh)
    patch = np.asarray(base.crop((max(0, x0), max(0, y0), min(W, x0 + int(nw * 1.5)), min(H, y0 + nh)))).astype(np.float32)

    sub = np.asarray(small).astype(np.float32)
    a = np.asarray(asmall).astype(np.float32) / 255.0
    nh0 = nh
    # extend the trunk downwards so no hard cut floats in mid-air
    if args.skirt > 0:
        k = int(nh0 * args.skirt)
        ext = np.repeat(sub[-1:, :, :], k, axis=0)
        ext *= np.linspace(1.0, 0.40, k, dtype=np.float32)[:, None, None]
        sub = np.concatenate([sub, ext], axis=0)
        a = np.concatenate([a, np.ones((k, nw), np.float32)], axis=0)
        nh += k
    # trim the tone-match stats to the actual figure pixels
    body = patch.reshape(-1, 3)
    bg_stats = body[body.mean(1) > 0]

    # reference palette for the LAB transfer: local surroundings + whole frame
    pad = int(nw * 1.0)
    lx0, ly0 = max(0, x0 - pad), max(0, y0 - pad)
    lx1, ly1 = min(W, x0 + nw + pad), min(H, y0 + nh + pad)
    local = np.asarray(base.crop((lx0, ly0, lx1, ly1))).astype(np.float32)
    keep = np.ones(local.shape[:2], bool)
    keep[max(0, y0 - ly0):max(0, y0 - ly0) + nh, max(0, x0 - lx0):max(0, x0 - lx0) + nw] = False
    local_px = local[keep]
    scene_px = np.asarray(base.resize((120, 120))).reshape(-1, 3).astype(np.float32)
    if args.ct_ref == "local":
        ref_px = local_px
    elif args.ct_ref == "scene":
        ref_px = scene_px
    else:
        ref_px = np.concatenate([local_px, scene_px], 0)

    rgb = match_tone(sub, a, bg_stats, args.brightness, args.desat,
                     tuple(float(v) for v in args.tint.split(",")), args.contrast,
                     ref_pixels=ref_px, ct=args.ct, l_gain=args.l_gain)
    rgb = np.clip(rgb, 0, 255)

    if args.colorgain > 0:
        scene_m = np.asarray(base.resize((64, 64))).reshape(-1, 3).mean(0)
        sub_m = rgb[a > 0.5].mean(0)
        gain = (scene_m / np.maximum(sub_m, 1.0)) ** args.colorgain
        rgb = np.clip(rgb * gain[None, None, :], 0, 255)

    # depth-of-field + grain, then paste
    layer = Image.fromarray(rgb.astype(np.uint8)).filter(ImageFilter.GaussianBlur(args.blur))
    arr = np.asarray(layer).astype(np.float32)
    rng = np.random.default_rng(7)
    arr = arr + rng.normal(0, args.grain, arr.shape)
    layer = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    # silhouette shading: inner dark rim + top-down light
    if args.rim > 0:
        solid = a > 0.5
        dist = ndimage.distance_transform_edt(solid)
        rim = np.clip(1.0 - dist / 3.0, 0, 1) * (a > 0.4)
        f = 1.0 - args.rim * rim
        layer = Image.fromarray(np.clip(np.asarray(layer) * f[..., None], 0, 255).astype(np.uint8))
    if args.vgrad:
        g = np.linspace(1.0 + args.vgrad, 1.0 - args.vgrad * 0.6, nh, dtype=np.float32)[:, None, None]
        layer = Image.fromarray(np.clip(np.asarray(layer) * g, 0, 255).astype(np.uint8))

    px = int(args.cx - nw / 2)
    py = int(args.bottom - nh0)

    # contact shadow under the hands
    canvas = base.copy()
    if args.shadow > 0:
        sh = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(sh)
        d.ellipse([px + nw * 0.10, py + nh0 * 0.86, px + nw * 0.95, py + nh0 * 1.04], fill=int(255 * args.shadow))
        sh = sh.filter(ImageFilter.GaussianBlur(nh0 * 0.05))
        dark = Image.new("RGB", (W, H), (12, 10, 8))
        canvas = Image.composite(dark, canvas, sh.point(lambda v: int(v * 0.8)))

    am = a * args.opacity
    if args.fade > 0:
        f = int(min(args.fade, nh))
        ramp = np.linspace(1.0, 0.18, f, dtype=np.float32)[:, None]
        am[nh - f:, :] *= ramp
    mask = Image.fromarray((am * 255).astype(np.uint8))
    canvas.paste(layer, (px, py), mask)

    # occlusion pass: let dark structures of the scene sit back in front of him
    if args.occl > 0:
        orig = np.asarray(base).astype(np.float32)
        out = np.asarray(canvas).astype(np.float32)
        lum = orig @ np.array([0.299, 0.587, 0.114], np.float32)
        occ = np.clip((args.occl - lum) / (args.occl * 0.9), 0, 1)
        occ = ndimage.gaussian_filter(occ, 1.5)

        box_mask = np.zeros((H, W), np.float32)
        y_lim = int(py + nh * args.occl_from)
        box_mask[max(0, y_lim):py + nh + 4, max(0, px - 4):px + nw + 4] = 1.0
        box_mask = ndimage.gaussian_filter(box_mask, 2.0)
        w = (occ * box_mask)[..., None]
        canvas = Image.fromarray(np.clip(out * (1 - w) + orig * w, 0, 255).astype(np.uint8))

    if args.clean:
        canvas = canvas.crop((0, 105, W, 1490))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    canvas.save(args.out)
    print("wrote", args.out, canvas.size, "| figure:", nw, "x", nh, "at", px, py)


if __name__ == "__main__":
    main()
