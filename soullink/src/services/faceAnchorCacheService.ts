import type { FaceAnchorPoint, FaceBoundsEstimate } from './facialControllerPlacementService';

export interface CachedFacePlacementInput {
  anchors: FaceAnchorPoint[];
  bounds?: FaceBoundsEstimate;
  savedAt: number;
  version: 1;
}

const CACHE_PREFIX = 'face_anchor_cache_v1_';

const isFiniteTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value)
  && value.length === 3
  && value.every((item) => typeof item === 'number' && Number.isFinite(item));

export const faceAnchorCacheService = {
  buildKey(cacheKey: string) {
    return `${CACHE_PREFIX}${cacheKey}`;
  },

  get(cacheKey: string): CachedFacePlacementInput | null {
    if (!cacheKey) {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.buildKey(cacheKey));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as CachedFacePlacementInput;
      if (!parsed || !Array.isArray(parsed.anchors)) {
        return null;
      }

      const anchors = parsed.anchors.filter(
        (anchor): anchor is FaceAnchorPoint =>
          !!anchor
          && typeof anchor.name === 'string'
          && isFiniteTuple(anchor.position as unknown),
      );

      const bounds = parsed.bounds && typeof parsed.bounds === 'object'
        ? parsed.bounds
        : undefined;

      return {
        anchors,
        bounds,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
        version: 1,
      };
    } catch (error) {
      console.error('[faceAnchorCacheService] Failed to read cache:', error);
      return null;
    }
  },

  save(cacheKey: string, payload: { anchors: FaceAnchorPoint[]; bounds?: FaceBoundsEstimate }) {
    if (!cacheKey) {
      return;
    }

    try {
      const record: CachedFacePlacementInput = {
        anchors: payload.anchors,
        bounds: payload.bounds,
        savedAt: Date.now(),
        version: 1,
      };
      localStorage.setItem(this.buildKey(cacheKey), JSON.stringify(record));
    } catch (error) {
      console.error('[faceAnchorCacheService] Failed to save cache:', error);
    }
  },

  remove(cacheKey: string) {
    if (!cacheKey) {
      return;
    }

    try {
      localStorage.removeItem(this.buildKey(cacheKey));
    } catch (error) {
      console.error('[faceAnchorCacheService] Failed to remove cache:', error);
    }
  },
};
