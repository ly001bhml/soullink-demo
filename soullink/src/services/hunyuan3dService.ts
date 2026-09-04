// hunyuan3dService.ts
import { getFayApiUrl } from './apiConfig';

/**
 * 图生/文生 3D 的 HTTP 基址（与 createModel、auto_rig 一致）。
 *
 * 说明：若在 DEV 下固定走相对路径 `/api/...`（Vite 代理），GLB 会落在 vite.config 里
 * `proxyTarget` 那台机器的 `models/tmp/`，而 `serverUrl` 却用设置页的 Fay 地址入库，
 * 随后 `auto_rig` 在设置页指向的机器上读盘 → 「源模型文件不存在」。
 *
 * @returns 去除末尾斜杠的 Fay API 根地址
 */
function getHunyuanApiBaseUrl(): string {
  return getFayApiUrl().replace(/\/+$/, '');
}

export interface GenerateOptions {
  seed?: number;
  octree_resolution?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  texture?: boolean;
  type?: 'glb' | 'obj';
  text_seed?: number;
  face_count?: number;
}

export interface GenerateResult {
  success: boolean;
  modelUrl?: string;
  serverUrl?: string;
  blobBase64?: string;
  filename?: string;
  error?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

function base64ToBlobUrl(base64: string, mimeType: string = 'model/gltf-binary'): string {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * 封装通用 Fetch 请求，处理 413 等特殊状态码
 */
async function fetchHunyuan(url: string, requestData: any): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  });

  // 关键：拦截 413 Payload Too Large 错误
  if (response.status === 413) {
    throw new Error(`上传图片太大 (HTTP 413)。请调小图片分辨率，或联系管理员修改后端 Nginx 的 client_max_body_size。`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`请求失败: HTTP ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * 图生3D
 */
export async function generateModelFromImage(
  imageFile: File,
  options?: GenerateOptions
): Promise<GenerateResult> {
  try {
    const imageBase64 = await fileToBase64(imageFile);
    
    const requestData = {
      image: imageBase64,
      seed: options?.seed ?? 1234,
      octree_resolution: options?.octree_resolution ?? 128,
      num_inference_steps: options?.num_inference_steps ?? 5,
      guidance_scale: options?.guidance_scale ?? 5.0,
      texture: options?.texture ?? false,
      type: options?.type ?? 'glb',
      ...(options?.face_count && { face_count: options.face_count }),
    };
    
    console.log('[Hunyuan3D] 开始图生3D，图片:', imageFile.name);
    
    const apiBase = getHunyuanApiBaseUrl();
    const result: GenerateResult = await fetchHunyuan(`${apiBase}/api/hunyuan3d/generate`, requestData);
    
    if (result.success && result.modelUrl && result.blobBase64) {
      const blobUrl = base64ToBlobUrl(result.blobBase64);
      console.log('[Hunyuan3D] 图生3D成功:', result.modelUrl);
      
      const publicApiBase = getFayApiUrl().replace(/\/+$/, '');
      const serverUrl = result.modelUrl.startsWith('/') 
        ? `${publicApiBase}${result.modelUrl}` 
        : result.modelUrl;
      
      return {
        ...result,
        modelUrl: blobUrl,
        serverUrl: serverUrl,
      };
    } else {
      console.error('[Hunyuan3D] 图生3D失败:', result.error);
      return result;
    }
  } catch (error) {
    console.error('[Hunyuan3D] 图生3D异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

/**
 * 文字生3D
 */
export async function generateModelFromText(
  text: string,
  options?: GenerateOptions
): Promise<GenerateResult> {
  try {
    const requestData = {
      text: text,
      seed: options?.seed ?? 1234,
      text_seed: options?.text_seed ?? options?.seed ?? 1234,
      octree_resolution: options?.octree_resolution ?? 128,
      num_inference_steps: options?.num_inference_steps ?? 5,
      guidance_scale: options?.guidance_scale ?? 5.0,
      texture: options?.texture ?? false,
      type: options?.type ?? 'glb',
      ...(options?.face_count && { face_count: options.face_count }),
    };
    
    console.log('[Hunyuan3D] 开始文字生3D，描述:', text);
    
    const apiBase = getHunyuanApiBaseUrl();
    const result: GenerateResult = await fetchHunyuan(`${apiBase}/api/hunyuan3d/generate`, requestData);
    
    if (result.success && result.modelUrl && result.blobBase64) {
      const blobUrl = base64ToBlobUrl(result.blobBase64);
      console.log('[Hunyuan3D] 文字生3D成功:', result.modelUrl);
      
      const publicApiBase = getFayApiUrl().replace(/\/+$/, '');
      const serverUrl = result.modelUrl.startsWith('/') 
        ? `${publicApiBase}${result.modelUrl}` 
        : result.modelUrl;
      
      return {
        ...result,
        modelUrl: blobUrl,
        serverUrl: serverUrl,
      };
    } else {
      console.error('[Hunyuan3D] 文字生3D失败:', result.error);
      return result;
    }
  } catch (error) {
    console.error('[Hunyuan3D] 文字生3D异常:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}