import * as THREE from 'three';

import {
  FACIAL_CONTROLLER_BASIS_V1,
  FaceAnchorName,
  FaceControllerBasisDefinition,
  FaceControllerDefinition,
} from '../constants/facialControllerBasis';

export type Vec3Tuple = [number, number, number];

export interface FaceAnchorPoint {
  name: FaceAnchorName;
  position: Vec3Tuple;
  confidence?: number;
}

export interface FaceBoundsEstimate {
  headCenter?: Vec3Tuple;
  bboxMin?: Vec3Tuple;
  bboxMax?: Vec3Tuple;
  faceWidth?: number;
  faceHeight?: number;
  faceDepth?: number;
}

export interface PlacementDebugInfo {
  sourceAnchor: FaceAnchorName | null;
  fallbackAnchorUsed?: FaceAnchorName;
  mirroredFrom?: FaceAnchorName;
  inferred?: boolean;
}

export interface FacePlacementFrame {
  center: Vec3Tuple;
  right: Vec3Tuple;
  up: Vec3Tuple;
  forward: Vec3Tuple;
  faceWidth: number;
  faceHeight: number;
  faceDepth: number;
}

export interface PlacedFaceController {
  id: string;
  label: string;
  side: 'center' | 'left' | 'right';
  position: Vec3Tuple;
  rotationQuaternion: Vec3Tuple | [number, number, number, number];
  right: Vec3Tuple;
  up: Vec3Tuple;
  forward: Vec3Tuple;
  handleRadius: number;
  available: boolean;
  supportedExpressions: string[];
  debug: PlacementDebugInfo;
}

export interface PlacementDiagnostics {
  missingRequiredAnchors: FaceAnchorName[];
  synthesizedAnchors: FaceAnchorName[];
  inferredAnchors: FaceAnchorName[];
}

export interface FaceControllerPlacementResult {
  frame: FacePlacementFrame;
  anchors: Partial<Record<FaceAnchorName, Vec3Tuple>>;
  controllers: PlacedFaceController[];
  diagnostics: PlacementDiagnostics;
}

const DEFAULT_RIGHT = new THREE.Vector3(1, 0, 0);
const DEFAULT_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, 1);

const SYMMETRY_PAIRS: Array<[FaceAnchorName, FaceAnchorName]> = [
  ['jaw_left', 'jaw_right'],
  ['mouth_corner_left', 'mouth_corner_right'],
  ['eye_center_left', 'eye_center_right'],
  ['upper_lid_left', 'upper_lid_right'],
  ['lower_lid_left', 'lower_lid_right'],
  ['brow_inner_left', 'brow_inner_right'],
  ['brow_outer_left', 'brow_outer_right'],
  ['cheek_left', 'cheek_right'],
  ['temple_left', 'temple_right'],
];

const averageVec3 = (points: THREE.Vector3[]): THREE.Vector3 | null => {
  if (!points.length) {
    return null;
  }

  const sum = new THREE.Vector3();
  for (const point of points) {
    sum.add(point);
  }

  return sum.multiplyScalar(1 / points.length);
};

const tupleToVector = (value: Vec3Tuple): THREE.Vector3 =>
  new THREE.Vector3(value[0], value[1], value[2]);

const vectorToTuple = (value: THREE.Vector3): Vec3Tuple => [value.x, value.y, value.z];

const makeNormalized = (input: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 => {
  if (input.lengthSq() < 1e-8) {
    return fallback.clone();
  }

  return input.clone().normalize();
};

const orthogonalize = (
  candidate: THREE.Vector3,
  against: THREE.Vector3,
  fallback: THREE.Vector3,
): THREE.Vector3 => {
  const projected = candidate
    .clone()
    .sub(against.clone().multiplyScalar(candidate.dot(against)));

  return makeNormalized(projected, fallback);
};

const pickFirstDistance = (
  anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
  pairs: Array<[FaceAnchorName, FaceAnchorName]>,
): number | null => {
  for (const [a, b] of pairs) {
    if (anchors[a] && anchors[b]) {
      return anchors[a]!.distanceTo(anchors[b]!);
    }
  }

  return null;
};

const reflectAcrossSagittalPlane = (
  point: THREE.Vector3,
  center: THREE.Vector3,
  rightAxis: THREE.Vector3,
): THREE.Vector3 => {
  const delta = point.clone().sub(center);
  const mirroredDelta = delta.sub(rightAxis.clone().multiplyScalar(2 * delta.dot(rightAxis)));
  return center.clone().add(mirroredDelta);
};

const inferHeadCenter = (
  anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
  bounds?: FaceBoundsEstimate,
): THREE.Vector3 => {
  const candidates: THREE.Vector3[] = [];

  if (bounds?.headCenter) {
    candidates.push(tupleToVector(bounds.headCenter));
  }

  if (anchors.head_center) {
    candidates.push(anchors.head_center.clone());
  }

  const eyeMid = averageVec3(
    [anchors.eye_center_left, anchors.eye_center_right].filter(Boolean) as THREE.Vector3[],
  );
  if (eyeMid) {
    candidates.push(eyeMid);
  }

  if (anchors.nose_tip) {
    candidates.push(anchors.nose_tip.clone());
  }

  if (anchors.mouth_center) {
    candidates.push(anchors.mouth_center.clone());
  }

  const result = averageVec3(candidates);
  return result ?? new THREE.Vector3();
};

const buildFaceFrame = (
  anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
  bounds?: FaceBoundsEstimate,
): FacePlacementFrame => {
  const center = inferHeadCenter(anchors, bounds);

  let right = new THREE.Vector3();
  if (anchors.eye_center_left && anchors.eye_center_right) {
    right.copy(anchors.eye_center_right).sub(anchors.eye_center_left);
  } else if (anchors.mouth_corner_left && anchors.mouth_corner_right) {
    right.copy(anchors.mouth_corner_right).sub(anchors.mouth_corner_left);
  } else if (anchors.jaw_left && anchors.jaw_right) {
    right.copy(anchors.jaw_right).sub(anchors.jaw_left);
  }
  right = makeNormalized(right, DEFAULT_RIGHT);

  const upperCandidates: THREE.Vector3[] = [];
  if (anchors.forehead_center) {
    upperCandidates.push(anchors.forehead_center.clone());
  }
  if (anchors.brow_inner_left) {
    upperCandidates.push(anchors.brow_inner_left.clone());
  }
  if (anchors.brow_inner_right) {
    upperCandidates.push(anchors.brow_inner_right.clone());
  }
  const upper = averageVec3(upperCandidates);

  const lowerCandidates: THREE.Vector3[] = [];
  if (anchors.chin) {
    lowerCandidates.push(anchors.chin.clone());
  }
  if (anchors.lower_lip_mid) {
    lowerCandidates.push(anchors.lower_lip_mid.clone());
  }
  if (anchors.mouth_center) {
    lowerCandidates.push(anchors.mouth_center.clone());
  }
  const lower = averageVec3(lowerCandidates);

  let up = new THREE.Vector3();
  if (upper && lower) {
    up.copy(upper).sub(lower);
  } else if (anchors.nose_tip && anchors.mouth_center) {
    up.copy(anchors.nose_tip).sub(anchors.mouth_center);
  }
  up = orthogonalize(up, right, DEFAULT_UP);

  let forward = new THREE.Vector3();
  if (anchors.nose_tip) {
    forward.copy(anchors.nose_tip).sub(center);
  }
  forward = orthogonalize(forward, right, DEFAULT_FORWARD);
  forward = orthogonalize(forward, up, DEFAULT_FORWARD);

  const crossForward = new THREE.Vector3().crossVectors(right, up).normalize();
  if (crossForward.dot(forward) < 0) {
    forward.negate();
  } else if (forward.lengthSq() < 1e-8) {
    forward.copy(crossForward);
  }

  up = orthogonalize(up, forward, DEFAULT_UP);
  right = orthogonalize(right, up, DEFAULT_RIGHT);

  const faceWidth =
    bounds?.faceWidth ??
    pickFirstDistance(anchors, [
      ['temple_left', 'temple_right'],
      ['jaw_left', 'jaw_right'],
      ['mouth_corner_left', 'mouth_corner_right'],
      ['eye_center_left', 'eye_center_right'],
    ]) ??
    0.18;

  const faceHeight =
    bounds?.faceHeight ??
    pickFirstDistance(anchors, [
      ['forehead_center', 'chin'],
      ['brow_inner_left', 'lower_lip_mid'],
      ['brow_inner_right', 'lower_lip_mid'],
      ['nose_tip', 'chin'],
    ]) ??
    faceWidth * 1.25;

  const faceDepth =
    bounds?.faceDepth ??
    (() => {
      if (bounds?.bboxMin && bounds?.bboxMax) {
        return Math.abs(bounds.bboxMax[2] - bounds.bboxMin[2]) || faceWidth * 0.65;
      }
      return faceWidth * 0.65;
    })();

  return {
    center: vectorToTuple(center),
    right: vectorToTuple(right),
    up: vectorToTuple(up),
    forward: vectorToTuple(forward),
    faceWidth,
    faceHeight,
    faceDepth,
  };
};

const computeFrameVectors = (frame: FacePlacementFrame) => ({
  center: tupleToVector(frame.center),
  right: tupleToVector(frame.right),
  up: tupleToVector(frame.up),
  forward: tupleToVector(frame.forward),
});

class FacialControllerPlacementService {
  private toAnchorMap(points: FaceAnchorPoint[]): Partial<Record<FaceAnchorName, THREE.Vector3>> {
    const map: Partial<Record<FaceAnchorName, THREE.Vector3>> = {};
    for (const point of points) {
      map[point.name] = tupleToVector(point.position);
    }
    return map;
  }

  private synthesizeSymmetricAnchors(
    anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
    frame: FacePlacementFrame,
    diagnostics: PlacementDiagnostics,
  ): void {
    const vectors = computeFrameVectors(frame);

    for (const [leftName, rightName] of SYMMETRY_PAIRS) {
      const left = anchors[leftName];
      const right = anchors[rightName];

      if (left && !right) {
        anchors[rightName] = reflectAcrossSagittalPlane(left, vectors.center, vectors.right);
        diagnostics.synthesizedAnchors.push(rightName);
      } else if (!left && right) {
        anchors[leftName] = reflectAcrossSagittalPlane(right, vectors.center, vectors.right);
        diagnostics.synthesizedAnchors.push(leftName);
      }
    }
  }

  private inferDerivedAnchors(
    anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
    frame: FacePlacementFrame,
    diagnostics: PlacementDiagnostics,
  ): void {
    const vectors = computeFrameVectors(frame);

    if (!anchors.mouth_center && anchors.upper_lip_mid && anchors.lower_lip_mid) {
      anchors.mouth_center = averageVec3([anchors.upper_lip_mid, anchors.lower_lip_mid])!;
      diagnostics.inferredAnchors.push('mouth_center');
    }

    if (!anchors.head_center) {
      anchors.head_center = vectors.center.clone();
      diagnostics.inferredAnchors.push('head_center');
    }

    if (!anchors.forehead_center) {
      anchors.forehead_center = vectors.center
        .clone()
        .add(vectors.up.clone().multiplyScalar(frame.faceHeight * 0.38));
      diagnostics.inferredAnchors.push('forehead_center');
    }

    if (!anchors.chin && anchors.mouth_center) {
      anchors.chin = anchors.mouth_center
        .clone()
        .sub(vectors.up.clone().multiplyScalar(frame.faceHeight * 0.34));
      diagnostics.inferredAnchors.push('chin');
    }

    if (!anchors.cheek_left && anchors.mouth_corner_left && anchors.eye_center_left) {
      anchors.cheek_left = averageVec3([anchors.mouth_corner_left, anchors.eye_center_left])!;
      diagnostics.inferredAnchors.push('cheek_left');
    }

    if (!anchors.cheek_right && anchors.mouth_corner_right && anchors.eye_center_right) {
      anchors.cheek_right = averageVec3([anchors.mouth_corner_right, anchors.eye_center_right])!;
      diagnostics.inferredAnchors.push('cheek_right');
    }
  }

  private resolveAnchor(
    controller: FaceControllerDefinition,
    anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
    frame: FacePlacementFrame,
  ): {
    position: THREE.Vector3 | null;
    debug: PlacementDebugInfo;
  } {
    if (anchors[controller.anchor]) {
      return {
        position: anchors[controller.anchor]!.clone(),
        debug: { sourceAnchor: controller.anchor },
      };
    }

    for (const fallback of controller.fallbackAnchors ?? []) {
      if (anchors[fallback]) {
        return {
          position: anchors[fallback]!.clone(),
          debug: { sourceAnchor: fallback, fallbackAnchorUsed: fallback },
        };
      }
    }

    if (controller.id === 'head_root') {
      return {
        position: tupleToVector(frame.center),
        debug: { sourceAnchor: null, inferred: true },
      };
    }

    return {
      position: null,
      debug: { sourceAnchor: null },
    };
  }

  private applyPlacementOffset(
    position: THREE.Vector3,
    controller: FaceControllerDefinition,
    frame: FacePlacementFrame,
  ): THREE.Vector3 {
    const offset = controller.placementOffset;
    if (!offset) {
      return position;
    }

    const vectors = computeFrameVectors(frame);
    return position
      .clone()
      .add(vectors.right.multiplyScalar(offset.x * frame.faceWidth))
      .add(vectors.up.multiplyScalar(offset.y * frame.faceHeight))
      .add(vectors.forward.multiplyScalar(offset.z * frame.faceDepth));
  }

  private buildQuaternion(frame: FacePlacementFrame): [number, number, number, number] {
    const { right, up, forward } = computeFrameVectors(frame);
    const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
  }

  private createControllerPlacement(
    controller: FaceControllerDefinition,
    anchors: Partial<Record<FaceAnchorName, THREE.Vector3>>,
    frame: FacePlacementFrame,
  ): PlacedFaceController {
    const resolved = this.resolveAnchor(controller, anchors, frame);
    const quaternion = this.buildQuaternion(frame);

    if (!resolved.position) {
      return {
        id: controller.id,
        label: controller.label,
        side: controller.side,
        position: frame.center,
        rotationQuaternion: quaternion,
        right: frame.right,
        up: frame.up,
        forward: frame.forward,
        handleRadius: controller.handleRadius * ((frame.faceWidth + frame.faceHeight) * 0.5),
        available: false,
        supportedExpressions: controller.supportedExpressions,
        debug: resolved.debug,
      };
    }

    const placedPosition = this.applyPlacementOffset(resolved.position, controller, frame);

    return {
      id: controller.id,
      label: controller.label,
      side: controller.side,
      position: vectorToTuple(placedPosition),
      rotationQuaternion: quaternion,
      right: frame.right,
      up: frame.up,
      forward: frame.forward,
      handleRadius: controller.handleRadius * ((frame.faceWidth + frame.faceHeight) * 0.5),
      available: true,
      supportedExpressions: controller.supportedExpressions,
      debug: resolved.debug,
    };
  }

  placeControllers(
    anchors: FaceAnchorPoint[],
    bounds?: FaceBoundsEstimate,
    basis: FaceControllerBasisDefinition = FACIAL_CONTROLLER_BASIS_V1,
  ): FaceControllerPlacementResult {
    const anchorMap = this.toAnchorMap(anchors);
    const diagnostics: PlacementDiagnostics = {
      missingRequiredAnchors: [],
      synthesizedAnchors: [],
      inferredAnchors: [],
    };

    for (const requiredAnchor of basis.requiredAnchors) {
      if (!anchorMap[requiredAnchor]) {
        diagnostics.missingRequiredAnchors.push(requiredAnchor);
      }
    }

    let frame = buildFaceFrame(anchorMap, bounds);
    this.synthesizeSymmetricAnchors(anchorMap, frame, diagnostics);
    this.inferDerivedAnchors(anchorMap, frame, diagnostics);
    frame = buildFaceFrame(anchorMap, bounds);

    const controllers = basis.controllers.map((controller) =>
      this.createControllerPlacement(controller, anchorMap, frame),
    );

    const serializedAnchors: Partial<Record<FaceAnchorName, Vec3Tuple>> = {};
    for (const [name, position] of Object.entries(anchorMap)) {
      serializedAnchors[name as FaceAnchorName] = vectorToTuple(position as THREE.Vector3);
    }

    return {
      frame,
      anchors: serializedAnchors,
      controllers,
      diagnostics,
    };
  }
}

export const facialControllerPlacementService = new FacialControllerPlacementService();
