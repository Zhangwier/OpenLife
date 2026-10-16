#!/usr/bin/env python3
"""
OpenLife 背景音乐合成器（纯 Python 标准库，无第三方依赖）。

用 Karplus-Strong 拨弦（近似古琴/陶埙气质的拨奏）、正弦持续音（河水般的低频铺底）
和简单的陶鼓击打，按五声音阶生成三首可循环的背景音乐：

  river-morning   河岸晨光   宫调式，慢板，适合庭院 / 河边 / 旱地
  hearth-evening  灶火黄昏   羽调式，更暖更低，适合公用灶台 / 夜晚
  kiln-fire       窑火       徵调式，有鼓点，适合陶窑 / 劳作

用法：python3 tools/bgm/synth_bgm.py <输出目录>
输出 16-bit 单声道 WAV；仓库内随附的 .ogg 由 ffmpeg 转码：
  ffmpeg -i x.wav -c:a libvorbis -q:a 4 x.ogg
确定性：固定随机种子，同一脚本每次生成相同的音频。
"""

import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050

# 五声音阶（相对主音的半音数）
PENTATONIC = {"gong": [0, 2, 4, 7, 9], "yu": [0, 3, 5, 7, 10], "zhi": [0, 2, 5, 7, 9]}


def freq(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def pluck(buf, start, f, dur, amp, rng, bright=0.5):
    """Karplus-Strong 拨弦，写入 buf[start:]。"""
    period = max(2, int(RATE / f))
    line = [rng.uniform(-1, 1) for _ in range(period)]
    # 低通初始噪声，让音色更圆（像丝弦而不是钢弦）
    for _ in range(2):
        line = [(line[i] + line[i - 1]) * 0.5 for i in range(period)]
    n = int(dur * RATE)
    decay = 0.996 - (1 - bright) * 0.004
    idx = 0
    end = min(len(buf), start + n)
    for t in range(start, end):
        cur = line[idx]
        nxt = line[(idx + 1) % period]
        line[idx] = (cur + nxt) * 0.5 * decay
        env = 1.0 if t - start > 40 else (t - start) / 40
        buf[t] += cur * amp * env
        idx = (idx + 1) % period


def drone(buf, f, amp, start=0, end=None, lfo=0.07):
    end = len(buf) if end is None else end
    fade = int(3 * RATE)
    for t in range(start, end):
        pos = t - start
        env = min(1.0, pos / fade, (end - t) / fade)
        mod = 0.75 + 0.25 * math.sin(2 * math.pi * lfo * t / RATE)
        s = math.sin(2 * math.pi * f * t / RATE) + 0.3 * math.sin(2 * math.pi * f * 2.003 * t / RATE)
        buf[t] += s * amp * env * mod


def drum(buf, start, amp, rng, low=90.0):
    """陶鼓：快速下滑的低频正弦 + 少量噪声。"""
    n = int(0.45 * RATE)
    phase = 0.0
    for i in range(n):
        t = start + i
        if t >= len(buf):
            break
        k = i / RATE
        f = low * (1 + 1.5 * math.exp(-k * 30))
        phase += 2 * math.pi * f / RATE
        env = math.exp(-k * 9)
        buf[t] += (math.sin(phase) * 0.9 + rng.uniform(-1, 1) * 0.15 * math.exp(-k * 60)) * amp * env


def reverb(buf, mix=0.28):
    """几条梳状延迟组成的简易混响，模拟河谷里的空旷感。"""
    out = list(buf)
    for delay_s, gain in ((0.031, 0.5), (0.047, 0.42), (0.071, 0.36), (0.113, 0.3)):
        d = int(delay_s * RATE)
        line = [0.0] * len(buf)
        for t in range(d, len(buf)):
            line[t] = buf[t - d] + line[t - d] * gain
        for t in range(len(buf)):
            out[t] += line[t] * mix * 0.25
    return out


def melody(rng, scale, root, bars, beats_per_bar, phrase_len=4):
    """生成有起承转合的旋律：以短乐句为单位，乐句末回落到主音或五度。"""
    degrees = []
    pos = 2
    for bar in range(bars):
        for beat in range(beats_per_bar):
            if rng.random() < 0.28:
                degrees.append(None)  # 留白
                continue
            pos += rng.choice([-2, -1, -1, 0, 1, 1, 2])
            pos = max(0, min(9, pos))
            degrees.append(pos)
        if (bar + 1) % phrase_len == 0:
            degrees[-1] = 0 if (bar + 1) % (phrase_len * 2) == 0 else 3
            pos = degrees[-1]
    notes = []
    for d in degrees:
        if d is None:
            notes.append(None)
        else:
            octave, step = divmod(d, len(scale))
            notes.append(root + 12 * octave + scale[step])
    return notes


def render(name, mode, root, bpm, bars, seed, drums=False, bright=0.5):
    rng = random.Random(seed)
    beats_per_bar = 4
    beat = 60.0 / bpm
    total = bars * beats_per_bar * beat + 4.0
    buf = [0.0] * int(total * RATE)
    scale = PENTATONIC[mode]

    drone(buf, freq(root - 24), 0.09)
    drone(buf, freq(root - 17), 0.05, lfo=0.05)

    notes = melody(rng, scale, root, bars, beats_per_bar)
    for i, note in enumerate(notes):
        if note is None:
            continue
        start = int((i * beat + rng.uniform(-0.015, 0.015) + 1.0) * RATE)
        pluck(buf, max(0, start), freq(note), beat * 2.6, 0.32, rng, bright)
        # 偶尔加一个低八度泛音，模仿琴的按音
        if rng.random() < 0.18:
            pluck(buf, max(0, start + int(beat * 0.5 * RATE)), freq(note - 12), beat * 3, 0.18, rng, bright)

    # 每两小节一个低音根音拨奏
    for bar in range(0, bars, 2):
        start = int((bar * beats_per_bar * beat + 1.0) * RATE)
        pluck(buf, start, freq(root - 12 + rng.choice([0, 0, 7])), beat * 6, 0.26, rng, 0.3)

    if drums:
        for bar in range(bars):
            base = (bar * beats_per_bar * beat + 1.0)
            drum(buf, int(base * RATE), 0.42, rng)
            if rng.random() < 0.7:
                drum(buf, int((base + 2.5 * beat) * RATE), 0.22, rng, low=130)

    out = reverb(buf)
    # 头尾淡入淡出，保证循环播放时不爆音
    fade = int(2.5 * RATE)
    for t in range(fade):
        out[t] *= t / fade
        out[-1 - t] *= t / fade
    peak = max(abs(x) for x in out) or 1.0
    gain = 0.8 / peak
    return name, [int(max(-1, min(1, x * gain)) * 32767) for x in out]


TRACKS = [
    # name, mode, root(MIDI), bpm, bars, seed, drums, bright
    ("river-morning", "gong", 62, 66, 20, 2070, False, 0.6),
    ("hearth-evening", "yu", 57, 56, 16, 1203, False, 0.35),
    ("kiln-fire", "zhi", 60, 76, 24, 880, True, 0.5),
]


def main():
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out_dir.mkdir(parents=True, exist_ok=True)
    for spec in TRACKS:
        name, samples = render(*spec)
        path = out_dir / f"{name}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        print(f"{path}  {len(samples) / RATE:.1f}s")


if __name__ == "__main__":
    main()
