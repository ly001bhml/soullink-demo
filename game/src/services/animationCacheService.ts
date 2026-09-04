/**
 * 动画缓存服务
 * 用于缓存3D模型动画文件，减少切换动画时的卡顿
 * Web端使用 IndexedDB，移动端使用 File System API
 */

const DB_NAME = 'AnimationCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'animations';

/**
 * 检查是否支持 IndexedDB
 */
function isIndexedDBSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * 检查是否支持 File System API（移动端）
 */
function isFileSystemSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * 打开 IndexedDB 数据库
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBSupported()) {
      reject(new Error('IndexedDB 不支持'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * 规范化URL用于缓存键（提取相对路径部分）
 * @param url 原始URL（可能是完整URL或相对路径）
 * @returns 规范化后的URL（相对路径形式）
 */
function normalizeUrlForKey(url: string): string {
  // blob URL 或 data URL，直接返回（保持不变）
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  
  try {
    // 如果是完整URL，提取路径部分
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      // 提取路径部分（包括 /models/xxx.glb）
      return urlObj.pathname;
    }
  } catch {
    // URL解析失败，可能是格式错误，返回原URL
  }
  
  // 相对路径，直接返回
  return url;
}

/**
 * 生成缓存键
 * @param url 原始URL（可能是完整URL或相对路径）
 * @returns 缓存键（规范化后的相对路径）
 */
function getCacheKey(url: string): string {
  // 先规范化URL（提取相对路径部分）
  const normalized = normalizeUrlForKey(url);
  
  // 使用规范化后的URL作为键，如果URL太长则使用hash
  if (normalized.length > 200) {
    // 简单的hash函数
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `anim_${Math.abs(hash)}`;
  }
  return normalized;
}

/**
 * 将相对路径转换为完整URL
 * @param url 原始URL（可能是相对路径）
 * @returns 完整URL
 */
async function resolveFullUrl(url: string): Promise<string> {
  // blob URL 或 data URL，直接返回
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  
  // 如果已经是完整URL（包含协议），直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // 相对路径，需要拼接API base URL
  // 动态导入以避免循环依赖
  const { getFayApiUrl } = await import('./apiConfig');
  const apiUrl = getFayApiUrl();
  
  if (url.startsWith('/')) {
    return `${apiUrl}${url}`;
  } else {
    return `${apiUrl}/${url}`;
  }
}

/**
 * 将URL转换为Blob
 * @param url 文件URL（可能是相对路径）
 * @returns Promise<Blob>
 */
async function fetchAsBlob(url: string): Promise<Blob> {
  // 先将相对路径转换为完整URL
  const fullUrl = await resolveFullUrl(url);
  console.log(`[AnimationCache] 📥 下载文件: ${url} -> ${fullUrl}`);
  
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);
  }
  return await response.blob();
}

/**
 * 动画缓存服务类
 */
class AnimationCacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化缓存服务
   */
  private async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        if (isIndexedDBSupported()) {
          this.db = await openDB();
          console.log('[AnimationCache] ✅ IndexedDB 初始化成功');
        } else {
          console.warn('[AnimationCache] ⚠️ IndexedDB 不支持，将使用内存缓存');
        }
      } catch (error) {
        console.error('[AnimationCache] ❌ 初始化失败:', error);
      }
    })();

    return this.initPromise;
  }

  /**
   * 缓存动画文件
   * @param url 原始URL
   * @param blob 文件Blob（可选，如果不提供则从URL下载）
   * @returns Promise<string> 返回缓存URL（如果支持）或原始URL
   */
  async cacheAnimation(url: string, blob?: Blob): Promise<string> {
    await this.init();

    if (!url) {
      return url;
    }

    const cacheKey = getCacheKey(url);

    try {
      // 如果提供了blob，直接使用；否则从URL下载
      const fileBlob = blob || await fetchAsBlob(url);

      if (this.db) {
        // 使用 IndexedDB 缓存
        return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(fileBlob, cacheKey);

          request.onsuccess = () => {
            // 创建 blob URL
            const blobUrl = URL.createObjectURL(fileBlob);
            console.log(`[AnimationCache] ✅ 动画已缓存: ${url.substring(0, 50)}...`);
            resolve(blobUrl);
          };

          request.onerror = () => {
            console.error('[AnimationCache] ❌ 缓存失败:', request.error);
            // 缓存失败时返回原始URL
            resolve(url);
          };
        });
      } else {
        // 不支持 IndexedDB，使用内存缓存（Blob URL）
        const blobUrl = URL.createObjectURL(fileBlob);
        console.log(`[AnimationCache] ✅ 动画已缓存到内存: ${url.substring(0, 50)}...`);
        return blobUrl;
      }
    } catch (error) {
      console.error(`[AnimationCache] ❌ 缓存动画失败 (${url}):`, error);
      return url; // 失败时返回原始URL
    }
  }

  /**
   * 从缓存获取动画文件
   * @param url 原始URL
   * @returns Promise<string | null> 返回缓存URL，如果不存在则返回null
   */
  async getCachedAnimation(url: string): Promise<string | null> {
    await this.init();

    if (!url || !this.db) {
      return null;
    }

    const cacheKey = getCacheKey(url);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const blob = request.result;
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          console.log(`[AnimationCache] ✅ 从缓存加载: ${url.substring(0, 50)}...`);
          resolve(blobUrl);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  }

  /**
   * 预加载并缓存动画文件
   * @param idleUrl 空闲动画URL
   * @param talkingUrl 说话动画URL
   * @returns Promise<void>
   */
  async preloadAnimations(idleUrl?: string, talkingUrl?: string): Promise<void> {
    await this.init();

    const promises: Promise<void>[] = [];

    if (idleUrl) {
      promises.push(
        this.cacheAnimation(idleUrl).catch(error => {
          console.error('[AnimationCache] ❌ 预加载空闲动画失败:', error);
        })
      );
    }

    if (talkingUrl) {
      promises.push(
        this.cacheAnimation(talkingUrl).catch(error => {
          console.error('[AnimationCache] ❌ 预加载说话动画失败:', error);
        })
      );
    }

    await Promise.all(promises);
    console.log('[AnimationCache] ✅ 动画预加载完成');
  }

  // 正在下载的文件URL集合，避免重复下载
  private downloadingUrls = new Set<string>();

  /**
   * 获取缓存的动画URL（优先使用缓存）
   * @param url 原始URL
   * @returns Promise<string> 返回缓存URL或原始URL
   */
  async getAnimationUrl(url: string): Promise<string> {
    if (!url) {
      return url;
    }

    await this.init();

    // 先尝试从缓存获取
    const cachedUrl = await this.getCachedAnimation(url);
    if (cachedUrl) {
      return cachedUrl;
    }

    // 检查是否正在下载，避免重复下载
    if (this.downloadingUrls.has(url)) {
      console.log(`[AnimationCache] ⏳ 文件正在下载中，等待完成: ${url.substring(0, 50)}...`);
      // 等待下载完成，最多等待30秒
      const maxWait = 30000;
      const startTime = Date.now();
      while (this.downloadingUrls.has(url) && (Date.now() - startTime) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        // 再次检查缓存
        const retryCachedUrl = await this.getCachedAnimation(url);
        if (retryCachedUrl) {
          return retryCachedUrl;
        }
      }
      // 如果等待超时，继续下载
    }

    // 缓存不存在，下载并缓存
    this.downloadingUrls.add(url);
    try {
      const result = await this.cacheAnimation(url);
      return result;
    } finally {
      this.downloadingUrls.delete(url);
    }
  }

  /**
   * 清除所有缓存
   * @returns Promise<void>
   */
  async clearCache(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[AnimationCache] ✅ 缓存已清除');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 获取缓存大小（估算）
   * @returns Promise<number> 字节数
   */
  async getCacheSize(): Promise<number> {
    await this.init();

    if (!this.db) {
      return 0;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const blobs = request.result as Blob[];
        const totalSize = blobs.reduce((sum, blob) => sum + blob.size, 0);
        resolve(totalSize);
      };

      request.onerror = () => {
        resolve(0);
      };
    });
  }
}

// 导出单例
export const animationCacheService = new AnimationCacheService();

