export type SupportValence = 'negative' | 'neutral' | 'positive';
export type SupportArousal = 'low' | 'medium' | 'high';
export type WorkshopEmotion = '平静' | '开心' | '难过' | '疲惫' | '焦虑' | '烦躁';
export type WorkshopStage = 'drafting' | 'draft' | 'reconstruction' | 'saved';
export type SupportNeed = 'comfort' | 'stabilize' | 'reflect' | 'creative-guide';
export type SupportAction =
  | 'encourage_expression'
  | 'complete_draft'
  | 'reduce_sharpness'
  | 'increase_whitespace'
  | 'add_structure'
  | 'repeat_comfort_element';

export type SupportTrend = 'improving' | 'stable' | 'worsening';

export interface InitialMultimodalState {
  valence: SupportValence;
  arousal: SupportArousal;
  strategy: string;
  confidence: number;
  videoEmotionLabel?: string;
  voiceEmotionLabel?: string;
  lastUserTextExcerpt: string;
  capturedAt: number;
}

export interface WorkshopInteractionSummary {
  editCount: number;
  deleteCount: number;
  styleChangeCount: number;
  repetitionActionCount: number;
  pauseCount: number;
  timeSpentSec: number;
}

export interface WorkshopCompositionFeatures {
  density: number;
  blankRatio: number;
  contrastStrength: number;
  symmetryScore: number;
  centerOffset: number;
  clusterScore: number;
}

export interface WorkshopColorFeatures {
  colorDiversity: number;
  averageBrightness: number;
  warmRatio: number;
  coolRatio: number;
  tendency: string;
}

export interface WorkshopShapeFeatures {
  triangleRatio: number;
  circleRatio: number;
  sharpness: number;
}

export interface WorkshopReconstructionDelta {
  deltaSharpness: number;
  deltaDensity: number;
  appliedSuggestionCount: number;
}

export interface WorkshopStateSnapshot {
  stage: WorkshopStage;
  selectedEmotion: WorkshopEmotion;
  compositionFeatures: WorkshopCompositionFeatures;
  colorFeatures: WorkshopColorFeatures;
  shapeFeatures: WorkshopShapeFeatures;
  interactionSummary: WorkshopInteractionSummary;
  reconstructionDelta?: WorkshopReconstructionDelta | null;
  updatedAt: number;
}

export interface FusedSupportState {
  estimatedValence: SupportValence;
  estimatedArousal: SupportArousal;
  trend: SupportTrend;
  supportNeed: SupportNeed;
  nextSupportAction: SupportAction;
  chatCarryoverText: string;
  updatedAt: number;
}

export interface RealtimeEmotionSignals {
  videoEmotionLabel?: string;
  voiceEmotionLabel?: string;
  updatedAt: number;
}

export const INITIAL_MULTIMODAL_STATE_KEY = 'soullink_initial_multimodal_state';
export const WORKSHOP_STATE_SNAPSHOT_KEY = 'soullink_workshop_state_snapshot';
export const FUSED_SUPPORT_STATE_KEY = 'soullink_fused_support_state';
export const REALTIME_EMOTION_SIGNALS_KEY = 'soullink_realtime_emotion_signals';
export const SUPPORT_STATE_MAX_AGE_MS = 60 * 60 * 1000;

const ANGER_HINTS = ['anger', 'angry', '愤怒', '烦躁', '生气', '气愤', '暴躁'];
const FATIGUE_HINTS = ['疲惫', '累', '没力气', 'tired', 'helplessness', '无助'];

const isBrowser = typeof window !== 'undefined';

const readLocalStorage = <T>(key: string): T | null => {
  if (!isBrowser) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[supportState] Failed to read ${key}:`, error);
    return null;
  }
};

const writeLocalStorage = <T>(key: string, value: T) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[supportState] Failed to write ${key}:`, error);
  }
};

const isFresh = (timestamp: number, maxAgeMs: number) => {
  if (!timestamp || Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= maxAgeMs;
};

const isSupportValence = (value: unknown): value is SupportValence =>
  value === 'negative' || value === 'neutral' || value === 'positive';

const isSupportArousal = (value: unknown): value is SupportArousal =>
  value === 'low' || value === 'medium' || value === 'high';

const truncateExcerpt = (text: string, maxLength = 80) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const includesAny = (text: string, hints: string[]) => {
  const normalized = text.toLowerCase();
  return hints.some((hint) => normalized.includes(hint.toLowerCase()));
};

const formatMetric = (value: number) => Math.max(0, Math.min(1, value || 0)).toFixed(2);

const getReconstructionStatus = (snapshot: WorkshopStateSnapshot, fused: FusedSupportState) => {
  if (snapshot.stage === 'saved') {
    return 'saved';
  }
  if (!snapshot.reconstructionDelta) {
    return snapshot.stage === 'draft' ? 'draft_ready' : 'not_started';
  }
  if (snapshot.stage === 'reconstruction' && fused.trend === 'improving') {
    return 'stabilizing';
  }
  if (snapshot.stage === 'reconstruction') {
    return 'reconstruction_started';
  }
  return snapshot.stage;
};

export const saveInitialMultimodalState = (state: InitialMultimodalState) => {
  writeLocalStorage(INITIAL_MULTIMODAL_STATE_KEY, state);
};

export const loadInitialMultimodalState = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): InitialMultimodalState | null => {
  const state = readLocalStorage<InitialMultimodalState>(INITIAL_MULTIMODAL_STATE_KEY);
  if (
    !state ||
    !isFresh(state.capturedAt, maxAgeMs) ||
    !isSupportValence(state.valence) ||
    !isSupportArousal(state.arousal)
  ) {
    return null;
  }
  return state;
};

export const saveWorkshopStateSnapshot = (snapshot: WorkshopStateSnapshot) => {
  writeLocalStorage(WORKSHOP_STATE_SNAPSHOT_KEY, snapshot);
};

export const loadWorkshopStateSnapshot = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): WorkshopStateSnapshot | null => {
  const snapshot = readLocalStorage<WorkshopStateSnapshot>(WORKSHOP_STATE_SNAPSHOT_KEY);
  if (!snapshot || !isFresh(snapshot.updatedAt, maxAgeMs)) {
    return null;
  }
  return snapshot;
};

export const saveFusedSupportState = (state: FusedSupportState) => {
  writeLocalStorage(FUSED_SUPPORT_STATE_KEY, state);
};

export const loadFusedSupportState = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): FusedSupportState | null => {
  const state = readLocalStorage<FusedSupportState>(FUSED_SUPPORT_STATE_KEY);
  if (!state || !isFresh(state.updatedAt, maxAgeMs)) {
    return null;
  }
  return state;
};

export const saveRealtimeEmotionSignals = (signals: RealtimeEmotionSignals) => {
  writeLocalStorage(REALTIME_EMOTION_SIGNALS_KEY, signals);
};

export const loadRealtimeEmotionSignals = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): RealtimeEmotionSignals | null => {
  const signals = readLocalStorage<RealtimeEmotionSignals>(REALTIME_EMOTION_SIGNALS_KEY);
  if (!signals || !isFresh(signals.updatedAt, maxAgeMs)) {
    return null;
  }
  return signals;
};

export const inferInitialWorkshopEmotion = (
  state: InitialMultimodalState | null,
): WorkshopEmotion | null => {
  if (!state || !isSupportValence(state.valence) || !isSupportArousal(state.arousal)) {
    return null;
  }

  const labelText = [state.videoEmotionLabel, state.voiceEmotionLabel, state.lastUserTextExcerpt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (state.valence === 'positive' && state.arousal === 'high') {
    return '开心';
  }

  if (
    (state.valence === 'neutral' && state.arousal === 'low') ||
    (state.valence === 'positive' && state.arousal === 'low')
  ) {
    return '平静';
  }

  if (state.valence === 'negative' && state.arousal === 'low') {
    return includesAny(labelText, FATIGUE_HINTS) ? '疲惫' : '难过';
  }

  if (state.valence === 'negative' && state.arousal === 'high') {
    return includesAny(labelText, ANGER_HINTS) ? '烦躁' : '焦虑';
  }

  return '平静';
};

export const createInitialMultimodalState = (
  params: Omit<InitialMultimodalState, 'capturedAt' | 'lastUserTextExcerpt'> & {
    lastUserText: string;
  },
): InitialMultimodalState => ({
  valence: params.valence,
  arousal: params.arousal,
  strategy: params.strategy,
  confidence: params.confidence,
  videoEmotionLabel: params.videoEmotionLabel,
  voiceEmotionLabel: params.voiceEmotionLabel,
  lastUserTextExcerpt: truncateExcerpt(params.lastUserText),
  capturedAt: Date.now(),
});

export const serializeWorkshopStateForChat = (
  snapshot: WorkshopStateSnapshot,
  fused: FusedSupportState,
): string => {
  const reconstructionStatus = getReconstructionStatus(snapshot, fused);
  return [
    'workshop_state:',
    `stage=${snapshot.stage}`,
    `estimated_valence=${fused.estimatedValence}`,
    `estimated_arousal=${fused.estimatedArousal}`,
    `trend=${fused.trend}`,
    `support_need=${fused.supportNeed}`,
    `next_action=${fused.nextSupportAction}`,
    `visual_density=${formatMetric(snapshot.compositionFeatures.density)}`,
    `sharpness=${formatMetric(snapshot.shapeFeatures.sharpness)}`,
    `color_tendency=${snapshot.colorFeatures.tendency}`,
    `reconstruction_status=${reconstructionStatus}`,
  ].join('; ');
};

export const loadWorkshopStateForChat = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): string | undefined => {
  const snapshot = loadWorkshopStateSnapshot(maxAgeMs);
  const fused = loadFusedSupportState(maxAgeMs);
  if (!snapshot || !fused) {
    return undefined;
  }
  return serializeWorkshopStateForChat(snapshot, fused);
};
