export type FaceAnchorName =
  | 'head_center'
  | 'forehead_center'
  | 'nose_tip'
  | 'chin'
  | 'jaw_left'
  | 'jaw_right'
  | 'mouth_center'
  | 'mouth_corner_left'
  | 'mouth_corner_right'
  | 'upper_lip_mid'
  | 'lower_lip_mid'
  | 'eye_center_left'
  | 'eye_center_right'
  | 'upper_lid_left'
  | 'upper_lid_right'
  | 'lower_lid_left'
  | 'lower_lid_right'
  | 'brow_inner_left'
  | 'brow_inner_right'
  | 'brow_outer_left'
  | 'brow_outer_right'
  | 'cheek_left'
  | 'cheek_right'
  | 'temple_left'
  | 'temple_right';

export type FaceRegionName =
  | 'head'
  | 'jaw'
  | 'mouth'
  | 'upper_lip'
  | 'lower_lip'
  | 'left_eye'
  | 'right_eye'
  | 'left_brow'
  | 'right_brow'
  | 'left_cheek'
  | 'right_cheek';

export type FaceControllerSide = 'center' | 'left' | 'right';
export type FaceControllerMode = 'root' | 'bone' | 'shape_key' | 'hybrid';
export type FaceFalloff = 'linear' | 'smoothstep' | 'gaussian';

export interface FaceControllerInfluence {
  region: FaceRegionName;
  weight: number;
  radiusScale: number;
  falloff: FaceFalloff;
}

export interface FaceControllerDefinition {
  id: string;
  label: string;
  side: FaceControllerSide;
  mode: FaceControllerMode;
  anchor: FaceAnchorName;
  fallbackAnchors?: FaceAnchorName[];
  symmetryPartnerId?: string;
  placementOffset?: {
    x: number;
    y: number;
    z: number;
  };
  handleRadius: number;
  supportedExpressions: string[];
  influences: FaceControllerInfluence[];
  notes?: string;
}

export interface FaceControllerBasisDefinition {
  version: string;
  description: string;
  requiredAnchors: FaceAnchorName[];
  recommendedAnchors: FaceAnchorName[];
  controllers: FaceControllerDefinition[];
}

export const FACIAL_CONTROLLER_BASIS_V1: FaceControllerBasisDefinition = {
  version: '1.0.0',
  description:
    'Lightweight facial controller basis for automatic placement on full-body wild 3D characters.',
  requiredAnchors: [
    'head_center',
    'nose_tip',
    'chin',
    'mouth_center',
    'mouth_corner_left',
    'mouth_corner_right',
    'upper_lip_mid',
    'lower_lip_mid',
    'eye_center_left',
    'eye_center_right',
    'brow_inner_left',
    'brow_inner_right',
    'brow_outer_left',
    'brow_outer_right',
  ],
  recommendedAnchors: [
    'forehead_center',
    'jaw_left',
    'jaw_right',
    'upper_lid_left',
    'upper_lid_right',
    'lower_lid_left',
    'lower_lid_right',
    'cheek_left',
    'cheek_right',
    'temple_left',
    'temple_right',
  ],
  controllers: [
    {
      id: 'head_root',
      label: 'Head Root',
      side: 'center',
      mode: 'root',
      anchor: 'head_center',
      fallbackAnchors: ['nose_tip'],
      placementOffset: { x: 0, y: 0, z: 0 },
      handleRadius: 0.09,
      supportedExpressions: ['headAim', 'faceRoot'],
      influences: [
        { region: 'head', weight: 1, radiusScale: 2.4, falloff: 'smoothstep' },
      ],
      notes: 'Parent controller for the entire facial rig.',
    },
    {
      id: 'jaw',
      label: 'Jaw',
      side: 'center',
      mode: 'hybrid',
      anchor: 'chin',
      fallbackAnchors: ['mouth_center'],
      placementOffset: { x: 0, y: 0.012, z: 0 },
      handleRadius: 0.06,
      supportedExpressions: ['jawOpen', 'jawLeft', 'jawRight', 'mouthClose'],
      influences: [
        { region: 'jaw', weight: 1, radiusScale: 1.5, falloff: 'smoothstep' },
        { region: 'lower_lip', weight: 0.85, radiusScale: 1.2, falloff: 'gaussian' },
        { region: 'mouth', weight: 0.45, radiusScale: 1.6, falloff: 'gaussian' },
      ],
      notes: 'Main lower-face opening controller.',
    },
    {
      id: 'mouth_corner_left',
      label: 'Mouth Corner Left',
      side: 'left',
      mode: 'hybrid',
      anchor: 'mouth_corner_left',
      symmetryPartnerId: 'mouth_corner_right',
      placementOffset: { x: 0, y: 0, z: 0 },
      handleRadius: 0.04,
      supportedExpressions: ['mouthSmileLeft', 'mouthFrownLeft', 'mouthWide', 'mouthPressLeft'],
      influences: [
        { region: 'mouth', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'upper_lip', weight: 0.72, radiusScale: 1.0, falloff: 'gaussian' },
        { region: 'lower_lip', weight: 0.72, radiusScale: 1.0, falloff: 'gaussian' },
        { region: 'left_cheek', weight: 0.4, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'mouth_corner_right',
      label: 'Mouth Corner Right',
      side: 'right',
      mode: 'hybrid',
      anchor: 'mouth_corner_right',
      symmetryPartnerId: 'mouth_corner_left',
      placementOffset: { x: 0, y: 0, z: 0 },
      handleRadius: 0.04,
      supportedExpressions: ['mouthSmileRight', 'mouthFrownRight', 'mouthWide', 'mouthPressRight'],
      influences: [
        { region: 'mouth', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'upper_lip', weight: 0.72, radiusScale: 1.0, falloff: 'gaussian' },
        { region: 'lower_lip', weight: 0.72, radiusScale: 1.0, falloff: 'gaussian' },
        { region: 'right_cheek', weight: 0.4, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'upper_lip',
      label: 'Upper Lip',
      side: 'center',
      mode: 'shape_key',
      anchor: 'upper_lip_mid',
      fallbackAnchors: ['mouth_center'],
      placementOffset: { x: 0, y: 0, z: 0.002 },
      handleRadius: 0.035,
      supportedExpressions: ['mouthUpperUp', 'mouthClose', 'mouthPucker'],
      influences: [
        { region: 'upper_lip', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'mouth', weight: 0.55, radiusScale: 1.4, falloff: 'gaussian' },
      ],
    },
    {
      id: 'lower_lip',
      label: 'Lower Lip',
      side: 'center',
      mode: 'shape_key',
      anchor: 'lower_lip_mid',
      fallbackAnchors: ['mouth_center', 'chin'],
      placementOffset: { x: 0, y: 0, z: 0.002 },
      handleRadius: 0.035,
      supportedExpressions: ['mouthLowerDown', 'mouthClose', 'mouthPucker'],
      influences: [
        { region: 'lower_lip', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'mouth', weight: 0.55, radiusScale: 1.4, falloff: 'gaussian' },
      ],
    },
    {
      id: 'mouth_pucker',
      label: 'Mouth Pucker',
      side: 'center',
      mode: 'shape_key',
      anchor: 'mouth_center',
      fallbackAnchors: ['upper_lip_mid', 'lower_lip_mid'],
      placementOffset: { x: 0, y: 0, z: 0.015 },
      handleRadius: 0.04,
      supportedExpressions: ['mouthPucker', 'mouthFunnel', 'viseme_ou', 'viseme_oh'],
      influences: [
        { region: 'mouth', weight: 1, radiusScale: 1.0, falloff: 'smoothstep' },
        { region: 'upper_lip', weight: 0.75, radiusScale: 0.9, falloff: 'gaussian' },
        { region: 'lower_lip', weight: 0.75, radiusScale: 0.9, falloff: 'gaussian' },
      ],
      notes: 'Useful for rounded vowels and pucker-like visemes.',
    },
    {
      id: 'mouth_wide',
      label: 'Mouth Wide',
      side: 'center',
      mode: 'shape_key',
      anchor: 'mouth_center',
      fallbackAnchors: ['mouth_corner_left', 'mouth_corner_right'],
      placementOffset: { x: 0, y: 0, z: 0 },
      handleRadius: 0.04,
      supportedExpressions: ['mouthWide', 'viseme_E', 'viseme_ih', 'viseme_SS'],
      influences: [
        { region: 'mouth', weight: 1, radiusScale: 1.2, falloff: 'smoothstep' },
        { region: 'upper_lip', weight: 0.5, radiusScale: 1.2, falloff: 'gaussian' },
        { region: 'lower_lip', weight: 0.5, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'blink_left',
      label: 'Blink Left',
      side: 'left',
      mode: 'hybrid',
      anchor: 'eye_center_left',
      fallbackAnchors: ['upper_lid_left', 'lower_lid_left'],
      symmetryPartnerId: 'blink_right',
      placementOffset: { x: 0, y: 0, z: 0.012 },
      handleRadius: 0.035,
      supportedExpressions: ['blinkLeft', 'squintLeft'],
      influences: [
        { region: 'left_eye', weight: 1, radiusScale: 1.0, falloff: 'smoothstep' },
        { region: 'left_brow', weight: 0.2, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'blink_right',
      label: 'Blink Right',
      side: 'right',
      mode: 'hybrid',
      anchor: 'eye_center_right',
      fallbackAnchors: ['upper_lid_right', 'lower_lid_right'],
      symmetryPartnerId: 'blink_left',
      placementOffset: { x: 0, y: 0, z: 0.012 },
      handleRadius: 0.035,
      supportedExpressions: ['blinkRight', 'squintRight'],
      influences: [
        { region: 'right_eye', weight: 1, radiusScale: 1.0, falloff: 'smoothstep' },
        { region: 'right_brow', weight: 0.2, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'eye_aim_left',
      label: 'Eye Aim Left',
      side: 'left',
      mode: 'bone',
      anchor: 'eye_center_left',
      symmetryPartnerId: 'eye_aim_right',
      placementOffset: { x: 0, y: 0, z: 0.04 },
      handleRadius: 0.03,
      supportedExpressions: ['eyeLookLeft', 'eyeLookRight', 'eyeLookUp', 'eyeLookDown'],
      influences: [
        { region: 'left_eye', weight: 1, radiusScale: 0.8, falloff: 'linear' },
      ],
    },
    {
      id: 'eye_aim_right',
      label: 'Eye Aim Right',
      side: 'right',
      mode: 'bone',
      anchor: 'eye_center_right',
      symmetryPartnerId: 'eye_aim_left',
      placementOffset: { x: 0, y: 0, z: 0.04 },
      handleRadius: 0.03,
      supportedExpressions: ['eyeLookLeft', 'eyeLookRight', 'eyeLookUp', 'eyeLookDown'],
      influences: [
        { region: 'right_eye', weight: 1, radiusScale: 0.8, falloff: 'linear' },
      ],
    },
    {
      id: 'brow_inner_left',
      label: 'Brow Inner Left',
      side: 'left',
      mode: 'shape_key',
      anchor: 'brow_inner_left',
      fallbackAnchors: ['forehead_center'],
      symmetryPartnerId: 'brow_inner_right',
      placementOffset: { x: 0, y: 0.004, z: 0.006 },
      handleRadius: 0.03,
      supportedExpressions: ['browInnerUpLeft', 'browDownLeft'],
      influences: [
        { region: 'left_brow', weight: 1, radiusScale: 1.0, falloff: 'smoothstep' },
        { region: 'left_eye', weight: 0.2, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'brow_inner_right',
      label: 'Brow Inner Right',
      side: 'right',
      mode: 'shape_key',
      anchor: 'brow_inner_right',
      fallbackAnchors: ['forehead_center'],
      symmetryPartnerId: 'brow_inner_left',
      placementOffset: { x: 0, y: 0.004, z: 0.006 },
      handleRadius: 0.03,
      supportedExpressions: ['browInnerUpRight', 'browDownRight'],
      influences: [
        { region: 'right_brow', weight: 1, radiusScale: 1.0, falloff: 'smoothstep' },
        { region: 'right_eye', weight: 0.2, radiusScale: 1.2, falloff: 'gaussian' },
      ],
    },
    {
      id: 'brow_outer_left',
      label: 'Brow Outer Left',
      side: 'left',
      mode: 'shape_key',
      anchor: 'brow_outer_left',
      fallbackAnchors: ['temple_left'],
      symmetryPartnerId: 'brow_outer_right',
      placementOffset: { x: 0, y: 0.004, z: 0.006 },
      handleRadius: 0.03,
      supportedExpressions: ['browOuterUpLeft', 'browDownLeft'],
      influences: [
        { region: 'left_brow', weight: 0.9, radiusScale: 1.1, falloff: 'smoothstep' },
      ],
    },
    {
      id: 'brow_outer_right',
      label: 'Brow Outer Right',
      side: 'right',
      mode: 'shape_key',
      anchor: 'brow_outer_right',
      fallbackAnchors: ['temple_right'],
      symmetryPartnerId: 'brow_outer_left',
      placementOffset: { x: 0, y: 0.004, z: 0.006 },
      handleRadius: 0.03,
      supportedExpressions: ['browOuterUpRight', 'browDownRight'],
      influences: [
        { region: 'right_brow', weight: 0.9, radiusScale: 1.1, falloff: 'smoothstep' },
      ],
    },
    {
      id: 'cheek_left',
      label: 'Cheek Left',
      side: 'left',
      mode: 'shape_key',
      anchor: 'cheek_left',
      fallbackAnchors: ['mouth_corner_left'],
      symmetryPartnerId: 'cheek_right',
      placementOffset: { x: 0, y: 0.002, z: 0.004 },
      handleRadius: 0.035,
      supportedExpressions: ['cheekRaiseLeft', 'mouthSmileLeft'],
      influences: [
        { region: 'left_cheek', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'left_eye', weight: 0.25, radiusScale: 1.3, falloff: 'gaussian' },
      ],
    },
    {
      id: 'cheek_right',
      label: 'Cheek Right',
      side: 'right',
      mode: 'shape_key',
      anchor: 'cheek_right',
      fallbackAnchors: ['mouth_corner_right'],
      symmetryPartnerId: 'cheek_left',
      placementOffset: { x: 0, y: 0.002, z: 0.004 },
      handleRadius: 0.035,
      supportedExpressions: ['cheekRaiseRight', 'mouthSmileRight'],
      influences: [
        { region: 'right_cheek', weight: 1, radiusScale: 1.1, falloff: 'smoothstep' },
        { region: 'right_eye', weight: 0.25, radiusScale: 1.3, falloff: 'gaussian' },
      ],
    },
  ],
};

export const FACIAL_BASIS_EXPRESSION_MAP: Record<string, string[]> = {
  jawOpen: ['jaw'],
  mouthClose: ['jaw', 'upper_lip', 'lower_lip'],
  mouthSmile: ['mouth_corner_left', 'mouth_corner_right', 'cheek_left', 'cheek_right'],
  mouthFrown: ['mouth_corner_left', 'mouth_corner_right'],
  mouthPucker: ['mouth_pucker', 'upper_lip', 'lower_lip'],
  mouthWide: ['mouth_wide', 'mouth_corner_left', 'mouth_corner_right'],
  blinkLeft: ['blink_left'],
  blinkRight: ['blink_right'],
  browUp: ['brow_inner_left', 'brow_inner_right', 'brow_outer_left', 'brow_outer_right'],
  browDown: ['brow_inner_left', 'brow_inner_right'],
  cheekRaise: ['cheek_left', 'cheek_right'],
  viseme_aa: ['jaw', 'lower_lip'],
  viseme_E: ['mouth_wide', 'mouth_corner_left', 'mouth_corner_right'],
  viseme_ih: ['mouth_wide'],
  viseme_oh: ['mouth_pucker', 'jaw'],
  viseme_ou: ['mouth_pucker'],
  viseme_PP: ['upper_lip', 'lower_lip'],
  viseme_FF: ['upper_lip', 'lower_lip'],
  viseme_TH: ['jaw', 'mouth_wide'],
  viseme_SS: ['mouth_wide'],
};
