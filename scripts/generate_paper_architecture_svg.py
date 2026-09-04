from __future__ import annotations

from pathlib import Path


WIDTH = 1800
HEIGHT = 1040


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


class SvgBuilder:
    def __init__(self, width: int, height: int) -> None:
        self.width = width
        self.height = height
        self.parts: list[str] = []

    def add(self, text: str) -> None:
        self.parts.append(text)

    def rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        *,
        fill: str = "#FFFFFF",
        stroke: str = "#CBD5E1",
        stroke_width: int = 2,
        rx: int = 20,
        dash: str | None = None,
        opacity: float | None = None,
    ) -> None:
        extra = []
        if dash:
            extra.append(f'stroke-dasharray="{dash}"')
        if opacity is not None:
            extra.append(f'opacity="{opacity}"')
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{stroke_width}" {" ".join(extra)} />'
        )

    def text(
        self,
        x: int,
        y: int,
        lines: list[str],
        *,
        size: int = 28,
        weight: str = "600",
        fill: str = "#0F172A",
        anchor: str = "middle",
        line_gap: int = 36,
    ) -> None:
        tspans = []
        for idx, line in enumerate(lines):
            dy = "0" if idx == 0 else str(line_gap)
            tspans.append(f'<tspan x="{x}" dy="{dy}">{esc(line)}</tspan>')
        self.add(
            f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
            f'font-family="Microsoft YaHei, PingFang SC, Arial, sans-serif" '
            f'font-size="{size}" font-weight="{weight}" fill="{fill}">'
            + "".join(tspans)
            + "</text>"
        )

    def line(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        *,
        color: str = "#475569",
        width: int = 3,
        marker_end: bool = False,
        dash: str | None = None,
    ) -> None:
        marker = 'marker-end="url(#arrow)"' if marker_end else ""
        dash_attr = f'stroke-dasharray="{dash}"' if dash else ""
        self.add(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{width}" {marker} {dash_attr} />'
        )

    def polyline(
        self,
        points: list[tuple[int, int]],
        *,
        color: str = "#475569",
        width: int = 3,
        marker_end: bool = False,
        dash: str | None = None,
        fill: str = "none",
    ) -> None:
        pts = " ".join(f"{x},{y}" for x, y in points)
        marker = 'marker-end="url(#arrow)"' if marker_end else ""
        dash_attr = f'stroke-dasharray="{dash}"' if dash else ""
        self.add(
            f'<polyline points="{pts}" fill="{fill}" stroke="{color}" '
            f'stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" '
            f'{marker} {dash_attr} />'
        )

    def tag(
        self,
        x: int,
        y: int,
        label: str,
        *,
        fill: str = "#DBEAFE",
        stroke: str = "#60A5FA",
        text_fill: str = "#1D4ED8",
    ) -> None:
        self.rect(x, y, 112, 36, fill=fill, stroke=stroke, stroke_width=2, rx=18)
        self.text(x + 56, y + 25, [label], size=18, fill=text_fill, weight="700")

    def box(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        title_lines: list[str],
        *,
        fill: str,
        stroke: str,
        title_size: int = 26,
        title_fill: str = "#0F172A",
        subtitle_lines: list[str] | None = None,
        subtitle_size: int = 18,
        subtitle_fill: str = "#475569",
    ) -> None:
        self.rect(x, y, w, h, fill=fill, stroke=stroke, stroke_width=2, rx=24)
        title_y = y + 42
        self.text(
            x + w // 2,
            title_y,
            title_lines,
            size=title_size,
            fill=title_fill,
            weight="700",
            line_gap=32,
        )
        if subtitle_lines:
            subtitle_y = y + h - 26 - (len(subtitle_lines) - 1) * 22
            self.text(
                x + w // 2,
                subtitle_y,
                subtitle_lines,
                size=subtitle_size,
                fill=subtitle_fill,
                weight="500",
                line_gap=24,
            )

    def export(self) -> str:
        header = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#F8FBFF" />
    <stop offset="100%" stop-color="#FFFFFF" />
  </linearGradient>
  <linearGradient id="groupBlue" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#EEF6FF" />
    <stop offset="100%" stop-color="#F8FBFF" />
  </linearGradient>
  <linearGradient id="groupGold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#FFF7EA" />
    <stop offset="100%" stop-color="#FFFDF7" />
  </linearGradient>
  <linearGradient id="groupGray" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#F6F8FB" />
    <stop offset="100%" stop-color="#FCFDFE" />
  </linearGradient>
  <marker id="arrow" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L14,7 L0,14 z" fill="#475569" />
  </marker>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#94A3B8" flood-opacity="0.18" />
  </filter>
</defs>
'''
        footer = "</svg>\n"
        return header + "".join(self.parts) + footer


def build_svg() -> str:
    s = SvgBuilder(WIDTH, HEIGHT)
    s.rect(0, 0, WIDTH, HEIGHT, fill="url(#bg)", stroke="none", stroke_width=0, rx=0)

    # Title
    s.text(90, 66, ["SoulLink 个性化情感交互数字人系统总体架构"], size=34, anchor="start", weight="700")
    s.text(
        90,
        102,
        ["面向论文插图的学术化重绘版本：突出多模态感知、情感认知决策、个性化表达与角色资产闭环"],
        size=18,
        anchor="start",
        weight="500",
        fill="#64748B",
    )

    # Main group
    s.rect(64, 132, 1672, 468, fill="url(#groupBlue)", stroke="#BFDBFE", stroke_width=2, rx=32)
    s.text(98, 174, ["A. 多模态情感交互主链路"], size=24, anchor="start", fill="#1D4ED8")

    # Support group
    s.rect(64, 640, 1672, 320, fill="url(#groupGray)", stroke="#94A3B8", stroke_width=2, rx=32, dash="10 8")
    s.text(98, 682, ["B. 角色生成与动作驱动支撑链路"], size=24, anchor="start", fill="#334155")

    # Section labels
    s.tag(96, 204, "输入层", fill="#E0F2FE", stroke="#38BDF8", text_fill="#0369A1")
    s.tag(416, 204, "感知层", fill="#DBEAFE", stroke="#60A5FA", text_fill="#1D4ED8")
    s.tag(832, 204, "认知决策层", fill="#FEF3C7", stroke="#F59E0B", text_fill="#B45309")
    s.tag(1288, 204, "表达层", fill="#EDE9FE", stroke="#A78BFA", text_fill="#6D28D9")

    # Top main boxes
    s.box(96, 258, 170, 96, ["文本输入"], fill="#FFFFFF", stroke="#94A3B8", title_size=28)
    s.box(96, 388, 170, 96, ["语音输入"], fill="#FFFFFF", stroke="#94A3B8", title_size=28)
    s.box(96, 518, 170, 96, ["面部视频"], fill="#FFFFFF", stroke="#94A3B8", title_size=28)

    s.box(352, 258, 200, 96, ["对话预处理"], fill="#E8F2FF", stroke="#7AA4D8", title_size=26)
    s.box(352, 388, 200, 96, ["语音识别", "（ASR）"], fill="#E8F2FF", stroke="#7AA4D8", title_size=24)
    s.box(352, 518, 200, 96, ["视觉线索提取"], fill="#E8F2FF", stroke="#7AA4D8", title_size=24)

    s.box(
        624,
        320,
        224,
        136,
        ["多模态情绪识别"],
        fill="#E8F2FF",
        stroke="#5B8FD9",
        title_size=26,
        subtitle_lines=["文本语义 / 语音韵律 / 面部表情"],
        subtitle_size=17,
    )
    s.tag(676, 274, "创新点 1", fill="#DBEAFE", stroke="#60A5FA", text_fill="#1D4ED8")

    s.box(
        930,
        248,
        220,
        96,
        ["用户画像与", "历史记忆"],
        fill="#ECFDF5",
        stroke="#68B984",
        title_size=24,
    )
    s.box(
        930,
        390,
        220,
        96,
        ["情感策略生成"],
        fill="#FFF3E0",
        stroke="#D6A96C",
        title_size=26,
        subtitle_lines=["情绪标签 -> 回应策略"],
        subtitle_size=17,
    )
    s.box(
        1220,
        320,
        240,
        136,
        ["LLM 上下文融合", "与回复规划"],
        fill="#FFF3E0",
        stroke="#D6A96C",
        title_size=26,
        subtitle_lines=["角色设定 + 历史上下文 + 情感状态"],
        subtitle_size=17,
    )
    s.tag(1002, 202, "个性化 1", fill="#DCFCE7", stroke="#4ADE80", text_fill="#15803D")

    s.box(1524, 248, 164, 96, ["文本回复"], fill="#F5F3FF", stroke="#A78BFA", title_size=26)
    s.box(1524, 388, 164, 96, ["TTS 语音", "合成"], fill="#F5F3FF", stroke="#A78BFA", title_size=24)
    s.box(
        1440,
        528,
        248,
        104,
        ["三维数字人表达"],
        fill="#F5F3FF",
        stroke="#8B5CF6",
        title_size=26,
        subtitle_lines=["文本 / 语音 / 表情 / 动作联动"],
        subtitle_size=17,
    )
    s.tag(1488, 486, "个性化 2", fill="#EDE9FE", stroke="#A78BFA", text_fill="#6D28D9")

    # Support pipeline boxes
    s.box(112, 736, 184, 92, ["角色创建请求"], fill="#FFFFFF", stroke="#94A3B8", title_size=24)
    s.box(348, 736, 216, 92, ["角色属性生成"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)
    s.box(632, 736, 214, 92, ["基础模型生成", "（Hunyuan3D）"], fill="#F1F5F9", stroke="#94A3B8", title_size=22)
    s.box(914, 736, 218, 92, ["自动骨骼绑定", "（Make-It-Animatable）"], fill="#F1F5F9", stroke="#94A3B8", title_size=21)
    s.box(1200, 736, 192, 92, ["动作资源生成"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)
    s.box(1460, 736, 204, 92, ["模型资产管理"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)

    s.box(492, 876, 220, 92, ["前端渲染加载"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)
    s.box(792, 876, 228, 92, ["动作状态控制"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)
    s.box(1100, 876, 236, 92, ["Three.js 驱动播放"], fill="#F1F5F9", stroke="#94A3B8", title_size=24)

    # Main flow arrows
    s.line(266, 306, 352, 306, marker_end=True)
    s.line(266, 436, 352, 436, marker_end=True)
    s.line(266, 566, 352, 566, marker_end=True)
    s.polyline([(552, 306), (590, 306), (590, 360), (624, 360)], marker_end=True)
    s.polyline([(552, 436), (624, 436)], marker_end=True)
    s.polyline([(552, 566), (590, 566), (590, 416), (624, 416)], marker_end=True)

    s.line(848, 388, 930, 388, marker_end=True)
    s.line(1150, 296, 1150, 350, marker_end=True)
    s.line(1150, 438, 1220, 438, marker_end=True)
    s.line(848, 388, 900, 388, marker_end=False)
    s.line(1150, 344, 1220, 344, marker_end=True)
    s.line(1460, 388, 1524, 388, marker_end=True)
    s.line(1460, 388, 1460, 296, marker_end=False)
    s.line(1460, 296, 1524, 296, marker_end=True)

    s.line(1606, 344, 1606, 388, marker_end=True)
    s.polyline([(1606, 484), (1606, 506), (1564, 506), (1564, 528)], marker_end=True)
    s.polyline([(1606, 344), (1712, 344), (1712, 580), (1688, 580)], marker_end=True)
    s.text(1712, 310, ["文本输出"], size=20, anchor="start", fill="#334155")
    s.text(1712, 582, ["语音 / 动作输出"], size=20, anchor="start", fill="#334155")

    # Personalization / dashed guidance
    s.polyline([(1040, 344), (1040, 390)], color="#16A34A", width=3, marker_end=True)
    s.polyline([(1040, 248), (1040, 202), (1538, 202), (1538, 248)], color="#16A34A", width=2, dash="8 6")

    # Support flow arrows
    s.line(296, 782, 348, 782, marker_end=True)
    s.line(564, 782, 632, 782, marker_end=True)
    s.line(846, 782, 914, 782, marker_end=True)
    s.line(1132, 782, 1200, 782, marker_end=True)
    s.line(1392, 782, 1460, 782, marker_end=True)

    s.polyline([(1460, 828), (1460, 922), (1336, 922)], marker_end=True)
    s.line(712, 922, 792, 922, marker_end=True)
    s.line(1020, 922, 1100, 922, marker_end=True)

    # Bridge from support to expression layer
    s.polyline([(1218, 922), (1380, 922), (1380, 580), (1440, 580)], color="#475569", width=3, marker_end=True)
    s.text(1364, 904, ["模型与动作资产注入"], size=18, anchor="end", fill="#64748B")

    # Small academic notes
    s.rect(96, 912, 300, 38, fill="#FFFFFF", stroke="#CBD5E1", stroke_width=1, rx=18, opacity=0.95)
    s.text(246, 937, ["多模态输入统一映射为结构化情感状态"], size=16, fill="#64748B", weight="500")

    s.rect(1098, 158, 324, 38, fill="#FFFFFF", stroke="#FCD34D", stroke_width=1, rx=18, opacity=0.95)
    s.text(1260, 183, ["情感状态、角色设定与历史记忆协同参与回复决策"], size=16, fill="#92400E", weight="500")

    s.rect(620, 972, 560, 40, fill="#FFFFFF", stroke="#CBD5E1", stroke_width=1, rx=20, opacity=0.98)
    s.text(900, 999, ["注：上层为交互主流程，下层为角色资产生成与驱动支撑流程，两者在三维数字人表达端汇合"], size=17, fill="#475569", weight="500")

    return s.export()


def main() -> None:
    output_dir = Path("docs") / "figures"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "soullink_paper_architecture.svg"
    output_path.write_text(build_svg(), encoding="utf-8")
    print(output_path)


if __name__ == "__main__":
    main()
