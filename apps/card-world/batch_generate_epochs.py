import os
from playwright.sync_api import sync_playwright

ICONS_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\icons"
SVG_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\svgs"
os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(SVG_DIR, exist_ok=True)

ST = 'stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"'

EPOCH_SVGS = {
    # ==================== 1. 青铜与封建时代 (Feudal & Bronze) ====================
    # 铁匠
    "blacksmith": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="18" r="9" fill="#e8b98e"/>
    <path d="M22 14 C24 8 40 8 42 14" fill="#3a2c20"/>
    <path d="M16 56 C16 40 22 34 32 34 C42 34 48 40 48 56 Z" fill="#b07a50"/>
    <path d="M22 38 H42 V56 H22 Z" fill="#5a3a24"/>
    <path d="M46 34 L56 26" stroke="#4a4a52" stroke-width="4"/>
    <rect x="52" y="20" width="8" height="12" rx="2" fill="#8f8577"/>
  </g>
</svg>""",

    # 儒生
    "scholar": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="18" r="9" fill="#efc59c"/>
    <path d="M22 13 H42 V7 H22 Z" fill="#3a2c20"/>
    <path d="M14 56 C14 36 22 32 32 32 C42 32 50 36 50 56 Z" fill="#6f8fb0"/>
    <path d="M24 38 L32 46 L40 38" stroke="#fffaf0" stroke-width="2.5" fill="none"/>
    <rect x="18" y="44" width="12" height="10" rx="1" fill="#e8d6b0"/>
    <path d="M40 42 L48 50" stroke="#8a5a34" stroke-width="2.5"/>
  </g>
</svg>""",

    # 甲卒
    "soldier": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="18" r="9" fill="#d9a07a"/>
    <path d="M20 18 C20 8 44 8 44 18 H20 Z" fill="#6f8f5a"/>
    <path d="M30 6 V12" stroke="#c4473e" stroke-width="3"/>
    <path d="M16 56 C16 38 22 32 32 32 C42 32 48 38 48 56 Z" fill="#7a5434"/>
    <rect x="22" y="36" width="20" height="18" rx="2" fill="#6f8f5a"/>
    <path d="M12 16 L12 58" stroke="#8a5a34" stroke-width="3"/>
    <path d="M8 18 H18 L16 12 Z" fill="#6f8f5a"/>
  </g>
</svg>""",

    # 青铜剑
    "bronze_sword": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M32 6 L38 22 L36 44 L32 46 L28 44 L26 22 Z" fill="#5c8a70"/>
    <line x1="32" y1="8" x2="32" y2="44" stroke="#3d6250" stroke-width="1.8"/>
    <rect x="22" y="46" width="20" height="4" rx="2" fill="#8a6a3e"/>
    <rect x="30" y="50" width="4" height="10" rx="1" fill="#5a3a24"/>
    <circle cx="32" cy="61" r="2.5" fill="#8a6a3e"/>
  </g>
</svg>""",

    # 铜机弩
    "crossbow": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M6 24 Q32 10 58 24" stroke="#8a5a34" stroke-width="5" fill="none"/>
    <rect x="30" y="16" width="4" height="42" rx="2" fill="#5a3a24"/>
    <path d="M8 24 L32 40 L56 24" stroke="#e8d6b0" stroke-width="2" fill="none"/>
    <rect x="28" y="36" width="8" height="6" rx="1" fill="#6f8f5a"/>
  </g>
</svg>""",

    # 铁耕犁
    "iron_plow": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M12 50 C24 50 36 34 56 30" stroke="#8a5a34" stroke-width="5" fill="none"/>
    <path d="M14 50 L28 24" stroke="#8a5a34" stroke-width="4"/>
    <path d="M10 52 L26 42 L22 56 Z" fill="#4a4a52"/>
  </g>
</svg>""",

    # 茶砖
    "tea_brick": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="10" y="18" width="44" height="30" rx="3" fill="#4a3426"/>
    <rect x="16" y="24" width="32" height="18" rx="2" fill="#3a281e" stroke="#281a12" stroke-width="1.5"/>
    <circle cx="32" cy="33" r="5" fill="none" stroke="#6a4c38" stroke-width="2"/>
  </g>
</svg>""",

    # 铜钱串
    "coin_copper": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M32 8 V56" stroke="#a8843a" stroke-width="4"/>
    <circle cx="32" cy="20" r="10" fill="#b8754a"/>
    <rect x="29" y="17" width="6" height="6" fill="#3a2c20" stroke="none"/>
    <circle cx="32" cy="36" r="10" fill="#b8754a"/>
    <rect x="29" y="33" width="6" height="6" fill="#3a2c20" stroke="none"/>
    <circle cx="32" cy="50" r="9" fill="#b8754a"/>
    <rect x="29" y="47" width="6" height="6" fill="#3a2c20" stroke="none"/>
  </g>
</svg>""",

    # 水磨水车
    "watermill": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="32" r="22" fill="#8a5a34"/>
    <circle cx="32" cy="32" r="12" fill="#c9a06a"/>
    <line x1="32" y1="10" x2="32" y2="54" stroke="#3a2c20" stroke-width="2.5"/>
    <line x1="10" y1="32" x2="54" y2="32" stroke="#3a2c20" stroke-width="2.5"/>
    <path d="M4 52 C16 48 32 54 60 50" stroke="#4f7a78" stroke-width="4" fill="none"/>
  </g>
</svg>""",

    # 客栈
    "tavern": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M6 28 L32 10 L58 28 Z" fill="#8a5a34"/>
    <rect x="12" y="28" width="40" height="28" rx="2" fill="#e8d6b0"/>
    <rect x="26" y="42" width="12" height="14" rx="2" fill="#5a3a24"/>
    <path d="M48 26 L56 34" stroke="#8a5a34" stroke-width="2.5"/>
    <rect x="52" y="32" width="8" height="10" fill="#c4473e" stroke="#3a2c20" stroke-width="1.5"/>
  </g>
</svg>""",

    # ==================== 2. 东方修仙时代 (Xianxia & Cultivation) ====================
    # 剑修道童
    "cultivator": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="18" r="9" fill="#f0c9a0"/>
    <circle cx="32" cy="8" r="4" fill="#3a2c20"/>
    <path d="M14 56 C14 36 22 30 32 30 C42 30 50 36 50 56 Z" fill="#7fc8b8"/>
    <path d="M22 36 L32 46 L42 36" stroke="#fffaf0" stroke-width="2.5" fill="none"/>
    <path d="M44 8 L54 52" stroke="#d0e8e0" stroke-width="2.5"/>
  </g>
</svg>""",

    # 炼丹长老
    "alchemist": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="18" r="9" fill="#efc59c"/>
    <path d="M26 22 C26 32 38 32 38 22" fill="#fffaf0"/>
    <path d="M14 56 C14 34 22 30 32 30 C42 30 50 34 50 56 Z" fill="#6a5478"/>
    <circle cx="32" cy="40" r="5" fill="#f0d27a" stroke="none"/>
  </g>
</svg>""",

    # 九尾灵狐
    "spirit_fox": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <ellipse cx="32" cy="42" rx="16" ry="11" fill="#fffaf0"/>
    <circle cx="20" cy="30" r="8" fill="#fffaf0"/>
    <path d="M16 24 L14 12 L22 22 Z" fill="#f0d0c0"/>
    <path d="M22 24 L26 12 L28 22 Z" fill="#f0d0c0"/>
    <circle cx="18" cy="28" r="1.5" fill="#3a2c20" stroke="none"/>
    <ellipse cx="20" cy="24" rx="1" ry="2" fill="#c4473e" stroke="none"/>
    <path d="M42 38 C54 28 58 14 50 10 C44 20 44 32 44 42" fill="#fffaf0"/>
  </g>
</svg>""",

    # 灵犀飞剑
    "flying_sword": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M32 6 L36 18 L34 46 L32 48 L30 46 L28 18 Z" fill="#b0f0e0"/>
    <path d="M22 48 H42 V51 H22 Z" fill="#f0d27a"/>
    <rect x="30" y="51" width="4" height="9" fill="#7a5434"/>
    <circle cx="32" cy="30" r="18" fill="none" stroke="#7fe0c8" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>
  </g>
</svg>""",

    # 八卦炼丹炉
    "alchemy_furnace": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="34" r="18" fill="#7a4a60"/>
    <ellipse cx="32" cy="18" rx="12" ry="4" fill="#a06880"/>
    <path d="M32 10 L35 18 H29 Z" fill="#f0d27a"/>
    <path d="M18 50 L14 60 M46 50 L50 60 M32 52 V60" stroke="#5a3446" stroke-width="4"/>
    <circle cx="32" cy="34" r="5" fill="#f0a24a" stroke="none"/>
  </g>
</svg>""",

    # 五行灵石
    "spirit_stone": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M32 8 L48 24 L40 52 L24 52 L16 24 Z" fill="#7ae0c8"/>
    <path d="M32 8 L32 52 M16 24 L48 24 M16 24 L32 38 L48 24" stroke="#48b8a0" stroke-width="2" fill="none"/>
    <circle cx="32" cy="32" r="14" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.6"/>
  </g>
</svg>""",

    # 紫金宝葫芦
    "spirit_gourd": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="22" r="9" fill="#e0a830"/>
    <circle cx="32" cy="40" r="15" fill="#e0a830"/>
    <rect x="28" y="8" width="8" height="6" rx="2" fill="#b07820"/>
    <path d="M26 29 H38" stroke="#c4473e" stroke-width="3"/>
  </g>
</svg>""",

    # 朱砂道符
    "talisman": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="18" y="8" width="28" height="48" rx="2" fill="#ffd27a"/>
    <path d="M24 18 H40 M32 18 V46 M26 30 L38 30 M28 38 L36 38" stroke="#c43a2e" stroke-width="2.5"/>
    <circle cx="32" cy="46" r="3" fill="#c43a2e" stroke="none"/>
  </g>
</svg>""",

    # ==================== 3. 大航海时代 (Age of Sail) ====================
    # 远洋船长
    "captain": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="22" r="9" fill="#efc59c"/>
    <path d="M12 16 L32 8 L52 16 L44 20 L20 20 Z" fill="#1f3346"/>
    <path d="M14 56 C14 38 22 34 32 34 C42 34 50 38 50 56 Z" fill="#1f3346"/>
    <line x1="28" y1="36" x2="28" y2="54" stroke="#f0d27a" stroke-width="2.5"/>
    <line x1="36" y1="36" x2="36" y2="54" stroke="#f0d27a" stroke-width="2.5"/>
  </g>
</svg>""",

    # 盖伦大帆船
    "galleon": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M8 44 C16 54 48 54 58 44 L54 36 H12 Z" fill="#8a5a34"/>
    <line x1="24" y1="36" x2="24" y2="12" stroke="#5a3a24" stroke-width="3"/>
    <line x1="42" y1="36" x2="42" y2="16" stroke="#5a3a24" stroke-width="3"/>
    <path d="M16 32 C18 20 28 20 30 32 Z" fill="#f6ecd8"/>
    <path d="M34 32 C36 22 46 22 48 32 Z" fill="#f6ecd8"/>
    <path d="M4 52 C16 48 32 54 60 50" stroke="#4f7a78" stroke-width="3" fill="none"/>
  </g>
</svg>""",

    # 航海罗盘
    "compass": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="34" r="22" fill="#d8b04a"/>
    <circle cx="32" cy="34" r="16" fill="#fffaf0"/>
    <polygon points="32,22 36,34 32,32 28,34" fill="#c4473e"/>
    <polygon points="32,46 36,34 32,36 28,34" fill="#3a2c20"/>
    <circle cx="32" cy="8" r="4" fill="none" stroke="#d8b04a" stroke-width="2.5"/>
  </g>
</svg>""",

    # 燧发手铳
    "flintlock": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="8" y="24" width="36" height="7" rx="2" fill="#8f8577"/>
    <path d="M26 31 C26 40 18 48 10 50 L8 44 C14 42 20 38 20 31 Z" fill="#8a5a34"/>
    <rect x="26" y="21" width="8" height="6" rx="1" fill="#d8b04a"/>
  </g>
</svg>""",

    # ==================== 4. 西方魔法时代 (High Fantasy Magic) ====================
    # 奥术法师
    "archmage": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="22" r="9" fill="#efc59c"/>
    <path d="M16 20 L32 6 L48 20 Z" fill="#4a3068"/>
    <path d="M14 56 C14 36 22 32 32 32 C42 32 50 36 50 56 Z" fill="#4a3068"/>
    <circle cx="52" cy="24" r="5" fill="#a070e0"/>
    <line x1="52" y1="29" x2="52" y2="58" stroke="#8a5a34" stroke-width="3"/>
  </g>
</svg>""",

    # 浮空法师塔
    "wizard_tower": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <path d="M20 54 L24 24 L40 24 L44 54 Z" fill="#7a6e80"/>
    <path d="M18 24 L32 8 L46 24 Z" fill="#4a3068"/>
    <circle cx="32" cy="6" r="4" fill="#a070e0"/>
    <rect x="29" y="32" width="6" height="8" rx="3" fill="#ffd27a"/>
  </g>
</svg>""",

    # 附魔魔典
    "spellbook": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <rect x="12" y="12" width="40" height="44" rx="4" fill="#5a2e38"/>
    <rect x="12" y="12" width="8" height="44" rx="2" fill="#3a1e24"/>
    <polygon points="32,26 35,34 43,34 37,39 39,47 32,42 25,47 27,39 21,34 29,34" fill="#ffd27a"/>
  </g>
</svg>""",

    # 魔力药剂
    "mana_potion": f"""<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g {ST}>
    <circle cx="32" cy="38" r="16" fill="#4a8ae0"/>
    <rect x="28" y="14" width="8" height="10" rx="1" fill="#c0d8f0"/>
    <rect x="26" y="10" width="12" height="5" rx="2" fill="#8a5a34"/>
    <ellipse cx="28" cy="34" rx="3" ry="5" fill="#fff" opacity="0.6"/>
  </g>
</svg>"""
}

def main():
    print(f"开始批量生成跨时代双轨卡牌资源 (共 {len(EPOCH_SVGS)} 项)...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 256, "height": 256})

        for name, svg in EPOCH_SVGS.items():
            svg_path = os.path.join(SVG_DIR, f"{name}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg)

            html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>body {{ margin:0; background:transparent; }} svg {{ width:256px; height:256px; }}</style></head><body>{svg}</body></html>"""
            page.set_content(html)
            png_path = os.path.join(ICONS_DIR, f"{name}.png")
            page.screenshot(path=png_path, omit_background=True)
            print(f"  [Epoch Icon] -> {name}.png")

        page.close()
        browser.close()
    print("全部跨时代双轨卡牌资产已装配完成！")

if __name__ == "__main__":
    main()
