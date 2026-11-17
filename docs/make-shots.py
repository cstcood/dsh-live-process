"""Render the README screenshots.

The plugin styles a live transcript, so the honest illustration is the transcript
itself: same block kinds, same accent bars, same tints, same elapsed badges,
drawn at 2x and downscaled for a crisp result. Run with the bundled Python:

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

    def width_of(self, value: str, fnt) -> float:
        return self.draw.textlength(value, font=fnt) / SCALE

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
    elapsed: str | None = None,
    rich_lines: dict[int, list[tuple[str, bool]]] | None = None,
    code_bg: tuple[int, int, int] | None = None,
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
    cursor = x + 16 + canvas.width_of(title, title_font) + 10
    canvas.text(cursor, y + pad_top + 3, meta, meta_font, meta_color)
    if elapsed is not None:
        cursor += canvas.width_of(meta, meta_font) + 8
        canvas.text(cursor, y + pad_top + 3, elapsed, meta_font, color if live else meta_color)
    if live:
        dot_x = x + w - 22
        canvas.draw.ellipse(
            [canvas.px(dot_x), canvas.px(y + pad_top + 6), canvas.px(dot_x + 7), canvas.px(y + pad_top + 13)],
            fill=color,
        )
    for index, line in enumerate(lines):
        line_y = y + pad_top + 26 + index * line_height
        segments = None if rich_lines is None else rich_lines.get(index)
        if segments is None:
            canvas.text(x + 16, line_y, line, body_font, body_color)
            continue
        cursor = x + 16
        for text, is_code in segments:
            width = canvas.width_of(text, body_font)
            if is_code:
                canvas.box(cursor - 2, line_y - 1, width + 4, 15, 3, code_bg or body_color)
            canvas.text(cursor, line_y, text, body_font, body_color)
            cursor += width
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
        code_bg = (60, 60, 70)
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
        code_bg = (224, 224, 232)
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
    canvas.text(48, 60, "过程块在运行中展开，结束后折叠，标题后跟耗时", meta_font, meta_color)

    # user turn
    canvas.box(560, 92, 392, 44, 10, user_bg)
    canvas.text(578, 104, "把构建脚本改成并行，然后跑一遍测试", label_font, user_fg)

    y = 156
    x, w = 48, 904

    color, tint = palette["think"]
    y += block(
        canvas, x, y, w, color, tint,
        "思考", "已折叠",
        [
            "先确认 build 脚本，再决定并行度。",
            "测试要跑全量，避免只验证改动路径。",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
        elapsed="12.4s",
        rich_lines={0: [("先确认 ", False), ("build", True), (" 脚本，再决定并行度。", False)]},
        code_bg=code_bg,
    ) + 10

    color, tint = palette["tool"]
    y += block(
        canvas, x, y, w, color, tint,
        "读取", "package.json",
        [
            '"scripts": {',
            '  "build": "tsc -b && vite build",',
            '  "test": "vitest run"',
            "}",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
        live=True, elapsed="1.8s",
    ) + 10

    color, tint = palette["command"]
    y += block(
        canvas, x, y, w, color, tint,
        "运行", "退出码 0",
        [
            "vite v6.0.3 building for production...",
            "· 412 modules transformed in 3.21s",
        ],
        title_font=title_font, meta_font=meta_font, body_font=body_font,
        title_color=title_color, meta_color=meta_color, body_color=body_color,
        elapsed="3.2s",
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


def pill(canvas: Canvas, x: float, y: float, label: str, fnt, active: bool, accent) -> float:
    width = canvas.width_of(label, fnt) + 26
    canvas.box(x, y, width, 26, 13, accent if active else (52, 52, 58))
    canvas.text(x + 13, y + 6, label, fnt, (255, 255, 255) if active else (132, 132, 144))
    return width


def toggle(canvas: Canvas, x: float, y: float, on: bool, accent) -> None:
    canvas.box(x, y, 32, 18, 9, accent if on else (70, 70, 78))
    knob_x = x + 16 if on else x + 2
    canvas.draw.ellipse(
        [canvas.px(knob_x), canvas.px(y + 2), canvas.px(knob_x + 14), canvas.px(y + 16)],
        fill=(255, 255, 255),
    )


def slider(
    canvas: Canvas,
    x: float,
    y: float,
    w: float,
    label: str,
    value: int,
    maximum: int,
    suffix: str,
    label_font,
    value_font,
    label_color,
    value_color,
    accent,
) -> None:
    canvas.text(x, y, label, label_font, label_color)
    canvas.text(x + w + 10, y + 1, f"{value}{suffix}", value_font, value_color)
    track_y = y + 24
    canvas.box(x, track_y, w, 4, 2, (58, 58, 66))
    filled = max(3.0, w * value / maximum)
    canvas.box(x, track_y, filled, 4, 2, accent)
    canvas.draw.ellipse(
        [canvas.px(x + filled - 6), canvas.px(track_y - 5), canvas.px(x + filled + 6), canvas.px(track_y + 7)],
        fill=(228, 228, 236),
    )


def settings(name: str) -> None:
    bg = (24, 24, 27)
    panel = (32, 32, 36)
    card = (38, 38, 43)
    block_card = (44, 44, 50)
    title_color = (236, 236, 240)
    meta_color = (132, 132, 144)
    accent = (94, 140, 255)

    canvas = Canvas(1000, 980, bg)
    canvas.box(24, 20, 952, 940, 12, panel)

    title_font = font(UI_BOLD, 13)
    meta_font = font(UI, 11)
    label_font = font(UI, 12)
    small_font = font(UI, 11)

    canvas.text(48, 40, "设置 · 过程块样式", title_font, title_color)
    canvas.text(48, 60, "折叠规则、折叠时机、耗时开关、配色方案、每块展开策略", meta_font, meta_color)

    # fold rule card: modes, timing, timer switch
    canvas.box(48, 88, 904, 156, 10, card)
    canvas.text(66, 102, "折叠规则", title_font, title_color)
    px = 66
    for index, label in enumerate(["运行时展开，结束后折叠", "全部展开", "全部折叠", "不干预"]):
        px += pill(canvas, px, 126, label, label_font, index == 0, accent) + 8

    canvas.text(66, 166, "折叠时机", small_font, meta_color)
    px = 66
    for index, label in enumerate(["下一条出现时", "结束即折叠"]):
        px += pill(canvas, px, 184, label, small_font, index == 0, accent) + 8

    canvas.text(66, 220, "显示耗时", label_font, title_color)
    canvas.text(140, 222, "工具行、命令卡与思考行标题后显示运行时长", small_font, meta_color)
    toggle(canvas, 880, 219, True, accent)

    # process block group
    canvas.box(48, 256, 904, 40, 10, card)
    canvas.text(66, 268, "过程块", title_font, title_color)
    canvas.text(126, 270, "暗色套", small_font, meta_color)
    canvas.text(920, 268, "6", small_font, meta_color)

    rows = [
        ("思考块", "#8b7cf6", "模型推理过程行", "运行时", True),
        ("工具块", "#2f9e6e", "工具调用行（最外层）", "运行时", True),
        ("命令卡", "#c98a2e", "其他命令输出卡片", "跟随全局", True),
        ("上下文注入", "#3b82c4", "注入的上下文正文", "运行时", True),
    ]
    y = 306
    for label, hex_color, hint, mode, on in rows:
        canvas.box(48, y, 904, 62, 10, block_card)
        rgb = tuple(int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
        canvas.draw.ellipse(
            [canvas.px(66), canvas.px(y + 24), canvas.px(76), canvas.px(y + 34)], fill=rgb
        )
        canvas.text(86, y + 14, label, label_font, title_color)
        canvas.text(86, y + 34, hint, small_font, meta_color)
        canvas.text(86 + canvas.width_of(label, label_font) + 10, y + 16, hex_color, small_font, meta_color)
        mode_width = canvas.width_of(mode, small_font) + 20
        canvas.box(760, y + 20, mode_width, 22, 11, (56, 56, 64))
        canvas.text(770, y + 24, mode, small_font, meta_color)
        toggle(canvas, 880, y + 21, on, accent)
        y += 70

    # common group (expanded, carries the two code tints)
    canvas.box(48, 596, 904, 40, 10, card)
    canvas.text(66, 608, "通用", title_font, title_color)
    canvas.text(112, 610, "暗色套 · 几何与代码底色", small_font, meta_color)
    canvas.text(920, 608, "8", small_font, meta_color)

    canvas.box(48, 646, 904, 176, 10, block_card)
    sliders = [
        ("运行态浓度", 13, 60, "%"),
        ("色条宽度", 3, 8, "px"),
        ("圆角", 8, 20, "px"),
        ("上下内边距", 7, 24, "px"),
        ("右内边距", 12, 40, "px"),
        ("左内边距", 14, 40, "px"),
        ("行内代码底色", 12, 40, "%"),
        ("代码块底色", 8, 40, "%"),
    ]
    for index, (label, value, maximum, suffix) in enumerate(sliders):
        column, row = index % 2, index // 2
        sx = 66 + column * 448
        sy = 662 + row * 40
        slider(
            canvas, sx, sy, 350, label, value, maximum, suffix,
            small_font, small_font, meta_color, title_color, accent,
        )

    # diagnostics group
    canvas.box(48, 834, 904, 40, 10, card)
    canvas.text(66, 846, "诊断", title_font, title_color)
    canvas.text(112, 848, "v1.7.0", small_font, meta_color)
    canvas.text(920, 846, "11", small_font, meta_color)

    canvas.box(48, 884, 904, 68, 10, block_card)
    metrics = [
        ("思考行", "3"), ("思考已展开", "1"), ("工具行", "5"), ("工具已展开", "1"),
        ("工具运行中", "1"), ("工具准备中", "0"), ("工具可展开", "4"), ("命令卡", "2"),
        ("上下文注入", "1"), ("贴底中", "是"), ("拉回次数", "0"),
    ]
    for index, (label, value) in enumerate(metrics):
        column, row = index % 4, index // 4
        mx = 66 + column * 224
        my = 896 + row * 18
        canvas.text(mx, my, label, small_font, meta_color)
        canvas.text(mx + 150, my, value, small_font, title_color)

    canvas.save(name)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    transcript("transcript-dark.png", dark=True)
    transcript("transcript-light.png", dark=False)
    settings("settings.png")


if __name__ == "__main__":
    main()
