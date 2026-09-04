from __future__ import annotations

import base64
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple

import cv2
import numpy as np


EMOTIONS: Tuple[str, ...] = ("开心", "难过", "疲惫", "感激", "平静")

EMOTION_TAGS: Dict[str, list[str]] = {
    "开心": ["积极", "轻松", "外显愉悦"],
    "难过": ["低落", "需要安抚", "情绪偏负面"],
    "疲惫": ["疲劳", "能量偏低", "需要休息"],
    "感激": ["温和正向", "柔和", "信任"],
    "平静": ["稳定", "中性", "平和"],
}

EMOTION_HINTS: Dict[str, Dict[str, str]] = {
    "开心": {"valence": "positive", "arousal": "high"},
    "难过": {"valence": "negative", "arousal": "medium"},
    "疲惫": {"valence": "negative", "arousal": "low"},
    "感激": {"valence": "positive", "arousal": "low"},
    "平静": {"valence": "neutral", "arousal": "low"},
}

VOICE_CUES: Dict[str, Tuple[str, ...]] = {
    "开心": ("开心", "高兴", "快乐", "兴奋", "太好了", "真好", "哈哈", "happy", "great", "excited"),
    "难过": ("难过", "伤心", "委屈", "糟糕", "崩溃", "烦", "痛苦", "sad", "upset"),
    "疲惫": ("累", "好困", "疲惫", "没力气", "压力", "焦虑", "困", "tired", "stress", "anxious"),
    "感激": ("谢谢", "感谢", "麻烦你了", "感激", "多亏了你", "thank", "thanks", "appreciate"),
    "平静": ("还好", "可以", "一般", "嗯", "好的", "okay", "fine", "calm"),
}

HIGH_AROUSAL_CUES = ("!", "！", "特别", "非常", "真的", "激动", "着急", "紧张", "兴奋")
LOW_AROUSAL_CUES = ("...", "…", "累", "困", "疲惫", "没力气", "平静", "放松", "慢慢来")

FERPLUS_LABELS = ("neutral", "happiness", "surprise", "sadness", "anger", "disgust", "fear", "contempt")

_FACE_CASCADE = None
_FERPLUS_NET = None


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _normalize_distribution(scores: Dict[str, float]) -> Dict[str, float]:
    cleaned = {emotion: max(0.01, float(scores.get(emotion, 0.0))) for emotion in EMOTIONS}
    total = sum(cleaned.values())
    if total <= 0:
        return {emotion: round(1.0 / len(EMOTIONS), 4) for emotion in EMOTIONS}
    return {emotion: round(score / total, 4) for emotion, score in cleaned.items()}


def _make_unavailable_result(source: str, reason: str) -> Dict[str, Any]:
    distribution = {"开心": 0.11, "难过": 0.13, "疲惫": 0.14, "感激": 0.1, "平静": 0.52}
    hint = dict(EMOTION_HINTS["平静"])
    hint["source"] = source
    return {
        "emotion": "平静",
        "confidence": 0.2,
        "tags": EMOTION_TAGS["平静"],
        "distribution": distribution,
        "available": False,
        "source": source,
        "message": reason,
        "hint": hint,
    }


def _pick_from_distribution(
    distribution: Dict[str, float],
    source: str,
    message: str,
    *,
    metrics: Dict[str, float] | None = None,
    evidence: list[str] | None = None,
) -> Dict[str, Any]:
    top_two = sorted(distribution.items(), key=lambda item: item[1], reverse=True)[:2]
    primary_emotion = top_two[0][0]
    primary_score = top_two[0][1]
    secondary_score = top_two[1][1] if len(top_two) > 1 else 0.0
    confidence = round(min(0.96, 0.45 + primary_score * 0.45 + (primary_score - secondary_score) * 0.25), 2)
    hint = dict(EMOTION_HINTS.get(primary_emotion, EMOTION_HINTS["平静"]))
    hint["source"] = source
    result: Dict[str, Any] = {
        "emotion": primary_emotion,
        "confidence": confidence,
        "tags": EMOTION_TAGS.get(primary_emotion, EMOTION_TAGS["平静"]),
        "distribution": distribution,
        "available": True,
        "source": source,
        "message": message,
        "hint": hint,
    }
    if metrics:
        result["metrics"] = {key: round(float(value), 4) for key, value in metrics.items()}
    if evidence:
        result["evidence"] = evidence[:4]
    return result


def _landmark_map(face_result: Dict[str, Any]) -> Dict[str, Tuple[float, float]]:
    points: Dict[str, Tuple[float, float]] = {}
    for item in face_result.get("landmarks", []) or []:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        points[name] = (float(item.get("x", 0.0)), float(item.get("y", 0.0)))
    return points


def _safe_distance(a: Tuple[float, float] | None, b: Tuple[float, float] | None) -> float:
    if not a or not b:
        return 0.0
    return abs(float(a[0]) - float(b[0])) + abs(float(a[1]) - float(b[1]))


def _contains_any(text: str, cues: Iterable[str]) -> bool:
    normalized = (text or "").lower()
    return any(cue.lower() in normalized for cue in cues)


def _decode_image_payload(image_payload: str) -> Optional[np.ndarray]:
    payload = str(image_payload or "").strip()
    if not payload:
        return None
    if "," in payload:
        payload = payload.split(",", 1)[1]
    try:
        image_bytes = base64.b64decode(payload)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        if image_array.size == 0:
            return None
        return cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _softmax(scores: np.ndarray) -> np.ndarray:
    normalized = scores - np.max(scores)
    exp_scores = np.exp(normalized)
    return exp_scores / np.sum(exp_scores)


def _ensure_ascii_asset_dir() -> Path:
    asset_dir = Path(tempfile.gettempdir()) / "soullink_emotion_assets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    return asset_dir


def _ensure_ascii_copy(source: Path) -> Path:
    asset_dir = _ensure_ascii_asset_dir()
    target = asset_dir / source.name
    if not target.exists() or target.stat().st_size != source.stat().st_size:
        shutil.copyfile(source, target)
    return target


def _resolve_ferplus_model_path() -> Optional[Path]:
    workspace_root = Path(__file__).resolve().parents[1]
    candidates = [
        workspace_root / "models" / "checkpoints" / "emotion-ferplus-8.onnx",
        workspace_root / "bisheintereactive-main" / "bisheintereactive-main" / "models" / "checkpoints" / "emotion-ferplus-8.onnx",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _get_face_cascade():
    global _FACE_CASCADE
    if _FACE_CASCADE is None:
        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        cascade = cv2.CascadeClassifier(str(_ensure_ascii_copy(cascade_path)))
        if cascade.empty():
            return None
        _FACE_CASCADE = cascade
    return _FACE_CASCADE


def _get_ferplus_net():
    global _FERPLUS_NET
    if _FERPLUS_NET is None:
        model_path = _resolve_ferplus_model_path()
        if model_path is None:
            return None
        _FERPLUS_NET = cv2.dnn.readNetFromONNX(str(_ensure_ascii_copy(model_path)))
    return _FERPLUS_NET


def _convert_ferplus_distribution(raw_emotions: Dict[str, float]) -> Dict[str, float]:
    happiness = raw_emotions.get("happiness", 0.0)
    surprise = raw_emotions.get("surprise", 0.0)
    neutral = raw_emotions.get("neutral", 0.0)
    sadness = raw_emotions.get("sadness", 0.0)
    anger = raw_emotions.get("anger", 0.0)
    fear = raw_emotions.get("fear", 0.0)
    disgust = raw_emotions.get("disgust", 0.0)
    contempt = raw_emotions.get("contempt", 0.0)

    smile_bonus = 0.18 if happiness >= 0.45 else 0.0
    neutral_penalty = 0.12 if happiness >= 0.35 else 0.0

    distribution = {
        "开心": happiness * 1.3 + surprise * 0.42 + smile_bonus,
        "难过": sadness * 1.0 + anger * 0.72 + fear * 0.5 + disgust * 0.42,
        "疲惫": neutral * 0.18 + sadness * 0.16 + contempt * 0.18 + fear * 0.08,
        "感激": happiness * 0.52 + neutral * 0.18 + surprise * 0.12,
        "平静": max(0.0, neutral * 1.05 - neutral_penalty) + contempt * 0.06,
    }
    return _normalize_distribution(distribution)


def _analyze_face_emotion_with_model(image_payload: str) -> Optional[Dict[str, Any]]:
    image = _decode_image_payload(image_payload)
    if image is None:
        return None

    cascade = _get_face_cascade()
    net = _get_ferplus_net()
    if cascade is None or net is None:
        return None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if faces is None or len(faces) == 0:
        return None

    x, y, w, h = max(faces, key=lambda item: item[2] * item[3])
    face_roi = gray[y:y + h, x:x + w]
    if face_roi.size == 0:
        return None

    resized = cv2.resize(face_roi, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32)
    input_tensor = resized[np.newaxis, np.newaxis, :, :]

    try:
        net.setInput(input_tensor)
        output_scores = net.forward().reshape(-1)
    except Exception:
        return None

    probabilities = _softmax(output_scores)
    raw_emotions = {
        label: float(score)
        for label, score in zip(FERPLUS_LABELS, probabilities.tolist())
    }
    distribution = _convert_ferplus_distribution(raw_emotions)
    top_two = sorted(distribution.items(), key=lambda item: item[1], reverse=True)[:2]
    margin = top_two[0][1] - (top_two[1][1] if len(top_two) > 1 else 0.0)
    fer_top = max(raw_emotions, key=raw_emotions.get)
    result = _pick_from_distribution(
        distribution,
        "face",
        "已根据 FER+ 表情模型完成摄像头情绪识别",
        metrics={
            "face_width": float(w),
            "face_height": float(h),
            "margin": margin,
        },
        evidence=[
            f"box={w}x{h}",
            f"ferplus-top={fer_top}:{raw_emotions[fer_top]:.2f}",
            f"margin={margin:.2f}",
        ],
    )
    result["raw_scores"] = {key: round(value, 4) for key, value in raw_emotions.items()}
    result["face_box"] = {
        "x": round(float(x) / max(1, image.shape[1]), 4),
        "y": round(float(y) / max(1, image.shape[0]), 4),
        "width": round(float(w) / max(1, image.shape[1]), 4),
        "height": round(float(h) / max(1, image.shape[0]), 4),
    }
    result["inference"] = "ferplus_onnx"
    return result


def _analyze_face_emotion_from_landmarks(face_result: Dict[str, Any]) -> Dict[str, Any]:
    if not face_result or not face_result.get("ok"):
        message = (
            (face_result or {}).get("diagnostics", {}).get("message")
            or "未检测到可用人脸"
        )
        return _make_unavailable_result("face", message)

    points = _landmark_map(face_result)
    forehead = points.get("forehead_center")
    chin = points.get("chin")
    jaw_left = points.get("jaw_left")
    jaw_right = points.get("jaw_right")
    mouth_center = points.get("mouth_center")
    mouth_left = points.get("mouth_corner_left")
    mouth_right = points.get("mouth_corner_right")
    upper_lip = points.get("upper_lip_mid")
    lower_lip = points.get("lower_lip_mid")
    eye_left = points.get("eye_center_left")
    eye_right = points.get("eye_center_right")
    upper_lid_left = points.get("upper_lid_left")
    upper_lid_right = points.get("upper_lid_right")
    lower_lid_left = points.get("lower_lid_left")
    lower_lid_right = points.get("lower_lid_right")
    brow_inner_left = points.get("brow_inner_left")
    brow_inner_right = points.get("brow_inner_right")
    brow_outer_left = points.get("brow_outer_left")
    brow_outer_right = points.get("brow_outer_right")

    face_height = max(
        0.12,
        abs((chin or (0.5, 0.82))[1] - (forehead or (0.5, 0.18))[1]),
        float((face_result.get("faceBox") or {}).get("height") or 0.0),
    )
    face_width = max(
        0.1,
        abs((jaw_right or (0.82, 0.5))[0] - (jaw_left or (0.18, 0.5))[0]),
        float((face_result.get("faceBox") or {}).get("width") or 0.0),
    )

    avg_corner_y = ((mouth_left or (0.4, 0.65))[1] + (mouth_right or (0.6, 0.65))[1]) / 2.0
    smile_curve = ((mouth_center or (0.5, 0.66))[1] - avg_corner_y) / face_height
    mouth_open = abs((lower_lip or (0.5, 0.69))[1] - (upper_lip or (0.5, 0.63))[1]) / face_height
    mouth_width = abs((mouth_right or (0.62, 0.66))[0] - (mouth_left or (0.38, 0.66))[0]) / face_width
    eye_open = (
        abs((lower_lid_left or (0.35, 0.42))[1] - (upper_lid_left or (0.35, 0.38))[1]) +
        abs((lower_lid_right or (0.65, 0.42))[1] - (upper_lid_right or (0.65, 0.38))[1])
    ) / (2.0 * face_height)
    brow_lift = (
        abs((eye_left or (0.36, 0.41))[1] - (brow_inner_left or (0.4, 0.28))[1]) +
        abs((eye_right or (0.64, 0.41))[1] - (brow_inner_right or (0.6, 0.28))[1])
    ) / (2.0 * face_height)
    brow_spread = (
        abs((eye_left or (0.36, 0.41))[1] - (brow_outer_left or (0.28, 0.29))[1]) +
        abs((eye_right or (0.64, 0.41))[1] - (brow_outer_right or (0.72, 0.29))[1])
    ) / (2.0 * face_height)
    inner_brow_raise = max(0.0, brow_lift - brow_spread)

    scores = {
        "开心": 1.0 + max(0.0, smile_curve) * 7.4 + max(0.0, mouth_width - 0.32) * 3.2 + max(0.0, mouth_open - 0.03) * 1.6,
        "难过": 1.0 + max(0.0, -smile_curve) * 7.1 + inner_brow_raise * 3.8 + max(0.0, 0.024 - eye_open) * 4.2,
        "疲惫": 1.0 + max(0.0, 0.026 - eye_open) * 8.4 + max(0.0, 0.028 - mouth_open) * 1.6 + max(0.0, 0.33 - mouth_width) * 1.2,
        "感激": 1.0 + max(0.0, smile_curve) * 3.6 + max(0.0, 0.06 - mouth_open) * 1.5 + max(0.0, brow_lift - 0.09) * 1.8,
        "平静": 1.25 + max(0.0, 0.02 - abs(smile_curve)) * 5.2 + max(0.0, eye_open - 0.018) * 1.6,
    }

    if smile_curve > 0.01 and mouth_open < 0.055 and scores["开心"] > scores["平静"]:
        scores["感激"] += 0.65
    if eye_open < 0.02 and smile_curve < 0.004:
        scores["疲惫"] += 0.55

    distribution = _normalize_distribution(scores)
    evidence = [
        f"smile_curve={smile_curve:.3f}",
        f"mouth_open={mouth_open:.3f}",
        f"eye_open={eye_open:.3f}",
        f"brow_lift={brow_lift:.3f}",
    ]
    metrics = {
        "smile_curve": smile_curve,
        "mouth_open": mouth_open,
        "mouth_width_ratio": mouth_width,
        "eye_open_ratio": eye_open,
        "brow_lift_ratio": brow_lift,
        "inner_brow_raise": inner_brow_raise,
        "shape_hint": _safe_distance(forehead, chin) + _safe_distance(jaw_left, jaw_right),
    }
    return _pick_from_distribution(
        distribution,
        "face",
        "已根据摄像头画面完成表情识别",
        metrics=metrics,
        evidence=evidence,
    )


def analyze_face_emotion(face_result: Dict[str, Any] | None, image_payload: str | None = None) -> Dict[str, Any]:
    model_result = _analyze_face_emotion_with_model(image_payload or "")
    if model_result is not None:
        return model_result
    return _analyze_face_emotion_from_landmarks(face_result or {})


def analyze_voice_emotion(text: str, audio_metrics: Dict[str, float] | None = None) -> Dict[str, Any]:
    normalized_text = (text or "").strip()
    text_lower = normalized_text.lower()
    energy = float((audio_metrics or {}).get("energy", 0.0))
    duration_sec = float((audio_metrics or {}).get("duration_sec", 0.0))
    speaking_peak = float((audio_metrics or {}).get("peak", 0.0))

    if not normalized_text and duration_sec <= 0.0:
        return _make_unavailable_result("voice", "未采集到有效语音")

    scores = {emotion: 1.0 for emotion in EMOTIONS}
    evidence: list[str] = []

    for emotion, cues in VOICE_CUES.items():
        hits = [cue for cue in cues if cue.lower() in text_lower]
        if hits:
            evidence.extend(hits[:2])
            scores[emotion] += len(hits) * {
                "开心": 1.2,
                "难过": 1.3,
                "疲惫": 1.35,
                "感激": 1.15,
                "平静": 0.85,
            }[emotion]

    if _contains_any(normalized_text, HIGH_AROUSAL_CUES):
        scores["开心"] += 0.45
        scores["难过"] += 0.35
    if _contains_any(normalized_text, LOW_AROUSAL_CUES):
        scores["疲惫"] += 0.55
        scores["平静"] += 0.3

    if energy >= 0.62:
        scores["开心"] += 0.55
        scores["难过"] += 0.22
    elif energy <= 0.2:
        scores["疲惫"] += 0.6
        scores["平静"] += 0.36
        scores["开心"] -= 0.15

    if speaking_peak >= 0.88:
        scores["开心"] += 0.18
        scores["难过"] += 0.14

    if "谢谢" in normalized_text or "感谢" in normalized_text or "thanks" in text_lower:
        scores["感激"] += 0.8
    if any(cue in normalized_text for cue in ("累", "疲惫", "困", "没力气", "好困")):
        scores["疲惫"] += 0.8
    if any(cue in normalized_text for cue in ("难过", "伤心", "委屈", "想哭")):
        scores["难过"] += 0.85
    if any(cue in normalized_text for cue in ("开心", "高兴", "兴奋", "太好了")):
        scores["开心"] += 0.82

    if not normalized_text:
        scores["平静"] += 0.35

    distribution = _normalize_distribution(scores)
    metrics = {
        "duration_sec": duration_sec,
        "energy": energy,
        "peak": speaking_peak,
    }
    message = "已根据语音转写和声学强度完成语音情绪识别"
    if not normalized_text:
        message = "已根据语音强度完成基础语音情绪识别"
    return _pick_from_distribution(
        distribution,
        "voice",
        message,
        metrics=metrics,
        evidence=evidence,
    )
