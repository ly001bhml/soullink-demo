import { getFayApiUrl } from './apiConfig';

export interface FaceImageLandmark {
  name: string;
  x: number;
  y: number;
  confidence?: number;
}

export interface FaceImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarkDetectionResult {
  ok: boolean;
  method: string;
  imageWidth: number;
  imageHeight: number;
  landmarks: FaceImageLandmark[];
  faceBox?: FaceImageBox;
  diagnostics?: Record<string, unknown>;
  message?: string;
}

export type FaceLandmarkPreferredMethod =
  | 'auto'
  | 'face_landmarker'
  | 'face_mesh'
  | 'opencv';

export async function detectFaceLandmarksFromImage(
  image: string,
  preferredMethod: FaceLandmarkPreferredMethod = 'auto',
): Promise<FaceLandmarkDetectionResult | null> {
  const apiUrl = getFayApiUrl().replace(/\/+$/, '');
  const response = await fetch(`${apiUrl}/api/face/landmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image,
      preferredMethod,
    }),
  });

  if (!response.ok) {
    throw new Error(`Face landmark request failed: ${response.status}`);
  }

  const payload = (await response.json()) as FaceLandmarkDetectionResult & {
    code?: number;
  };

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (!Array.isArray(payload.landmarks)) {
    return {
      ...payload,
      landmarks: [],
    };
  }

  return payload;
}
