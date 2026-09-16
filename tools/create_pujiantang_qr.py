from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.graphics.barcode.qr import QrCodeWidget


URL = "https://pujiantang-tcm-ai-guide.lovable.app/"
OUT = Path(__file__).resolve().parents[1] / "outputs" / "普健堂官网二维码.png"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


qr_widget = QrCodeWidget(URL, barLevel="H")
qr_widget.qr.make()
matrix = qr_widget.qr.modules

module = 20
quiet = 4
qr_size = (len(matrix) + quiet * 2) * module
qr_image = Image.new("RGB", (qr_size, qr_size), "#fffdf8")
qr_draw = ImageDraw.Draw(qr_image)
for row, values in enumerate(matrix):
    for col, dark in enumerate(values):
        if dark:
            x0 = (col + quiet) * module
            y0 = (row + quiet) * module
            qr_draw.rectangle((x0, y0, x0 + module - 1, y0 + module - 1), fill="#073c31")

canvas = Image.new("RGB", (1080, 1280), "#f5f1e7")
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((54, 54, 1026, 1226), radius=40, fill="#fffdf8", outline="#d9d4c8", width=2)

title_font = font(54, bold=True)
sub_font = font(26)
url_font = font(20)

title = "普健堂"
subtitle = "微信扫码打开官方网站"
title_box = draw.textbbox((0, 0), title, font=title_font)
sub_box = draw.textbbox((0, 0), subtitle, font=sub_font)
draw.text(((1080 - (title_box[2] - title_box[0])) / 2, 110), title, font=title_font, fill="#073c31")
draw.text(((1080 - (sub_box[2] - sub_box[0])) / 2, 186), subtitle, font=sub_font, fill="#6e766f")

canvas.paste(qr_image, ((1080 - qr_size) // 2, 250))

draw.line((150, 1110, 930, 1110), fill="#dfdbd1", width=2)
url_box = draw.textbbox((0, 0), URL, font=url_font)
draw.text(((1080 - (url_box[2] - url_box[0])) / 2, 1145), URL, font=url_font, fill="#66726c")

OUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT, format="PNG", optimize=True)
print(OUT)
