#!/usr/bin/env python3
"""
Generate icon.png (transparent rounded), icon.ico (Win), icon.icns (macOS)
from build/icon.jpg using Pillow.
"""
from __future__ import annotations

import io
import os
import struct
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_JPG = os.path.join(HERE, "icon.jpg")
OUT_PNG = os.path.join(HERE, "icon.png")
OUT_ICO = os.path.join(HERE, "icon.ico")
OUT_ICNS = os.path.join(HERE, "icon.icns")

# -------------- utilities --------------
def apply_rounded_corners(im: Image.Image, radius: int) -> Image.Image:
    """Return an RGBA image with rounded corners (transparent outside)."""
    im = im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=radius, fill=255)
    im.putalpha(mask)
    return im

def crop_centered_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))

def save_png_bytes(im: Image.Image, compress_level: int = 6) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True, compress_level=compress_level)
    return buf.getvalue()

# -------------- ICNS writer --------------
# ICNS is a simple container: 'icns' header + TOC(optional) + typed entries.
# Each entry: 4-byte type (e.g. 'icp6') + 4-byte length (big endian, including header) + data.
# We output the modern sizes with ARGB or PNG data.
# Mapping from ICNS type -> pixel size (for PNG entries modern macOS supports PNG inside)
ICNS_PNG_TYPES = [
    # type, size, is_2x (label only)
    ("icp4", 16, False),  # 16x16
    ("ic11", 32, True),   # 16x16@2x = 32
    ("icp5", 32, False),  # 32x32
    ("ic12", 64, True),   # 32x32@2x = 64
    ("icp6", 64, False),  # 64x64  (sometimes used as small)
    ("ic07", 128, False), # 128x128
    ("ic13", 256, True),  # 128@2x
    ("ic08", 256, False), # 256x256
    ("ic14", 512, True),  # 256@2x
    ("ic09", 512, False), # 512x512
    ("ic10", 1024, True), # 512@2x (1024)
]

def build_icns(base_im: Image.Image) -> bytes:
    entries: list[tuple[bytes, bytes]] = []
    for typ, size, _is2x in ICNS_PNG_TYPES:
        resized = base_im.resize((size, size), Image.LANCZOS)
        data = save_png_bytes(resized, compress_level=9)
        # entry length = 8 (type+len) + data length
        length = 8 + len(data)
        header = typ.encode("ascii") + struct.pack(">I", length)
        entries.append((header, data))
    # total file length = 8 (master header) + sum of all entry lengths
    total = 8 + sum(len(h) + len(d) for h, d in entries)
    out = bytearray()
    out += b"icns" + struct.pack(">I", total)
    for h, d in entries:
        out += h
        out += d
    return bytes(out)

# -------------- ICO writer --------------
def build_ico(base_im: Image.Image) -> bytes:
    """Build a Windows .ICO with sizes 16/20/24/32/40/48/64/96/128/256."""
    sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    # 1. Generate PNG data for each size
    pngs: list[tuple[int, bytes]] = []  # (size, bytes)
    for s in sizes:
        resized = base_im.resize((s, s), Image.LANCZOS)
        # For 256: allow PNG inside ICO (modern Windows supports)
        pngs.append((s, save_png_bytes(resized, compress_level=9)))
    # 2. Build ICO header + ICONDIR entries (16 bytes each) + data
    # ICONDIR: idReserved(2) + idType(2) + idCount(2) = 6 bytes
    # ICONDIRENTRY(16 bytes each): bWidth,bHeight,bColorCount,bReserved(1ea)
    #                                wPlanes(2), wBitCount(2), dwBytesInRes(4), dwImageOffset(4)
    count = len(pngs)
    header = struct.pack("<HHH", 0, 1, count)
    data_start = 6 + 16 * count
    dir_entries = b""
    data_blobs = b""
    offset = data_start
    for s, png_data in pngs:
        # bWidth / bHeight: 0 means 256 (since value ranges 0-255)
        w = 0 if s == 256 else s
        h = 0 if s == 256 else s
        color_count = 0
        planes = 1
        bit_count = 32  # we store PNG, but set a conventional value
        length = len(png_data)
        dir_entries += struct.pack(
            "<BBBBHHII",
            w, h, color_count, 0, planes, bit_count, length, offset,
        )
        data_blobs += png_data
        offset += length
    return header + dir_entries + data_blobs

# -------------- main --------------
def main() -> int:
    if not os.path.exists(SRC_JPG):
        print(f"[icon-gen] missing source: {SRC_JPG}", file=sys.stderr)
        return 1
    src = Image.open(SRC_JPG)
    print(f"[icon-gen] source size={src.size} mode={src.mode}")

    # Step 1: make a 1024x1024 square RGBA rounded-corner base from source
    square = crop_centered_square(src).convert("RGB")
    # upscale to 1024 if smaller
    if square.size[0] < 1024:
        square = square.resize((1024, 1024), Image.LANCZOS)
    else:
        square = square.resize((1024, 1024), Image.LANCZOS)

    # Rounded corner radius for icons: macOS ~ 18% of side for 1024px
    radius_1024 = int(1024 * 0.175)  # ~179px
    base_rgba = apply_rounded_corners(square, radius_1024)

    # Step 2: write icon.png (512x512)
    p512 = base_rgba.resize((512, 512), Image.LANCZOS)
    p512.save(OUT_PNG, format="PNG", optimize=True)
    print(f"[icon-gen] wrote PNG  512x512 -> {OUT_PNG} ({os.path.getsize(OUT_PNG):,} bytes)")

    # Step 3: write icon.ico (Windows) — build from 256x256 rounded base
    p256 = base_rgba.resize((256, 256), Image.LANCZOS)
    ico_bytes = build_ico(p256)
    with open(OUT_ICO, "wb") as f:
        f.write(ico_bytes)
    print(f"[icon-gen] wrote ICO           -> {OUT_ICO} ({len(ico_bytes):,} bytes)")

    # Step 4: write icon.icns (macOS) — build from 1024 base (covers up to ic10=1024)
    icns_bytes = build_icns(base_rgba)
    with open(OUT_ICNS, "wb") as f:
        f.write(icns_bytes)
    print(f"[icon-gen] wrote ICNS          -> {OUT_ICNS} ({len(icns_bytes):,} bytes)")

    return 0

if __name__ == "__main__":
    sys.exit(main())
