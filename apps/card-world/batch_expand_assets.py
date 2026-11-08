import os
from playwright.sync_api import sync_playwright

ICONS_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\icons"
GROUND_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\ground"
DECO_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\deco"
SVG_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\svgs"

os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(GROUND_DIR, exist_ok=True)
os.makedirs(DECO_DIR, exist_ok=True)
os.makedirs(SVG_DIR, exist_ok=True)

# Standard stroke and colors
ST = 'stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"'

ICONS_SVGS = {
    # 独木舟
    "canoe": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M4 52 C12 48 20 54 32 50 C44 46 52 54 60 50" stroke="#4f7a78" stroke-width="3" fill="none" />
    <path d="M4 35 C16 45 48 45 60 35 C52 44 42 46 32 46 C22 46 12 44 4 35 Z" fill="#7a5434" />
    <path d="M10 36 C22 42 42 42 54 36" stroke="#5a3a24" stroke-width="2" fill="none" />
    <path d="M42 12 L26 42" stroke="#8a5a34" stroke-width="4" stroke-linecap="round" fill="none" />
    <ellipse cx="43" cy="11" rx="4" ry="7" transform="rotate(-30 43 11)" fill="#8a5a34" />
  </g>
</svg>""",

    # 渡口
    "dock": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M2 42 C14 38 24 44 34 40 C44 36 54 44 62 40 V62 H2 Z" fill="#6f9a92" />
    <rect x="8" y="24" width="48" height="12" rx="3" fill="#8a5a34" />
    <path d="M16 36 V58 M32 36 V58 M48 36 V58" stroke="#5a3a24" stroke-width="4" />
    <path d="M18 24 V36 M28 24 V36 M38 24 V36 M48 24 V36" stroke="#5a3a24" stroke-width="2" />
    <path d="M6 48 C16 45 26 50 36 47" stroke="#4f7a78" stroke-width="2" fill="none" />
  </g>
</svg>""",

    # 公仓（架空粮仓）
    "granary": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M16 42 V58 M48 42 V58 M32 42 V58" stroke="#5a3a24" stroke-width="4" />
    <ellipse cx="16" cy="44" rx="4" ry="2" fill="#8f8577" />
    <ellipse cx="48" cy="44" rx="4" ry="2" fill="#8f8577" />
    <rect x="12" y="22" width="40" height="20" rx="3" fill="#c9a96a" />
    <path d="M12 28 H52 M12 34 H52" stroke="#a88a52" stroke-width="2" />
    <path d="M6 24 L32 6 L58 24 Z" fill="#8a5a34" />
    <path d="M8 22 L32 8 L56 22" fill="none" stroke="#e8d6b0" stroke-width="2" />
  </g>
</svg>""",

    # 陶窑
    "kiln": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M10 56 C10 28 20 14 32 14 C44 14 54 28 54 56 Z" fill="#b0704a" />
    <path d="M22 56 V40 C22 34 42 34 42 40 V56 Z" fill="#3a2418" />
    <path d="M26 52 C28 46 31 42 32 36 C34 42 36 46 38 52 Z" fill="#f0a24a" />
    <path d="M30 14 Q32 8 30 4 M34 14 Q36 6 34 2" stroke="#8a8478" stroke-width="2" fill="none" />
  </g>
</svg>""",

    # 小窝棚
    "hut": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M8 56 L32 10 L56 56 Z" fill="#c9a96a" />
    <path d="M28 56 V38 H36 V56 Z" fill="#5a3a24" />
    <path d="M18 36 L32 18 L46 36" stroke="#8a6a3e" stroke-width="3" fill="none" />
    <path d="M6 56 H58" stroke="#3a2c20" stroke-width="3" />
  </g>
</svg>""",

    # 晾坯架
    "rack": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M12 56 V16 M52 56 V16" stroke="#8a5a34" stroke-width="4" />
    <path d="M8 26 H56 M8 44 H56" stroke="#8a5a34" stroke-width="3.5" />
    <path d="M18 26 C18 18 28 18 28 26 Z" fill="#dcc8a6" />
    <path d="M36 26 C36 18 46 18 46 26 Z" fill="#dcc8a6" />
    <path d="M27 44 C27 36 37 36 37 44 Z" fill="#dcc8a6" />
  </g>
</svg>""",

    # 铺位
    "bed": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="6" y="24" width="52" height="24" rx="4" fill="#c9a96a" />
    <path d="M6 32 H58 M6 40 H58" stroke="#a88a52" stroke-width="2" />
    <path d="M14 26 C18 20 46 20 50 26 C48 38 52 44 48 46 C34 44 26 48 14 46 Z" fill="#b07a4a" />
    <circle cx="24" cy="34" r="2" fill="#8a5a34" stroke="none" />
    <circle cx="38" cy="32" r="2.5" fill="#8a5a34" stroke="none" />
    <circle cx="32" cy="40" r="2" fill="#8a5a34" stroke="none" />
    <rect x="8" y="26" width="12" height="18" rx="2" fill="#e8d6b0" />
  </g>
</svg>""",

    # 陶碗熟粟饭
    "cooked": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M12 36 C12 50 20 54 32 54 C44 54 52 50 52 36 Z" fill="#b5653e" />
    <ellipse cx="32" cy="36" rx="20" ry="8" fill="#e0c050" />
    <ellipse cx="32" cy="34" rx="14" ry="5" fill="#f6ecd8" />
    <path d="M24 24 Q28 16 26 10 M34 22 Q38 14 36 8 M42 24 Q46 16 44 10" stroke="#cfc6b4" stroke-width="2.5" fill="none" />
  </g>
</svg>""",

    # 湿黏土
    "clay": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M14 48 C10 36 20 22 32 22 C44 22 54 34 50 48 C44 54 20 56 14 48 Z" fill="#b8754a" />
    <path d="M22 36 C28 32 38 32 42 36" stroke="#d9a07a" stroke-width="3" fill="none" />
    <path d="M26 44 C30 42 36 42 40 44" stroke="#8a5a34" stroke-width="2" fill="none" />
  </g>
</svg>""",

    # 一捆芦苇
    "reed": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M16 52 L48 12 M20 54 L52 14 M14 48 L46 8" stroke="#c9a96a" stroke-width="4" stroke-linecap="round" fill="none" />
    <rect x="26" y="26" width="14" height="8" rx="2" transform="rotate(-45 33 30)" fill="#8a5a34" />
    <path d="M44 8 C48 6 52 12 50 16" stroke="#7a8a44" stroke-width="2.5" fill="none" />
  </g>
</svg>""",

    # 一卷麻绳
    "rope": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <ellipse cx="32" cy="42" rx="20" ry="10" fill="none" stroke="#a88a52" stroke-width="6" />
    <ellipse cx="32" cy="34" rx="16" ry="8" fill="none" stroke="#c9a96a" stroke-width="6" />
    <ellipse cx="32" cy="26" rx="12" ry="6" fill="none" stroke="#a88a52" stroke-width="5" />
    <path d="M38 22 C44 16 50 18 52 24" stroke="#c9a96a" stroke-width="4" fill="none" />
  </g>
</svg>""",

    # 燧石
    "flint": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M16 48 L10 28 L24 14 L46 18 L54 36 L40 52 Z" fill="#4a4a52" />
    <path d="M24 14 L30 32 L54 36 M30 32 L16 48 M30 32 L40 52" stroke="#6e6e7a" stroke-width="2" fill="none" />
    <path d="M18 24 L24 20" stroke="#9a9aa8" stroke-width="3" stroke-linecap="round" />
  </g>
</svg>""",

    # 木柴
    "wood": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="8" y="38" width="48" height="14" rx="7" fill="#8a5a34" />
    <ellipse cx="14" cy="45" rx="5" ry="7" fill="#c9a06a" />
    <rect x="12" y="24" width="44" height="14" rx="7" fill="#a8784a" />
    <ellipse cx="18" cy="31" rx="5" ry="7" fill="#e8d6b0" />
    <rect x="18" y="10" width="38" height="14" rx="7" fill="#8a5a34" />
    <ellipse cx="24" cy="17" rx="5" ry="7" fill="#c9a06a" />
    <rect x="30" y="8" width="6" height="46" rx="2" fill="#d8c8a0" />
  </g>
</svg>""",

    # 野兔
    "rabbit": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <ellipse cx="36" cy="44" rx="16" ry="11" fill="#d8c8b0" />
    <circle cx="22" cy="34" r="8" fill="#e0d2ba" />
    <path d="M18 26 C14 14 16 8 20 8 C24 8 24 16 22 26" fill="#e0d2ba" />
    <path d="M24 26 C22 14 26 8 30 8 C34 8 32 16 28 26" fill="#e0d2ba" />
    <circle cx="19" cy="32" r="1.8" fill="#3a2c20" stroke="none" />
    <circle cx="52" cy="42" r="4" fill="#f2ead8" />
    <ellipse cx="32" cy="53" rx="7" ry="3" fill="#d8c8b0" />
    <ellipse cx="44" cy="52" rx="5" ry="3" fill="#d8c8b0" />
  </g>
</svg>""",

    # 鹿
    "deer": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M14 42 C14 34 22 30 32 30 H42 L48 24 L52 28 C52 38 46 44 38 44 H20 C16 44 14 40 14 42 Z" fill="#b07a4a" />
    <path d="M18 46 V58 M26 48 V58 M36 48 V58 M44 46 V58" stroke="#3a2c20" stroke-width="2.5" />
    <path d="M48 24 L44 14 M48 24 L54 12 M44 14 L40 10 M54 12 L58 10" stroke="#7a5434" stroke-width="3" stroke-linecap="round" fill="none" />
    <circle cx="48" cy="27" r="1.8" fill="#3a2c20" stroke="none" />
    <circle cx="26" cy="36" r="1.5" fill="#f0e0c0" stroke="none" />
    <circle cx="32" cy="34" r="1.5" fill="#f0e0c0" stroke="none" />
    <circle cx="36" cy="38" r="1.5" fill="#f0e0c0" stroke="none" />
  </g>
</svg>""",

    # 野猪
    "boar": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M10 42 C10 32 18 26 30 26 H42 C50 26 56 32 56 38 C56 46 48 48 40 48 H18 C14 48 10 44 10 42 Z" fill="#5e4636" />
    <path d="M16 48 V58 M24 48 V58 M38 48 V58 M46 48 V58" stroke="#3a2c20" stroke-width="3" />
    <path d="M22 26 L24 20 L28 26 M30 26 L32 18 L36 26" stroke="#3a2c20" stroke-width="2.5" fill="none" />
    <path d="M52 40 L58 36" stroke="#f0e6c8" stroke-width="3" stroke-linecap="round" />
    <circle cx="48" cy="34" r="2" fill="#f0e6c8" stroke="none" />
  </g>
</svg>""",

    # 野鸭
    "duck": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M4 52 C12 48 20 54 32 50 C44 46 52 54 60 50" stroke="#4f7a78" stroke-width="3" fill="none" />
    <path d="M14 42 C14 34 22 30 32 30 C38 30 42 34 42 38 H48 C46 46 40 50 32 50 H22 C18 50 14 46 14 42 Z" fill="#8a7a5a" />
    <circle cx="42" cy="24" r="8" fill="#3f6a4a" />
    <path d="M48 24 L58 26 L48 28 Z" fill="#e0a040" />
    <circle cx="44" cy="22" r="1.5" fill="#fff" stroke="none" />
  </g>
</svg>""",

    # 猛虎
    "tiger": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M8 40 C4 38 4 30 8 26" stroke="#d88a3a" stroke-width="4" stroke-linecap="round" fill="none" />
    <path d="M10 42 C10 32 20 26 32 26 H44 C52 26 56 32 56 38 C56 46 48 50 40 50 H18 C14 50 10 46 10 42 Z" fill="#d88a3a" />
    <path d="M22 28 L20 36 M30 28 L28 36 M38 28 L36 36 M26 48 L28 42 M34 48 L36 42" stroke="#3a2c20" stroke-width="3" stroke-linecap="round" />
    <path d="M16 50 V58 M24 50 V58 M38 50 V58 M46 50 V58" stroke="#3a2c20" stroke-width="3" />
    <circle cx="48" cy="30" r="9" fill="#e09a48" />
    <path d="M42 24 L40 18 M52 24 L54 18" stroke="#3a2c20" stroke-width="2.5" />
    <circle cx="45" cy="29" r="1.5" fill="#3a2c20" stroke="none" />
    <circle cx="51" cy="29" r="1.5" fill="#3a2c20" stroke="none" />
    <path d="M47 34 L49 34" stroke="#3a2c20" stroke-width="2" />
  </g>
</svg>""",

    # 背篓
    "basket": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M14 22 H50 L45 56 H19 Z" fill="#c9a96a" />
    <path d="M16 32 H48 M17 42 H47 M18 50 H46" stroke="#8a6a3e" stroke-width="2.5" />
    <path d="M24 22 V56 M32 22 V56 M40 22 V56" stroke="#a88a52" stroke-width="2" />
    <path d="M18 22 C14 10 50 10 46 22" fill="none" stroke="#8a5a34" stroke-width="3" />
  </g>
</svg>""",

    # 草鞋
    "sandals": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M12 46 C12 30 18 20 24 20 C30 20 32 30 30 46 C29 54 13 54 12 46 Z" fill="#c9a96a" />
    <path d="M34 46 C34 30 40 20 46 20 C52 20 54 30 52 46 C51 54 35 54 34 46 Z" fill="#c9a96a" />
    <path d="M16 32 L26 38 M38 32 L48 38" stroke="#8a6a3e" stroke-width="2.5" />
    <path d="M15 42 H27 M37 42 H49" stroke="#8a6a3e" stroke-width="2.5" />
  </g>
</svg>"""
}

# 4 Ground Seamless Textures (512x512)
GROUND_SVGS = {
    # 柔和无缝草地
    "grass": """<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#789d58"/>
  <g fill="#6d8e4e" opacity="0.35">
    <circle cx="64" cy="64" r="18"/><circle cx="192" cy="128" r="24"/><circle cx="384" cy="96" r="22"/>
    <circle cx="128" cy="320" r="26"/><circle cx="320" cy="256" r="20"/><circle cx="448" cy="384" r="28"/>
    <circle cx="256" cy="448" r="22"/>
  </g>
  <g stroke="#5d7e40" stroke-width="3" stroke-linecap="round" opacity="0.5">
    <path d="M50 80 L52 70 M53 80 L57 72 M180 140 L182 130 M370 110 L374 100"/>
    <path d="M110 330 L112 320 M300 270 L303 260 M430 400 L435 388"/>
  </g>
</svg>""",

    # 踩实夯土院落
    "dirt": """<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#c4a272"/>
  <g fill="#b08e5e" opacity="0.4">
    <circle cx="80" cy="90" r="14"/><circle cx="240" cy="160" r="18"/><circle cx="400" cy="80" r="16"/>
    <circle cx="150" cy="360" r="20"/><circle cx="330" cy="290" r="15"/><circle cx="460" cy="420" r="18"/>
  </g>
  <g fill="#8f7248" opacity="0.3">
    <circle cx="120" cy="110" r="4"/><circle cx="280" cy="140" r="5"/><circle cx="360" cy="120" r="4"/>
    <circle cx="90" cy="400" r="5"/><circle cx="260" cy="320" r="4"/><circle cx="420" cy="350" r="5"/>
  </g>
</svg>""",

    # 柔和河流水波
    "water": """<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#659690"/>
  <g stroke="#8cb8b2" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.6">
    <path d="M30 64 C90 50 150 78 210 64 C270 50 330 78 390 64 C450 50 510 78 570 64"/>
    <path d="M-30 192 C30 178 90 206 150 192 C210 178 270 206 330 192 C390 178 450 206 510 192"/>
    <path d="M30 320 C90 306 150 334 210 320 C270 306 330 334 390 320 C450 306 510 334 570 320"/>
    <path d="M-30 448 C30 434 90 462 150 448 C210 434 270 462 330 448 C390 434 450 462 510 448"/>
  </g>
</svg>""",

    # 翻耕垄田
    "field": """<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#9c7a4c"/>
  <g stroke="#7a5a34" stroke-width="14" stroke-linecap="square">
    <line x1="0" y1="32" x2="512" y2="32"/>
    <line x1="0" y1="96" x2="512" y2="96"/>
    <line x1="0" y1="160" x2="512" y2="160"/>
    <line x1="0" y1="224" x2="512" y2="224"/>
    <line x1="0" y1="288" x2="512" y2="288"/>
    <line x1="0" y1="352" x2="512" y2="352"/>
    <line x1="0" y1="416" x2="512" y2="416"/>
    <line x1="0" y1="480" x2="512" y2="480"/>
  </g>
</svg>"""
}

def main():
    print("开始渲染扩充资产...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        
        # 1. Render all 20 Icons (256x256)
        page_icon = browser.new_page(viewport={"width": 256, "height": 256})
        for name, svg in ICONS_SVGS.items():
            svg_path = os.path.join(SVG_DIR, f"{name}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg)
                
            html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>body {{ margin:0; background:transparent; }} svg {{ width:256px; height:256px; }}</style></head><body>{svg}</body></html>"""
            page_icon.set_content(html)
            png_path = os.path.join(ICONS_DIR, f"{name}.png")
            page_icon.screenshot(path=png_path, omit_background=True)
            print(f"  [Icon] -> {name}.png")
        page_icon.close()

        # 2. Render all 4 Ground Textures (512x512)
        page_ground = browser.new_page(viewport={"width": 512, "height": 512})
        for name, svg in GROUND_SVGS.items():
            html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>body {{ margin:0; }} svg {{ width:512px; height:512px; }}</style></head><body>{svg}</body></html>"""
            page_ground.set_content(html)
            png_path = os.path.join(GROUND_DIR, f"{name}.png")
            page_ground.screenshot(path=png_path)
            print(f"  [Ground] -> {name}.png")
        page_ground.close()

        browser.close()
    print("全部扩充资产生成并装配完毕！")

if __name__ == "__main__":
    main()
