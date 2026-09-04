import { FaceDriverTarget, emptyFaceDriverTarget } from './faceDriverService';

export interface FaceSemanticTarget {
  jawOpen: number;
  lipClosure: number;
  lipSpread: number;
  lipRound: number;
  upperLipLift: number;
  lowerLipDrop: number;
  smile: number;
  cheekRaise: number;
  blinkLeft: number;
  blinkRight: number;
  eyeWide: number;
  squint: number;
  browRaise: number;
  browDown: number;
}

export interface FlameStyleFaceTarget {
  jawOpen: number;
  mouthClose: number;
  mouthFunnel: number;
  mouthPucker: number;
  mouthShrugUpper: number;
  mouthShrugLower: number;
  mouthStretchLeft: number;
  mouthStretchRight: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  eyeSquintLeft: number;
  eyeSquintRight: number;
  cheekRaiseLeft: number;
  cheekRaiseRight: number;
  browInnerUp: number;
  browOuterUpLeft: number;
  browOuterUpRight: number;
  browDownLeft: number;
  browDownRight: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const semantic = (partial: Partial<FaceSemanticTarget>): FaceSemanticTarget => ({
  jawOpen: 0,
  lipClosure: 0,
  lipSpread: 0,
  lipRound: 0,
  upperLipLift: 0,
  lowerLipDrop: 0,
  smile: 0,
  cheekRaise: 0,
  blinkLeft: 0,
  blinkRight: 0,
  eyeWide: 0,
  squint: 0,
  browRaise: 0,
  browDown: 0,
  ...partial,
});

const flame = (partial: Partial<FlameStyleFaceTarget>): FlameStyleFaceTarget => ({
  jawOpen: 0,
  mouthClose: 0,
  mouthFunnel: 0,
  mouthPucker: 0,
  mouthShrugUpper: 0,
  mouthShrugLower: 0,
  mouthStretchLeft: 0,
  mouthStretchRight: 0,
  mouthSmileLeft: 0,
  mouthSmileRight: 0,
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  eyeWideLeft: 0,
  eyeWideRight: 0,
  eyeSquintLeft: 0,
  eyeSquintRight: 0,
  cheekRaiseLeft: 0,
  cheekRaiseRight: 0,
  browInnerUp: 0,
  browOuterUpLeft: 0,
  browOuterUpRight: 0,
  browDownLeft: 0,
  browDownRight: 0,
  ...partial,
});

export const flameStyleFaceService = {
  visemeToSemanticTarget(viseme: string, blink = 0) {
    switch (String(viseme || '').toLowerCase()) {
      case 'aa':
        return semantic({
          jawOpen: 0.92,
          lipSpread: 0.26,
          upperLipLift: 0.08,
          lowerLipDrop: 0.54,
          eyeWide: 0.08,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'e':
        return semantic({
          jawOpen: 0.34,
          lipSpread: 0.92,
          lipClosure: 0.06,
          upperLipLift: 0.18,
          lowerLipDrop: 0.14,
          cheekRaise: 0.08,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'ih':
        return semantic({
          jawOpen: 0.28,
          lipSpread: 0.64,
          lipClosure: 0.08,
          upperLipLift: 0.14,
          lowerLipDrop: 0.16,
          cheekRaise: 0.04,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'oh':
        return semantic({
          jawOpen: 0.52,
          lipSpread: 0.08,
          lipRound: 0.62,
          lipClosure: 0.08,
          upperLipLift: 0.04,
          lowerLipDrop: 0.24,
          eyeWide: 0.04,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'ou':
        return semantic({
          jawOpen: 0.22,
          lipSpread: 0.03,
          lipRound: 0.95,
          lipClosure: 0.2,
          upperLipLift: 0.02,
          lowerLipDrop: 0.08,
          squint: 0.06,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'pp':
        return semantic({
          jawOpen: 0.02,
          lipClosure: 0.98,
          lipRound: 0.12,
          upperLipLift: 0.04,
          browDown: 0.04,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'ff':
        return semantic({
          jawOpen: 0.16,
          lipSpread: 0.22,
          lipClosure: 0.18,
          upperLipLift: 0.68,
          lowerLipDrop: 0.34,
          cheekRaise: 0.12,
          squint: 0.08,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'th':
        return semantic({
          jawOpen: 0.32,
          lipSpread: 0.44,
          lipClosure: 0.08,
          upperLipLift: 0.16,
          lowerLipDrop: 0.3,
          eyeWide: 0.03,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'dd':
        return semantic({
          jawOpen: 0.36,
          lipSpread: 0.22,
          lipClosure: 0.06,
          upperLipLift: 0.1,
          lowerLipDrop: 0.24,
          browDown: 0.03,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'kk':
        return semantic({
          jawOpen: 0.38,
          lipSpread: 0.12,
          lipClosure: 0.04,
          upperLipLift: 0.02,
          lowerLipDrop: 0.2,
          browDown: 0.04,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'ch':
        return semantic({
          jawOpen: 0.34,
          lipSpread: 0.56,
          lipClosure: 0.18,
          upperLipLift: 0.08,
          lowerLipDrop: 0.18,
          cheekRaise: 0.06,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'ss':
        return semantic({
          jawOpen: 0.16,
          lipSpread: 0.76,
          lipClosure: 0.4,
          upperLipLift: 0.12,
          lowerLipDrop: 0.04,
          squint: 0.14,
          browDown: 0.06,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'nn':
        return semantic({
          jawOpen: 0.18,
          lipSpread: 0.32,
          lipClosure: 0.36,
          upperLipLift: 0.08,
          lowerLipDrop: 0.06,
          browDown: 0.05,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'rr':
        return semantic({
          jawOpen: 0.24,
          lipSpread: 0.12,
          lipRound: 0.62,
          lipClosure: 0.24,
          upperLipLift: 0.04,
          lowerLipDrop: 0.14,
          squint: 0.08,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
      case 'sil':
      default:
        return semantic({
          jawOpen: 0.03,
          lipClosure: 0.12,
          blinkLeft: blink,
          blinkRight: blink * 0.98,
          browRaise: 0.02,
        });
    }
  },

  speechFallbackToSemanticTarget(time: number, isTalking: boolean, blink: number) {
    const speechWaveA = 0.5 + 0.5 * Math.sin(time * 9.4);
    const speechWaveB = 0.5 + 0.5 * Math.sin(time * 15.8 + 0.7);
    const talkingBlend = isTalking ? speechWaveA * 0.65 + speechWaveB * 0.35 : 0;

    return semantic({
      jawOpen: isTalking ? 0.1 + talkingBlend * 0.38 : 0,
      lipClosure: isTalking ? 0.03 + speechWaveB * 0.08 : 0.02,
      lipSpread: isTalking ? 0.14 + speechWaveA * 0.28 : 0,
      lipRound: isTalking ? speechWaveB * 0.08 : 0,
      upperLipLift: isTalking ? 0.03 + speechWaveA * 0.06 : 0,
      lowerLipDrop: isTalking ? 0.08 + speechWaveA * 0.14 : 0,
      smile: isTalking ? 0.1 : 0.02,
      cheekRaise: isTalking ? 0.06 + speechWaveA * 0.05 : 0.01,
      blinkLeft: blink,
      blinkRight: blink * 0.98,
      eyeWide: isTalking ? 0.04 + speechWaveA * 0.08 : 0,
      squint: isTalking ? speechWaveB * 0.04 : 0,
      browRaise: isTalking ? 0.03 : 0,
      browDown: isTalking ? speechWaveB * 0.02 : 0,
    });
  },

  semanticToFlameStyleTarget(target: FaceSemanticTarget) {
    const symmetricStretch = clamp01(target.lipSpread);
    const roundedFunnel = clamp01(target.lipRound * (1 - symmetricStretch * 0.32));
    const symmetricSmile = clamp01(target.smile * (0.75 + symmetricStretch * 0.2));

    return flame({
      jawOpen: target.jawOpen,
      mouthClose: target.lipClosure,
      mouthFunnel: roundedFunnel,
      mouthPucker: clamp01(target.lipRound * 0.92 + target.lipClosure * 0.08),
      mouthShrugUpper: target.upperLipLift,
      mouthShrugLower: clamp01(target.lowerLipDrop * 0.8 + target.jawOpen * 0.12),
      mouthStretchLeft: symmetricStretch,
      mouthStretchRight: symmetricStretch,
      mouthSmileLeft: symmetricSmile,
      mouthSmileRight: symmetricSmile,
      eyeBlinkLeft: target.blinkLeft,
      eyeBlinkRight: target.blinkRight,
      eyeWideLeft: target.eyeWide,
      eyeWideRight: target.eyeWide,
      eyeSquintLeft: target.squint,
      eyeSquintRight: target.squint,
      cheekRaiseLeft: target.cheekRaise,
      cheekRaiseRight: target.cheekRaise,
      browInnerUp: target.browRaise,
      browOuterUpLeft: clamp01(target.browRaise * 0.7),
      browOuterUpRight: clamp01(target.browRaise * 0.7),
      browDownLeft: target.browDown,
      browDownRight: target.browDown,
    });
  },

  flameStyleToCharacterTarget(target: FlameStyleFaceTarget): FaceDriverTarget {
    return {
      ...emptyFaceDriverTarget(),
      jawOpen: clamp01(target.jawOpen),
      blinkLeft: clamp01(target.eyeBlinkLeft),
      blinkRight: clamp01(target.eyeBlinkRight),
      eyeWideLeft: clamp01(target.eyeWideLeft),
      eyeWideRight: clamp01(target.eyeWideRight),
      squintLeft: clamp01(target.eyeSquintLeft),
      squintRight: clamp01(target.eyeSquintRight),
      mouthSmileLeft: clamp01(target.mouthSmileLeft),
      mouthSmileRight: clamp01(target.mouthSmileRight),
      mouthWide: clamp01(
        ((target.mouthStretchLeft + target.mouthStretchRight) * 0.5)
          + (target.mouthSmileLeft + target.mouthSmileRight) * 0.08
          - target.mouthFunnel * 0.08,
      ),
      mouthPucker: clamp01(Math.max(target.mouthPucker, target.mouthFunnel * 0.72)),
      lipPress: clamp01(target.mouthClose * 0.92 + target.mouthFunnel * 0.08),
      upperLipRaise: clamp01(target.mouthShrugUpper),
      lowerLipDrop: clamp01(target.mouthShrugLower),
      cheekRaiseLeft: clamp01(target.cheekRaiseLeft),
      cheekRaiseRight: clamp01(target.cheekRaiseRight),
      browUpLeft: clamp01(target.browInnerUp * 0.7 + target.browOuterUpLeft * 0.3),
      browUpRight: clamp01(target.browInnerUp * 0.7 + target.browOuterUpRight * 0.3),
      browDownLeft: clamp01(target.browDownLeft),
      browDownRight: clamp01(target.browDownRight),
    };
  },
};
