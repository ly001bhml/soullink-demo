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
}

const NEGATIVE_HINTS = [
  '难过', '伤心', '痛苦', '委屈', '失落', '压抑', '烦', '烦躁', '焦虑',
  '紧张', '害怕', '孤独', '累', '疲惫', '没意思', '想哭', '失眠', '压力', '难受',
  'sad', 'anxious', 'anxiety', 'depressed', 'upset', 'tired', 'stress',
];

const POSITIVE_HINTS = [
  '开心', '高兴', '兴奋', '激动', '幸福', '放松', '安心', '期待', '满足', '喜欢',
  '快乐', '真棒', '好耶', 'happy', 'excited', 'great', 'good', 'relaxed',
];

const HIGH_AROUSAL_HINTS = [
  '特别', '非常', '太', '真的', '激动', '崩溃', '着急', '急', '烦躁', '气死',
  '愤怒', '害怕', '紧张', '兴奋', '开心死了', '!!!', '！！', '?', '？',
];

const LOW_AROUSAL_HINTS = [
  '累', '疲惫', '没力气', '不想动', '低落', '压抑', '无助', '睡不着', '困',
  '麻木', '空落落', '平静', '放松', '慢慢来',
];

const containsAny = (text: string, hints: string[]) => {
  const normalized = text.toLowerCase();
  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
};

const inferValence = (text: string): EmotionValence => {
  if (containsAny(text, NEGATIVE_HINTS)) {
    return 'negative';
  }
  if (containsAny(text, POSITIVE_HINTS)) {
    return 'positive';
  }
  return 'neutral';
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

export const buildEmotionContext = (
  text: string,
  source: InteractionSource,
): EmotionContext => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return {};
  }

  const valence = inferValence(normalizedText);
  const arousal = inferArousal(normalizedText, valence);
  const strategy = pickStrategy(valence, arousal);
  const emotionState =
    `emotion_state: valence=${valence}; ` +
    `arousal=${arousal}; ` +
    `strategy=${strategy}; ` +
    `source=${source}; ` +
    `confidence=0.4; ` +
    `care_style=gentle_support; ` +
    `tool_suggestions=emotion_support_plan`;

  if (source === 'voice') {
    return {
      emotionState,
      voiceEmotionHint: {
        valence,
        arousal,
        source: 'frontend_browser_asr',
      },
    };
  }

  return {
    emotionState,
  };
};
