"""Derive every AudEx brand asset from the Copilot-generated sources in brand/source.

Outputs: public (favicon, PWA + apple icons, logos, manifest), src/brand.css (colour variables) and brand/exports (the same files, for reference).
Run:  python3 tools/build_brand_assets.py
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
PUB = ROOT / "public"
EXPORTS = ROOT / "brand" / "exports"
for d in (PUB / "icons", PUB / "logo", EXPORTS):
    d.mkdir(parents=True, exist_ok=True)


def load(name):
    return Image.open(SRC / name).convert("RGB")


def exterior(arr_bool, grow=0):
    """Pixels of arr_bool (True = background-like) connected to the image border, optionally grown by `grow` px."""
    labels, _ = ndimage.label(arr_bool)  # 4-connected components of background-like pixels
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    keep = np.isin(labels, border[border > 0])
    mask = Image.fromarray((keep * 255).astype("uint8"))
    if grow:
        mask = mask.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return mask


def to_rgba(rgb, exterior_mask, soften=1.0):
    alpha = exterior_mask.point(lambda v: 255 - v).filter(ImageFilter.GaussianBlur(soften))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def median_rgb(arr, sel):
    px = arr[sel]
    return tuple(int(np.median(px[:, i])) for i in range(3))


def bbox(sel):
    ys, xs = np.where(sel)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def hexc(c):
    return "#%02x%02x%02x" % c


def save(img, rel, size=None):
    if size:
        img = img.resize(size, Image.LANCZOS)
    for base in (PUB, EXPORTS):
        p = base / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        img.save(p)


# ---------------------------------------------------------------- app icon (07)
icon = load("07-app-icon.png")
a = np.asarray(icon)
ext = exterior(a.min(axis=2) > 150, grow=2)
inside = ~(np.asarray(ext) > 0)
TEAL = median_rgb(a, inside & (a[:, :, 2] > 80) & (a[:, :, 0] < 30))
AMBER = median_rgb(np.asarray(load("01-mark-on-white.png")),
                   (np.asarray(load("01-mark-on-white.png"))[:, :, 0] > 220) &
                   (np.asarray(load("01-mark-on-white.png"))[:, :, 2] < 90))

fullbleed = icon.copy()
fullbleed.paste(TEAL, mask=ext)                       # square, no transparency (iOS / maskable)
tile = to_rgba(icon, ext)                             # rounded tile with transparent corners
big = max(icon.size)

save(tile, "icons/icon-512.png", (512, 512))
save(tile, "icons/icon-192.png", (192, 192))
save(fullbleed, "apple-touch-icon.png", (180, 180))
for s in (512, 192):
    canvas = Image.new("RGB", (big, big), TEAL)       # maskable: keep the A inside the 80% safe zone
    inner = fullbleed.resize((int(big * 0.8),) * 2, Image.LANCZOS)
    canvas.paste(inner, ((big - inner.width) // 2,) * 2)
    save(canvas, f"icons/maskable-{s}.png", (s, s))
save(tile, "logo/audex-icon.png", (512, 512))
save(tile, "favicon-32.png", (32, 32))
ico = tile.resize((256, 256), Image.LANCZOS)
for base in (PUB, EXPORTS):
    ico.save(base / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# ---------------------------------------------------------------- unframed mark (01), for light surfaces
m = load("01-mark-on-white.png")
ma = np.asarray(m)
mark = to_rgba(m, exterior(ma.min(axis=2) > 200, grow=3))
mark = mark.crop(mark.getbbox())
save(mark, "logo/audex-mark.png", (int(mark.width * 480 / mark.height), 480))


# ---------------------------------------------------------------- lockups (04 on teal, 05 on white)
def split_lockup(rgb, nonbg):
    """Find the tile (first column run) and the wordmark (rest) by the widest empty column gap."""
    cols = nonbg.any(axis=0)
    xs = np.where(cols)[0]
    gaps = np.diff(xs)
    cut = int(np.argmax(gaps))
    tile_x = (xs[0], xs[cut] + 1)
    word_x = (xs[cut + 1], xs[-1] + 1)
    box = lambda x0, x1: (x0, *bbox(nonbg[:, x0:x1])[1::2][:1], x1, bbox(nonbg[:, x0:x1])[3])
    return box(*tile_x), box(*word_x)


def build_lockup(name, nonbg_fn, bg_fn, ink_mode):
    rgb = load(name)
    arr = np.asarray(rgb)
    nonbg = nonbg_fn(arr)
    tile_box, word_box = split_lockup(rgb, nonbg)
    whole = (tile_box[0], min(tile_box[1], word_box[1]), word_box[2], max(tile_box[3], word_box[3]))
    out = Image.new("RGBA", (whole[2] - whole[0], whole[3] - whole[1]), (0, 0, 0, 0))

    pad = 6  # tile: remove the exterior background; interior (white A / teal A / amber) untouched
    t = rgb.crop((tile_box[0] - pad, tile_box[1] - pad, tile_box[2] + pad, tile_box[3] + pad))
    t_rgba = to_rgba(t, exterior(bg_fn(np.asarray(t)), grow=2))
    out.alpha_composite(t_rgba, (tile_box[0] - pad - whole[0], tile_box[1] - pad - whole[1]))

    w = np.asarray(rgb.crop(word_box).convert("L")).astype(float)  # wordmark: single colour, alpha from luminance
    if ink_mode == "dark-on-light":
        bg_l, ink = 250.0, TEAL
        ink_l = 0.299 * ink[0] + 0.587 * ink[1] + 0.114 * ink[2]
        alpha = np.clip((bg_l - w) / (bg_l - ink_l), 0, 1)
        colour = ink
    else:
        bg_l = float(np.median(np.asarray(rgb.convert("L"))[:20, :20]))
        alpha = np.clip((w - bg_l) / (250.0 - bg_l), 0, 1)
        colour = (255, 255, 255)
    word = Image.new("RGBA", (word_box[2] - word_box[0], word_box[3] - word_box[1]), colour + (0,))
    word.putalpha(Image.fromarray((alpha * 255).astype("uint8")))
    out.alpha_composite(word, (word_box[0] - whole[0], word_box[1] - whole[1]))
    return out


light = build_lockup("05-lockup-on-white.png", lambda a: a.min(axis=2) < 200, lambda a: a.min(axis=2) > 150,
                     "dark-on-light")
dark = build_lockup("04-lockup-on-teal.png", lambda a: a.max(axis=2) > 150, lambda a: a.max(axis=2) < 140,
                    "light-on-dark")
H = 240
for img, rel in ((light, "logo/audex-lockup.png"), (dark, "logo/audex-lockup-white.png")):
    save(img, rel, (int(img.width * H / img.height), H))

# ---------------------------------------------------------------- one-colour A mark (02), for print / PDF
sheet = load("02-variants-dark-on-white.png")
crop = sheet.crop((1090, 610, 1430, 900))
l = np.asarray(crop.convert("L")).astype(float)
ink_l = 0.299 * TEAL[0] + 0.587 * TEAL[1] + 0.114 * TEAL[2]
alpha = Image.fromarray((np.clip((250 - l) / (250 - ink_l), 0, 1) * 255).astype("uint8"))
for colour, rel in ((TEAL, "logo/audex-mark-mono-dark.png"), ((255, 255, 255), "logo/audex-mark-mono-white.png")):
    mm = Image.new("RGBA", crop.size, colour + (0,))
    mm.putalpha(alpha)
    mm = mm.crop(mm.getbbox())
    save(mm, rel)

# ---------------------------------------------------------------- WebP copies for the images the page itself loads
# Only the logos shown inside the web app get a WebP (at 3x the size they are displayed, which is what makes them small).
# PNG stays for everything that cannot use WebP: install icons, the iOS home-screen icon, the favicon and the PDF logo.
def save_webp(img, rel, height):
    img = img.convert("RGBA")
    img = img.resize((round(img.width * height / img.height), height), Image.LANCZOS)
    img.save(PUB / rel, format="WEBP", quality=90, method=6)

save_webp(dark, "logo/audex-lockup-white.webp", 108)   # header: displayed 36px tall
save_webp(Image.open(PUB / "logo/audex-mark.png"), "logo/audex-mark.webp", 240)  # boot splash: displayed 96px wide

# ---------------------------------------------------------------- iPhone launch images (iOS ignores the manifest for these)
# (css width, css height, pixel ratio) of current iPhones, portrait. Same look as the in-app splash in index.html.
TAGLINE = "Audit with confidence"
SPLASH = [(375, 667, 2), (414, 736, 3), (375, 812, 3), (414, 896, 2), (414, 896, 3), (360, 780, 3), (390, 844, 3),
          (428, 926, 3), (393, 852, 3), (430, 932, 3), (402, 874, 3), (440, 956, 3)]
FONTS = ["/usr/share/fonts/opentype/inter/Inter-Medium.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"]
from PIL import ImageDraw, ImageFont
font_path = next(f for f in FONTS if Path(f).exists())
lock = Image.open(PUB / "logo/audex-lockup-white.png").convert("RGBA")
(PUB / "splash").mkdir(exist_ok=True)
tags = []
for cw, ch, dpr in SPLASH:
    w, h = cw * dpr, ch * dpr
    canvas = Image.new("RGB", (w, h), TEAL)
    lw = round(200 * dpr)                                  # lockup is 200 css px wide, as in the app
    logo = lock.resize((lw, round(lock.height * lw / lock.width)), Image.LANCZOS)
    font = ImageFont.truetype(font_path, round(15 * dpr))
    gap, bar_h = round(14 * dpr), max(2, round(3 * dpr))
    block = logo.height + gap + font.size + round(18 * dpr) + bar_h
    top = (h - block) // 2
    canvas.paste(logo, ((w - lw) // 2, top), logo)
    d = ImageDraw.Draw(canvas)
    tw = d.textlength(TAGLINE, font=font)
    ty = top + logo.height + gap
    d.text(((w - tw) / 2, ty), TAGLINE, font=font, fill=(255, 255, 255))
    bw, by = round(120 * dpr), ty + font.size + round(18 * dpr)
    d.rounded_rectangle([(w - bw) // 2, by, (w + bw) // 2, by + bar_h], radius=bar_h // 2, fill=tuple(int(c * .82 + 255 * .18) for c in TEAL))
    d.rounded_rectangle([(w - bw) // 2, by, (w - bw) // 2 + round(bw * .4), by + bar_h], radius=bar_h // 2, fill=AMBER)
    name = f"splash/launch-{w}x{h}.png"
    canvas.save(PUB / name, optimize=True)
    tags.append(f'    <link rel="apple-touch-startup-image" href="/{name}" media="(device-width: {cw}px) and (device-height: {ch}px) '
                f'and (-webkit-device-pixel-ratio: {dpr}) and (orientation: portrait)" />')
idx = (ROOT / "index.html")
html = idx.read_text()
a, b = "    <!-- splash:start -->", "    <!-- splash:end -->"
block_html = a + "\n" + "\n".join(tags) + "\n" + b
if a in html:
    html = html[: html.index(a)] + block_html + html[html.index(b) + len(b):]
else:
    html = html.replace('    <link rel="manifest"', block_html + '\n    <link rel="manifest"', 1)
idx.write_text(html)

# ---------------------------------------------------------------- manifest, css variables, PDF resources
manifest = {
    "name": "AudEx",
    "short_name": "AudEx",
    "description": "Housekeeping audits that work offline.",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "theme_color": hexc(TEAL),
    "background_color": hexc(TEAL),
    "icons": [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/icons/maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
        {"src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(PUB / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
(ROOT / "src" / "brand.css").write_text(
    f"/* generated by tools/build_brand_assets.py from the logo artwork */\n"
    f":root {{ --brand: {hexc(TEAL)}; --accent: {hexc(AMBER)}; }}\n")
print("brand teal", hexc(TEAL), "amber", hexc(AMBER))
print("lockup sizes", light.size, dark.size)
