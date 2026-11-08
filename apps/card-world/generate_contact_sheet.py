# -*- coding: utf-8 -*-
"""
Generate high-resolution categorized contact sheet for Card World.
Displays all 98 card icons + 7 ground decos grouped cleanly with labels.
"""

import os, re
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(BASE_DIR, "art", "icons")
DECO_DIR = os.path.join(BASE_DIR, "art", "deco")
SCRATCH_DIR = r"D:\MG\program\scratch\2026-11\2026-11-08_openlife-art"
os.makedirs(SCRATCH_DIR, exist_ok=True)

with open(os.path.join(BASE_DIR, "icons.js"), "r", encoding="utf-8") as f:
    text = f.read()
ALL_ICON_KEYS = re.findall(r'(\w+):\s*s\(', text)
DECO_KEYS = ["tree1", "tree2", "bush", "rock", "grass_tuft", "flowers", "reeds_small"]

CATEGORIES = [
    ("人物 (Characters - 6)", [
        "you", "aunt", "yu", "cook", "digger", "boatman"
    ]),
    ("建筑与设施 (Structures - 17)", [
        "house", "hut", "bighouse", "barn", "granary", "kiln", "stove", "cellar",
        "dock", "fence", "door", "bed", "rack", "plot", "pit", "scarecrow", "compost"
    ]),
    ("工具与行舟 (Tools & Vessels - 13)", [
        "axe", "knife", "hoe", "hammer", "spear", "net", "sandals", "basket", "chest", "table", "torch", "boat", "canoe"
    ]),
    ("原料与材料 (Resources - 18)", [
        "clay", "greenware", "jar", "crackedJar", "stone", "flint", "scree", "anvil",
        "fiber", "rope", "wood", "log", "ash", "muck", "meat", "pelt", "hide", "book"
    ]),
    ("作物与植被 (Plants & Crops - 21)", [
        "field", "fieldRipe", "grain", "bean", "hemp", "reed", "reeds", "berries", "berry",
        "peach", "peachTree", "jujube", "jujubeTree", "chestnut", "autumnChestnut",
        "pineGrove", "pineSnow", "winterTree", "barebush", "jungle", "mushroom"
    ]),
    ("生灵动物 (Fauna - 16)", [
        "dog", "rabbit", "deer", "boar", "bear", "tiger", "fox", "duck",
        "pheasant", "fish", "clam", "clams", "egg", "nest", "hive", "honey"
    ]),
    ("饮食与自然 (Food & Elements - 7)", [
        "cooked", "roastFish", "roastMeat", "water", "river", "road", "fire"
    ]),
    ("地面装饰 (Deco - Top-Down - 7)", DECO_KEYS)
]

# Verify all 98 icon keys + 7 deco keys are included exactly
included_icons = set()
for title, items in CATEGORIES[:-1]:
    included_icons.update(items)

diff_missing = set(ALL_ICON_KEYS) - included_icons
if diff_missing:
    print(f"Warning: missing from categories: {diff_missing}")
else:
    print(f"All {len(ALL_ICON_KEYS)} icons + {len(DECO_KEYS)} decos matched categories perfectly!")

def create_contact_sheet(output_filename="contact_sheet.png"):
    CELL_SIZE = 128
    LABEL_HEIGHT = 28
    SLOT_WIDTH = CELL_SIZE + 16
    SLOT_HEIGHT = CELL_SIZE + LABEL_HEIGHT + 14
    MAX_COLS = 8
    
    # Calculate overall dimensions
    total_height = 80 # header
    for title, items in CATEGORIES:
        rows = (len(items) + MAX_COLS - 1) // MAX_COLS
        total_height += 46 + rows * SLOT_HEIGHT + 24
        
    total_width = MAX_COLS * SLOT_WIDTH + 80
    
    # Background in soft parchment/linen earthy tint
    img = Image.new("RGBA", (total_width, total_height), (242, 238, 230, 255))
    draw = ImageDraw.Draw(img)
    
    # Try loading a readable font
    try:
        font_title = ImageFont.truetype("msyh.ttc", 22)
        font_sec = ImageFont.truetype("msyh.ttc", 17)
        font_label = ImageFont.truetype("consola.ttf", 13)
    except:
        font_title = font_sec = font_label = ImageFont.load_default()
        
    # Draw header banner
    draw.rectangle([0, 0, total_width, 60], fill=(58, 44, 32, 255))
    draw.text((30, 16), "《卡牌世界》美术全资产检视表 (98 卡牌图标 + 7 地面装饰)", fill=(245, 235, 215), font=font_title)
    
    y = 80
    for title, items in CATEGORIES:
        # Category Title
        draw.rectangle([30, y, 36, y + 24], fill=(181, 101, 62, 255))
        draw.text((45, y), title, fill=(58, 44, 32), font=font_sec)
        y += 36
        
        # Grid items
        for idx, key in enumerate(items):
            col = idx % MAX_COLS
            row = idx // MAX_COLS
            
            x_slot = 40 + col * SLOT_WIDTH
            y_slot = y + row * SLOT_HEIGHT
            
            # Draw slot card background (subtle card frame)
            draw.rounded_rectangle([x_slot, y_slot, x_slot + CELL_SIZE + 8, y_slot + CELL_SIZE + LABEL_HEIGHT + 6], radius=6, fill=(255, 255, 255, 230), outline=(215, 205, 190), width=1)
            
            # Load asset
            if title.startswith("地面装饰"):
                asset_path = os.path.join(DECO_DIR, f"{key}.png")
            else:
                asset_path = os.path.join(ICONS_DIR, f"{key}.png")
                
            if os.path.exists(asset_path):
                with Image.open(asset_path) as icon_img:
                    icon_resized = icon_img.convert("RGBA").resize((CELL_SIZE, CELL_SIZE), Image.Resampling.LANCZOS)
                    # Checkerboard background for transparency test
                    cb = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (240, 240, 240, 255))
                    cb_draw = ImageDraw.Draw(cb)
                    for cy in range(0, CELL_SIZE, 16):
                        for cx in range(0, CELL_SIZE, 16):
                            if (cx // 16 + cy // 16) % 2 == 0:
                                cb_draw.rectangle([cx, cy, cx + 15, cy + 15], fill=(225, 225, 225, 255))
                    cb.alpha_composite(icon_resized)
                    img.paste(cb, (x_slot + 4, y_slot + 4))
            else:
                draw.rectangle([x_slot + 4, y_slot + 4, x_slot + 4 + CELL_SIZE, y_slot + 4 + CELL_SIZE], fill=(230, 210, 210))
                draw.text((x_slot + 12, y_slot + 50), "MISSING", fill=(180, 50, 50), font=font_label)
                
            # Draw label
            draw.text((x_slot + 6, y_slot + CELL_SIZE + 8), key, fill=(58, 44, 32), font=font_label)
            
        rows = (len(items) + MAX_COLS - 1) // MAX_COLS
        y += rows * SLOT_HEIGHT + 24
        
    out_path = os.path.join(SCRATCH_DIR, output_filename)
    img.save(out_path)
    print(f"Contact sheet saved to: {out_path}")
    return out_path

if __name__ == "__main__":
    create_contact_sheet("contact_sheet.png")
