import * as THREE from 'three';

export interface FaceDriverTarget {
  jawOpen: number;
  blinkLeft: number;
  blinkRight: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  squintLeft: number;
  squintRight: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  mouthWide: number;
  mouthPucker: number;
  lipPress: number;
  upperLipRaise: number;
  lowerLipDrop: number;
  cheekRaiseLeft: number;
  cheekRaiseRight: number;
  browUpLeft: number;
  browUpRight: number;
  browDownLeft: number;
  browDownRight: number;
}

type FaceDriverKey = keyof FaceDriverTarget;

interface MorphBinding {
  mesh: THREE.Mesh;
  index: number;
  weight: number;
}

interface BoneBinding {
  bone: THREE.Bone;
  baseQuaternion: THREE.Quaternion;
}

interface GeometryDeltaChannel {
  indices: Uint32Array;
  weights: Float32Array;
  directions: Float32Array;
  amplitude: number;
}

interface GeometryBinding {
  mesh: THREE.Mesh;
  positionAttribute: THREE.BufferAttribute;
  basePositions: Float32Array;
  channels: Partial<Record<FaceDriverKey, GeometryDeltaChannel>>;
}

export interface FaceRigBinding {
  available: boolean;
  morphs: Partial<Record<FaceDriverKey, MorphBinding[]>>;
  bones: {
    jaw?: BoneBinding;
    eyeLeft?: BoneBinding;
    eyeRight?: BoneBinding;
  };
  geometry?: GeometryBinding;
  current: FaceDriverTarget;
  diagnostics: {
    morphChannelCount: number;
    boneChannelCount: number;
    geometryChannelCount: number;
    matchedMorphNames: string[];
    matchedBoneNames: string[];
  };
}

const DEFAULT_TARGET: FaceDriverTarget = {
  jawOpen: 0,
  blinkLeft: 0,
  blinkRight: 0,
  eyeWideLeft: 0,
  eyeWideRight: 0,
  squintLeft: 0,
  squintRight: 0,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
  mouthWide: 0,
  mouthPucker: 0,
  lipPress: 0,
  upperLipRaise: 0,
  lowerLipDrop: 0,
  cheekRaiseLeft: 0,
  cheekRaiseRight: 0,
  browUpLeft: 0,
  browUpRight: 0,
  browDownLeft: 0,
  browDownRight: 0,
};

const MORPH_ALIASES: Record<FaceDriverKey, string[]> = {
  jawOpen: ['jawopen', 'jaw_open', 'openjaw', 'mouthopen', 'visemeaa', 'mouthaa'],
  blinkLeft: ['blinkleft', 'blink_l', 'eyeblinkleft', 'eyecloseleft', 'eyeblink_l'],
  blinkRight: ['blinkright', 'blink_r', 'eyeblinkright', 'eyecloseright', 'eyeblink_r'],
  eyeWideLeft: ['eyewideleft', 'eyewide_l', 'eyeswideleft', 'eyeswide_l'],
  eyeWideRight: ['eyewideright', 'eyewide_r', 'eyeswideright', 'eyeswide_r'],
  squintLeft: ['squintleft', 'eyeSquintleft', 'eyesquint_l', 'cheeksquintleft'],
  squintRight: ['squintright', 'eyeSquintright', 'eyesquint_r', 'cheeksquintright'],
  mouthSmileLeft: ['mouthsmileleft', 'smileleft', 'mouth_left_smile', 'mouthgrinleft'],
  mouthSmileRight: ['mouthsmileright', 'smileright', 'mouth_right_smile', 'mouthgrinright'],
  mouthWide: ['mouthwide', 'mouthstretch', 'visemee', 'visemeih'],
  mouthPucker: ['mouthpucker', 'mouthfunnel', 'visemeoh', 'visemeou'],
  lipPress: ['lippress', 'mouthpress', 'mouthclose', 'visemepp'],
  upperLipRaise: ['upperlipraise', 'upperlipup', 'mouthupperup', 'uppershrug', 'mouthshrugupper', 'visemeff'],
  lowerLipDrop: ['lowerlipdrop', 'lowerlipdown', 'mouthlowerdown', 'lowershrug', 'mouthshruglower'],
  cheekRaiseLeft: ['cheekraiseleft', 'cheeksquintleft', 'cheekupleft'],
  cheekRaiseRight: ['cheekraiseright', 'cheeksquintright', 'cheekupright'],
  browUpLeft: ['browupleft', 'browinnerupleft', 'eyebrowupleft'],
  browUpRight: ['browupright', 'browinnerupright', 'eyebrowupright'],
  browDownLeft: ['browdownleft', 'browlowerleft', 'browouterdownleft'],
  browDownRight: ['browdownright', 'browlowerright', 'browouterdownright'],
};

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const findMorphKey = (name: string): FaceDriverKey | null => {
  const normalized = normalizeName(name);
  for (const [key, aliases] of Object.entries(MORPH_ALIASES) as Array<[FaceDriverKey, string[]]>) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return key;
    }
  }
  return null;
};

const isBone = (object: THREE.Object3D): object is THREE.Bone => object.type === 'Bone';

const addMorphBinding = (
  map: Partial<Record<FaceDriverKey, MorphBinding[]>>,
  key: FaceDriverKey,
  binding: MorphBinding,
) => {
  const existing = map[key] ?? [];
  existing.push(binding);
  map[key] = existing;
};

const smoothWeight = (distance: number, radius: number) => {
  if (radius <= 1e-6 || distance >= radius) {
    return 0;
  }
  const t = 1 - distance / radius;
  return t * t * (3 - 2 * t);
};

const makeChannel = (
  entries: Array<{ index: number; weight: number; direction: THREE.Vector3 }>,
  amplitude: number,
): GeometryDeltaChannel | undefined => {
  if (!entries.length) {
    return undefined;
  }

  const indices = new Uint32Array(entries.length);
  const weights = new Float32Array(entries.length);
  const directions = new Float32Array(entries.length * 3);

  entries.forEach((entry, offset) => {
    indices[offset] = entry.index;
    weights[offset] = entry.weight;
    directions[offset * 3] = entry.direction.x;
    directions[offset * 3 + 1] = entry.direction.y;
    directions[offset * 3 + 2] = entry.direction.z;
  });

  return {
    indices,
    weights,
    directions,
    amplitude,
  };
};

export const faceDriverService = {
  createRigBinding(root: THREE.Object3D): FaceRigBinding {
    const morphs: Partial<Record<FaceDriverKey, MorphBinding[]>> = {};
    const matchedMorphNames: string[] = [];
    const matchedBoneNames: string[] = [];
    const bones: FaceRigBinding['bones'] = {};

    root.traverse((object) => {
      const mesh = object as THREE.Mesh & {
        morphTargetDictionary?: Record<string, number>;
        morphTargetInfluences?: number[];
      };

      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        Object.entries(mesh.morphTargetDictionary).forEach(([name, index]) => {
          const key = findMorphKey(name);
          if (!key || typeof index !== 'number') {
            return;
          }
          addMorphBinding(morphs, key, {
            mesh,
            index,
            weight: 1,
          });
          matchedMorphNames.push(name);
        });
      }

      if (!isBone(object)) {
        return;
      }

      const normalizedBoneName = normalizeName(object.name);
      if (!bones.jaw && normalizedBoneName.includes('jaw')) {
        bones.jaw = {
          bone: object,
          baseQuaternion: object.quaternion.clone(),
        };
        matchedBoneNames.push(object.name);
      }
      if (!bones.eyeLeft && normalizedBoneName.includes('eye') && normalizedBoneName.includes('left')) {
        bones.eyeLeft = {
          bone: object,
          baseQuaternion: object.quaternion.clone(),
        };
        matchedBoneNames.push(object.name);
      }
      if (!bones.eyeRight && normalizedBoneName.includes('eye') && normalizedBoneName.includes('right')) {
        bones.eyeRight = {
          bone: object,
          baseQuaternion: object.quaternion.clone(),
        };
        matchedBoneNames.push(object.name);
      }
    });

    const morphChannelCount = Object.values(morphs).reduce((count, bindings) => count + (bindings?.length ?? 0), 0);
    const boneChannelCount = Object.values(bones).filter(Boolean).length;

    return {
      available: morphChannelCount > 0 || boneChannelCount > 0,
      morphs,
      bones,
      current: { ...DEFAULT_TARGET },
      diagnostics: {
        morphChannelCount,
        boneChannelCount,
        geometryChannelCount: 0,
        matchedMorphNames,
        matchedBoneNames,
      },
    };
  },

  attachGeometryFallback(
    binding: FaceRigBinding | null,
    root: THREE.Object3D,
    anchors: Array<{ name: string; position: [number, number, number] }>,
    forceReplace = false,
  ) {
    if (!binding || binding.morphs.jawOpen?.length || binding.bones.jaw) {
      return;
    }
    if (binding.geometry && !forceReplace) {
      return;
    }

    const meshCandidates: THREE.Mesh[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.geometry) {
        return;
      }
      const positionAttribute = mesh.geometry.getAttribute('position');
      if (!positionAttribute || positionAttribute.itemSize !== 3) {
        return;
      }
      meshCandidates.push(mesh);
    });

    if (!meshCandidates.length) {
      return;
    }

    const mouthCenterAnchor = anchors.find((anchor) => anchor.name === 'mouth_center');
    const upperLipAnchor = anchors.find((anchor) => anchor.name === 'upper_lip_mid');
    const lowerLipAnchor = anchors.find((anchor) => anchor.name === 'lower_lip_mid');
    const leftCornerAnchor = anchors.find((anchor) => anchor.name === 'mouth_corner_left');
    const rightCornerAnchor = anchors.find((anchor) => anchor.name === 'mouth_corner_right');
    const chinAnchor = anchors.find((anchor) => anchor.name === 'chin');
    const cheekLeftAnchor = anchors.find((anchor) => anchor.name === 'cheek_left');
    const cheekRightAnchor = anchors.find((anchor) => anchor.name === 'cheek_right');
    const eyeCenterLeftAnchor = anchors.find((anchor) => anchor.name === 'eye_center_left');
    const eyeCenterRightAnchor = anchors.find((anchor) => anchor.name === 'eye_center_right');
    const upperLidLeftAnchor = anchors.find((anchor) => anchor.name === 'upper_lid_left');
    const upperLidRightAnchor = anchors.find((anchor) => anchor.name === 'upper_lid_right');
    const lowerLidLeftAnchor = anchors.find((anchor) => anchor.name === 'lower_lid_left');
    const lowerLidRightAnchor = anchors.find((anchor) => anchor.name === 'lower_lid_right');
    const browInnerLeftAnchor = anchors.find((anchor) => anchor.name === 'brow_inner_left');
    const browInnerRightAnchor = anchors.find((anchor) => anchor.name === 'brow_inner_right');
    const browOuterLeftAnchor = anchors.find((anchor) => anchor.name === 'brow_outer_left');
    const browOuterRightAnchor = anchors.find((anchor) => anchor.name === 'brow_outer_right');

    if (!mouthCenterAnchor || !upperLipAnchor || !lowerLipAnchor || !leftCornerAnchor || !rightCornerAnchor) {
      return;
    }

    let bestMesh: THREE.Mesh | null = null;
    let bestScore = -Infinity;
    const worldMouthCenter = new THREE.Vector3(...mouthCenterAnchor.position);

    meshCandidates.forEach((mesh) => {
      const meshBox = new THREE.Box3().setFromObject(mesh);
      if (!meshBox.isEmpty() && meshBox.containsPoint(worldMouthCenter)) {
        const score = meshBox.getSize(new THREE.Vector3()).lengthSq();
        if (bestMesh === null || score < bestScore || bestScore < 0) {
          bestMesh = mesh;
          bestScore = score;
        }
      }
    });

    const targetMesh = bestMesh ?? meshCandidates[0];
    const positionAttribute = targetMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const basePositions = new Float32Array(positionAttribute.array as ArrayLike<number>);

    const toLocal = (position: [number, number, number]) =>
      targetMesh!.worldToLocal(new THREE.Vector3(position[0], position[1], position[2]).clone());

    const mouthCenter = toLocal(mouthCenterAnchor.position);
    const upperLip = toLocal(upperLipAnchor.position);
    const lowerLip = toLocal(lowerLipAnchor.position);
    const leftCorner = toLocal(leftCornerAnchor.position);
    const rightCorner = toLocal(rightCornerAnchor.position);
    const chin = chinAnchor ? toLocal(chinAnchor.position) : lowerLip.clone().add(new THREE.Vector3(0, -0.03, 0));
    const cheekLeft = cheekLeftAnchor ? toLocal(cheekLeftAnchor.position) : leftCorner.clone().add(new THREE.Vector3(-0.02, 0.01, 0));
    const cheekRight = cheekRightAnchor ? toLocal(cheekRightAnchor.position) : rightCorner.clone().add(new THREE.Vector3(0.02, 0.01, 0));

    const rightAxis = rightCorner.clone().sub(leftCorner).normalize();
    const upAxis = upperLip.clone().sub(lowerLip).normalize();
    const forwardAxis = new THREE.Vector3().crossVectors(rightAxis, upAxis).normalize();
    if (forwardAxis.lengthSq() < 1e-8) {
      forwardAxis.set(0, 0, 1);
    }

    const mouthWidth = Math.max(leftCorner.distanceTo(rightCorner), 0.02);
    const mouthHeight = Math.max(upperLip.distanceTo(lowerLip), 0.01);
    const mouthRadius = Math.max(mouthWidth * 0.9, mouthHeight * 2.2, 0.03);
    const eyeCenterLeft = eyeCenterLeftAnchor ? toLocal(eyeCenterLeftAnchor.position) : upperLip.clone().add(new THREE.Vector3(-mouthWidth * 0.22, mouthWidth * 0.42, 0));
    const eyeCenterRight = eyeCenterRightAnchor ? toLocal(eyeCenterRightAnchor.position) : upperLip.clone().add(new THREE.Vector3(mouthWidth * 0.22, mouthWidth * 0.42, 0));
    const upperLidLeft = upperLidLeftAnchor ? toLocal(upperLidLeftAnchor.position) : eyeCenterLeft.clone().add(new THREE.Vector3(0, mouthHeight * 0.75, 0));
    const upperLidRight = upperLidRightAnchor ? toLocal(upperLidRightAnchor.position) : eyeCenterRight.clone().add(new THREE.Vector3(0, mouthHeight * 0.75, 0));
    const lowerLidLeft = lowerLidLeftAnchor ? toLocal(lowerLidLeftAnchor.position) : eyeCenterLeft.clone().add(new THREE.Vector3(0, -mouthHeight * 0.55, 0));
    const lowerLidRight = lowerLidRightAnchor ? toLocal(lowerLidRightAnchor.position) : eyeCenterRight.clone().add(new THREE.Vector3(0, -mouthHeight * 0.55, 0));
    const browInnerLeft = browInnerLeftAnchor ? toLocal(browInnerLeftAnchor.position) : upperLidLeft.clone().add(new THREE.Vector3(mouthWidth * 0.05, mouthHeight * 0.95, 0));
    const browInnerRight = browInnerRightAnchor ? toLocal(browInnerRightAnchor.position) : upperLidRight.clone().add(new THREE.Vector3(-mouthWidth * 0.05, mouthHeight * 0.95, 0));
    const browOuterLeft = browOuterLeftAnchor ? toLocal(browOuterLeftAnchor.position) : upperLidLeft.clone().add(new THREE.Vector3(-mouthWidth * 0.18, mouthHeight * 0.82, 0));
    const browOuterRight = browOuterRightAnchor ? toLocal(browOuterRightAnchor.position) : upperLidRight.clone().add(new THREE.Vector3(mouthWidth * 0.18, mouthHeight * 0.82, 0));
    const eyeRadius = Math.max(mouthWidth * 0.22, mouthHeight * 1.15, 0.018);
    const browRadius = Math.max(mouthWidth * 0.24, mouthHeight * 1.1, 0.02);

    const jawEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const wideEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const puckerEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const lipPressEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const upperLipRaiseEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const lowerLipDropEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const smileLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const smileRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const blinkLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const blinkRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const eyeWideLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const eyeWideRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const squintLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const squintRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const cheekRaiseLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const cheekRaiseRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const browUpLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const browUpRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const browDownLeftEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];
    const browDownRightEntries: Array<{ index: number; weight: number; direction: THREE.Vector3 }> = [];

    const vertex = new THREE.Vector3();
    for (let i = 0; i < positionAttribute.count; i += 1) {
      vertex.set(basePositions[i * 3], basePositions[i * 3 + 1], basePositions[i * 3 + 2]);
      const mouthDistance = vertex.distanceTo(mouthCenter);
      const mouthWeight = smoothWeight(mouthDistance, mouthRadius);
      if (mouthWeight <= 0.001) {
        continue;
      }

      const lowerWeight = smoothWeight(vertex.distanceTo(lowerLip), mouthRadius * 0.62);
      const chinWeight = smoothWeight(vertex.distanceTo(chin), mouthRadius * 0.85);
      const jawWeight = Math.max(lowerWeight, chinWeight * 0.8);
      if (jawWeight > 0.001) {
        jawEntries.push({
          index: i,
          weight: jawWeight,
          direction: upAxis.clone().negate().add(forwardAxis.clone().multiplyScalar(-0.15)).normalize(),
        });
      }

      const leftWeight = smoothWeight(vertex.distanceTo(leftCorner), mouthRadius * 0.5);
      const rightWeight = smoothWeight(vertex.distanceTo(rightCorner), mouthRadius * 0.5);
      if (leftWeight > 0.001) {
        wideEntries.push({
          index: i,
          weight: leftWeight,
          direction: rightAxis.clone().negate(),
        });
        smileLeftEntries.push({
          index: i,
          weight: leftWeight,
          direction: rightAxis.clone().negate().multiplyScalar(0.45).add(upAxis.clone().multiplyScalar(0.9)).add(forwardAxis.clone().multiplyScalar(-0.08)).normalize(),
        });
      }
      if (rightWeight > 0.001) {
        wideEntries.push({
          index: i,
          weight: rightWeight,
          direction: rightAxis.clone(),
        });
        smileRightEntries.push({
          index: i,
          weight: rightWeight,
          direction: rightAxis.clone().multiplyScalar(0.45).add(upAxis.clone().multiplyScalar(0.9)).add(forwardAxis.clone().multiplyScalar(-0.08)).normalize(),
        });
      }

      const centerWeight = smoothWeight(mouthDistance, mouthRadius * 0.72);
      if (centerWeight > 0.001) {
        const toCenter = mouthCenter.clone().sub(vertex);
        puckerEntries.push({
          index: i,
          weight: centerWeight,
          direction: forwardAxis.clone().multiplyScalar(0.8).add(toCenter.multiplyScalar(0.08)).normalize(),
        });
      }

      const upperWeight = smoothWeight(vertex.distanceTo(upperLip), mouthRadius * 0.48);
      if (upperWeight > 0.001) {
        upperLipRaiseEntries.push({
          index: i,
          weight: upperWeight,
          direction: upAxis.clone().multiplyScalar(0.92).add(forwardAxis.clone().multiplyScalar(0.12)).normalize(),
        });
        const upperPressDirection = lowerLip.clone().sub(vertex).normalize();
        lipPressEntries.push({
          index: i,
          weight: upperWeight,
          direction: upperPressDirection.add(forwardAxis.clone().multiplyScalar(-0.08)).normalize(),
        });
      }

      const lowerLipWeight = smoothWeight(vertex.distanceTo(lowerLip), mouthRadius * 0.55);
      if (lowerLipWeight > 0.001) {
        lowerLipDropEntries.push({
          index: i,
          weight: lowerLipWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.94).add(forwardAxis.clone().multiplyScalar(0.1)).normalize(),
        });
        const lowerPressDirection = upperLip.clone().sub(vertex).normalize();
        lipPressEntries.push({
          index: i,
          weight: lowerLipWeight,
          direction: lowerPressDirection.add(forwardAxis.clone().multiplyScalar(-0.08)).normalize(),
        });
      }

      const cheekLeftWeight = smoothWeight(vertex.distanceTo(cheekLeft), mouthRadius * 0.72);
      if (cheekLeftWeight > 0.001) {
        smileLeftEntries.push({
          index: i,
          weight: cheekLeftWeight * 0.55,
          direction: upAxis.clone().multiplyScalar(0.7).add(rightAxis.clone().negate().multiplyScalar(0.18)).normalize(),
        });
        cheekRaiseLeftEntries.push({
          index: i,
          weight: cheekLeftWeight,
          direction: upAxis.clone().multiplyScalar(0.76).add(rightAxis.clone().negate().multiplyScalar(0.12)).normalize(),
        });
      }

      const cheekRightWeight = smoothWeight(vertex.distanceTo(cheekRight), mouthRadius * 0.72);
      if (cheekRightWeight > 0.001) {
        smileRightEntries.push({
          index: i,
          weight: cheekRightWeight * 0.55,
          direction: upAxis.clone().multiplyScalar(0.7).add(rightAxis.clone().multiplyScalar(0.18)).normalize(),
        });
        cheekRaiseRightEntries.push({
          index: i,
          weight: cheekRightWeight,
          direction: upAxis.clone().multiplyScalar(0.76).add(rightAxis.clone().multiplyScalar(0.12)).normalize(),
        });
      }

      const upperLidLeftWeight = smoothWeight(vertex.distanceTo(upperLidLeft), eyeRadius);
      const lowerLidLeftWeight = smoothWeight(vertex.distanceTo(lowerLidLeft), eyeRadius);
      if (upperLidLeftWeight > 0.001) {
        blinkLeftEntries.push({
          index: i,
          weight: upperLidLeftWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.92).add(forwardAxis.clone().multiplyScalar(-0.06)).normalize(),
        });
        eyeWideLeftEntries.push({
          index: i,
          weight: upperLidLeftWeight,
          direction: upAxis.clone().multiplyScalar(0.9).normalize(),
        });
        squintLeftEntries.push({
          index: i,
          weight: upperLidLeftWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.7).normalize(),
        });
      }
      if (lowerLidLeftWeight > 0.001) {
        blinkLeftEntries.push({
          index: i,
          weight: lowerLidLeftWeight * 0.82,
          direction: upAxis.clone().multiplyScalar(0.9).add(forwardAxis.clone().multiplyScalar(-0.04)).normalize(),
        });
        eyeWideLeftEntries.push({
          index: i,
          weight: lowerLidLeftWeight * 0.82,
          direction: upAxis.clone().negate().multiplyScalar(0.58).normalize(),
        });
        squintLeftEntries.push({
          index: i,
          weight: lowerLidLeftWeight,
          direction: upAxis.clone().multiplyScalar(0.72).normalize(),
        });
      }

      const upperLidRightWeight = smoothWeight(vertex.distanceTo(upperLidRight), eyeRadius);
      const lowerLidRightWeight = smoothWeight(vertex.distanceTo(lowerLidRight), eyeRadius);
      if (upperLidRightWeight > 0.001) {
        blinkRightEntries.push({
          index: i,
          weight: upperLidRightWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.92).add(forwardAxis.clone().multiplyScalar(-0.06)).normalize(),
        });
        eyeWideRightEntries.push({
          index: i,
          weight: upperLidRightWeight,
          direction: upAxis.clone().multiplyScalar(0.9).normalize(),
        });
        squintRightEntries.push({
          index: i,
          weight: upperLidRightWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.7).normalize(),
        });
      }
      if (lowerLidRightWeight > 0.001) {
        blinkRightEntries.push({
          index: i,
          weight: lowerLidRightWeight * 0.82,
          direction: upAxis.clone().multiplyScalar(0.9).add(forwardAxis.clone().multiplyScalar(-0.04)).normalize(),
        });
        eyeWideRightEntries.push({
          index: i,
          weight: lowerLidRightWeight * 0.82,
          direction: upAxis.clone().negate().multiplyScalar(0.58).normalize(),
        });
        squintRightEntries.push({
          index: i,
          weight: lowerLidRightWeight,
          direction: upAxis.clone().multiplyScalar(0.72).normalize(),
        });
      }

      const browInnerLeftWeight = smoothWeight(vertex.distanceTo(browInnerLeft), browRadius);
      const browOuterLeftWeight = smoothWeight(vertex.distanceTo(browOuterLeft), browRadius);
      const leftBrowWeight = Math.max(browInnerLeftWeight, browOuterLeftWeight);
      if (leftBrowWeight > 0.001) {
        browUpLeftEntries.push({
          index: i,
          weight: leftBrowWeight,
          direction: upAxis.clone().multiplyScalar(0.96).add(rightAxis.clone().negate().multiplyScalar(0.04)).normalize(),
        });
        browDownLeftEntries.push({
          index: i,
          weight: leftBrowWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.9).normalize(),
        });
      }

      const browInnerRightWeight = smoothWeight(vertex.distanceTo(browInnerRight), browRadius);
      const browOuterRightWeight = smoothWeight(vertex.distanceTo(browOuterRight), browRadius);
      const rightBrowWeight = Math.max(browInnerRightWeight, browOuterRightWeight);
      if (rightBrowWeight > 0.001) {
        browUpRightEntries.push({
          index: i,
          weight: rightBrowWeight,
          direction: upAxis.clone().multiplyScalar(0.96).add(rightAxis.clone().multiplyScalar(0.04)).normalize(),
        });
        browDownRightEntries.push({
          index: i,
          weight: rightBrowWeight,
          direction: upAxis.clone().negate().multiplyScalar(0.9).normalize(),
        });
      }
    }

    binding.geometry = {
      mesh: targetMesh,
      positionAttribute,
      basePositions,
      channels: {
        jawOpen: makeChannel(jawEntries, mouthHeight * 1.5),
        blinkLeft: makeChannel(blinkLeftEntries, eyeRadius * 0.8),
        blinkRight: makeChannel(blinkRightEntries, eyeRadius * 0.8),
        eyeWideLeft: makeChannel(eyeWideLeftEntries, eyeRadius * 0.52),
        eyeWideRight: makeChannel(eyeWideRightEntries, eyeRadius * 0.52),
        squintLeft: makeChannel(squintLeftEntries, eyeRadius * 0.42),
        squintRight: makeChannel(squintRightEntries, eyeRadius * 0.42),
        mouthWide: makeChannel(wideEntries, mouthWidth * 0.28),
        mouthPucker: makeChannel(puckerEntries, mouthHeight * 0.56),
        lipPress: makeChannel(lipPressEntries, mouthHeight * 0.42),
        upperLipRaise: makeChannel(upperLipRaiseEntries, mouthHeight * 0.46),
        lowerLipDrop: makeChannel(lowerLipDropEntries, mouthHeight * 0.52),
        cheekRaiseLeft: makeChannel(cheekRaiseLeftEntries, mouthWidth * 0.14),
        cheekRaiseRight: makeChannel(cheekRaiseRightEntries, mouthWidth * 0.14),
        mouthSmileLeft: makeChannel(smileLeftEntries, mouthWidth * 0.22),
        mouthSmileRight: makeChannel(smileRightEntries, mouthWidth * 0.22),
        browUpLeft: makeChannel(browUpLeftEntries, browRadius * 0.62),
        browUpRight: makeChannel(browUpRightEntries, browRadius * 0.62),
        browDownLeft: makeChannel(browDownLeftEntries, browRadius * 0.45),
        browDownRight: makeChannel(browDownRightEntries, browRadius * 0.45),
      },
    };
    binding.available = true;
    binding.diagnostics.geometryChannelCount = Object.values(binding.geometry.channels).filter(Boolean).length;
  },

  update(binding: FaceRigBinding | null, target: Partial<FaceDriverTarget>, deltaSeconds: number) {
    if (!binding?.available) {
      return;
    }

    const smoothing = 1 - Math.exp(-Math.max(deltaSeconds, 0.001) * 10);
    const nextTarget: FaceDriverTarget = {
      ...DEFAULT_TARGET,
      ...target,
    };

    (Object.keys(binding.current) as FaceDriverKey[]).forEach((key) => {
      binding.current[key] = THREE.MathUtils.lerp(
        binding.current[key],
        clamp01(nextTarget[key]),
        smoothing,
      );
    });

    (Object.entries(binding.morphs) as Array<[FaceDriverKey, MorphBinding[] | undefined]>).forEach(
      ([key, bindings]) => {
        const value = binding.current[key];
        bindings?.forEach(({ mesh, index, weight }) => {
          if (!mesh.morphTargetInfluences || mesh.morphTargetInfluences[index] === undefined) {
            return;
          }
          mesh.morphTargetInfluences[index] = clamp01(value * weight);
        });
      },
    );

    if (binding.bones.jaw) {
      const jawRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(binding.current.jawOpen * 0.38, 0, 0),
      );
      binding.bones.jaw.bone.quaternion.copy(binding.bones.jaw.baseQuaternion).multiply(jawRotation);
    }

    if (binding.bones.eyeLeft) {
      const blinkRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(binding.current.blinkLeft * -0.1, 0, 0),
      );
      binding.bones.eyeLeft.bone.quaternion.copy(binding.bones.eyeLeft.baseQuaternion).multiply(blinkRotation);
    }

    if (binding.bones.eyeRight) {
      const blinkRotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(binding.current.blinkRight * -0.1, 0, 0),
      );
      binding.bones.eyeRight.bone.quaternion.copy(binding.bones.eyeRight.baseQuaternion).multiply(blinkRotation);
    }

    if (binding.geometry) {
      const positionArray = binding.geometry.positionAttribute.array as Float32Array;
      positionArray.set(binding.geometry.basePositions);

      const applyChannel = (key: FaceDriverKey) => {
        const channel = binding.geometry?.channels[key];
        if (!channel) {
          return;
        }
        const value = binding.current[key] * channel.amplitude;
        if (Math.abs(value) < 1e-5) {
          return;
        }
        for (let i = 0; i < channel.indices.length; i += 1) {
          const vertexOffset = channel.indices[i] * 3;
          const weightedValue = value * channel.weights[i];
          positionArray[vertexOffset] += channel.directions[i * 3] * weightedValue;
          positionArray[vertexOffset + 1] += channel.directions[i * 3 + 1] * weightedValue;
          positionArray[vertexOffset + 2] += channel.directions[i * 3 + 2] * weightedValue;
        }
      };

      applyChannel('jawOpen');
      applyChannel('blinkLeft');
      applyChannel('blinkRight');
      applyChannel('eyeWideLeft');
      applyChannel('eyeWideRight');
      applyChannel('squintLeft');
      applyChannel('squintRight');
      applyChannel('mouthWide');
      applyChannel('mouthPucker');
      applyChannel('lipPress');
      applyChannel('upperLipRaise');
      applyChannel('lowerLipDrop');
      applyChannel('cheekRaiseLeft');
      applyChannel('cheekRaiseRight');
      applyChannel('mouthSmileLeft');
      applyChannel('mouthSmileRight');
      applyChannel('browUpLeft');
      applyChannel('browUpRight');
      applyChannel('browDownLeft');
      applyChannel('browDownRight');
      binding.geometry.positionAttribute.needsUpdate = true;
    }
  },
};

export const emptyFaceDriverTarget = (): FaceDriverTarget => ({ ...DEFAULT_TARGET });
