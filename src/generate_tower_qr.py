import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

# =========================================================
# LOCATIONS / QR TOKENS
# =========================================================

locations = {
    "Tower 1": "30623123-7892-4586-b763-670fe8c4710d",
    "Tower 2": "95540a35-897e-4a75-ac8b-6a54ca99cc18",
    "Tower 3": "7abd137b-b283-483b-bb30-ccd59eac2941",
    "Tower 4": "65b7c18f-78a4-4428-8cb6-b78bf82621e2",
    "Tower 5": "9522fa0f-be65-47d9-a469-251d452d2852",
    "Tower 6": "488ffff6-d93d-46df-8497-fb421eed8bca",
    "Tower 7": "de1d0906-eead-444d-8e50-279b0ea1abae",
    "Tower 8": "e89be74f-2fd3-4d4d-b005-f58fd4584480",
    "Tower 9": "b9028518-0b64-4655-94d4-3da42250bee8",
    "Tower 10": "1e9b3ca0-3173-4e06-b731-57e4c3fea92e",
    "Tower 11": "464b0000-a043-4888-8e49-854bc9b67274",
    "Tower 12": "1125565a-1e5d-490c-adf3-18ecce599292",
    "Park 1": "PARK1",
    "Park 2": "PARK2",
}

OUTPUT_DIR = "inspection_qr_codes"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================================================
# WINDOWS FONTS
# =========================================================

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_NORMAL = "C:/Windows/Fonts/arial.ttf"

brand_font = ImageFont.truetype(FONT_BOLD, 25)
title_font = ImageFont.truetype(FONT_BOLD, 64)
header_subtitle_font = ImageFont.truetype(FONT_NORMAL, 27)

instruction_font = ImageFont.truetype(FONT_BOLD, 34)
subtitle_font = ImageFont.truetype(FONT_NORMAL, 25)

footer_brand_font = ImageFont.truetype(FONT_BOLD, 27)
footer_font = ImageFont.truetype(FONT_NORMAL, 22)

# =========================================================
# HELPER FUNCTIONS
# =========================================================

def centered_text(draw, text, y, font, fill, card_width):
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]

    draw.text(
        ((card_width - width) / 2, y),
        text,
        fill=fill,
        font=font
    )


# =========================================================
# GENERATE QR CARDS
# =========================================================

for name, token in locations.items():

    is_park = name.startswith("Park")

    # -----------------------------------------------------
    # COLORS
    # -----------------------------------------------------

    if is_park:
        header_color = "#176B3A"
        header_dark = "#10502B"
        accent_color = "#2E8B57"
        light_bg = "#EDF8F1"
        border_color = "#B9DDC6"
    else:
        header_color = "#155A96"
        header_dark = "#103F6B"
        accent_color = "#2878B9"
        light_bg = "#EEF6FD"
        border_color = "#B9D7F0"

    text_dark = "#243447"
    text_light = "#64748B"

    # =====================================================
    # QR CODE
    # =====================================================

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=14,
        border=4,
    )

    # Exact DB token inside QR
    qr.add_data(token)
    qr.make(fit=True)

    qr_image = qr.make_image(
        fill_color="black",
        back_color="white"
    ).convert("RGB")

    # =====================================================
    # CARD
    # =====================================================

    card_width = 800
    card_height = 1000

    card = Image.new(
        "RGB",
        (card_width, card_height),
        "#F8FAFC"
    )

    draw = ImageDraw.Draw(card)

    # =====================================================
    # OUTER CARD
    # =====================================================

    draw.rounded_rectangle(
        (14, 14, 786, 986),
        radius=32,
        fill="white",
        outline=border_color,
        width=4
    )

    # =====================================================
    # BEAUTIFIED HEADER
    # =====================================================

    # Main header
    draw.rounded_rectangle(
        (30, 30, 770, 210),
        radius=28,
        fill=header_color
    )

    # Dark branding strip
    draw.rounded_rectangle(
        (30, 30, 770, 84),
        radius=28,
        fill=header_dark
    )

    # Cover lower rounded part of branding strip
    draw.rectangle(
        (30, 58, 770, 84),
        fill=header_dark
    )

    # Small decorative line
    draw.rounded_rectangle(
        (330, 95, 470, 101),
        radius=3,
        fill="#FFFFFF"
    )

    # Brand
    centered_text(
        draw,
        "RWA POCKET-A",
        45,
        brand_font,
        "#FFFFFF",
        card_width
    )

    # Location name
    title_bbox = draw.textbbox(
        (0, 0),
        name,
        font=title_font
    )

    title_width = title_bbox[2] - title_bbox[0]

    draw.text(
        (
            (card_width - title_width) / 2,
            112
        ),
        name,
        fill="white",
        font=title_font
    )

    # Inspection type
    header_text = (
        "DAILY PARK INSPECTION"
        if is_park
        else "DAILY TOWER INSPECTION"
    )

    centered_text(
        draw,
        header_text,
        178,
        header_subtitle_font,
        "#DCEAF7" if not is_park else "#DDF3E5",
        card_width
    )

    # =====================================================
    # QR AREA
    # =====================================================

    qr_size = 520

    qr_image = qr_image.resize(
        (qr_size, qr_size),
        Image.Resampling.NEAREST
    )

    qr_x = (card_width - qr_size) // 2
    qr_y = 245

    # QR shadow
    draw.rounded_rectangle(
        (
            qr_x - 17,
            qr_y - 17,
            qr_x + qr_size + 17,
            qr_y + qr_size + 17
        ),
        radius=25,
        fill="#E5E7EB"
    )

    # QR white frame
    draw.rounded_rectangle(
        (
            qr_x - 11,
            qr_y - 11,
            qr_x + qr_size + 11,
            qr_y + qr_size + 11
        ),
        radius=21,
        fill="white"
    )

    card.paste(
        qr_image,
        (qr_x, qr_y)
    )

    # =====================================================
    # INSTRUCTION PANEL
    # =====================================================

    box_top = 800
    box_bottom = 885

    draw.rounded_rectangle(
        (
            65,
            box_top,
            735,
            box_bottom
        ),
        radius=20,
        fill=light_bg,
        outline=border_color,
        width=2
    )

    centered_text(
        draw,
        "SCAN QR CODE",
        810,
        instruction_font,
        header_color,
        card_width
    )

    second_line = (
        "Scan at this park during inspection"
        if is_park
        else "Scan at this tower during inspection"
    )

    centered_text(
        draw,
        second_line,
        851,
        subtitle_font,
        text_dark,
        card_width
    )

    # =====================================================
    # BEAUTIFIED FOOTER
    # =====================================================

    # Divider
    draw.line(
        (90, 911, 710, 911),
        fill=border_color,
        width=2
    )

    # Small accent mark
    draw.rounded_rectangle(
        (335, 908, 465, 914),
        radius=3,
        fill=accent_color
    )

    centered_text(
        draw,
        "Powered by RWA-AI",
        925,
        footer_brand_font,
        header_color,
        card_width
    )

    centered_text(
        draw,
        "RWA Pocket-A • Smart & Transparent Inspection",
        960,
        footer_font,
        text_light,
        card_width
    )

    # =====================================================
    # SAVE
    # =====================================================

    filename = (
        name.lower()
        .replace(" ", "-")
        + "-qr.png"
    )

    path = os.path.join(
        OUTPUT_DIR,
        filename
    )

    card.save(
        path,
        quality=100
    )

    print(
        f"{name} -> {token}"
    )


print()
print("All 14 QR codes generated successfully.")
print(f"Folder: {OUTPUT_DIR}")