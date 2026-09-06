import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

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

# Windows fonts
FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_NORMAL = "C:/Windows/Fonts/arial.ttf"

title_font = ImageFont.truetype(
    FONT_BOLD,
    60
)

instruction_font = ImageFont.truetype(
    FONT_BOLD,
    34
)

footer_font = ImageFont.truetype(
    FONT_BOLD,
    32
)

subtitle_font = ImageFont.truetype(
    FONT_NORMAL,
    26
)

for name, token in locations.items():

    # =====================================================
    # QR CODE
    # =====================================================

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=14,
        border=4,
    )

    # Exact DB token goes inside QR
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
        "white"
    )

    draw = ImageDraw.Draw(card)

    # =====================================================
    # BORDER
    # =====================================================

    draw.rounded_rectangle(
        (15, 15, 785, 985),
        radius=30,
        outline="#B7D6F4",
        width=5
    )

    # =====================================================
    # HEADER
    # =====================================================

    is_park = name.startswith("Park")

    header_color = (
        "#16723A"
        if is_park
        else "#155A96"
    )

    draw.rounded_rectangle(
        (30, 30, 770, 190),
        radius=28,
        fill=header_color
    )

    title_bbox = draw.textbbox(
        (0, 0),
        name,
        font=title_font
    )

    title_width = (
        title_bbox[2]
        - title_bbox[0]
    )

    title_height = (
        title_bbox[3]
        - title_bbox[1]
    )

    draw.text(
        (
            (card_width - title_width) / 2,
            105 - title_height / 2
        ),
        name,
        fill="white",
        font=title_font
    )

    # =====================================================
    # QR
    # =====================================================

    qr_size = 540

    qr_image = qr_image.resize(
        (qr_size, qr_size),
        Image.Resampling.NEAREST
    )

    qr_x = (
        card_width - qr_size
    ) // 2

    qr_y = 225

    card.paste(
        qr_image,
        (
            qr_x,
            qr_y
        )
    )

    # =====================================================
    # INSTRUCTION BOX
    # =====================================================

    box_top = 790
    box_bottom = 875

    draw.rounded_rectangle(
        (
            60,
            box_top,
            740,
            box_bottom
        ),
        radius=20,
        fill=(
            "#EAF7EE"
            if is_park
            else "#EAF4FD"
        )
    )

    instruction = "Scan QR Code"

    instruction_bbox = draw.textbbox(
        (0, 0),
        instruction,
        font=instruction_font
    )

    instruction_width = (
        instruction_bbox[2]
        - instruction_bbox[0]
    )

    draw.text(
        (
            (
                card_width
                - instruction_width
            ) / 2,
            800
        ),
        instruction,
        fill=header_color,
        font=instruction_font
    )

    second_line = (
        "at this park during inspection"
        if is_park
        else "at this tower during inspection"
    )

    second_bbox = draw.textbbox(
        (0, 0),
        second_line,
        font=subtitle_font
    )

    second_width = (
        second_bbox[2]
        - second_bbox[0]
    )

    draw.text(
        (
            (
                card_width
                - second_width
            ) / 2,
            840
        ),
        second_line,
        fill="#394E65",
        font=subtitle_font
    )

    # =====================================================
    # FOOTER
    # =====================================================

    footer = "RWA POCKET-A"

    footer_bbox = draw.textbbox(
        (0, 0),
        footer,
        font=footer_font
    )

    footer_width = (
        footer_bbox[2]
        - footer_bbox[0]
    )

    draw.text(
        (
            (
                card_width
                - footer_width
            ) / 2,
            900
        ),
        footer,
        fill=header_color,
        font=footer_font
    )

    subtitle = (
        "Park Inspection"
        if is_park
        else "Tower Inspection"
    )

    subtitle_bbox = draw.textbbox(
        (0, 0),
        subtitle,
        font=subtitle_font
    )

    subtitle_width = (
        subtitle_bbox[2]
        - subtitle_bbox[0]
    )

    draw.text(
        (
            (
                card_width
                - subtitle_width
            ) / 2,
            942
        ),
        subtitle,
        fill="#637387",
        font=subtitle_font
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
print(
    "All 14 QR codes generated successfully."
)

print(
    f"Folder: {OUTPUT_DIR}"
)