# 背景音乐

| 文件 | 曲名 | 调式 / 速度 | 时长 | 适合场景 |
| --- | --- | --- | --- | --- |
| `river-morning.ogg` | 河岸晨光 | 宫调式 · 66 BPM | 约 77 秒 | 庭院、河边、旱地的白天 |
| `hearth-evening.ogg` | 灶火黄昏 | 羽调式 · 56 BPM | 约 73 秒 | 公用灶台、夜晚 |
| `kiln-fire.ogg` | 窑火 | 徵调式 · 76 BPM，带陶鼓 | 约 80 秒 | 陶窑、劳作 |

由 `tools/bgm/synth_bgm.py`（纯 Python 标准库）程序化合成：Karplus-Strong 拨弦旋律 + 正弦持续音铺底 +
简易陶鼓，五声音阶、固定随机种子（可复现），头尾 2.5 秒淡入淡出便于循环；再用
`ffmpeg -c:a libvorbis -q:a 4` 转为 OGG。音色偏简朴的电子合成拨弦，不是录音乐器。
