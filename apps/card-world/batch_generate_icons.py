import concurrent.futures
import json
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

sys.path.insert(0, r"D:\MG\program\hark2api")
os.environ["HARK_PROXY"] = "http://127.0.0.1:7890"
from hark_pool_api import Account

ICONS_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\icons"
SVG_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\svgs"
os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(SVG_DIR, exist_ok=True)

# Curated high-priority targets and their prompts
TARGETS = {
    "knife": (
        "新石器时代燧石小刀（knife）。"
        "结构：深灰带贝壳断口的黑色燧石尖刃 #4a4a52，绑紧粗短木柄 #8a5a34，缠绕麻绳固定 #d8c8a0。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "hoe": (
        "新石器时代石锄（hoe）。"
        "结构：长曲形木柄 #8a5a34，顶端横向绑着打磨规整的平刃石锄头 #8f8577，麻绳交叉紧扣 #d8c8a0。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "spear": (
        "新石器时代石矛（spear）。"
        "结构：笔挺长木矛杆 #8a5a34，矛头绑着锋利狭长的大燧石矛尖 #4a4a52，交叉麻绳绑扣 #d8c8a0。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "torch": (
        "新石器时代原始火把（torch）。"
        "结构：粗木棒 #8a5a34，头部缠绕浸油麻布草束 #d8c8a0，顶部燃烧着橘红与明黄的温暖跳动火焰 #f0a24a #ffd27a。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "net": (
        "新石器时代捕鱼网（net）。"
        "结构：交织的麻绳网眼绳格 #a88a52，边缘收口，角上挂着小陶坠石坠 #8f8577。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "fire": (
        "原始村落火塘（fire）。"
        "结构：一圈灰白色椭圆石头围成火塘 #8d897c，内部跳跃着温暖的双色明火 #f0a24a #ffd27a，底部少许炭木 #5a3a24。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "stove": (
        "新石器时代公用陶灶台（stove）。"
        "结构：土石垒砌的圆肚矮灶 #a8907a，拱形灶口跳动火光 #f0a24a，灶台上架着一只受热冒汽的红褐陶釜 #b5653e。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "grain": (
        "新石器农耕粟穗（grain）。"
        "结构：三束金黄饱满的成熟谷穗下垂 #e0c050，纤细绿色秸秆 #7a8a44，中间用麻绳扎束 #a8843a。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "fish": (
        "新石器淡水河鱼（fish）。"
        "结构：体型圆润的游鱼，青灰鱼身 #9fb4b0，背鳍与尾鳍 #7f9894，黑圆眼点 #3a2c20，鱼鳞简练弧线。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "meat": (
        "原始兽肉块（meat）。"
        "结构：新鲜红褐色肉块 #b5653e，带少许浅色油脂与白色截骨 #e8d6b0，质感鲜美结实。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "dog": (
        "新石器村落小土狗阿黄（dog）。"
        "结构：土黄色中华田园犬 #c98a4a，圆脑门耷拉耳，小巧黑鼻小黑眼 #3a2c20，短短卷翘小尾巴，呆萌可爱。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
    "house": (
        "新石器半地穴式茅草主屋（house）。"
        "结构：圆锥形厚草顶 #c9a96a，木梁屋檐 #8a6a3e，浅土夯墙 #e8d6b0，深褐木框草帘门 #6b4a2f。"
        "深褐粗描边 #3a2c20，stroke-width=2.5。"
    ),
}

# High-quality fallback SVG code ensuring guaranteed output even if network jitters
FALLBACKS = {
    "knife": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M12 52 L22 42 L28 48 L18 58 Z" fill="#8a5a34"/><path d="M22 42 L52 14 C56 20 54 30 44 40 L34 46 Z" fill="#4a4a52"/><path d="M26 40 L44 22" stroke="#6e6e7a" stroke-width="2" fill="none"/><path d="M16 48 L20 44 M18 52 L22 48" stroke="#d8c8a0" stroke-width="2.5"/></g></svg>""",
    "hoe": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M18 58 L42 16" stroke="#8a5a34" stroke-width="6" fill="none"/><path d="M30 26 L48 18 C52 24 48 30 38 34 Z" fill="#8f8577"/><path d="M34 22 L40 28" stroke="#d8c8a0" stroke-width="3"/></g></svg>""",
    "spear": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M12 56 L46 18" stroke="#8a5a34" stroke-width="5" fill="none"/><path d="M42 12 L56 14 L50 28 Z" fill="#4a4a52"/><path d="M42 18 L48 24 M40 22 L46 28" stroke="#d8c8a0" stroke-width="2.5"/></g></svg>""",
    "torch": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M29 60 L33 30 L37 30 L33 60 Z" fill="#8a5a34"/><rect x="27" y="28" width="12" height="8" rx="2" fill="#d8c8a0"/><path d="M26 28 C22 18 28 12 33 6 C38 12 44 18 40 28 Z" fill="#f0a24a"/><path d="M30 26 C28 20 31 16 33 11 C35 16 38 20 36 26 Z" fill="#ffd27a"/></g></svg>""",
    "net": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8 16 H56 L46 54 H18 Z" fill="none" stroke="#a88a52"/><path d="M10 24 H54 M13 34 H51 M16 44 H48" stroke="#a88a52" stroke-width="2"/><path d="M20 16 L18 54 M32 16 L32 54 M44 16 L46 54" stroke="#a88a52" stroke-width="2"/><circle cx="10" cy="16" r="3.5" fill="#8f8577"/><circle cx="54" cy="16" r="3.5" fill="#8f8577"/></g></svg>""",
    "fire": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="18" cy="50" rx="7" ry="5" fill="#8d897c"/><ellipse cx="32" cy="53" rx="8" ry="5" fill="#8d897c"/><ellipse cx="46" cy="50" rx="7" ry="5" fill="#8d897c"/><path d="M20 46 C18 30 28 26 32 12 C36 24 46 30 44 46 Z" fill="#f0a24a"/><path d="M26 46 C24 36 30 32 32 24 C34 32 40 36 38 46 Z" fill="#ffd27a"/></g></svg>""",
    "stove": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M10 56 V30 H54 V56 Z" fill="#a8907a"/><path d="M20 56 V42 C20 34 44 34 44 42 V56 Z" fill="#3a2418"/><path d="M26 52 C27 46 31 42 32 38 C34 42 37 46 38 52 Z" fill="#f0a24a"/><path d="M18 30 C18 20 46 20 46 30 Z" fill="#b5653e"/><path d="M26 18 Q30 12 28 8 M36 18 Q40 12 38 8" fill="none" stroke="#cfc6b4" stroke-width="2.5"/></g></svg>""",
    "grain": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M22 56 V32 M32 56 V26 M42 56 V32" stroke="#7a8a44" stroke-width="3"/><ellipse cx="22" cy="24" rx="5" ry="9" fill="#e0c050"/><ellipse cx="32" cy="18" rx="5" ry="9" fill="#e0c050"/><ellipse cx="42" cy="24" rx="5" ry="9" fill="#e0c050"/><path d="M16 46 H48" stroke="#a8843a" stroke-width="5"/></g></svg>""",
    "fish": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8 32 C18 18 38 18 48 32 C38 46 18 46 8 32 Z" fill="#9fb4b0"/><path d="M48 32 L58 22 V42 Z" fill="#7f9894"/><path d="M28 22 L34 26" fill="none" stroke="#7f9894" stroke-width="2"/><circle cx="18" cy="30" r="2.5" fill="#3a2c20"/></g></svg>""",
    "meat": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M18 46 C12 40 14 26 24 22 C34 18 44 24 46 34 L52 44 L44 50 L32 46 Z" fill="#b5653e"/><path d="M48 16 L54 22 L48 26 L42 20 Z" fill="#e8d6b0"/><circle cx="48" cy="21" r="2.5" fill="#b5653e"/></g></svg>""",
    "dog": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M12 40 C12 32 20 28 30 28 H42 L50 22 V36 C50 44 44 48 36 48 H18 C14 48 12 44 12 40 Z" fill="#c98a4a"/><path d="M16 48 V56 M24 49 V56 M40 48 V56 M48 46 V54" stroke="#3a2c20" stroke-width="3"/><path d="M12 38 C8 34 6 38 8 42" stroke="#c98a4a" stroke-width="4" fill="none"/><circle cx="44" cy="30" r="2" fill="#3a2c20"/></g></svg>""",
    "house": """<svg viewBox="0 0 64 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#3a2c20" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M6 34 L32 8 L58 34" fill="#c9a96a"/><path d="M4 36 L32 6 L60 36" stroke="#8a6a3e" stroke-width="5" fill="none"/><path d="M12 34 V56 H52 V34" fill="#e8d6b0"/><path d="M26 56 V40 H38 V56 Z" fill="#6b4a2f"/></g></svg>""",
}


def clean_svg(raw_text: str) -> str:
    m = re.search(r"<svg[\s\S]*?</svg>", raw_text, re.IGNORECASE)
    if m:
        svg = m.group(0)
        if 'xmlns="http://www.w3.org/2000/svg"' not in svg:
            svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        return svg
    return ""


def fetch_svg_for_item(name: str, desc: str, acc_dict: dict) -> str:
    try:
        ac = Account(acc_dict)
        prompt = (
            f"请为卡牌游戏生成一个【{name}】的 64x64 SVG 矢量图标。\n"
            f"细节要求：{desc}\n"
            "严格只输出完整的 <svg viewBox='0 0 64 64' aria-hidden='true'>...</svg> 代码块，严禁输出任何其它文字。"
        )
        t0 = time.time()
        resp = ac.ask(prompt, timeout=30)
        svg = clean_svg(resp)
        if svg and len(svg) > 80:
            print(f"[{name}] Hark 生成成功 ({round(time.time() - t0, 1)}s)")
            return svg
    except Exception as e:
        print(f"[{name}] Hark 异常 ({e})，启用精修后备模版")
    return FALLBACKS.get(name, "")


def main():
    accs_file = r"D:\MG\secrets\hark\accounts_all.json"
    accs = json.load(open(accs_file, encoding="utf-8"))
    valid_accs = [a for a in accs if a.get("ok") and a.get("cookie")]
    print(f"准备开始批量产出 {len(TARGETS)} 个关键卡牌图标...")

    # Step 1: Obtain SVG code (concurrent Hark calls with fallback)
    svg_map = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}
        for idx, (name, desc) in enumerate(TARGETS.items()):
            acc = valid_accs[idx % len(valid_accs)]
            futures[executor.submit(fetch_svg_for_item, name, desc, acc)] = name

        for fut in concurrent.futures.as_completed(futures):
            name = futures[fut]
            svg = fut.result()
            if not svg:
                svg = FALLBACKS[name]
            svg_map[name] = svg
            # save svg
            svg_path = os.path.join(SVG_DIR, f"{name}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg)

    # Step 2: Render all SVGs to 256x256 transparent PNGs using Edge channel
    print("开始通过无头 Edge 渲染 256×256 透明底 PNG...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 256, "height": 256})

        for name, svg in svg_map.items():
            html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ margin: 0; padding: 0; background: transparent; overflow: hidden; }}
  svg {{ width: 256px; height: 256px; }}
</style>
</head>
<body>
{svg}
</body>
</html>"""
            page.set_content(html)
            png_path = os.path.join(ICONS_DIR, f"{name}.png")
            page.screenshot(path=png_path, omit_background=True)
            print(f"  -> 生成完成: {name}.png ({png_path})")

        browser.close()

    print(f"全部 {len(TARGETS)} 个图标已全部成功装配至 {ICONS_DIR}！")


if __name__ == "__main__":
    main()
