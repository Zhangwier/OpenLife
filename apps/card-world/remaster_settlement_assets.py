# -*- coding: utf-8 -*-
"""
Card World - Settlement & Nature Asset Remastering Script
Batch generates hand-drawn high-detail vector art for settlement and natural cards:
deer, boar, clay, flint, basket, bed, hut, granary, kiln, canoe, dock, rack, sandals.
"""

import os
import sys
from playwright.sync_api import sync_playwright

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(CURRENT_DIR, "art", "icons")
SVGS_DIR = os.path.join(CURRENT_DIR, "art", "svgs")
os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(SVGS_DIR, exist_ok=True)

STROKE = "#3a2c20"
STROKE_LIGHT = "rgba(58, 44, 32, 0.45)"

SVG_DEFS = {
    # 1. deer: 梅花鹿，优雅长颈，灵动鹿角，白色梅花斑点，暖栗色
    "deer": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="d_body" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#df9a65"/>
          <stop offset="65%" stop-color="#bf743c"/>
          <stop offset="100%" stop-color="#8f4e22"/>
        </radialGradient>
        <radialGradient id="d_belly" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#fff8ed"/>
          <stop offset="100%" stop-color="#e2cfb4"/>
        </radialGradient>
        <linearGradient id="d_horn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#eae3d2"/>
          <stop offset="70%" stop-color="#ba9c75"/>
          <stop offset="100%" stop-color="#735436"/>
        </linearGradient>
      </defs>
      <!-- 脚底微草 -->
      <path d="M 60,225 C 90,218 170,218 200,225 C 160,230 100,230 60,225 Z" fill="#9dbf73" opacity="0.65" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <!-- 后腿远侧 -->
      <path d="M 170,165 Q 185,185 180,215 L 174,217 L 165,190 Q 160,175 158,168 Z" fill="#9c5a2c" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 前腿远侧 -->
      <path d="M 102,165 Q 98,185 95,215 L 102,216 L 108,188 Q 112,175 114,166 Z" fill="#9c5a2c" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 躯干 -->
      <path d="M 95,130 C 85,145 90,175 115,182 C 145,185 175,178 185,160 C 192,145 190,130 178,122 C 155,116 118,118 95,130 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 腹部与臀部浅色绒毛 -->
      <path d="M 112,165 C 135,176 160,172 175,158 C 172,168 155,178 130,178 C 118,178 112,172 112,165 Z" fill="url(#d_belly)" opacity="0.9"/>
      <path d="M 180,135 Q 192,142 188,155 Q 178,148 180,135 Z" fill="#fff8ed" stroke="{STROKE}" stroke-width="3"/>
      <!-- 俏皮小白尾巴 -->
      <path d="M 185,130 Q 198,125 195,138 Q 188,140 185,130 Z" fill="#fff8ed" stroke="{STROKE}" stroke-width="4"/>
      <!-- 后腿近侧 -->
      <path d="M 152,150 Q 172,162 165,192 Q 163,205 160,222 L 152,223 Q 154,202 152,190 Q 142,175 142,158 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 前腿近侧 -->
      <path d="M 115,152 Q 118,175 116,220 L 124,221 Q 128,182 130,165 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 蹄子 -->
      <path d="M 121,215 L 126,222 L 115,222 Z" fill="{STROKE}"/>
      <path d="M 157,216 L 162,223 L 151,223 Z" fill="{STROKE}"/>
      <!-- 梅花斑点 -->
      <circle cx="132" cy="138" r="3.5" fill="#fffdf5" opacity="0.95"/>
      <circle cx="145" cy="132" r="4" fill="#fffdf5" opacity="0.95"/>
      <circle cx="160" cy="136" r="3.5" fill="#fffdf5" opacity="0.95"/>
      <circle cx="140" cy="148" r="3" fill="#fffdf5" opacity="0.95"/>
      <circle cx="154" cy="146" r="3.5" fill="#fffdf5" opacity="0.95"/>
      <circle cx="168" cy="145" r="3" fill="#fffdf5" opacity="0.95"/>
      <!-- 长颈 -->
      <path d="M 112,142 C 105,125 98,95 86,76 C 96,74 112,82 122,105 C 128,118 130,132 126,145 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 喉颈浅色 -->
      <path d="M 96,82 C 104,95 106,115 105,130 C 100,120 95,98 90,82 Z" fill="url(#d_belly)" opacity="0.85"/>
      <!-- 头部 -->
      <path d="M 88,78 C 80,75 62,72 52,65 C 50,60 56,56 64,56 C 76,56 86,64 92,72 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 鹿下颌浅色 -->
      <path d="M 54,65 C 64,68 76,66 84,72 C 78,74 65,72 54,65 Z" fill="url(#d_belly)"/>
      <!-- 鼻头与眼睛 -->
      <path d="M 51,62 Q 54,64 53,67 Z" fill="{STROKE}"/>
      <ellipse cx="70" cy="62" rx="3.5" ry="4.5" fill="{STROKE}"/>
      <circle cx="69" cy="61" r="1.5" fill="#fff"/>
      <!-- 鹿耳朵 -->
      <path d="M 88,68 Q 104,58 108,46 Q 98,52 86,64 Z" fill="url(#d_body)" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 90,65 Q 101,57 104,49 Q 96,54 88,63 Z" fill="#f7d4c1"/>
      <!-- 壮丽鹿角 -->
      <!-- 远侧主角 -->
      <path d="M 80,56 Q 75,32 70,18 M 74,36 Q 62,30 58,26 M 72,28 Q 78,20 84,16" fill="none" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 80,56 Q 75,32 70,18 M 74,36 Q 62,30 58,26 M 72,28 Q 78,20 84,16" fill="none" stroke="url(#d_horn)" stroke-width="4" stroke-linecap="round"/>
      <!-- 近侧主角 -->
      <path d="M 86,58 Q 92,30 96,14 M 88,42 Q 102,36 110,32 M 92,26 Q 88,18 82,12 M 94,22 Q 104,18 108,12" fill="none" stroke="{STROKE}" stroke-width="8" stroke-linecap="round"/>
      <path d="M 86,58 Q 92,30 96,14 M 88,42 Q 102,36 110,32 M 92,26 Q 88,18 82,12 M 94,22 Q 104,18 108,12" fill="none" stroke="url(#d_horn)" stroke-width="4.5" stroke-linecap="round"/>
    </svg>''',

    # 2. boar: 林地野猪，雄浑厚实，深褐刚毛，外凸利齿獠牙，拱地威慑
    "boar": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="b_body" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#69513e"/>
          <stop offset="60%" stop-color="#4a3628"/>
          <stop offset="100%" stop-color="#2d1f15"/>
        </radialGradient>
        <linearGradient id="b_tusk" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#d4c8b2"/>
          <stop offset="100%" stop-color="#ffffff"/>
        </linearGradient>
      </defs>
      <!-- 脚底微泥土 -->
      <path d="M 45,225 C 80,218 180,218 215,225 C 160,230 90,230 45,225 Z" fill="#694a33" opacity="0.6" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <!-- 远侧后腿 -->
      <path d="M 172,175 L 180,216 L 168,217 L 160,185 Z" fill="#36251b" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 远侧前腿 -->
      <path d="M 98,175 L 94,216 L 82,217 L 86,182 Z" fill="#36251b" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 躯体 (高高耸立的背部驼峰) -->
      <path d="M 68,140 C 60,110 95,85 130,88 C 175,92 205,115 195,155 C 190,182 155,188 115,185 C 80,182 66,165 68,140 Z" fill="url(#b_body)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 背脊刚毛鬃毛 -->
      <path d="M 85,115 Q 80,95 90,92 Q 95,100 102,94 Q 115,80 125,85 Q 135,78 145,86 Q 160,82 170,95 Q 180,98 185,112" fill="none" stroke="#2a1c13" stroke-width="5" stroke-linecap="round"/>
      <path d="M 88,110 Q 95,95 105,92 Q 118,84 130,88 Q 145,82 158,90 Q 172,94 180,108" fill="none" stroke="#8c6d54" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 近侧粗壮后腿 -->
      <path d="M 155,158 Q 180,170 170,222 L 156,223 Q 148,198 142,178 Z" fill="url(#b_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 158,214 L 168,223 L 155,223 Z" fill="{STROKE}"/>
      <!-- 近侧粗壮前腿 -->
      <path d="M 108,162 Q 115,185 110,222 L 98,223 Q 95,195 95,178 Z" fill="url(#b_body)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 100,214 L 110,223 L 97,223 Z" fill="{STROKE}"/>
      <!-- 小蜷曲野猪尾 -->
      <path d="M 195,142 Q 212,145 208,155 Q 202,158 200,150" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <!-- 粗大头颅 -->
      <path d="M 105,118 Q 80,122 56,142 C 45,152 48,168 62,170 C 80,172 105,160 115,145 Z" fill="url(#b_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 拱土扁圆大鼻吻 -->
      <ellipse cx="50" cy="155" rx="10" ry="14" fill="#543e30" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="48" cy="152" rx="2.5" ry="4" fill="{STROKE}"/>
      <ellipse cx="52" cy="155" rx="2.5" ry="4" fill="{STROKE}"/>
      <!-- 锋利白色獠牙 -->
      <path d="M 62,165 Q 60,140 70,132 Q 68,150 72,164 Z" fill="url(#b_tusk)" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- 凶猛小眼与皱纹 -->
      <path d="M 72,130 Q 82,126 90,132" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="82" cy="133" r="3" fill="#e66025"/>
      <circle cx="82" cy="133" r="1.5" fill="{STROKE}"/>
      <!-- 野猪粗耳 -->
      <path d="M 105,118 Q 112,98 120,105 Q 115,122 105,125 Z" fill="url(#b_body)" stroke="{STROKE}" stroke-width="4"/>
    </svg>''',

    # 3. clay: 刚掘出的湿润陶土/黏土块，圆润饱满，手捏压痕，红赭陶泥质感与光泽
    "clay": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cl_grad1" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#df8962"/>
          <stop offset="50%" stop-color="#b85f39"/>
          <stop offset="85%" stop-color="#8a3c1e"/>
          <stop offset="100%" stop-color="#5a220e"/>
        </radialGradient>
        <radialGradient id="cl_grad2" cx="30%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#e89e78"/>
          <stop offset="70%" stop-color="#a65430"/>
          <stop offset="100%" stop-color="#692911"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="95" ry="24" fill="#2d1c14" opacity="0.4"/>
      <!-- 后方次级小泥团 -->
      <path d="M 60,165 C 45,140 70,110 100,118 C 125,125 125,160 105,178 C 85,190 65,185 60,165 Z" fill="url(#cl_grad2)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 155,160 C 145,130 180,105 205,120 C 225,135 220,175 195,185 C 170,195 155,180 155,160 Z" fill="url(#cl_grad2)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 主黏土泥团 -->
      <path d="M 75,175 C 60,135 90,85 135,82 C 185,80 210,120 200,165 C 192,205 150,215 115,212 C 85,210 75,195 75,175 Z" fill="url(#cl_grad1)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 捏泥按压凹槽与起伏层叠 -->
      <path d="M 105,115 C 120,108 148,112 165,125 C 150,135 125,130 105,115 Z" fill="#8f3e1f" opacity="0.7"/>
      <path d="M 90,150 C 110,140 145,145 160,165 C 140,178 110,175 90,150 Z" fill="#692911" opacity="0.65"/>
      <!-- 湿润高光 -->
      <path d="M 115,95 Q 138,90 155,100" fill="none" stroke="#ffd2bc" stroke-width="4.5" stroke-linecap="round" opacity="0.85"/>
      <circle cx="108" cy="125" r="4" fill="#ffe3d4" opacity="0.9"/>
      <circle cx="168" cy="148" r="3.5" fill="#ffe3d4" opacity="0.8"/>
      <!-- 散落的小湿泥屑 -->
      <circle cx="48" cy="202" r="7" fill="url(#cl_grad2)" stroke="{STROKE}" stroke-width="3.5"/>
      <circle cx="215" cy="198" r="6" fill="url(#cl_grad2)" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 4. flint: 坚硬燧石/黑曜石，贝壳状锐利断口，玄青深灰矿石光泽，棱角分明，击打火花
    "flint": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="fl_base" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#5a6875"/>
          <stop offset="50%" stop-color="#343d46"/>
          <stop offset="90%" stop-color="#1f242a"/>
          <stop offset="100%" stop-color="#121518"/>
        </radialGradient>
        <linearGradient id="fl_facet1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7e91a0"/>
          <stop offset="100%" stop-color="#3b4854"/>
        </linearGradient>
        <linearGradient id="fl_facet2" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#465460"/>
          <stop offset="100%" stop-color="#21272c"/>
        </linearGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="216" rx="85" ry="22" fill="#1b2126" opacity="0.45"/>
      <!-- 燧石整体大轮廓 -->
      <path d="M 65,175 L 45,120 L 92,55 L 175,48 L 215,105 L 205,178 L 140,212 L 85,205 Z" fill="url(#fl_base)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 锋利的贝壳状剥离多面晶格 -->
      <!-- 面 1: 顶部迎光面 -->
      <polygon points="92,55 175,48 152,105 108,102" fill="url(#fl_facet1)" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 面 2: 左侧锋刃斜面 -->
      <polygon points="45,120 92,55 108,102 78,145" fill="url(#fl_facet2)" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 面 3: 中心主断裂槽 -->
      <polygon points="108,102 152,105 178,155 125,170 78,145" fill="url(#fl_base)" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 面 4: 右侧暗背光面 -->
      <polygon points="175,48 215,105 205,178 178,155 152,105" fill="#1e252a" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 面 5: 底部基岩沉降面 -->
      <polygon points="78,145 125,170 140,212 85,205 65,175" fill="#252c33" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="125,170 178,155 205,178 140,212" fill="#181d22" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 锋利棱角高光白线 -->
      <line x1="92" y1="55" x2="108" y2="102" stroke="#b6cacf" stroke-width="3" stroke-linecap="round"/>
      <line x1="108" y1="102" x2="152" y2="105" stroke="#b6cacf" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="152" y1="105" x2="178" y2="155" stroke="#9bb1b8" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 碰击溅出的闪亮金黄火星 -->
      <path d="M 45,95 Q 40,85 30,80 Q 40,82 48,70 Q 46,80 55,85 Q 46,87 45,95 Z" fill="#ffd438" stroke="{STROKE}" stroke-width="1.5"/>
      <circle cx="28" cy="102" r="2.5" fill="#ffec73"/>
      <circle cx="38" cy="62" r="2" fill="#ff7824"/>
    </svg>''',

    # 5. basket: 编织竹篮/柳条筐，扎实的交错编织纹，粗实提手，盛满野果与青叶
    "basket": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="bs_body" cx="40%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#dfb77e"/>
          <stop offset="70%" stop-color="#b6894c"/>
          <stop offset="100%" stop-color="#7c5525"/>
        </radialGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="222" rx="75" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 拱形坚固提梁 (后半段) -->
      <path d="M 68,135 C 68,40 188,40 188,135" fill="none" stroke="{STROKE}" stroke-width="14" stroke-linecap="round"/>
      <path d="M 68,135 C 68,40 188,40 188,135" fill="none" stroke="#9e7239" stroke-width="7" stroke-linecap="round"/>
      <!-- 篮内盛装物: 几抹清新的绿叶与红果 -->
      <ellipse cx="128" cy="130" rx="65" ry="22" fill="#4a3118"/>
      <!-- 绿叶 -->
      <path d="M 95,128 C 80,115 90,95 110,105 C 108,120 95,128 95,128 Z" fill="#6da848" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 145,125 C 165,110 175,125 160,135 C 150,135 145,125 145,125 Z" fill="#8bc34a" stroke="{STROKE}" stroke-width="3"/>
      <!-- 红果 -->
      <circle cx="115" cy="120" r="9" fill="#d94141" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="132" cy="115" r="10" fill="#bf2626" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="145" cy="124" r="8" fill="#e85858" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="113" cy="118" r="2.5" fill="#fff" opacity="0.8"/>
      <circle cx="130" cy="113" r="2.8" fill="#fff" opacity="0.8"/>
      <!-- 篮身外廓 -->
      <path d="M 52,130 C 56,175 75,212 105,215 L 151,215 C 181,212 200,175 204,130 C 204,118 52,118 52,130 Z" fill="url(#bs_body)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 篮口加固厚圈 -->
      <ellipse cx="128" cy="128" rx="76" ry="14" fill="none" stroke="{STROKE}" stroke-width="6"/>
      <ellipse cx="128" cy="128" rx="74" ry="12" fill="none" stroke="#dfb77e" stroke-width="4"/>
      <!-- 柳条纵横编织纹理 (多层交错) -->
      <path d="M 62,150 Q 128,168 194,150 M 68,172 Q 128,190 188,172 M 82,194 Q 128,208 174,194" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 62,148 Q 128,166 194,148 M 68,170 Q 128,188 188,170 M 82,192 Q 128,206 174,192" fill="none" stroke="#f0cf9c" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 纵向交错条索 -->
      <line x1="88" y1="130" x2="102" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="112" y1="132" x2="118" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="144" y1="132" x2="138" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="168" y1="130" x2="154" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 提梁前半段缠绳细节 -->
      <path d="M 115,50 L 125,58 M 128,48 L 138,56 M 140,52 L 150,60" stroke="#f6ebd9" stroke-width="3.5" stroke-linecap="round"/>
    </svg>''',

    # 6. bed: 原木草铺兽皮床，紧扎原木腿架，金黄蓬松干草铺底，厚实斑纹暖色兽皮毛毯
    "bed": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="bd_wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#8a5a36"/>
          <stop offset="50%" stop-color="#5a341a"/>
          <stop offset="100%" stop-color="#3d210e"/>
        </linearGradient>
        <radialGradient id="bd_fur" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#d49255"/>
          <stop offset="70%" stop-color="#a6632c"/>
          <stop offset="100%" stop-color="#693712"/>
        </radialGradient>
      </defs>
      <!-- 地面阴影 -->
      <ellipse cx="128" cy="222" rx="98" ry="22" fill="#2d1c14" opacity="0.4"/>
      <!-- 后方床腿 -->
      <rect x="52" y="145" width="14" height="45" rx="4" fill="#3d210e" stroke="{STROKE}" stroke-width="4.5"/>
      <rect x="190" y="130" width="14" height="45" rx="4" fill="#3d210e" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 粗原木床侧框架 -->
      <polygon points="40,150 205,130 220,150 55,175" fill="url(#bd_wood)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 铺底干草层 (金黄蓬松带毛刺) -->
      <path d="M 45,148 C 50,135 195,115 210,128 C 220,135 220,155 205,160 C 180,165 60,178 45,170 C 38,162 40,152 45,148 Z" fill="#e5b85d" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 干草细茎纹理 -->
      <path d="M 42,160 L 32,156 M 46,168 L 36,172 M 52,174 L 46,182 M 205,145 L 216,140 M 212,152 L 222,155" stroke="#be8e32" stroke-width="3" stroke-linecap="round"/>
      <!-- 厚实保暖的大兽皮被褥 -->
      <path d="M 65,138 C 75,122 170,110 190,122 C 205,130 195,168 175,175 C 130,185 80,180 65,168 C 58,155 60,145 65,138 Z" fill="url(#bd_fur)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 兽皮边缘白色毛绒包边 -->
      <path d="M 65,168 Q 120,182 175,175" fill="none" stroke="#fff5e4" stroke-width="6" stroke-linecap="round"/>
      <path d="M 65,168 Q 120,182 175,175" fill="none" stroke="{STROKE}" stroke-width="2" stroke-dasharray="4 6"/>
      <!-- 兽皮折痕与斑纹 -->
      <path d="M 90,142 Q 130,152 165,140" fill="none" stroke="#522709" stroke-width="3.5" stroke-linecap="round" opacity="0.6"/>
      <path d="M 105,158 Q 135,165 155,158" fill="none" stroke="#522709" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <!-- 兽皮上的野性黑斑 -->
      <ellipse cx="110" cy="142" rx="6" ry="4" fill="#3b1b06" opacity="0.75"/>
      <ellipse cx="145" cy="136" rx="7" ry="4.5" fill="#3b1b06" opacity="0.75"/>
      <ellipse cx="130" cy="155" rx="6.5" ry="4" fill="#3b1b06" opacity="0.75"/>
      <!-- 柔软兽皮卷枕 -->
      <ellipse cx="80" cy="135" rx="22" ry="12" fill="#edd4b4" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="70" cy="135" rx="6" ry="10" fill="#c9a881" stroke="{STROKE}" stroke-width="3"/>
      <!-- 前方床腿 -->
      <rect x="52" y="170" width="16" height="48" rx="4" fill="url(#bd_wood)" stroke="{STROKE}" stroke-width="5"/>
      <rect x="185" y="155" width="16" height="48" rx="4" fill="url(#bd_wood)" stroke="{STROKE}" stroke-width="5"/>
    </svg>''',

    # 7. hut: 茅草石屋/先民草棚，圆润石砌基座，金黄重叠茅草尖顶，挑檐木桩，内透暖橘篝火
    "hut": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="ht_thatch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fae398"/>
          <stop offset="60%" stop-color="#d4a84d"/>
          <stop offset="100%" stop-color="#997022"/>
        </linearGradient>
        <radialGradient id="ht_wall" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#b09b82"/>
          <stop offset="80%" stop-color="#7d6c56"/>
          <stop offset="100%" stop-color="#4d4132"/>
        </radialGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="225" rx="85" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 圆弧矮石墙 -->
      <path d="M 60,150 L 52,212 C 52,220 204,220 204,212 L 196,150 Z" fill="url(#ht_wall)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 石块拼缝 -->
      <path d="M 60,185 Q 128,195 196,185" fill="none" stroke="{STROKE}" stroke-width="4"/>
      <line x1="95" y1="152" x2="92" y2="185" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="165" y1="152" x2="168" y2="185" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="128" y1="186" x2="128" y2="216" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 拱形木门与室内温暖橘光 -->
      <path d="M 110,216 L 110,172 C 110,160 146,160 146,172 L 146,216 Z" fill="#2b180d" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M 115,214 L 115,176 C 115,166 141,166 141,176 L 141,214 Z" fill="#f58e2a" opacity="0.9"/>
      <ellipse cx="128" cy="188" rx="8" ry="12" fill="#fff4a3" opacity="0.95"/>
      <!-- 两侧支撑木柱 -->
      <line x1="58" y1="145" x2="54" y2="216" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <line x1="198" y1="145" x2="202" y2="216" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <!-- 厚实多层茅草尖屋顶 -->
      <!-- 下层大茅草顶 -->
      <path d="M 32,156 Q 128,140 224,156 L 195,108 Q 128,95 61,108 Z" fill="url(#ht_thatch)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 下檐茅草锯齿流苏 -->
      <path d="M 32,156 L 40,166 L 52,154 L 64,166 L 78,154 L 92,166 L 108,153 L 124,166 L 140,154 L 156,166 L 172,154 L 188,166 L 202,154 L 214,166 L 224,156" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 上层尖顶茅草 -->
      <path d="M 52,115 Q 128,102 204,115 L 128,42 Z" fill="url(#ht_thatch)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 茅草上檐锯齿流苏 -->
      <path d="M 52,115 L 64,124 L 78,113 L 94,124 L 112,112 L 128,124 L 146,112 L 164,124 L 182,113 L 196,124 L 204,115" fill="none" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <!-- 顶冠捆扎压顶木 -->
      <line x1="110" y1="38" x2="146" y2="52" stroke="#66441e" stroke-width="7" stroke-linecap="round"/>
      <line x1="146" y1="38" x2="110" y2="52" stroke="#66441e" stroke-width="7" stroke-linecap="round"/>
      <line x1="110" y1="38" x2="146" y2="52" stroke="{STROKE}" stroke-width="2"/>
      <line x1="146" y1="38" x2="110" y2="52" stroke="{STROKE}" stroke-width="2"/>
    </svg>''',

    # 8. granary: 高架防潮粮仓，四根粗桩底柱带防鼠圆盘，编制木篱仓壁，双坡茅草顶，小木梯
    "granary": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="gr_thatch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fae398"/>
          <stop offset="70%" stop-color="#cf9f3e"/>
          <stop offset="100%" stop-color="#8a5f1a"/>
        </linearGradient>
        <linearGradient id="gr_wall" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ba8e59"/>
          <stop offset="50%" stop-color="#dfb77e"/>
          <stop offset="100%" stop-color="#8f6432"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="85" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 四根高架柱脚与防鼠盘 (Rat-guard) -->
      <!-- 后两柱 -->
      <rect x="75" y="160" width="10" height="55" fill="#4d3016" stroke="{STROKE}" stroke-width="3.5"/>
      <rect x="170" y="160" width="10" height="55" fill="#4d3016" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 前左柱 -->
      <rect x="62" y="155" width="14" height="65" rx="3" fill="#69411e" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="69" cy="180" rx="14" ry="5" fill="#45270e" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 前右柱 -->
      <rect x="180" y="155" width="14" height="65" rx="3" fill="#69411e" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="187" cy="180" rx="14" ry="5" fill="#45270e" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 悬空大木平台托梁 -->
      <polygon points="46,162 210,162 216,148 40,148" fill="#543317" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 仓房主箱体 -->
      <rect x="52" y="98" width="152" height="52" fill="url(#gr_wall)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 编织板壁木栅纹 -->
      <line x1="52" y1="115" x2="204" y2="115" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="52" y1="132" x2="204" y2="132" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="88" y1="98" x2="88" y2="150" stroke="{STROKE}" stroke-width="3"/>
      <line x1="128" y1="98" x2="128" y2="150" stroke="{STROKE}" stroke-width="3"/>
      <line x1="168" y1="98" x2="168" y2="150" stroke="{STROKE}" stroke-width="3"/>
      <!-- 仓板中心小通风窗口与满溢金黄谷穗 -->
      <rect x="114" y="108" width="28" height="26" fill="#301c0d" stroke="{STROKE}" stroke-width="3.5"/>
      <circle cx="128" cy="120" r="7" fill="#fcd34d"/>
      <circle cx="124" cy="122" r="5" fill="#eaad1a"/>
      <!-- 巨大的双坡厚茅草防雨大屋顶 -->
      <polygon points="128,32 228,102 218,108 128,52 38,108 28,102" fill="url(#gr_thatch)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 茅草屋檐流苏 -->
      <path d="M 28,102 L 36,112 L 48,102 L 60,112 L 74,102 L 90,112 L 108,102 L 128,114 L 148,102 L 166,112 L 182,102 L 198,112 L 212,102 L 222,112 L 228,102" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 屋脊横梁压木 -->
      <line x1="112" y1="30" x2="144" y2="30" stroke="#543317" stroke-width="8" stroke-linecap="round"/>
      <!-- 靠在仓门前的小木梯 -->
      <line x1="135" y1="148" x2="148" y2="220" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <line x1="150" y1="148" x2="163" y2="220" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <line x1="138" y1="165" x2="153" y2="165" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="142" y1="184" x2="157" y2="184" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="146" y1="203" x2="161" y2="203" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 9. kiln: 圆拱红砖陶窑，窑口炽烈喷薄的金橙火光，窑体烘烤深红焦痕，顶部灰青热浪气流
    "kiln": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="kl_wall" cx="40%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#c96a4b"/>
          <stop offset="50%" stop-color="#9e472a"/>
          <stop offset="85%" stop-color="#692b16"/>
          <stop offset="100%" stop-color="#3d1508"/>
        </radialGradient>
        <radialGradient id="kl_fire" cx="50%" cy="65%" r="60%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="30%" stop-color="#ffea6c"/>
          <stop offset="70%" stop-color="#ff7b1a"/>
          <stop offset="100%" stop-color="#bd2c00"/>
        </radialGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="225" rx="88" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 顶部出烟口的袅袅热气青烟 -->
      <path d="M 124,52 C 115,35 135,25 125,12" fill="none" stroke="#cfc5b8" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
      <path d="M 134,50 C 145,38 135,28 142,15" fill="none" stroke="#cfc5b8" stroke-width="3.5" stroke-linecap="round" opacity="0.45"/>
      <!-- 拱形陶窑大穹顶 -->
      <path d="M 45,215 C 40,135 72,62 128,60 C 184,62 216,135 211,215 Z" fill="url(#kl_wall)" stroke="{STROKE}" stroke-width="6.5" stroke-linejoin="round"/>
      <!-- 顶部出烟口砌环 -->
      <ellipse cx="128" cy="62" rx="22" ry="7" fill="#4d1b0d" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="128" cy="62" rx="15" ry="4" fill="#1b0803"/>
      <!-- 环形耐火砖砌筑缝线与高温斑块 -->
      <path d="M 58,160 Q 128,172 198,160" fill="none" stroke="{STROKE}" stroke-width="4"/>
      <path d="M 72,118 Q 128,128 184,118" fill="none" stroke="{STROKE}" stroke-width="4"/>
      <!-- 纵向交错砖纹 -->
      <line x1="100" y1="120" x2="96" y2="162" stroke="{STROKE}" stroke-width="3"/>
      <line x1="156" y1="120" x2="160" y2="162" stroke="{STROKE}" stroke-width="3"/>
      <line x1="128" y1="70" x2="128" y2="120" stroke="{STROKE}" stroke-width="3"/>
      <line x1="75" y1="162" x2="72" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="181" y1="162" x2="184" y2="215" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 窑口大拱门 (外拱圈) -->
      <path d="M 85,216 C 85,148 171,148 171,216 Z" fill="#2d0d04" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 窑膛内部炽热烈火 -->
      <path d="M 92,216 C 92,158 164,158 164,216 Z" fill="url(#kl_fire)"/>
      <!-- 火焰内舌跳动 -->
      <path d="M 110,216 Q 120,175 128,168 Q 138,180 146,216 Z" fill="#ffffff" opacity="0.95"/>
      <path d="M 120,216 Q 128,185 136,216 Z" fill="#fffcda"/>
      <!-- 炉前红炽散落的炭块与陶片 -->
      <circle cx="70" cy="222" r="4.5" fill="#e84c17" stroke="{STROKE}" stroke-width="2"/>
      <circle cx="188" cy="224" r="5" fill="#b03b12" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 10. canoe: 凿制独木舟，流线型木纹舟身，轻盈首尾，舟内横搁精巧木桨，碧水涟漪
    "canoe": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cn_wood_out" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#b67a4c"/>
          <stop offset="60%" stop-color="#804e29"/>
          <stop offset="100%" stop-color="#4e2b11"/>
        </radialGradient>
        <linearGradient id="cn_wood_in" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#452711"/>
          <stop offset="100%" stop-color="#693e1f"/>
        </linearGradient>
      </defs>
      <!-- 清澈碧蓝水波倒影与水纹 -->
      <ellipse cx="128" cy="188" rx="100" ry="24" fill="#589ea6" opacity="0.35"/>
      <path d="M 22,185 C 60,195 196,195 234,185" fill="none" stroke="#77bec7" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 45,200 C 85,208 170,208 210,200" fill="none" stroke="#77bec7" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
      <!-- 独木舟外侧船壳 -->
      <path d="M 22,125 C 50,175 206,175 234,125 C 200,165 56,165 22,125 Z" fill="url(#cn_wood_out)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 舟舱内部凹陷 -->
      <path d="M 22,125 C 60,145 196,145 234,125 C 196,112 60,112 22,125 Z" fill="url(#cn_wood_in)" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 船沿加固厚边框 -->
      <path d="M 22,125 C 60,145 196,145 234,125" fill="none" stroke="#dfb282" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 船舱横向支撑木档 -->
      <rect x="85" y="125" width="8" height="15" rx="2" fill="#8f572e" stroke="{STROKE}" stroke-width="3"/>
      <rect x="163" y="125" width="8" height="15" rx="2" fill="#8f572e" stroke="{STROKE}" stroke-width="3"/>
      <!-- 船舱中横置的一柄轻盈木桨 (Paddle) -->
      <line x1="68" y1="85" x2="185" y2="162" stroke="{STROKE}" stroke-width="6" stroke-linecap="round"/>
      <line x1="68" y1="85" x2="185" y2="162" stroke="#d6a674" stroke-width="3" stroke-linecap="round"/>
      <!-- 桨叶 (左上宽扁卵形) -->
      <path d="M 68,85 C 52,74 58,58 75,68 C 88,78 78,92 68,85 Z" fill="#b87b46" stroke="{STROKE}" stroke-width="4" stroke-linejoin="round"/>
      <line x1="65" y1="72" x2="76" y2="82" stroke="#f6ebd9" stroke-width="2"/>
      <!-- 桨柄末端抓握小把手 -->
      <rect x="180" y="158" width="12" height="6" rx="2" transform="rotate(33 186 161)" fill="#7a471f" stroke="{STROKE}" stroke-width="2.5"/>
    </svg>''',

    # 11. dock: 原木栈桥码头，粗壮木桩打入水中，系缆桩与盘绕粗麻绳，清澈拍岸浪花
    "dock": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="dk_wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#aa794c"/>
          <stop offset="60%" stop-color="#7a4e28"/>
          <stop offset="100%" stop-color="#4a2c11"/>
        </linearGradient>
      </defs>
      <!-- 栈桥下方清澈江水波纹 -->
      <ellipse cx="128" cy="200" rx="98" ry="30" fill="#4d8c94" opacity="0.5"/>
      <path d="M 30,210 Q 75,220 120,212 Q 180,225 226,208" fill="none" stroke="#8fd6de" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 45,190 Q 85,200 135,192 Q 185,202 215,192" fill="none" stroke="#8fd6de" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 浸入水中的粗大立桩 (4根) -->
      <!-- 后排立桩 -->
      <rect x="58" y="118" width="16" height="85" rx="3" fill="#3b200b" stroke="{STROKE}" stroke-width="4"/>
      <rect x="182" y="105" width="16" height="85" rx="3" fill="#3b200b" stroke="{STROKE}" stroke-width="4"/>
      <!-- 前排两根大主柱 -->
      <rect x="42" y="132" width="22" height="88" rx="4" fill="url(#dk_wood)" stroke="{STROKE}" stroke-width="5.5"/>
      <rect x="192" y="118" width="22" height="88" rx="4" fill="url(#dk_wood)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 水线浸湿深色渐变 -->
      <rect x="42" y="185" width="22" height="35" rx="2" fill="#201105" opacity="0.6"/>
      <rect x="192" y="172" width="22" height="34" rx="2" fill="#201105" opacity="0.6"/>
      <!-- 延伸木质栈桥桥面板 (透视斜面) -->
      <polygon points="30,138 185,95 228,122 75,165" fill="url(#dk_wood)" stroke="{STROKE}" stroke-width="6" stroke-linejoin="round"/>
      <!-- 栈板横木条缝隙 -->
      <line x1="52" y1="132" x2="95" y2="160" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="78" y1="125" x2="121" y2="153" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="105" y1="118" x2="148" y2="146" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="132" y1="110" x2="175" y2="138" stroke="{STROKE}" stroke-width="3.5"/>
      <line x1="158" y1="103" x2="201" y2="131" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 前侧系缆桩与粗麻绳圈 (Mooring post) -->
      <rect x="46" y="105" width="16" height="38" rx="3" fill="#69411d" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="54" cy="105" rx="8" ry="4" fill="#a16b39" stroke="{STROKE}" stroke-width="3"/>
      <!-- 盘绕系缆粗麻绳 -->
      <ellipse cx="54" cy="122" rx="13" ry="6" fill="none" stroke="{STROKE}" stroke-width="6"/>
      <ellipse cx="54" cy="122" rx="13" ry="6" fill="none" stroke="#e8c892" stroke-width="3.5"/>
      <!-- 垂入水中的绳头 -->
      <path d="M 65,124 Q 72,142 66,160" fill="none" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <path d="M 65,124 Q 72,142 66,160" fill="none" stroke="#e8c892" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 水花拍击白浪 -->
      <path d="M 34,215 Q 44,208 54,217" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      <path d="M 185,200 Q 195,192 205,202" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
    </svg>''',

    # 12. rack: 木构风干晾架，交叉绑扎三脚架，悬挂数条银白风干鱼与腊肉条
    "rack": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <linearGradient id="rk_wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#966940"/>
          <stop offset="100%" stop-color="#54371b"/>
        </linearGradient>
      </defs>
      <!-- 投影 -->
      <ellipse cx="128" cy="225" rx="88" ry="16" fill="#2d1c14" opacity="0.45"/>
      <!-- 左右交叉木脚架 (A-frame) -->
      <!-- 左 A 架后腿 -->
      <line x1="68" y1="62" x2="42" y2="218" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="68" y1="62" x2="42" y2="218" stroke="url(#rk_wood)" stroke-width="5" stroke-linecap="round"/>
      <!-- 右 A 架后腿 -->
      <line x1="188" y1="62" x2="162" y2="218" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="188" y1="62" x2="162" y2="218" stroke="url(#rk_wood)" stroke-width="5" stroke-linecap="round"/>
      <!-- 横置的长顶晾杆 -->
      <line x1="38" y1="72" x2="218" y2="72" stroke="{STROKE}" stroke-width="10" stroke-linecap="round"/>
      <line x1="38" y1="72" x2="218" y2="72" stroke="#b08151" stroke-width="5.5" stroke-linecap="round"/>
      <!-- 左 A 架前腿 -->
      <line x1="60" y1="62" x2="86" y2="218" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="60" y1="62" x2="86" y2="218" stroke="url(#rk_wood)" stroke-width="5" stroke-linecap="round"/>
      <!-- 右 A 架前腿 -->
      <line x1="180" y1="62" x2="206" y2="218" stroke="{STROKE}" stroke-width="9" stroke-linecap="round"/>
      <line x1="180" y1="62" x2="206" y2="218" stroke="url(#rk_wood)" stroke-width="5" stroke-linecap="round"/>
      <!-- 交叉处麻绳捆扎圈 -->
      <ellipse cx="64" cy="68" rx="8" ry="8" fill="#e2c490" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="184" cy="68" rx="8" ry="8" fill="#e2c490" stroke="{STROKE}" stroke-width="3"/>
      <!-- 悬挂的晾晒食品 -->
      <!-- 1. 吊挂腊肉条 -->
      <line x1="88" y1="74" x2="88" y2="92" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 82,92 C 82,92 94,92 94,92 C 96,120 96,155 88,162 C 80,155 80,120 82,92 Z" fill="#992b24" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M 85,102 Q 88,135 91,152" stroke="#df7c70" stroke-width="3" stroke-linecap="round"/>
      <!-- 2. 吊挂银光风干鱼 1 -->
      <line x1="116" y1="74" x2="116" y2="95" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 116,95 C 104,115 106,145 116,165 C 126,145 128,115 116,95 Z" fill="#b0c8d1" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 鱼尾巴 -->
      <polygon points="116,164 108,178 124,178" fill="#7a97a3" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="116" cy="105" r="2.5" fill="{STROKE}"/>
      <!-- 3. 吊挂银光风干鱼 2 (稍高) -->
      <line x1="144" y1="74" x2="144" y2="88" stroke="{STROKE}" stroke-width="3"/>
      <path d="M 144,88 C 132,108 134,136 144,154 C 154,136 156,108 144,88 Z" fill="#cfdee3" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <polygon points="144,153 136,166 152,166" fill="#7a97a3" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <circle cx="144" cy="98" r="2.5" fill="{STROKE}"/>
      <!-- 4. 香草串/蒜串 -->
      <line x1="168" y1="74" x2="168" y2="96" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="168" cy="102" r="7" fill="#eed9be" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="168" cy="116" r="7.5" fill="#f5e6d3" stroke="{STROKE}" stroke-width="3"/>
      <circle cx="168" cy="130" r="7" fill="#e0caa8" stroke="{STROKE}" stroke-width="3"/>
    </svg>''',

    # 13. sandals: 手编蒲草草鞋，经纬人字交错厚草底，柔韧绑腿麻绳系带，质朴自然
    "sandals": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="sd_straw" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#fae2a0"/>
          <stop offset="65%" stop-color="#ce9f4d"/>
          <stop offset="100%" stop-color="#8f6320"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="88" ry="18" fill="#2d1c14" opacity="0.45"/>
      <!-- 左草鞋 (稍侧倾) -->
      <!-- 鞋底轮廓 -->
      <path d="M 75,70 C 95,70 106,95 104,130 C 102,160 108,185 95,208 C 82,216 68,216 58,205 C 46,182 50,155 52,125 C 54,95 62,70 75,70 Z" fill="url(#sd_straw)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 鞋面人字编织条纹 -->
      <path d="M 58,95 Q 76,105 98,95 M 56,120 Q 76,132 100,120 M 54,145 Q 76,158 100,145 M 56,170 Q 76,182 98,170 M 60,192 Q 76,202 92,192" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 绑带与鼻梁鼻绳 (Toe strap) -->
      <path d="M 75,85 L 75,108 M 75,108 L 56,125 M 75,108 L 98,125" fill="none" stroke="#543719" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 75,85 L 75,108 M 75,108 L 56,125 M 75,108 L 98,125" fill="none" stroke="#f6eccd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="75" cy="86" r="4.5" fill="#543719" stroke="{STROKE}" stroke-width="2"/>

      <!-- 右草鞋 -->
      <!-- 鞋底轮廓 -->
      <path d="M 181,70 C 194,70 202,95 204,125 C 206,155 210,182 198,205 C 188,216 174,216 161,208 C 148,185 154,160 152,130 C 150,95 161,70 181,70 Z" fill="url(#sd_straw)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 鞋面人字编织条纹 -->
      <path d="M 158,95 Q 180,105 198,95 M 156,120 Q 180,132 200,120 M 156,145 Q 180,158 202,145 M 158,170 Q 180,182 200,170 M 164,192 Q 180,202 196,192" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 绑带与鼻梁鼻绳 -->
      <path d="M 181,85 L 181,108 M 181,108 L 158,125 M 181,108 L 200,125" fill="none" stroke="#543719" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 181,85 L 181,108 M 181,108 L 158,125 M 181,108 L 200,125" fill="none" stroke="#f6eccd" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="181" cy="86" r="4.5" fill="#543719" stroke="{STROKE}" stroke-width="2"/>
      <!-- 缠绕脚踝的修长麻绳带 -->
      <path d="M 58,155 C 38,135 60,110 80,125 C 110,145 130,120 155,145" fill="none" stroke="#543719" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 58,155 C 38,135 60,110 80,125 C 110,145 130,120 155,145" fill="none" stroke="#f6eccd" stroke-width="2" stroke-linecap="round"/>
    </svg>'''
}

def main():
    print(f"开始重塑第二批聚落与自然核心资产 (共 {len(SVG_DEFS)} 款)...")
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
    print("第二批 13 款资产全部重构优化完毕！")

if __name__ == "__main__":
    main()
