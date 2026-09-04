export type SupportValence = 'negative' | 'neutral' | 'positive';
export type SupportArousal = 'low' | 'medium' | 'high';
export type SupportTrend = 'improving' | 'stable' | 'worsening';
export type WorkshopEmotion = '平静' | '开心' | '难过' | '疲惫' | '焦虑' | '烦躁';

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

export interface WorkshopStateSnapshot {
  selectedEmotion: WorkshopEmotion;
  updatedAt: number;
}

export interface FusedSupportState {
  estimatedValence: SupportValence;
  estimatedArousal: SupportArousal;
  trend: SupportTrend;
  updatedAt: number;
}

const INITIAL_MULTIMODAL_STATE_KEY = 'soullink_initial_multimodal_state';
const WORKSHOP_STATE_SNAPSHOT_KEY = 'soullink_workshop_state_snapshot';
const FUSED_SUPPORT_STATE_KEY = 'soullink_fused_support_state';
const SUPPORT_STATE_MAX_AGE_MS = 60 * 60 * 1000;

const isBrowser = typeof window !== 'undefined';

/**
 * 从 localStorage 读取 JSON。
 * @param key 键名。
 * @returns 解析后的对象，失败时返回 null。
 */
const readLocalStorage = <T>(key: string): T | null => {
  if (!isBrowser) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

/**
 * 判断时间戳是否新鲜。
 * @param timestamp 时间戳。
 * @param maxAgeMs 最大有效时长。
 * @returns 是否在有效期内。
 */
const isFresh = (timestamp: number, maxAgeMs: number) =>
  Boolean(timestamp) && !Number.isNaN(timestamp) && Date.now() - timestamp <= maxAgeMs;

/**
 * 加载最近一次多模态初始情绪。
 * @param maxAgeMs 最大有效时长。
 * @returns 最近有效状态或 null。
 */
export const loadInitialMultimodalState = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): InitialMultimodalState | null => {
  const state = readLocalStorage<InitialMultimodalState>(INITIAL_MULTIMODAL_STATE_KEY);
  if (!state || !isFresh(state.capturedAt, maxAgeMs)) {
    return null;
  }
  return state;
};

/**
 * 加载小游戏工作坊状态快照。
 * @param maxAgeMs 最大有效时长。
 * @returns 最近有效快照或 null。
 */
export const loadWorkshopStateSnapshot = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): WorkshopStateSnapshot | null => {
  const snapshot = readLocalStorage<WorkshopStateSnapshot>(WORKSHOP_STATE_SNAPSHOT_KEY);
  if (!snapshot || !isFresh(snapshot.updatedAt, maxAgeMs)) {
    return null;
  }
  return snapshot;
};

/**
 * 加载融合支持状态。
 * @param maxAgeMs 最大有效时长。
 * @returns 最近有效状态或 null。
 */
export const loadFusedSupportState = (
  maxAgeMs = SUPPORT_STATE_MAX_AGE_MS,
): FusedSupportState | null => {
  const state = readLocalStorage<FusedSupportState>(FUSED_SUPPORT_STATE_KEY);
  if (!state || !isFresh(state.updatedAt, maxAgeMs)) {
    return null;
  }
  return state;
};
