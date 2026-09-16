from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.graphics.barcode.qrencoder import QRCode, QRErrorCorrectLevel


URL = "https://pujiantang-tcm-ai-guide.lovable.app/"
OUTPUT = Path(__file__).parent / "outputs" / "普健堂中医官网-扫码访问.png"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def centered_text(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill: str) -> None:
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    draw.text(((1400 - width) // 2, y), text, font=font, fill=fill)


def main() -> None:
    qr = QRCode(None, QRErrorCorrectLevel.H)
    qr.addData(URL)
    qr.make()
    matrix = qr.modules
    module_count = qr.moduleCount

    canvas = Image.new("RGB", (1400, 1580), "#F7F4EA")
    draw = ImageDraw.Draw(canvas)

    centered_text(draw, 72, "普健堂中医官网", load_font(76, bold=True), "#0E5A43")
    centered_text(draw, 174, "扫码进入 · 在线健康咨询", load_font(38), "#5B6F62")

    quiet_modules = 4
    qr_area = 1120
    module_px = qr_area // (module_count + quiet_modules * 2)
    actual_size = module_px * (module_count + quiet_modules * 2)
    origin_x = (1400 - actual_size) // 2
    origin_y = 292

    draw.rounded_rectangle(
        (origin_x - 28, origin_y - 28, origin_x + actual_size + 28, origin_y + actual_size + 28),
        radius=42,
        fill="#FFFFFF",
        outline="#D8DFD9",
        width=3,
    )

    qr_x = origin_x + quiet_modules * module_px
    qr_y = origin_y + quiet_modules * module_px
    for row, values in enumerate(matrix):
        for col, value in enumerate(values):
            if value:
                x0 = qr_x + col * module_px
                y0 = qr_y + row * module_px
                draw.rectangle(
                    (x0, y0, x0 + module_px - 1, y0 + module_px - 1),
                    fill="#0B4F3C",
                )

    caption_y = origin_y + actual_size + 78
    centered_text(draw, caption_y, "从看见身体开始，让长期见证信任。", load_font(34), "#344B40")
    centered_text(draw, caption_y + 62, URL, load_font(23), "#718078")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, format="PNG", optimize=True)
    print(OUTPUT)
    print(f"matrix={module_count}x{module_count}, module={module_px}px, url={URL}")


if __name__ == "__main__":
    main()
