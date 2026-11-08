# -*- coding: utf-8 -*-
"""
Generate 11 missing icons and 7 deco assets for Card World.
Strictly follows ART_BRIEF.md:
- Neolithic riverside settlement (5000-3000 BC)
- Flat illustration + slight volume, dark brown outline #3a2c20 (4-6px)
- Light from top-left, subject centered (~80%), 8% margin
- Low-saturation earthy palette
- Transparent background PNG 256x256
- Deco: top-down view (pure canopy for trees, no trunk), paler than cards.
"""

import os
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(BASE_DIR, "art", "icons")
DECO_DIR = os.path.join(BASE_DIR, "art", "deco")
SVGS_DIR = os.path.join(BASE_DIR, "art", "svgs")

os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(DECO_DIR, exist_ok=True)
os.makedirs(SVGS_DIR, exist_ok=True)

STROKE = "#3a2c20"
DECO_STROKE = "#4a3a2e"

MISSING_ICONS_SVG = {
    # 1. greenware: 陶坯：没烧过的灰白色泥坯（大肚双耳陶罐坯，表面保留手工泥条拍打纹理）
    "greenware": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="gw_body" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ede7db"/>
          <stop offset="45%" stop-color="#cfc4b2"/>
          <stop offset="80%" stop-color="#ab9f8c"/>
          <stop offset="100%" stop-color="#7e7260"/>
        </radialGradient>
        <linearGradient id="gw_rim" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#e8e1d2"/>
          <stop offset="100%" stop-color="#a89b87"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="76" ry="18" fill="#2d1c14" opacity="0.4"/>
      <!-- 双耳 -->
      <path d="M 68,110 C 46,110 46,145 70,150" fill="none" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 188,110 C 210,110 210,145 186,150" fill="none" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 68,110 C 49,110 49,145 70,150" fill="none" stroke="#cfc4b2" stroke-width="3" stroke-linecap="round"/>
      <path d="M 188,110 C 207,110 207,145 186,150" fill="none" stroke="#cfc4b2" stroke-width="3" stroke-linecap="round"/>
      <!-- 大肚陶坯主体 -->
      <path d="M 88,58 L 168,58 C 172,82 206,115 204,158 C 202,196 168,212 128,212 C 88,212 54,196 52,158 C 50,115 84,82 88,58 Z" fill="url(#gw_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 口沿 -->
      <ellipse cx="128" cy="58" rx="42" ry="14" fill="url(#gw_rim)" stroke="{STROKE}" stroke-width="5.5"/>
      <ellipse cx="128" cy="58" rx="30" ry="8" fill="#6e6252" stroke="{STROKE}" stroke-width="3"/>
      <!-- 陶坯表面手工拍打纹与泥条圈痕迹 -->
      <path d="M 80,125 Q 128,142 176,125" fill="none" stroke="#b5a794" stroke-width="3" stroke-dasharray="6 4" opacity="0.8"/>
      <path d="M 72,152 Q 128,172 184,152" fill="none" stroke="#9a8c79" stroke-width="3" stroke-dasharray="6 4" opacity="0.85"/>
      <path d="M 85,178 Q 128,194 171,178" fill="none" stroke="#7e7260" stroke-width="2.5" opacity="0.7"/>
      <!-- 左上受光高光 -->
      <path d="M 96,95 Q 120,90 142,96" fill="none" stroke="#f7f3ec" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
      <!-- 散落的一两点生泥屑 -->
      <circle cx="56" cy="214" r="5" fill="#ab9f8c" stroke="{STROKE}" stroke-width="2.5"/>
      <circle cx="198" cy="210" r="4.5" fill="#ab9f8c" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 2. crackedJar: 裂了的储粮罐：大肚深红陶罐，一道明显裂缝
    "crackedJar": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cj_body" cx="36%" cy="32%" r="68%">
          <stop offset="0%" stop-color="#d67850"/>
          <stop offset="50%" stop-color="#b5653e"/>
          <stop offset="85%" stop-color="#833e20"/>
          <stop offset="100%" stop-color="#54220f"/>
        </radialGradient>
        <linearGradient id="cj_rim" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#d67850"/>
          <stop offset="100%" stop-color="#833e20"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="218" rx="82" ry="18" fill="#2d1c14" opacity="0.42"/>
      <!-- 大肚陶罐主体 -->
      <path d="M 86,54 L 170,54 C 176,80 212,112 210,158 C 207,198 172,214 128,214 C 84,214 49,198 46,158 C 44,112 80,80 86,54 Z" fill="url(#cj_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 罐口沿 -->
      <ellipse cx="128" cy="54" rx="44" ry="15" fill="url(#cj_rim)" stroke="{STROKE}" stroke-width="5.5"/>
      <ellipse cx="128" cy="54" rx="32" ry="9" fill="#3a1b0d" stroke="{STROKE}" stroke-width="3"/>
      <!-- 新石器经典绳纹刻划带 -->
      <path d="M 76,112 Q 128,128 180,112" fill="none" stroke="#df8d68" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 明显裂缝：从口沿向腹下蔓延贯穿折裂 -->
      <path d="M 112,56 L 106,78 L 122,108 L 110,138 L 128,168 L 118,206" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- 裂口错位与暗影 -->
      <path d="M 110,106 L 122,108 L 115,118" fill="none" stroke="#2a1208" stroke-width="2"/>
      <path d="M 126,166 L 128,168 L 134,175" fill="none" stroke="#2a1208" stroke-width="2"/>
      <!-- 裂缝微弱亮边崩口 -->
      <path d="M 114,58 L 108,78 L 124,107" fill="none" stroke="#f0a582" stroke-width="2" opacity="0.75"/>
      <!-- 漏落的几粒粟米 -->
      <ellipse cx="120" cy="216" rx="4" ry="3" fill="#e8c040" stroke="{STROKE}" stroke-width="1.8"/>
      <ellipse cx="132" cy="218" rx="4.5" ry="3" fill="#e8c040" stroke="{STROKE}" stroke-width="1.8"/>
      <ellipse cx="142" cy="214" rx="3.5" ry="2.5" fill="#e8c040" stroke="{STROKE}" stroke-width="1.8"/>
      <!-- 左上高光 -->
      <path d="M 78,135 C 72,155 76,175 88,185" fill="none" stroke="#f0a582" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
    </svg>''',

    # 3. road: 夯土碎石小路（两旁草甸，向远方延伸的黄土聚落小径）
    "road": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="rd_earth" x1="30%" y1="10%" x2="70%" y2="90%">
          <stop offset="0%" stop-color="#cca06e"/>
          <stop offset="50%" stop-color="#b87e4c"/>
          <stop offset="100%" stop-color="#8f572c"/>
        </linearGradient>
      </defs>
      <!-- 阴影底衬 -->
      <ellipse cx="128" cy="216" rx="94" ry="22" fill="#2d1c14" opacity="0.4"/>
      <!-- 主路面块体：蜿蜒穿行的黄土大径 -->
      <path d="M 108,36 C 114,65 72,110 52,156 C 40,184 48,212 90,214 C 150,216 216,192 214,152 C 212,115 168,75 146,36 Z" fill="url(#rd_earth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 两侧低缓草甸地被 -->
      <path d="M 44,162 C 34,188 48,210 82,212 C 60,195 55,178 44,162 Z" fill="#7a9a5a" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 216,140 C 224,175 198,198 170,208 C 196,195 210,165 216,140 Z" fill="#7a9a5a" stroke="{STROKE}" stroke-width="4"/>
      <!-- 踩踏磨平的中心路面与车辙/足迹浅槽 -->
      <path d="M 124,46 C 130,80 92,125 76,168 C 88,185 130,192 165,182 C 185,152 152,98 135,46 Z" fill="#d9b685" opacity="0.6"/>
      <!-- 嵌在土路上的打制/河滩垫脚石 -->
      <path d="M 118,72 C 128,70 134,78 126,84 C 118,88 112,80 118,72 Z" fill="#9e9484" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 96,112 C 112,110 118,122 108,128 C 96,134 88,124 96,112 Z" fill="#b5ab9a" stroke="{STROKE}" stroke-width="3.5"/>
      <path d="M 132,130 C 146,128 152,140 142,148 C 130,154 122,142 132,130 Z" fill="#8c8273" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 105,166 C 125,162 135,178 122,188 C 108,195 96,180 105,166 Z" fill="#b5ab9a" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 152,168 C 166,165 174,176 165,184 C 154,190 144,180 152,168 Z" fill="#9e9484" stroke="{STROKE}" stroke-width="3"/>
      <!-- 路边点缀的小草丛 -->
      <path d="M 58,145 L 52,135 M 58,145 L 60,132 M 58,145 L 66,136" stroke="{STROKE}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 198,128 L 194,118 M 198,128 L 204,116 M 198,128 L 206,122" stroke="{STROKE}" stroke-width="2.5" stroke-linecap="round"/>
    </svg>''',

    # 4. water: 澄澈水滴/水花涟漪（水绿色系，柔润饱满）
    "water": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="wt_grad" cx="35%" cy="32%" r="68%">
          <stop offset="0%" stop-color="#bce8e2"/>
          <stop offset="45%" stop-color="#6f9a92"/>
          <stop offset="85%" stop-color="#437069"/>
          <stop offset="100%" stop-color="#284e49"/>
        </radialGradient>
      </defs>
      <!-- 阴影与底层水波圈 -->
      <ellipse cx="128" cy="216" rx="88" ry="18" fill="#2d1c14" opacity="0.32"/>
      <ellipse cx="128" cy="198" rx="78" ry="24" fill="#5a8b83" stroke="{STROKE}" stroke-width="4.5" opacity="0.7"/>
      <ellipse cx="128" cy="198" rx="58" ry="16" fill="#81aba3" stroke="{STROKE}" stroke-width="3" opacity="0.6"/>
      <!-- 主大水滴 -->
      <path d="M 128,32 C 128,32 62,122 62,164 C 62,204 92,224 128,224 C 164,224 194,204 194,164 C 194,122 128,32 128,32 Z" fill="url(#wt_grad)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 左上清透水光大高光 -->
      <path d="M 102,88 C 84,124 82,158 92,185 C 84,170 82,142 96,105 C 104,85 116,65 120,58 C 115,68 108,78 102,88 Z" fill="#eafaf8" opacity="0.85"/>
      <circle cx="112" cy="98" r="6" fill="#ffffff" opacity="0.95"/>
      <circle cx="138" cy="195" r="4" fill="#ffffff" opacity="0.7"/>
      <!-- 飞溅灵动的小水珠 -->
      <ellipse cx="64" cy="116" rx="9" ry="12" fill="url(#wt_grad)" stroke="{STROKE}" stroke-width="3.5"/>
      <circle cx="62" cy="113" r="3" fill="#ffffff" opacity="0.9"/>
      <circle cx="198" cy="136" r="8" fill="url(#wt_grad)" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="196" cy="134" r="2.5" fill="#ffffff" opacity="0.9"/>
    </svg>''',

    # 5. pineSnow: 覆雪松树（常青墨绿松针与厚实积雪）
    "pineSnow": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="ps_snow" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="60%" stop-color="#e2eef0"/>
          <stop offset="100%" stop-color="#b0c8cc"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="84" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 粗壮木质树干 -->
      <path d="M 115,175 L 141,175 L 146,220 L 110,220 Z" fill="#684a2e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 124,185 L 126,215 M 134,182 L 136,212" stroke="#4a321e" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 第三层松冠（最下层） -->
      <path d="M 46,182 L 128,118 L 210,182 L 175,185 L 195,198 L 128,198 L 61,198 L 81,185 Z" fill="#2d4a2a" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 56,180 Q 92,168 128,170 Q 164,168 200,180 C 185,194 155,192 128,194 C 101,192 71,194 56,180 Z" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 第二层松冠（中层） -->
      <path d="M 64,136 L 128,78 L 192,136 L 165,138 L 180,148 L 128,148 L 76,148 L 91,138 Z" fill="#365932" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 72,134 Q 100,122 128,124 Q 156,122 184,134 C 172,145 148,144 128,145 C 108,144 84,145 72,134 Z" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 第一层松冠（顶层尖冠） -->
      <path d="M 85,88 L 128,32 L 171,88 L 148,90 L 160,98 L 128,98 L 96,98 L 108,90 Z" fill="#446e3e" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 128,34 L 112,70 Q 128,66 144,70 Z" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M 94,88 Q 111,80 128,82 Q 145,80 162,88 C 150,96 138,95 128,96 C 118,95 106,96 94,88 Z" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 树下两小撮雪团 -->
      <ellipse cx="92" cy="220" rx="14" ry="6" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="164" cy="222" rx="12" ry="5" fill="url(#ps_snow)" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 6. winterTree: 冬日枯树（沧桑有力枝干，枝梢带薄雪）
    "winterTree": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <!-- 阴影与冻土地面 -->
      <ellipse cx="128" cy="220" rx="86" ry="16" fill="#2d1c14" opacity="0.45"/>
      <path d="M 68,222 Q 128,212 188,222" stroke="#b0c4c4" stroke-width="4" fill="none" stroke-linecap="round"/>
      <!-- 树根部抓地 -->
      <path d="M 102,220 C 110,205 118,185 118,170 L 138,170 C 138,185 146,205 154,220 Z" fill="#6a4c33" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 苍劲主干与大分枝 -->
      <path d="M 118,170 C 116,140 120,118 114,92 C 108,68 86,52 64,42 C 78,54 84,68 82,82 C 92,85 100,105 106,128 Z" fill="#6a4c33" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 138,170 C 140,140 136,118 142,92 C 148,68 170,52 192,42 C 178,54 172,68 174,82 C 164,85 156,105 150,128 Z" fill="#6a4c33" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 中央直上枝桠 -->
      <path d="M 122,120 L 126,50 L 118,30 L 124,32 L 132,52 L 130,120 Z" fill="#78563a" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 侧向小枯枝 -->
      <path d="M 92,102 L 62,88 L 52,70 M 62,88 L 54,98" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 164,102 L 194,88 L 204,70 M 194,88 L 202,98" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 126,75 L 146,62 L 155,50" fill="none" stroke="{STROKE}" stroke-width="4" stroke-linecap="round"/>
      <path d="M 124,85 L 106,72 L 98,62" fill="none" stroke="{STROKE}" stroke-width="4" stroke-linecap="round"/>
      <!-- 枝杈处所落薄霜残雪 -->
      <path d="M 112,94 Q 128,88 144,94" stroke="#e6f2f4" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M 74,78 Q 84,74 94,80" stroke="#e6f2f4" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 162,80 Q 172,74 182,78" stroke="#e6f2f4" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 118,48 L 128,45" stroke="#e6f2f4" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>''',

    # 7. autumnChestnut: 秋天栗子树（暖橙金红秋叶树冠，饱满炸开的带刺板栗）
    "autumnChestnut": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ac_canopy" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stop-color="#e89d48"/>
          <stop offset="50%" stop-color="#c47429"/>
          <stop offset="85%" stop-color="#944813"/>
          <stop offset="100%" stop-color="#612a08"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="84" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 树干 -->
      <path d="M 114,165 L 142,165 L 148,220 L 108,220 Z" fill="#6d4726" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 124,175 L 126,212 M 134,172 L 136,210" stroke="#482e16" stroke-width="3" stroke-linecap="round"/>
      <!-- 丰硕秋日云团树冠 -->
      <path d="M 85,178 C 50,174 38,136 52,106 C 36,80 58,46 92,44 C 112,24 150,22 174,42 C 206,36 226,68 214,100 C 230,128 216,166 182,176 C 158,190 108,190 85,178 Z" fill="url(#ac_canopy)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 树冠叶团光影起伏线条 -->
      <path d="M 72,118 C 92,102 128,110 142,130" fill="none" stroke="#e89d48" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
      <path d="M 116,56 C 142,48 174,62 182,88" fill="none" stroke="#f2b568" stroke-width="4.5" stroke-linecap="round" opacity="0.8"/>
      <!-- 栗子苞 1：左侧成熟炸开，露出红亮板栗 -->
      <circle cx="86" cy="138" r="18" fill="#587834" stroke="{STROKE}" stroke-width="3.5"/>
      <path d="M 72,138 L 100,138 M 86,124 L 86,152 M 76,128 L 96,148 M 76,148 L 96,128" stroke="#3b5420" stroke-width="2.5"/>
      <ellipse cx="86" cy="139" rx="10" ry="11" fill="#6e2d14" stroke="{STROKE}" stroke-width="2.5"/>
      <circle cx="83" cy="135" r="2.5" fill="#e07d50"/>
      <!-- 栗子苞 2：右侧饱满成熟带刺 -->
      <circle cx="168" cy="122" r="19" fill="#587834" stroke="{STROKE}" stroke-width="3.5"/>
      <path d="M 153,122 L 183,122 M 168,107 L 168,137 M 157,111 L 179,133 M 157,133 L 179,111" stroke="#3b5420" stroke-width="2.5"/>
      <ellipse cx="168" cy="123" rx="11" ry="12" fill="#6e2d14" stroke="{STROKE}" stroke-width="2.5"/>
      <circle cx="165" cy="119" r="3" fill="#e07d50"/>
      <!-- 栗子苞 3：上方小幼苞 -->
      <circle cx="132" cy="74" r="14" fill="#6c8c3e" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 121,74 L 143,74 M 132,63 L 132,85" stroke="#4a6624" stroke-width="2.5"/>
    </svg>''',

    # 8. anvil: 石砧：一块平顶大石头，旁边一块敲打用的圆石（ART_BRIEF 硬约束：绝非铁砧！）
    "anvil": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="an_body" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#b5aca0"/>
          <stop offset="50%" stop-color="#8d8478"/>
          <stop offset="85%" stop-color="#645c52"/>
          <stop offset="100%" stop-color="#423b32"/>
        </radialGradient>
        <linearGradient id="an_top" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#cfc7bc"/>
          <stop offset="100%" stop-color="#9a9184"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="95" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 平顶琢制大石砧体 -->
      <path d="M 44,118 L 174,118 C 182,148 184,186 172,208 C 158,214 62,214 46,208 C 36,186 36,148 44,118 Z" fill="url(#an_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 磨平的人工打制砧台顶面 -->
      <polygon points="44,118 72,92 198,92 174,118" fill="url(#an_top)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 砧顶平面的敲击与使用磨损坑斑 -->
      <ellipse cx="118" cy="105" rx="38" ry="8" fill="#b0a79a" stroke="#7a7266" stroke-width="2" stroke-dasharray="4 3"/>
      <circle cx="102" cy="104" r="3" fill="#665f54"/>
      <circle cx="125" cy="106" r="3.5" fill="#665f54"/>
      <circle cx="140" cy="103" r="2.5" fill="#665f54"/>
      <!-- 石砧侧面粗粝解理裂纹 -->
      <path d="M 88,122 L 94,152 L 86,182 L 92,208" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M 136,120 L 142,145 L 138,175" fill="none" stroke="#544c42" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- 顶面受光高光边线 -->
      <line x1="74" y1="94" x2="195" y2="94" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.65"/>
      <!-- 右侧敲打用的手持大圆卵石锤 -->
      <ellipse cx="196" cy="180" rx="34" ry="28" fill="#9e9486" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="190" cy="172" rx="18" ry="12" fill="#bfb5a6" opacity="0.8"/>
      <path d="M 194,166 Q 206,164 212,172" fill="none" stroke="#ded5c6" stroke-width="3" stroke-linecap="round"/>
      <!-- 敲击崩落的细碎小石屑 -->
      <polygon points="34,212 40,208 42,214" fill="#8d8478" stroke="{STROKE}" stroke-width="1.8"/>
      <polygon points="172,214 178,210 180,215" fill="#8d8478" stroke="{STROKE}" stroke-width="1.8"/>
    </svg>''',

    # 9. barebush: 荒原秃灌木（冬日枯木从地而生，分杈交错）
    "barebush": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <!-- 阴影 -->
      <ellipse cx="128" cy="218" rx="88" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 散落碎石与土块 -->
      <ellipse cx="68" cy="216" rx="8" ry="5" fill="#8a7c68" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="188" cy="218" rx="7" ry="4" fill="#8a7c68" stroke="{STROKE}" stroke-width="2.5"/>
      <!-- 丛生主根系基部 -->
      <ellipse cx="128" cy="212" rx="22" ry="9" fill="#5c4028" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 虬曲交错的枝桠网络 -->
      <!-- 1. 中央主枝干 -->
      <path d="M 128,212 L 126,160 L 115,115 L 122,60 L 116,40 M 122,60 L 136,44" fill="none" stroke="{STROKE}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 126,160 L 138,125 L 152,85 L 164,55 M 152,85 L 140,65" fill="none" stroke="{STROKE}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 2. 左侧分枝干 -->
      <path d="M 124,185 L 98,145 L 75,110 L 52,82 M 75,110 L 68,90 M 98,145 L 82,125 L 88,98" fill="none" stroke="{STROKE}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 3. 右侧分枝干 -->
      <path d="M 132,185 L 158,150 L 185,115 L 208,86 M 185,115 L 192,92 M 158,150 L 174,130 L 170,105" fill="none" stroke="{STROKE}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 木质色泽衬线（双色体积感） -->
      <path d="M 125,205 L 124,162 L 114,118 L 120,65" fill="none" stroke="#966e4a" stroke-width="3" stroke-linecap="round"/>
      <path d="M 100,146 L 78,112 L 56,86" fill="none" stroke="#966e4a" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 156,152 L 182,118 L 204,90" fill="none" stroke="#966e4a" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 枝头残存的两颗坚硬小干果 -->
      <circle cx="50" cy="80" r="4.5" fill="#8a442e" stroke="{STROKE}" stroke-width="2"/>
      <circle cx="210" cy="84" r="4.5" fill="#8a442e" stroke="{STROKE}" stroke-width="2"/>
    </svg>''',

    # 10. book: 新石器刻符兽皮卷 / 原始结绳甲骨记事（无现代纸/无金属硬约束！）
    "book": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="bk_hide" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#f0deb8"/>
          <stop offset="50%" stop-color="#d6b682"/>
          <stop offset="85%" stop-color="#a88550"/>
          <stop offset="100%" stop-color="#73552a"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="92" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 展开一角的熟兽皮记事卷主体 -->
      <path d="M 52,65 C 48,110 54,165 58,198 C 105,208 175,202 208,188 C 212,148 206,95 202,62 C 165,52 95,54 52,65 Z" fill="url(#bk_hide)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 卷轴翻卷的边缘层叠厚度 -->
      <path d="M 46,68 C 42,112 48,168 54,200 C 58,200 62,198 62,196 C 58,165 52,112 56,66 Z" fill="#b0905c" stroke="{STROKE}" stroke-width="4"/>
      <!-- 卷轴上新石器时代的象形与刻划符号（用黑色矿物天然漆绘制） -->
      <!-- 太阳刻符 -->
      <circle cx="96" cy="100" r="12" fill="none" stroke="{STROKE}" stroke-width="3.5"/>
      <path d="M 96,82 L 96,86 M 96,114 L 96,118 M 78,100 L 82,100 M 110,100 L 114,100" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <!-- 鱼纹刻符 -->
      <path d="M 138,98 C 150,88 168,88 178,98 C 168,108 150,108 138,98 Z M 178,98 L 188,90 L 188,106 Z" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linejoin="round"/>
      <!-- 禾穗与结绳记事符号 -->
      <path d="M 88,142 L 116,142 M 88,155 L 122,155 M 88,168 L 110,168" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 148,135 L 148,175 M 140,145 L 156,145 M 138,158 L 158,158" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 捆扎兽皮卷的麻皮绳与穿孔刻画骨针 -->
      <path d="M 38,135 Q 128,155 218,132" fill="none" stroke="#7d5830" stroke-width="7" stroke-linecap="round"/>
      <path d="M 38,135 Q 128,155 218,132" fill="none" stroke="#c9a25b" stroke-width="4" stroke-linecap="round"/>
      <!-- 垂下的骨针骨锥 -->
      <path d="M 180,135 L 196,182 L 188,184 L 174,136 Z" fill="#e8dfce" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="178" cy="142" r="2.5" fill="{STROKE}"/>
      <!-- 兽皮受光高光 -->
      <path d="M 72,74 Q 128,68 185,72" fill="none" stroke="#faecd4" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    </svg>''',

    # 11. jungle: 密林/雨林（层层掩映的茂密巨阔叶与藤蔓树冠群）
    "jungle": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="jg_leaf1" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#5fa042"/>
          <stop offset="50%" stop-color="#3b7326"/>
          <stop offset="85%" stop-color="#234e15"/>
          <stop offset="100%" stop-color="#14300a"/>
        </radialGradient>
        <radialGradient id="jg_leaf2" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#82b84e"/>
          <stop offset="55%" stop-color="#558a30"/>
          <stop offset="100%" stop-color="#2c5414"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="220" rx="92" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 后排深邃浓密巨木树冠与阔叶 -->
      <circle cx="68" cy="98" r="46" fill="#1b3b12" stroke="{STROKE}" stroke-width="5"/>
      <circle cx="188" cy="98" r="46" fill="#1b3b12" stroke="{STROKE}" stroke-width="5"/>
      <circle cx="128" cy="72" r="52" fill="#254d19" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 中排交叠大阔叶（海芋/芭蕉巨叶形状） -->
      <path d="M 38,172 C 32,122 75,95 118,122 C 105,155 78,178 38,172 Z" fill="url(#jg_leaf1)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 218,172 C 224,122 181,95 138,122 C 151,155 178,178 218,172 Z" fill="url(#jg_leaf1)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 前排中央丰盛阔叶与高挺叶片 -->
      <path d="M 62,208 C 65,155 128,118 128,118 C 128,118 191,155 194,208 C 158,216 98,216 62,208 Z" fill="url(#jg_leaf2)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 叶脉纹理与透光线 -->
      <path d="M 128,124 L 128,212" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 128,145 L 102,165 M 128,145 L 154,165" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 128,172 L 95,192 M 128,172 L 161,192" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <!-- 缠绕其间的苍老藤蔓 -->
      <path d="M 48,72 Q 95,120 72,185" fill="none" stroke="#7a5430" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 208,72 Q 161,120 184,185" fill="none" stroke="#7a5430" stroke-width="4.5" stroke-linecap="round"/>
      <!-- 露珠与受光高光 -->
      <circle cx="118" cy="138" r="3.5" fill="#ffffff" opacity="0.85"/>
      <path d="M 108,62 Q 128,52 148,62" fill="none" stroke="#9ed468" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    </svg>'''
}

DECO_SVG = {
    # 1. tree1: 阔叶树冠正俯视（丰满圆形叶簇，无树干，颜色柔和偏淡）
    "tree1": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="t1_grad" cx="40%" cy="38%" r="62%">
          <stop offset="0%" stop-color="#b4d68e"/>
          <stop offset="50%" stop-color="#8eb268"/>
          <stop offset="85%" stop-color="#698c46"/>
          <stop offset="100%" stop-color="#4a682c"/>
        </radialGradient>
      </defs>
      <!-- 俯视微弱阴影（偏向右下） -->
      <ellipse cx="134" cy="136" rx="94" ry="94" fill="#2d1c14" opacity="0.22"/>
      <!-- 树冠外围大叶团拼合轮廓 -->
      <path d="M 128,34 C 160,32 186,52 198,78 C 222,96 226,132 214,162 C 220,192 192,220 162,218 C 132,226 98,220 78,204 C 48,212 28,184 32,154 C 22,124 38,88 64,74 C 74,48 102,34 128,34 Z" fill="url(#t1_grad)" stroke="{DECO_STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 内部各层受光云团分簇 -->
      <path d="M 82,88 C 102,72 135,76 148,96 C 132,108 100,105 82,88 Z" fill="#c2e29e" opacity="0.6"/>
      <path d="M 145,110 C 172,98 198,118 192,144 C 175,142 152,128 145,110 Z" fill="#789a52" opacity="0.45"/>
      <path d="M 85,150 C 105,138 138,145 142,168 C 122,175 95,168 85,150 Z" fill="#60803c" opacity="0.5"/>
      <circle cx="118" cy="115" r="22" fill="#c6e8a2" opacity="0.7"/>
    </svg>''',

    # 2. tree2: 松树冠正俯视（放射状星芒层叠多层针叶，中心为顶芽）
    "tree2": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="t2_grad" cx="45%" cy="45%" r="55%">
          <stop offset="0%" stop-color="#90b88e"/>
          <stop offset="60%" stop-color="#5a8258"/>
          <stop offset="100%" stop-color="#335632"/>
        </radialGradient>
      </defs>
      <!-- 俯视微阴影 -->
      <ellipse cx="134" cy="136" rx="92" ry="92" fill="#2d1c14" opacity="0.22"/>
      <!-- 底层大星形针叶轮廓（最外圈） -->
      <polygon points="128,32 148,78 196,52 178,98 224,124 178,148 202,194 152,180 134,226 112,182 62,204 78,154 32,132 76,104 54,62 104,74" fill="#3d623b" stroke="{DECO_STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 中层较亮星形针叶轮廓 -->
      <polygon points="128,58 144,92 182,75 166,108 202,128 168,146 186,180 148,168 132,204 116,168 78,184 92,148 58,130 90,110 74,78 110,88" fill="url(#t2_grad)" stroke="{DECO_STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 顶层中心尖芽层叠 -->
      <polygon points="128,88 138,110 162,100 150,122 172,134 150,146 160,168 138,158 128,180 118,158 96,166 106,144 84,134 104,122 94,102 118,110" fill="#a4cca2" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- 中心尖顶小圆芽 -->
      <circle cx="128" cy="132" r="7" fill="#d2ecd0" stroke="{DECO_STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 3. bush: 灌木正俯视（3-4 团小灌木紧密凑在一起的平缓树冠）
    "bush": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="bs_grad" cx="42%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#b8d68c"/>
          <stop offset="55%" stop-color="#8fae64"/>
          <stop offset="100%" stop-color="#557032"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="134" cy="136" rx="88" ry="76" fill="#2d1c14" opacity="0.2"/>
      <!-- 组合小灌木丛 -->
      <!-- 团 1 -->
      <ellipse cx="98" cy="112" rx="52" ry="46" fill="url(#bs_grad)" stroke="{DECO_STROKE}" stroke-width="4.2"/>
      <!-- 团 2 -->
      <ellipse cx="162" cy="120" rx="48" ry="44" fill="url(#bs_grad)" stroke="{DECO_STROKE}" stroke-width="4.2"/>
      <!-- 团 3 -->
      <ellipse cx="126" cy="154" rx="58" ry="48" fill="url(#bs_grad)" stroke="{DECO_STROKE}" stroke-width="4.2"/>
      <!-- 顶部受光小高光圈 -->
      <circle cx="94" cy="102" r="14" fill="#d4edb0" opacity="0.6"/>
      <circle cx="158" cy="112" r="12" fill="#d4edb0" opacity="0.6"/>
      <circle cx="124" cy="146" r="16" fill="#d4edb0" opacity="0.6"/>
    </svg>''',

    # 4. rock: 石头正俯视（几块大小不一、形状自然的河滩扁卵石）
    "rock": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="rk_grad1" cx="38%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#d4ccc0"/>
          <stop offset="50%" stop-color="#aaa092"/>
          <stop offset="100%" stop-color="#6e6558"/>
        </radialGradient>
        <radialGradient id="rk_grad2" cx="38%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#c5bcb0"/>
          <stop offset="55%" stop-color="#948b7e"/>
          <stop offset="100%" stop-color="#5a5246"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="134" cy="138" rx="86" ry="68" fill="#2d1c14" opacity="0.22"/>
      <!-- 主大圆石 -->
      <path d="M 68,138 C 64,96 95,68 142,72 C 185,76 206,108 202,150 C 196,186 162,204 118,200 C 78,196 72,172 68,138 Z" fill="url(#rk_grad1)" stroke="{DECO_STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 表面天然石纹微裂 -->
      <path d="M 108,98 Q 135,115 152,142" fill="none" stroke="#7a7064" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M 96,112 Q 132,96 166,110" fill="none" stroke="#dfd8ce" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
      <!-- 紧挨的小圆石 1 -->
      <ellipse cx="68" cy="168" rx="28" ry="24" fill="url(#rk_grad2)" stroke="{DECO_STROKE}" stroke-width="3.8"/>
      <circle cx="64" cy="162" r="6" fill="#ded7cd" opacity="0.7"/>
      <!-- 紧挨的小圆石 2 -->
      <ellipse cx="188" cy="98" rx="24" ry="20" fill="url(#rk_grad2)" stroke="{DECO_STROKE}" stroke-width="3.8"/>
    </svg>''',

    # 5. grass_tuft: 一丛草正俯视（中心向外辐射舒展的柔和细长草叶）
    "grass_tuft": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <!-- 阴影 -->
      <ellipse cx="132" cy="134" rx="72" ry="58" fill="#2d1c14" opacity="0.18"/>
      <!-- 辐射展开的多簇草叶 -->
      <path d="M 128,128 Q 105,72 82,42 Q 112,68 128,128 Z" fill="#98ba6e" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 148,68 178,46 Q 148,78 128,128 Z" fill="#88aa5e" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 185,92 216,92 Q 178,112 128,128 Z" fill="#9ec074" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 186,155 212,182 Q 172,158 128,128 Z" fill="#789a4e" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 132,192 126,218 Q 118,185 128,128 Z" fill="#8cb062" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 82,185 48,198 Q 78,168 128,128 Z" fill="#9ec074" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 68,135 38,122 Q 78,118 128,128 Z" fill="#789a4e" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M 128,128 Q 72,88 46,62 Q 86,92 128,128 Z" fill="#a8ca7e" stroke="{DECO_STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- 中心草根汇聚圈 -->
      <circle cx="128" cy="128" r="8" fill="#587634" stroke="{DECO_STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 6. flowers: 野花簇正俯视（浅绿叶丛上点缀素雅的五瓣淡粉、奶黄小花）
    "flowers": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <!-- 阴影 -->
      <ellipse cx="132" cy="134" rx="82" ry="72" fill="#2d1c14" opacity="0.18"/>
      <!-- 底层绿叶托衬 -->
      <ellipse cx="102" cy="112" rx="42" ry="34" fill="#88aa60" stroke="{DECO_STROKE}" stroke-width="3.5"/>
      <ellipse cx="156" cy="116" rx="38" ry="32" fill="#789a50" stroke="{DECO_STROKE}" stroke-width="3.5"/>
      <ellipse cx="128" cy="156" rx="46" ry="36" fill="#88aa60" stroke="{DECO_STROKE}" stroke-width="3.5"/>
      <!-- 小花 1：奶白色（偏左上） -->
      <g transform="translate(98, 106)">
        <circle cx="0" cy="-12" r="8" fill="#faf6ed" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="11" cy="-4" r="8" fill="#faf6ed" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="7" cy="10" r="8" fill="#faf6ed" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-7" cy="10" r="8" fill="#faf6ed" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-11" cy="-4" r="8" fill="#faf6ed" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="0" cy="0" r="5" fill="#f2c846" stroke="{DECO_STROKE}" stroke-width="2"/>
      </g>
      <!-- 小花 2：浅粉橙色（偏右侧） -->
      <g transform="translate(162, 122)">
        <circle cx="0" cy="-11" r="7.5" fill="#f7d4c8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="10" cy="-3" r="7.5" fill="#f7d4c8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="6" cy="9" r="7.5" fill="#f7d4c8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-6" cy="9" r="7.5" fill="#f7d4c8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-10" cy="-3" r="7.5" fill="#f7d4c8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="0" cy="0" r="4.5" fill="#e8983e" stroke="{DECO_STROKE}" stroke-width="2"/>
      </g>
      <!-- 小花 3：嫩黄色（偏下方） -->
      <g transform="translate(126, 162)">
        <circle cx="0" cy="-10" r="7" fill="#fdf0b8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="9" cy="-3" r="7" fill="#fdf0b8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="6" cy="8" r="7" fill="#fdf0b8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-6" cy="8" r="7" fill="#fdf0b8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="-9" cy="-3" r="7" fill="#fdf0b8" stroke="{DECO_STROKE}" stroke-width="2.5"/>
        <circle cx="0" cy="0" r="4" fill="#d8842c" stroke="{DECO_STROKE}" stroke-width="2"/>
      </g>
    </svg>''',

    # 7. reeds_small: 小片芦苇正俯视（水边湿地中的一小簇细长芦叶与芦花梢头）
    "reeds_small": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <!-- 阴影 -->
      <ellipse cx="132" cy="134" rx="76" ry="60" fill="#2d1c14" opacity="0.18"/>
      <!-- 水绿水草基部 -->
      <ellipse cx="128" cy="132" rx="34" ry="24" fill="#6a948c" stroke="{DECO_STROKE}" stroke-width="3" opacity="0.6"/>
      <!-- 辐射展开的窄长芦苇叶片 -->
      <path d="M 128,128 Q 112,65 92,34 Q 118,65 128,128 Z" fill="#7a9e78" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 152,65 174,38 Q 146,72 128,128 Z" fill="#6e926c" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 188,88 222,78 Q 178,105 128,128 Z" fill="#84a882" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 182,158 206,188 Q 166,160 128,128 Z" fill="#6e926c" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 120,188 108,222 Q 106,182 128,128 Z" fill="#7a9e78" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 72,176 42,192 Q 74,160 128,128 Z" fill="#84a882" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <path d="M 128,128 Q 64,124 32,108 Q 74,112 128,128 Z" fill="#6e926c" stroke="{DECO_STROKE}" stroke-width="3.2"/>
      <!-- 几簇毛茸茸的芦花穗（亚麻色/浅赭灰） -->
      <ellipse cx="108" cy="62" rx="7" ry="14" fill="#dfd4bc" stroke="{DECO_STROKE}" stroke-width="2.5" transform="rotate(-15 108 62)"/>
      <ellipse cx="158" cy="68" rx="7" ry="14" fill="#d4c8ae" stroke="{DECO_STROKE}" stroke-width="2.5" transform="rotate(20 158 68)"/>
      <ellipse cx="178" cy="142" rx="6" ry="12" fill="#dfd4bc" stroke="{DECO_STROKE}" stroke-width="2.5" transform="rotate(45 178 142)"/>
      <ellipse cx="68" cy="148" rx="6" ry="12" fill="#d4c8ae" stroke="{DECO_STROKE}" stroke-width="2.5" transform="rotate(-40 68 148)"/>
    </svg>'''
}

def render_svg_dict(svg_dict, target_dir, prefix="", is_deco=False):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 256, "height": 256})

        for key, svg_code in svg_dict.items():
            svg_filename = f"{prefix}{key}.svg"
            svg_path = os.path.join(SVGS_DIR, svg_filename)
            png_path = os.path.join(target_dir, f"{key}.png")

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
            print(f"  [Rendered] -> {png_path}")

        browser.close()

def main():
    print("--- 渲染 11 个缺失卡牌图标 ---")
    render_svg_dict(MISSING_ICONS_SVG, ICONS_DIR)

    print("--- 渲染 7 个正俯视地面装饰 deco ---")
    render_svg_dict(DECO_SVG, DECO_DIR, prefix="deco_")
    # 同时在 art/svgs 存一份不带前缀的 deco 方便索引
    for key, code in DECO_SVG.items():
        with open(os.path.join(SVGS_DIR, f"{key}.svg"), "w", encoding="utf-8") as f:
            f.write(code.strip())

    print("全部新资产渲染完毕！")

if __name__ == "__main__":
    main()
