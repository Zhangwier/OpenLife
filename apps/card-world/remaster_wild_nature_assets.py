# -*- coding: utf-8 -*-
"""
Card World - Wild Nature & Landscape Assets Remaster Script
Renders high-detail hand-drawn PNGs for all remaining natural world elements:
pineGrove, mushroom, hive, pheasant, bean, field, fieldRipe, hemp, river,
table, bear, scree, pit, nest, log, stone.
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
    # 1. pineGrove: 深林苍松，高耸层叠的苍翠针叶层，古朴粗壮的松树皮与松脂光泽
    "pineGrove": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="pg_trunk" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#7a4e28"/>
          <stop offset="50%" stop-color="#543419"/>
          <stop offset="100%" stop-color="#38210e"/>
        </linearGradient>
        <radialGradient id="pg_foliage" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#467c48"/>
          <stop offset="60%" stop-color="#2a5230"/>
          <stop offset="100%" stop-color="#16331b"/>
        </radialGradient>
      </defs>
      <!-- 树下松针腐殖土阴影 -->
      <ellipse cx="128" cy="225" rx="85" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 主树干 -->
      <path d="M 116,140 L 112,224 L 144,224 L 140,140 Z" fill="url(#pg_trunk)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 树皮粗糙横裂纹与松脂 -->
      <line x1="115" y1="175" x2="138" y2="175" stroke="{STROKE}" stroke-width="3"/>
      <line x1="113" y1="200" x2="142" y2="200" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="134" cy="188" rx="3.5" ry="6" fill="#e8b038" opacity="0.85"/>
      <!-- 底层大松塔针叶层 -->
      <path d="M 45,178 L 128,110 L 211,178 C 185,188 150,182 128,192 C 106,182 71,188 45,178 Z" fill="url(#pg_foliage)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 58,172 L 72,185 L 90,172 L 108,185 L 128,170 L 148,185 L 166,172 L 184,185 L 198,172" fill="none" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 中层针叶层 -->
      <path d="M 60,132 L 128,72 L 196,132 C 172,142 145,136 128,145 C 111,136 84,142 60,132 Z" fill="url(#pg_foliage)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 72,126 L 86,138 L 106,126 L 128,140 L 150,126 L 170,138 L 184,126" fill="none" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 顶层尖峰针叶层 -->
      <path d="M 78,85 L 128,24 L 178,85 C 158,95 140,90 128,98 C 116,90 98,95 78,85 Z" fill="url(#pg_foliage)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M 90,82 L 105,92 L 128,80 L 151,92 L 166,82" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- 枝头高光亮绿点缀 -->
      <path d="M 128,34 L 115,55 M 128,34 L 141,55" stroke="#7bbd68" stroke-width="3" stroke-linecap="round"/>
      <path d="M 128,78 L 108,105 M 128,78 L 148,105" stroke="#7bbd68" stroke-width="3" stroke-linecap="round"/>
      <!-- 垂挂的小松塔 -->
      <ellipse cx="95" cy="185" rx="7" ry="11" fill="#754721" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="160" cy="186" rx="7" ry="11" fill="#754721" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 2. mushroom: 丛林野生蘑菇群，饱满的红底白斑伞盖、温润厚实的菌柄与青苔落叶
    "mushroom": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ms_cap_red" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#ff6052"/>
          <stop offset="65%" stop-color="#d62b20"/>
          <stop offset="100%" stop-color="#8a130a"/>
        </radialGradient>
        <radialGradient id="ms_cap_brown" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#e0a369"/>
          <stop offset="65%" stop-color="#b07038"/>
          <stop offset="100%" stop-color="#6e3f16"/>
        </radialGradient>
        <linearGradient id="ms_stem" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#fff8ed"/>
          <stop offset="60%" stop-color="#ebd8bf"/>
          <stop offset="100%" stop-color="#c9b091"/>
        </linearGradient>
      </defs>
      <!-- 潮湿落叶与泥土投影 -->
      <ellipse cx="128" cy="225" rx="88" ry="20" fill="#2d1c14" opacity="0.45"/>
      <path d="M 55,220 C 75,212 180,212 205,220 C 170,228 90,228 55,220 Z" fill="#5c6e3b" opacity="0.7"/>
      <!-- 次级棕黄色圆顶牛肝菌 (左侧) -->
      <path d="M 85,150 L 78,216 L 98,216 L 95,150 Z" fill="url(#ms_stem)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 48,155 C 45,110 125,110 122,155 C 105,162 65,162 48,155 Z" fill="url(#ms_cap_brown)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <ellipse cx="85" cy="155" rx="36" ry="8" fill="#593210" opacity="0.7"/>
      <!-- 次级小幼菌 (右侧) -->
      <path d="M 175,175 L 172,218 L 186,218 L 184,175 Z" fill="url(#ms_stem)" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="180" cy="172" rx="18" ry="14" fill="url(#ms_cap_brown)" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 主大红蘑菇 (中央挺立) -->
      <path d="M 125,115 L 115,222 C 115,226 150,226 150,222 L 142,115 Z" fill="url(#ms_stem)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 菌环 (Annulus) -->
      <path d="M 118,162 Q 133,168 148,162 Q 146,172 133,174 Q 120,172 118,162 Z" fill="#fff8ed" stroke="{STROKE}" stroke-width="3"/>
      <!-- 伞盖下菌褶阴影 -->
      <path d="M 72,122 C 85,134 175,134 188,122 Z" fill="#521510"/>
      <!-- 华丽的大红伞盖 -->
      <path d="M 62,120 C 58,45 202,45 198,120 C 168,135 92,135 62,120 Z" fill="url(#ms_cap_red)" stroke="{STROKE}" stroke-width="6.5" stroke-linejoin="round"/>
      <!-- 伞盖白斑 (多层大小斑块) -->
      <ellipse cx="102" cy="78" rx="10" ry="8" fill="#ffffff" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="145" cy="72" rx="12" ry="9" fill="#ffffff" stroke="{STROKE}" stroke-width="2.5"/>
      <ellipse cx="126" cy="94" rx="8" ry="6" fill="#ffffff" stroke="{STROKE}" stroke-width="2"/>
      <ellipse cx="80" cy="98" rx="6" ry="5" fill="#ffffff" stroke="{STROKE}" stroke-width="2"/>
      <ellipse cx="172" cy="92" rx="7" ry="6" fill="#ffffff" stroke="{STROKE}" stroke-width="2"/>
      <circle cx="155" cy="105" r="4.5" fill="#ffffff"/>
      <!-- 湿润高光 -->
      <path d="M 98,62 Q 130,52 162,62" fill="none" stroke="#ffb8b3" stroke-width="4" stroke-linecap="round"/>
    </svg>''',

    # 3. hive: 老树古木上的野生蜂巢，金黄流蜜的螺旋多层巢室，环绕采蜜的勤劳小野蜂
    "hive": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="hv_body" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffd55c"/>
          <stop offset="60%" stop-color="#e09e24"/>
          <stop offset="100%" stop-color="#945f0d"/>
        </radialGradient>
      </defs>
      <!-- 顶部支撑的苍老树枝 -->
      <path d="M 18,35 C 65,42 195,35 240,48 L 238,70 C 190,56 65,65 18,52 Z" fill="#59391e" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 蜂巢吊挂系带 -->
      <line x1="128" y1="58" x2="128" y2="78" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <!-- 蜂巢多层同心环状结构 (从上到下逐层递增后收束) -->
      <!-- 层 1 -->
      <ellipse cx="128" cy="88" rx="36" ry="16" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="5"/>
      <!-- 层 2 -->
      <ellipse cx="128" cy="110" rx="55" ry="20" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 层 3 (最宽处) -->
      <ellipse cx="128" cy="136" rx="66" ry="22" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="6"/>
      <!-- 层 4 -->
      <ellipse cx="128" cy="162" rx="58" ry="20" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 层 5 -->
      <ellipse cx="128" cy="186" rx="44" ry="17" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="5"/>
      <!-- 层 6 (底收尾) -->
      <ellipse cx="128" cy="204" rx="26" ry="12" fill="url(#hv_body)" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 蜂巢出入口黑洞 (带有暖色光晕) -->
      <ellipse cx="128" cy="148" rx="14" ry="18" fill="#2b1504" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="128" cy="154" rx="8" ry="10" fill="#140801"/>
      <!-- 垂滴的浓稠金黄蜂蜜 -->
      <path d="M 124,208 C 124,228 132,228 132,208 Z" fill="#ffd700" stroke="{STROKE}" stroke-width="2.5"/>
      <!-- 飞舞的小野蜂 1 (右上) -->
      <ellipse cx="195" cy="88" rx="7" ry="5" fill="#ffd55c" stroke="{STROKE}" stroke-width="2.5"/>
      <path d="M 193,84 L 193,92 M 197,84 L 197,92" stroke="{STROKE}" stroke-width="2"/>
      <ellipse cx="192" cy="80" rx="4" ry="6" fill="#e0f7fa" opacity="0.8" stroke="{STROKE}" stroke-width="1.5"/>
      <!-- 飞舞的小野蜂 2 (左中) -->
      <ellipse cx="58" cy="125" rx="6" ry="4.5" fill="#ffd55c" stroke="{STROKE}" stroke-width="2.5"/>
      <path d="M 56,121 L 56,129 M 60,121 L 60,129" stroke="{STROKE}" stroke-width="2"/>
      <ellipse cx="56" cy="118" rx="4" ry="5" fill="#e0f7fa" opacity="0.8" stroke="{STROKE}" stroke-width="1.5"/>
    </svg>''',

    # 4. pheasant: 华美野雉/环颈雉，翠绿金属光泽雉头、赤红眼斑、长尾羽、斑斓暖褐色羽翼
    "pheasant": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ph_head" cx="40%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#3cb371"/>
          <stop offset="60%" stop-color="#1e6b40"/>
          <stop offset="100%" stop-color="#0c3820"/>
        </radialGradient>
        <radialGradient id="ph_body" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#e27c38"/>
          <stop offset="60%" stop-color="#b8511d"/>
          <stop offset="100%" stop-color="#732a08"/>
        </radialGradient>
      </defs>
      <!-- 脚底草地 -->
      <ellipse cx="138" cy="225" rx="75" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 修长翘起的绚丽雉尾羽 (向左后方延展) -->
      <path d="M 115,148 C 65,150 25,120 12,85 C 32,108 80,140 125,156 Z" fill="#8c5828" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 115,155 C 75,165 40,145 28,118 C 50,135 85,155 125,162 Z" fill="#ba8043" stroke="{STROKE}" stroke-width="4"/>
      <!-- 尾羽上的经典斑马横黑条纹 -->
      <line x1="38" y1="108" x2="48" y2="120" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <line x1="62" y1="126" x2="74" y2="138" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <line x1="88" y1="142" x2="100" y2="152" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 细长爪足 -->
      <!-- 远侧腿 -->
      <path d="M 132,185 L 128,222 M 128,222 L 118,225 M 128,222 L 138,225" stroke="#63452c" stroke-width="4.5" stroke-linecap="round"/>
      <!-- 近侧腿 -->
      <path d="M 152,185 L 150,222 M 150,222 L 138,225 M 150,222 L 160,225" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <!-- 丰满圆润的赤褐色躯体 -->
      <path d="M 112,142 C 105,120 135,105 162,112 C 185,118 195,145 185,172 C 172,192 135,192 118,175 Z" fill="url(#ph_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 翅膀羽毛层叠花纹 -->
      <path d="M 132,132 C 155,130 178,145 168,172 C 152,178 135,165 132,132 Z" fill="#d99b59" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 142,142 Q 160,150 155,165" stroke="{STROKE}" stroke-width="3" fill="none"/>
      <!-- 纯白颈环 (Ring-neck) -->
      <path d="M 160,105 Q 175,108 178,98" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
      <path d="M 160,105 Q 175,108 178,98" stroke="{STROKE}" stroke-width="2" stroke-linecap="round"/>
      <!-- 翠绿昂然的头颈 -->
      <path d="M 165,108 C 160,95 165,75 178,65 C 190,56 206,62 208,75 C 208,90 188,108 172,112 Z" fill="url(#ph_head)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 鲜艳醒目的赤红眼周肉垂 -->
      <ellipse cx="190" cy="70" rx="9" ry="7" fill="#dc2626" stroke="{STROKE}" stroke-width="2.5"/>
      <circle cx="190" cy="70" r="2.5" fill="#facc15"/>
      <circle cx="190" cy="70" r="1.2" fill="{STROKE}"/>
      <!-- 尖锐浅色鸟喙 -->
      <polygon points="208,72 225,75 208,80" fill="#fae8b2" stroke="{STROKE}" stroke-width="3" stroke-linejoin="round"/>
    </svg>''',

    # 5. bean: 丰硕大豆荚与圆润金黄大豆，饱满厚实的豆荚叶片、露出的圆润豆粒
    "bean": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="bn_pod" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#99c259"/>
          <stop offset="60%" stop-color="#6e9c32"/>
          <stop offset="100%" stop-color="#46691c"/>
        </radialGradient>
        <radialGradient id="bn_seed" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#fff0aa"/>
          <stop offset="65%" stop-color="#e8be48"/>
          <stop offset="100%" stop-color="#ab821f"/>
        </radialGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="220" rx="85" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 后方大豆叶片 (三出复叶感) -->
      <path d="M 128,95 C 90,45 135,25 155,55 C 165,75 145,95 128,95 Z" fill="#58852a" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 128,95 C 65,75 75,125 105,128 C 122,125 125,108 128,95 Z" fill="#6d9e36" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 主大豆荚 (弯曲饱满、节节分明) -->
      <path d="M 45,185 C 55,135 110,88 198,68 C 215,85 185,148 118,188 C 82,208 48,205 45,185 Z" fill="url(#bn_pod)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 豆荚边缘厚韧凸脊 -->
      <path d="M 45,185 C 55,135 110,88 198,68" fill="none" stroke="#b4e070" stroke-width="4" stroke-linecap="round"/>
      <!-- 荚节隆起处的阴影凹陷 -->
      <path d="M 92,165 Q 105,135 118,152" fill="none" stroke="#365215" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 135,132 Q 150,105 162,120" fill="none" stroke="#365215" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 散落前方圆润金黄的大豆粒 (3粒) -->
      <ellipse cx="82" cy="195" rx="18" ry="14" transform="rotate(-15 82 195)" fill="url(#bn_seed)" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 82,192 C 84,195 86,198 88,197" stroke="#75560e" stroke-width="2.5" stroke-linecap="round"/>
      
      <ellipse cx="125" cy="202" rx="20" ry="15" transform="rotate(10 125 202)" fill="url(#bn_seed)" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 124,198 C 127,202 129,204 132,203" stroke="#75560e" stroke-width="2.5" stroke-linecap="round"/>
      
      <ellipse cx="168" cy="192" rx="17" ry="13" transform="rotate(-25 168 192)" fill="url(#bn_seed)" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 167,189 C 170,192 172,194 174,193" stroke="#75560e" stroke-width="2.5" stroke-linecap="round"/>
    </svg>''',

    # 6. field: 规整耕地/起垄旱地，深色肥沃垄沟、整齐的嫩绿幼苗、翻耕沃土质感
    "field": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="fd_earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#966d47"/>
          <stop offset="60%" stop-color="#694627"/>
          <stop offset="100%" stop-color="#422913"/>
        </linearGradient>
      </defs>
      <!-- 透视大田块轮廓 -->
      <polygon points="25,212 52,65 204,65 231,212" fill="url(#fd_earth)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 起伏隆起的田垄 (4条深沟大垄) -->
      <path d="M 52,65 L 25,212" stroke="{STROKE}" stroke-width="5"/>
      <path d="M 90,65 L 76,212" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 128,65 L 128,212" stroke="{STROKE}" stroke-width="5"/>
      <path d="M 166,65 L 180,212" stroke="{STROKE}" stroke-width="4.5"/>
      <path d="M 204,65 L 231,212" stroke="{STROKE}" stroke-width="5"/>
      <!-- 垄背向阳亮土色 -->
      <polygon points="56,65 86,65 72,212 32,212" fill="#aa7f55" opacity="0.35"/>
      <polygon points="132,65 162,65 176,212 132,212" fill="#aa7f55" opacity="0.35"/>
      <!-- 垄上生机勃勃的嫩绿禾苗 (小二叶/三叶草芽) -->
      <!-- 远排 -->
      <path d="M 72,75 L 68,68 M 72,75 L 76,68 M 110,75 L 106,68 M 110,75 L 114,68 M 148,75 L 144,68 M 148,75 L 152,68 M 185,75 L 181,68 M 185,75 L 189,68" stroke="#84cc37" stroke-width="3" stroke-linecap="round"/>
      <!-- 中排 -->
      <path d="M 62,125 L 56,115 M 62,125 L 68,115 M 106,125 L 100,115 M 106,125 L 112,115 M 150,125 L 144,115 M 150,125 L 156,115 M 195,125 L 189,115 M 195,125 L 201,115" stroke="#70b329" stroke-width="4.5" stroke-linecap="round"/>
      <!-- 近排粗壮大禾苗 -->
      <path d="M 52,185 L 42,170 M 52,185 L 62,170 M 52,185 L 52,166" stroke="#5fa11f" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M 102,185 L 92,170 M 102,185 L 112,170 M 102,185 L 102,166" stroke="#5fa11f" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M 154,185 L 144,170 M 154,185 L 164,170 M 154,185 L 154,166" stroke="#5fa11f" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M 206,185 L 196,170 M 206,185 L 216,170 M 206,185 L 206,166" stroke="#5fa11f" stroke-width="5.5" stroke-linecap="round"/>
    </svg>''',

    # 7. fieldRipe: 丰收金黄麦浪田，垂头沉甸的金黄谷穗、秋阳下的金色沃土
    "fieldRipe": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="fr_gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffe67a"/>
          <stop offset="60%" stop-color="#dfa82e"/>
          <stop offset="100%" stop-color="#996e14"/>
        </linearGradient>
      </defs>
      <!-- 田块轮廓 -->
      <polygon points="25,212 52,65 204,65 231,212" fill="#7a5430" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 金黄饱满的密实稻谷丛 -->
      <!-- 后层小谷穗 -->
      <path d="M 45,105 Q 128,85 211,105 L 204,65 L 52,65 Z" fill="#d9a838" stroke="{STROKE}" stroke-width="4"/>
      <!-- 中层沉甸谷浪 -->
      <path d="M 35,155 Q 128,135 221,155 L 211,105 Q 128,85 45,105 Z" fill="#ebba42" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 前层饱满垂坠的大麦穗/大粟穗 -->
      <g stroke="{STROKE}" stroke-width="4" stroke-linejoin="round">
        <!-- 穗 1 -->
        <path d="M 55,212 Q 50,165 40,145" fill="none" stroke-width="5"/>
        <ellipse cx="38" cy="142" rx="12" ry="24" transform="rotate(-25 38 142)" fill="url(#fr_gold)"/>
        <!-- 穗 2 -->
        <path d="M 92,212 Q 95,165 85,138" fill="none" stroke-width="5"/>
        <ellipse cx="82" cy="135" rx="14" ry="26" transform="rotate(-18 82 135)" fill="url(#fr_gold)"/>
        <!-- 穗 3 (中心主穗) -->
        <path d="M 132,212 Q 130,160 125,130" fill="none" stroke-width="5.5"/>
        <ellipse cx="124" cy="125" rx="15" ry="28" transform="rotate(-8 124 125)" fill="url(#fr_gold)"/>
        <!-- 穗 4 -->
        <path d="M 172,212 Q 170,165 178,138" fill="none" stroke-width="5"/>
        <ellipse cx="182" cy="135" rx="14" ry="26" transform="rotate(18 182 135)" fill="url(#fr_gold)"/>
        <!-- 穗 5 -->
        <path d="M 208,212 Q 212,165 222,145" fill="none" stroke-width="5"/>
        <ellipse cx="225" cy="142" rx="12" ry="24" transform="rotate(25 225 142)" fill="url(#fr_gold)"/>
      </g>
      <!-- 谷芒白细光芒 -->
      <line x1="32" y1="125" x2="22" y2="108" stroke="#fff4b8" stroke-width="3" stroke-linecap="round"/>
      <line x1="75" y1="118" x2="68" y2="100" stroke="#fff4b8" stroke-width="3" stroke-linecap="round"/>
      <line x1="120" y1="108" x2="116" y2="88" stroke="#fff4b8" stroke-width="3" stroke-linecap="round"/>
      <line x1="188" y1="118" x2="198" y2="100" stroke="#fff4b8" stroke-width="3" stroke-linecap="round"/>
    </svg>''',

    # 8. hemp: 葛麻丛/大麻株，修长挺拔的坚韧青绿茎秆、放射状细裂锯齿掌状叶
    "hemp": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="hm_leaf" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#76af3c"/>
          <stop offset="60%" stop-color="#4e8022"/>
          <stop offset="100%" stop-color="#2d5212"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="80" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 后方细副茎 -->
      <line x1="78" y1="220" x2="72" y2="75" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <line x1="78" y1="220" x2="72" y2="75" stroke="#5c8a2b" stroke-width="4" stroke-linecap="round"/>
      <line x1="182" y1="220" x2="188" y2="80" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <line x1="182" y1="220" x2="188" y2="80" stroke="#5c8a2b" stroke-width="4" stroke-linecap="round"/>
      <!-- 主中茎秆 -->
      <line x1="128" y1="224" x2="128" y2="35" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="128" y1="224" x2="128" y2="35" stroke="#6da333" stroke-width="5" stroke-linecap="round"/>
      <!-- 掌状大复叶 (多组由下至上轮生) -->
      <!-- 下组大叶片 (左右伸展) -->
      <g fill="url(#hm_leaf)" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round">
        <path d="M 128,165 C 80,180 50,175 35,160 C 65,150 100,155 128,165 Z"/>
        <path d="M 128,165 C 176,180 206,175 221,160 C 191,150 156,155 128,165 Z"/>
        <!-- 中组叶片 -->
        <path d="M 128,115 C 75,120 45,100 32,85 C 65,85 105,100 128,115 Z"/>
        <path d="M 128,115 C 181,120 211,100 224,85 C 191,85 151,100 128,115 Z"/>
        <path d="M 128,115 C 105,75 110,45 128,30 C 146,45 151,75 128,115 Z"/>
        <!-- 上梢嫩叶 -->
        <path d="M 128,65 C 95,50 85,32 80,22 C 102,28 120,45 128,65 Z"/>
        <path d="M 128,65 C 161,50 171,32 176,22 C 154,28 136,45 128,65 Z"/>
      </g>
      <!-- 叶脉细纹 -->
      <line x1="128" y1="165" x2="48" y2="162" stroke="#a4db5a" stroke-width="2.5"/>
      <line x1="128" y1="165" x2="208" y2="162" stroke="#a4db5a" stroke-width="2.5"/>
      <line x1="128" y1="115" x2="45" y2="92" stroke="#a4db5a" stroke-width="2.5"/>
      <line x1="128" y1="115" x2="211" y2="92" stroke="#a4db5a" stroke-width="2.5"/>
    </svg>''',

    # 9. river: 清溪浅流/湖边水韵，蜿蜒澄澈的碧蓝水流、圆润卵石与水草倒影
    "river": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="rv_water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#73c0cc"/>
          <stop offset="50%" stop-color="#4a9aa6"/>
          <stop offset="100%" stop-color="#2a6670"/>
        </linearGradient>
      </defs>
      <!-- 岸边两则水岸沙石地 -->
      <path d="M 0,0 L 85,0 C 70,85 110,175 60,256 L 0,256 Z" fill="#8f7659" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 256,0 L 175,0 C 190,75 160,165 210,256 L 256,256 Z" fill="#8f7659" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 澄澈蜿蜒的流水主河道 -->
      <path d="M 85,0 C 70,85 110,175 60,256 L 210,256 C 160,165 190,75 175,0 Z" fill="url(#rv_water)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 水波流线 (白色水丝与高光) -->
      <path d="M 125,18 C 112,65 142,120 115,185" fill="none" stroke="#bfe8f0" stroke-width="5" stroke-linecap="round"/>
      <path d="M 148,45 C 135,92 165,150 142,225" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      <path d="M 98,90 C 90,130 118,175 95,235" fill="none" stroke="#bfe8f0" stroke-width="4" stroke-linecap="round"/>
      <!-- 河心与岸边圆润光滑的鹅卵石 (3颗) -->
      <ellipse cx="68" cy="185" rx="14" ry="10" fill="#a39686" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="178" cy="115" rx="16" ry="11" fill="#756b5e" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="145" cy="148" rx="10" ry="7" fill="#c2b6a5" stroke="{STROKE}" stroke-width="3"/>
      <!-- 水边一丛小青水草 -->
      <path d="M 68,175 C 55,150 62,125 72,110 C 70,135 78,155 76,175 Z" fill="#4d8733" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 10. table: 聚落古朴原木饭桌，厚实榫卯矮案、木纹案面、盛放着热气陶碗与竹箸
    "table": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="tb_wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#b07d4f"/>
          <stop offset="50%" stop-color="#80532c"/>
          <stop offset="100%" stop-color="#543317"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="95" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 后两桌腿 -->
      <rect x="52" y="135" width="16" height="60" rx="4" fill="#422610" stroke="{STROKE}" stroke-width="4.5"/>
      <rect x="188" y="135" width="16" height="60" rx="4" fill="#422610" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 前横档拉杆 (Apron/Stretcher) -->
      <rect x="48" y="152" width="160" height="15" rx="3" fill="#633b19" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 前两粗壮主桌腿 -->
      <rect x="42" y="145" width="20" height="75" rx="4" fill="url(#tb_wood)" stroke="{STROKE}" stroke-width="5.5"/>
      <rect x="194" y="145" width="20" height="75" rx="4" fill="url(#tb_wood)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 厚实原木大桌面板 (透视斜面) -->
      <polygon points="20,145 52,98 204,98 236,145" fill="url(#tb_wood)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 桌面厚度沿口 -->
      <polygon points="20,145 236,145 236,155 20,155" fill="#543317" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 桌面原木木纹与拼接缝 -->
      <line x1="78" y1="98" x2="68" y2="145" stroke="#422610" stroke-width="3.5"/>
      <line x1="138" y1="98" x2="135" y2="145" stroke="#422610" stroke-width="3.5"/>
      <line x1="182" y1="98" x2="190" y2="145" stroke="#422610" stroke-width="3.5"/>
      <!-- 桌面上的热气粗陶大碗 -->
      <ellipse cx="128" cy="118" rx="26" ry="12" fill="#d97543" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="128" cy="116" rx="22" ry="8" fill="#fadc96"/>
      <!-- 碗口飘出的丝丝白汽 (美味热气) -->
      <path d="M 122,108 C 118,95 125,88 120,75" fill="none" stroke="#fff8ed" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>
      <path d="M 134,106 C 138,94 132,86 136,72" fill="none" stroke="#fff8ed" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>
    </svg>''',

    # 11. bear: 深林黑熊，魁梧浑厚的雄壮体魄、黑灰厚实毛皮、胸前浅色月牙斑、威严浑厚
    "bear": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="br_body" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#4d4038"/>
          <stop offset="65%" stop-color="#2a221d"/>
          <stop offset="100%" stop-color="#140f0c"/>
        </radialGradient>
      </defs>
      <!-- 脚下林地阴影 -->
      <ellipse cx="128" cy="225" rx="88" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 远侧粗腿 -->
      <rect x="75" y="165" width="26" height="56" rx="8" fill="#1b1613" stroke="{STROKE}" stroke-width="5"/>
      <rect x="165" y="165" width="26" height="56" rx="8" fill="#1b1613" stroke="{STROKE}" stroke-width="5"/>
      <!-- 雄壮厚实的庞大躯体 -->
      <path d="M 62,148 C 55,108 92,78 142,82 C 195,85 215,122 208,168 C 200,198 165,202 125,200 C 82,198 65,182 62,148 Z" fill="url(#br_body)" stroke="{STROKE}" stroke-width="6.5" stroke-linejoin="round"/>
      <!-- 近侧厚重前掌与后肢 -->
      <path d="M 88,145 Q 98,185 92,222 L 72,222 Q 68,175 75,145 Z" fill="url(#br_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 165,145 Q 178,185 172,222 L 150,222 Q 146,175 152,145 Z" fill="url(#br_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 尖利足爪 -->
      <line x1="72" y1="222" x2="68" y2="226" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <line x1="78" y1="222" x2="76" y2="227" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <line x1="84" y1="222" x2="84" y2="227" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <!-- 魁梧头颅与圆耳 -->
      <circle cx="58" cy="112" r="30" fill="url(#br_body)" stroke="{STROKE}" stroke-width="6"/>
      <!-- 圆熊耳 -->
      <circle cx="45" cy="85" r="10" fill="url(#br_body)" stroke="{STROKE}" stroke-width="4.5"/>
      <circle cx="72" cy="85" r="10" fill="url(#br_body)" stroke="{STROKE}" stroke-width="4.5"/>
      <circle cx="45" cy="85" r="4.5" fill="#69564b"/>
      <!-- 浅褐大鼻吻 -->
      <ellipse cx="46" cy="122" rx="14" ry="11" fill="#755a47" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="42" cy="118" rx="5" ry="4" fill="{STROKE}"/>
      <!-- 沉稳小兽眼 -->
      <circle cx="62" cy="108" r="3" fill="#000000"/>
      <circle cx="61" cy="107" r="1" fill="#ffffff"/>
      <!-- 胸前经典亚洲黑熊月牙浅白斑纹 (Moon bear mark) -->
      <path d="M 88,142 C 96,165 115,172 125,172 C 112,168 102,155 98,142 Z" fill="#fff8ed" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 12. scree: 嶙峋矿石堆/悬崖碎石，坚硬的花岗岩与玄武岩块、交错锐利棱角、青苔石斑
    "scree": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="sc_rock1" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#b0a596"/>
          <stop offset="65%" stop-color="#736758"/>
          <stop offset="100%" stop-color="#42392e"/>
        </radialGradient>
        <radialGradient id="sc_rock2" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#918778"/>
          <stop offset="65%" stop-color="#595145"/>
          <stop offset="100%" stop-color="#2e2821"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="90" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 后方大基石 -->
      <polygon points="45,150 95,85 178,92 215,165 185,212 65,210" fill="url(#sc_rock2)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <line x1="95" y1="85" x2="128" y2="145" stroke="{STROKE}" stroke-width="4.5"/>
      <line x1="178" y1="92" x2="128" y2="145" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 前方交错堆叠的中石块 -->
      <polygon points="35,195 62,135 125,128 145,198 85,216" fill="url(#sc_rock1)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <line x1="62" y1="135" x2="95" y2="185" stroke="{STROKE}" stroke-width="4"/>
      <!-- 右侧尖锐石块 -->
      <polygon points="125,185 165,125 220,155 208,215 145,218" fill="url(#sc_rock1)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <line x1="165" y1="125" x2="175" y2="185" stroke="{STROKE}" stroke-width="4"/>
      <!-- 散落的小碎砾石 -->
      <polygon points="75,210 92,202 102,216 82,222" fill="#756959" stroke="{STROKE}" stroke-width="3"/>
      <polygon points="185,208 198,200 205,214 190,220" fill="#756959" stroke="{STROKE}" stroke-width="3"/>
      <!-- 石面青苔斑块 -->
      <path d="M 80,105 Q 95,95 105,108" stroke="#728c46" stroke-width="4" stroke-linecap="round"/>
      <path d="M 145,108 Q 160,102 168,115" stroke="#728c46" stroke-width="4" stroke-linecap="round"/>
    </svg>''',

    # 13. pit: 黏土取土坑/河湾水坑，台阶状挖掘断层、水洼反光与陶泥铲取痕迹
    "pit": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="pt_rim" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#b88358"/>
          <stop offset="60%" stop-color="#80502b"/>
          <stop offset="100%" stop-color="#4a2a12"/>
        </radialGradient>
      </defs>
      <!-- 外沿地面 -->
      <ellipse cx="128" cy="145" rx="105" ry="75" fill="url(#pt_rim)" stroke="{STROKE}" stroke-width="6.5"/>
      <!-- 阶梯状挖掘下沉斜坡断层 -->
      <ellipse cx="128" cy="155" rx="85" ry="58" fill="#693d1c" stroke="{STROKE}" stroke-width="5"/>
      <!-- 坑底湿润蓄水洼 (带清亮反光) -->
      <ellipse cx="128" cy="168" rx="60" ry="36" fill="#3a6970" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="128" cy="168" rx="48" ry="26" fill="#4d8b94"/>
      <ellipse cx="120" cy="165" rx="22" ry="8" fill="#7ecfd6" opacity="0.6"/>
      <!-- 挖掘铲凿痕迹与湿泥块堆 -->
      <path d="M 58,125 Q 75,145 92,125" stroke="{STROKE}" stroke-width="3.5" fill="none"/>
      <path d="M 165,125 Q 182,145 198,125" stroke="{STROKE}" stroke-width="3.5" fill="none"/>
      <!-- 坑沿散落的新鲜红黏土堆 -->
      <ellipse cx="62" cy="175" rx="18" ry="12" fill="#c4683d" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="198" cy="165" rx="16" ry="10" fill="#c4683d" stroke="{STROKE}" stroke-width="4"/>
    </svg>''',

    # 14. nest: 密苇丛中的野鸭巢，细软干草编织的温暖圆巢，盛放着两枚莹白温润的野鸭蛋
    "nest": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ns_twigs" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#d6ab67"/>
          <stop offset="65%" stop-color="#9e7333"/>
          <stop offset="100%" stop-color="#593c14"/>
        </radialGradient>
        <radialGradient id="ns_egg" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="70%" stop-color="#e8ede1"/>
          <stop offset="100%" stop-color="#bed1bf"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="90" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 外围交叉伸出的干枝草茎 -->
      <g stroke="{STROKE}" stroke-width="5" stroke-linecap="round">
        <line x1="38" y1="165" x2="68" y2="185"/>
        <line x1="32" y1="185" x2="72" y2="175"/>
        <line x1="185" y1="175" x2="225" y2="185"/>
        <line x1="188" y1="190" x2="218" y2="168"/>
        <line x1="110" y1="215" x2="148" y2="228"/>
      </g>
      <!-- 鸟巢外圈大碗状轮廓 -->
      <path d="M 35,160 C 32,215 224,215 221,160 C 185,178 72,178 35,160 Z" fill="url(#ns_twigs)" stroke="{STROKE}" stroke-width="6.5" stroke-linejoin="round"/>
      <!-- 巢穴内部凹陷柔软羽毛衬垫 -->
      <ellipse cx="128" cy="155" rx="78" ry="32" fill="#4a3116" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="128" cy="158" rx="68" ry="24" fill="#694b28"/>
      <!-- 巢内两枚圆润光滑的野鸭蛋 -->
      <!-- 左蛋 (稍斜卧) -->
      <ellipse cx="108" cy="152" rx="22" ry="28" transform="rotate(-20 108 152)" fill="url(#ns_egg)" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="104" cy="145" rx="6" ry="10" transform="rotate(-20 104 145)" fill="#ffffff" opacity="0.8"/>
      <!-- 右蛋 (依偎) -->
      <ellipse cx="148" cy="154" rx="22" ry="28" transform="rotate(22 148 154)" fill="url(#ns_egg)" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="145" cy="146" rx="6" ry="10" transform="rotate(22 145 146)" fill="#ffffff" opacity="0.8"/>
      <!-- 前沿编结草茎纹理 -->
      <path d="M 45,172 Q 128,198 211,172" fill="none" stroke="#f2cf8a" stroke-width="4" stroke-linecap="round"/>
      <path d="M 62,188 Q 128,212 194,188" fill="none" stroke="#ba893a" stroke-width="4" stroke-linecap="round"/>
    </svg>''',

    # 15. log: 粗大原木断木，厚实开裂的树皮、清晰同心年轮与天然锯痕
    "log": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="lg_bark" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#916038"/>
          <stop offset="60%" stop-color="#69401f"/>
          <stop offset="100%" stop-color="#3d210b"/>
        </radialGradient>
        <radialGradient id="lg_rings" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#e8c792"/>
          <stop offset="70%" stop-color="#c99f65"/>
          <stop offset="100%" stop-color="#8f6530"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="135" cy="216" rx="95" ry="22" fill="#2d1c14" opacity="0.45"/>
      <!-- 圆木横卧躯干 -->
      <path d="M 68,105 L 205,82 C 220,95 220,175 205,188 L 68,210 Z" fill="url(#lg_bark)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 树皮裂纹 -->
      <line x1="95" y1="125" x2="185" y2="110" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="88" y1="165" x2="192" y2="150" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 树干截面 (左端同心年轮) -->
      <ellipse cx="68" cy="158" rx="36" ry="52" fill="url(#lg_rings)" stroke="{STROKE}" stroke-width="6"/>
      <!-- 年轮圈 (同心椭圆) -->
      <ellipse cx="68" cy="158" rx="26" ry="38" fill="none" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="68" cy="158" rx="16" ry="24" fill="none" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="68" cy="158" rx="7" ry="10" fill="{STROKE}"/>
      <!-- 年轮径向干裂缝 -->
      <path d="M 68,158 L 92,142 M 68,158 L 74,195 M 68,158 L 46,165" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
    </svg>''',

    # 16. stone: 坚固打制石块/趁手石器原石，粗糙耐磨的天然矿石质感与高光棱角
    "stone": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="st_body" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#c4baa9"/>
          <stop offset="60%" stop-color="#8a7e6d"/>
          <stop offset="100%" stop-color="#4a4135"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="85" ry="22" fill="#2d1c14" opacity="0.45"/>
      <!-- 坚硬大石块轮廓 -->
      <polygon points="52,175 42,125 85,65 172,58 215,115 208,185 155,212 85,208" fill="url(#st_body)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 敲击解理面与棱角线 -->
      <line x1="85" y1="65" x2="118" y2="135" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="172" y1="58" x2="118" y2="135" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="118" y1="135" x2="155" y2="212" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="118" y1="135" x2="52" y2="175" stroke="{STROKE}" stroke-width="4" stroke-linecap="round"/>
      <line x1="118" y1="135" x2="208" y2="185" stroke="{STROKE}" stroke-width="4" stroke-linecap="round"/>
      <!-- 迎光面高光白纹 -->
      <line x1="90" y1="72" x2="162" y2="66" stroke="#f0ece4" stroke-width="4" stroke-linecap="round"/>
      <!-- 散落的小打制碎石片 -->
      <polygon points="45,208 58,198 66,212 50,218" fill="#7d7263" stroke="{STROKE}" stroke-width="3"/>
    </svg>'''
}

def main():
    print(f"开始渲染自然生态与聚落高频卡牌 (共 {len(SVG_DEFS)} 款)...")
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
            print(f"  [Remastered] -> {key}.png ({png_path})")
            
        browser.close()
    print("16 款自然生态资产全部生成完毕！")

if __name__ == "__main__":
    main()
