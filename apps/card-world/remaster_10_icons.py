# -*- coding: utf-8 -*-
"""
Remaster 10 inconsistent icons for Card World:
1. muck: 饱满堆起的深褐色有机沤肥堆，四周有压实河石与堆肥木护栏
2. compost: 堆着碎烂草叶、落叶和肥土的圆石围砌堆肥大坑
3. torch: 粗壮结实开裂松木火把，麻绳捆扎，熊熊烈火
4. jar: 完好仰韶红陶双耳大肚罐，典雅绳纹与弦纹
5. you: 16岁少年主角半身像，朴素蓝灰麻短衣，草绳束发，眼神明亮
6. aunt: 陶婶半身像，五十岁慈祥妇人，盘发木簪，赭红麻衣，捧红陶碗
7. yu: 阿三半身像，二十多岁精壮农夫，头上缠草绳，绿褐短衣，肩扛石锄
8. cook: 阿苇半身像，清瘦文静女子，发别芦叶，怀抱一捆新鲜芦苇
9. digger: 阿砺半身像，孔武有力的壮年石匠，古铜肤色带石粉，手托打制石斧坯
10. boatman: 阿罟半身像，老渔夫，头戴草笠，银须矍铄，青灰短衣，肩搭渔网与陶坠
"""

import os
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(BASE_DIR, "art", "icons")
SVGS_DIR = os.path.join(BASE_DIR, "art", "svgs")

STROKE = "#3a2c20"

REMASTERED_SVGS = {
    # 1. muck: 饱满堆起的深褐色有机沤肥堆，四周有压实河石与堆肥木护栏（占满 80% 画面）
    "muck": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="mk_heap" cx="38%" cy="32%" r="68%">
          <stop offset="0%" stop-color="#7a5a3a"/>
          <stop offset="50%" stop-color="#543c24"/>
          <stop offset="85%" stop-color="#382514"/>
          <stop offset="100%" stop-color="#24160a"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="95" ry="20" fill="#2d1c14" opacity="0.45"/>
      <!-- 底层固定沤肥堆的粗糙木桩护栏 -->
      <path d="M 42,210 L 46,160 L 58,160 L 54,212 Z" fill="#6d4826" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M 200,210 L 196,160 L 208,160 L 212,212 Z" fill="#6d4826" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M 38,185 Q 128,205 218,185" fill="none" stroke="#543418" stroke-width="6" stroke-linecap="round"/>
      <!-- 饱满隆起的高耸有机沤肥堆主体（高度从 65 到 214，占据画面80%） -->
      <path d="M 48,208 C 42,165 65,92 110,72 C 145,58 190,88 206,145 C 215,182 198,208 178,214 C 138,218 85,218 48,208 Z" fill="url(#mk_heap)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 肥堆起伏泥层与混杂的发酵深草 -->
      <path d="M 75,135 C 98,118 142,125 168,148 C 140,165 98,160 75,135 Z" fill="#442e1a" stroke="{STROKE}" stroke-width="3.5" opacity="0.8"/>
      <path d="M 98,88 C 122,80 155,88 168,108 C 148,115 120,112 98,88 Z" fill="#63452b" opacity="0.85"/>
      <!-- 混杂其间的发酵草茎与枯黄碎叶 -->
      <path d="M 92,105 Q 112,120 102,142" fill="none" stroke="#6f8a42" stroke-width="3" stroke-linecap="round"/>
      <path d="M 148,98 Q 162,118 152,138" fill="none" stroke="#7a9648" stroke-width="3" stroke-linecap="round"/>
      <path d="M 125,148 Q 145,162 135,185" fill="none" stroke="#6f8a42" stroke-width="3" stroke-linecap="round"/>
      <!-- 发酵产生的微弱温热气雾线 -->
      <path d="M 105,62 C 98,48 108,36 102,24" fill="none" stroke="#c2b6a4" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
      <path d="M 135,55 C 128,42 138,30 132,18" fill="none" stroke="#c2b6a4" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>
      <path d="M 162,65 C 156,52 165,40 159,28" fill="none" stroke="#c2b6a4" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
      <!-- 底部压堆的大石块 -->
      <ellipse cx="62" cy="208" rx="16" ry="10" fill="#9e9384" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="188" cy="210" rx="18" ry="11" fill="#8a8072" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="128" cy="214" rx="14" ry="8" fill="#9e9384" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 2. compost: 堆着碎烂草叶、落叶和肥土的圆石围砌堆肥大坑（占满 80% 画面）
    "compost": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="cp_pit" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#5e7a3a"/>
          <stop offset="45%" stop-color="#465e28"/>
          <stop offset="80%" stop-color="#343e1c"/>
          <stop offset="100%" stop-color="#242812"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="98" ry="22" fill="#2d1c14" opacity="0.45"/>
      <!-- 堆肥坑基底黄土坎 -->
      <ellipse cx="128" cy="155" rx="96" ry="58" fill="#8c6238" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 坑内层叠发酵深厚的碎烂草料与肥土核心 -->
      <ellipse cx="128" cy="150" rx="84" ry="48" fill="url(#cp_pit)" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 堆积的烂草与枝叶层 -->
      <path d="M 72,145 C 92,125 132,130 152,148 C 132,160 92,158 72,145 Z" fill="#7a9648" stroke="{STROKE}" stroke-width="2.5" opacity="0.8"/>
      <path d="M 118,132 C 142,120 178,135 184,152 C 162,162 135,152 118,132 Z" fill="#658036" opacity="0.85"/>
      <path d="M 85,160 Q 128,142 165,162" fill="none" stroke="#48321d" stroke-width="4" stroke-linecap="round"/>
      <!-- 烂草茎线 -->
      <path d="M 95,135 L 115,148 M 135,138 L 155,152 M 105,155 L 128,162" stroke="#a0bc5e" stroke-width="3" stroke-linecap="round"/>
      <!-- 坑边严密围砌的天然圆卵石圈（新石器护坑工艺） -->
      <!-- 后排石 -->
      <ellipse cx="64" cy="116" rx="16" ry="12" fill="#b0a596" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="98" cy="102" rx="19" ry="13" fill="#9e9384" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="134" cy="98" rx="20" ry="14" fill="#b5aa9b" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="168" cy="104" rx="18" ry="13" fill="#8e8374" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="196" cy="118" rx="16" ry="12" fill="#9e9384" stroke="{STROKE}" stroke-width="4"/>
      <!-- 前排石 -->
      <ellipse cx="44" cy="162" rx="17" ry="14" fill="#aba091" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="65" cy="195" rx="20" ry="15" fill="#8e8374" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="106" cy="205" rx="23" ry="16" fill="#b8ad9e" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="152" cy="204" rx="24" ry="16" fill="#9e9384" stroke="{STROKE}" stroke-width="5"/>
      <ellipse cx="194" cy="192" rx="20" ry="15" fill="#aba091" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="212" cy="158" rx="16" ry="13" fill="#8e8374" stroke="{STROKE}" stroke-width="4"/>
      <!-- 前石高光 -->
      <path d="M 98,198 Q 112,192 122,198" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
      <path d="M 142,196 Q 156,190 166,196" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
    </svg>''',

    # 3. torch: 粗壮结实开裂松木火把，麻绳捆扎，熊熊烈火（占满 80% 画面）
    "torch": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="tc_flame" cx="38%" cy="40%" r="65%">
          <stop offset="0%" stop-color="#fff5cc"/>
          <stop offset="30%" stop-color="#f5ba42"/>
          <stop offset="70%" stop-color="#df6e25"/>
          <stop offset="100%" stop-color="#a83614"/>
        </radialGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="222" rx="68" ry="16" fill="#2d1c14" opacity="0.4"/>
      <!-- 木柄：斜向支撑的粗壮结实原木棒 -->
      <path d="M 112,118 L 138,112 L 148,222 L 120,224 Z" fill="#7a5230" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M 125,125 L 132,215" stroke="#52341c" stroke-width="3" stroke-linecap="round"/>
      <!-- 顶部麻绳细密多圈缠绕紧扎 -->
      <rect x="104" y="98" width="44" height="26" rx="4" fill="#c9a46a" stroke="{STROKE}" stroke-width="4.5"/>
      <line x1="104" y1="106" x2="148" y2="106" stroke="#8a6a3e" stroke-width="2.5"/>
      <line x1="104" y1="116" x2="148" y2="116" stroke="#8a6a3e" stroke-width="2.5"/>
      <!-- 捆扎在顶端的易燃干草与浸油松脂裹头 -->
      <ellipse cx="126" cy="94" rx="28" ry="16" fill="#4d321d" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 腾腾燃烧的火光外焰（富有动势的大火苗，高度从 28 到 102） -->
      <path d="M 98,102 C 72,78 78,48 102,32 C 114,48 118,36 128,24 C 145,45 168,36 172,55 C 176,75 165,92 154,102 C 142,112 110,114 98,102 Z" fill="url(#tc_flame)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 明亮内焰核心 -->
      <path d="M 110,95 C 95,78 105,58 116,48 C 124,58 132,52 135,42 C 148,58 152,75 142,95 C 132,102 118,102 110,95 Z" fill="#fff8db" stroke="{STROKE}" stroke-width="3.5" stroke-linejoin="round"/>
      <!-- 飞溅的微小火星与红屑 -->
      <circle cx="78" cy="38" r="4.5" fill="#f5ba42" stroke="{STROKE}" stroke-width="1.8"/>
      <circle cx="178" cy="28" r="4" fill="#df6e25" stroke="{STROKE}" stroke-width="1.8"/>
      <circle cx="152" cy="14" r="3" fill="#f5ba42" stroke="{STROKE}" stroke-width="1.5"/>
      <!-- 木柄受光高光 -->
      <path d="M 116,132 L 122,212" stroke="#a6764c" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    </svg>''',

    # 4. jar: 完好仰韶红陶双耳大肚罐（与 greenware / crackedJar 完全同谱系，饱和度规范到大地色）
    "jar": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="jr_body" cx="36%" cy="32%" r="68%">
          <stop offset="0%" stop-color="#d67850"/>
          <stop offset="50%" stop-color="#b5653e"/>
          <stop offset="85%" stop-color="#833e20"/>
          <stop offset="100%" stop-color="#54220f"/>
        </radialGradient>
        <linearGradient id="jr_rim" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#d67850"/>
          <stop offset="100%" stop-color="#833e20"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="216" rx="80" ry="18" fill="#2d1c14" opacity="0.42"/>
      <!-- 左右双耳把手 -->
      <path d="M 66,112 C 45,112 45,146 68,150" fill="none" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 190,112 C 211,112 211,146 188,150" fill="none" stroke="{STROKE}" stroke-width="7" stroke-linecap="round"/>
      <path d="M 66,112 C 48,112 48,146 68,150" fill="none" stroke="#b5653e" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 190,112 C 208,112 208,146 188,150" fill="none" stroke="#b5653e" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 大肚陶罐主体 -->
      <path d="M 86,54 L 170,54 C 176,80 212,112 210,158 C 207,198 172,214 128,214 C 84,214 49,198 46,158 C 44,112 80,80 86,54 Z" fill="url(#jr_body)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 罐口沿 -->
      <ellipse cx="128" cy="54" rx="44" ry="15" fill="url(#jr_rim)" stroke="{STROKE}" stroke-width="5.5"/>
      <ellipse cx="128" cy="54" rx="32" ry="9" fill="#3a1b0d" stroke="{STROKE}" stroke-width="3"/>
      <!-- 新石器经典弦纹与水波旋涡几何彩陶纹带 -->
      <path d="M 76,108 Q 128,124 180,108" fill="none" stroke="{STROKE}" stroke-width="3.5"/>
      <path d="M 68,142 Q 128,162 188,142" fill="none" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 陶纹彩绘折线与同心圆纹（黑彩陶绘） -->
      <path d="M 82,122 L 95,134 L 108,122 L 121,134 L 134,122 L 147,134 L 160,122 L 173,134" fill="none" stroke="#3a1b0d" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 左上饱满柔和高光 -->
      <path d="M 82,82 Q 112,74 135,82" fill="none" stroke="#f0a582" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
      <path d="M 72,130 C 66,152 72,175 85,188" fill="none" stroke="#f0a582" stroke-width="4" stroke-linecap="round" opacity="0.65"/>
    </svg>''',

    # 5. you: 16岁少年主角半身像（大头身胸像，蓝灰色朴素麻衣，眼神明亮坚毅）
    "you": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="yu_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#fae2cd"/>
          <stop offset="60%" stop-color="#ecc09c"/>
          <stop offset="100%" stop-color="#c99570"/>
        </radialGradient>
        <linearGradient id="yu_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#8baec7"/>
          <stop offset="60%" stop-color="#6f8fb0"/>
          <stop offset="100%" stop-color="#4d6985"/>
        </linearGradient>
      </defs>
      <!-- 胸身投影 -->
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 蓝灰色朴素麻布短衣（胸身部分，占满下半部） -->
      <path d="M 64,228 L 74,168 C 84,152 104,146 128,146 C 152,146 172,152 182,168 L 192,228 Z" fill="url(#yu_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 衣领交叉与麻布缝线 -->
      <path d="M 104,150 L 128,185 L 152,150" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 脖颈 -->
      <path d="M 112,148 L 112,126 C 112,126 128,132 144,126 L 144,148 Z" fill="#dfaf88" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 头部大面庞（Q版大头身，圆润饱满） -->
      <ellipse cx="128" cy="88" rx="56" ry="50" fill="url(#yu_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 双耳 -->
      <circle cx="72" cy="92" r="10" fill="#dfaf88" stroke="{STROKE}" stroke-width="4"/>
      <circle cx="184" cy="92" r="10" fill="#dfaf88" stroke="{STROKE}" stroke-width="4"/>
      <!-- 新石器少年凌乱黑发与草绳束发带 -->
      <path d="M 72,82 C 68,54 94,36 128,36 C 162,36 188,54 184,82 C 172,60 148,52 128,52 C 108,52 84,60 72,82 Z" fill="#422f22" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 额前草绳发带 -->
      <path d="M 72,70 Q 128,78 184,70" fill="none" stroke="#c9a25b" stroke-width="5" stroke-linecap="round"/>
      <path d="M 72,70 Q 128,78 184,70" fill="none" stroke="{STROKE}" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 4"/>
      <!-- 坚毅明亮的眼睛与英气眉毛 -->
      <ellipse cx="108" cy="92" rx="6" ry="7.5" fill="{STROKE}"/>
      <ellipse cx="148" cy="92" rx="6" ry="7.5" fill="{STROKE}"/>
      <circle cx="106" cy="89" r="2.5" fill="#ffffff"/>
      <circle cx="146" cy="89" r="2.5" fill="#ffffff"/>
      <!-- 眉毛 -->
      <path d="M 98,80 Q 110,75 118,80" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 158,80 Q 146,75 138,80" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 鼻与嘴（自信微笑） -->
      <path d="M 128,95 L 125,103 L 131,103" fill="none" stroke="#c28c64" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 120,115 Q 128,122 136,115" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <!-- 面颊红润健康光泽 -->
      <circle cx="95" cy="104" r="7" fill="#f0a58a" opacity="0.6"/>
      <circle cx="161" cy="104" r="7" fill="#f0a58a" opacity="0.6"/>
    </svg>''',

    # 6. aunt: 陶婶半身像（五十岁慈祥妇人，盘发插木簪，赭红麻衣，手捧心爱陶碗）
    "aunt": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="at_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#fae0cb"/>
          <stop offset="60%" stop-color="#e8b894"/>
          <stop offset="100%" stop-color="#be8760"/>
        </radialGradient>
        <linearGradient id="at_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#cf7558"/>
          <stop offset="60%" stop-color="#b5664a"/>
          <stop offset="100%" stop-color="#7d3c26"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 盘发与高发髻插木簪（头顶标志） -->
      <ellipse cx="128" cy="38" rx="24" ry="18" fill="#443226" stroke="{STROKE}" stroke-width="5"/>
      <line x1="98" y1="42" x2="162" y2="30" stroke="#8a5a34" stroke-width="5" stroke-linecap="round"/>
      <!-- 赭红麻布长袍（胸肩半身） -->
      <path d="M 60,228 L 70,172 C 82,154 102,148 128,148 C 154,148 174,154 186,172 L 196,228 Z" fill="url(#at_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 脖颈与领口麻线边 -->
      <path d="M 112,150 L 112,128 C 112,128 128,134 144,128 L 144,150 Z" fill="#dba882" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 慈祥温和的面容 -->
      <ellipse cx="128" cy="92" rx="54" ry="48" fill="url(#at_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 妇人柔顺头发与鬓发 -->
      <path d="M 74,86 C 70,58 95,46 128,46 C 161,46 186,58 182,86 C 172,66 150,60 128,60 C 106,60 84,66 74,86 Z" fill="#443226" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 双耳与温润骨环耳坠 -->
      <circle cx="74" cy="96" r="9" fill="#dba882" stroke="{STROKE}" stroke-width="4"/>
      <circle cx="182" cy="96" r="9" fill="#dba882" stroke="{STROKE}" stroke-width="4"/>
      <!-- 慈爱笑眼与柔和眉毛 -->
      <path d="M 100,94 Q 109,88 118,94" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 156,94 Q 147,88 138,94" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 98,82 Q 109,77 118,82" fill="none" stroke="#5a4232" stroke-width="3" stroke-linecap="round"/>
      <path d="M 158,82 Q 147,77 138,82" fill="none" stroke="#5a4232" stroke-width="3" stroke-linecap="round"/>
      <!-- 嘴唇（慈祥微笑） -->
      <path d="M 120,118 Q 128,126 136,118" fill="none" stroke="{STROKE}" stroke-width="3.2" stroke-linecap="round"/>
      <!-- 手中捧着一只精巧的红陶小碗（标志性器物） -->
      <ellipse cx="128" cy="204" rx="34" ry="18" fill="#b5653e" stroke="{STROKE}" stroke-width="4.5"/>
      <ellipse cx="128" cy="196" rx="28" ry="10" fill="#db8862" stroke="{STROKE}" stroke-width="3"/>
      <!-- 捧碗的双手 -->
      <ellipse cx="94" cy="204" rx="12" ry="9" fill="#dba882" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="162" cy="204" rx="12" ry="9" fill="#dba882" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 7. yu: 阿三半身像（二十多岁精壮种地农夫，头缠草绳，绿褐短衣，肩扛石锄）
    "yu": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ya_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#f5d4b5"/>
          <stop offset="60%" stop-color="#e2ab80"/>
          <stop offset="100%" stop-color="#b67a50"/>
        </radialGradient>
        <linearGradient id="ya_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#96b574"/>
          <stop offset="60%" stop-color="#7c9a5c"/>
          <stop offset="100%" stop-color="#55703a"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 肩上斜扛的打制石锄（木柄 + 绑绳磨光石锄头） -->
      <path d="M 46,62 L 188,218" stroke="#7a5434" stroke-width="9" stroke-linecap="round"/>
      <path d="M 46,62 L 188,218" stroke="{STROKE}" stroke-width="3.5" fill="none"/>
      <!-- 结实的磨光灰石锄头与牢固麻绳绑扎 -->
      <path d="M 36,46 L 68,36 L 58,72 Z" fill="#8f8577" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="M 44,52 L 58,60 M 48,48 L 62,56" stroke="#c9a96a" stroke-width="3"/>
      <!-- 绿褐色结实短麻衣（半身） -->
      <path d="M 64,228 L 74,168 C 84,152 104,146 128,146 C 152,146 172,152 182,168 L 192,228 Z" fill="url(#ya_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 强健脖颈 -->
      <path d="M 112,148 L 112,126 C 112,126 128,132 144,126 L 144,148 Z" fill="#d49d74" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 青年农夫方阔脸庞 -->
      <ellipse cx="128" cy="88" rx="56" ry="50" fill="url(#ya_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 头发与额头紧扎的草绳发圈（特征） -->
      <path d="M 72,82 C 68,54 94,36 128,36 C 162,36 188,54 184,82 C 172,60 148,52 128,52 C 108,52 84,60 72,82 Z" fill="#3d2c1e" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 草绳发带 -->
      <path d="M 72,70 Q 128,80 184,70" fill="none" stroke="#c9a24a" stroke-width="6" stroke-linecap="round"/>
      <path d="M 72,70 Q 128,80 184,70" fill="none" stroke="{STROKE}" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 4"/>
      <!-- 憨厚坚毅眼睛 -->
      <ellipse cx="108" cy="92" rx="6" ry="7" fill="{STROKE}"/>
      <ellipse cx="148" cy="92" rx="6" ry="7" fill="{STROKE}"/>
      <circle cx="106" cy="89" r="2.5" fill="#ffffff"/>
      <circle cx="146" cy="89" r="2.5" fill="#ffffff"/>
      <!-- 浓黑农夫眉 -->
      <path d="M 96,80 Q 108,76 120,81" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M 160,80 Q 148,76 136,81" fill="none" stroke="{STROKE}" stroke-width="4.5" stroke-linecap="round"/>
      <!-- 宽鼻与朴实嘴型 -->
      <path d="M 128,94 L 124,105 L 132,105" fill="none" stroke="#b67a50" stroke-width="3" stroke-linecap="round"/>
      <path d="M 118,118 Q 128,124 138,118" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
    </svg>''',

    # 8. cook: 阿苇半身像（清秀略显忧心的年轻女子，发别细芦叶，怀中抱满新鲜青翠芦苇）
    "cook": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="ck_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#fae4d0"/>
          <stop offset="60%" stop-color="#e8be9e"/>
          <stop offset="100%" stop-color="#bf8a68"/>
        </radialGradient>
        <linearGradient id="ck_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#db8e78"/>
          <stop offset="60%" stop-color="#c97b64"/>
          <stop offset="100%" stop-color="#8e4634"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 暖赭红麻衣（半身） -->
      <path d="M 64,228 L 72,172 C 84,154 104,148 128,148 C 152,148 172,154 184,172 L 192,228 Z" fill="url(#ck_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 纤细白皙的颈部 -->
      <path d="M 114,148 L 114,126 C 114,126 128,132 142,126 L 142,148 Z" fill="#dba882" stroke="{STROKE}" stroke-width="4"/>
      <!-- 清秀略显清瘦的脸庞 -->
      <ellipse cx="128" cy="90" rx="52" ry="46" fill="url(#ck_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 秀丽黑发与发间别着的一枝青翠细长芦苇叶（特征） -->
      <path d="M 76,82 C 72,56 96,40 128,40 C 160,40 184,56 180,82 C 170,62 148,54 128,54 C 108,54 86,62 76,82 Z" fill="#3a281c" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 发间翠绿芦苇枝 -->
      <path d="M 148,46 Q 178,32 196,24" fill="none" stroke="#6d8a44" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="184" cy="30" rx="8" ry="4" fill="#88a855" transform="rotate(-25 184 30)"/>
      <!-- 略显忧心而温柔的秀美眼睛与微蹙眉尖 -->
      <ellipse cx="110" cy="92" rx="5.5" ry="7" fill="{STROKE}"/>
      <ellipse cx="146" cy="92" rx="5.5" ry="7" fill="{STROKE}"/>
      <circle cx="108" cy="89" r="2.2" fill="#ffffff"/>
      <circle cx="144" cy="89" r="2.2" fill="#ffffff"/>
      <path d="M 100,82 Q 110,80 118,84" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 156,82 Q 146,80 138,84" fill="none" stroke="{STROKE}" stroke-width="3" stroke-linecap="round"/>
      <path d="M 122,118 Q 128,122 134,118" fill="none" stroke="{STROKE}" stroke-width="2.8" stroke-linecap="round"/>
      <!-- 怀抱的一大捆新鲜清香的青翠芦苇（抱在胸前，饱满丰富） -->
      <path d="M 60,185 L 196,185 L 186,228 L 70,228 Z" fill="#6d8a44" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 丛立的芦苇杆与顶上毛茸茸的细芦花 -->
      <path d="M 75,185 L 75,150 M 90,185 L 86,142 M 105,185 L 102,145 M 150,185 L 152,142 M 165,185 L 170,146 M 180,185 L 185,152" stroke="#4d682a" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse cx="86" cy="138" rx="6" ry="10" fill="#d8c8a0" stroke="{STROKE}" stroke-width="2"/>
      <ellipse cx="170" cy="142" rx="6" ry="10" fill="#d8c8a0" stroke="{STROKE}" stroke-width="2"/>
      <!-- 抱芦苇的双手 -->
      <ellipse cx="90" cy="188" rx="11" ry="8" fill="#e8be9e" stroke="{STROKE}" stroke-width="3.5"/>
      <ellipse cx="166" cy="188" rx="11" ry="8" fill="#e8be9e" stroke="{STROKE}" stroke-width="3.5"/>
    </svg>''',

    # 9. digger: 阿砺半身像（打制石器的壮年匠人，古铜肤色带白垩石粉，手托打制石斧坯）
    "digger": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="dg_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#e8ad84"/>
          <stop offset="60%" stop-color="#cc8a5c"/>
          <stop offset="100%" stop-color="#9a5a30"/>
        </radialGradient>
        <linearGradient id="dg_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#a88562"/>
          <stop offset="60%" stop-color="#8a6a4a"/>
          <stop offset="100%" stop-color="#5a402a"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="90" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 厚实兽皮/粗麻工匠短衣（半身） -->
      <path d="M 58,228 L 70,166 C 82,148 104,142 128,142 C 152,142 174,148 186,166 L 198,228 Z" fill="url(#dg_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 粗壮宽厚的工匠颈部 -->
      <path d="M 110,146 L 110,122 C 110,122 128,128 146,122 L 146,146 Z" fill="#ba7c4e" stroke="{STROKE}" stroke-width="4.5"/>
      <!-- 坚毅刚劲的壮年石匠面容（方下巴，肌肉饱满） -->
      <ellipse cx="128" cy="86" rx="58" ry="52" fill="url(#dg_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 粗犷浓黑短发 -->
      <path d="M 70,80 C 66,50 92,34 128,34 C 164,34 190,50 186,80 C 172,56 148,48 128,48 C 108,48 84,56 70,80 Z" fill="#322216" stroke="{STROKE}" stroke-width="5" stroke-linejoin="round"/>
      <!-- 凝神注视的深邃眼睛与如刀刻般的浓眉 -->
      <ellipse cx="106" cy="90" rx="6.5" ry="7.5" fill="{STROKE}"/>
      <ellipse cx="150" cy="90" rx="6.5" ry="7.5" fill="{STROKE}"/>
      <circle cx="104" cy="87" r="2.5" fill="#ffffff"/>
      <circle cx="148" cy="87" r="2.5" fill="#ffffff"/>
      <path d="M 94,76 L 120,79" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <path d="M 162,76 L 136,79" stroke="{STROKE}" stroke-width="5" stroke-linecap="round"/>
      <!-- 挺直鼻梁与沉稳下巴线 -->
      <path d="M 128,90 L 123,104 L 133,104" fill="none" stroke="#8a4e24" stroke-width="3" stroke-linecap="round"/>
      <path d="M 116,118 L 140,118" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 身上与脸颊带的白色石粉抹痕（匠人灵魂细节！） -->
      <path d="M 82,98 Q 94,92 102,96" fill="none" stroke="#e8e2d8" stroke-width="3.5" stroke-linecap="round" opacity="0.8"/>
      <path d="M 152,104 Q 164,98 174,102" fill="none" stroke="#e8e2d8" stroke-width="3.5" stroke-linecap="round" opacity="0.8"/>
      <!-- 双手托着一块正在精心琢磨打制的青灰色石斧坯（标志物） -->
      <path d="M 102,172 L 154,164 L 160,202 L 96,206 Z" fill="#8f8577" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 石斧刃部贝壳状打制崩片纹 -->
      <path d="M 154,164 L 142,176 M 157,178 L 145,188 M 160,192 L 148,198" stroke="#cfc5b6" stroke-width="2.5"/>
      <!-- 粗壮有力的大手 -->
      <ellipse cx="94" cy="192" rx="14" ry="11" fill="#cc8a5c" stroke="{STROKE}" stroke-width="4"/>
      <ellipse cx="162" cy="190" rx="14" ry="11" fill="#cc8a5c" stroke="{STROKE}" stroke-width="4"/>
    </svg>''',

    # 10. boatman: 阿罟半身像（老渔夫，头戴宽大草笠，银须矍铄，青灰短衣，肩搭渔网与陶坠）
    "boatman": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
      <defs>
        <radialGradient id="bm_face" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#fae0cb"/>
          <stop offset="60%" stop-color="#dba882"/>
          <stop offset="100%" stop-color="#ae7650"/>
        </radialGradient>
        <linearGradient id="bm_cloth" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#6f9a92"/>
          <stop offset="60%" stop-color="#4f7a78"/>
          <stop offset="100%" stop-color="#345452"/>
        </linearGradient>
      </defs>
      <!-- 阴影 -->
      <ellipse cx="128" cy="225" rx="88" ry="18" fill="#2d1c14" opacity="0.38"/>
      <!-- 头顶宽大遮阳防雨的编结圆草笠（特征标志） -->
      <ellipse cx="128" cy="56" rx="84" ry="26" fill="#c9a96a" stroke="{STROKE}" stroke-width="5.5"/>
      <path d="M 104,48 L 128,26 L 152,48 Z" fill="#b08a4a" stroke="{STROKE}" stroke-width="4.5" stroke-linejoin="round"/>
      <!-- 草笠放射编织纹路 -->
      <path d="M 64,62 Q 128,45 192,62" fill="none" stroke="#8a6a3e" stroke-width="2.5"/>
      <!-- 水青灰色麻布渔服（半身） -->
      <path d="M 62,228 L 72,170 C 84,152 104,146 128,146 C 152,146 172,152 184,170 L 194,228 Z" fill="url(#bm_cloth)" stroke="{STROKE}" stroke-width="5.5" stroke-linejoin="round"/>
      <!-- 老人饱经风浪的面庞 -->
      <ellipse cx="128" cy="98" rx="52" ry="46" fill="url(#bm_face)" stroke="{STROKE}" stroke-width="5.5"/>
      <!-- 矍铄慈祥带笑意的眼睛与眼角鱼尾笑纹 -->
      <path d="M 100,98 Q 110,92 120,98" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 156,98 Q 146,92 136,98" fill="none" stroke="{STROKE}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 94,95 L 98,98 M 94,101 L 98,100" stroke="#8a5a3a" stroke-width="2"/>
      <path d="M 162,95 L 158,98 M 162,101 L 158,100" stroke="#8a5a3a" stroke-width="2"/>
      <path d="M 98,86 Q 110,82 120,86" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M 158,86 Q 146,82 136,86" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
      <!-- 银白色山羊胡须（老渔夫灵魂风貌） -->
      <path d="M 112,120 C 116,150 140,150 144,120 C 138,126 118,126 112,120 Z" fill="#f2ede4" stroke="{STROKE}" stroke-width="3.5"/>
      <!-- 肩膀上搭着的大束渔网与挂着的陶质沉子网坠 -->
      <path d="M 52,168 Q 98,155 142,168 L 138,228 L 48,228 Z" fill="#a89270" stroke="{STROKE}" stroke-width="4.5" opacity="0.85"/>
      <!-- 渔网菱形交织网格线 -->
      <path d="M 58,185 L 118,165 M 58,205 L 128,180" stroke="#7a6548" stroke-width="2.5"/>
      <path d="M 78,165 L 118,225 M 98,165 L 138,225" stroke="#7a6548" stroke-width="2.5"/>
      <!-- 垂挂在网角的烧制红陶沉坠 -->
      <ellipse cx="64" cy="208" rx="8" ry="12" fill="#b5653e" stroke="{STROKE}" stroke-width="3"/>
      <ellipse cx="82" cy="214" rx="7" ry="10" fill="#b5653e" stroke="{STROKE}" stroke-width="3"/>
    </svg>'''
}

def main():
    print("开始重画最不一致的 10 张卡牌图标...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page(viewport={"width": 256, "height": 256})

        for key, svg_code in REMASTERED_SVGS.items():
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
            print(f"  [Remastered] -> {png_path}")

        browser.close()
    print("10 张图标重画并渲染完毕！")

if __name__ == "__main__":
    main()
