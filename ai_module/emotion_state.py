from __future__ import annotations

from typing import Any, Dict, Optional


_NEGATIVE_HINTS = (
    "难过", "伤心", "痛苦", "崩溃", "委屈", "失落", "压抑", "烦", "烦躁", "焦虑",
    "紧张", "害怕", "孤独", "累", "疲惫", "没意思", "想哭", "失眠", "压力", "难受",
    "sad", "anxious", "anxiety", "depressed", "upset", "tired", "stress",
)

_POSITIVE_HINTS = (
    "开心", "高兴", "兴奋", "激动", "幸福", "放松", "安心", "期待", "满足", "喜欢",
    "快乐", "好开心", "真棒", "好耶", "happy", "excited", "great", "good", "relaxed",
)

_HIGH_AROUSAL_HINTS = (
    "特别", "非常", "太", "真的", "激动", "崩溃", "着急", "急", "烦躁", "气死",
    "愤怒", "害怕", "紧张", "兴奋", "开心死了", "!!!", "！！", "?", "？",
)

_LOW_AROUSAL_HINTS = (
    "累", "疲惫", "没力气", "不想动", "低落", "压抑", "无助", "睡不着", "困",
    "麻木", "空落落", "平静", "放松", "慢慢来",
)


def _contains_any(text: str, hints: tuple[str, ...]) -> bool:
    text = (text or "").lower()
    return any(hint.lower() in text for hint in hints)


def _infer_arousal(text: str, valence: str, voice_hint: Optional[Dict[str, Any]]) -> str:
    if voice_hint:
        hint_arousal = str(voice_hint.get("arousal") or "").strip().lower()
        if hint_arousal in {"high", "medium", "low"}:
            return hint_arousal

    if _contains_any(text, _HIGH_AROUSAL_HINTS):
        return "high"
    if _contains_any(text, _LOW_AROUSAL_HINTS):
        return "low"
    if valence == "negative" and len(text or "") <= 8:
        return "low"
    return "medium"


def _pick_strategy(valence: str, arousal: str) -> str:
    if valence == "negative" and arousal == "low":
        return "comfort"
    if valence == "negative" and arousal == "high":
        return "stabilize"
    if valence == "positive":
        return "resonate"
    return "support"


def _pick_tool_suggestions(valence: str, arousal: str) -> list[str]:
    suggestions: list[str] = []
    if valence == "negative":
        suggestions.append("emotion_support_plan")
        suggestions.append("care_music_recommend")
        if arousal in {"high", "medium"}:
            suggestions.append("get_schedules")
    elif valence == "positive":
        suggestions.append("emotion_support_plan")
    else:
        suggestions.append("emotion_support_plan")
    return suggestions


def build_emotion_state(
    text: str,
    *,
    input_source: str = "text",
    text_label: Optional[str] = None,
    text_raw_id: Optional[int] = None,
    voice_hint: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_source = input_source if input_source in {"text", "voice", "multimodal"} else "text"
    valence = text_label if text_label in {"negative", "neutral", "positive"} else "neutral"

    if text_label is None:
        if _contains_any(text, _NEGATIVE_HINTS):
            valence = "negative"
        elif _contains_any(text, _POSITIVE_HINTS):
            valence = "positive"

    if voice_hint:
        voice_valence = str(voice_hint.get("valence") or "").strip().lower()
        if voice_valence in {"negative", "neutral", "positive"}:
            if valence == "neutral":
                valence = voice_valence
                normalized_source = "voice"
            elif voice_valence == valence:
                normalized_source = "multimodal"

    arousal = _infer_arousal(text, valence, voice_hint)
    strategy = _pick_strategy(valence, arousal)
    confidence = 0.55
    if text_label is not None:
        confidence += 0.2
    if voice_hint:
        confidence += 0.1
    confidence = min(confidence, 0.95)

    if strategy == "comfort":
        care_style = "先安抚和共情，再给一个轻量建议，避免说教。"
    elif strategy == "stabilize":
        care_style = "先帮助用户稳定情绪，放慢节奏，再给简单可执行建议。"
    elif strategy == "resonate":
        care_style = "先共鸣和庆祝，再顺势延展话题或行动建议。"
    else:
        care_style = "保持支持性语气，先理解用户，再给清晰帮助。"

    return {
        "valence": valence,
        "arousal": arousal,
        "confidence": round(confidence, 2),
        "strategy": strategy,
        "care_style": care_style,
        "source": normalized_source,
        "text_label": text_label,
        "text_raw_id": text_raw_id,
        "voice_hint": voice_hint or {},
        "tool_suggestions": _pick_tool_suggestions(valence, arousal),
        "summary": f"{valence}/{arousal} via {normalized_source}",
    }


def format_emotion_observation(state: Dict[str, Any]) -> str:
    if not state:
        return ""
    suggestions = ",".join(state.get("tool_suggestions") or [])
    return (
        "emotion_state: "
        f"valence={state.get('valence', 'neutral')}; "
        f"arousal={state.get('arousal', 'medium')}; "
        f"strategy={state.get('strategy', 'support')}; "
        f"source={state.get('source', 'text')}; "
        f"confidence={state.get('confidence', 0.0)}; "
        f"care_style={state.get('care_style', '')}; "
        f"tool_suggestions={suggestions}"
    )
