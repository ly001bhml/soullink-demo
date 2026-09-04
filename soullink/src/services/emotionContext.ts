import { InitialMultimodalState, createInitialMultimodalState } from './supportState';

export type EmotionValence = 'negative' | 'neutral' | 'positive';
export type EmotionArousal = 'low' | 'medium' | 'high';
export type InteractionSource = 'text' | 'voice';

export interface VoiceEmotionHint {
  valence: EmotionValence;
  arousal: EmotionArousal;
  source?: string;
}

export interface EmotionContext {
  emotionState?: string;
  voiceEmotionHint?: VoiceEmotionHint;
  initialMultimodalState?: InitialMultimodalState;
  workshopState?: string;
}

export interface EmotionContextOptions {
  injectMultimodalEmotion?: boolean;
  videoEmotionLabel?: string;
  voiceEmotionLabel?: string;
}

type EmotionSignalSource = 'text' | 'video' | 'voice';

type EmotionSignal = {
  source: EmotionSignalSource;
  valence: EmotionValence;
  arousal: EmotionArousal;
  label?: string;
};

const NEGATIVE_HINTS = [
  '难过', '伤心', '痛苦', '委屈', '失落', '压抑', '烦躁', '焦虑', '紧张', '害怕', '孤独', '累', '疲惫',
  '没意思', '想哭', '失眠', '压力', '难受', 'sad', 'anxious', 'anxiety', 'depressed', 'upset', 'stress',
];

const POSITIVE_HINTS = [
  '开心', '高兴', '兴奋', '激动', '幸福', '放松', '安心', '期待', '满足', '喜欢', '快乐', '真棒',
  '好耶', 'happy', 'excited', 'great', 'good', 'relaxed',
];

const HIGH_AROUSAL_HINTS = [
  '特别', '非常', '太', '真的', '激动', '崩溃', '着急', '怒', '烦躁', '气死', '愤怒', '害怕',
  '紧张', '兴奋', '!!!', '！！', '!?', '!',
];

const LOW_AROUSAL_HINTS = [
  '累', '疲惫', '没力气', '不想动', '低落', '压抑', '无助', '睡不着', '困', '麻木', '空落落', '平静',
  '放松', '慢慢来', 'tired', 'exhausted',
];

const SIGNAL_HINTS: Array<{
  keywords: string[];
  valence: EmotionValence;
  arousal: EmotionArousal;
}> = [
  {
    keywords: ['anger', 'angry', '愤怒', '生气', '气愤', '暴躁'],
    valence: 'negative',
    arousal: 'high',
  },
  {
    keywords: ['anxiety', 'anxious', '焦虑', '紧张', '担心', '害怕', 'fear', 'scared', '恐惧'],
    valence: 'negative',
    arousal: 'high',
  },
  {
    keywords: ['sadness', 'sad', '伤心', '难过', '低落', '沮丧', '失望', '无助', '疲惫', 'helplessness'],
    valence: 'negative',
    arousal: 'low',
  },
  {
    keywords: ['disgust', '厌恶', '反感', '轻蔑', 'contempt', 'disappointment'],
    valence: 'negative',
    arousal: 'medium',
  },
  {
    keywords: ['surprise', '惊讶', '震惊'],
    valence: 'neutral',
    arousal: 'high',
  },
  {
    keywords: ['happiness', 'happy', '开心', '高兴', '兴奋', '激动', '喜悦', '幸福'],
    valence: 'positive',
    arousal: 'high',
  },
  {
    keywords: ['relaxed', 'calm', 'neutral', '平静', '放松', '冷静', '中性', '正常'],
    valence: 'neutral',
    arousal: 'low',
  },
  {
    keywords: ['positive', '积极', '愉快'],
    valence: 'positive',
    arousal: 'medium',
  },
];

const UNAVAILABLE_SIGNAL_HINTS = [
  '未识别',
  '未分析',
  '未开启',
  '不可用',
  '失败',
  '分析中',
  '录音中',
  '采集中',
  'processing',
  'error',
  'failed',
  'unavailable',
  'off',
];

const containsAny = (text: string, hints: string[]) => {
  const normalized = text.toLowerCase();
  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
};

const sanitizeStateValue = (value: string) => value.replace(/[;\n\r]/g, ' ').trim();
const normalizeSignalLabel = (label?: string) => String(label || '').trim().toLowerCase();

const isUsableSignalLabel = (label?: string) => {
  const normalized = normalizeSignalLabel(label);
  if (!normalized) {
    return false;
  }
  return !UNAVAILABLE_SIGNAL_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
};

const inferArousal = (text: string, valence: EmotionValence): EmotionArousal => {
  if (containsAny(text, HIGH_AROUSAL_HINTS)) {
    return 'high';
  }
  if (containsAny(text, LOW_AROUSAL_HINTS)) {
    return 'low';
  }
  if (valence === 'negative' && text.trim().length <= 8) {
    return 'low';
  }
  return 'medium';
};

const inferSignalHintFromLabel = (label?: string): VoiceEmotionHint | undefined => {
  if (!isUsableSignalLabel(label)) {
    return undefined;
  }

  const normalized = normalizeSignalLabel(label);
  const matched = SIGNAL_HINTS.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );

  if (!matched) {
    return undefined;
  }

  return {
    valence: matched.valence,
    arousal: matched.arousal,
  };
};

const inferTextSignalHint = (text: string): VoiceEmotionHint | undefined => {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return undefined;
  }

  const byLabel = inferSignalHintFromLabel(normalized);
  if (byLabel) {
    return byLabel;
  }

  const hasNegative = containsAny(normalized, NEGATIVE_HINTS);
  const hasPositive = containsAny(normalized, POSITIVE_HINTS);
  const hasArousalCue =
    containsAny(normalized, HIGH_AROUSAL_HINTS) || containsAny(normalized, LOW_AROUSAL_HINTS);

  if (!hasNegative && !hasPositive && !hasArousalCue) {
    return undefined;
  }

  let valence: EmotionValence = 'neutral';
  if (hasNegative && !hasPositive) {
    valence = 'negative';
  } else if (hasPositive && !hasNegative) {
    valence = 'positive';
  }

  return {
    valence,
    arousal: inferArousal(normalized, valence),
  };
};

const pickStrategy = (valence: EmotionValence, arousal: EmotionArousal) => {
  if (valence === 'negative' && arousal === 'low') {
    return 'comfort';
  }
  if (valence === 'negative' && arousal === 'high') {
    return 'stabilize';
  }
  if (valence === 'positive') {
    return 'resonate';
  }
  return 'support';
};

const pickByMajority = <T extends string>(values: T[], fallback: T): T => {
  if (!values.length) {
    return fallback;
  }
  const score = new Map<T, number>();
  values.forEach((value) => {
    score.set(value, (score.get(value) || 0) + 1);
  });

  let best = fallback;
  let bestScore = -1;
  for (const [value, valueScore] of score.entries()) {
    if (valueScore > bestScore) {
      best = value;
      bestScore = valueScore;
    }
  }
  return best;
};

export const buildEmotionContext = (
  text: string,
  source: InteractionSource,
  options: EmotionContextOptions = {},
): EmotionContext => {
  const normalizedText = String(text || '').trim();
  const textSignal = inferTextSignalHint(normalizedText);
  const videoSignal = options.injectMultimodalEmotion
    ? inferSignalHintFromLabel(options.videoEmotionLabel)
    : undefined;
  const voiceSignal = options.injectMultimodalEmotion
    ? inferSignalHintFromLabel(options.voiceEmotionLabel)
    : undefined;

  const signals: EmotionSignal[] = [];
  if (textSignal) {
    signals.push({ source: 'text', valence: textSignal.valence, arousal: textSignal.arousal });
  }
  if (videoSignal) {
    signals.push({
      source: 'video',
      valence: videoSignal.valence,
      arousal: videoSignal.arousal,
      label: options.videoEmotionLabel,
    });
  }
  if (voiceSignal) {
    signals.push({
      source: 'voice',
      valence: voiceSignal.valence,
      arousal: voiceSignal.arousal,
      label: options.voiceEmotionLabel,
    });
  }

  // No valid signal from text/camera/voice -> do not inject emotion guidance.
  if (!signals.length) {
    return {};
  }

  const valence = pickByMajority(
    signals.map((signal) => signal.valence),
    textSignal?.valence || 'neutral',
  );
  const arousal = pickByMajority(
    signals.map((signal) => signal.arousal),
    textSignal?.arousal || 'medium',
  );
  const strategy = pickStrategy(valence, arousal);
  const sourceLabels = signals.map((signal) => signal.source);
  const normalizedSource =
    sourceLabels.length > 1 ? `multimodal:${sourceLabels.join('+')}` : sourceLabels[0] || source;
  const confidence = signals.length >= 3 ? '0.85' : signals.length === 2 ? '0.72' : '0.58';
  const stateExtras: string[] = [];

  if (textSignal) {
    stateExtras.push('text_emotion=detected');
  }
  if (options.injectMultimodalEmotion && isUsableSignalLabel(options.videoEmotionLabel)) {
    stateExtras.push(`visual_emotion=${sanitizeStateValue(String(options.videoEmotionLabel))}`);
  }
  if (options.injectMultimodalEmotion && isUsableSignalLabel(options.voiceEmotionLabel)) {
    stateExtras.push(`voice_emotion=${sanitizeStateValue(String(options.voiceEmotionLabel))}`);
  }

  const emotionState =
    `emotion_state: valence=${valence}; ` +
    `arousal=${arousal}; ` +
    `strategy=${strategy}; ` +
    `source=${normalizedSource}; ` +
    `confidence=${confidence}; ` +
    `care_style=gentle_support; ` +
    `tool_suggestions=emotion_support_plan` +
    (stateExtras.length > 0 ? `; ${stateExtras.join('; ')}` : '');

  const result: EmotionContext = {
    emotionState,
    initialMultimodalState: createInitialMultimodalState({
      valence,
      arousal,
      strategy,
      confidence: Number(confidence),
      videoEmotionLabel: options.injectMultimodalEmotion ? options.videoEmotionLabel : undefined,
      voiceEmotionLabel: options.injectMultimodalEmotion ? options.voiceEmotionLabel : undefined,
      lastUserText: normalizedText,
    }),
  };

  if (source === 'voice' || voiceSignal) {
    result.voiceEmotionHint = {
      valence: voiceSignal?.valence ?? valence,
      arousal: voiceSignal?.arousal ?? arousal,
      source: voiceSignal ? 'frontend_emotion_capture' : 'frontend_browser_asr',
    };
  }

  return result;
};
