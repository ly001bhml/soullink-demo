/**
 * API 配置服务
 * 用于在运行时动态配置和管理 API 地址
 * 特别适用于移动设备，可以动态切换本地/云端 API
 */

/**
 * API 配置类
 */
export class APIConfig {
  private static apiUrl: string = '';
  private static readonly STORAGE_KEY = 'fay_api_url';

  /**
   * 初始化 API 地址
   * 优先级：运行时配置 > 本地存储 > 环境变量 > 默认值
   */
  static init(baseUrl?: string): void {
    if (baseUrl) {
      this.apiUrl = baseUrl;
      this.saveToStorage(baseUrl);
      return;
    }

    // 1. 优先使用本地存储（用户在前端设置页里配置的地址）
    const stored = this.loadFromStorage();
    if (stored) {
      this.apiUrl = stored;
      return;
    }

    // 2. 仅在「非移动设备」时才使用构建时环境变量
    //    这样不会把开发机的内网 IP（例如 192.168.1.8）写死到移动端 App 里
    if (!this.isMobileDevice()) {
      const envUrl = import.meta.env.VITE_FAY_API_URL || '';
      if (envUrl) {
        this.apiUrl = envUrl;
      }
    }

    // 3. 如果仍然为空，使用兜底默认值
    if (!this.apiUrl) {
      // 桌面 / 浏览器：使用 localhost（开发体验友好）
      // 移动端：给一个占位默认值，用户必须在设置页里改成真实后端地址
      this.apiUrl = 'http://127.0.0.1:5000';
    }
  }

  /**
   * 获取当前 API 地址
   */
  static getApiUrl(): string {
    if (!this.apiUrl) {
      this.init();
    }
    return this.apiUrl;
  }

  /**
   * 规范化 URL，自动添加协议前缀（如果没有）
   * @param url 原始 URL
   * @returns 规范化后的 URL（去除末尾斜杠，统一格式）
   */
  private static normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
      return trimmed;
    }
    
    // 去除末尾的斜杠（保留协议后的双斜杠）
    let normalized = trimmed.replace(/\/+$/, '');
    
    // 如果已经包含协议，直接返回
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    // 如果没有协议，自动添加 http://
    return `http://${normalized}`;
  }

  /**
   * 设置 API 地址（运行时配置）
   * @param url API 地址，如 'http://192.168.1.100:5000' 或 '192.168.1.100:5000'
   */
  static setApiUrl(url: string): void {
    // 规范化 URL（自动添加协议）
    const normalizedUrl = this.normalizeUrl(url);
    
    // 验证 URL 格式
    try {
      new URL(normalizedUrl);
      this.apiUrl = normalizedUrl;
      this.saveToStorage(normalizedUrl);
    } catch (error) {
      console.error('Invalid API URL:', normalizedUrl, error);
      throw new Error(`无效的 API 地址: ${url}`);
    }
  }

  /**
   * 测试 API 连接
   * @param url 可选，要测试的 URL。如果不提供，使用当前配置的 URL
   * @param timeout 超时时间（毫秒），默认 3 秒
   * @returns Promise<boolean> 连接是否成功
   */
  static async testConnection(url?: string, timeout: number = 3000): Promise<boolean> {
    const rawUrl = url || this.getApiUrl();
    if (!rawUrl) {
      return false;
    }

    // 规范化 URL（自动添加协议，如果缺失）
    // 注意：测试连接时也使用规范化URL，确保行为一致
    const testUrl = this.normalizeUrl(rawUrl.trim());

    try {
      // 尝试访问健康检查端点（如果后端提供）
      const healthUrl = `${testUrl}/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        },
        // 添加 mode: 'no-cors' 可能有助于某些情况，但会限制响应检查
        // 暂时不使用，先保持原有逻辑
      }).catch((error) => {
        console.warn('[testConnection] 健康检查端点请求失败:', error);
        return null;
      });

      clearTimeout(timeoutId);

      // 如果没有健康检查端点，尝试访问根路径
      if (!response || !response.ok) {
        const rootController = new AbortController();
        const rootTimeoutId = setTimeout(() => rootController.abort(), timeout);
        
        const rootResponse = await fetch(testUrl, {
          method: 'GET',
          signal: rootController.signal,
          headers: {
            'Accept': 'application/json'
          }
        }).catch((error) => {
          console.warn('[testConnection] 根路径请求失败:', error);
          return null;
        });

        clearTimeout(rootTimeoutId);
        
        // 仅将明确可访问的 2xx/3xx 响应视为成功。
        // 404、CORS 失败或其他异常都说明当前地址不能作为 Fay API 入口。
        return !!rootResponse && rootResponse.ok;
      }

      return response.ok;
    } catch (error) {
      console.warn('[testConnection] 连接测试异常:', testUrl, error);
      return false;
    }
  }

  /**
   * 检测是否在移动设备上
   */
  private static isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * 获取移动设备默认 API 地址
   * 注意：此方法已不再使用，逻辑已合并到 init() 中
   * 保留此方法以保持向后兼容
   * @deprecated 使用 init() 方法中的逻辑
   */
  private static getDefaultMobileUrl(): string {
    const stored = this.loadFromStorage();
    return stored || 'http://127.0.0.1:5000';
  }

  /**
   * 从本地存储加载 API 地址
   */
  private static loadFromStorage(): string | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * 保存 API 地址到本地存储
   */
  private static saveToStorage(url: string): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.STORAGE_KEY, url);
    } catch (error) {
      console.warn('保存 API 地址到本地存储失败:', error);
    }
  }

  /**
   * 清除保存的 API 地址配置
   */
  static clearStoredUrl(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch {
        // 忽略错误
      }
    }
    this.apiUrl = '';
  }

  /**
   * 获取所有配置信息（用于调试）
   */
  static getConfigInfo(): {
    currentUrl: string;
    fromStorage: boolean;
    fromEnv: boolean;
    isMobile: boolean;
    storedUrl: string | null;
  } {
    const stored = this.loadFromStorage();
    const envUrl = import.meta.env.VITE_FAY_API_URL;

    return {
      currentUrl: this.getApiUrl(),
      fromStorage: stored === this.apiUrl,
      fromEnv: envUrl === this.apiUrl,
      isMobile: this.isMobileDevice(),
      storedUrl: stored
    };
  }
}

/**
 * 获取 API 基础地址的辅助函数
 * 用于在服务中使用
 */
export function getFayApiUrl(): string {
  return APIConfig.getApiUrl();
}

/**
 * 自动检测并设置 API 地址（实验性功能）
 * 尝试扫描常见的局域网地址
 */
export async function autoDetectApiUrl(): Promise<string | null> {
  const commonPorts = [5000, 8000, 3000];
  const commonIps = ['192.168.1.1', '192.168.0.1', '10.0.2.2']; // Android 模拟器

  // 获取当前设备的 IP 地址段（需要更多实现）
  // 这里只是示例，实际实现需要更复杂的逻辑

  for (const ip of commonIps) {
    for (const port of commonPorts) {
      const url = `http://${ip}:${port}`;
      const isConnected = await APIConfig.testConnection(url, 1000);
      if (isConnected) {
        APIConfig.setApiUrl(url);
        return url;
      }
    }
  }

  return null;
}
