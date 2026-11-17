"""Render the README screenshots.

The plugin styles a live transcript, so the honest illustration is the transcript
itself: same block kinds, same accent bars, same tints, drawn at 2x and downscaled
for a crisp result. Run with the bundled Python:

    python docs/make-shots.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "screenshots")
SCALE = 2

FONT_DIR = r"C:\Windows\Fonts"
UI = os.path.join(FONT_DIR, "msyh.ttc")
UI_BOLD = os.path.join(FONT_DIR, "msyhbd.ttc")
MONO = os.path.join(FONT_DIR, "consola.ttf")


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size * SCALE)


def mix(color: tuple[int, int, int], base: tuple[int, int, int], pct: int) -> tuple[int, int, int]:
    """`color-mix(in srgb, color pct%, transparent)` over an opaque base."""
    ratio = pct / 100
    return tuple(round(c * ratio + b * (1 - ratio)) for c, b in zip(color, base))


class Canvas:
    def __init__(self, width: int, height: int, bg: tuple[int, int, int]) -> None:
        self.image = Image.new("RGB", (width * SCALE, height * SCALE), bg)
        self.draw = ImageDraw.Draw(self.image)
        self.width = width
        self.height = height
        self.bg = bg

    def px(self, value: float) -> int:
        return round(value * SCALE)

    def box(self, x: float, y: float, w: float, h: float, radius: float, fill) -> None:
        self.draw.rounded_rectangle(
            [self.px(x), self.px(y), self.px(x + w), self.px(y + h)],
            radius=self.px(radius),
            fill=fill,
        )

    def text(self, x: float, y: float, value: str, fnt, fill) -> None:
        self.draw.text((self.px(x), self.px(y)), value, font=fnt, fill=fill)

    def save(self, name: str) -> None:
        target = os.path.join(OUT, name)
        self.image.resize((self.width, self.height), Image.LANCZOS).save(target, optimize=True)
        print("wrote", target)


def block(
    canvas: Canvas,
    x: float,
    y: float,
    w: float,
    color: tuple[int, int, int],
    tint_pct: int,
    title: str,
    meta: str,
    lines: list[str],
    *,
    title_font,
    meta_font,
    body_font,
    title_color,
    meta_color,
    body_color,
    live: bool = False,
) -> float:
    """One transcript process block: accent bar, tinted surface, title, body."""
    pad_top, pad_bottom, line_height = 9, 10, 21
    height = pad_top + 22 + len(lines) * line_height + pad_bottom
    canvas.box(x, y, w, height, 8, mix(color, canvas.bg, tint_pct))
    canvas.draw.rounded_rectangle(
        [canvas.px(x), canvas.px(y), canvas.px(x + 3), canvas.px(y + height)],
        radius=canvas.px(1.5),
        fill=color,
    )
    canvas.text(x + 16, y + pad_top, title, title_font, title_color)
    title_width = canvas.draw.textlength(title, font=title_font) / SCALE
    canvas.text(x + 16 + title_width + 10, y + pad_top + 3, meta, meta_font, meta_color)
    if live:
        dot_x = x + w - 22
        canvas.draw.ellipse(
            [canvas.px(dot_x), canvas.px(y + pad_top + 6), canvas.px(dot_x + 7), canvas.px(y + pad_top + 13)],
            fill=color,
        )
    for index, line in enumerate(lines):
        canvas.text(x + 16, y + pad_top + 26 + index * line_height, line, body_font, body_color)
    return height


def transcript(name: str, *, dark: bool) -> None:
    if dark:
        bg = (24, 24, 27)
        panel = (32, 32, 36)
        title_color = (236, 236, 240)
        body_color = (176, 176, 186)
        meta_color = (128, 128, 140)
        user_bg = (38, 52, 74)
        user_fg = (214, 226, 244)
        palette = {
            "think": ((139, 124, 246), 7),
            "tool": ((47, 158, 110), 6),
            "command": ((201, 138, 46), 6),
            "context": ((59, 130, 196), 5),
        }
    else:
        bg = (250, 250, 251)
        panel = (255, 255, 255)
        title_color = (28, 28, 32)
        body_color = (78, 78, 88)
        meta_color = (132, 132, 144)
        user_bg = (226, 236, 250)
        user_fg = (30, 48, 76)
        palette = {
            "think": ((109, 79, 216), 9),
            "tool": ((31, 138, 92), 8),
            "command": ((176, 111, 20), 8),
            "context": ((42, 111, 176), 7),
        }

    canvas = Canvas(1000, 660, bg)
    canvas.box(0, 0, 1000, 660, 0, bg)
    canvas.box(24, 20, 952, 620, 12, panel)

    title_font = font(UI_BOLD, 13)
    meta_font = font(UI, 11)
    body_font = font(UI, 11)
    label_font = font(UI, 12)

    canvas.text(48, 40, "DSH · 会话", title_font, title_color)
    canvas.text(48, 60, "过程块在运行中展开，结束后折叠", meta_font, meta_color)

    # user turn
    canvas.box(560, 92, 392, 44, 10, user_bg)
    canvas.text(578, 104, "把构建脚本改成并行，然后跑一遍测试", label_font, user_fg)

    y = 156
    x, w = 48, 904

    color, tint = palette["think"]
    y += block(
        canvas, x, y, w, color, tint,
        "思考", "12s · 已折叠",
        [
            "先确认 package.json 里的 build 脚本，再决定并行度。",
            "测试要跑全量，避免只验证改动路径。",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
    ) + 10

    color, tint = palette["tool"]
    y += block(
        canvas, x, y, w, color, tint,
        "读取", "package.json · 运行中",
        [
            '"scripts": {',
            '  "build": "tsc -b && vite build",',
            '  "test": "vitest run"',
            "}",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
        live=True,
    ) + 10

    color, tint = palette["command"]
    y += block(
        canvas, x, y, w, color, tint,
        "运行", "pnpm build · 退出码 0",
        [
            "vite v6.0.3 building for production...",
            "· 412 modules transformed in 3.21s",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
    ) + 10

    color, tint = palette["context"]
    y += block(
        canvas, x, y, w, color, tint,
        "上下文注入", "AGENTS.md · 已折叠",
        ["仓库约定：不新增依赖，提交前跑 pnpm test。"],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
    ) + 14

    canvas.text(x, y, "构建已改为并行，测试全部通过。", label_font, title_color)
    canvas.save(name)


def settings(name: str) -> None:
    bg = (24, 24, 27)
    panel = (32, 32, 36)
    card = (38, 38, 43)
    title_color = (236, 236, 240)
    meta_color = (132, 132, 144)
    accent = (94, 140, 255)

    canvas = Canvas(1000, 660, bg)
    canvas.box(24, 20, 952, 620, 12, panel)

    title_font = font(UI_BOLD, 13)
    meta_font = font(UI, 11)
    label_font = font(UI, 12)
    small_font = font(UI, 11)

    canvas.text(48, 40, "设置 · 过程块样式", title_font, title_color)
    canvas.text(48, 60, "折叠规则、配色方案、每块展开策略", meta_font, meta_color)

    # fold rule card
    canvas.box(48, 88, 904, 76, 10, card)
    canvas.text(66, 102, "折叠规则", title_font, title_color)
    pills = ["运行时展开，结束后折叠", "全部展开", "全部折叠", "不干预"]
    px = 66
    for index, pill in enumerate(pills):
        width = canvas.draw.textlength(pill, font=label_font) / SCALE + 26
        active = index == 0
        canvas.box(px, 126, width, 26, 13, accent if active else (52, 52, 58))
        canvas.text(px + 13, 132, pill, label_font, (255, 255, 255) if active else meta_color)
        px += width + 8

    # group header
    canvas.box(48, 176, 904, 40, 10, card)
    canvas.text(66, 188, "过程块", title_font, title_color)
    canvas.text(126, 190, "暗色套", small_font, meta_color)
    canvas.text(920, 188, "6", small_font, meta_color)

    rows = [
        ("思考块", "#8b7cf6", "模型推理过程行", "运行时", True),
        ("工具块", "#2f9e6e", "工具调用行（最外层）", "运行时", True),
        ("命令卡", "#c98a2e", "其他命令输出卡片", "跟随全局", True),
        ("上下文注入", "#3b82c4", "注入的上下文正文", "运行时", True),
    ]
    y = 226
    for label, hex_color, hint, mode, on in rows:
        canvas.box(48, y, 904, 62, 10, (44, 44, 50))
        rgb = tuple(int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
        canvas.draw.ellipse(
            [canvas.px(66), canvas.px(y + 24), canvas.px(76), canvas.px(y + 34)], fill=rgb
        )
        canvas.text(86, y + 14, label, label_font, title_color)
        canvas.text(86, y + 34, hint, small_font, meta_color)
        canvas.text(86 + canvas.draw.textlength(label, font=label_font) / SCALE + 10, y + 16, hex_color, small_font, meta_color)
        # mode pill
        mode_width = canvas.draw.textlength(mode, font=small_font) / SCALE + 20
        canvas.box(760, y + 20, mode_width, 22, 11, (56, 56, 64))
        canvas.text(770, y + 24, mode, small_font, meta_color)
        # switch
        canvas.box(880, y + 21, 32, 18, 9, accent if on else (70, 70, 78))
        knob_x = 896 if on else 882
        canvas.draw.ellipse(
            [canvas.px(knob_x), canvas.px(y + 23), canvas.px(knob_x + 14), canvas.px(y + 37)],
            fill=(255, 255, 255),
        )
        y += 70

    canvas.text(48, y + 6, "改动立即生效，无需重启；配置保存在本浏览器。", small_font, meta_color)
    canvas.save(name)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    transcript("transcript-dark.png", dark=True)
    transcript("transcript-light.png", dark=False)
    settings("settings.png")


if __name__ == "__main__":
    main()
