import React, { useEffect, useRef, useState } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { FaceAnchorPoint, facialControllerPlacementService } from '../services/facialControllerPlacementService';
import { detectFaceLandmarksFromImage } from '../services/faceLandmarkService';
import { faceDriverService, FaceRigBinding } from '../services/faceDriverService';
import { flameStyleFaceService, type FaceSemanticTarget, type FlameStyleFaceTarget } from '../services/flameStyleFaceService';
import { faceAnchorCacheService } from '../services/faceAnchorCacheService';

export type AvatarAnimationMode = 'animated' | 'static';

interface AvatarSceneProps {
  lipSyncData?: {
    sequence: Array<{
      Lip: string;
      Time: number;
    }>;
    startedAt: number;
    audioUrl: string;
  } | null;
  modelUrl?: string;
  idleModelUrl?: string;
  talkingModelUrl?: string;
  waveModelUrl?: string;
  extraActionModelUrls?: string[];
  activeExtraActionIndex?: number | null;
  isTalking?: boolean;
  animationMode?: AvatarAnimationMode;
  isRotationLocked?: boolean;
  isRigging?: boolean;
  showFaceControllerDebug?: boolean;
  faceAnchorCacheKey?: string;
  faceAnchorRefreshToken?: number;
  color?: string;
  onLoadComplete?: () => void;
  onLoadStart?: () => void;
}

interface FaceParameterDebugState {
  activeViseme: string | null;
  semanticTarget: FaceSemanticTarget;
  flameTarget: FlameStyleFaceTarget;
  characterTarget: ReturnType<typeof faceDriverService.update> extends void ? ReturnType<typeof faceDriverService['createRigBinding']>['current'] : never;
}

interface FacePlacementInput {
  anchors: FaceAnchorPoint[];
  bounds?: {
    headCenter?: [number, number, number];
    bboxMin?: [number, number, number];
    bboxMax?: [number, number, number];
    faceWidth?: number;
    faceHeight?: number;
    faceDepth?: number;
  };
}

const PRIMARY_ACTION_FADE_DURATION = 0.3;
const WAVE_ACTION_FADE_DURATION = 0.25;

export const AvatarScene: React.FC<AvatarSceneProps> = ({ 
  lipSyncData = null,
  modelUrl, 
  idleModelUrl, 
  talkingModelUrl, 
  waveModelUrl,
  extraActionModelUrls = [],
  activeExtraActionIndex = null,
  isTalking = false, 
  animationMode = 'animated',
  isRotationLocked = false,
  isRigging = false, 
  showFaceControllerDebug = false,
  faceAnchorCacheKey,
  faceAnchorRefreshToken = 0,
  color = "#8b5cf6",
  onLoadComplete,
  onLoadStart
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderHostRef = useRef<HTMLDivElement>(null);
  //                       ?mixer
  const idleMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const talkingMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleModelRef = useRef<THREE.Group | null>(null);
  const talkingModelRef = useRef<THREE.Group | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const talkingActionRef = useRef<THREE.AnimationAction | null>(null);
  const idleFaceRigRef = useRef<FaceRigBinding | null>(null);
  const talkingFaceRigRef = useRef<FaceRigBinding | null>(null);
  const lipSyncDataRef = useRef(lipSyncData);
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const extraActionRefs = useRef<Array<THREE.AnimationAction | null>>([]);
  const extraActionLoadingRef = useRef<Set<number>>(new Set());
  const activeExtraActionIndexRef = useRef<number | null>(activeExtraActionIndex);
  const isWavingRef = useRef(false);
  const hasPlayedWaveOnEnterRef = useRef(false);
  const lastUserWaveTsRef = useRef(0);
  const isTalkingRef = useRef(isTalking);
  const isRotationLockedRef = useRef(isRotationLocked);
  const isStaticAnimationMode = animationMode === 'static';
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fadeTransitionRef = useRef<{ target: 'idle' | 'talking', progress: number } | null>(null);
  //
  const loadingRef = useRef<{ idle: boolean, talking: boolean }>({ idle: false, talking: false });
  //                                     ?GLB
  const [idleReadyVersion, setIdleReadyVersion] = useState(0);
  const [waveReadyVersion, setWaveReadyVersion] = useState(0);
  const [primaryActionReadyVersion, setPrimaryActionReadyVersion] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [faceDebugEnabled, setFaceDebugEnabled] = useState(showFaceControllerDebug);
  const [faceParameterDebug, setFaceParameterDebug] = useState<FaceParameterDebugState | null>(null);
  const faceDebugUpdateAtRef = useRef(0);
  const facePlacementInputRef = useRef<FacePlacementInput | null>(null);
  const facePlacementPromiseRef = useRef<Promise<FacePlacementInput> | null>(null);
  const lastFaceRefreshTokenRef = useRef(faceAnchorRefreshToken);
  const dragStateRef = useRef({
    isDragging: false,
    pointerId: -1,
    lastX: 0,
    moved: false,
  });

  useEffect(() => {
    isTalkingRef.current = isTalking;
    activeExtraActionIndexRef.current = isStaticAnimationMode ? null : activeExtraActionIndex;
  }, [activeExtraActionIndex, isStaticAnimationMode, isTalking]);

  useEffect(() => {
    lipSyncDataRef.current = lipSyncData;
  }, [lipSyncData]);

  useEffect(() => {
    dragStateRef.current.isDragging = false;
    dragStateRef.current.pointerId = -1;
    dragStateRef.current.moved = false;
    isRotationLockedRef.current = isRotationLocked;
    const canvas = renderHostRef.current?.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.cursor = isRotationLocked ? 'default' : 'grab';
    }
  }, [isRotationLocked]);

  useEffect(() => {
    setWebglError(null);
  }, [animationMode, modelUrl, idleModelUrl, talkingModelUrl, waveModelUrl]);

  useEffect(() => {
    setFaceDebugEnabled(showFaceControllerDebug);
  }, [showFaceControllerDebug]);

  useEffect(() => {
    if (!faceDebugEnabled) {
      setFaceParameterDebug(null);
    }
  }, [faceDebugEnabled]);

  useEffect(() => {
    facePlacementInputRef.current = null;
    facePlacementPromiseRef.current = null;
  }, [faceAnchorRefreshToken, faceAnchorCacheKey, modelUrl, idleModelUrl, talkingModelUrl, waveModelUrl]);

  /**
   *            WaveOnce      
   * -        waveAction     ?   * -           sTalkingRef=false          isWavingRef=false ?   * -             ?idle  ?talking             
   */
  const triggerWaveOnce = () => {
    if (isStaticAnimationMode) {
      return;
    }
    const waveAction = waveActionRef.current;
    const idleAction = idleActionRef.current;
    const mixer = idleMixerRef.current || mixerRef.current;

    if (!waveAction) {
      return;
    }
    if (isWavingRef.current) {
      return;
    }
    if (isTalkingRef.current) {
      return;
    }
    if (activeExtraActionIndexRef.current !== null) {
      return;
    }

    isWavingRef.current = true;

    //         dle -> wave
    if (idleAction) {
      idleAction.fadeOut(WAVE_ACTION_FADE_DURATION);
    }

    waveAction.reset();
    (waveAction as any).enabled = true;
    waveAction.clampWhenFinished = true;
    waveAction.setLoop(THREE.LoopOnce, 1);
    waveAction.fadeIn(WAVE_ACTION_FADE_DURATION);
    waveAction.play();

    const onFinished = (event?: any) => {
      if (event?.action && event.action !== waveAction) {
        return;
      }
      if (mixer && (mixer as any).removeEventListener) {
        (mixer as any).removeEventListener('finished', onFinished as any);
      }
      isWavingRef.current = false;

      resumePrimaryAction();
    };

    if (mixer && (mixer as any).addEventListener) {
      (mixer as any).addEventListener('finished', onFinished as any);
    }
  };

  const triggerWaveFromUser = () => {
    if (isStaticAnimationMode) {
      return;
    }
    if (activeExtraActionIndexRef.current !== null) {
      return;
    }
    const now = Date.now();
    if (now - lastUserWaveTsRef.current < 400) {
      return;
    }
    lastUserWaveTsRef.current = now;
    triggerWaveOnce();
  };
  const stopExtraActions = (exceptIndex: number | null = null) => {
    extraActionRefs.current.forEach((action, index) => {
      if (!action || index === exceptIndex) {
        return;
      }
      action.fadeOut(PRIMARY_ACTION_FADE_DURATION);
    });
  };
  const playTalkingLoop = () => {
    if (!talkingActionRef.current) {
      return false;
    }
    if (isWavingRef.current && waveActionRef.current) {
      waveActionRef.current.stop();
      isWavingRef.current = false;
    }
    stopExtraActions();
    if (idleActionRef.current) {
      idleActionRef.current.fadeOut(PRIMARY_ACTION_FADE_DURATION);
    }
    talkingActionRef.current.enabled = true;
    talkingActionRef.current.reset();
    talkingActionRef.current.setEffectiveTimeScale(1);
    talkingActionRef.current.setEffectiveWeight(1);
    talkingActionRef.current.setLoop(THREE.LoopRepeat, Infinity);
    talkingActionRef.current.fadeIn(PRIMARY_ACTION_FADE_DURATION);
    talkingActionRef.current.play();
    return true;
  };
  const playIdleLoop = () => {
    if (!idleActionRef.current) {
      return false;
    }
    if (talkingActionRef.current) {
      talkingActionRef.current.fadeOut(PRIMARY_ACTION_FADE_DURATION);
    }
    idleActionRef.current.enabled = true;
    idleActionRef.current.reset();
    idleActionRef.current.setEffectiveTimeScale(1);
    idleActionRef.current.setEffectiveWeight(1);
    idleActionRef.current.setLoop(THREE.LoopRepeat, Infinity);
    idleActionRef.current.fadeIn(PRIMARY_ACTION_FADE_DURATION);
    idleActionRef.current.play();
    return true;
  };
  const playExtraAction = (index: number) => {
    const action = extraActionRefs.current[index];
    if (!action || isTalkingRef.current) {
      return false;
    }
    if (isWavingRef.current && waveActionRef.current) {
      waveActionRef.current.stop();
      isWavingRef.current = false;
    }
    if (idleActionRef.current) {
      idleActionRef.current.fadeOut(PRIMARY_ACTION_FADE_DURATION);
    }
    if (talkingActionRef.current) {
      talkingActionRef.current.fadeOut(PRIMARY_ACTION_FADE_DURATION);
    }
    stopExtraActions(index);
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(PRIMARY_ACTION_FADE_DURATION);
    action.play();
    return true;
  };
  const resumePrimaryAction = () => {
    if (isTalkingRef.current) {
      if (playTalkingLoop()) {
        return;
      }
      return;
    }
    const nextExtraActionIndex = activeExtraActionIndexRef.current;
    if (nextExtraActionIndex !== null && playExtraAction(nextExtraActionIndex)) {
      return;
    }
    stopExtraActions();
    playIdleLoop();
  };

  useEffect(() => {
    if (isStaticAnimationMode) {
      return;
    }
    if (!waveActionRef.current) {
      return;
    }
    if (hasPlayedWaveOnEnterRef.current) {
      return;
    }
    if (isTalkingRef.current) {
      return;
    }
    hasPlayedWaveOnEnterRef.current = true;
    triggerWaveOnce();
  }, [isStaticAnimationMode, waveReadyVersion]);

  useEffect(() => {
    if (!containerRef.current || !renderHostRef.current) return;

    //          ?URL
    //        ?idle  ?talking     URL          ?+
    const useAnimationBlending = !isStaticAnimationMode && !!(idleModelUrl && talkingModelUrl);
    const fallbackUrl = isStaticAnimationMode
      ? idleModelUrl || modelUrl || talkingModelUrl
      : modelUrl || idleModelUrl || talkingModelUrl;
    
    if (!useAnimationBlending && !fallbackUrl) {
      console.warn('[AvatarScene]          URL');
      return;
    }
    
    loadingRef.current = { idle: false, talking: false };

    while (renderHostRef.current.firstChild) {
      renderHostRef.current.removeChild(renderHostRef.current.firstChild);
    }

    let animateId: number = 0;
    let isDisposed = false;
    const raycaster = new THREE.Raycaster();
    
    //
    const scene = new THREE.Scene();
    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);
    const width = renderHostRef.current.clientWidth || containerRef.current.clientWidth || 800;
    const height = renderHostRef.current.clientHeight || containerRef.current.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1, 2.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      renderHostRef.current.appendChild(renderer.domElement);
    } catch (error) {
      console.error('[AvatarScene] WebGL           ?', error);
      setWebglError('褰撳墠娴忚鍣ㄦ垨鏄惧崱鏆傛椂鏃犳硶鍒涘缓 3D 娓叉煋鐜');
      onLoadComplete?.();
      return;
    }

    const fitModelToView = (model: THREE.Object3D) => {

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y <= 0) {
        return;
      }

      const targetHeight = 2.3;
      const scale = targetHeight / size.y;
      model.scale.multiplyScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);

      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= scaledBox.min.y;

      console.log('[AvatarScene]         :', { targetHeight, scale, size });
    };

    //
    const faceDebugGroup = new THREE.Group();
    faceDebugGroup.name = 'FaceControllerDebugGroup';
    avatarRoot.add(faceDebugGroup);

    const clearFaceDebug = () => {
      while (faceDebugGroup.children.length > 0) {
        const child = faceDebugGroup.children.pop();
        if (!child) {
          continue;
        }
        faceDebugGroup.remove(child);
        child.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.geometry) {
            mesh.geometry.dispose();
          }
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => mat.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        });
      }
    };

    const normalizedBoneName = (boneName: string) =>
      boneName
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    const findPreferredBone = (
      model: THREE.Object3D,
      preferredNames: string[],
      excludedNames: string[] = [],
    ) => {
      let bestBone: THREE.Bone | null = null;
      let bestScore = -Infinity;

      model.traverse((node) => {
        if (!(node instanceof THREE.Bone)) {
          return;
        }

        const boneName = normalizedBoneName(node.name);
        if (!boneName || excludedNames.some((excludedName) => boneName.includes(excludedName))) {
          return;
        }

        const matchedIndex = preferredNames.findIndex((preferredName) => boneName.includes(preferredName));
        if (matchedIndex === -1) {
          return;
        }

        const exactScore = preferredNames.includes(boneName) ? 100 : 0;
        const score = exactScore + (preferredNames.length - matchedIndex) * 10 - boneName.length * 0.01;
        if (score > bestScore) {
          bestBone = node;
          bestScore = score;
        }
      });

      return bestBone;
    };

    const getHeadBonePlacement = (model: THREE.Object3D) => {
      model.updateWorldMatrix(true, true);

      const headBone = findPreferredBone(
        model,
        ['head', 'mixamorighead'],
        ['headtop', 'headend', 'headnub', 'lookat'],
      );

      if (!headBone) {
        return null;
      }

      const neckBone =
        findPreferredBone(model, ['neck', 'mixamorigneck'], ['neckend', 'necknub']) ??
        (headBone.parent instanceof THREE.Bone ? headBone.parent : null);

      const headPosition = new THREE.Vector3();
      const neckPosition = new THREE.Vector3();
      headBone.getWorldPosition(headPosition);
      neckBone?.getWorldPosition(neckPosition);

      let upAxis = new THREE.Vector3(0, 1, 0);
      if (neckBone) {
        upAxis = headPosition.clone().sub(neckPosition);
        if (upAxis.lengthSq() > 1e-6) {
          upAxis.normalize();
        } else {
          upAxis.set(0, 1, 0);
        }
      }

      let forwardAxis = camera.position.clone().sub(headPosition);
      forwardAxis.sub(upAxis.clone().multiplyScalar(forwardAxis.dot(upAxis)));
      if (forwardAxis.lengthSq() <= 1e-6) {
        forwardAxis = new THREE.Vector3(0, 0, 1);
      } else {
        forwardAxis.normalize();
      }

      const rightAxis = new THREE.Vector3().crossVectors(upAxis, forwardAxis).normalize();
      if (rightAxis.lengthSq() <= 1e-6) {
        rightAxis.set(1, 0, 0);
      }

      const neckDistance = neckBone ? headPosition.distanceTo(neckPosition) : 0;

      return {
        headBone,
        neckBone,
        headPosition,
        neckPosition: neckBone ? neckPosition : null,
        upAxis,
        forwardAxis,
        rightAxis,
        neckDistance,
      };
    };

    const estimateFaceAnchorsFromModel = (model: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      const headBonePlacement = getHeadBonePlacement(model);

      const fallbackHeadHeight = Math.max(size.y * 0.24, 0.26);
      const fallbackHeadBottomY = box.max.y - fallbackHeadHeight;
      const estimatedHeadHeight = headBonePlacement
        ? THREE.MathUtils.clamp(
            headBonePlacement.neckDistance > 1e-4
              ? headBonePlacement.neckDistance * 3.0
              : fallbackHeadHeight,
            Math.max(size.y * 0.16, 0.22),
            Math.max(size.y * 0.34, fallbackHeadHeight),
          )
        : fallbackHeadHeight;
      const faceHeight = estimatedHeadHeight * 0.82;
      const faceWidth = Math.max(Math.min(size.x * 0.36, faceHeight * 0.85), faceHeight * 0.55);
      const faceDepth = Math.max(size.z * 0.22, faceWidth * 0.6);

      const upAxis = headBonePlacement?.upAxis.clone() ?? new THREE.Vector3(0, 1, 0);
      const forwardAxis = headBonePlacement?.forwardAxis.clone() ?? new THREE.Vector3(0, 0, 1);
      const rightAxis = headBonePlacement?.rightAxis.clone() ?? new THREE.Vector3(1, 0, 0);
      const headCenter = headBonePlacement
        ? headBonePlacement.headPosition
            .clone()
            .add(upAxis.clone().multiplyScalar(Math.max(headBonePlacement.neckDistance * 0.35, faceHeight * 0.06)))
            .add(forwardAxis.clone().multiplyScalar(faceDepth * 0.1))
        : new THREE.Vector3(center.x, fallbackHeadBottomY + fallbackHeadHeight * 0.56, center.z);

      const point = (base: THREE.Vector3, right = 0, up = 0, forward = 0): [number, number, number] => {
        const position = base
          .clone()
          .add(rightAxis.clone().multiplyScalar(right))
          .add(upAxis.clone().multiplyScalar(up))
          .add(forwardAxis.clone().multiplyScalar(forward));
        return [position.x, position.y, position.z];
      };

      const anchors: FaceAnchorPoint[] = [
        { name: 'head_center', position: point(headCenter) },
        { name: 'forehead_center', position: point(headCenter, 0, faceHeight * 0.34, faceDepth * 0.08) },
        { name: 'nose_tip', position: point(headCenter, 0, faceHeight * 0.02, faceDepth * 0.52) },
        { name: 'chin', position: point(headCenter, 0, -faceHeight * 0.46, faceDepth * 0.14) },
        { name: 'jaw_left', position: point(headCenter, -faceWidth * 0.45, -faceHeight * 0.25, faceDepth * 0.08) },
        { name: 'jaw_right', position: point(headCenter, faceWidth * 0.45, -faceHeight * 0.25, faceDepth * 0.08) },
        { name: 'mouth_center', position: point(headCenter, 0, -faceHeight * 0.24, faceDepth * 0.34) },
        { name: 'mouth_corner_left', position: point(headCenter, -faceWidth * 0.2, -faceHeight * 0.24, faceDepth * 0.32) },
        { name: 'mouth_corner_right', position: point(headCenter, faceWidth * 0.2, -faceHeight * 0.24, faceDepth * 0.32) },
        { name: 'upper_lip_mid', position: point(headCenter, 0, -faceHeight * 0.2, faceDepth * 0.36) },
        { name: 'lower_lip_mid', position: point(headCenter, 0, -faceHeight * 0.28, faceDepth * 0.3) },
        { name: 'eye_center_left', position: point(headCenter, -faceWidth * 0.18, faceHeight * 0.12, faceDepth * 0.22) },
        { name: 'eye_center_right', position: point(headCenter, faceWidth * 0.18, faceHeight * 0.12, faceDepth * 0.22) },
        { name: 'upper_lid_left', position: point(headCenter, -faceWidth * 0.18, faceHeight * 0.15, faceDepth * 0.21) },
        { name: 'upper_lid_right', position: point(headCenter, faceWidth * 0.18, faceHeight * 0.15, faceDepth * 0.21) },
        { name: 'lower_lid_left', position: point(headCenter, -faceWidth * 0.18, faceHeight * 0.09, faceDepth * 0.23) },
        { name: 'lower_lid_right', position: point(headCenter, faceWidth * 0.18, faceHeight * 0.09, faceDepth * 0.23) },
        { name: 'brow_inner_left', position: point(headCenter, -faceWidth * 0.08, faceHeight * 0.24, faceDepth * 0.16) },
        { name: 'brow_inner_right', position: point(headCenter, faceWidth * 0.08, faceHeight * 0.24, faceDepth * 0.16) },
        { name: 'brow_outer_left', position: point(headCenter, -faceWidth * 0.28, faceHeight * 0.21, faceDepth * 0.12) },
        { name: 'brow_outer_right', position: point(headCenter, faceWidth * 0.28, faceHeight * 0.21, faceDepth * 0.12) },
        { name: 'cheek_left', position: point(headCenter, -faceWidth * 0.28, -faceHeight * 0.05, faceDepth * 0.22) },
        { name: 'cheek_right', position: point(headCenter, faceWidth * 0.28, -faceHeight * 0.05, faceDepth * 0.22) },
        { name: 'temple_left', position: point(headCenter, -faceWidth * 0.42, faceHeight * 0.17, 0) },
        { name: 'temple_right', position: point(headCenter, faceWidth * 0.42, faceHeight * 0.17, 0) },
      ];

      return {
        anchors,
        bounds: {
          headCenter: point(headCenter),
          bboxMin: [box.min.x, box.min.y, box.min.z] as [number, number, number],
          bboxMax: [box.max.x, box.max.y, box.max.z] as [number, number, number],
          faceWidth,
          faceHeight,
          faceDepth,
        },
      };
    };

    const projectWorldPointToCanvas = (
      position: [number, number, number],
      activeCamera: THREE.PerspectiveCamera,
    ) => {
      const projected = new THREE.Vector3(position[0], position[1], position[2]).project(activeCamera);
      return {
        x: (projected.x * 0.5 + 0.5) * renderer.domElement.width,
        y: (-projected.y * 0.5 + 0.5) * renderer.domElement.height,
        visible: projected.z >= -1 && projected.z <= 1,
      };
    };

    const buildFaceCropRect = (
      placementInput: ReturnType<typeof estimateFaceAnchorsFromModel>,
      activeCamera: THREE.PerspectiveCamera,
    ) => {
      const projectedPoints = placementInput.anchors
        .map((anchor) => projectWorldPointToCanvas(anchor.position, activeCamera))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (!projectedPoints.length) {
        return null;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      projectedPoints.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });

      const paddingX = Math.max((maxX - minX) * 0.28, renderer.domElement.width * 0.02);
      const paddingY = Math.max((maxY - minY) * 0.4, renderer.domElement.height * 0.025);
      const x = Math.max(0, Math.floor(minX - paddingX));
      const y = Math.max(0, Math.floor(minY - paddingY));
      const width = Math.max(
        96,
        Math.min(renderer.domElement.width - x, Math.ceil(maxX - minX + paddingX * 2)),
      );
      const height = Math.max(
        96,
        Math.min(renderer.domElement.height - y, Math.ceil(maxY - minY + paddingY * 2)),
      );

      return { x, y, width, height };
    };

    const captureFaceCropImage = (
      placementInput: ReturnType<typeof estimateFaceAnchorsFromModel>,
      activeCamera: THREE.PerspectiveCamera,
    ) => {
      const cropRect = buildFaceCropRect(placementInput, activeCamera);
      if (!cropRect) {
        return null;
      }

      renderer.render(scene, activeCamera);

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropRect.width;
      cropCanvas.height = cropRect.height;

      const context = cropCanvas.getContext('2d');
      if (!context) {
        return null;
      }

      context.drawImage(
        renderer.domElement,
        cropRect.x,
        cropRect.y,
        cropRect.width,
        cropRect.height,
        0,
        0,
        cropRect.width,
        cropRect.height,
      );

      return {
        cropRect,
        image: cropCanvas.toDataURL('image/png'),
      };
    };

    const createFaceViewCameras = (placementInput: ReturnType<typeof estimateFaceAnchorsFromModel>) => {
      const placement = facialControllerPlacementService.placeControllers(
        placementInput.anchors,
        placementInput.bounds,
      );
      const faceCenter = new THREE.Vector3(...placement.frame.center);
      const faceUp = new THREE.Vector3(...placement.frame.up).normalize();
      const faceForward = new THREE.Vector3(...placement.frame.forward).normalize();
      const faceHeight = placement.frame.faceHeight;
      const faceWidth = placement.frame.faceWidth;
      const distance = Math.max(faceHeight * 2.8, faceWidth * 4.2, 0.42);

      const makeViewCamera = (id: 'front' | 'left' | 'right', yawRadians: number) => {
        const activeCamera = camera.clone();
        const viewDirection = faceForward.clone().applyAxisAngle(faceUp, yawRadians).normalize();
        const position = faceCenter
          .clone()
          .add(viewDirection.multiplyScalar(distance))
          .add(faceUp.clone().multiplyScalar(faceHeight * 0.04));
        activeCamera.position.copy(position);
        activeCamera.up.copy(faceUp);
        activeCamera.lookAt(faceCenter);
        activeCamera.updateMatrixWorld(true);
        activeCamera.updateProjectionMatrix();
        return {
          id,
          camera: activeCamera,
        };
      };

      return [
        makeViewCamera('front', 0),
        makeViewCamera('left', -Math.PI / 7),
        makeViewCamera('right', Math.PI / 7),
      ];
    };

    const getViewAnchorBonus = (
      viewId: 'front' | 'left' | 'right',
      anchorName: string,
    ) => {
      if (viewId === 'front') {
        return 0.01;
      }
      if (viewId === 'left' && anchorName.includes('left')) {
        return 0.08;
      }
      if (viewId === 'right' && anchorName.includes('right')) {
        return 0.08;
      }
      if (anchorName === 'chin' || anchorName === 'nose_tip' || anchorName === 'mouth_center') {
        return 0.02;
      }
      return 0;
    };

    const detectFaceAnchorsFromRenderedModel = async (model: THREE.Object3D) => {
      const fallbackInput = estimateFaceAnchorsFromModel(model);
      const views = createFaceViewCameras(fallbackInput);

      try {
        const fallbackAnchorMap = new Map(
          fallbackInput.anchors.map((anchor) => [anchor.name, anchor] as const),
        );
        const anchorScores = new Map(
          fallbackInput.anchors.map((anchor) => [anchor.name, anchor.confidence ?? 0] as const),
        );

        for (const view of views) {
          const capture = captureFaceCropImage(fallbackInput, view.camera);
          if (!capture) {
            continue;
          }

          const detection = await detectFaceLandmarksFromImage(capture.image);
          if (isDisposed || !detection?.ok || !detection.landmarks.length) {
            continue;
          }

          detection.landmarks.forEach((landmark) => {
            const fullCanvasX = capture.cropRect.x + landmark.x * capture.cropRect.width;
            const fullCanvasY = capture.cropRect.y + landmark.y * capture.cropRect.height;
            const ndc = new THREE.Vector2(
              (fullCanvasX / renderer.domElement.width) * 2 - 1,
              -(fullCanvasY / renderer.domElement.height) * 2 + 1,
            );

            raycaster.setFromCamera(ndc, view.camera);
            const hits = raycaster.intersectObject(model, true);
            const hitPoint = hits[0]?.point;
            if (!hitPoint) {
              return;
            }

            const anchorName = landmark.name as FaceAnchorPoint['name'];
            const score = (landmark.confidence ?? 0.5) + getViewAnchorBonus(view.id, landmark.name);
            const previousScore = anchorScores.get(anchorName) ?? -Infinity;
            if (score < previousScore) {
              return;
            }

            anchorScores.set(anchorName, score);
            fallbackAnchorMap.set(anchorName, {
              name: anchorName,
              position: [hitPoint.x, hitPoint.y, hitPoint.z],
              confidence: score,
            });
          });
        }

        return {
          anchors: Array.from(fallbackAnchorMap.values()),
          bounds: fallbackInput.bounds,
        };
      } catch (error) {
        console.warn('[AvatarScene] Face landmark detection fell back to heuristic anchors.', error);
        return fallbackInput;
      }
    };

    const getFacePlacementInput = async (
      model: THREE.Object3D,
      options?: { forceRefresh?: boolean },
    ): Promise<FacePlacementInput> => {
      const forceRefresh = Boolean(options?.forceRefresh);
      if (!forceRefresh && facePlacementInputRef.current) {
        return facePlacementInputRef.current;
      }

      if (!forceRefresh && !facePlacementInputRef.current && faceAnchorCacheKey) {
        const cached = faceAnchorCacheService.get(faceAnchorCacheKey);
        if (cached?.anchors?.length) {
          const cachedInput = {
            anchors: cached.anchors,
            bounds: cached.bounds,
          };
          facePlacementInputRef.current = cachedInput;
          return cachedInput;
        }
      }

      if (!forceRefresh && facePlacementPromiseRef.current) {
        return facePlacementPromiseRef.current;
      }

      const promise = (async () => {
        const detected = await detectFaceAnchorsFromRenderedModel(model);
        if (!isDisposed) {
          facePlacementInputRef.current = detected;
          if (faceAnchorCacheKey) {
            faceAnchorCacheService.save(faceAnchorCacheKey, detected);
          }
        }
        return detected;
      })();

      facePlacementPromiseRef.current = promise;
      try {
        return await promise;
      } finally {
        if (facePlacementPromiseRef.current === promise) {
          facePlacementPromiseRef.current = null;
        }
      }
    };

    const ensureGeometryFaceFallback = async (
      model: THREE.Object3D,
      isIdleModel: boolean,
      options?: { forceRefresh?: boolean },
    ) => {
      const binding = isIdleModel ? idleFaceRigRef.current : talkingFaceRigRef.current;
      const forceRefresh = Boolean(options?.forceRefresh);
      if (!binding || binding.diagnostics.morphChannelCount > 0 || binding.diagnostics.boneChannelCount > 0 || (binding.geometry && !forceRefresh)) {
        return;
      }

      const placementInput = await getFacePlacementInput(model, { forceRefresh });
      if (isDisposed) {
        return;
      }

      faceDriverService.attachGeometryFallback(binding, model, placementInput.anchors, forceRefresh);
      console.log('[AvatarScene] Geometry face fallback initialized:', {
        isIdleModel,
        geometryChannelCount: binding.diagnostics.geometryChannelCount,
        forceRefresh,
      });
    };

    const createDebugMarker = (position: [number, number, number], colorHex: number, radius: number) => {
      const geometry = new THREE.SphereGeometry(radius, 10, 10);
      const material = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.18,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(position[0], position[1], position[2]);
      return marker;
    };

    const renderFaceControllerDebug = async (
      model: THREE.Object3D,
      options?: { forceRefresh?: boolean },
    ) => {
      if (!faceDebugEnabled) {
        clearFaceDebug();
        return;
      }

      clearFaceDebug();

      const placementInput = await getFacePlacementInput(model, options);
      if (isDisposed) {
        return;
      }
      const placement = facialControllerPlacementService.placeControllers(
        placementInput.anchors,
        placementInput.bounds,
      );

      const anchorColor = 0x22c55e;
      const centerColor = 0xf59e0b;
      const leftColor = 0xec4899;
      const rightColor = 0x60a5fa;
      const unavailableColor = 0x6b7280;
      const baseRadius = Math.max(placement.frame.faceWidth * 0.025, 0.006);

      placementInput.anchors.forEach((anchor) => {
        faceDebugGroup.add(createDebugMarker(anchor.position, anchorColor, baseRadius * 0.65));
      });

      const frameCenter = new THREE.Vector3(...placement.frame.center);
      faceDebugGroup.add(
        new THREE.ArrowHelper(new THREE.Vector3(...placement.frame.right), frameCenter, placement.frame.faceWidth * 0.35, rightColor, baseRadius * 1.2, baseRadius * 0.7),
      );
      faceDebugGroup.add(
        new THREE.ArrowHelper(new THREE.Vector3(...placement.frame.up), frameCenter, placement.frame.faceHeight * 0.35, 0xf97316, baseRadius * 1.2, baseRadius * 0.7),
      );
      faceDebugGroup.add(
        new THREE.ArrowHelper(new THREE.Vector3(...placement.frame.forward), frameCenter, placement.frame.faceDepth * 0.55, 0x38bdf8, baseRadius * 1.2, baseRadius * 0.7),
      );

      placement.controllers.forEach((controller) => {
        const colorHex = !controller.available
          ? unavailableColor
          : controller.side === 'left'
            ? leftColor
            : controller.side === 'right'
              ? rightColor
              : centerColor;

        faceDebugGroup.add(createDebugMarker(controller.position, colorHex, Math.max(baseRadius * 0.9, 0.008)));

        if (controller.available) {
          faceDebugGroup.add(
            new THREE.ArrowHelper(
              new THREE.Vector3(...controller.forward),
              new THREE.Vector3(...controller.position),
              Math.max(placement.frame.faceDepth * 0.14, 0.03),
              colorHex,
              baseRadius,
              baseRadius * 0.55,
            ),
          );
        }
      });
    };

    const refreshFaceAnchorsAndSave = async () => {
      const targetModel = idleModelRef.current || talkingModelRef.current;
      if (!targetModel) {
        return;
      }

      facePlacementInputRef.current = null;
      facePlacementPromiseRef.current = null;

      const placementInput = await getFacePlacementInput(targetModel, { forceRefresh: true });
      if (isDisposed) {
        return;
      }

      await ensureGeometryFaceFallback(targetModel, targetModel === idleModelRef.current, { forceRefresh: true });
      await renderFaceControllerDebug(targetModel, { forceRefresh: true });
      console.log('[AvatarScene] Face anchors refreshed and saved.', {
        cacheKey: faceAnchorCacheKey,
        anchorCount: placementInput.anchors.length,
      });
    };

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
    fillLight.position.set(-5, 5, 5);
    scene.add(fillLight);
    const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.3);
    frontLight.position.set(0, 3, 8);
    scene.add(frontLight);

    //
    const handleClick = () => {
      if (isStaticAnimationMode) {
        return;
      }
      if (dragStateRef.current.moved) {
        dragStateRef.current.moved = false;
        return;
      }
      triggerWaveFromUser();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isStaticAnimationMode) {
        return;
      }
      if (isRotationLockedRef.current) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      dragStateRef.current.isDragging = true;
      dragStateRef.current.pointerId = event.pointerId;
      dragStateRef.current.lastX = event.clientX;
      dragStateRef.current.moved = false;
      renderer.domElement.style.cursor = 'grabbing';
      if (renderer.domElement.setPointerCapture) {
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    const handleTouchStart = () => {
      if (isStaticAnimationMode) {
        return;
      }
      triggerWaveFromUser();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (isRotationLockedRef.current) {
        return;
      }
      const dragState = dragStateRef.current;
      if (!dragState.isDragging || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.lastX;
      if (Math.abs(deltaX) > 1) {
        dragState.moved = true;
      }
      dragState.lastX = event.clientX;
      avatarRoot.rotation.y += deltaX * 0.01;
    };
    const endPointerDrag = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.isDragging || dragState.pointerId !== event.pointerId) {
        return;
      }
      dragState.isDragging = false;
      dragState.pointerId = -1;
      renderer.domElement.style.cursor = isRotationLockedRef.current ? 'default' : 'grab';
      if (renderer.domElement.releasePointerCapture && renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', endPointerDrag);
    renderer.domElement.addEventListener('pointercancel', endPointerDrag);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    renderer.domElement.style.cursor = isRotationLocked ? 'default' : 'grab';

    /**
     *                           ?     * @param model 3D      
     */
    const optimizeMaterials = (model: THREE.Object3D) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                if (mat.color) {
                  const hsl = { h: 0, s: 0, l: 0 };
                  mat.color.getHSL(hsl);
                  hsl.l = Math.min(hsl.l * 1.03, 0.9);
                  mat.color.setHSL(hsl.h, hsl.s, hsl.l);
                }
                if (mat.roughness !== undefined) {
                  mat.roughness = Math.max(mat.roughness, 0.92);
                }
                mat.metalness = 0;
                mat.envMapIntensity = 0;
                if (mat instanceof THREE.MeshPhysicalMaterial) {
                  mat.clearcoat = 0;
                  mat.clearcoatRoughness = 1;
                  mat.transmission = 0;
                  mat.ior = 1;
                  if ('reflectivity' in mat) {
                    (mat as THREE.MeshPhysicalMaterial & { reflectivity?: number }).reflectivity = 0;
                  }
                }
                //          ?                mat.transparent = true;
                mat.needsUpdate = true;
              }
            });
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            if (material.color) {
              const hsl = { h: 0, s: 0, l: 0 };
              material.color.getHSL(hsl);
              hsl.l = Math.min(hsl.l * 1.03, 0.9);
              material.color.setHSL(hsl.h, hsl.s, hsl.l);
            }
            if (material.roughness !== undefined) {
              material.roughness = Math.max(material.roughness, 0.92);
            }
            material.metalness = 0;
            material.envMapIntensity = 0;
            if (material instanceof THREE.MeshPhysicalMaterial) {
              material.clearcoat = 0;
              material.clearcoatRoughness = 1;
              material.transmission = 0;
              material.ior = 1;
              if ('reflectivity' in material) {
                (material as THREE.MeshPhysicalMaterial & { reflectivity?: number }).reflectivity = 0;
              }
            }
            material.transparent = true;
            material.needsUpdate = true;
          }
        }
      });
    };

    /**
     *           ?     * @param model 3D      
     * @param opacity       ?0-1)
     */
    const setModelOpacity = (model: THREE.Object3D, opacity: number) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.opacity = opacity;
              }
            });
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.opacity = opacity;
          }
        }
      });
    };

    const registerFaceRig = (model: THREE.Object3D, isIdleModel: boolean) => {
      if (isStaticAnimationMode) {
        if (isIdleModel) {
          idleFaceRigRef.current = null;
        } else {
          talkingFaceRigRef.current = null;
        }
        return null;
      }
      const binding = faceDriverService.createRigBinding(model);
      if (isIdleModel) {
        idleFaceRigRef.current = binding;
      } else {
        talkingFaceRigRef.current = binding;
      }
      console.log('[AvatarScene] Face rig channels detected:', {
        isIdleModel,
        available: binding.available,
        morphChannelCount: binding.diagnostics.morphChannelCount,
        boneChannelCount: binding.diagnostics.boneChannelCount,
        matchedMorphNames: binding.diagnostics.matchedMorphNames.slice(0, 12),
        matchedBoneNames: binding.diagnostics.matchedBoneNames,
      });
      return binding;
    };

    /**
     *        GLB    
     * @param url     URL
     * @param isIdleModel            
     * @returns Promise<THREE.Group>
     */
    const loadSingleModel = async (url: string, isIdleModel: boolean): Promise<THREE.Group> => {
      //
      const loadingKey = isIdleModel ? 'idle' : 'talking';
      if (loadingRef.current[loadingKey]) {
        console.log(`[AvatarScene] ${isIdleModel ? '   ' : '   '}`);
        return Promise.reject(new Error('模型正在加载中'));
      }
      
      loadingRef.current[loadingKey] = true;
      const startTime = Date.now();
      
      return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        
        //           ?URL
        (async () => {
          try {
            const { animationCacheService } = await import('../services/animationCacheService');
            const cachedUrl = await animationCacheService.getAnimationUrl(url);
            const isCached = cachedUrl !== url && cachedUrl.startsWith('blob:');
            console.log(`[AvatarScene] ${isIdleModel ? '  ' : '  '}      :`, isCached ? '是' : '否');
            
            loader.load(
              cachedUrl,
              (gltf) => {
                //
                const model = gltf.scene; //
                optimizeMaterials(model);
                registerFaceRig(model, isIdleModel);
                
                //                                ?                setModelOpacity(model, isIdleModel ? 1.0 : 0.0);
                
                const mixer = new THREE.AnimationMixer(model);
                
                if (isIdleModel) {
                  idleMixerRef.current = mixer;
                } else {
                  talkingMixerRef.current = mixer;
                }
                
                if (gltf.animations && gltf.animations.length > 0) {
                  console.log(`[AvatarScene] ${isIdleModel ? '   ' : '   '}           :`, gltf.animations.map(a => a.name));
                  
                  //
                  let clip: THREE.AnimationClip | null = null;
                  let waveClip: THREE.AnimationClip | null = null;
                  
                  if (isIdleModel) {
                    //               dle_Torch_Loop           dle     ?
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Torch_Loop' || 
                      a.name.toLowerCase().includes('idle')
                    ) || gltf.animations[0];
                    //                                    ?null
                    waveClip = gltf.animations.find(a =>
                      a.name.toLowerCase().includes('wave') ||
                      a.name.toLowerCase().includes('greet')
                    ) || null;
                  } else {
                    //               dle_Talking_Loop           alking/speak     ?
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Talking_Loop' || 
                      a.name.toLowerCase().includes('talking') ||
                      a.name.toLowerCase().includes('speak')
                    ) || gltf.animations[0];
                  }
                  
                  //           etarigAction ?                  //
                  if (clip.name === 'metarigAction') {
                    if (gltf.animations.length > 1) {
                      console.warn('[AvatarScene]');
                      const alternativeClip = gltf.animations.find(a => a.name !== 'metarigAction');
                      if (alternativeClip) {
                        clip = alternativeClip;
                        console.log(`[AvatarScene]          : ${alternativeClip.name}`);
                      } else {
                        //                          ?                        console.warn('[AvatarScene]             etarigAction');
                        console.warn('[AvatarScene]                           ?Idle_Torch_Loop  ?Idle_Talking_Loop');
                        //        metarigAction
                      }
                    } else {
                      //                          ?                      console.warn('[AvatarScene]             etarigAction');
                      console.warn('[AvatarScene]                           ?Idle_Torch_Loop  ?Idle_Talking_Loop');
                      //        metarigAction
                    }
                  }
                  
                  //
                  const action = mixer.clipAction(clip, model);
                  
                  //    ?action
                  if (!action) {
                    console.warn('[AvatarScene]');
                    console.log('[AvatarScene] model loaded (no animation action)');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  //    ?action
                  if (typeof action.play !== 'function' || typeof action.setLoop !== 'function') {
                    console.warn('[AvatarScene]');
                    console.log('[AvatarScene] model loaded (no animation action)');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  if (isStaticAnimationMode && isIdleModel) {
                    action.reset();
                    action.play();
                    mixer.setTime(0);
                    action.paused = true;
                    action.clampWhenFinished = true;
                    action.enabled = true;
                  } else {
                    action.play();
                    action.setLoop(THREE.LoopRepeat);
                  }
                  
                  //
                  try {
                    const isPlaying = typeof action.isPlaying === 'function' ? action.isPlaying() : false;
                      console.log('[AvatarScene]', {
                      isPlaying: isPlaying,
                      enabled: action.enabled !== undefined ? action.enabled : 'N/A',
                      time: action.time !== undefined ? action.time : 'N/A',
                      weight: action.weight !== undefined ? action.weight : 'N/A',
                      loop: action.loop !== undefined ? action.loop : 'N/A'
                    });
                  } catch (error) {
                    console.warn('[AvatarScene]', error);
                  }
                  
                  if (isIdleModel) {
                    idleActionRef.current = action;
                    setPrimaryActionReadyVersion((v) => v + 1);

                    //     ?Mesh2Motion                  ?waveActionRef
                    if (!isStaticAnimationMode && waveClip) {
                      const waveAction = mixer.clipAction(waveClip, model);
                      if (waveAction && typeof waveAction.play === 'function') {
                        waveActionRef.current = waveAction;
                        setWaveReadyVersion((v) => v + 1);

                      }
                    } else {
                      //
                      waveActionRef.current = null;
                    }
                    //                                        ?GLB
                    setIdleReadyVersion((v) => v + 1);
                  } else {
                    talkingActionRef.current = action;
                    setPrimaryActionReadyVersion((v) => v + 1);
                  }
                  
                  console.log('[AvatarScene] model loaded, using animation:', clip.name);
                } else {
                  console.warn('[AvatarScene] model has no animations');
                  console.warn('[AvatarScene]');
                  console.warn('[AvatarScene]       URL:', url);
                }
                
                const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[AvatarScene] model load time (s):', loadTime);
                loadingRef.current[loadingKey] = false;
                resolve(model);
              },
              undefined,
              (error) => {
                console.error('[AvatarScene] model load failed:', error);
                loadingRef.current[loadingKey] = false;
                reject(error);
              }
            );
          } catch (error) {
            console.error('[AvatarScene]                  RL:', error);
            //         ?URL
            loader.load(
              url,
              (gltf) => {
                //
                const model = gltf.scene; //
                optimizeMaterials(model);
                registerFaceRig(model, isIdleModel);
                setModelOpacity(model, isIdleModel ? 1.0 : 0.0);
                
                const mixer = new THREE.AnimationMixer(model);
                
                if (isIdleModel) {
                  idleMixerRef.current = mixer;
                } else {
                  talkingMixerRef.current = mixer;
                }
                
                if (gltf.animations && gltf.animations.length > 0) {
                  console.log('[AvatarScene] animations (original url):', gltf.animations.map(a => a.name));
                  
                  //
                  let clip: THREE.AnimationClip | null = null;
                  let waveClip: THREE.AnimationClip | null = null;
                  
                  if (isIdleModel) {
                    //               dle_Torch_Loop           dle     ?
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Torch_Loop' || 
                      a.name.toLowerCase().includes('idle')
                    ) || gltf.animations[0];
                    //
                    waveClip = gltf.animations.find(a =>
                      a.name.toLowerCase().includes('wave') ||
                      a.name.toLowerCase().includes('greet')
                    ) || null;
                  } else {
                    //               dle_Talking_Loop           alking/speak     ?
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Talking_Loop' || 
                      a.name.toLowerCase().includes('talking') ||
                      a.name.toLowerCase().includes('speak')
                    ) || gltf.animations[0];
                  }
                  
                  //           etarigAction ?                  //
                  if (clip.name === 'metarigAction') {
                    if (gltf.animations.length > 1) {
                      console.warn('[AvatarScene]');
                      const alternativeClip = gltf.animations.find(a => a.name !== 'metarigAction');
                      if (alternativeClip) {
                        clip = alternativeClip;
                        console.log('[AvatarScene]          :' + alternativeClip.name);
                      } else {
                        //                          ?                        console.warn('[AvatarScene]             etarigAction');
                        console.warn('[AvatarScene]                           ?Idle_Torch_Loop  ?Idle_Talking_Loop');
                        //        metarigAction
                      }
                    } else {
                      //                          ?                      console.warn('[AvatarScene]             etarigAction');
                      console.warn('[AvatarScene]                           ?Idle_Torch_Loop  ?Idle_Talking_Loop');
                      //        metarigAction
                    }
                  }
                  
                  //
                  const action = mixer.clipAction(clip, model);
                  
                  //    ?action
                  if (!action) {
                    console.warn('[AvatarScene]');
                    console.log('[AvatarScene] model loaded (original url, no animation action)');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  //    ?action
                  if (typeof action.play !== 'function' || typeof action.setLoop !== 'function') {
                    console.warn('[AvatarScene]');
                    console.log('[AvatarScene] model loaded (original url, no animation action)');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  if (isStaticAnimationMode && isIdleModel) {
                    action.reset();
                    action.play();
                    mixer.setTime(0);
                    action.paused = true;
                    action.clampWhenFinished = true;
                    action.enabled = true;
                  } else {
                    action.play();
                    action.setLoop(THREE.LoopRepeat);
                  }
                  
                  //
                  try {
                    const isPlaying = typeof action.isPlaying === 'function' ? action.isPlaying() : false;
                    console.log('[AvatarScene]              URL', {
                      isPlaying: isPlaying,
                      enabled: action.enabled !== undefined ? action.enabled : 'N/A',
                      time: action.time !== undefined ? action.time : 'N/A',
                      weight: action.weight !== undefined ? action.weight : 'N/A',
                      loop: action.loop !== undefined ? action.loop : 'N/A'
                    });
                  } catch (error) {
                    console.warn('[AvatarScene]', error);
                  }
                  
                  if (isIdleModel) {
                    idleActionRef.current = action;
                    setPrimaryActionReadyVersion((v) => v + 1);

                    if (!isStaticAnimationMode && waveClip) {
                      const waveAction = mixer.clipAction(waveClip, model);
                      if (waveAction && typeof waveAction.play === 'function') {
                        waveActionRef.current = waveAction;
                        setWaveReadyVersion((v) => v + 1);
                      }
                    } else {
                      waveActionRef.current = null;
                    }
                  } else {
                    talkingActionRef.current = action;
                    setPrimaryActionReadyVersion((v) => v + 1);
                  }
                  
                  console.log('[AvatarScene] model loaded, using animation:', clip.name);
                } else {
                  console.warn('[AvatarScene] model has no animations (original url)');
                  console.warn('[AvatarScene]');
                  console.warn('[AvatarScene]       URL:', url);
                }
                
                const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[AvatarScene] model load time (s):', loadTime);
                loadingRef.current[loadingKey] = false;
                resolve(model);
              },
              undefined,
              (error) => {
                console.error('[AvatarScene] model load failed:', error);
                loadingRef.current[loadingKey] = false;
                reject(error);
              }
            );
          }
        })();
      });
    };

    if (onLoadStart) {
      onLoadStart();
    }

    //
    if (useAnimationBlending) {
      //     ?+                                         UE ?      console.log('[AvatarScene]        ?            ?UE');
      
      const loader = new GLTFLoader();
      let baseModel: THREE.Group | null = null;
      let baseMixer: THREE.AnimationMixer | null = null;
      let idleClip: THREE.AnimationClip | null = null;
      let talkingClip: THREE.AnimationClip | null = null;
      
      // 1.     idle
      const loadBaseModel = async (): Promise<THREE.Group> => {
        try {
          const { animationCacheService } = await import('../services/animationCacheService');
          const cachedUrl = await animationCacheService.getAnimationUrl(idleModelUrl!);
          
          return new Promise<THREE.Group>((resolve, reject) => {
            loader.load(
              cachedUrl,
              (gltf) => {
                baseModel = gltf.scene;
                optimizeMaterials(baseModel);
                const faceBinding = registerFaceRig(baseModel, true);
                talkingFaceRigRef.current = faceBinding;
                baseMixer = new THREE.AnimationMixer(baseModel);
                idleMixerRef.current = baseMixer;
                mixerRef.current = baseMixer;
                
                //     idle
                if (gltf.animations && gltf.animations.length > 0) {
                  idleClip = gltf.animations.find(a => 
                    a.name === 'Idle_Torch_Loop' || 
                    a.name.toLowerCase().includes('idle')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene]            :', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene]     idle    :', idleClip.name);
                }
                
                fitModelToView(baseModel);
                fitModelToView(baseModel);
                avatarRoot.add(baseModel);
                idleModelRef.current = baseModel;
                ensureGeometryFaceFallback(baseModel, true);
                renderFaceControllerDebug(baseModel);
                setIdleReadyVersion((v) => v + 1);
                resolve(baseModel);
              },
              undefined,
              reject
            );
          });
        } catch (error) {
          //         ?URL
          return new Promise<THREE.Group>((resolve, reject) => {
            loader.load(
              idleModelUrl!,
              (gltf) => {
                baseModel = gltf.scene;
                optimizeMaterials(baseModel);
                const faceBinding = registerFaceRig(baseModel, true);
                talkingFaceRigRef.current = faceBinding;
                baseMixer = new THREE.AnimationMixer(baseModel);
                idleMixerRef.current = baseMixer;
                mixerRef.current = baseMixer;
                
                //     idle
                if (gltf.animations && gltf.animations.length > 0) {
                  idleClip = gltf.animations.find(a => 
                    a.name === 'Idle_Torch_Loop' || 
                    a.name.toLowerCase().includes('idle')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene]                ?URL ?', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene]     idle         RL ?', idleClip.name);
                }
                
                avatarRoot.add(baseModel);
                idleModelRef.current = baseModel;
                ensureGeometryFaceFallback(baseModel, true);
                renderFaceControllerDebug(baseModel);
                setIdleReadyVersion((v) => v + 1);
                resolve(baseModel);
              },
              undefined,
              reject
            );
          });
        }
      };
      
      // 2.  ?talking
      const loadTalkingAnimation = async (): Promise<THREE.AnimationClip | null> => {
        try {
          const { animationCacheService } = await import('../services/animationCacheService');
          const cachedUrl = await animationCacheService.getAnimationUrl(talkingModelUrl!);
          
          return new Promise<THREE.AnimationClip | null>((resolve, reject) => {
            loader.load(
              cachedUrl,
              (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                  talkingClip = gltf.animations.find(a => 
                    a.name === 'Idle_Talking_Loop' || 
                    a.name.toLowerCase().includes('talking') ||
                    a.name.toLowerCase().includes('speak')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] talking          :', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene]     ?talking    :', talkingClip.name);
                  resolve(talkingClip);
                } else {
                  console.warn('[AvatarScene] talking');
                  resolve(null);
                }
              },
              undefined,
              reject
            );
          });
        } catch (error) {
          //         ?URL
          return new Promise<THREE.AnimationClip | null>((resolve, reject) => {
            loader.load(
              talkingModelUrl!,
              (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                  talkingClip = gltf.animations.find(a => 
                    a.name === 'Idle_Talking_Loop' || 
                    a.name.toLowerCase().includes('talking') ||
                    a.name.toLowerCase().includes('speak')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] talking              ?URL ?', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene]     ?talking         RL ?', talkingClip.name);
                  resolve(talkingClip);
                } else {
                  console.warn('[AvatarScene] talking                  RL');
                  resolve(null);
                }
              },
              undefined,
              reject
            );
          });
        }
      };
      
      Promise.all([loadBaseModel(), loadTalkingAnimation()])
        .then(([model, clip]) => {
          if (!baseMixer || !baseModel) {
            throw new Error('Base model load failed');
          }
          
          //
          if (idleClip) {
            const idleAction = baseMixer.clipAction(idleClip, baseModel);
            if (isStaticAnimationMode) {
              idleAction.reset();
              idleAction.play();
              baseMixer.setTime(0);
              idleAction.paused = true;
              idleAction.clampWhenFinished = true;
              idleAction.enabled = true;
            } else {
              idleAction.setLoop(THREE.LoopRepeat);
            }
            idleActionRef.current = idleAction;
            console.log('[AvatarScene] idle');
          }
          
          if (clip) {
            const talkingAction = baseMixer.clipAction(clip, baseModel);
            talkingAction.setLoop(THREE.LoopRepeat);
            talkingActionRef.current = talkingAction;
            // talking
            console.log('[AvatarScene] talking');
          }

          setPrimaryActionReadyVersion((v) => v + 1);
          if (!isStaticAnimationMode) {
            resumePrimaryAction();
          }
          
          console.log('[AvatarScene]');
          if (onLoadComplete) {
            onLoadComplete();
          }
        })
        .catch((error) => {
          console.error('[AvatarScene]                    ?', error);
          if (onLoadComplete) {
            onLoadComplete();
          }
        });
    } else {
      //                ?      console.log('[AvatarScene]');
      loadSingleModel(fallbackUrl!, true).then((model) => {
        idleModelRef.current = model;
        fitModelToView(model);
        avatarRoot.add(model);
        ensureGeometryFaceFallback(model, true);
        renderFaceControllerDebug(model);
        //              ?idleMixerRef
        mixerRef.current = idleMixerRef.current;
        if (onLoadComplete) {
          onLoadComplete();
        }
      }).catch((error) => {
        console.error('[AvatarScene]           ?', error);
        if (onLoadComplete) {
          onLoadComplete();
        }
      });
    }

    //
    const clock = new THREE.Clock();
    const faceDriveState = {
      time: 0,
      nextBlinkAt: 1.6 + Math.random() * 1.4,
      blinkStartAt: -1,
      blinkDuration: 0.11,
    };
    const sampleBlink = () => {
      if (faceDriveState.blinkStartAt < 0 && faceDriveState.time >= faceDriveState.nextBlinkAt) {
        faceDriveState.blinkStartAt = faceDriveState.time;
      }

      if (faceDriveState.blinkStartAt < 0) {
        return 0;
      }

      const elapsed = faceDriveState.time - faceDriveState.blinkStartAt;
      const progress = elapsed / faceDriveState.blinkDuration;
      if (progress >= 1) {
        faceDriveState.blinkStartAt = -1;
        faceDriveState.nextBlinkAt = faceDriveState.time + 2.2 + Math.random() * 2.4;
        return 0;
      }

      return Math.sin(progress * Math.PI);
    };
    const getLipVisemeAtTime = () => {
      const lipSync = lipSyncDataRef.current;
      if (!lipSync?.sequence?.length) {
        return null;
      }

      const elapsed = Date.now() - lipSync.startedAt;
      if (elapsed < 0) {
        return null;
      }

      let offset = 0;
      for (const item of lipSync.sequence) {
        offset += item.Time;
        if (elapsed <= offset) {
          return item.Lip;
        }
      }

      return null;
    };
    const buildFaceDriveTarget = () => {
      const blink = sampleBlink();
      const activeViseme = getLipVisemeAtTime();
      if (activeViseme) {
        const semanticTarget = flameStyleFaceService.visemeToSemanticTarget(activeViseme, blink);
        const flameTarget = flameStyleFaceService.semanticToFlameStyleTarget(semanticTarget);
        const characterTarget = flameStyleFaceService.flameStyleToCharacterTarget(flameTarget);
        return {
          activeViseme,
          semanticTarget,
          flameTarget,
          characterTarget,
        };
      }

      const semanticTarget = flameStyleFaceService.speechFallbackToSemanticTarget(
        faceDriveState.time,
        isTalkingRef.current,
        blink,
      );
      const flameTarget = flameStyleFaceService.semanticToFlameStyleTarget(semanticTarget);
      const characterTarget = flameStyleFaceService.flameStyleToCharacterTarget(flameTarget);
      return {
        activeViseme: null,
        semanticTarget,
        flameTarget,
        characterTarget,
      };
    };
    const animate = () => {
      animateId = requestAnimationFrame(animate);
      
      const delta = clock.getDelta();
      faceDriveState.time += delta;
      
      if (!isStaticAnimationMode && idleMixerRef.current) {
        idleMixerRef.current.update(delta);
      }

      if (!isStaticAnimationMode) {
        const faceDriveFrame = buildFaceDriveTarget();
        const faceDriveTarget = faceDriveFrame.characterTarget;
        const uniqueFaceRigs = new Set<FaceRigBinding>();
        if (idleFaceRigRef.current) {
          uniqueFaceRigs.add(idleFaceRigRef.current);
        }
        if (talkingFaceRigRef.current) {
          uniqueFaceRigs.add(talkingFaceRigRef.current);
        }
        uniqueFaceRigs.forEach((binding) => {
          faceDriverService.update(binding, faceDriveTarget, delta);
        });

        if (faceDebugEnabled && Date.now() - faceDebugUpdateAtRef.current >= 120) {
          faceDebugUpdateAtRef.current = Date.now();
          setFaceParameterDebug({
            activeViseme: faceDriveFrame.activeViseme,
            semanticTarget: faceDriveFrame.semanticTarget,
            flameTarget: faceDriveFrame.flameTarget,
            characterTarget: faceDriveFrame.characterTarget,
          });
        }
      }
      
      //
      const useDualModel = false; //
      if (false && fadeTransitionRef.current) {
        const { target, progress } = fadeTransitionRef.current;
        const fadeSpeed = 2.0; //
        const newProgress = Math.min(progress + delta * fadeSpeed, 1.0);
        
        if (useDualModel && idleModelRef.current && talkingModelRef.current) {
          //                                  ?
          const opacityThreshold = 0.05;
          
          if (target === 'talking') {
            //         dle      alking
            const idleOpacity = 1.0 - newProgress;
            const talkingOpacity = newProgress;
            
            setModelOpacity(idleModelRef.current, idleOpacity);
            setModelOpacity(talkingModelRef.current, talkingOpacity);
            
            if (idleOpacity <= opacityThreshold) {
              idleModelRef.current.visible = false;
            } else {
              idleModelRef.current.visible = true;
            }
            
            if (talkingOpacity >= 1.0 - opacityThreshold) {
              talkingModelRef.current.visible = true;
            } else {
              talkingModelRef.current.visible = true;
            }
          } else {
            //         alking      dle
            const talkingOpacity = 1.0 - newProgress;
            const idleOpacity = newProgress;
            
            setModelOpacity(talkingModelRef.current, talkingOpacity);
            setModelOpacity(idleModelRef.current, idleOpacity);
            
            if (talkingOpacity <= opacityThreshold) {
              talkingModelRef.current.visible = false;
            } else {
              talkingModelRef.current.visible = true;
            }
            
            if (idleOpacity >= 1.0 - opacityThreshold) {
              idleModelRef.current.visible = true;
            } else {
              idleModelRef.current.visible = true;
            }
          }
          
          if (newProgress >= 1.0) {
            if (target === 'idle') {
              // idle             talking
              if (talkingModelRef.current) {
                setModelOpacity(talkingModelRef.current, 0.0);
                talkingModelRef.current.visible = false;
              }
              if (idleModelRef.current) {
                setModelOpacity(idleModelRef.current, 1.0);
                idleModelRef.current.visible = true;
              }
            } else {
              // talking             idle
              if (idleModelRef.current) {
                setModelOpacity(idleModelRef.current, 0.0);
                idleModelRef.current.visible = false;
              }
              if (talkingModelRef.current) {
                setModelOpacity(talkingModelRef.current, 1.0);
                talkingModelRef.current.visible = true;
              }
            }
            fadeTransitionRef.current = null;
          } else {
            fadeTransitionRef.current.progress = newProgress;
          }
        }
      } else if (false && useDualModel && idleModelRef.current && talkingModelRef.current) {
        //                                ?        //
        // talking           ?0       idle
        //       ?
        let talkingOpacity = 1.0;
        let idleOpacity = 1.0;
        
        // talking
        talkingModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material;
            if (Array.isArray(material)) {
              talkingOpacity = Math.min(...material.map((m) => (m as any).opacity ?? 1.0));
            } else {
              talkingOpacity = (material as any).opacity ?? 1.0;
            }
          }
        });
        
        // idle
        idleModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material;
            if (Array.isArray(material)) {
              idleOpacity = Math.min(...material.map((m) => (m as any).opacity ?? 1.0));
            } else {
              idleOpacity = (material as any).opacity ?? 1.0;
            }
          }
        });
        
        if (talkingOpacity <= 0.01) {
          talkingModelRef.current.visible = false;
        } else {
          talkingModelRef.current.visible = true;
        }
        
        if (idleOpacity <= 0.01) {
          idleModelRef.current.visible = false;
        } else {
          idleModelRef.current.visible = true;
        }
      }
      
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!renderHostRef.current) return;
      camera.aspect = renderHostRef.current.clientWidth / renderHostRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(renderHostRef.current.clientWidth, renderHostRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    const shouldForceFaceAnchorRefresh = lastFaceRefreshTokenRef.current !== faceAnchorRefreshToken;
    lastFaceRefreshTokenRef.current = faceAnchorRefreshToken;
    if (shouldForceFaceAnchorRefresh) {
      refreshFaceAnchorsAndSave();
    }

    return () => {
      isDisposed = true;
      window.removeEventListener('resize', handleResize);
      if (animateId) cancelAnimationFrame(animateId);
      if (idleActionRef.current) {
        idleActionRef.current.stop();
        idleActionRef.current = null;
      }
      if (talkingActionRef.current) {
        talkingActionRef.current.stop();
        talkingActionRef.current = null;
      }
      extraActionRefs.current.forEach((action) => action?.stop());
      extraActionRefs.current = [];
      extraActionLoadingRef.current.clear();
      waveActionRef.current = null;
      isWavingRef.current = false;
      hasPlayedWaveOnEnterRef.current = false;
      idleMixerRef.current = null;
      talkingMixerRef.current = null;
      mixerRef.current = null;
      idleModelRef.current = null;
      talkingModelRef.current = null;
      idleFaceRigRef.current = null;
      talkingFaceRigRef.current = null;
      fadeTransitionRef.current = null;
      if (renderHostRef.current?.contains(renderer.domElement)) {
        renderHostRef.current.removeChild(renderer.domElement);
      }
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', endPointerDrag);
      renderer.domElement.removeEventListener('pointercancel', endPointerDrag);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      if (typeof renderer.forceContextLoss === 'function') {
        renderer.forceContextLoss();
      }
      renderer.dispose();
    };
  }, [animationMode, idleModelUrl, talkingModelUrl, modelUrl, faceDebugEnabled, faceAnchorCacheKey, faceAnchorRefreshToken]); //        URL

  /**
   *       ?GLB  aveModelUrl                         
   * -     waveModelUrl       GLB    ?AnimationClip
   * -  ?Clip     ?idle     ?mixer    ?waveActionRef
   * -                                        ?triggerWaveOnce()
   * -     waveModelUrl         idle GLB     ?waveClip        
   */
  useEffect(() => {
    if (isStaticAnimationMode) {
      stopExtraActions();
      return;
    }
    if (activeExtraActionIndex === null) {
      stopExtraActions();
      return;
    }
    const selectedModelUrl = extraActionModelUrls[activeExtraActionIndex];
    if (!selectedModelUrl) {
      return;
    }
    if (!idleMixerRef.current || !idleModelRef.current) {
      return;
    }
    if (extraActionRefs.current[activeExtraActionIndex]) {
      if (!isTalkingRef.current) {
        playExtraAction(activeExtraActionIndex);
      }
      return;
    }
    if (extraActionLoadingRef.current.has(activeExtraActionIndex)) {
      return;
    }
    extraActionLoadingRef.current.add(activeExtraActionIndex);
    let cancelled = false;
    const loader = new GLTFLoader();
    (async () => {
      try {
        const { animationCacheService } = await import('../services/animationCacheService');
        const cachedUrl = await animationCacheService.getAnimationUrl(selectedModelUrl);
        loader.load(
          cachedUrl,
          (gltf) => {
            extraActionLoadingRef.current.delete(activeExtraActionIndex);
            if (cancelled) {
              return;
            }
            if (!gltf.animations || gltf.animations.length === 0) {
              console.warn('[AvatarScene] extra action model has no animations:', selectedModelUrl);
              return;
            }
            const clip = gltf.animations.find((animation) => animation.name !== 'metarigAction') || gltf.animations[0];
            const mixer = idleMixerRef.current;
            const model = idleModelRef.current;
            if (!mixer || !model) {
              return;
            }
            const action = mixer.clipAction(clip, model);
            if (!action || typeof action.play !== 'function') {
              console.warn('[AvatarScene] failed to create AnimationAction:', selectedModelUrl);
              return;
            }
            extraActionRefs.current[activeExtraActionIndex] = action;
            if (activeExtraActionIndexRef.current === activeExtraActionIndex && !isTalkingRef.current) {
              playExtraAction(activeExtraActionIndex);
            }
          },
          undefined,
          (error) => {
            extraActionLoadingRef.current.delete(activeExtraActionIndex);
            if (cancelled) {
              return;
            }
            console.error('[AvatarScene] extra action model load failed:', error);
          }
        );
      } catch (error) {
        extraActionLoadingRef.current.delete(activeExtraActionIndex);
        if (cancelled) {
          return;
        }
        console.error('[AvatarScene] extra action model load failed (cache):', error);
      }
    })();
    return () => {
      cancelled = true;
      extraActionLoadingRef.current.delete(activeExtraActionIndex);
    };
  }, [activeExtraActionIndex, extraActionModelUrls, idleReadyVersion, isStaticAnimationMode]);

  useEffect(() => {
    if (isStaticAnimationMode) {
      waveActionRef.current = null;
      return;
    }
    if (!waveModelUrl) {
      return;
    }

    if (!idleMixerRef.current || !idleModelRef.current) {
      console.log('[AvatarScene] waveModelUrl');
      return;
    }

    let cancelled = false;
    const loader = new GLTFLoader();

    (async () => {
      let createdModelId: string | null = null;
      try {
        const { animationCacheService } = await import('../services/animationCacheService');
        const cachedUrl = await animationCacheService.getAnimationUrl(waveModelUrl);
        console.log('[AvatarScene]         :', cachedUrl !== waveModelUrl ? '是' : '否');

        loader.load(
          cachedUrl,
          (gltf) => {
            if (cancelled) return;
            if (!gltf.animations || gltf.animations.length === 0) {
              console.warn('[AvatarScene]', waveModelUrl);
              return;
            }

            let clip = gltf.animations.find(a =>
              a.name.toLowerCase().includes('wave') ||
              a.name.toLowerCase().includes('greet')
            ) || gltf.animations[0];

            const mixer = idleMixerRef.current;
            const model = idleModelRef.current;
            if (!mixer || !model) {
              console.warn('[AvatarScene]           ?idle mixer  ?model');
              return;
            }

            const action = mixer.clipAction(clip, model);
            if (!action || typeof (action as any).play !== 'function') {
              console.warn('[AvatarScene]                    AnimationAction');
              return;
            }

            waveActionRef.current = action;
            setWaveReadyVersion((v) => v + 1);
            console.log('[AvatarScene]        LB         :', clip.name);

          },
          undefined,
          (error) => {
            if (cancelled) return;
            console.error('[AvatarScene]             :', error);
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[AvatarScene]              ?', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waveModelUrl, idleReadyVersion, isStaticAnimationMode]);

  useEffect(() => {
    if (isStaticAnimationMode) {
      if (talkingActionRef.current) {
        talkingActionRef.current.stop();
      }
      stopExtraActions();
      return;
    }
    if (!mixerRef.current && !idleMixerRef.current) {
      return;
    }

    if (isTalking && isWavingRef.current && waveActionRef.current) {
      waveActionRef.current.stop();
      isWavingRef.current = false;
    }

    if (isTalking) {
      playTalkingLoop();
      return;
    }

    resumePrimaryAction();
  }, [activeExtraActionIndex, isTalking, idleModelUrl, isStaticAnimationMode, primaryActionReadyVersion, talkingModelUrl]);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ minHeight: '500px' }}>
      <div ref={renderHostRef} className="absolute inset-0 z-0" />
      {faceDebugEnabled && faceParameterDebug && (
        <div className="absolute left-3 top-3 z-40 w-[320px] max-w-[calc(100%-24px)] rounded-2xl border border-white/60 bg-black/55 p-3 text-white shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/80">FACE DEBUG</p>
            <span className="rounded-full bg-white/12 px-2 py-1 text-[11px] text-white/85">
              {faceParameterDebug.activeViseme ? `viseme ${faceParameterDebug.activeViseme}` : 'fallback'}
            </span>
          </div>
          {[
            ['Semantic', faceParameterDebug.semanticTarget],
            ['FLAME-like', faceParameterDebug.flameTarget],
            ['Character', faceParameterDebug.characterTarget],
          ].map(([title, values]) => (
            <div key={title} className="mt-3 rounded-xl bg-white/8 p-2.5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">{title}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] leading-4 text-white/88">
                {Object.entries(values).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <span className="truncate text-white/62">{key}</span>
                    <span className="text-right font-mono">{Number(value).toFixed(2)}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-pink-200/60 bg-white/90 px-5 py-4 text-center text-gray-700 shadow-lg">
            <p className="text-sm font-medium">3D 预览暂时不可用</p>
            <p className="mt-1 text-xs text-gray-500">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
};


// --- Main App ---
