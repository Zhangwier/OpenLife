import os
from playwright.sync_api import sync_playwright

ICONS_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\icons"
SVG_DIR = r"D:\MG\program\OpenLife\apps\card-world\art\svgs"

# Masterpiece high-detail 256x256 SVGs with layered depth, natural curves, highlights, and textures.
# Uses the earthy palette (#3a2c20 dark outline, warm rich tones) matching the high-end character art.

REMASTERED_SVGS = {
    # 1. 阿黄 (dog) - 呆萌机灵的中华田园犬
    "dog": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#3a2c20" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" filter="url(#shadow)">
    <!-- 卷尾巴 -->
    <path d="M52 144 C32 136 28 96 52 88 C70 82 76 104 60 120 C54 126 50 134 52 144 Z" fill="#d4924b"/>
    <!-- 后腿 -->
    <path d="M72 168 C64 182 60 206 68 220 H92 C96 206 100 188 94 168 Z" fill="#b87836"/>
    <!-- 前后身躯 -->
    <path d="M68 152 C60 118 96 104 140 106 C176 108 194 128 190 162 C184 196 150 204 104 202 C76 200 68 180 68 152 Z" fill="#e29e54"/>
    <!-- 浅色肚皮 -->
    <path d="M96 196 C124 198 156 192 166 172 C150 168 120 172 96 196 Z" fill="#f6ecd8" stroke="none"/>
    <!-- 前腿与白爪爪 -->
    <path d="M148 168 C144 184 142 206 146 220 H170 C172 204 176 182 170 168 Z" fill="#e29e54"/>
    <path d="M68 214 H92 V220 H68 Z" fill="#f6ecd8"/>
    <path d="M146 214 H170 V220 H146 Z" fill="#f6ecd8"/>
    <!-- 头部 -->
    <path d="M140 96 C136 56 178 38 210 52 C238 64 246 104 226 132 C202 158 144 140 140 96 Z" fill="#e29e54"/>
    <!-- 左耳（后） -->
    <path d="M148 64 C132 40 144 24 162 36 L158 60 Z" fill="#b87836"/>
    <!-- 右耳（耷拉前耳，可爱） -->
    <path d="M198 48 C216 32 236 46 228 68 C222 80 206 74 198 48 Z" fill="#c4823e"/>
    <!-- 嘴鼻白面纹 -->
    <path d="M192 98 C202 84 232 92 234 112 C236 128 206 142 186 130 C180 120 182 108 192 98 Z" fill="#f6ecd8"/>
    <!-- 湿润黑鼻子 -->
    <path d="M222 102 C230 102 234 108 228 114 C222 120 216 114 222 102 Z" fill="#3a2c20"/>
    <circle cx="224" cy="105" r="2" fill="#fff" stroke="none"/>
    <!-- 乌溜溜的大眼睛 -->
    <ellipse cx="182" cy="82" rx="9" ry="12" fill="#3a2c20"/>
    <circle cx="185" cy="78" r="3.5" fill="#fff" stroke="none"/>
    <circle cx="180" cy="87" r="1.5" fill="#fff" stroke="none"/>
    <!-- 原始麻绳项圈与小骨头挂坠 -->
    <path d="M146 124 C164 142 196 146 206 130" fill="none" stroke="#a88a52" stroke-width="7"/>
    <circle cx="182" cy="144" r="5" fill="#f6ecd8"/>
  </g>
</svg>""",

    # 2. 狐狸 (fox) - 灵动优雅的红狐
    "fox": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 蓬松大尾巴与白尾尖 -->
    <path d="M72 152 C32 144 16 92 48 64 C80 36 116 72 96 140 Z" fill="#d45e28"/>
    <path d="M48 64 C62 48 88 56 96 82 C82 88 64 80 48 64 Z" fill="#fffaf0"/>
    <!-- 后肢与黑足 -->
    <path d="M84 164 C76 182 72 206 80 222 H102 C104 204 108 184 102 164 Z" fill="#b24818"/>
    <path d="M80 206 H102 V222 H80 Z" fill="#2a1f18"/>
    <!-- 敏捷身段 -->
    <path d="M80 148 C76 116 112 104 152 108 C184 112 196 134 188 166 C180 196 142 204 104 200 C84 196 80 174 80 148 Z" fill="#d45e28"/>
    <!-- 前肢与黑袜 -->
    <path d="M152 166 C148 184 144 206 150 222 H172 C174 204 178 182 172 166 Z" fill="#d45e28"/>
    <path d="M150 206 H172 V222 H150 Z" fill="#2a1f18"/>
    <!-- 头部轮廓 -->
    <path d="M148 98 C144 68 174 52 202 62 C226 70 240 98 226 122 C208 144 154 134 148 98 Z" fill="#d45e28"/>
    <!-- 尖尖的双耳（带黑外廓和白内毛） -->
    <path d="M156 64 L164 24 L188 54 Z" fill="#2a1f18"/>
    <path d="M166 54 L170 34 L182 50 Z" fill="#fffaf0" stroke="none"/>
    <path d="M200 62 L224 28 L228 68 Z" fill="#2a1f18"/>
    <path d="M208 58 L220 38 L222 62 Z" fill="#fffaf0" stroke="none"/>
    <!-- 白脸颊与尖吻 -->
    <path d="M182 96 C198 86 234 94 242 108 C232 122 198 132 178 122 C172 112 174 102 182 96 Z" fill="#fffaf0"/>
    <circle cx="242" cy="108" r="4" fill="#2a1f18"/>
    <!-- 狡黠金眸 -->
    <ellipse cx="188" cy="86" rx="8" ry="10" transform="rotate(15 188 86)" fill="#f0a24a"/>
    <ellipse cx="189" cy="86" rx="3" ry="8" transform="rotate(15 188 86)" fill="#2a1f18"/>
    <circle cx="187" cy="82" r="2" fill="#fff" stroke="none"/>
  </g>
</svg>""",

    # 3. 栗子树 (chestnut) - 枝繁叶茂、挂满带刺栗苞的老树
    "chestnut": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 苍劲树干与树根 -->
    <path d="M104 236 C112 180 108 148 116 116 H140 C148 148 144 180 152 236 Z" fill="#7a4e28"/>
    <path d="M120 148 L96 124 M136 138 L160 118" stroke="#5a3618" stroke-width="5" fill="none"/>
    <!-- 丰茂的层次树冠（多重重叠与不同绿色） -->
    <path d="M64 136 C42 120 44 84 72 70 C88 42 132 32 160 48 C192 34 224 58 220 92 C236 118 214 154 184 152 C168 168 130 170 112 156 C88 168 68 156 64 136 Z" fill="#3f6a2c"/>
    <path d="M80 120 C64 108 66 82 86 70 C100 48 136 40 158 54 C184 42 208 62 204 88 C216 108 200 136 176 134 C162 146 132 148 118 136 C98 146 84 136 80 120 Z" fill="#588a3e" stroke="none"/>
    <path d="M104 96 C94 88 96 72 108 64 C118 48 142 44 156 54 C172 46 188 60 186 78 C194 92 184 110 168 108 C158 116 138 118 128 110 C114 116 106 110 104 96 Z" fill="#78aa4c" stroke="none"/>
    <!-- 刺刺的栗苞与露出的油亮红栗子 -->
    <!-- 栗苞 1 -->
    <circle cx="88" cy="118" r="18" fill="#8aa844" stroke="#3a2c20" stroke-width="4"/>
    <path d="M72 118 H104 M88 102 V134 M76 106 L100 130 M76 130 L100 106" stroke="#5c7a28" stroke-width="3"/>
    <circle cx="88" cy="118" r="8" fill="#6e2d14" stroke="#3a2c20" stroke-width="3"/>
    <circle cx="86" cy="115" r="2" fill="#d98a5a" stroke="none"/>
    <!-- 栗苞 2 -->
    <circle cx="178" cy="106" r="20" fill="#8aa844" stroke="#3a2c20" stroke-width="4"/>
    <path d="M160 106 H196 M178 88 V124 M164 92 L192 120 M164 120 L192 92" stroke="#5c7a28" stroke-width="3"/>
    <circle cx="178" cy="106" r="9" fill="#6e2d14" stroke="#3a2c20" stroke-width="3"/>
    <!-- 栗苞 3 -->
    <circle cx="136" cy="74" r="16" fill="#8aa844" stroke="#3a2c20" stroke-width="4"/>
    <circle cx="136" cy="74" r="7" fill="#6e2d14" stroke="#3a2c20" stroke-width="3"/>
  </g>
</svg>""",

    # 4. 浆果丛 (berries) - 晶莹饱满红浆果
    "berries": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 灌木枝叶背景底座 -->
    <path d="M52 176 C32 144 48 102 82 94 C100 68 144 60 172 78 C204 66 234 94 226 130 C238 162 210 200 176 196 C152 214 104 212 84 196 C64 204 48 194 52 176 Z" fill="#4d7436"/>
    <!-- 错落穿插的绿叶 -->
    <path d="M72 130 C64 108 92 96 104 116 Z" fill="#6c9c48"/>
    <path d="M168 110 C186 92 208 116 190 132 Z" fill="#6c9c48"/>
    <path d="M120 74 C138 56 160 80 144 94 Z" fill="#6c9c48"/>
    <!-- 一簇簇鲜亮诱人的红浆果（主大果+高光点） -->
    <circle cx="94" cy="154" r="22" fill="#c43226"/>
    <circle cx="88" cy="148" r="6" fill="#f48274" stroke="none"/>
    <circle cx="100" cy="160" r="2" fill="#3a2c20" stroke="none"/>

    <circle cx="136" cy="132" r="24" fill="#d83c2e"/>
    <circle cx="130" cy="124" r="7" fill="#f48274" stroke="none"/>

    <circle cx="166" cy="162" r="20" fill="#b82a20"/>
    <circle cx="162" cy="156" r="5" fill="#f48274" stroke="none"/>

    <circle cx="126" cy="174" r="20" fill="#c43226"/>
    <circle cx="122" cy="168" r="5" fill="#f48274" stroke="none"/>

    <circle cx="188" cy="134" r="18" fill="#d83c2e"/>
    <circle cx="184" cy="128" r="4.5" fill="#f48274" stroke="none"/>

    <circle cx="76" cy="120" r="16" fill="#b82a20"/>
    <circle cx="72" cy="116" r="4" fill="#f48274" stroke="none"/>
  </g>
</svg>""",

    # 5. 野鸭 (duck) - 鲜艳逼真的绿头麻鸭
    "duck": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 清澈水波 -->
    <path d="M24 204 C64 192 104 212 148 200 C192 188 224 208 244 200" stroke="#4f7a78" stroke-width="7" fill="none"/>
    <!-- 丰满鸭身（浅灰褐腹毛） -->
    <path d="M52 168 C44 136 78 122 124 122 C168 122 186 142 180 178 C174 208 136 216 94 212 C66 210 52 196 52 168 Z" fill="#8c7860"/>
    <!-- 暖棕栗色胸脯 -->
    <path d="M142 126 C166 128 184 148 178 178 C158 184 144 156 142 126 Z" fill="#9e5230"/>
    <!-- 翅膀羽毛分层与蓝紫色翼镜 -->
    <path d="M68 162 C78 140 114 136 138 152 C120 182 86 186 68 162 Z" fill="#6d5c48"/>
    <rect x="88" y="156" width="28" height="8" rx="3" transform="rotate(-15 88 156)" fill="#364e8c"/>
    <path d="M54 164 C42 160 38 150 44 144 C52 144 54 154 54 164 Z" fill="#2a1f18"/>
    <!-- 纯白颈环 -->
    <ellipse cx="172" cy="116" rx="14" ry="7" fill="#fffaf0"/>
    <!-- 墨绿光泽圆头 -->
    <circle cx="180" cy="88" r="28" fill="#1e5c3e"/>
    <!-- 灵动黑眼睛与白高光 -->
    <circle cx="184" cy="80" r="5" fill="#2a1f18"/>
    <circle cx="186" cy="78" r="1.5" fill="#fff" stroke="none"/>
    <!-- 黄色扁扁鸭嘴 -->
    <path d="M204 88 C224 86 244 94 240 104 C228 108 206 104 200 96 Z" fill="#f2a828"/>
  </g>
</svg>""",

    # 6. 木柴 (wood) - 年轮粗皮质感原木捆
    "wood": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 下层左侧原木 -->
    <rect x="42" y="142" width="168" height="54" rx="27" fill="#7a4e28"/>
    <ellipse cx="64" cy="169" rx="20" ry="26" fill="#d8b88a"/>
    <ellipse cx="64" cy="169" rx="12" ry="16" fill="none" stroke="#9e7244" stroke-width="3"/>
    <circle cx="64" cy="169" r="4" fill="#5a3618"/>
    <line x1="64" y1="169" x2="78" y2="178" stroke="#5a3618" stroke-width="3"/>

    <!-- 下层右侧原木 -->
    <rect x="72" y="98" width="154" height="50" rx="25" fill="#8c5a32"/>
    <ellipse cx="94" cy="123" rx="18" ry="24" fill="#e2c498"/>
    <ellipse cx="94" cy="123" rx="10" ry="14" fill="none" stroke="#9e7244" stroke-width="3"/>
    <circle cx="94" cy="123" r="3.5" fill="#5a3618"/>

    <!-- 上层顶木 -->
    <rect x="36" y="62" width="160" height="52" rx="26" fill="#6e4220"/>
    <ellipse cx="58" cy="88" rx="19" ry="25" fill="#d8b88a"/>
    <ellipse cx="58" cy="88" rx="11" ry="15" fill="none" stroke="#9e7244" stroke-width="3"/>
    <circle cx="58" cy="88" r="4" fill="#5a3618"/>

    <!-- 紧紧捆扎的粗麻绳与绑结 -->
    <rect x="144" y="56" width="22" height="146" rx="8" fill="#d8c8a0"/>
    <line x1="148" y1="58" x2="162" y2="200" stroke="#a88a52" stroke-width="4"/>
    <ellipse cx="155" cy="56" rx="14" ry="8" fill="#c9a96a"/>
  </g>
</svg>""",

    # 7. 草木灰 (ash) - 细腻灰堆、黑木炭碎与隐隐红炭火
    "ash": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 底部宽大灰白灰烬堆 -->
    <path d="M38 214 C32 178 72 136 128 136 C184 136 224 178 218 214 C190 226 66 226 38 214 Z" fill="#cfcac2"/>
    <path d="M64 204 C78 174 104 152 142 152 C178 152 200 178 196 204 Z" fill="#e6e2dc" stroke="none"/>
    <!-- 烧焦的黑木炭块 -->
    <polygon points="86,182 108,172 118,188 94,198" fill="#2d2a28"/>
    <polygon points="144,178 172,168 182,184 154,196" fill="#383432"/>
    <polygon points="116,198 142,192 138,210 114,212" fill="#242120"/>
    <!-- 隐现的赤热微炭火星 -->
    <circle cx="126" cy="184" r="5" fill="#f05424" stroke="none"/>
    <circle cx="138" cy="188" r="3.5" fill="#f8a432" stroke="none"/>
    <circle cx="106" cy="190" r="3" fill="#f05424" stroke="none"/>
    <!-- 袅袅飘散的极淡白烟弧线 -->
    <path d="M124 130 Q116 98 130 76 Q144 54 136 28" stroke="#a09a92" stroke-width="4" stroke-dasharray="8 6" fill="none" opacity="0.6"/>
    <path d="M148 136 Q156 108 148 88" stroke="#b0aaa2" stroke-width="3" stroke-dasharray="6 6" fill="none" opacity="0.5"/>
  </g>
</svg>""",

    # 8. 野兔 (rabbit) - 软萌长耳灰兔
    "rabbit": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 圆滚滚雪白毛球尾巴 -->
    <circle cx="52" cy="172" r="18" fill="#fffaf0"/>
    <!-- 结实圆润的后腿 -->
    <ellipse cx="104" cy="178" rx="36" ry="28" fill="#baa692"/>
    <ellipse cx="118" cy="216" rx="28" ry="12" fill="#baa692"/>
    <!-- 胖嘟嘟身躯 -->
    <path d="M84 162 C74 126 108 106 148 112 C184 118 198 146 186 182 C174 212 126 218 84 196 Z" fill="#cbbaa8"/>
    <!-- 软白肚皮毛 -->
    <path d="M130 198 C160 200 178 184 176 166 C158 166 140 176 130 198 Z" fill="#fffaf0" stroke="none"/>
    <!-- 前爪爪 -->
    <ellipse cx="166" cy="214" rx="16" ry="10" fill="#cbbaa8"/>
    <!-- 兔脑袋 -->
    <circle cx="178" cy="116" r="32" fill="#cbbaa8"/>
    <!-- 直立微倾的长耳朵与粉嫩内耳 -->
    <!-- 后耳 -->
    <path d="M152 94 C132 46 142 18 160 20 C176 22 174 54 166 90 Z" fill="#baa692"/>
    <path d="M152 82 C142 48 148 30 158 32 C168 34 164 58 160 80 Z" fill="#e8a8a4" stroke="none"/>
    <!-- 前耳 -->
    <path d="M178 92 C166 38 182 14 200 16 C216 18 206 52 192 90 Z" fill="#cbbaa8"/>
    <path d="M182 82 C174 44 186 26 196 28 C204 30 200 56 190 80 Z" fill="#e8a8a4" stroke="none"/>
    <!-- 黑色大萌眼与纯净反光 -->
    <ellipse cx="186" cy="112" rx="7" ry="9" fill="#3a2c20"/>
    <circle cx="188" cy="108" r="2.5" fill="#fff" stroke="none"/>
    <!-- 粉红三瓣小嘴与白腮颊 -->
    <circle cx="206" cy="126" r="10" fill="#fffaf0" stroke="none"/>
    <path d="M210 122 C214 122 216 126 212 128 Z" fill="#e8a8a4"/>
  </g>
</svg>""",

    # 9. 猛虎 (tiger) - 威猛不凡的百兽之王
    "tiger": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 粗壮盘曲的虎尾（带黑环纹） -->
    <path d="M52 148 C28 136 24 84 56 68 C76 56 82 84 62 108 C54 118 48 132 52 148 Z" fill="#e08428"/>
    <path d="M38 106 L48 114 M34 88 L46 94 M54 70 L64 80" stroke="#3a2c20" stroke-width="6"/>
    <!-- 结实有力的虎爪与后腿 -->
    <path d="M74 168 C64 184 62 206 68 222 H96 C102 206 106 186 98 168 Z" fill="#c46a18"/>
    <!-- 雄壮虎躯 -->
    <path d="M72 152 C64 116 104 102 150 106 C190 110 206 132 198 166 C190 198 152 206 106 202 C78 198 72 178 72 152 Z" fill="#e08428"/>
    <!-- 虎躯黑斑纹 -->
    <path d="M106 110 L102 136 M128 108 L122 142 M152 112 L146 140 M174 118 L168 144" stroke="#3a2c20" stroke-width="7"/>
    <path d="M112 198 L116 176 M140 200 L144 174" stroke="#3a2c20" stroke-width="7"/>
    <!-- 前肢粗臂 -->
    <path d="M152 168 C148 184 144 206 150 222 H178 C182 204 186 182 178 168 Z" fill="#e08428"/>
    <!-- 威严霸气的虎头 -->
    <circle cx="188" cy="92" r="38" fill="#e08428"/>
    <!-- 额头“王”字纹 -->
    <path d="M174 62 H198 M178 70 H194 M172 78 H200 M186 62 V78" stroke="#3a2c20" stroke-width="5"/>
    <!-- 圆耳朵（内黑外橙白斑点） -->
    <circle cx="158" cy="62" r="12" fill="#3a2c20"/>
    <circle cx="158" cy="62" r="6" fill="#fffaf0" stroke="none"/>
    <circle cx="216" cy="66" r="12" fill="#3a2c20"/>
    <circle cx="216" cy="66" r="6" fill="#fffaf0" stroke="none"/>
    <!-- 威严金绿兽瞳 -->
    <ellipse cx="174" cy="94" rx="7" ry="9" fill="#78b840"/>
    <ellipse cx="174" cy="94" rx="3" ry="8" fill="#2a1f18"/>
    <ellipse cx="204" cy="96" rx="7" ry="9" fill="#78b840"/>
    <ellipse cx="204" cy="96" rx="3" ry="8" fill="#2a1f18"/>
    <!-- 宽大白下巴与胡须根 -->
    <ellipse cx="188" cy="118" rx="20" ry="12" fill="#fffaf0"/>
    <polygon points="183,110 193,110 188,116" fill="#b04030" stroke="#3a2c20" stroke-width="2"/>
  </g>
</svg>""",

    # 10. 芦苇丛 (reeds) - 水边摇曳的修长芦苇与芦花
    "reeds": """<svg viewBox="0 0 256 256" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#3a2c20" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- 浅滩湿泥与清波 -->
    <path d="M28 226 C72 216 148 232 228 220" stroke="#6f9a92" stroke-width="12" fill="none"/>
    <path d="M38 236 C98 228 168 238 218 232" stroke="#8a5a34" stroke-width="8" fill="none"/>
    <!-- 三根坚韧挺拔的长芦苇秆 -->
    <path d="M78 230 C82 170 68 110 84 46" stroke="#6a8a44" stroke-width="8" fill="none"/>
    <path d="M128 232 C126 160 134 94 126 32" stroke="#7a9a4c" stroke-width="9" fill="none"/>
    <path d="M178 230 C172 168 184 116 174 48" stroke="#6a8a44" stroke-width="8" fill="none"/>
    <!-- 狭长翻卷的芦苇叶片 -->
    <path d="M82 160 C52 144 38 126 24 132 C46 148 68 168 82 180" fill="#7a9a4c"/>
    <path d="M130 148 C164 132 188 116 208 122 C184 138 156 156 128 166" fill="#8aa854"/>
    <path d="M126 102 C96 86 78 72 64 78 C86 94 108 110 126 120" fill="#7a9a4c"/>
    <path d="M176 138 C204 126 226 112 242 118 C220 132 198 148 174 156" fill="#8aa854"/>
    <!-- 顶端柔软蓬松的深金褐芦花/香蒲棒 -->
    <ellipse cx="84" cy="56" rx="9" ry="24" transform="rotate(5 84 56)" fill="#8c6a38"/>
    <ellipse cx="126" cy="42" rx="10" ry="26" transform="rotate(-3 126 42)" fill="#9e7a44"/>
    <ellipse cx="174" cy="58" rx="9" ry="24" transform="rotate(-6 174 58)" fill="#8c6a38"/>
  </g>
</svg>"""
}

def main():
    print("开始重塑并精修 10 款原本过于简陋的核心资产...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 256, "height": 256})

        for name, svg in REMASTERED_SVGS.items():
            svg_path = os.path.join(SVG_DIR, f"{name}.svg")
            with open(svg_path, "w", encoding="utf-8") as f:
                f.write(svg)

            html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>body {{ margin:0; background:transparent; overflow:hidden; }} svg {{ width:256px; height:256px; }}</style></head><body>{svg}</body></html>"""
            page.set_content(html)
            png_path = os.path.join(ICONS_DIR, f"{name}.png")
            page.screenshot(path=png_path, omit_background=True)
            print(f"  [Remastered] -> {name}.png ({png_path})")

        page.close()
        browser.close()
    print("10 款资产全部重构优化完毕！")

if __name__ == "__main__":
    main()
