/**
 * 模型管理服务
 * 与后端模型管理API对接
 */

import { getFayApiUrl } from './apiConfig';
import { Companion, CharacterAttributes, CompanionExtraAction } from '../types';

// Fay API 地址
const getFAY_API_URL = (): string => {
  return getFayApiUrl();
};

const buildAssetUrl = (url?: string): string => {
  if (!url) return '';

  if (
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url;
  }

  if (url.startsWith('/models/') || url.startsWith('/rigs/') || url.startsWith('/images/')) {
    return url;
  }

  if (url.startsWith('/')) {
    return `${getFAY_API_URL()}${url}`;
  }

  return `/models/${url}`;
};

const EXTRA_ACTION_LABELS = ['动作1', '动作2', '动作3'];
const EXTRA_ACTION_BACKEND_INDEXES = [4, 5, 6];

const toAssetUrlList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string' && item.trim().length > 0) {
        return item;
      }

      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { model_url?: unknown }).model_url === 'string'
      ) {
        return (item as { model_url: string }).model_url;
      }

      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { url?: unknown }).url === 'string'
      ) {
        return (item as { url: string }).url;
      }

      return '';
    })
    .filter((item): item is string => Boolean(item))
    .map((item) => buildAssetUrl(item))
    .filter(Boolean);
};

const extractExtraActions = (model: BackendModel): CompanionExtraAction[] => {
  const directArrayCandidates = [
    model.extra_action_model_urls,
    model.additional_action_model_urls,
    model.custom_action_model_urls,
    model.extra_actions,
  ];

  let urls = directArrayCandidates
    .flatMap((candidate) => toAssetUrlList(candidate))
    .filter(Boolean);

  if (urls.length === 0) {
    const actionModelUrls = toAssetUrlList(model.action_model_urls);
    if (actionModelUrls.length > 3) {
      urls = actionModelUrls.slice(3, 6);
    } else {
      urls = actionModelUrls.slice(0, 3);
    }
  }

  if (urls.length === 0) {
    urls = EXTRA_ACTION_BACKEND_INDEXES
      .flatMap((backendIndex) => {
        const candidates = [
          model[`action${backendIndex}_model_url`],
          model[`action_${backendIndex}_model_url`],
          model[`action_model_url${backendIndex}`],
          model[`action_model_url_${backendIndex}`],
          model[`extra_action${backendIndex}_model_url`],
          model[`extra_action_${backendIndex}_model_url`],
          model[`extra_action_model_url${backendIndex}`],
          model[`extra_action_model_url_${backendIndex}`],
          model[`custom_action${backendIndex}_model_url`],
          model[`custom_action_${backendIndex}_model_url`],
          model[`custom_action_model_url${backendIndex}`],
          model[`custom_action_model_url_${backendIndex}`],
          model[`additional_action${backendIndex}_model_url`],
          model[`additional_action_${backendIndex}_model_url`],
          model[`additional_action_model_url${backendIndex}`],
          model[`additional_action_model_url_${backendIndex}`],
        ];

        return candidates
          .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
          .map((candidate) => buildAssetUrl(candidate));
      })
      .filter(Boolean);
  }

  const reservedUrls = new Set(
    [model.idle_model_url, model.talking_model_url, model.wave_model_url]
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
      .map((candidate) => buildAssetUrl(candidate))
  );

  return Array.from(new Set(urls))
    .filter((url) => !reservedUrls.has(url))
    .slice(0, 3)
    .map((modelUrl, index) => ({
      id: `extra-action-${index + 1}`,
      label: EXTRA_ACTION_LABELS[index] || `动作${index + 1}`,
      modelUrl,
    }));
};

/** 上传等大请求在网络层失败时短暂等待后重试 */
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** 判断是否为可重试的网络错误（对端断开、代理超时等常表现为 Failed to fetch） */
const isRetryableUploadNetworkError = (error: unknown): boolean =>
  error instanceof TypeError && String((error as Error).message).includes('fetch');

const convertToRelativeAssetUrl = (url?: string): string | undefined => {
  if (!url) return undefined;

  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return undefined;
  }

  const FAY_API_URL = getFAY_API_URL();

  if (url.startsWith(FAY_API_URL)) {
    return url.replace(FAY_API_URL, '');
  }

  if (url.startsWith('/models/') || url.startsWith('/rigs/') || url.startsWith('/images/') || url.startsWith('/')) {
    return url;
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `/models/${url}`;
  }

  return url;
};

/**
 * 后端模型数据结构
 */
interface BackendModel {
  model_id: string;
  name: string;
  description?: string;
  attributes?: CharacterAttributes;
  creator_username?: string;
  is_global?: boolean;
  created_at?: number;
  created_at_str?: string;  // 格式化后的创建时间字符串
  updated_at?: number;
  updated_at_str?: string;  // 格式化后的更新时间字符串
  is_active?: boolean;
  model3d_url?: string;
  idle_model_url?: string;
  talking_model_url?: string;
  wave_model_url?: string;
  [key: string]: unknown;
}

/**
 * API响应格式
 */
interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

/**
 * 模型管理服务类
 */
class ModelService {
  /**
   * 获取模型列表
   * @param username 用户名，可选
   * @param includeGlobal 是否包含全局模型
   * @returns Promise<BackendModel[]>
   */
  async getModels(username?: string, includeGlobal: boolean = true): Promise<BackendModel[]> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username || 'User',
          include_global: includeGlobal,
        }),
      });

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status}`);
      }

      const result: ApiResponse<BackendModel[]> = await response.json();
      if (result.code === 200 && result.data) {
        return result.data;
      } else {
        throw new Error(result.message || '获取模型列表失败');
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取模型详情
   * @param modelId 模型ID
   * @returns Promise<BackendModel>
   */
  async getModelDetail(modelId: string): Promise<BackendModel> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/detail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
        }),
      });

      if (!response.ok) {
        throw new Error(`获取模型详情失败: ${response.status}`);
      }

      const result: ApiResponse<BackendModel> = await response.json();
      if (result.code === 200 && result.data) {
        return result.data;
      } else {
        throw new Error(result.message || '获取模型详情失败');
      }
    } catch (error) {
      console.error('获取模型详情失败:', error);
      throw error;
    }
  }

  /**
   * 上传3D模型文件（大文件经网关时可能偶发断开，会对网络类错误自动重试数次）
   * @param file 模型文件
   * @param modelId 可选，已有模型 ID
   * @param slot 资源槽位
   * @param modelName 可选展示名
   * @returns Promise<string> 服务端返回的模型访问 URL
   */
  async uploadModel(file: File, modelId?: string, slot?: 'source' | 'idle' | 'talking' | 'wave', modelName?: string): Promise<string> {
    const FAY_API_URL = getFAY_API_URL();

    const buildFormData = (): FormData => {
      const fd = new FormData();
      fd.append('file', file);
      if (modelId) {
        fd.append('model_id', modelId);
      }
      if (slot) {
        fd.append('slot', slot);
      }
      if (modelName) {
        fd.append('model_name', modelName);
      }
      return fd;
    };

    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${FAY_API_URL}/api/models/upload-model`, {
          method: 'POST',
          body: buildFormData(),
        });

        if (!response.ok) {
          const hint =
            response.status === 413
              ? '（文件过大：请检查反向代理 client_max_body_size 与后端限制）'
              : '';
          throw new Error(`上传模型失败: HTTP ${response.status}${hint}`);
        }

        const result: ApiResponse<{ model_url: string; filename: string; size: number }> = await response.json();
        if (result.code === 200 && result.data) {
          return result.data.model_url;
        }
        throw new Error(result.message || '上传模型失败');
      } catch (error) {
        lastError = error;
        const canRetry = attempt < maxAttempts && isRetryableUploadNetworkError(error);
        console.error(`上传模型失败 (第 ${attempt}/${maxAttempts} 次):`, error);
        if (canRetry) {
          await delay(800 * attempt);
          continue;
        }
        if (isRetryableUploadNetworkError(error)) {
          throw new Error(
            '上传中断（网络或网关断开连接）。请确认：1) 模型文件未过大；2) 反向代理允许大请求体与较长超时；3) 服务端日志是否有报错。'
          );
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * 调用后端自动骨骼绑定接口，对指定模型执行自动绑骨并生成动画模型。
   *
   * @param modelId 模型ID
   * @param animations 可选的动画标识列表（服务端当前可能仅取第一个）
   * @returns Promise<{ idleModelUrl?: string; talkingModelUrl?: string }> 返回更新后的动画模型URL（完整URL）
   */
  async autoRigModel(
    modelId: string,
    animations?: string[]
  ): Promise<{ idleModelUrl?: string; talkingModelUrl?: string; waveModelUrl?: string }> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const endpoint = `${FAY_API_URL}/api/models/auto_rig`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          animations,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          let detail = '';
          try {
            const errBody = (await response.clone().json()) as { message?: string; code?: number };
            if (errBody?.message) {
              detail = errBody.message;
            }
          } catch {
            // 非 JSON（例如路由未注册时的 HTML/空正文）
          }
          if (detail.includes('源模型文件不存在')) {
            throw new Error(
              `自动绑骨找不到源模型文件（${detail}）。请确认图生/文生 3D 与当前 Fay API 为同一地址，且开发环境 .env 中 VITE_DEV_BACKEND / VITE_FAY_API_URL 与设置页一致。`
            );
          }
          throw new Error(
            detail
              ? `自动骨骼绑定失败（404）：${detail}`
              : `当前后端未提供自动绑骨接口（POST ${endpoint} 返回 404）。请确认 API 地址是否连接到了最新的 Soullink/Fay 后端实例。`
          );
        }
        throw new Error(`自动骨骼绑定请求失败: ${response.status}`);
      }

      const result: ApiResponse<{
        model_id: string;
        model3d_url?: string;
        idle_model_url?: string;
        talking_model_url?: string;
        wave_model_url?: string;
      }> = await response.json();

      if (result.code !== 200 || !result.data) {
        throw new Error(result.message || '自动骨骼绑定失败');
      }

      // 复用与 modelToCompanion 一致的 URL 拼接逻辑
      return {
        idleModelUrl: buildAssetUrl(result.data.idle_model_url) || undefined,
        talkingModelUrl: buildAssetUrl(result.data.talking_model_url) || undefined,
        waveModelUrl: buildAssetUrl(result.data.wave_model_url) || undefined,
      };
    } catch (error) {
      console.error('自动骨骼绑定失败:', error);
      throw error;
    }
  }

  /**
   * 清除会话历史记录。
   * @param params 清理参数（可按模型清理，或按用户名兜底清理）
   * @param params.modelId 可选模型ID
   * @param params.username 用户名，默认 User
   * @returns Promise<number> 删除条数
   */
  async clearModelHistory(params: { modelId?: string; username?: string }): Promise<number> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/clear-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: params.modelId,
          username: params.username || 'User',
        }),
      });

      if (!response.ok) {
        throw new Error(`清除模型历史失败: ${response.status}`);
      }

      const result: ApiResponse<{ deleted_count?: number }> = await response.json();
      if (result.code === 200) {
        return result.data?.deleted_count || 0;
      }

      throw new Error(result.message || '清除模型历史失败');
    } catch (error) {
      console.error('清除模型历史失败:', error);
      throw error;
    }
  }

  /**
   * 创建模型
   * @param data 模型数据
   * @returns Promise<string> 返回模型ID
   */
  async createModel(data: {
    name: string;
    description?: string;
    character_description?: string;
    attribute_json?: CharacterAttributes;
    username?: string;
    is_global?: number;
    model3d_url?: string;
    idle_model_url?: string;
    talking_model_url?: string;
    wave_model_url?: string;
  }): Promise<string> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`创建模型失败: ${response.status}`);
      }

      const result: ApiResponse<{ model_id: string }> = await response.json();
      if (result.code === 200 && result.data) {
        return result.data.model_id;
      } else {
        throw new Error(result.message || '创建模型失败');
      }
    } catch (error) {
      console.error('创建模型失败:', error);
      throw error;
    }
  }

  /**
   * 更新模型
   * @param modelId 模型ID
   * @param data 更新的数据
   * @returns Promise<boolean>
   */
  async updateModel(
    modelId: string,
    data: {
      name?: string;
      description?: string;
      attribute_json?: CharacterAttributes;
      model3d_url?: string;
      idle_model_url?: string;
      talking_model_url?: string;
      wave_model_url?: string;
    }
  ): Promise<boolean> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          ...data,
        }),
      });

      if (!response.ok) {
        throw new Error(`更新模型失败: ${response.status}`);
      }

      const result: ApiResponse<any> = await response.json();
      return result.code === 200;
    } catch (error) {
      console.error('更新模型失败:', error);
      throw error;
    }
  }

  /**
   * 删除模型
   * @param modelId 模型ID
   * @returns Promise<boolean>
   */
  async deleteModel(modelId: string): Promise<boolean> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
        }),
      });

      if (!response.ok) {
        throw new Error(`删除模型失败: ${response.status}`);
      }

      const result: ApiResponse<any> = await response.json();
      return result.code === 200;
    } catch (error) {
      console.error('删除模型失败:', error);
      throw error;
    }
  }

  /**
   * 选择模型
   * @param modelId 模型ID
   * @param username 用户名
   * @returns Promise<boolean>
   */
  async selectModel(modelId: string, username: string = 'User'): Promise<boolean> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: modelId,
          username: username,
        }),
      });

      if (!response.ok) {
        throw new Error(`选择模型失败: ${response.status}`);
      }

      const result: ApiResponse<any> = await response.json();
      return result.code === 200;
    } catch (error) {
      console.error('选择模型失败:', error);
      throw error;
    }
  }

  /**
   * 将后端模型转换为前端Companion格式
   * @param model 后端模型
   * @returns Companion
   */
  modelToCompanion(model: BackendModel): Companion {
    // 构建完整的模型URL（如果存在相对路径，需要加上API base URL）
    const FAY_API_URL = getFAY_API_URL();
    
    const hasRiggedOutputs = !!(model.idle_model_url || model.talking_model_url || model.wave_model_url);
    const extraActions = extractExtraActions(model);

    const buildFullUrl = (url?: string): string => {
      if (!url) return '';
      // 如果已经是完整URL，直接使用；否则拼接base URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      } else if (url.startsWith('/')) {
        // 相对路径，需要拼接base URL
        return `${FAY_API_URL}${url}`;
      } else {
        return `${FAY_API_URL}/models/${url}`;
      }
    };
    
    return {
      id: model.model_id,
      model_id: model.model_id,
      name: model.name,
      role: model.description || '虚拟伙伴',
      personality: model.attributes?.additional || model.description || '',
      // 不使用外链占位图（内网/防火墙常无法访问 via.placeholder.com），由 CompanionAvatar 用首字展示
      avatarUrl: '',
      isBound: hasRiggedOutputs,
      createdAt: model.created_at || Date.now(),
      createdAtStr: model.created_at_str || (model.created_at ? new Date(model.created_at * 1000).toLocaleString('zh-CN') : ''),
      model3dUrl: buildAssetUrl(model.model3d_url),
      idleModelUrl: buildAssetUrl(model.idle_model_url),
      talkingModelUrl: buildAssetUrl(model.talking_model_url),
      waveModelUrl: model.wave_model_url ? buildAssetUrl(model.wave_model_url) : undefined,
      extraActions,
      characterAttributes: model.attributes,
      characterDescription: model.description,
      is_global: model.is_global,
    };
  }

  /**
   * 将前端Companion转换为后端模型格式
   * @param companion 前端Companion
   * @returns 后端模型数据
   */
  companionToModelData(companion: Companion): {
    name: string;
    description?: string;
    character_description?: string;
    attribute_json?: CharacterAttributes;
    is_global?: number;
    model3d_url?: string;
    idle_model_url?: string;
    talking_model_url?: string;
    wave_model_url?: string;
  } {
    // 将URL转换为相对路径存储的辅助函数
    const convertToRelativeUrl = (url?: string): string | undefined => {
      if (!url) return undefined;
      const FAY_API_URL = getFAY_API_URL();
      // 如果是完整URL，提取相对路径
      if (url.startsWith(FAY_API_URL)) {
        return url.replace(FAY_API_URL, '');
      } else if (url.startsWith('/models/') || url.startsWith('/')) {
        // 已经是相对路径
        return url;
      } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // 可能是文件名，添加/models/前缀
        return `/models/${url}`;
      } else {
        // 完整URL但不是我们的API，保持原样（可能是外部URL）
        return url;
      }
    };
    
    return {
      name: companion.name,
      description: companion.role || companion.characterDescription,
      character_description: companion.characterDescription,
      attribute_json: companion.characterAttributes,
      is_global: companion.is_global ? 1 : 0,
      model3d_url: convertToRelativeAssetUrl(companion.model3dUrl),
      idle_model_url: convertToRelativeAssetUrl(companion.idleModelUrl),
      talking_model_url: convertToRelativeAssetUrl(companion.talkingModelUrl),
      wave_model_url: convertToRelativeAssetUrl(companion.waveModelUrl),
    };
  }
}

// 导出单例
export const modelService = new ModelService();
