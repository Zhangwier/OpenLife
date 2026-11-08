# -*- coding: utf-8 -*-
"""
Card World - Final 26 Missing Icons Remaster Script
Renders high-detail hand-drawn PNGs for all 26 remaining DEFS icons:
clams, clam, egg, roastFish, roastMeat, honey, hammer, boat, fence,
door, chest, barn, bighouse, cellar, compost, muck, scarecrow, plot,
peachTree, peach, jujubeTree, jujube, berry, fiber, hide, pelt.
"""

import os
from playwright.sync_api import sync_playwright

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(CURRENT_DIR, "art", "icons")
SVGS_DIR = os.path.join(CURRENT_DIR, "art", "svgs")
os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(SVGS_DIR, exist_ok=True)

STROKE = "#3a2c20"

SVG_DEFS = {
    # 1. clams: 浅滩沙洲中的贝类河蚌堆
    "clams": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cls_shallows" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#73c0cc"/>
          <stop offset="60%" stop-color="#4a9aa6"/>
          <stop offset="100%" stop-color="#2a6670"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="180" rx="98" ry="45" fill="url(#cls_shallows)" stroke="{STROKE}" stroke-width="5"/>
      <path d="M 40,195 Q 128,215 216,195" stroke="#bfe8f0" stroke-width="4" fill="none"/>
      <!-- 散落半埋在浅水沙石中的贝蚌 -->
      <path d="M 68,172 C 65,145 105,145 115,172 C 105,185 75,185 68,172 Z" fill="#b9a690" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 135,160 C 130,130 185,130 192,160 C 180,178 145,178 135,160 Z" fill="#cfc2b2" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 102,185 C 98,165 145,165 152,185 C 142,198 110,198 102,185 Z" fill="#9e8b74" stroke="{STROKE}" stroke-width="4"/>
      <!-- 水波与卵石 -->
      <ellipse cx="178" cy="190" rx="8" ry="5" fill="#756b5e" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="62" cy="190" rx="6" ry="4" fill="#756b5e" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 2. clam: 单个饱满的大河蚌/双壳贝
    "clam": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cm_shell" cx="50%" cy="80%" r="75%">
          <stop offset="0%" stop-color="#e8ded1"/>
          <stop offset="60%" stop-color="#b8a692"/>
          <stop offset="100%" stop-color="#6e5d4a"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="216" rx="80" ry="18" fill="#2d1c14" opacity="0.45"/>
      <path d="M 48,185 C 40,88 216,88 208,185 C 175,212 80,212 48,185 Z" fill="url(#cm_shell)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 放射状贝壳生长肋纹 -->
      <path d="M 128,198 L 72,112 M 128,198 L 98,95 M 128,198 L 128,88 M 128,198 L 158,95 M 128,198 L 184,112" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 68,145 Q 128,135 188,145" stroke="#fdfbf7" stroke-width="3" fill="none"/>
    </svg>''',

    # 3. egg: 莹润白净的禽蛋
    "egg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="eg_grad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="65%" stop-color="#faebd7"/>
          <stop offset="100%" stop-color="#d4c2a9"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="218" rx="65" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 128,35 C 75,35 60,135 60,175 C 60,215 196,215 196,175 C 196,135 181,35 128,35 Z" fill="url(#eg_grad)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="108" cy="115" rx="14" ry="32" transform="rotate(-15 108 115)" fill="#ffffff" opacity="0.85"/>
    </svg>''',

    # 4. roastFish: 木签串起的焦香金黄烤鱼
    "roastFish": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="rf_body" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#f5b867"/>
          <stop offset="60%" stop-color="#c9772c"/>
          <stop offset="100%" stop-color="#80410f"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="222" rx="85" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 穿鱼长木签 -->
      <line x1="32" y1="218" x2="224" y2="38" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="32" y1="218" x2="224" y2="38" stroke="#a8743e" stroke-width="5" stroke-linecap="round"/>
      <!-- 烤鱼鱼身 -->
      <path d="M 68,172 C 60,118 165,65 198,82 C 205,128 125,198 68,172 Z" fill="url(#rf_body)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 鱼尾 -->
      <polygon points="68,172 45,198 52,160" fill="#a8591d" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 焦痕黑横线与白汽 -->
      <line x1="102" y1="135" x2="125" y2="155" stroke="#3d1d06" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="135" y1="112" x2="158" y2="132" stroke="#3d1d06" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="162" y1="92" x2="178" y2="108" stroke="#3d1d06" stroke-width="4.5" stroke-linecap="round"/>
      <circle cx="185" cy="98" r="3" fill="{STROKE}"/>
      <!-- 滋滋热气 -->
      <path d="M 125,105 C 120,85 132,75 125,60" stroke="#f6ecd8" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    </svg>''',

    # 5. roastMeat: 串烤大肉块，焦脆多汁
    "roastMeat": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="rm_meat" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#df6d43"/>
          <stop offset="60%" stop-color="#a83918"/>
          <stop offset="100%" stop-color="#591907"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="222" rx="85" ry="16" fill="#2d1c14" opacity="0.45"/>
      <line x1="32" y1="218" x2="224" y2="38" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="32" y1="218" x2="224" y2="38" stroke="#a8743e" stroke-width="5" stroke-linecap="round"/>
      <!-- 烤肉块 1 -->
      <rect x="75" y="132" width="45" height="38" rx="8" transform="rotate(-45 97 151)" fill="url(#rm_meat)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 烤肉块 2 (大肉排) -->
      <rect x="125" y="82" width="55" height="46" rx="10" transform="rotate(-45 152 105)" fill="url(#rm_meat)" stroke="{STROKE}" stroke-width="6"/>
      <!-- 焦痕与油脂反光 -->
      <line x1="135" y1="92" x2="162" y2="118" stroke="#2e0a02" stroke-width="4" stroke-linecap="round"/>
      <circle cx="145" cy="100" r="3.5" fill="#ffd4a3"/>
    </svg>''',

    # 6. honey: 蜜罐与浓稠蜂蜜
    "honey": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="hn_pot" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#d99962"/>
          <stop offset="65%" stop-color="#a6632c"/>
          <stop offset="100%" stop-color="#693712"/>
        </radialGradient>
        <radialGradient id="hn_gold" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#fff073"/>
          <stop offset="70%" stop-color="#e6a817"/>
          <stop offset="100%" stop-color="#996a05"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="220" rx="75" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 陶蜜罐 -->
      <path d="M 68,110 L 60,195 C 60,218 196,218 196,195 L 188,110 Z" fill="url(#hn_pot)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="128" cy="110" rx="60" ry="18" fill="url(#hn_gold)" stroke="{STROKE}" stroke-width="5"/>
      <!-- 浓厚流溢在罐沿的金黄蜂蜜 -->
      <path d="M 105,115 C 105,155 125,155 125,115 Z" fill="url(#hn_gold)" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 7. hammer: 牢固麻绳绑扎的打制石锤
    "hammer": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="222" rx="80" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 木柄 -->
      <line x1="72" y1="215" x2="162" y2="65" stroke="{STROKE}" stroke-width="12" stroke-linecap="round"/>
      <line x1="72" y1="215" x2="162" y2="65" stroke="#8a5a34" stroke-width="7" stroke-linecap="round"/>
      <!-- 粗重横置石锤头 -->
      <polygon points="120,40 195,85 178,115 102,70" fill="#7a7063" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 交叉缠绕的加固麻绳 -->
      <line x1="128" y1="62" x2="152" y2="95" stroke="#eedbb2" stroke-width="5"/>
      <line x1="145" y1="65" x2="135" y2="92" stroke="#eedbb2" stroke-width="5"/>
      <line x1="128" y1="62" x2="152" y2="95" stroke="{STROKE}" stroke-width="1"/>
    </svg>''',

    # 8. boat: 独木轻舟/渡水木筏
    "boat": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="190" rx="95" ry="24" fill="#4d8b94" opacity="0.45"/>
      <path d="M 25,135 C 65,185 191,185 231,135 C 190,165 65,165 25,135 Z" fill="#8a5a34" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 25,135 C 75,150 181,150 231,135 C 181,125 75,125 25,135 Z" fill="#543317" stroke="{STROKE}" stroke-width="5"/>
      <line x1="75" y1="95" x2="181" y2="175" stroke="{STROKE}" stroke-width="5.5" stroke-linecap="round"/>
      <ellipse cx="70" cy="92" rx="10" ry="16" transform="rotate(-35 70 92)" fill="#a8743e" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 9. fence: 防兽原木篱笆/木栅栏
    "fence": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="88" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 横梁木条 (两条) -->
      <rect x="25" y="115" width="206" height="14" rx="3" fill="#80532c" stroke="{STROKE}" stroke-width="4.5"/>
      <rect x="25" y="165" width="206" height="14" rx="3" fill="#80532c" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 4 根削尖的竖立原木桩 -->
      <polygon points="52,65 64,45 76,65 76,220 52,220" fill="#a8743e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="98,65 110,45 122,65 122,220 98,220" fill="#a8743e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="144,65 156,45 168,65 168,220 144,220" fill="#a8743e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <polygon points="190,65 202,45 214,65 214,220 190,220" fill="#a8743e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
    </svg>''',

    # 10. door: 院落厚原木门
    "door": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="75" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 门框 -->
      <rect x="52" y="38" width="152" height="184" fill="#543317" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 门板 -->
      <rect x="68" y="52" width="120" height="170" fill="#9e693b" stroke="{STROKE}" stroke-width="5"/>
      <!-- 门板木纹与横木穿带 -->
      <rect x="68" y="85" width="120" height="16" fill="#69401e" stroke="{STROKE}" stroke-width="3.5"/>
      <rect x="68" y="165" width="120" height="16" fill="#69401e" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 门环 -->
      <circle cx="160" cy="135" r="9" fill="none" stroke="#f6d365" stroke-width="4"/>
      <circle cx="160" cy="126" r="3.5" fill="{STROKE}"/>
    </svg>''',

    # 11. chest: 原木大储物箱
    "chest": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="222" rx="85" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 箱身 -->
      <rect x="45" y="112" width="166" height="102" rx="6" fill="#945f32" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 拱形箱盖 -->
      <path d="M 40,115 C 40,75 216,75 216,115 Z" fill="#ba7f4a" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 加固青铜/铁皮包边 -->
      <line x1="82" y1="85" x2="82" y2="214" stroke="{STROKE}" stroke-width="5"/>
      <line x1="174" y1="85" x2="174" y2="214" stroke="{STROKE}" stroke-width="5"/>
      <rect x="116" y="105" width="24" height="28" rx="3" fill="#fcd34d" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 12. barn: 丰足大谷仓
    "barn": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 仓房主木体 -->
      <rect x="48" y="105" width="160" height="110" fill="#a67746" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 双开大仓门与十字斜撑 -->
      <rect x="92" y="132" width="72" height="83" fill="#69431f" stroke="{STROKE}" stroke-width="4.5"/>
      <line x1="92" y1="132" x2="164" y2="215" stroke="{STROKE}" stroke-width="3"/>
      <line x1="164" y1="132" x2="92" y2="215" stroke="{STROKE}" stroke-width="3"/>
      <!-- 人字厚茅草大顶 -->
      <polygon points="128,35 228,112 28,112" fill="#e8ba58" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
    </svg>''',

    # 13. bighouse: 聚落宽敞大族屋
    "bighouse": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="95" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 厚实矮土石墙基 -->
      <rect x="38" y="115" width="180" height="102" fill="#dfcfb2" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <rect x="112" y="148" width="32" height="69" fill="#543317" stroke="{STROKE}" stroke-width="4.5"/>
      <rect x="58" y="140" width="28" height="28" fill="#543317" stroke="{STROKE}" stroke-width="3.5"/>
      <rect x="170" y="140" width="28" height="28" fill="#543317" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 宏大厚重双坡茅草顶 -->
      <polygon points="128,30 238,122 18,122" fill="#d99f43" stroke="{STROKE}" stroke-width="6.5" stroke-linejoin="round"/>
    </svg>''',

    # 14. cellar: 避光储藏地窖
    "cellar": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="180" rx="90" ry="40" fill="#543821" stroke="{STROKE}" stroke-width="6"/>
      <ellipse cx="128" cy="180" rx="72" ry="28" fill="#1f1207"/>
      <!-- 掀开的厚木地窖门 -->
      <polygon points="75,175 145,95 195,125 125,195" fill="#8f5b2f" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
    </svg>''',

    # 15. compost: 肥沃腐殖堆肥堆
    "compost": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="216" rx="85" ry="20" fill="#2d1c14" opacity="0.45"/>
      <path d="M 45,210 C 40,140 216,140 211,210 Z" fill="#59432e" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 85,165 Q 105,145 125,160 Q 145,145 165,165" stroke="#728c40" stroke-width="5" fill="none"/>
    </svg>''',

    # 16. muck: 农家肥
    "muck": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="218" rx="80" ry="18" fill="#2d1c14" opacity="0.45"/>
      <path d="M 52,212 C 48,155 208,155 204,212 Z" fill="#4d3725" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 75,180 Q 128,155 181,180" stroke="#758f40" stroke-width="4" fill="none"/>
    </svg>''',

    # 17. scarecrow: 田间稻草人
    "scarecrow": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="60" ry="14" fill="#2d1c14" opacity="0.45"/>
      <line x1="128" y1="225" x2="128" y2="60" stroke="{STROKE}" stroke-width="8" stroke-linecap="round"/>
      <line x1="45" y1="110" x2="211" y2="110" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <!-- 茅草头与破斗笠 -->
      <circle cx="128" cy="62" r="22" fill="#fae196" stroke="{STROKE}" stroke-width="4.5"/>
      <polygon points="128,30 168,58 88,58" fill="#ba8043" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 破旧麻布衣衫 -->
      <polygon points="102,105 154,105 165,185 91,185" fill="#587e91" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
    </svg>''',

    # 18. plot: 夯土地基放线桩
    "plot": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <polygon points="35,190 70,85 186,85 221,190" fill="#ba9f79" opacity="0.3" stroke="{STROKE}" stroke-width="4" stroke-dasharray="8 6"/>
      <!-- 四角立木桩与系绳 -->
      <rect x="66" y="70" width="10" height="28" fill="#754a24" stroke="{STROKE}" stroke-width="3"/>
      <rect x="180" y="70" width="10" height="28" fill="#754a24" stroke="{STROKE}" stroke-width="3"/>
      <rect x="30" y="175" width="12" height="34" fill="#754a24" stroke="{STROKE}" stroke-width="3.5"/>
      <rect x="214" y="175" width="12" height="34" fill="#754a24" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 19. peachTree: 盛花结果的粉嫩桃树
    "peachTree": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="80" ry="18" fill="#2d1c14" opacity="0.45"/>
      <path d="M 115,140 L 110,224 L 146,224 L 141,140 Z" fill="#694321" stroke="{STROKE}" stroke-width="5.5"/>
      <circle cx="128" cy="100" r="68" fill="#65943b" stroke="{STROKE}" stroke-width="6"/>
      <!-- 枝头粉桃 -->
      <circle cx="102" cy="85" r="12" fill="#ff9494" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="152" cy="95" r="14" fill="#ff9494" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="122" cy="130" r="13" fill="#ff9494" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 20. peach: 熟透红晕水蜜桃
    "peach": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="pc_grad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffb8b8"/>
          <stop offset="60%" stop-color="#ff6969"/>
          <stop offset="100%" stop-color="#c92a2a"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="216" rx="70" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 128,65 C 65,65 52,140 52,175 C 52,215 128,218 128,218 C 128,218 204,215 204,175 C 204,140 191,65 128,65 Z" fill="url(#pc_grad)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 128,65 Q 120,135 128,215" stroke="#a31818" stroke-width="3.5" fill="none"/>
      <!-- 青翠桃叶 -->
      <path d="M 128,65 C 145,35 178,35 190,45 C 180,65 155,68 128,65 Z" fill="#699e38" stroke="{STROKE}" stroke-width="4"/>
    </svg>''',

    # 21. jujubeTree: 挂满红玛瑙鲜枣的枣树
    "jujubeTree": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="225" rx="80" ry="18" fill="#2d1c14" opacity="0.45"/>
      <path d="M 115,140 L 110,224 L 146,224 L 141,140 Z" fill="#694321" stroke="{STROKE}" stroke-width="5.5"/>
      <circle cx="128" cy="100" r="66" fill="#5b8235" stroke="{STROKE}" stroke-width="6"/>
      <!-- 枝头小红枣 -->
      <ellipse cx="98" cy="90" rx="8" ry="11" fill="#b82a21" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="145" cy="85" rx="8" ry="11" fill="#b82a21" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="120" cy="125" rx="8" ry="11" fill="#b82a21" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="160" cy="120" rx="8" ry="11" fill="#b82a21" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 22. jujube: 鲜亮饱满的一捧红枣
    "jujube": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="jj_grad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#e84a3f"/>
          <stop offset="65%" stop-color="#ad1f15"/>
          <stop offset="100%" stop-color="#590c06"/>
        </radialGradient>
      </defs>
      <ellipse cx="128" cy="216" rx="75" ry="16" fill="#2d1c14" opacity="0.45"/>
      <ellipse cx="95" cy="155" rx="26" ry="36" transform="rotate(-15 95 155)" fill="url(#jj_grad)" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="155" cy="155" rx="26" ry="36" transform="rotate(15 155 155)" fill="url(#jj_grad)" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="128" cy="170" rx="24" ry="34" fill="url(#jj_grad)" stroke="{STROKE}" stroke-width="5"/>
      <circle cx="90" cy="142" r="5" fill="#ffffff" opacity="0.75"/>
    </svg>''',

    # 23. berry: 单个鲜果/浆果
    "berry": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="216" rx="65" ry="16" fill="#2d1c14" opacity="0.45"/>
      <circle cx="128" cy="145" r="55" fill="#d93b3b" stroke="{STROKE}" stroke-width="6"/>
      <circle cx="112" cy="125" r="14" fill="#ffffff" opacity="0.75"/>
      <path d="M 128,90 L 128,52 M 128,70 Q 155,55 162,68" stroke="#4a7a28" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>''',

    # 24. fiber: 剥洗好的葛麻韧皮纤维束
    "fiber": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="218" rx="80" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 52,185 C 95,65 161,65 204,185" fill="none" stroke="#d6c39a" stroke-width="16" stroke-linecap="round"/>
      <path d="M 52,185 C 95,65 161,65 204,185" fill="none" stroke="{STROKE}" stroke-width="4" stroke-dasharray="6 8"/>
    </svg>''',

    # 25. hide: 鞣制浅褐小兽皮
    "hide": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="218" rx="80" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 52,75 L 85,62 L 128,75 L 171,62 L 204,75 L 190,135 L 210,195 L 155,185 L 128,198 L 101,185 L 46,195 L 66,135 Z" fill="#c4945a" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
    </svg>''',

    # 26. pelt: 斑斓猛兽厚毛皮
    "pelt": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <ellipse cx="128" cy="218" rx="85" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 45,65 L 85,52 L 128,68 L 171,52 L 211,65 L 195,135 L 218,202 L 155,188 L 128,205 L 101,188 L 38,202 L 61,135 Z" fill="#d98938" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 虎豹斑纹条 -->
      <line x1="88" y1="95" x2="115" y2="105" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="168" y1="95" x2="141" y2="105" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="92" y1="145" x2="122" y2="152" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="164" y1="145" x2="134" y2="152" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
    </svg>'''
}

def main():
    print(f"开始渲染最终批次卡牌图标 (共 {len(SVG_DEFS)} 款)...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 256, "height": 256})
        
        for key, svg_code in SVG_DEFS.items():
            svg_path = os.path.join(SVGS_DIR, f"{key}.svg")
            png_path = os.path.join(ICONS_DIR, f"{key}.png")
            
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg_code.strip())
            
            html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background: transparent; width: 256px; height: 256px; overflow: hidden; }}
    svg {{ display: block; width: 256px; height: 256px; }}
  </style>
</head>
<body>
  {svg_code.strip()}
</body>
</html>"""
            page.set_content(html_content)
            page.screenshot(path=png_path, omit_background=True)
            print(f"  [Remastered] -> {key}.png")
            
        browser.close()
    print("最终批次 26 款全部渲染完毕！")

if __name__ == "__main__":
    main()
