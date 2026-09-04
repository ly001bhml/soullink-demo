from __future__ import annotations

from typing import Optional, Tuple

from utils import config_util as cfg
from utils import util

try:
    from ai_module import baidu_emotion
except Exception:
    baidu_emotion = None


# Baidu sentiment labels: 0=negative, 1=neutral, 2=positive
_SENTIMENT_LABELS = {
    0: "negative",
    1: "neutral",
    2: "positive",
}


def detect_text_emotion(text: str) -> Tuple[Optional[str], Optional[int]]:
    """
    Detect sentiment from text and return (label, raw_id).
    label can be: negative | neutral | positive | None
    raw_id is the provider sentiment id when available.
    """
    if text is None or not str(text).strip():
        return None, None

    try:
        cfg.load_config()
    except Exception:
        # config load failure should not block main flow
        pass

    if (
        baidu_emotion
        and cfg.baidu_emotion_app_id
        and cfg.baidu_emotion_api_key
        and cfg.baidu_emotion_secret_key
    ):
        try:
            sentiment_id = baidu_emotion.get_sentiment(str(text))
            label = _SENTIMENT_LABELS.get(sentiment_id)
            return label, sentiment_id
        except Exception as exc:
            util.log(1, f"[Emotion] Baidu sentiment failed: {exc}")
            return None, None

    # No provider configured
    return None, None

