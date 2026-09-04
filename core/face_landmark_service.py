import base64
import os
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp  # type: ignore
except Exception:
    mp = None

try:
    from mediapipe.tasks.python import vision  # type: ignore
    from mediapipe.tasks.python.core.base_options import BaseOptions  # type: ignore
except Exception:
    vision = None
    BaseOptions = None


LandmarkDict = Dict[str, float]


def _decode_data_url(data_url: str) -> np.ndarray:
    payload = str(data_url or "").strip()
    if not payload:
        raise ValueError("empty image payload")

    if "," in payload:
        payload = payload.split(",", 1)[1]

    image_bytes = base64.b64decode(payload)
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("failed to decode image")
    return image


def _clip01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _make_landmark(name: str, x: float, y: float, confidence: float) -> Dict[str, float]:
    return {
        "name": name,
        "x": _clip01(x),
        "y": _clip01(y),
        "confidence": _clip01(confidence),
    }


def _average_points(points: List[Tuple[float, float]]) -> Tuple[float, float]:
    if not points:
        return 0.5, 0.5
    x = sum(point[0] for point in points) / len(points)
    y = sum(point[1] for point in points) / len(points)
    return x, y


def _sort_left_right(
    first: Tuple[float, float],
    second: Tuple[float, float],
) -> Tuple[Tuple[float, float], Tuple[float, float]]:
    return (first, second) if first[0] <= second[0] else (second, first)


def _safe_detect(
    cascade: cv2.CascadeClassifier,
    image: np.ndarray,
    scale_factor: float,
    min_neighbors: int,
    min_size: Tuple[int, int],
) -> List[Tuple[int, int, int, int]]:
    if cascade.empty():
        return []
    detections = cascade.detectMultiScale(
        image,
        scaleFactor=scale_factor,
        minNeighbors=min_neighbors,
        minSize=min_size,
    )
    if detections is None:
        return []
    return [tuple(int(v) for v in rect) for rect in detections]


class FaceLandmarkService:
    def __init__(self) -> None:
        cascade_root = cv2.data.haarcascades
        self.face_cascade = cv2.CascadeClassifier(
            cascade_root + "haarcascade_frontalface_default.xml"
        )
        self.eye_cascade = cv2.CascadeClassifier(cascade_root + "haarcascade_eye.xml")
        self.smile_cascade = cv2.CascadeClassifier(cascade_root + "haarcascade_smile.xml")
        self.face_landmarker_model_path = self._resolve_face_landmarker_model_path()

    def detect_from_data_url(self, data_url: str, preferred_method: str = "auto") -> Dict:
        image = _decode_data_url(data_url)
        return self.detect(image, preferred_method=preferred_method)

    def detect(self, image_bgr: np.ndarray, preferred_method: str = "auto") -> Dict:
        preferred = str(preferred_method or "auto").strip().lower()

        detector_order: List[str]
        if preferred == "face_landmarker":
            detector_order = ["face_landmarker", "face_mesh", "opencv"]
        elif preferred == "face_mesh":
            detector_order = ["face_mesh", "face_landmarker", "opencv"]
        elif preferred == "opencv":
            detector_order = ["opencv", "face_mesh", "face_landmarker"]
        else:
            detector_order = ["face_landmarker", "face_mesh", "opencv"]

        for detector_name in detector_order:
            if detector_name == "face_landmarker":
                face_landmarker_result = self._detect_with_face_landmarker(image_bgr)
                if face_landmarker_result:
                    return face_landmarker_result
            elif detector_name == "face_mesh":
                mediapipe_result = self._detect_with_mediapipe(image_bgr)
                if mediapipe_result:
                    return mediapipe_result
            elif detector_name == "opencv":
                opencv_result = self._detect_with_opencv(image_bgr)
                if opencv_result:
                    return opencv_result

        return {
            "ok": False,
            "method": "none",
            "imageWidth": int(image_bgr.shape[1]),
            "imageHeight": int(image_bgr.shape[0]),
            "landmarks": [],
            "diagnostics": {
                "message": "No face detector matched the rendered head image.",
                "mediapipeAvailable": bool(mp),
                "faceLandmarkerAvailable": bool(
                    vision and BaseOptions and self.face_landmarker_model_path
                ),
                "faceLandmarkerModelPath": self.face_landmarker_model_path,
            },
        }

    def _resolve_face_landmarker_model_path(self) -> Optional[str]:
        candidates = [
            os.environ.get("FACE_LANDMARKER_MODEL_PATH", "").strip(),
            os.path.join(os.getcwd(), "models", "mediapipe", "face_landmarker.task"),
            os.path.join(os.getcwd(), "models", "face_landmarker.task"),
            os.path.join(os.getcwd(), "assets", "mediapipe", "face_landmarker.task"),
        ]

        for candidate in candidates:
            if candidate and os.path.isfile(candidate):
                return os.path.abspath(candidate)
        return None

    def _build_landmark_response(
        self,
        face_landmarks: List,
        width: int,
        height: int,
        method: str,
        message: str,
    ) -> Dict:
        def point(index: int) -> Tuple[float, float]:
            landmark = face_landmarks[index]
            return float(landmark.x), float(landmark.y)

        eye_a = _average_points([point(33), point(133), point(159), point(145)])
        eye_b = _average_points([point(263), point(362), point(386), point(374)])
        eye_left, eye_right = _sort_left_right(eye_a, eye_b)

        upper_lid_a = point(159)
        upper_lid_b = point(386)
        upper_lid_left, upper_lid_right = _sort_left_right(upper_lid_a, upper_lid_b)

        lower_lid_a = point(145)
        lower_lid_b = point(374)
        lower_lid_left, lower_lid_right = _sort_left_right(lower_lid_a, lower_lid_b)

        brow_inner_a = point(55)
        brow_inner_b = point(285)
        brow_inner_left, brow_inner_right = _sort_left_right(brow_inner_a, brow_inner_b)

        brow_outer_a = point(46)
        brow_outer_b = point(276)
        brow_outer_left, brow_outer_right = _sort_left_right(brow_outer_a, brow_outer_b)

        mouth_corner_a = point(61)
        mouth_corner_b = point(291)
        mouth_corner_left, mouth_corner_right = _sort_left_right(
            mouth_corner_a, mouth_corner_b
        )

        jaw_a = point(234)
        jaw_b = point(454)
        jaw_left, jaw_right = _sort_left_right(jaw_a, jaw_b)

        temple_a = point(127)
        temple_b = point(356)
        temple_left, temple_right = _sort_left_right(temple_a, temple_b)

        cheek_a = point(93)
        cheek_b = point(323)
        cheek_left, cheek_right = _sort_left_right(cheek_a, cheek_b)

        upper_lip_mid = point(13)
        lower_lip_mid = point(14)
        mouth_center = _average_points([upper_lip_mid, lower_lip_mid])
        nose_tip = point(1)
        chin = point(152)
        forehead_base = _average_points(
            [brow_inner_left, brow_inner_right, brow_outer_left, brow_outer_right]
        )
        brow_mid = _average_points([brow_inner_left, brow_inner_right])
        forehead_center = (
            forehead_base[0],
            _clip01(forehead_base[1] - max(0.04, abs(mouth_center[1] - brow_mid[1]) * 0.55)),
        )
        head_center = _average_points([eye_left, eye_right, nose_tip, mouth_center])

        all_x = [float(landmark.x) for landmark in face_landmarks]
        all_y = [float(landmark.y) for landmark in face_landmarks]
        face_box = {
            "x": _clip01(min(all_x)),
            "y": _clip01(min(all_y)),
            "width": _clip01(max(all_x) - min(all_x)),
            "height": _clip01(max(all_y) - min(all_y)),
        }

        landmarks = [
            _make_landmark("head_center", *head_center, 0.98),
            _make_landmark("forehead_center", *forehead_center, 0.92),
            _make_landmark("nose_tip", *nose_tip, 0.99),
            _make_landmark("chin", *chin, 0.98),
            _make_landmark("jaw_left", *jaw_left, 0.94),
            _make_landmark("jaw_right", *jaw_right, 0.94),
            _make_landmark("mouth_center", *mouth_center, 0.99),
            _make_landmark("mouth_corner_left", *mouth_corner_left, 0.98),
            _make_landmark("mouth_corner_right", *mouth_corner_right, 0.98),
            _make_landmark("upper_lip_mid", *upper_lip_mid, 0.98),
            _make_landmark("lower_lip_mid", *lower_lip_mid, 0.98),
            _make_landmark("eye_center_left", *eye_left, 0.97),
            _make_landmark("eye_center_right", *eye_right, 0.97),
            _make_landmark("upper_lid_left", *upper_lid_left, 0.96),
            _make_landmark("upper_lid_right", *upper_lid_right, 0.96),
            _make_landmark("lower_lid_left", *lower_lid_left, 0.96),
            _make_landmark("lower_lid_right", *lower_lid_right, 0.96),
            _make_landmark("brow_inner_left", *brow_inner_left, 0.92),
            _make_landmark("brow_inner_right", *brow_inner_right, 0.92),
            _make_landmark("brow_outer_left", *brow_outer_left, 0.92),
            _make_landmark("brow_outer_right", *brow_outer_right, 0.92),
            _make_landmark("cheek_left", *cheek_left, 0.88),
            _make_landmark("cheek_right", *cheek_right, 0.88),
            _make_landmark("temple_left", *temple_left, 0.86),
            _make_landmark("temple_right", *temple_right, 0.86),
        ]

        return {
            "ok": True,
            "method": method,
            "imageWidth": width,
            "imageHeight": height,
            "faceBox": face_box,
            "landmarks": landmarks,
            "diagnostics": {
                "message": message,
                "mediapipeAvailable": bool(mp),
                "faceLandmarkerAvailable": bool(
                    vision and BaseOptions and self.face_landmarker_model_path
                ),
                "faceLandmarkerModelPath": self.face_landmarker_model_path,
            },
        }

    def _detect_with_face_landmarker(self, image_bgr: np.ndarray) -> Optional[Dict]:
        if not vision or not BaseOptions or not self.face_landmarker_model_path:
            return None

        height, width = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

        try:
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            options = vision.FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=self.face_landmarker_model_path),
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
                num_faces=1,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            with vision.FaceLandmarker.create_from_options(options) as detector:
                result = detector.detect(image)
        except Exception:
            return None

        if not result or not result.face_landmarks:
            return None

        return self._build_landmark_response(
            result.face_landmarks[0],
            width,
            height,
            "mediapipe_face_landmarker",
            "Detected landmarks from MediaPipe Face Landmarker.",
        )

    def _detect_with_mediapipe(self, image_bgr: np.ndarray) -> Optional[Dict]:
        if mp is None:
            return None

        height, width = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)

        try:
            with mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            ) as face_mesh:
                results = face_mesh.process(rgb)
        except Exception:
            return None

        if not results or not results.multi_face_landmarks:
            return None

        return self._build_landmark_response(
            results.multi_face_landmarks[0].landmark,
            width,
            height,
            "mediapipe_face_mesh",
            "Detected landmarks from MediaPipe Face Mesh.",
        )

    def _detect_with_opencv(self, image_bgr: np.ndarray) -> Optional[Dict]:
        height, width = image_bgr.shape[:2]
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        faces = _safe_detect(
            self.face_cascade,
            gray,
            scale_factor=1.1,
            min_neighbors=5,
            min_size=(max(40, width // 5), max(40, height // 5)),
        )
        if not faces:
            return None

        face_x, face_y, face_w, face_h = max(faces, key=lambda rect: rect[2] * rect[3])
        face_roi_gray = gray[face_y : face_y + face_h, face_x : face_x + face_w]

        eyes_roi = face_roi_gray[0 : max(1, int(face_h * 0.55)), :]
        eye_boxes = _safe_detect(
            self.eye_cascade,
            eyes_roi,
            scale_factor=1.08,
            min_neighbors=5,
            min_size=(max(12, face_w // 10), max(8, face_h // 12)),
        )

        eye_centers: List[Tuple[float, float]] = []
        for ex, ey, ew, eh in sorted(eye_boxes, key=lambda rect: rect[2] * rect[3], reverse=True):
            eye_centers.append(
                (
                    (face_x + ex + ew * 0.5) / width,
                    (face_y + ey + eh * 0.5) / height,
                )
            )
            if len(eye_centers) == 2:
                break

        mouth_roi_y = face_y + int(face_h * 0.52)
        mouth_roi_gray = gray[mouth_roi_y : face_y + face_h, face_x : face_x + face_w]
        smile_boxes = _safe_detect(
            self.smile_cascade,
            mouth_roi_gray,
            scale_factor=1.15,
            min_neighbors=12,
            min_size=(max(18, face_w // 5), max(10, face_h // 10)),
        )
        smile_box = max(smile_boxes, key=lambda rect: rect[2] * rect[3]) if smile_boxes else None

        left_eye = ((face_x + face_w * 0.32) / width, (face_y + face_h * 0.38) / height)
        right_eye = ((face_x + face_w * 0.68) / width, (face_y + face_h * 0.38) / height)
        if len(eye_centers) == 2:
            left_eye, right_eye = _sort_left_right(eye_centers[0], eye_centers[1])

        mouth_center = ((face_x + face_w * 0.5) / width, (face_y + face_h * 0.72) / height)
        mouth_width = face_w * 0.34
        mouth_height = face_h * 0.08
        if smile_box is not None:
            sx, sy, sw, sh = smile_box
            mouth_center = (
                (face_x + sx + sw * 0.5) / width,
                (mouth_roi_y + sy + sh * 0.55) / height,
            )
            mouth_width = max(mouth_width, sw)
            mouth_height = max(mouth_height, sh * 0.45)

        brow_y = min(left_eye[1], right_eye[1]) - (face_h / height) * 0.14
        brow_y = _clip01(brow_y)
        brow_inner_left = (_clip01(left_eye[0] + face_w / width * 0.07), brow_y)
        brow_inner_right = (_clip01(right_eye[0] - face_w / width * 0.07), brow_y)
        brow_outer_left = (_clip01(left_eye[0] - face_w / width * 0.1), _clip01(brow_y + 0.01))
        brow_outer_right = (_clip01(right_eye[0] + face_w / width * 0.1), _clip01(brow_y + 0.01))

        upper_lid_left = (left_eye[0], _clip01(left_eye[1] - face_h / height * 0.035))
        upper_lid_right = (right_eye[0], _clip01(right_eye[1] - face_h / height * 0.035))
        lower_lid_left = (left_eye[0], _clip01(left_eye[1] + face_h / height * 0.035))
        lower_lid_right = (right_eye[0], _clip01(right_eye[1] + face_h / height * 0.035))

        jaw_left = ((face_x + face_w * 0.16) / width, (face_y + face_h * 0.82) / height)
        jaw_right = ((face_x + face_w * 0.84) / width, (face_y + face_h * 0.82) / height)
        cheek_left = ((face_x + face_w * 0.22) / width, (face_y + face_h * 0.58) / height)
        cheek_right = ((face_x + face_w * 0.78) / width, (face_y + face_h * 0.58) / height)
        temple_left = ((face_x + face_w * 0.12) / width, (face_y + face_h * 0.24) / height)
        temple_right = ((face_x + face_w * 0.88) / width, (face_y + face_h * 0.24) / height)

        landmarks = [
            _make_landmark(
                "head_center",
                (face_x + face_w * 0.5) / width,
                (face_y + face_h * 0.46) / height,
                0.88,
            ),
            _make_landmark(
                "forehead_center",
                (face_x + face_w * 0.5) / width,
                (face_y + face_h * 0.18) / height,
                0.78,
            ),
            _make_landmark(
                "nose_tip",
                (face_x + face_w * 0.5) / width,
                (face_y + face_h * 0.55) / height,
                0.84,
            ),
            _make_landmark(
                "chin",
                (face_x + face_w * 0.5) / width,
                (face_y + face_h * 0.94) / height,
                0.82,
            ),
            _make_landmark("jaw_left", *jaw_left, 0.74),
            _make_landmark("jaw_right", *jaw_right, 0.74),
            _make_landmark("mouth_center", *mouth_center, 0.86),
            _make_landmark(
                "mouth_corner_left",
                _clip01(mouth_center[0] - mouth_width / width * 0.5),
                mouth_center[1],
                0.8,
            ),
            _make_landmark(
                "mouth_corner_right",
                _clip01(mouth_center[0] + mouth_width / width * 0.5),
                mouth_center[1],
                0.8,
            ),
            _make_landmark(
                "upper_lip_mid",
                mouth_center[0],
                _clip01(mouth_center[1] - mouth_height / height * 0.5),
                0.8,
            ),
            _make_landmark(
                "lower_lip_mid",
                mouth_center[0],
                _clip01(mouth_center[1] + mouth_height / height * 0.5),
                0.8,
            ),
            _make_landmark("eye_center_left", *left_eye, 0.84),
            _make_landmark("eye_center_right", *right_eye, 0.84),
            _make_landmark("upper_lid_left", *upper_lid_left, 0.76),
            _make_landmark("upper_lid_right", *upper_lid_right, 0.76),
            _make_landmark("lower_lid_left", *lower_lid_left, 0.76),
            _make_landmark("lower_lid_right", *lower_lid_right, 0.76),
            _make_landmark("brow_inner_left", *brow_inner_left, 0.72),
            _make_landmark("brow_inner_right", *brow_inner_right, 0.72),
            _make_landmark("brow_outer_left", *brow_outer_left, 0.7),
            _make_landmark("brow_outer_right", *brow_outer_right, 0.7),
            _make_landmark("cheek_left", *cheek_left, 0.68),
            _make_landmark("cheek_right", *cheek_right, 0.68),
            _make_landmark("temple_left", *temple_left, 0.64),
            _make_landmark("temple_right", *temple_right, 0.64),
        ]

        return {
            "ok": True,
            "method": "opencv_haar",
            "imageWidth": width,
            "imageHeight": height,
            "faceBox": {
                "x": face_x / width,
                "y": face_y / height,
                "width": face_w / width,
                "height": face_h / height,
            },
            "landmarks": landmarks,
            "diagnostics": {
                "message": "Detected face region from OpenCV Haar cascades.",
                "mediapipeAvailable": bool(mp),
                "faceLandmarkerAvailable": bool(
                    vision and BaseOptions and self.face_landmarker_model_path
                ),
                "faceLandmarkerModelPath": self.face_landmarker_model_path,
                "eyeDetections": len(eye_centers),
                "smileDetected": smile_box is not None,
            },
        }


face_landmark_service = FaceLandmarkService()
