import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { HashRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Sparkles, Heart, MessageCircle, Settings, Mic, Send, Trash2, UserPlus, Image as ImageIcon, X, ChevronUp, ChevronDown, Box, Check, Plus, Scan, Activity, Cpu, Upload, FileBox, Star, Cloud, Moon, User, Server, Wifi, WifiOff, Keyboard, AudioLines, BarChart3, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { chatWithAgentAssistant, chatWithCompanion } from './services/qwenService';
import { generateModelFromImage, generateModelFromText } from './services/hunyuan3dService';
import { characterService } from './services/characterService';
import { modelService } from './services/modelService';
import { audioService, isCapacitor } from './services/audioService';
import { Button, Input, Modal, PageContainer } from './components/ui';
import { Mesh2MotionViewer } from './components/Mesh2MotionViewer';
import { Mesh2MotionControls } from './components/Mesh2MotionControls';
import { CharacterDescriptionInput } from './components/CharacterDescriptionInput';
import { MiniGamePage } from './MiniGames';
import { ProcessStep } from '@mesh2motion/lib/enums/ProcessStep.ts';
import { Companion, ChatMessage, CharacterAttributes } from './types';
import { APIConfig } from './services/apiConfig';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Global Context for Companion Data ---
const STORAGE_KEY = 'soul_link_data';
const BACKGROUND_TASKS_KEY = 'soul_link_background_tasks';
const HOME_AGENT_MESSAGES_KEY = 'soul_link_home_agent_messages';
const CHAT_MESSAGES_KEY_PREFIX = 'soul_link_chat_messages_';

// Built-in Default Character
const DEFAULT_COMPANION: Companion = {
  id: 'default_lumia',
  name: 'Lumia',
  role: '光之向导',
  personality: '温柔、充满智慧，如同深夜星光般安静。她不仅是倾听者，也是能陪你交流与共鸣的伙伴。',
  avatarUrl: 'https://images.unsplash.com/photo-1618331835717-801e976710b2?q=80&w=500&auto=format&fit=crop',
  isBound: false,
  createdAt: Date.now(),
  model3dUrl: '' 
};

interface AppData {
  companions: Companion[];
  activeId: string;
}

type BackgroundTaskType = 'generate' | 'rig';
type BackgroundTaskStatus = 'running' | 'success' | 'error';

interface BackgroundTask {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  title: string;
  detail: string;
  createdAt: number;
  updatedAt: number;
  companionId?: string;
  companionName?: string;
  targetPath?: string;
  seen?: boolean;
}

const getChatMessagesStorageKey = (modelId?: string, companionId?: string) =>
  `${CHAT_MESSAGES_KEY_PREFIX}${modelId || companionId || 'default'}`;

const loadBackgroundTasks = (): BackgroundTask[] => {
  try {
    const raw = localStorage.getItem(BACKGROUND_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((task: BackgroundTask) =>
      task.status === 'running'
        ? {
            ...task,
            detail: task.companionId
              ? '任务状态已恢复，系统会继续检查后台处理结果。'
              : '任务状态已恢复，如果长时间没有更新，可以重新发起一次。',
            seen: false,
            updatedAt: Date.now(),
          }
        : task
    );
  } catch (error) {
    console.warn('[App] 读取后台任务失败，已重置:', error);
    return [];
  }
};

const getTaskTypeLabel = (type: BackgroundTaskType) => {
  return type === 'generate' ? '生成任务' : '绑骨任务';
};

/**
 * 人物头像：加载失败或无 URL 时显示首字或默认图标，避免破图
 * @param avatarUrl - 头像图片地址，可选
 * @param name - 人物名称，用于首字占位
 * @param size - 'sm' 列表小图 | 'md' 详情大图
 */
const CompanionAvatar: React.FC<{ avatarUrl?: string; name: string; size?: 'sm' | 'md' }> = ({ avatarUrl, name, size = 'sm' }) => {
  const [failed, setFailed] = useState(false);
  const showImg = avatarUrl && !failed;
  const sizeClass = size === 'sm' ? 'w-10 h-10' : 'w-16 h-16';
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <div className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center bg-white/10 text-white/60 shrink-0 ${size === 'md' ? 'shadow-lg' : ''}`}>
      {showImg ? (
        <img src={avatarUrl} alt="" className={`${sizeClass} object-cover`} onError={() => setFailed(true)} />
      ) : (
        <span className={size === 'sm' ? 'text-sm font-semibold' : 'text-xl font-semibold'}>{initial}</span>
      )}
    </div>
  );
};

// --- Background Decorations Component ---
const BackgroundDecorations = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Soft Glowing Orbs - 娓╅Θ鏆栬壊璋?*/}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-pink-300/30 rounded-full blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-orange-300/30 rounded-full blur-[100px] animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
      <div className="absolute top-[40%] left-[30%] w-64 h-64 bg-yellow-200/25 rounded-full blur-[80px] animate-float"></div>

      {/* Floating Cute Icons - 娓╅Θ鑹茶皟 */}
      <div className="absolute top-[15%] right-[15%] text-yellow-400/40 animate-float" style={{ animationDuration: '8s' }}>
        <Star size={24} fill="currentColor" />
      </div>
      <div className="absolute top-[25%] left-[10%] text-pink-300/30 animate-float" style={{ animationDuration: '10s', animationDelay: '1s' }}>
        <Cloud size={32} fill="currentColor" />
      </div>
      <div className="absolute bottom-[20%] left-[20%] text-pink-400/40 animate-pulse" style={{ animationDuration: '4s' }}>
        <Heart size={20} fill="currentColor" />
      </div>
       <div className="absolute bottom-[40%] right-[25%] text-orange-300/30 animate-float" style={{ animationDuration: '12s', animationDelay: '2s' }}>
        <Moon size={28} fill="currentColor" />
      </div>
      <div className="absolute top-[10%] left-[50%] text-pink-300/20 animate-pulse" style={{ animationDuration: '3s' }}>
        <Sparkles size={16} />
      </div>
    </div>
  );
};

// --- Reusable 3D Avatar Component ---
interface AvatarSceneProps {
  modelUrl?: string; // 向后兼容：单个模型 URL
  idleModelUrl?: string; // 空闲动画模型URL
  talkingModelUrl?: string; // 说话动画模型URL
  waveModelUrl?: string; // 招手/问候动作模型 URL（第三个 GLB）
  isTalking?: boolean;
  isRigging?: boolean; // Effect for binding page
  color?: string;
  onLoadComplete?: () => void; // 模型加载完成回调
  onLoadStart?: () => void; // 模型开始加载回调
}

const AvatarScene: React.FC<AvatarSceneProps> = ({ 
  modelUrl, 
  idleModelUrl, 
  talkingModelUrl, 
  waveModelUrl,
  isTalking = false, 
  isRigging = false, 
  color = "#8b5cf6",
  onLoadComplete,
  onLoadStart
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // 双模型方案：分别管理两个模型的 mixer 与场景根节点
  const idleMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const talkingMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleModelRef = useRef<THREE.Group | null>(null);
  const talkingModelRef = useRef<THREE.Group | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const talkingActionRef = useRef<THREE.AnimationAction | null>(null);
  // WaveOnce 招手动画（可选），为兼容 Mesh2Motion；若不存在则不生效
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const isWavingRef = useRef(false);
  const hasPlayedWaveOnEnterRef = useRef(false);
  const lastUserWaveTsRef = useRef(0);
  const isTalkingRef = useRef(isTalking);
  // 单模型方案（向后兼容）
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  // 透明度渐变控制
  const fadeTransitionRef = useRef<{ target: 'idle' | 'talking', progress: number } | null>(null);
  // 加载状态管理，避免重复加载
  const loadingRef = useRef<{ idle: boolean, talking: boolean }>({ idle: false, talking: false });
  // 标记空闲模型是否已就绪（用于触发依赖它的副作用，例如第三个 GLB 的招手动画加载）
  const [idleReadyVersion, setIdleReadyVersion] = useState(0);
  const [waveReadyVersion, setWaveReadyVersion] = useState(0);

  // 同步 isTalking 到 ref，供状态机使用，避免闭包读到旧值
  useEffect(() => {
    isTalkingRef.current = isTalking;
  }, [isTalking]);

  /**
   * 触发一次招手（WaveOnce）动画：
   * - 仅当存在 waveAction 时生效
   * - 当前未在说话（isTalkingRef=false）且未在招手中（isWavingRef=false）
   * - 播放完成后自动回到 idle 或 talking（根据当前说话状态）
   */
  const triggerWaveOnce = () => {
    const waveAction = waveActionRef.current;
    const idleAction = idleActionRef.current;
    const mixer = idleMixerRef.current || mixerRef.current;

    if (!waveAction) {
      return;
    }
    if (isWavingRef.current) {
      return;
    }
    if (isTalkingRef.current) {
      return;
    }

    isWavingRef.current = true;

    // 平滑切换：idle -> wave
    if (idleAction) {
      idleAction.fadeOut(0.25);
    }

    waveAction.reset();
    (waveAction as any).enabled = true;
    waveAction.clampWhenFinished = true;
    waveAction.setLoop(THREE.LoopOnce, 1);
    waveAction.fadeIn(0.25);
    waveAction.play();

    const onFinished = (event?: any) => {
      if (event?.action && event.action !== waveAction) {
        return;
      }
      if (mixer && (mixer as any).removeEventListener) {
        (mixer as any).removeEventListener('finished', onFinished as any);
      }
      isWavingRef.current = false;

      // 根据当前说话状态切回 idle 或 talking
      if (isTalkingRef.current && talkingActionRef.current) {
        talkingActionRef.current.reset();
        talkingActionRef.current.setLoop(THREE.LoopRepeat);
        talkingActionRef.current.fadeIn(0.25);
        talkingActionRef.current.play();
      } else if (!isTalkingRef.current && idleActionRef.current) {
        idleActionRef.current.reset();
        idleActionRef.current.setLoop(THREE.LoopRepeat);
        idleActionRef.current.fadeIn(0.25);
        idleActionRef.current.play();
      }
    };

    if (mixer && (mixer as any).addEventListener) {
      (mixer as any).addEventListener('finished', onFinished as any);
    }
  };

  const triggerWaveFromUser = () => {
    const now = Date.now();
    if (now - lastUserWaveTsRef.current < 400) {
      return;
    }
    lastUserWaveTsRef.current = now;
    triggerWaveOnce();
  };

  useEffect(() => {
    if (!waveActionRef.current) {
      return;
    }
    if (hasPlayedWaveOnEnterRef.current) {
      return;
    }
    if (isTalkingRef.current) {
      return;
    }
    hasPlayedWaveOnEnterRef.current = true;
    triggerWaveOnce();
  }, [waveReadyVersion]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 确定使用的模型 URL
    // 若同时提供 idle 与 talking 模型 URL，则使用单模型 + 动画混合方案（骨骼相同）
    // 否则使用单模型方案（向后兼容）
    const useAnimationBlending = !!(idleModelUrl && talkingModelUrl);
    const fallbackUrl = modelUrl || idleModelUrl || talkingModelUrl;
    
    if (!useAnimationBlending && !fallbackUrl) {
      console.warn('[AvatarScene] 没有提供模型URL');
      return;
    }
    
    // 重置加载状态
    loadingRef.current = { idle: false, talking: false };

    // 清理之前的渲染器子节点
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    let animateId: number = 0;
    
    // 创建场景、相机、渲染器
    const scene = new THREE.Scene();
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1, 2.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);

    const fitModelToView = (model: THREE.Object3D) => {

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      if (size.y <= 0) {
        return;
      }

      const targetHeight = 2.3;
      const scale = targetHeight / size.y;
      model.scale.multiplyScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);

      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= scaledBox.min.y;

      console.log('[AvatarScene] 自动适配缩放:', { targetHeight, scale, size });
    };

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
    fillLight.position.set(-5, 5, 5);
    scene.add(fillLight);
    const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
    topLight.position.set(0, 10, 0);
    scene.add(topLight);
    const frontLight = new THREE.DirectionalLight(0xffffff, 1.3);
    frontLight.position.set(0, 3, 8);
    scene.add(frontLight);

    // 点击/触摸模型时触发一次招手（若存在招手动画）
    const handleClick = () => {
      triggerWaveFromUser();
    };
    const handlePointerDown = () => {
      triggerWaveFromUser();
    };
    const handleTouchStart = () => {
      triggerWaveFromUser();
    };
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });

    /**
     * 优化材质亮度与真实感，并启用透明度支持
     * @param model 3D模型对象
     */
    const optimizeMaterials = (model: THREE.Object3D) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                if (mat.color) {
                  const hsl = { h: 0, s: 0, l: 0 };
                  mat.color.getHSL(hsl);
                  hsl.l = Math.min(hsl.l * 1.15, 0.95);
                  mat.color.setHSL(hsl.h, hsl.s, hsl.l);
                }
                if (mat.roughness !== undefined) {
                  mat.roughness = Math.max(mat.roughness * 0.95, 0.1);
                }
                // 启用透明度支持
                mat.transparent = true;
                mat.needsUpdate = true;
              }
            });
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            if (material.color) {
              const hsl = { h: 0, s: 0, l: 0 };
              material.color.getHSL(hsl);
              hsl.l = Math.min(hsl.l * 1.15, 0.95);
              material.color.setHSL(hsl.h, hsl.s, hsl.l);
            }
            if (material.roughness !== undefined) {
              material.roughness = Math.max(material.roughness * 0.95, 0.1);
            }
            material.transparent = true;
            material.needsUpdate = true;
          }
        }
      });
    };

    /**
     * 设置模型透明度
     * @param model 3D模型对象
     * @param opacity 透明度值(0-1)
     */
    const setModelOpacity = (model: THREE.Object3D, opacity: number) => {
      model.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const material = child.material;
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.opacity = opacity;
              }
            });
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.opacity = opacity;
          }
        }
      });
    };

    /**
     * 加载单个 GLB 模型
     * @param url 模型 URL
     * @param isIdleModel 是否为空闲侧模型
     * @returns Promise<THREE.Group>
     */
    const loadSingleModel = async (url: string, isIdleModel: boolean): Promise<THREE.Group> => {
      // 检查是否正在加载，避免重复加载
      const loadingKey = isIdleModel ? 'idle' : 'talking';
      if (loadingRef.current[loadingKey]) {
        console.log(`[AvatarScene] ${isIdleModel ? '空闲' : '说话'}模型正在加载中，跳过重复请求`);
        return Promise.reject(new Error('正在加载中'));
      }
      
      loadingRef.current[loadingKey] = true;
      const startTime = Date.now();
      
      return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        
        // 尝试从缓存获取 URL
        (async () => {
          try {
            const { animationCacheService } = await import('./services/animationCacheService');
            const cachedUrl = await animationCacheService.getAnimationUrl(url);
            const isCached = cachedUrl !== url && cachedUrl.startsWith('blob:');
            console.log(`[AvatarScene] ${isIdleModel ? '空闲' : '说话'}模型使用缓存:`, isCached ? '是' : '否');
            
            loader.load(
              cachedUrl,
              (gltf) => {
                // 重要：不要克隆场景，直接使用原始场景，因为动画剪辑绑定到原始骨骼
                // 若必须克隆，需重新绑定动画到克隆的骨骼，这很复杂
                const model = gltf.scene; // 使用原始场景，不克隆
                optimizeMaterials(model);
                
                // 初始透明度：空闲模型默认显示，说话模型默认隐藏
                setModelOpacity(model, isIdleModel ? 1.0 : 0.0);
                
                // 创建 mixer 并播放动画
                const mixer = new THREE.AnimationMixer(model);
                
                // 无论是否有动画，都要设置 mixerRef，这样动画循环才能更新
                if (isIdleModel) {
                  idleMixerRef.current = mixer;
                } else {
                  talkingMixerRef.current = mixer;
                }
                
                if (gltf.animations && gltf.animations.length > 0) {
                  console.log(`[AvatarScene] ${isIdleModel ? '空闲' : '说话'}模型可用动画列表:`, gltf.animations.map(a => a.name));
                  
                  // 智能选择动画：优先查找匹配的动画名称
                  let clip: THREE.AnimationClip | null = null;
                  let waveClip: THREE.AnimationClip | null = null;
                  
                  if (isIdleModel) {
                    // 空闲模型：优先查找Idle_Torch_Loop，其次查找包含idle 的动画
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Torch_Loop' || 
                      a.name.toLowerCase().includes('idle')
                    ) || gltf.animations[0];
                    // 额外查找一次性招手动画（可选）；若不存在则保持为 null
                    waveClip = gltf.animations.find(a =>
                      a.name.toLowerCase().includes('wave') ||
                      a.name.toLowerCase().includes('greet')
                    ) || null;
                  } else {
                    // 说话模型：优先查找Idle_Talking_Loop，其次查找包含talking/speak 的动画
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Talking_Loop' || 
                      a.name.toLowerCase().includes('talking') ||
                      a.name.toLowerCase().includes('speak')
                    ) || gltf.animations[0];
                  }
                  
                  // 处理绑骨动画（metarigAction）
                  // 若只有绑骨动画，也播放它作为后备，至少让模型有些动作
                  if (clip.name === 'metarigAction') {
                    if (gltf.animations.length > 1) {
                      console.warn('[AvatarScene] 检测到绑骨动画，尝试使用其他动画');
                      const alternativeClip = gltf.animations.find(a => a.name !== 'metarigAction');
                      if (alternativeClip) {
                        clip = alternativeClip;
                        console.log(`[AvatarScene] 找到替代动画: ${alternativeClip.name}`);
                      } else {
                        // 若只有绑骨动画，使用它作为后备方案
                        console.warn('[AvatarScene] 模型只有绑骨动画（metarigAction），将使用它作为后备动画');
                        console.warn('[AvatarScene] 提示：建议上传包含动作动画的模型，例如 Idle_Torch_Loop 或 Idle_Talking_Loop');
                        // 继续使用 metarigAction，不返回
                      }
                    } else {
                      // 若只有绑骨动画，使用它作为后备方案
                      console.warn('[AvatarScene] 模型只有绑骨动画（metarigAction），将使用它作为后备动画');
                      console.warn('[AvatarScene] 提示：建议上传包含动作动画的模型，例如 Idle_Torch_Loop 或 Idle_Talking_Loop');
                      // 继续使用 metarigAction，不返回
                    }
                  }
                  
                  // 创建动画动作，确保绑定到正确的根对象
                  const action = mixer.clipAction(clip, model);
                  
                  // 检查 action 是否有效
                  if (!action) {
                    console.warn('[AvatarScene] 无法创建动画动作，跳过动画播放');
                    console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功（无动作动画）');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  // 检查 action 是否具备必要方法
                  if (typeof action.play !== 'function' || typeof action.setLoop !== 'function') {
                    console.warn('[AvatarScene] 动画动作对象无效，跳过动画播放');
                    console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功（无动作动画）');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  action.play();
                  action.setLoop(THREE.LoopRepeat);
                  
                  // 验证动画是否真正在播放（安全检查）
                  try {
                    const isPlaying = typeof action.isPlaying === 'function' ? action.isPlaying() : false;
                      console.log('[AvatarScene] 动画动作状态', {
                      isPlaying: isPlaying,
                      enabled: action.enabled !== undefined ? action.enabled : 'N/A',
                      time: action.time !== undefined ? action.time : 'N/A',
                      weight: action.weight !== undefined ? action.weight : 'N/A',
                      loop: action.loop !== undefined ? action.loop : 'N/A'
                    });
                  } catch (error) {
                    console.warn('[AvatarScene] 无法读取动画状态', error);
                  }
                  
                  if (isIdleModel) {
                    idleActionRef.current = action;

                    // 为兼容 Mesh2Motion：仅当存在招手动画时才设置 waveActionRef
                    if (waveClip) {
                      const waveAction = mixer.clipAction(waveClip, model);
                      if (waveAction && typeof waveAction.play === 'function') {
                        waveActionRef.current = waveAction;
                        setWaveReadyVersion((v) => v + 1);

                      }
                    } else {
                      // 没有招手动画则不生效
                      waveActionRef.current = null;
                    }
                    // 空闲模型加载完成，标记一次，触发依赖它的副作用（例如第三个 GLB 的招手动画加载）
                    setIdleReadyVersion((v) => v + 1);
                  } else {
                    talkingActionRef.current = action;
                  }
                  
                  console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功，使用动画:', clip.name);
                } else {
                  console.warn('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型没有动画数据');
                  console.warn('[AvatarScene] 提示：需要使用绑骨后导出的动画模型');
                  console.warn('[AvatarScene] 当前模型URL:', url);
                }
                
                const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载耗时: ' + loadTime + '秒');
                loadingRef.current[loadingKey] = false;
                resolve(model);
              },
              undefined,
              (error) => {
                console.error('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载失败:', error);
                loadingRef.current[loadingKey] = false;
                reject(error);
              }
            );
          } catch (error) {
            console.error('[AvatarScene] 缓存加载失败，使用原始URL:', error);
            // 回退到原始 URL
            loader.load(
              url,
              (gltf) => {
                // 重要：不要克隆场景，直接使用原始场景，因为动画剪辑绑定到原始骨骼
                const model = gltf.scene; // 使用原始场景，不克隆
                optimizeMaterials(model);
                setModelOpacity(model, isIdleModel ? 1.0 : 0.0);
                
                const mixer = new THREE.AnimationMixer(model);
                
                // 无论是否有动画，都要设置 mixerRef，这样动画循环才能更新
                if (isIdleModel) {
                  idleMixerRef.current = mixer;
                } else {
                  talkingMixerRef.current = mixer;
                }
                
                if (gltf.animations && gltf.animations.length > 0) {
                  console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型可用动画列表（原始URL）:', gltf.animations.map(a => a.name));
                  
                  // 智能选择动画：优先查找匹配的动画名称
                  let clip: THREE.AnimationClip | null = null;
                  let waveClip: THREE.AnimationClip | null = null;
                  
                  if (isIdleModel) {
                    // 空闲模型：优先查找Idle_Torch_Loop，其次查找包含idle 的动画
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Torch_Loop' || 
                      a.name.toLowerCase().includes('idle')
                    ) || gltf.animations[0];
                    // 额外找一次性招手动画（可选）
                    waveClip = gltf.animations.find(a =>
                      a.name.toLowerCase().includes('wave') ||
                      a.name.toLowerCase().includes('greet')
                    ) || null;
                  } else {
                    // 说话模型：优先查找Idle_Talking_Loop，其次查找包含talking/speak 的动画
                    clip = gltf.animations.find(a => 
                      a.name === 'Idle_Talking_Loop' || 
                      a.name.toLowerCase().includes('talking') ||
                      a.name.toLowerCase().includes('speak')
                    ) || gltf.animations[0];
                  }
                  
                  // 处理绑骨动画（metarigAction）
                  // 若只有绑骨动画，也播放它作为后备，至少让模型有些动作
                  if (clip.name === 'metarigAction') {
                    if (gltf.animations.length > 1) {
                      console.warn('[AvatarScene] 检测到绑骨动画，尝试使用其他动画');
                      const alternativeClip = gltf.animations.find(a => a.name !== 'metarigAction');
                      if (alternativeClip) {
                        clip = alternativeClip;
                        console.log('[AvatarScene] 找到替代动画: ' + alternativeClip.name);
                      } else {
                        // 若只有绑骨动画，使用它作为后备方案
                        console.warn('[AvatarScene] 模型只有绑骨动画（metarigAction），将使用它作为后备动画');
                        console.warn('[AvatarScene] 提示：建议上传包含动作动画的模型，例如 Idle_Torch_Loop 或 Idle_Talking_Loop');
                        // 继续使用 metarigAction，不返回
                      }
                    } else {
                      // 若只有绑骨动画，使用它作为后备方案
                      console.warn('[AvatarScene] 模型只有绑骨动画（metarigAction），将使用它作为后备动画');
                      console.warn('[AvatarScene] 提示：建议上传包含动作动画的模型，例如 Idle_Torch_Loop 或 Idle_Talking_Loop');
                      // 继续使用 metarigAction，不返回
                    }
                  }
                  
                  // 创建动画动作，确保绑定到正确的根对象
                  const action = mixer.clipAction(clip, model);
                  
                  // 检查 action 是否有效
                  if (!action) {
                    console.warn('[AvatarScene] 无法创建动画动作，跳过动画播放');
                    console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功（无动作动画，原始URL）');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  // 检查 action 是否具备必要方法
                  if (typeof action.play !== 'function' || typeof action.setLoop !== 'function') {
                    console.warn('[AvatarScene] 动画动作对象无效，跳过动画播放');
                    console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功（无动作动画，原始URL）');
                    loadingRef.current[loadingKey] = false;
                    resolve(model);
                    return;
                  }
                  
                  action.play();
                  action.setLoop(THREE.LoopRepeat);
                  
                  // 验证动画是否真正在播放（安全检查）
                  try {
                    const isPlaying = typeof action.isPlaying === 'function' ? action.isPlaying() : false;
                    console.log('[AvatarScene] 动画动作状态（原始URL）', {
                      isPlaying: isPlaying,
                      enabled: action.enabled !== undefined ? action.enabled : 'N/A',
                      time: action.time !== undefined ? action.time : 'N/A',
                      weight: action.weight !== undefined ? action.weight : 'N/A',
                      loop: action.loop !== undefined ? action.loop : 'N/A'
                    });
                  } catch (error) {
                    console.warn('[AvatarScene] 无法读取动画状态', error);
                  }
                  
                  if (isIdleModel) {
                    idleActionRef.current = action;

                    if (waveClip) {
                      const waveAction = mixer.clipAction(waveClip, model);
                      if (waveAction && typeof waveAction.play === 'function') {
                        waveActionRef.current = waveAction;
                        setWaveReadyVersion((v) => v + 1);
                      }
                    } else {
                      waveActionRef.current = null;
                    }
                  } else {
                    talkingActionRef.current = action;
                  }
                  
                  console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载成功（原始URL），使用动画:', clip.name);
                } else {
                  console.warn('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型没有动画数据（原始URL）');
                  console.warn('[AvatarScene] 提示：需要使用绑骨后导出的动画模型');
                  console.warn('[AvatarScene] 当前模型URL:', url);
                }
                
                const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载耗时（原始URL）: ' + loadTime + '秒');
                loadingRef.current[loadingKey] = false;
                resolve(model);
              },
              undefined,
              (error) => {
                console.error('[AvatarScene] ' + (isIdleModel ? '空闲' : '说话') + '模型加载失败（原始URL）:', error);
                loadingRef.current[loadingKey] = false;
                reject(error);
              }
            );
          }
        })();
      });
    };

    // 通知开始加载
    if (onLoadStart) {
      onLoadStart();
    }

    // 加载模型
    if (useAnimationBlending) {
      // 单模型 + 动画混合：加载一个模型，从另一个模型提取动画剪辑（类似 UE）
      console.log('[AvatarScene] 使用单模型+动画混合方案（类似 UE，骨骼相同）');
      
      const loader = new GLTFLoader();
      let baseModel: THREE.Group | null = null;
      let baseMixer: THREE.AnimationMixer | null = null;
      let idleClip: THREE.AnimationClip | null = null;
      let talkingClip: THREE.AnimationClip | null = null;
      
      // 1. 加载 idle 模型作为基础模型
      const loadBaseModel = async (): Promise<THREE.Group> => {
        try {
          const { animationCacheService } = await import('./services/animationCacheService');
          const cachedUrl = await animationCacheService.getAnimationUrl(idleModelUrl!);
          
          return new Promise<THREE.Group>((resolve, reject) => {
            loader.load(
              cachedUrl,
              (gltf) => {
                baseModel = gltf.scene;
                optimizeMaterials(baseModel);
                baseMixer = new THREE.AnimationMixer(baseModel);
                idleMixerRef.current = baseMixer;
                mixerRef.current = baseMixer;
                
                // 查找 idle 动画
                if (gltf.animations && gltf.animations.length > 0) {
                  idleClip = gltf.animations.find(a => 
                    a.name === 'Idle_Torch_Loop' || 
                    a.name.toLowerCase().includes('idle')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] 基础模型动画列表:', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene] 找到 idle 动画:', idleClip.name);
                }
                
                fitModelToView(baseModel);
                fitModelToView(baseModel);
                scene.add(baseModel);
                idleModelRef.current = baseModel;
                setIdleReadyVersion((v) => v + 1);
                resolve(baseModel);
              },
              undefined,
              reject
            );
          });
        } catch (error) {
          // 回退到原始 URL
          return new Promise<THREE.Group>((resolve, reject) => {
            loader.load(
              idleModelUrl!,
              (gltf) => {
                baseModel = gltf.scene;
                optimizeMaterials(baseModel);
                baseMixer = new THREE.AnimationMixer(baseModel);
                idleMixerRef.current = baseMixer;
                mixerRef.current = baseMixer;
                
                // 查找 idle 动画
                if (gltf.animations && gltf.animations.length > 0) {
                  idleClip = gltf.animations.find(a => 
                    a.name === 'Idle_Torch_Loop' || 
                    a.name.toLowerCase().includes('idle')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] 基础模型动画列表（原始 URL）:', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene] 找到 idle 动画（原始URL）:', idleClip.name);
                }
                
                scene.add(baseModel);
                idleModelRef.current = baseModel;
                setIdleReadyVersion((v) => v + 1);
                resolve(baseModel);
              },
              undefined,
              reject
            );
          });
        }
      };
      
      // 2. 从 talking 模型提取动画剪辑（不加载整个模型，只取动画数据）
      const loadTalkingAnimation = async (): Promise<THREE.AnimationClip | null> => {
        try {
          const { animationCacheService } = await import('./services/animationCacheService');
          const cachedUrl = await animationCacheService.getAnimationUrl(talkingModelUrl!);
          
          return new Promise<THREE.AnimationClip | null>((resolve, reject) => {
            loader.load(
              cachedUrl,
              (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                  talkingClip = gltf.animations.find(a => 
                    a.name === 'Idle_Talking_Loop' || 
                    a.name.toLowerCase().includes('talking') ||
                    a.name.toLowerCase().includes('speak')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] talking 模型动画列表:', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene] 提取到 talking 动画:', talkingClip.name);
                  resolve(talkingClip);
                } else {
                  console.warn('[AvatarScene] talking 模型没有动画数据');
                  resolve(null);
                }
              },
              undefined,
              reject
            );
          });
        } catch (error) {
          // 回退到原始 URL
          return new Promise<THREE.AnimationClip | null>((resolve, reject) => {
            loader.load(
              talkingModelUrl!,
              (gltf) => {
                if (gltf.animations && gltf.animations.length > 0) {
                  talkingClip = gltf.animations.find(a => 
                    a.name === 'Idle_Talking_Loop' || 
                    a.name.toLowerCase().includes('talking') ||
                    a.name.toLowerCase().includes('speak')
                  ) || (gltf.animations[0].name === 'metarigAction' && gltf.animations.length > 1 
                    ? gltf.animations.find(a => a.name !== 'metarigAction') || gltf.animations[0]
                    : gltf.animations[0]);
                  
                  console.log('[AvatarScene] talking 模型动画列表（原始 URL）:', gltf.animations.map(a => a.name));
                  console.log('[AvatarScene] 提取到 talking 动画（原始URL）:', talkingClip.name);
                  resolve(talkingClip);
                } else {
                  console.warn('[AvatarScene] talking 模型没有动画数据（原始URL）');
                  resolve(null);
                }
              },
              undefined,
              reject
            );
          });
        }
      };
      
      // 3. 并行加载模型与动画
      Promise.all([loadBaseModel(), loadTalkingAnimation()])
        .then(([model, clip]) => {
          if (!baseMixer || !baseModel) {
            throw new Error('基础模型加载失败');
          }
          
          // 创建动画动作
          if (idleClip) {
            const idleAction = baseMixer.clipAction(idleClip, baseModel);
            idleAction.play();
            idleAction.setLoop(THREE.LoopRepeat);
            idleActionRef.current = idleAction;
            console.log('[AvatarScene] idle 动画已播放');
          }
          
          if (clip) {
            const talkingAction = baseMixer.clipAction(clip, baseModel);
            talkingAction.setLoop(THREE.LoopRepeat);
            talkingActionRef.current = talkingAction;
            // talking 动画初始不播放，等待切换时再播放
            console.log('[AvatarScene] talking 动画已就绪（等待切换）');
          }
          
          console.log('[AvatarScene] 单模型动画混合方案加载完成');
          if (onLoadComplete) {
            onLoadComplete();
          }
        })
        .catch((error) => {
          console.error('[AvatarScene] 单模型动画混合方案加载失败:', error);
          if (onLoadComplete) {
            onLoadComplete();
          }
        });
    } else {
      // 单模型方案（向后兼容）
      console.log('[AvatarScene] 使用单模型方案（向后兼容）');
      loadSingleModel(fallbackUrl!, true).then((model) => {
        idleModelRef.current = model;
        fitModelToView(model);
        scene.add(model);
        // 单模型方案同样使用 idleMixerRef
        mixerRef.current = idleMixerRef.current;
        if (onLoadComplete) {
          onLoadComplete();
        }
      }).catch((error) => {
        console.error('[AvatarScene] 单模型加载失败:', error);
        if (onLoadComplete) {
          onLoadComplete();
        }
      });
    }

    // 动画循环
    const clock = new THREE.Clock();
    const animate = () => {
      animateId = requestAnimationFrame(animate);
      
      const delta = clock.getDelta();
      
      // 更新 mixer（单模型方案只需更新一个 mixer）
      if (idleMixerRef.current) {
        idleMixerRef.current.update(delta);
      }
      
      // 双模型方案的透明度渐变（已废弃，保留代码以防需要）
      const useDualModel = false; // 已改为单模型方案
      if (false && fadeTransitionRef.current) {
        const { target, progress } = fadeTransitionRef.current;
        const fadeSpeed = 2.0; // 渐变速度（每秒）
        const newProgress = Math.min(progress + delta * fadeSpeed, 1.0);
        
        if (useDualModel && idleModelRef.current && talkingModelRef.current) {
          // 透明度阈值：低于此值时立即隐藏模型，避免白边/残影
          const opacityThreshold = 0.05;
          
          if (target === 'talking') {
            // 切到说话：idle 淡出，talking 淡入
            const idleOpacity = 1.0 - newProgress;
            const talkingOpacity = newProgress;
            
            setModelOpacity(idleModelRef.current, idleOpacity);
            setModelOpacity(talkingModelRef.current, talkingOpacity);
            
            // 透明度很低时立刻隐藏模型，避免白边
            if (idleOpacity <= opacityThreshold) {
              idleModelRef.current.visible = false;
            } else {
              idleModelRef.current.visible = true;
            }
            
            if (talkingOpacity >= 1.0 - opacityThreshold) {
              talkingModelRef.current.visible = true;
            } else {
              talkingModelRef.current.visible = true; // 渐变过程中保持可见
            }
          } else {
            // 切到空闲：talking 淡出，idle 淡入
            const talkingOpacity = 1.0 - newProgress;
            const idleOpacity = newProgress;
            
            setModelOpacity(talkingModelRef.current, talkingOpacity);
            setModelOpacity(idleModelRef.current, idleOpacity);
            
            // 透明度很低时立刻隐藏模型，避免白边
            if (talkingOpacity <= opacityThreshold) {
              talkingModelRef.current.visible = false;
            } else {
              talkingModelRef.current.visible = true;
            }
            
            if (idleOpacity >= 1.0 - opacityThreshold) {
              idleModelRef.current.visible = true;
            } else {
              idleModelRef.current.visible = true; // 渐变过程中保持可见
            }
          }
          
          if (newProgress >= 1.0) {
            // 渐变完成，确保目标模型的可见性设置正确
            if (target === 'idle') {
              // idle 状态：完全隐藏 talking 模型并停止其动画
              if (talkingModelRef.current) {
                setModelOpacity(talkingModelRef.current, 0.0);
                talkingModelRef.current.visible = false; // 完全隐藏，避免仍被渲染
              }
              if (idleModelRef.current) {
                setModelOpacity(idleModelRef.current, 1.0);
                idleModelRef.current.visible = true;
              }
            } else {
              // talking 状态：完全隐藏 idle 模型
              if (idleModelRef.current) {
                setModelOpacity(idleModelRef.current, 0.0);
                idleModelRef.current.visible = false; // 完全隐藏，避免仍被渲染
              }
              if (talkingModelRef.current) {
                setModelOpacity(talkingModelRef.current, 1.0);
                talkingModelRef.current.visible = true;
              }
            }
            fadeTransitionRef.current = null;
          } else {
            fadeTransitionRef.current.progress = newProgress;
          }
        }
      } else if (false && useDualModel && idleModelRef.current && talkingModelRef.current) {
        // 无渐变进行时，按当前状态保证模型可见性正确
        // 检查当前应显示哪个模型（通过读透明度）
        // talking 模型透明度接近 0 则隐藏；idle 模型同理
        // 可避免白边/鬼影问题
        let talkingOpacity = 1.0;
        let idleOpacity = 1.0;
        
        // 读取 talking 模型透明度
        talkingModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material;
            if (Array.isArray(material)) {
              talkingOpacity = Math.min(...material.map(m => (m as any).opacity ?? 1.0));
            } else {
              talkingOpacity = (material as any).opacity ?? 1.0;
            }
          }
        });
        
        // 读取 idle 模型透明度
        idleModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material;
            if (Array.isArray(material)) {
              idleOpacity = Math.min(...material.map(m => (m as any).opacity ?? 1.0));
            } else {
              idleOpacity = (material as any).opacity ?? 1.0;
            }
          }
        });
        
        // 按透明度设置可见性
        if (talkingOpacity <= 0.01) {
          talkingModelRef.current.visible = false;
        } else {
          talkingModelRef.current.visible = true;
        }
        
        if (idleOpacity <= 0.01) {
          idleModelRef.current.visible = false;
        } else {
          idleModelRef.current.visible = true;
        }
      }
      
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animateId) cancelAnimationFrame(animateId);
      if (idleActionRef.current) {
        idleActionRef.current.stop();
        idleActionRef.current = null;
      }
      if (talkingActionRef.current) {
        talkingActionRef.current.stop();
        talkingActionRef.current = null;
      }
      // 重置招手状态
      waveActionRef.current = null;
      isWavingRef.current = false;
      hasPlayedWaveOnEnterRef.current = false;
      idleMixerRef.current = null;
      talkingMixerRef.current = null;
      mixerRef.current = null;
      idleModelRef.current = null;
      talkingModelRef.current = null;
      fadeTransitionRef.current = null;
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.dispose();
    };
  }, [idleModelUrl, talkingModelUrl, modelUrl]); // 依赖模型 URL

  /**
   * 使用第三个 GLB（waveModelUrl）为空闲模型挂接一次性招手动画：
   * - 存在 waveModelUrl 时加载该 GLB，取出 AnimationClip
   * - 将 Clip 绑定到 idle 模型的 mixer，写入 waveActionRef
   * - 进入对话页时，若尚未招手且当前未在说话，则自动执行一次 triggerWaveOnce()
   * - 若无 waveModelUrl，仍走「从 idle GLB 内查找 waveClip」的旧逻辑
   */
  useEffect(() => {
    if (!waveModelUrl) {
      // 未提供第三个 GLB，保持原逻辑（可能从 idle GLB 中找 waveClip）
      return;
    }

    if (!idleMixerRef.current || !idleModelRef.current) {
      console.log('[AvatarScene] waveModelUrl 已提供，但空闲模型尚未加载，等待中…');
      return;
    }

    let cancelled = false;
    const loader = new GLTFLoader();

    (async () => {
      let createdModelId: string | null = null;
      try {
        const { animationCacheService } = await import('./services/animationCacheService');
        const cachedUrl = await animationCacheService.getAnimationUrl(waveModelUrl);
        console.log('[AvatarScene] 招手模型使用缓存:', cachedUrl !== waveModelUrl ? '是' : '否');

        loader.load(
          cachedUrl,
          (gltf) => {
            if (cancelled) return;
            if (!gltf.animations || gltf.animations.length === 0) {
              console.warn('[AvatarScene] 招手模型没有动画数据', waveModelUrl);
              return;
            }

            // 选择招手动画：优先名称含 wave/greet，否则用第一条
            let clip = gltf.animations.find(a =>
              a.name.toLowerCase().includes('wave') ||
              a.name.toLowerCase().includes('greet')
            ) || gltf.animations[0];

            const mixer = idleMixerRef.current;
            const model = idleModelRef.current;
            if (!mixer || !model) {
              console.warn('[AvatarScene] 创建招手动画时 idle mixer 或 model 不存在');
              return;
            }

            const action = mixer.clipAction(clip, model);
            if (!action || typeof (action as any).play !== 'function') {
              console.warn('[AvatarScene] 无法为招手动画创建有效的 AnimationAction');
              return;
            }

            waveActionRef.current = action;
            setWaveReadyVersion((v) => v + 1);
            console.log('[AvatarScene] 已从第三个GLB创建招手动画:', clip.name);

            // 若进页时尚未播过招手且当前不在说话，则自动招手一次
          },
          undefined,
          (error) => {
            if (cancelled) return;
            console.error('[AvatarScene] 招手模型加载失败:', error);
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[AvatarScene] 加载招手模型时出错:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waveModelUrl, idleReadyVersion]);

  // 切换动画状态（单模型 + 动画混合：fadeIn/fadeOut）
  useEffect(() => {
    const useAnimationBlending = !!(idleModelUrl && talkingModelUrl);
    
    // 开始说话时若正在招手，立即停止招手，保证说话优先级最高
    if (isTalking && isWavingRef.current && waveActionRef.current) {
      waveActionRef.current.stop();
      isWavingRef.current = false;
    }
    
    // 单模型混合或普通单模型：用 fadeIn/fadeOut 切换动画
    if (!useAnimationBlending || (useAnimationBlending && !idleModelRef.current && !talkingModelRef.current)) {
      // 单模型方案：沿用原有切换逻辑
      if (!mixerRef.current) {
        console.log('[AvatarScene] 切换动画时 mixerRef 为空');
        return;
      }
      
      if (isTalking && talkingActionRef.current) {
        if (idleActionRef.current) {
          idleActionRef.current.fadeOut(0.3);
        }
        talkingActionRef.current.reset();
        talkingActionRef.current.play();
        talkingActionRef.current.setLoop(THREE.LoopRepeat);
        talkingActionRef.current.fadeIn(0.3);
        console.log('[AvatarScene] 切换到 talking 动画（fadeIn/fadeOut）');
      } else if (!isTalking && idleActionRef.current) {
        if (talkingActionRef.current) {
          talkingActionRef.current.fadeOut(0.3);
        }
        idleActionRef.current.reset();
        idleActionRef.current.play();
        idleActionRef.current.setLoop(THREE.LoopRepeat);
        idleActionRef.current.fadeIn(0.3);
        console.log('[AvatarScene] 切换到 idle 动画（fadeIn/fadeOut）');
      }
      return;
    }
    
    // 单模型 + 动画混合：fadeIn/fadeOut 切换（类似 UE）
    if (!mixerRef.current) {
      console.log('[AvatarScene] 切换动画时 mixerRef 为空');
      return;
    }
    
    if (isTalking && talkingActionRef.current) {
      if (idleActionRef.current) {
        idleActionRef.current.fadeOut(0.3);
      }
      talkingActionRef.current.reset();
      talkingActionRef.current.play();
      talkingActionRef.current.setLoop(THREE.LoopRepeat);
      talkingActionRef.current.fadeIn(0.3);
      console.log('[AvatarScene] 切换到 talking 动画（fadeIn/fadeOut，单模型混合方案）');
    } else if (!isTalking && idleActionRef.current) {
      if (talkingActionRef.current) {
        talkingActionRef.current.fadeOut(0.3);
      }
      idleActionRef.current.reset();
      idleActionRef.current.play();
      idleActionRef.current.setLoop(THREE.LoopRepeat);
      idleActionRef.current.fadeIn(0.3);
      console.log('[AvatarScene] 切换到 idle 动画（fadeIn/fadeOut，单模型混合方案）');
    }
    
    // 双模型方案曾用透明度切换（已废弃，保留注释占位）
    // const useDualModel = false;
    // if (useDualModel) {
    //   // 双模型代码已移除，现用单模型 + 动画混合
    // }
  }, [isTalking, idleModelUrl, talkingModelUrl]);

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: '500px' }} />;
};


// --- Main App ---

const App: React.FC = () => {
  const [data, setData] = useState<AppData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.companions && !parsed.activeId && parsed.id) {
           return { companions: [parsed], activeId: parsed.id };
        }
        return parsed;
      }
      return { companions: [DEFAULT_COMPANION], activeId: DEFAULT_COMPANION.id };
    } catch (e) {
      console.error(e);
      return { companions: [DEFAULT_COMPANION], activeId: DEFAULT_COMPANION.id };
    }
  });

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [hasLoadedBackend, setHasLoadedBackend] = useState(false);

  // 从后端拉取模型列表（仅在首次加载时执行）
  useEffect(() => {
    if (hasLoadedBackend) return; // 避免重复加载

    const loadModelsFromBackend = async () => {
      try {
        setIsLoadingModels(true);
        const models = await modelService.getModels('User', true);
        const companions = models.map(model => modelService.modelToCompanion(model));
        
        setData(prev => {
          // 以后端模型为准，列表以后端返回为准
          // 若本地已有同 model_id 的 companion，尽量保留本地 UI 相关字段（如 avatarUrl）
          const mergedCompanions = companions.map(backendCompanion => {
            const localCompanion = prev.companions.find(c => c.model_id === backendCompanion.model_id);
            if (localCompanion) {
              // 保留本地 avatarUrl（后端未提供时）；其余字段以后端为准
              return {
                ...backendCompanion,
                avatarUrl: localCompanion.avatarUrl || backendCompanion.avatarUrl,
              };
            }
            return backendCompanion;
          });

          // 以后端为准，不保留仅存在于本地的 companion
          const activeId = prev.activeId && mergedCompanions.find(c => c.id === prev.activeId) 
            ? prev.activeId 
            : (mergedCompanions.length > 0 ? mergedCompanions[0].id : DEFAULT_COMPANION.id);

          return {
            companions: mergedCompanions,
            activeId: activeId,
          };
        });
        
        setHasLoadedBackend(true);
      } catch (error) {
        console.error('从后端加载模型失败，使用本地数据:', error);
        // 加载失败则继续使用本地数据
        setHasLoadedBackend(true);
      } finally {
        setIsLoadingModels(false);
      }
    };

    loadModelsFromBackend();
  }, [hasLoadedBackend]); // 仅在首次加载时执行

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // API 配置调试信息
  useEffect(() => {
    const config = APIConfig.getConfigInfo();
    console.log('[API 配置] 当前配置信息:', config);
    console.log('[API 配置] 当前 API URL:', APIConfig.getApiUrl());
    
    // 测试连接
    APIConfig.testConnection().then(connected => {
      console.log('[API 配置] 连接测试:', connected ? '成功' : '失败');
      if (!connected) {
        console.warn('[API 配置] 无法连接到 API，请检查：');
        console.warn('1. 是否创建了 .env.local 文件');
        console.warn('2. VITE_FAY_API_URL 是否正确设置');
        console.warn('3. 手机和电脑是否在同一 Wi-Fi');
        console.warn('4. Fay 后端是否正在运行');
        console.warn('当前尝试连接的地址:', APIConfig.getApiUrl());
      }
    });
  }, []);

  const activeCompanion = data.companions.find(c => c.id === data.activeId) || data.companions[0] || null;
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>(() => loadBackgroundTasks());

  useEffect(() => {
    localStorage.setItem(BACKGROUND_TASKS_KEY, JSON.stringify(backgroundTasks.slice(0, 20)));
  }, [backgroundTasks]);

  const upsertBackgroundTask = useCallback((taskId: string, updater: Partial<BackgroundTask> | ((task: BackgroundTask) => BackgroundTask)) => {
    setBackgroundTasks(prev =>
      prev.map(task => {
        if (task.id !== taskId) return task;
        return typeof updater === 'function'
          ? updater(task)
          : { ...task, ...updater, updatedAt: Date.now() };
      })
    );
  }, []);

  const createBackgroundTask = useCallback((task: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    let resolvedTaskId = '';

    setBackgroundTasks(prev => {
      const existingTask = prev.find(existing => {
        if (existing.status !== 'running' || existing.type !== task.type) {
          return false;
        }

        if (task.companionId && existing.companionId) {
          return task.companionId === existing.companionId;
        }

        if (task.companionName && existing.companionName) {
          return task.companionName === existing.companionName;
        }

        return existing.title === task.title && existing.targetPath === task.targetPath;
      });

      if (existingTask) {
        resolvedTaskId = existingTask.id;
        return prev.map(existing =>
          existing.id === existingTask.id
            ? {
                ...existing,
                ...task,
                id: existing.id,
                createdAt: existing.createdAt,
                updatedAt: now,
              }
            : existing
        );
      }

      const taskId = task.type + '_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
      resolvedTaskId = taskId;

      return [
        {
          ...task,
          id: taskId,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ].slice(0, 20);
    });

    return resolvedTaskId;
  }, []);

  const markTaskSeen = useCallback((taskId: string) => {
    upsertBackgroundTask(taskId, { seen: true });
  }, [upsertBackgroundTask]);

  const markAllTasksSeen = useCallback(() => {
    setBackgroundTasks(prev =>
      prev.map(task =>
        task.status !== 'running' && !task.seen
          ? { ...task, seen: true, updatedAt: task.updatedAt }
          : task
      )
    );
  }, []);

  const removeBackgroundTask = useCallback((taskId: string) => {
    setBackgroundTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  const syncCompanionUpdate = useCallback(async (targetCompanion: Companion) => {
    if (!targetCompanion.model_id) return;
    try {
      const modelData = modelService.companionToModelData(targetCompanion);
      await modelService.updateModel(targetCompanion.model_id, {
        name: modelData.name,
        description: modelData.description,
        attribute_json: modelData.attribute_json,
        model3d_url: modelData.model3d_url,
        idle_model_url: modelData.idle_model_url,
        talking_model_url: modelData.talking_model_url,
        wave_model_url: modelData.wave_model_url,
      });
      console.log('[App] 后端模型同步成功');
    } catch (error) {
      console.error('[App] 同步后端模型失败:', error);
    }
  }, []);

  const updateCompanionById = useCallback(async (companionId: string, updates: Partial<Companion>) => {
    const currentCompanion = data.companions.find(c => c.id === companionId);
    if (!currentCompanion) return;

    const updatedCompanion = { ...currentCompanion, ...updates };
    await syncCompanionUpdate(updatedCompanion);

    setData(prev => ({
      ...prev,
      companions: prev.companions.map(c => c.id === companionId ? updatedCompanion : c)
    }));
  }, [data.companions, syncCompanionUpdate]);

  const addCompanion = async (newCompanion: Companion) => {
    try {
      // 若有角色属性、描述或 3D 模型且尚无 model_id，则同步在后端创建模型
      // 若已有 model_id，说明已在外部创建过，跳过重复创建
      if (!newCompanion.model_id && (newCompanion.characterAttributes || newCompanion.characterDescription || newCompanion.model3dUrl)) {
        const modelData = modelService.companionToModelData(newCompanion);
        const modelId = await modelService.createModel(modelData);
        newCompanion.model_id = modelId;
        newCompanion.id = modelId; // 使用后端返回的 model_id 作为前端 id，保持一致
        console.log('[App] 后端模型创建成功，model_id:', modelId);
      }

    setData(prev => ({
      companions: [...prev.companions, newCompanion],
      activeId: newCompanion.id
    }));

      // 若已创建后端模型，选中该模型
      if (newCompanion.model_id) {
        try {
          await modelService.selectModel(newCompanion.model_id, 'User');
        } catch (error) {
          console.warn('选择模型失败:', error);
        }
      }
    } catch (error) {
      console.error('创建后端模型失败，仅保存到本地:', error);
      // 即使后端创建失败也写入本地
      setData(prev => ({
        companions: [...prev.companions, newCompanion],
        activeId: newCompanion.id
      }));
    }
  };

  const updateActiveCompanion = async (updates: Partial<Companion>) => {
    if (!activeCompanion) return;
    
    const updatedCompanion = { ...activeCompanion, ...updates };
    
    // 若 companion 有 model_id，同步更新后端模型
    if (updatedCompanion.model_id) {
      try {
        const modelData = modelService.companionToModelData(updatedCompanion);
        await modelService.updateModel(updatedCompanion.model_id, {
          name: modelData.name,
          description: modelData.description,
          attribute_json: modelData.attribute_json,
          model3d_url: modelData.model3d_url, // 同步3D模型URL
          idle_model_url: modelData.idle_model_url, // 同步待机动画模型 URL
          talking_model_url: modelData.talking_model_url, // 同步说话动画模型URL
        });
        console.log('[App] 后端模型更新成功，包含 model3d_url 与动画模型 URL');
      } catch (error) {
        console.error('更新后端模型失败:', error);
      }
    }

    setData(prev => ({
      ...prev,
      companions: prev.companions.map(c => c.id === prev.activeId ? updatedCompanion : c)
    }));
  };

  const switchCompanion = async (id: string) => {
    const companion = data.companions.find(c => c.id === id);
    
    // 若 companion 有 model_id，选中该模型
    if (companion?.model_id) {
      try {
        await modelService.selectModel(companion.model_id, 'User');
        console.log('[App] 已选择模型:', companion.model_id);
      } catch (error) {
        console.warn('选择模型失败:', error);
      }
    }

    // 预加载并缓存动画文件
    if (companion?.idleModelUrl || companion?.talkingModelUrl) {
      try {
        const { animationCacheService } = await import('./services/animationCacheService');
        // 异步预加载，不阻塞 UI
        animationCacheService.preloadAnimations(companion.idleModelUrl, companion.talkingModelUrl)
          .then(() => {
            console.log('[App] 动画预加载完成');
          })
          .catch(error => {
            console.warn('[App] 动画预加载失败:', error);
          });
      } catch (error) {
        console.warn('[App] 加载动画缓存服务失败:', error);
      }
    }

    setData(prev => ({ ...prev, activeId: id }));
  };

  const deleteCompanion = async (id: string) => {
    const companion = data.companions.find(c => c.id === id);
    
    // 若 companion 有 model_id，同步删除后端模型
    if (companion?.model_id) {
      try {
        await modelService.deleteModel(companion.model_id);
        console.log('[App] 后端模型删除成功');
      } catch (error) {
        console.error('删除后端模型失败:', error);
      }
    }

    setData(prev => {
      const newCompanions = prev.companions.filter(c => c.id !== id);
      let newActiveId = prev.activeId;
      if (id === prev.activeId) {
        newActiveId = newCompanions.length > 0 ? newCompanions[0].id : '';
        
        // 若切到新 companion，选中对应模型
        if (newActiveId) {
          const newCompanion = newCompanions.find(c => c.id === newActiveId);
          if (newCompanion?.model_id) {
            modelService.selectModel(newCompanion.model_id, 'User').catch(err => {
              console.warn('选择新模型失败:', err);
            });
          }
        }
      }
      return { companions: newCompanions, activeId: newActiveId };
    });
  };

  const finishBackgroundTask = useCallback((taskId: string, detail: string, extra?: Partial<BackgroundTask>) => {
    upsertBackgroundTask(taskId, task => ({
      ...task,
      ...extra,
      status: 'success',
      detail,
      seen: false,
      updatedAt: Date.now(),
    }));
  }, [upsertBackgroundTask]);

  const failBackgroundTask = useCallback((taskId: string, detail: string, extra?: Partial<BackgroundTask>) => {
    upsertBackgroundTask(taskId, task => ({
      ...task,
      ...extra,
      status: 'error',
      detail,
      seen: false,
      updatedAt: Date.now(),
    }));
  }, [upsertBackgroundTask]);

  useEffect(() => {
    const runningTasks = backgroundTasks.filter(task => task.status === 'running' && task.companionId);
    if (runningTasks.length === 0) {
      return;
    }

    let cancelled = false;

    const reconcileTasks = async () => {
      for (const task of runningTasks) {
        if (!task.companionId || cancelled) continue;

        try {
          const backendModel = await modelService.getModelDetail(task.companionId);
          if (cancelled) return;

          const recoveredCompanion = modelService.modelToCompanion(backendModel);
          const isBound = !!(
            recoveredCompanion.idleModelUrl ||
            recoveredCompanion.talkingModelUrl ||
            recoveredCompanion.waveModelUrl
          );

          if (!isBound) {
            continue;
          }

          setData(prev => {
            const existing = prev.companions.find(companion => companion.id === task.companionId);
            const nextCompanions = existing
              ? prev.companions.map(companion =>
                  companion.id === task.companionId ? { ...companion, ...recoveredCompanion } : companion
                )
              : [...prev.companions, recoveredCompanion];

            return { ...prev, companions: nextCompanions };
          });

          finishBackgroundTask(
            task.id,
            `${recoveredCompanion.name || task.companionName || '角色'} 已经准备好啦，可以点按钮去跟 TA 聊天喽～`,
            {
              companionId: task.companionId,
              companionName: recoveredCompanion.name || task.companionName,
              targetPath: task.targetPath || '/chat',
            }
          );
        } catch (error) {
          console.warn('[App] 后台任务恢复检查失败:', task.id, error);
        }
      }
    };

    reconcileTasks();
    const timer = window.setInterval(reconcileTasks, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [backgroundTasks, finishBackgroundTask]);

  return (
    <HashRouter>
      <div className="flex flex-col min-h-screen">
        <BackgroundDecorations />
        <main className="flex-1 overflow-hidden relative">
          <TaskCenter
            tasks={backgroundTasks}
            switchCompanion={switchCompanion}
            markTaskSeen={markTaskSeen}
            markAllTasksSeen={markAllTasksSeen}
            removeTask={removeBackgroundTask}
          />
          <Routes>
            <Route
              path="/"
              element={
                <HomeAgentPage
                  companion={activeCompanion}
                  companions={data.companions}
                  tasks={backgroundTasks}
                  addCompanion={addCompanion}
                  switchCompanion={switchCompanion}
                  updateCompanionById={updateCompanionById}
                  createTask={createBackgroundTask}
                  updateTask={upsertBackgroundTask}
                  finishTask={finishBackgroundTask}
                  failTask={failBackgroundTask}
                />
              }
            />
            <Route
              path="/create"
              element={
                <CreatePage
                  addCompanion={addCompanion}
                  createTask={createBackgroundTask}
                  updateTask={upsertBackgroundTask}
                  finishTask={finishBackgroundTask}
                  failTask={failBackgroundTask}
                />
              }
            />
            <Route path="/mini-game" element={<MiniGamePage />} />
            <Route path="/mini-game/:gameId" element={<MiniGamePage />} />
            <Route
              path="/bind"
              element={
                <BindPage
                  companion={activeCompanion}
                  updateCompanion={updateActiveCompanion}
                  createTask={createBackgroundTask}
                  updateTask={upsertBackgroundTask}
                  finishTask={finishBackgroundTask}
                  failTask={failBackgroundTask}
                  tasks={backgroundTasks}
                />
              }
            />
            <Route path="/chat" element={<ChatPage key={activeCompanion?.id} companion={activeCompanion} />} />
            <Route path="/manage" element={<ManagePage companions={data.companions} activeCompanion={activeCompanion} switchCompanion={switchCompanion} updateCompanion={updateActiveCompanion} deleteCompanion={deleteCompanion} />} />
          </Routes>
        </main>
        <Navigation />
      </div>
    </HashRouter>
  );
};

const TaskCenter: React.FC<{
  tasks: BackgroundTask[];
  switchCompanion: (id: string) => Promise<void>;
  markTaskSeen: (taskId: string) => void;
  markAllTasksSeen: () => void;
  removeTask: (taskId: string) => void;
}> = ({ tasks, switchCompanion, markTaskSeen, markAllTasksSeen, removeTask }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const visibleTasks = tasks.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const runningCount = tasks.filter(task => task.status === 'running').length;
  const unreadCount = tasks.filter(task => task.status !== 'running' && !task.seen).length;

  useEffect(() => {
    if (unreadCount > 0) {
      setExpanded(true);
    }
  }, [unreadCount]);

  useEffect(() => {
    if (expanded && unreadCount > 0) {
      markAllTasksSeen();
    }
  }, [expanded, unreadCount, markAllTasksSeen]);

  const openTask = async (task: BackgroundTask) => {
    if (task.companionId) {
      await switchCompanion(task.companionId);
    }
    markTaskSeen(task.id);
    if (task.targetPath) {
      navigate(task.targetPath);
    }
  };

  if (tasks.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col items-end gap-3">
      {expanded && (
        <div className="w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/40 bg-white/90 backdrop-blur-xl shadow-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">后台任务</p>
                <p className="text-[11px] text-gray-500">{runningCount > 0 ? ('进行中 ' + runningCount + ' 项') : '可随时离开页面，任务会继续执行'}</p>
            </div>
            <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-700">
              <X size={16} />
            </button>
          </div>
          {visibleTasks.map(task => {
            const statusIcon = task.status === 'running'
              ? <Activity size={14} className="text-blue-500 animate-pulse" />
              : task.status === 'success'
                ? <CheckCircle2 size={14} className="text-green-500" />
                : <AlertCircle size={14} className="text-red-500" />;

            return (
              <div key={task.id} className="rounded-xl border border-gray-200 bg-white/80 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">{statusIcon}</div>
                  <button onClick={() => openTask(task)} className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{task.title}</span>
                      <span className="text-[10px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{getTaskTypeLabel(task.type)}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{task.detail}</p>
                  </button>
                  {task.status !== 'running' && (
                    <button onClick={() => removeTask(task.id)} className="text-gray-300 hover:text-gray-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => {
          setExpanded(value => {
            const next = !value;
            if (next && unreadCount > 0) {
              markAllTasksSeen();
            }
            return next;
          });
        }}
        className="relative flex items-center gap-2 rounded-full border border-white/50 bg-white/90 px-4 py-3 shadow-xl backdrop-blur-xl text-gray-800"
      >
        <Bell size={16} className={runningCount > 0 ? 'text-blue-500' : 'text-gray-600'} />
        <span className="text-sm font-medium">任务中心</span>
        {(runningCount > 0 || unreadCount > 0) && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 rounded-full bg-rose-500 px-1 text-[11px] leading-5 text-white">
            {runningCount + unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

const Navigation = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const navItems = [
    { path: '/', icon: <Home size={20} />, label: '首页' },
    { path: '/create', icon: <Sparkles size={20} />, label: '生成' },
    { path: '/bind', icon: <Heart size={20} />, label: '绑定' },
    { path: '/chat', icon: <MessageCircle size={20} />, label: '互动' },
    { path: '/manage', icon: <Settings size={20} />, label: '管理' },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 glass-panel border-t border-pink-300/50 px-6 py-4 flex justify-between items-center z-[60] md:justify-center md:gap-12 bg-white/80 backdrop-blur-xl shadow-lg">
      {navItems.map((item) => (
          <Link key={item.path} to={item.path} className={'flex flex-col items-center gap-1 transition-all duration-300 ' + (isActive(item.path) ? 'text-secondary scale-110' : 'text-gray-600/70 hover:text-gray-800')}>
          {item.icon}
          <span className="text-[10px] font-medium">{item.label}</span>
        </Link>
      ))}
    </div>
  );
};

// --- Pages ---

const HomePage: React.FC<{ companion: Companion | null }> = ({ companion }) => {
  const navigate = useNavigate();
  const menuItems = [
    { id: 'generate', title: '生成', subtitle: '创造 3D 数字人', path: '/create', icon: <Sparkles size={28} className="text-purple-400" />, gradient: 'from-purple-500/20 to-blue-600/20' },
    { id: 'bind', title: '绑定', subtitle: '骨骼与蒙皮', path: '/bind', icon: <Heart size={28} className="text-pink-400" />, gradient: 'from-pink-500/20 to-rose-600/20' },
    { id: 'interact', title: '互动', subtitle: '驱动与对话', path: '/chat', icon: <MessageCircle size={28} className="text-green-400" />, gradient: 'from-emerald-500/20 to-teal-600/20' },
    { id: 'manage', title: '管理', subtitle: '模型数据库', path: '/manage', icon: <Settings size={28} className="text-amber-400" />, gradient: 'from-orange-500/20 to-amber-600/20' },
  ];

  return (
    <PageContainer className="flex flex-col min-h-[80vh] md:h-full md:min-h-0 md:overflow-hidden">
      <div className="text-center pt-8 mb-8">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 mb-2 leading-tight drop-shadow-lg">
          情智兼备的
          <br />
          虚拟陪伴系统
        </h1>
        <p className="text-gray-600/70 text-sm tracking-widest uppercase flex items-center justify-center gap-2">
           <Star size={12} className="text-yellow-500" /> 3D 智能陪伴 <Star size={12} className="text-yellow-500" />
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 content-start">
        {menuItems.map((item) => (
          <div key={item.id} onClick={() => navigate(item.path)} className="glass-panel aspect-square rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:bg-white/10 group relative overflow-hidden">
              <div className={'absolute inset-0 bg-gradient-to-br ' + item.gradient + ' opacity-0 group-hover:opacity-100 transition-opacity duration-500'} />
            <div className="relative z-10 p-3 rounded-full bg-white/40 group-hover:bg-white/60 transition-colors shadow-inner ring-1 ring-pink-200/30">{item.icon}</div>
            <div className="relative z-10"><h3 className="text-xl font-bold text-gray-700 mb-1">{item.title}</h3><p className="text-xs text-gray-600/70 group-hover:text-gray-800 transition-colors">{item.subtitle}</p></div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
};

type HomeAgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: {
    label: string;
    type: 'navigate';
    path: string;
    companionId?: string;
  };
};

type MiniGameRecommendation = {
  gameId: 'wisdom' | 'emotion' | 'truth-false' | 'sequence' | 'causality' | 'shulte' | 'memory' | 'simon-says';
  gameName: string;
  reason: string;
  prompt: string;
};

const getDefaultHomeAgentMessages = (): HomeAgentMessage[] => [];

const hasLegacyPersonaLeak = (messages: HomeAgentMessage[]) =>
  messages.some((message) =>
    message.role === 'assistant' &&
    /小朋友你好吗|没关系啦|不急哦|轻轻听着呢|慢慢说就好/.test(message.text)
  );

const buildAgentModelPrompt = (request: string, attributes?: CharacterAttributes | null) => {
  const cleanRequest = request.trim();
  if (!attributes) return cleanRequest;

  const promptParts = [
    'name ' + attributes.name,
    'gender ' + attributes.gender,
    'age ' + attributes.age,
    attributes.job ? 'job ' + attributes.job : '',
    attributes.birth ? 'birthplace ' + attributes.birth : '',
    attributes.additional ? 'personality ' + attributes.additional : '',
    attributes.hobby ? 'hobby ' + attributes.hobby : '',
    attributes.goal ? 'goal ' + attributes.goal : '',
    'high quality 3d digital human, full body, clear face, matching costume, natural standing pose'
  ].filter(Boolean);

  return promptParts.join(', ');
};

const DEFAULT_CHARACTER_REFERENCE = '他';

const normalizeExtractedCharacterName = (rawName: string) => {
  const cleaned = rawName
    .replace(/[“”"'《》【】「」]/g, '')
    .replace(/\s+/g, '')
    .replace(/^(?:一个新的|一个新|一个|一位|一名|新的|新|这个|那个|这位|那位)+/, '')
    .replace(/(?:角色|形象|数字人|人物|伙伴|小伙伴)$/g, '')
    .trim();

  if (!cleaned) return '';
  if (/^(?:他|她|它|ta)$/i.test(cleaned)) return '';
  if (/^(?:这个角色|那个角色|该角色|这个人物|那个人物|该人物|这个人|那个人|角色|人物|形象|数字人|新角色)$/.test(cleaned)) {
    return '';
  }

  return cleaned;
};

const extractCharacterNameFromRequest = (request: string) => {
  const trimmed = request.trim();
  if (!trimmed) return '';

  const patterns = [
    /(?:角色|形象|数字人|人物)\s*([^\s，。,.！？!?]{1,12}?)(?=我想|想和|想跟|想与|和|跟|与|对话|聊天|交流|$)/,
    /我想和(.+?)(?:对话|聊天|交流)/,
    /我想跟(.+?)(?:对话|聊天|交流)/,
    /我想与(.+?)(?:对话|聊天|交流)/,
    /请帮我生成(.+?)(?:角色|形象|数字人|人物)/,
    /创建(.+?)(?:角色|形象|数字人|人物)/,
    /生成(.+?)(?:角色|形象|数字人|人物)/,
    /和(.+?)(?:对话|聊天|交流)/,
    /跟(.+?)(?:对话|聊天|交流)/,
    /与(.+?)(?:对话|聊天|交流)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const normalizedName = normalizeExtractedCharacterName(match[1]);
      if (normalizedName) {
        return normalizedName;
      }
    }
  }

  return '';
};

const normalizeCharacterReferenceText = (text: string, preferredName?: string) => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const resolvedName =
    normalizeExtractedCharacterName(preferredName || '') ||
    extractCharacterNameFromRequest(trimmed) ||
    DEFAULT_CHARACTER_REFERENCE;

  return trimmed
    .replace(/这个角色|该角色|这个人物|该人物|这个人|那个人|那个人物|这位角色|那位角色/g, resolvedName)
    .replace(/([和跟与])(他|她|它|ta)(?=(对话|聊天|交流|互动))/gi, `$1${resolvedName}`)
    .replace(/([帮替为让])(他|她|它|ta)(?=(创建|生成|做|绑定|准备))/gi, `$1${resolvedName}`);
};

const isCharacterGenerationIntent = (request: string, hasImage: boolean, hasModel: boolean) => {
  if (hasImage || hasModel) return true;

  const trimmed = request.trim();
  if (!trimmed) return false;

  const nonCreationQuestionPatterns = [
    /什么模型/,
    /啥模型/,
    /哪个模型/,
    /哪种模型/,
    /^你是.+模型/,
    /^你用.+模型/,
    /^你是什么/,
  ];
  if (nonCreationQuestionPatterns.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  const directIntentPatterns = [
    /我想[和跟].+?(对话|聊天|交流)/,
    /帮我.+?(创建|生成).+?(角色|形象|数字人|人物)/,
    /(创建|生成).+?(角色|形象|数字人|人物)/,
    /(做|搞)一个.+?(角色|形象|数字人|人物)/,
    /(扮演|变成).+?(角色|人物)/,
    /和.+?(对话|聊天|交流)/,
  ];

  if (directIntentPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  const namedCharacterHints = ['孔子', '老子', '庄子', '孟子'];
  return namedCharacterHints.some((keyword) => trimmed.includes(keyword));
};

const getCharacterCreationClarification = (request: string, hasImage: boolean, hasModel: boolean) => {
  if (hasImage || hasModel) return null;

  const trimmed = request.trim();
  if (!trimmed || !isCharacterGenerationIntent(trimmed, hasImage, hasModel)) {
    return null;
  }

  const extractedName = extractCharacterNameFromRequest(trimmed);
  if (extractedName) {
    return null;
  }

  const genericPatterns = [
    /^帮我?(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?(吗)?[呀啊呢哦?？!！\s]*$/,
    /^可以帮我?(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?(吗)?[呀啊呢哦?？!！\s]*$/,
    /^我想(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[呀啊呢哦?？!！\s]*$/,
    /^(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[呀啊呢哦?？!！\s]*$/,
  ];

  if (!genericPatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  return '好呀～我们先一起想清楚要做什么样的小伙伴。你可以说说名字、性格、长什么样子，也可以直接上传一张喜欢的图片，我会认真听的。';
};

const findExistingCompanionForRequest = (companions: Companion[], request: string) => {
  const characterName = extractCharacterNameFromRequest(request);
  if (!characterName) return null;

  const normalized = characterName.toLowerCase();
  return companions.find((item) => {
    const haystacks = [
      item.name,
      item.role,
      item.characterDescription,
      item.characterAttributes?.name,
    ]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());

    return haystacks.some((value) => value.includes(normalized) || normalized.includes(value));
  }) || null;
};

const getMiniGameRecommendation = (request: string): MiniGameRecommendation | null => {
  const text = request.toLowerCase();

  const matches = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

  if (matches(['烦', '好愁', '烦死了', '不开心', '无聊'])) {
    return {
      gameId: 'emotion',
      gameName: '表情识别',
      reason: '你可以先看看表情、认一认现在的感觉，这样通常会轻松一点。',
      prompt: '如果你觉得有点烦，先玩一个轻松的情绪小游戏会更合适。',
    };
  }

  if (matches(['生气', '烦躁', '发脾气', '情绪不好', '难过', '郁闷', '紧张', '委屈', '心情不好', '情绪低落'])) {
    return {
      gameId: 'emotion',
      gameName: '表情识别',
      reason: '你可以先看看表情、认一认现在的感觉，这样通常会轻松一点。',
      prompt: '如果你现在有点难受、烦躁，先玩一个轻松的情绪小游戏会更合适。',
    };
  }

  if (matches(['不想说话', '社交', '朋友', '误会', '沟通', '相处', '怎么表达', '怎么安慰'])) {
    return {
      gameId: 'wisdom',
      gameName: '智慧问答',
      reason: '这个游戏会慢慢帮你看懂情境，也能练习怎么表达自己。',
      prompt: '如果你现在不想说太多，可以先做一个温和的小练习。',
    };
  }

  if (matches(['注意力', '不专心', '专注', '坐不住', '分心', '走神', '控制力', '冲动'])) {
    return {
      gameId: 'shulte',
      gameName: '舒尔特方格',
      reason: '这个游戏比较短，适合先把注意力慢慢收回来。',
      prompt: '如果你现在有点坐不住，先玩一个专注力小游戏可能会更舒服。',
    };
  }

  if (matches(['记不住', '记忆', '记性差', '空间记忆', '老忘', '位置'])) {
    return {
      gameId: 'memory',
      gameName: '位置记忆',
      reason: '它会一步一步练习记住位置，节奏也很清楚。',
      prompt: '如果你想练习记忆，这个小游戏会比较适合你。',
    };
  }

  if (matches(['逻辑', '真假', '判断', '推理', '会不会', '是不是对', '是不是错'])) {
    return {
      gameId: 'truth-false',
      gameName: '真假判断',
      reason: '它会用很清楚的对和错来帮你慢慢想明白。',
      prompt: '你可以先试试这个判断小游戏，让思路先稳下来。',
    };
  }

  if (matches(['原因', '为什么', '因果', '结果', '导致'])) {
    return {
      gameId: 'causality',
      gameName: '因果推断',
      reason: '这个游戏会帮你看清楚什么是原因、什么是结果。',
      prompt: '如果你想弄明白「为什么会这样」，可以先玩这个小游戏。',
    };
  }

  if (matches(['数学', '计算', '加减', '数字'])) {
    return {
      gameId: 'sequence',
      gameName: '序列排列',
      reason: '它会带你先找数字规律，节奏比较轻，不会太累。',
      prompt: '如果你想从数字开始热身，可以先玩这个小游戏。',
    };
  }

  return null;
};

const buildHomeAgentTaskSummary = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '目前没有角色正在创建或绑骨中。';
  }

  const summaries = runningTasks.slice(0, 3).map((task) => {
    const matchedCompanion = task.companionId
      ? companions.find((item) => item.id === task.companionId || item.model_id === task.companionId)
      : null;
    const taskName = matchedCompanion?.name || task.companionName || '角色';
    const phase = task.type === 'generate' ? '创建或互动准备' : '自动绑骨';
    const hint = task.detail?.trim() ? `（当前步骤：${task.detail.trim()}）` : `（阶段：${phase}）`;
    return `${taskName}${hint}`;
  });

  return `【后台任务事实，供你组织语言】${summaries.join('；')}。说话要像对小朋友一样：温柔、短句、好懂，多用「呀」「呢」「我们」也可以，但不要装小宝宝腔。有任务时照常陪聊；若问进度、到哪了、怎么回事，用一两句把当前步骤讲清楚，并轻轻安慰「我在陪着你等」之类，不要冷冰冰推脱。不要编造未列出的任务。`;
};

const isTaskStatusQuery = (request: string) => {
  const trimmed = request.trim();
  if (!trimmed) return false;

  const patterns = [
    /现在有任务吗/,
    /当前有任务吗/,
    /还有任务吗/,
    /有没有任务/,
    /是否有任务/,
    /任务完成了吗/,
    /还有后台任务吗/,
    /现在还在创建吗/,
    /还在创建中吗/,
    /还在处理吗/,
    /进度怎么样/,
    /现在什么状态/,
    /现在到哪了/,
    /到哪一步/,
    /哪一步了/,
    /好了吗/,
    /完成了吗/,
    /结束了吗/,
    /怎么回事/,
    /咋回事/,
    /啥情况/,
    /什么状况/,
    /卡住了吗/,
    /是不是卡住/,
  ];

  return patterns.some((pattern) => pattern.test(trimmed));
};

const buildTaskStatusReply = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '现在没有正在忙的后台小任务哦，你想聊什么都可以跟我说～';
  }

  const lines = runningTasks.slice(0, 3).map((task) => {
    const matchedCompanion = task.companionId
      ? companions.find((item) => item.id === task.companionId || item.model_id === task.companionId)
      : null;
    const taskName = matchedCompanion?.name || task.companionName || '角色';
    const phase = task.type === 'generate' ? '创建和互动准备' : '自动绑骨';
    const step = task.detail?.trim();
    return step ? `${taskName}：${step}` : `${taskName}：正在${phase}`;
  });

  return `我帮你看了一下，现在有 ${runningTasks.length} 件事正在后台悄悄进行：\n\n${lines.join('\n')}\n\n我会一直陪你看进度，你也可以继续和我聊天呀。`;
};

const buildBusyTaskFallbackReply = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '我在呢～现在没有后台任务在跑，你想聊什么都可以，也可以说想做什么样的角色，我帮你一起想。';
  }

  const primaryTask = runningTasks[0];
  const matchedCompanion = primaryTask.companionId
    ? companions.find((item) => item.id === primaryTask.companionId || item.model_id === primaryTask.companionId)
    : null;
  const taskName = matchedCompanion?.name || primaryTask.companionName || '这个角色';
  const phase = primaryTask.type === 'generate' ? '生成和准备' : '绑骨';

  return `${taskName} 还在后台悄悄${phase}，我会帮你一直看着的，别着急。你也可以继续在这里跟我聊天；如果想问进度，发一句「现在有任务吗」，我马上告诉你～`;
};

const buildConversationalTaskFallbackReply = (
  request: string,
  tasks: BackgroundTask[],
  companions: Companion[],
) => {
  const trimmed = request.trim();
  if (isTaskStatusQuery(trimmed)) {
    return buildTaskStatusReply(tasks, companions);
  }
  const runningTasks = tasks.filter((task) => task.status === 'running');
  const primaryTask = runningTasks[0];
  const matchedCompanion = primaryTask?.companionId
    ? companions.find((item) => item.id === primaryTask.companionId || item.model_id === primaryTask.companionId)
    : null;
  const taskName = matchedCompanion?.name || primaryTask?.companionName || '这个角色';

  if (/^(你好|嗨|哈喽|在吗)[呀啊吗呢?？!！\s]*$/.test(trimmed)) {
    return runningTasks.length > 0
      ? `我在呀～${taskName} 还在后台慢慢做好，不过你随时都可以跟我聊天，我会陪着你的。`
      : '嗨，我在呢～想聊什么都可以跟我说哦。';
  }

  if (/介绍一下自己|你是谁|你是做什么的/.test(trimmed)) {
    return runningTasks.length > 0
      ? `我是首页小助手，会陪你一起想出喜欢的角色、上传图片或模型，再带你去绑定和互动页。现在 ${taskName} 还在后台准备中，你也可以继续跟我讲话，不用等它结束～`
      : '我是首页小助手，会温柔地听你说，帮你做 3D 小伙伴、上传图片或模型，再带你去绑定和聊天页面。';
  }

  // 「介绍系统」等与后台任务无关的常识问答：超时时勿误用「还在生成」话术（原仅匹配「介绍自己」会漏掉）
  if (
    /介绍.{0,6}系统|系统是(什么|做|干)|什么功能|能做什么|怎么用|SoulLink|虚拟陪伴|数字人系统/i.test(
      trimmed,
    )
  ) {
    const base =
      '这是一个可以做出「会说话的 3D 小伙伴」的系统：你在首页用说话或传图片，就能创建角色，后台会帮忙绑好骨骼，然后到「互动」里就能和它聊天啦。下面一排按钮有生成、绑定、互动、管理，像小地图一样带你走。';
    if (runningTasks.length > 0) {
      return `${base}\n\n另外，${taskName} 还在后台慢慢做好；想随时看进度，可以发「现在有任务吗」，我告诉你～`;
    }
    return base;
  }

  return buildBusyTaskFallbackReply(tasks, companions);
};

const HomeAgentPage: React.FC<{
  companion: Companion | null;
  companions: Companion[];
  tasks: BackgroundTask[];
  addCompanion: (c: Companion) => Promise<void>;
  switchCompanion: (id: string) => Promise<void>;
  updateCompanionById: (companionId: string, updates: Partial<Companion>) => Promise<void>;
  createTask: (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (taskId: string, updater: Partial<BackgroundTask> | ((task: BackgroundTask) => BackgroundTask)) => void;
  finishTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void;
  failTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void;
}> = ({
  companion,
  companions,
  tasks,
  addCompanion,
  switchCompanion,
  updateCompanionById,
  createTask,
  updateTask,
  finishTask,
  failTask,
}) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<HomeAgentMessage[]>(() => {
    try {
      const raw = localStorage.getItem(HOME_AGENT_MESSAGES_KEY);
      if (!raw) return getDefaultHomeAgentMessages();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return getDefaultHomeAgentMessages();
      }
      return hasLegacyPersonaLeak(parsed) ? getDefaultHomeAgentMessages() : parsed;
    } catch {
      return getDefaultHomeAgentMessages();
    }
  });
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [uploadedModelFile, setUploadedModelFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const previousTaskStatusesRef = useRef<Record<string, BackgroundTaskStatus>>({});
  const homeTaskFeedbackHandledRef = useRef<Set<string>>(new Set());

  const appendMessage = useCallback((message: Omit<HomeAgentMessage, 'id'>) => {
    setMessages((prev) => [
      ...prev,
      {
        ...message,
        id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      },
    ]);
  }, []);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(HOME_AGENT_MESSAGES_KEY, JSON.stringify(messages.slice(-50)));
  }, [messages]);

  useEffect(() => {
    const previousStatuses = previousTaskStatusesRef.current;
    const nextStatuses: Record<string, BackgroundTaskStatus> = {};

    tasks.forEach((task) => {
      nextStatuses[task.id] = task.status;
      const previousStatus = previousStatuses[task.id];
      const becameFinished =
        previousStatus === 'running' && (task.status === 'success' || task.status === 'error');

      if (!becameFinished) {
        return;
      }

      if (homeTaskFeedbackHandledRef.current.has(task.id)) {
        return;
      }

      if (task.status === 'success') {
        appendMessage({
          role: 'assistant',
          text: task.detail,
          action: task.targetPath
            ? {
                label: task.targetPath === '/bind' ? '前往绑定页' : '进入 3D 互动',
                type: 'navigate',
                path: task.targetPath,
                companionId: task.companionId,
              }
            : undefined,
        });
        return;
      }

      appendMessage({
        role: 'assistant',
        text: task.detail,
        action: task.targetPath
          ? {
              label: task.targetPath === '/bind' ? '前往绑定页' : '查看任务',
              type: 'navigate',
              path: task.targetPath,
              companionId: task.companionId,
            }
          : undefined,
      });
    });

    previousTaskStatusesRef.current = nextStatuses;
  }, [appendMessage, tasks]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      appendMessage({
        role: 'assistant',
        text: '这张格式我暂时读不了哦，换一张 PNG、JPG 或 WEBP 的图片试试，好吗？',
      });
      return;
    }

    setUploadedImageFile(file);
    setUploadedModelFile(null);
    appendMessage({
      role: 'assistant',
      text: `图片收到啦「${file.name}」～你可以说「我想和这个角色对话」，也可以讲讲你希望它长什么样、什么性格，我帮你记下来。`,
    });
  };

  const handleModelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.glb', '.gltf', '.fbx'];
    const lowerName = file.name.toLowerCase();
    if (!validExtensions.some((ext) => lowerName.endsWith(ext))) {
      appendMessage({
        role: 'assistant',
        text: '这个文件类型我还不会用哦，换 .glb、.gltf 或 .fbx 的模型再试一次，好吗？',
      });
      return;
    }

    setUploadedModelFile(file);
    setUploadedImageFile(null);
    appendMessage({
      role: 'assistant',
      text: `模型收到啦「${file.name}」～你可以说「帮我绑定并和这个角色对话」，我会悄悄帮你做绑骨和动作准备，你也可以继续跟我聊天。`,
    });
  };

  const handleActionClick = async (action: NonNullable<HomeAgentMessage['action']>) => {
    if (action.companionId) {
      await switchCompanion(action.companionId);
    }
    navigate(action.path);
  };

  const handleDirectToChat = async (targetCompanion: Companion) => {
    await switchCompanion(targetCompanion.id);

    appendMessage({
      role: 'assistant',
      text: targetCompanion.isBound
        ? `已经帮你选好啦，现在是 ${targetCompanion.name}，点下面按钮就能去和它聊天啦～`
        : `找到 ${targetCompanion.name} 啦，不过它还要再完成一下绑定。我们先去绑定页把它打扮好，好吗？`,
      action: {
        label: targetCompanion.isBound ? '进入 3D 互动' : '进入绑定页',
        type: 'navigate',
        path: targetCompanion.isBound ? '/chat' : '/bind',
        companionId: targetCompanion.id,
      },
    });
  };

  const handleGenerateCharacter = (requestText: string) => {
    const existingCompanion = findExistingCompanionForRequest(companions, requestText);
    if (existingCompanion) {
      void handleDirectToChat(existingCompanion);
      return;
    }

    const extractedName = extractCharacterNameFromRequest(requestText);
    const displayName = extractedName || DEFAULT_CHARACTER_REFERENCE;
    const modelNameFallback = extractedName || '新角色';
    const imageFile = uploadedImageFile;
    const modelFile = uploadedModelFile;
    const taskId = createTask({
      type: 'generate',
      status: 'running',
      title: `正在为你创建 ${displayName}`,
      detail: '任务已加入后台，正在整理角色设定。',
      companionName: displayName,
      targetPath: '/chat',
      seen: true,
    });

    appendMessage({
      role: 'assistant',
      text: modelFile
        ? `收到啦～我会用你上传的模型，悄悄帮 ${displayName} 做好绑骨和互动准备。你在后台跑任务的时候也可以继续跟我聊天，我会陪着你的。`
        : imageFile
        ? `收到啦～我会参考你的图片，慢慢把 ${displayName} 做出来。任务在后台进行，你可以一边等一边跟我讲话，不用干等着。`
        : `好呀～我会帮你创建 ${displayName}，剩下的步骤在后台进行。你想聊什么都可以跟我说，我会在这里陪你。`,
    });

    setUploadedImageFile(null);
    setUploadedModelFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (modelInputRef.current) {
      modelInputRef.current.value = '';
    }

    /** 创建成功后的 model_id，供 auto_rig 404 时跳转绑定页使用（与 Companion.id 一致） */
    let createdModelId: string | null = null;

    void (async () => {
      try {
        updateTask(taskId, { detail: '正在生成角色属性…' });
        const attributes = await characterService.generateAttributes(requestText, `agent_${Date.now()}`);
        const normalizedCharacterDescription = normalizeCharacterReferenceText(
          requestText,
          attributes?.name || extractedName
        );
        const modelPrompt = buildAgentModelPrompt(requestText, attributes);

        let modelServerUrl = '';
        if (modelFile) {
          updateTask(taskId, { detail: '正在上传你提供的 3D 模型…' });
          modelServerUrl = await modelService.uploadModel(modelFile, undefined, 'source', displayName);
        } else {
          updateTask(taskId, {
            detail: imageFile ? '正在根据上传图片生成 3D 模型…' : '正在根据你的描述生成 3D 模型…'
          });

          const generationResult = imageFile
            ? await generateModelFromImage(imageFile, {
                seed: 1234,
                octree_resolution: 512,
                num_inference_steps: 80,
                guidance_scale: 7.5,
                texture: true,
                type: 'glb',
                face_count: 40000,
              })
            : await generateModelFromText(modelPrompt, {
                seed: 1234,
                octree_resolution: 512,
                num_inference_steps: 80,
                guidance_scale: 7.5,
                texture: true,
                type: 'glb',
                face_count: 40000,
              });

          if (!generationResult.success || !generationResult.serverUrl) {
            throw new Error(generationResult.error || '3D 模型生成失败');
          }
          modelServerUrl = generationResult.serverUrl;
        }

        updateTask(taskId, { detail: '3D 模型已生成，正在创建角色数据…' });
        const modelId = await modelService.createModel({
          name: attributes?.name || modelNameFallback,
          description: attributes?.position || requestText,
          character_description: normalizedCharacterDescription,
          attribute_json: attributes,
          model3d_url: modelServerUrl,
          username: 'User',
          is_global: 0,
        });
        createdModelId = modelId;

        const backendModel = await modelService.getModelDetail(modelId);
        const newCompanion = modelService.modelToCompanion(backendModel);
        await addCompanion(newCompanion);

        updateTask(taskId, {
          companionId: modelId,
          companionName: newCompanion.name,
          detail: '角色已创建，正在自动绑骨和准备动作。',
        });

        await modelService.autoRigModel(modelId);
        const riggedModel = await modelService.getModelDetail(modelId);
        const riggedCompanion = modelService.modelToCompanion(riggedModel);
        await updateCompanionById(modelId, {
          model3dUrl: riggedCompanion.model3dUrl,
          idleModelUrl: riggedCompanion.idleModelUrl,
          talkingModelUrl: riggedCompanion.talkingModelUrl,
          waveModelUrl: riggedCompanion.waveModelUrl,
          isBound: !!(riggedCompanion.idleModelUrl || riggedCompanion.talkingModelUrl),
          characterAttributes: riggedCompanion.characterAttributes || attributes,
          characterDescription: normalizedCharacterDescription,
        });
        await switchCompanion(modelId);

        // 仅 finishTask：完成态由下方 useEffect 统一插入一条助手消息（含按钮），避免与 appendMessage 重复
        finishTask(taskId, `${riggedCompanion.name} 已经准备好啦，可以点下面按钮去跟 TA 聊天喽～`, {
          companionId: modelId,
          companionName: riggedCompanion.name,
          targetPath: '/chat',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        const missingAutoRigEndpoint =
          error instanceof Error && error.message.includes('/api/models/auto_rig');

        if (missingAutoRigEndpoint) {
          try {
            if (createdModelId) {
              await switchCompanion(createdModelId);
            }

            homeTaskFeedbackHandledRef.current.add(taskId);
            failTask(taskId, `自动绑骨接口不可用，已保留生成结果，可转到绑定页继续。`, {
              companionId: createdModelId ?? undefined,
              targetPath: '/bind',
            });

            appendMessage({
              role: 'assistant',
              text: '模型已经做好啦，不过这一边暂时不能自动绑骨。别担心，角色和文件我都帮你留着了，点下面去绑定页，像「上传模型去绑定」那样一步一步来就好，我会陪着你。',
              action: {
                label: '前往绑定页',
                type: 'navigate',
                path: '/bind',
                companionId: createdModelId ?? undefined,
              },
            });
            return;
          } catch (fallbackError) {
            console.error('[App] 自动绑骨接口缺失后的兜底处理失败:', fallbackError);
          }
        }

        homeTaskFeedbackHandledRef.current.add(taskId);
        failTask(taskId, `创建失败：${errorMessage}`, {
          targetPath: '/create',
        });
        appendMessage({
          role: 'assistant',
          text: `这次没有成功，可能是：${errorMessage}。没关系的，我们休息一下再试，或者先去生成页慢慢做一个也可以～`,
          action: {
            label: '打开生成页',
            type: 'navigate',
            path: '/create',
          },
        });
      }
    })();
  };

  const handleGenericAgentReply = async (requestText: string) => {
    if (isTaskStatusQuery(requestText)) {
      appendMessage({
        role: 'assistant',
        text: buildTaskStatusReply(tasks, companions),
      });
      return;
    }

    const history = messages
      .filter((item) => !item.action)
      .slice(-8)
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: item.text,
      }));
    const taskSummary = buildHomeAgentTaskSummary(tasks, companions);
    const hasRunningTasks = tasks.some((t) => t.status === 'running');
    // 后台跑图生/绑骨时本机或服务端往往更慢，10s 内 LLM 常回不来 → 用户看到「还在生成」机械话；拉长等待
    const llmWaitMs = hasRunningTasks ? 45000 : 15000;

    let reply = '';
    try {
      reply = await Promise.race([
        chatWithAgentAssistant(
          history,
          requestText,
          `你是「情智兼备的虚拟陪伴生成与互动系统」的首页大模型助手。回复风格要简洁、直接、自然，用正常中文短句回答，优先先说结论，再补一句必要说明。一般控制在1到3句、40到90个字，不要长篇抒情，不要散文化，不要主动分段列标题，不要把普通回复包装成“角色请求已就绪”，也不要乱加emoji。你的职责是陪用户聊天、回答问题，并在用户明确表达“要创建/生成/做一个人物角色”时，帮助他整理可生成的人物请求。支持原创人物、历史人物、名人风格化形象，但仍然只支持人物角色，不支持普通物体；如果用户只是闲聊、讨论提示词、描述画面，或单纯贴来一段prompt，没有明确说要生成，就不要直接触发创建流程，而是先确认他是否要拿这段描述生成一个人物。若用户难过、着急、害怕，先简短接住情绪，再给一个清楚的下一步。${taskSummary}`,
        ),
        new Promise<string>((_, reject) => {
          window.setTimeout(() => reject(new Error('home_agent_timeout')), llmWaitMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === 'home_agent_timeout') {
        reply = buildConversationalTaskFallbackReply(requestText, tasks, companions);
      } else {
        throw error;
      }
    }

    appendMessage({
      role: 'assistant',
      text: reply,
    });
  };

  const handleGenericAgentReplyWithRecommendation = async (requestText: string) => {
    const recommendation = getMiniGameRecommendation(requestText);
    setIsProcessing(true);
    try {
      await handleGenericAgentReply(requestText);

      if (recommendation) {
        appendMessage({
          role: 'assistant',
          text: `${recommendation.prompt}\n\n要不要先玩一小会儿「${recommendation.gameName}」呀？${recommendation.reason}`,
          action: {
            label: `去玩${recommendation.gameName}`,
            type: 'navigate',
            path: `/mini-game/${recommendation.gameId}`,
          },
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const submitHomeRequest = async (rawText?: string) => {
    const requestText = (rawText ?? input).trim();
    if (!requestText || isProcessing) return;

    appendMessage({
      role: 'user',
      text: uploadedModelFile
        ? `${requestText}\n[已附带模型：${uploadedModelFile.name}]`
        : uploadedImageFile
          ? `${requestText}\n[已附带图片：${uploadedImageFile.name}]`
          : requestText,
    });
    setInput('');

    try {
      if (requestText.includes('进入互动') || requestText.includes('进入聊天') || requestText.includes('开始互动')) {
        if (companion) {
          await handleDirectToChat(companion);
        } else {
          appendMessage({
            role: 'assistant',
            text: '现在还没有做好的小伙伴可以聊天呢～你可以跟我说「我想和孔子对话」之类的，我帮你一起做一个出来。',
          });
        }
        return;
      }

      if (isCharacterGenerationIntent(requestText, !!uploadedImageFile, !!uploadedModelFile)) {
        const clarification = getCharacterCreationClarification(
          requestText,
          !!uploadedImageFile,
          !!uploadedModelFile,
        );
        if (clarification) {
          appendMessage({
            role: 'assistant',
            text: clarification,
          });
          return;
        }
        handleGenerateCharacter(requestText);
        return;
      }

      await handleGenericAgentReply(requestText);
    } catch (error) {
      appendMessage({
        role: 'assistant',
        text: `哎呀，刚刚有点小状况：${error instanceof Error ? error.message : '未知错误'}。没关系，我们休息一下再试，或者换一句话跟我说也可以～`,
      });
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    await submitHomeRequest();
  };

  const toggleHomeListening = async () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore stop error
        }
        recognitionRef.current = null;
      } else {
        try {
          const audioBlob = await audioService.stopRecording();
          if (audioBlob) {
            const transcript = await audioService.uploadAndRecognize(audioBlob, companion?.name || 'User');
            if (transcript && transcript.trim()) {
              await submitHomeRequest(transcript);
            }
          }
        } catch (error) {
          alert(`语音识别失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }
      setIsListening(false);
      return;
    }

    const useCapacitorRecorder = isCapacitor();
    if (useCapacitorRecorder) {
      try {
        await audioService.startRecording();
        setIsListening(true);
      } catch (error) {
        alert(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const results = Array.from(event.results);
        const transcript = results
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
        const lastResult = results[results.length - 1];
        if (transcript && lastResult?.isFinal) {
          void submitHomeRequest(transcript);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onerror = async (event: any) => {
        console.error('[HomeAgentPage] Web Speech API error:', event?.error);
        recognitionRef.current = null;
        setIsListening(false);
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          alert('麦克风权限被拒绝，请允许访问麦克风。');
          return;
        }

        try {
          await audioService.startRecording();
          setIsListening(true);
        } catch (error) {
          alert(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      return;
    }

    try {
      await audioService.startRecording();
      setIsListening(true);
    } catch (error) {
          alert(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleClearHomeChat = () => {
    localStorage.removeItem(HOME_AGENT_MESSAGES_KEY);
    setMessages(getDefaultHomeAgentMessages());
    setInput('');
    setUploadedImageFile(null);
    setUploadedModelFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (modelInputRef.current) {
      modelInputRef.current.value = '';
    }
  };

  const quickActions = [
    { label: '和孔子对话', prompt: '我想和孔子对话' },
    { label: '和老子对话', prompt: '我想和老子对话' },
    { label: '上传图片建角色', prompt: '我想和这个角色对话' },
    { label: '上传模型去绑定', prompt: '帮我绑定并和这个角色对话' },
  ];

  return (
    <PageContainer className="flex flex-col h-[calc(100dvh-72px-env(safe-area-inset-bottom))] min-h-0 overflow-hidden px-3 pt-0.5 pb-1 md:h-[calc(100dvh-64px)] md:max-h-[calc(100dvh-64px)] md:min-h-0 md:max-w-[1400px] md:overflow-hidden md:px-6 md:pt-1 md:pb-8">
      <div className="text-center pt-0 mb-2 md:pt-1 md:mb-4 shrink-0">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 leading-tight drop-shadow-lg">
          情智兼备的
          <br />
          虚拟陪伴生成与互动系统
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.9fr_1fr] flex-1 min-h-0">
        <div className="glass-panel rounded-3xl px-4 pb-1 pt-2 md:px-5 md:pb-3 md:pt-3 flex flex-col flex-1 min-h-0 h-full">
          <div className="flex items-center justify-end mb-1 md:mb-2">
            <div className="rounded-full bg-white/60 p-2 text-gray-600 flex items-center gap-2">
              <Sparkles size={14} className="text-purple-500" />
            </div>
          </div>

          <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-primary to-secondary text-white'
                      : 'bg-white/85 text-gray-800 border border-pink-100/70'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                  {message.action && (
                    <button
                      type="button"
                      onClick={() => handleActionClick(message.action!)}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-pink-300/80 bg-white/95 px-4 py-2 text-xs font-semibold text-gray-800 shadow-sm ring-1 ring-pink-200/40 transition-colors hover:border-secondary/60 hover:bg-gradient-to-r hover:from-primary/15 hover:to-secondary/15"
                    >
                      <MessageCircle size={14} className="shrink-0 text-secondary" />
                      {message.action.label}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-white/85 text-gray-800 border border-pink-100/70 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity size={14} className="animate-pulse text-purple-500" />
                    正在帮你想一想，稍等一小下哦…
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 shrink-0 md:mt-4">
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => {
                    setInput(action.prompt);
                    if (action.label === '上传图片建角色') {
                      fileInputRef.current?.click();
                    }
                    if (action.label === '上传模型去绑定') {
                      modelInputRef.current?.click();
                    }
                  }}
                  className="shrink-0 rounded-full border border-white/50 bg-white/70 px-3 py-2 text-xs text-gray-700 hover:bg-white transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>

          </div>

          <div className="mt-2 space-y-2 shrink-0 md:mt-3">
            {uploadedImageFile && (
              <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-700">
                <span>已附加图片：{uploadedImageFile.name}</span>
                <button onClick={() => setUploadedImageFile(null)} className="text-blue-500 hover:text-blue-700">
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadedModelFile && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
                <span>已附加模型：{uploadedModelFile.name}</span>
                <button onClick={() => setUploadedModelFile(null)} className="text-emerald-500 hover:text-emerald-700">
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="rounded-3xl border border-white/50 bg-white/80 p-2 shadow-inner">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="例如：我想和孔子聊聊天，或者先传一张图，再说想和图里的角色做朋友～"
                className="w-full min-h-[28px] md:min-h-[52px] resize-none bg-transparent text-sm leading-6 text-gray-800 placeholder:text-gray-400 focus:outline-none"
              />
              <div className="mt-1.5 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={`!text-gray-700 hover:!bg-gray-200 !px-3 !py-1 text-sm rounded-2xl ${isListening ? '!bg-rose-100 !text-rose-600' : '!bg-gray-100'}`}
                    onClick={() => void toggleHomeListening()}
                  >
                    <Mic size={16} />
                    {isListening ? '结束语音' : '语音输入'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <input
                    ref={modelInputRef}
                    type="file"
                    accept=".glb,.gltf,.fbx"
                    className="hidden"
                    onChange={handleModelUpload}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-gray-700 !bg-gray-100 hover:!bg-gray-200 !px-3 !py-1 text-sm rounded-2xl"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon size={16} />
                    上传图片
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-gray-700 !bg-gray-100 hover:!bg-gray-200 !px-3 !py-1 text-sm rounded-2xl"
                    onClick={() => modelInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    上传模型
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-gray-500 !px-2 !py-0 text-sm"
                    onClick={() => navigate('/mini-game')}
                  >
                    <Activity size={16} />
                    小游戏
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-gray-500 !px-2 !py-0 text-sm"
                    onClick={() => navigate('/create')}
                  >
                    <Sparkles size={16} />
                    打开传统生成页
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-gray-500 !px-2 !py-0 text-sm"
                    onClick={handleClearHomeChat}
                  >
                    <Trash2 size={16} />
                    清空首页对话
                  </Button>
                </div>
                <Button onClick={handleSubmit} isLoading={isProcessing} className="w-full h-7 shrink-0 rounded-xl text-sm">
                  <Send size={16} />
                  发送
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden md:block space-y-4 md:min-h-0 md:overflow-y-auto md:pr-1">
          <div className="glass-panel rounded-3xl p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">首页说明</p>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                首页这里主要帮你理解需求、回答问题，或者帮你发起角色创建、模型处理和互动准备。
              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                当你进入 3D 互动页后，系统才会切换到具体角色，并开始按对应角色进行互动展示。
              </div>
              {companion && (
                <Button
                  variant="outline"
                  className="w-full !text-gray-700 !border-gray-200 hover:!bg-white"
                  onClick={() => navigate(companion.isBound ? '/chat' : '/bind')}
                >
                  {companion.isBound ? '进入已有 3D 互动' : '继续已有绑定流程'}
                </Button>
              )}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">首页能做什么</p>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                1. 理解你的需求，判断你是想直接聊天、创建角色，还是进入绑定与互动流程。
              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                2. 支持文生 3D、图生 3D、上传图片建角色，也可以直接上传模型继续处理。
              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                3. 自动完成角色保存、绑骨与动作准备，并引导你进入 3D 互动页。
              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                4. 提供趣味小游戏入口，比如问答、识别、判断、记忆和反应类互动内容。
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

const CreatePage: React.FC<{
  addCompanion: (c: Companion) => Promise<void>;
  createTask: (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTask: (taskId: string, updater: Partial<BackgroundTask> | ((task: BackgroundTask) => BackgroundTask)) => void;
  finishTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void;
  failTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void;
}> = ({ addCompanion, createTask, updateTask, finishTask, failTask }) => {
  const QUALITY_PRESETS = {
    high: { label: '高质量', octreeResolution: 1024, numInferenceSteps: 150, guidanceScale: 8.0 },
    medium: { label: '中质量', octreeResolution: 512, numInferenceSteps: 100, guidanceScale: 8.0 },
    low: { label: '低质量', octreeResolution: 256, numInferenceSteps: 50, guidanceScale: 8.0 },
  } as const;

  const [step, setStep] = useState<1 | 2>(1);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  // 生成参数状态
  const [generateTexture, setGenerateTexture] = useState(true); // 默认生成纹理
  const [selectedQuality, setSelectedQuality] = useState<keyof typeof QUALITY_PRESETS>('high');
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [octreeResolution, setOctreeResolution] = useState(QUALITY_PRESETS.high.octreeResolution);
  const [numInferenceSteps, setNumInferenceSteps] = useState(QUALITY_PRESETS.high.numInferenceSteps);
  const [guidanceScale, setGuidanceScale] = useState(QUALITY_PRESETS.high.guidanceScale);
  
  // 角色描述相关状态
  const [characterDescription, setCharacterDescription] = useState('');
  const [isGeneratingAttributes, setIsGeneratingAttributes] = useState(false);
  const createFlowInFlightRef = useRef(false);
  const [characterAttributes, setCharacterAttributes] = useState<CharacterAttributes | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Voice Recognition Logic
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('您的浏览器不支持语音识别功能');
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;
      
      recognition.onstart = () => setIsListening(true);
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');
        setCharacterDescription(transcript);
        setCharacterAttributes(null);
      };
      
      recognition.onend = () => setIsListening(false);
      recognition.start();
      recognitionRef.current = recognition;
    }
  };

  // Model Upload Logic - 上传到服务器
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        setGenerationProgress('正在上传模型文件…');
        
        // 上传文件到服务器
        const serverUrl = await modelService.uploadModel(file);
        setUploadedModelUrl(serverUrl);
        
        setGenerationProgress('模型上传成功');
      } catch (error) {
        console.error('[CreatePage] 上传模型失败:', error);
        alert(`上传模型失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setLoading(false);
        setGenerationProgress('');
      }
    }
  };

  // Image Upload Logic（图生 3D）
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 校验文件类型
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        alert('请上传 PNG、JPG 或 WEBP 格式的图片');
        return;
      }
      setUploadedImageFile(file);
    }
  };

  const handleRequestChange = (value: string) => {
    setCharacterDescription(value);
    setCharacterAttributes(null);
  };

/*
  const buildModelPromptFromRequest = (request: string, attributes?: CharacterAttributes | null) => {
    const cleanRequest = request.trim();
    if (!attributes) return cleanRequest;

    const promptParts = [
      `${attributes.name}，${attributes.gender}，${attributes.age}`,
      attributes.job ? `职业是${attributes.job}` : '',
      attributes.birth ? `来自${attributes.birth}` : '',
      attributes.additional ? `性格特点：${attributes.additional}` : '',
      attributes.hobby ? `兴趣爱好：${attributes.hobby}` : '',
      attributes.goal ? `核心目标：${attributes.goal}` : '',
      '高质量3D数字人，完整人物形象，面部清晰，服饰与身材匹配，站姿自然'
    ].filter(Boolean);

    return promptParts.join('，');
  };

*/
  const generateAttributesForRequest = async (description: string) => {
    if (!description.trim()) return;
    
    setIsGeneratingAttributes(true);
    try {
      const tempCompanionId = `temp_${Date.now()}`;
      const attributes = await characterService.generateAttributes(description, tempCompanionId);
      setCharacterAttributes(attributes);
      console.log('[CreatePage] 角色属性生成成功:', attributes);
      return attributes;
    } catch (error) {
      console.error('[CreatePage] 角色属性生成失败:', error);
      alert(`角色属性生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return null;
    } finally {
      setIsGeneratingAttributes(false);
    }
  };

  const buildUnifiedModelPrompt = (request: string, attributes?: CharacterAttributes | null) => {
    const cleanRequest = request.trim();
    if (!attributes) return cleanRequest;

    const promptParts = [
      `name ${attributes.name}`,
      `gender ${attributes.gender}`,
      `age ${attributes.age}`,
      attributes.job ? `job ${attributes.job}` : '',
      attributes.birth ? `birthplace ${attributes.birth}` : '',
      attributes.additional ? `personality ${attributes.additional}` : '',
      attributes.hobby ? `hobby ${attributes.hobby}` : '',
      attributes.goal ? `goal ${attributes.goal}` : '',
      'high quality 3d digital human, full body, clear face, matching costume, natural standing pose'
    ].filter(Boolean);

    return promptParts.join(', ');
  };

  const getDisplayCharacterName = (request: string, attributes?: CharacterAttributes | null) => {
    if (attributes?.name) return attributes.name;

    const trimmed = request.trim();
    if (!trimmed) return '';

    return extractCharacterNameFromRequest(trimmed) || DEFAULT_CHARACTER_REFERENCE;
  };

  const handleQualityPresetChange = (quality: keyof typeof QUALITY_PRESETS) => {
    const preset = QUALITY_PRESETS[quality];
    setSelectedQuality(quality);
    setOctreeResolution(preset.octreeResolution);
    setNumInferenceSteps(preset.numInferenceSteps);
    setGuidanceScale(preset.guidanceScale);
  };

  const updateQualitySelectionFromParams = (
    nextResolution: number,
    nextSteps: number,
    nextGuidance: number
  ) => {
    const matchedPreset = (Object.entries(QUALITY_PRESETS) as Array<[keyof typeof QUALITY_PRESETS, typeof QUALITY_PRESETS.high]>)
      .find(([, preset]) =>
        preset.octreeResolution === nextResolution &&
        preset.numInferenceSteps === nextSteps &&
        preset.guidanceScale === nextGuidance
      );

    if (matchedPreset) {
      setSelectedQuality(matchedPreset[0]);
    }
  };

  const handleGenerateProfile = async () => {
    if (createFlowInFlightRef.current) return;
    const unifiedRequest = characterDescription.trim();
    if (!unifiedRequest && !uploadedImageFile && !uploadedModelUrl) return;
    
    createFlowInFlightRef.current = true;
    setLoading(true);
    setGenerating(false);
    setGenerationProgress('');
    
    try {
      let modelUrl: string | null = null; // Blob URL 用于预览
      let serverUrl: string | null = null; // 服务器 URL 写入数据库
      let resolvedAttributes = characterAttributes;

      if (unifiedRequest && !resolvedAttributes) {
        setGenerationProgress('正在识别角色并生成档案…');
        resolvedAttributes = await generateAttributesForRequest(unifiedRequest);
      }

      const modelPrompt = buildUnifiedModelPrompt(unifiedRequest, resolvedAttributes);
      
      // 优先使用已上传的模型（若存在）
      if (uploadedModelUrl) {
        // uploadedModelUrl 已是服务器 URL（来自 uploadModel 返回）
        modelUrl = uploadedModelUrl; // 用于预览（服务器 URL 可访问时可直接用）
        serverUrl = uploadedModelUrl; // 服务器 URL
        setGenerationProgress('正在使用已上传的模型…');
      }
      // 若有上传图片，走图生 3D
      else if (uploadedImageFile) {
        setGenerating(true);
        setGenerationProgress('正在生成 3D 模型（图生 3D）…');
        
        const result = await generateModelFromImage(uploadedImageFile, {
          seed: 1234,
          octree_resolution: octreeResolution,
          num_inference_steps: numInferenceSteps,
          guidance_scale: guidanceScale,
          texture: generateTexture,
          type: 'glb',
          ...(generateTexture && { face_count: 40000 })
        });
        
        if (result.success && result.modelUrl) {
          modelUrl = result.modelUrl; // Blob 预览
          serverUrl = result.serverUrl || result.modelUrl; // 服务器 URL
          setGenerationProgress('3D 模型生成成功');
        } else {
          throw new Error(result.error || '3D 模型生成失败');
        }
      }
      // 有文字描述则文生 3D
      else if (unifiedRequest) {
        setGenerating(true);
        setGenerationProgress('正在根据请求生成 3D 模型…');
        
        const result = await generateModelFromText(modelPrompt, {
          seed: 1234,
          octree_resolution: octreeResolution,
          num_inference_steps: numInferenceSteps,
          guidance_scale: guidanceScale,
          texture: generateTexture,
          type: 'glb',
          ...(generateTexture && { face_count: 40000 })
        });
        
        if (result.success && result.modelUrl) {
          modelUrl = result.modelUrl; // Blob 预览
          serverUrl = result.serverUrl || result.modelUrl; // 服务器 URL
          setGenerationProgress('3D 模型生成成功');
        } else {
          throw new Error(result.error || '3D 模型生成失败');
        }
      }
      
      // 生成角色名称，优先用属性里的名字
      let defaultName;
      if (resolvedAttributes && resolvedAttributes.name) {
        // 有生成属性则用其中的名字
        defaultName = resolvedAttributes.name;
      } else if (characterDescription && characterDescription.trim()) {
        // 仅有描述无属性时，截取描述前 20 字作名
        defaultName = characterDescription.substring(0, 20);
      } else if (uploadedImageFile) {
        // 纯图上传时给默认名
        defaultName = `3D角色_${Date.now().toString().slice(-6)}`;
      } else {
        // 其他情况生成默认名
        defaultName = `角色_${Date.now().toString().slice(-6)}`;
      }
      
      // 生成角色资料，优先用属性信息
      const data: any = {
        name: defaultName,
        role: resolvedAttributes?.position || '虚拟伙伴',
        personality: characterDescription || resolvedAttributes?.additional || '这是一个 3D 虚拟角色',
        visualPrompt: modelPrompt || characterDescription || '3D 角色',
        generatedAttributes: resolvedAttributes || undefined,
        avatarUrl: ''
      };
      
      // 保存预览 URL 与服务器 URL
      if (modelUrl) {
        data.model3dUrl = modelUrl; // Blob 用于预览
      }
      if (serverUrl) {
        data.serverModelUrl = serverUrl; // 落库用服务器 URL
      }
      
      console.log('[CreatePage] 生成完成，预览 URL:', modelUrl);
      console.log('[CreatePage] 服务器 URL:', serverUrl);
      console.log('[CreatePage] 生成的数据:', data);
      
      setGeneratedData(data); 
      
      setStep(2);
    } catch (e) {
      console.error(e);
      const errorMsg = e instanceof Error ? e.message : '生成失败';
      alert(`生成失败: ${errorMsg}`);
    } finally {
      createFlowInFlightRef.current = false;
      setLoading(false);
      setGenerating(false);
      setGenerationProgress('');
    }
  };

  const handleConfirm = async () => {
    if (createFlowInFlightRef.current) return;
    if (!generatedData) return;
    if (generatedData.autoCreated) {
      navigate('/bind');
      return;
    }
    
    try {
      createFlowInFlightRef.current = true;
      setLoading(true);
      
      const normalizedCharacterDescription = normalizeCharacterReferenceText(
        characterDescription,
        generatedData.generatedAttributes?.name || generatedData.name
      );

      // 鍑嗗模型鏁版嵁
      const modelData = {
        name: generatedData.name,
        description: generatedData.role || characterDescription.trim() || generatedData.personality || '',
        character_description: normalizedCharacterDescription || undefined,
        attribute_json: generatedData.generatedAttributes || characterAttributes || undefined,
        model3d_url: generatedData?.serverModelUrl || generatedData?.model3dUrl || uploadedModelUrl || undefined,
        username: 'User',
        is_global: 0,
      };
      
      // 璋冪敤后端API创建模型
      const modelId = await modelService.createModel(modelData);
      console.log('[CreatePage] 模型创建成功，modelId:', modelId);
      const backendModel = await modelService.getModelDetail(modelId);
      const normalizedCompanion = modelService.modelToCompanion(backendModel);
      
      // 创建Companion对象
    const newCompanion: Companion = {
        id: modelId,
        model_id: modelId,
      name: generatedData.name,
      role: generatedData.role,
      personality: generatedData.personality,
      avatarUrl: generatedData.avatarUrl,
      isBound: false,
      createdAt: Date.now(),
        model3dUrl: normalizedCompanion.model3dUrl || generatedData?.serverModelUrl || generatedData?.model3dUrl || uploadedModelUrl || '', // 优先后端归一后的正式 URL
      // 附带描述与属性
      characterDescription: normalizedCharacterDescription || undefined,
      characterAttributes: generatedData.generatedAttributes || characterAttributes || undefined,
    };
    
    // 有属性则写入本地缓存
    if (newCompanion.characterAttributes) {
      characterService.saveAttributes(newCompanion.id, newCompanion.characterAttributes);
    }
    
      await addCompanion(newCompanion);
    navigate('/bind');
    } catch (error) {
      console.error('[CreatePage] 创建模型失败:', error);
      alert(`创建模型失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      createFlowInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleGenerateInBackground = async () => {
    if (createFlowInFlightRef.current) return;
    const unifiedRequest = characterDescription.trim();
    if (!unifiedRequest && !uploadedImageFile && !uploadedModelUrl) return;

    createFlowInFlightRef.current = true;
    const displayName = getDisplayCharacterName(unifiedRequest, characterAttributes);
    const taskId = createTask({
      type: 'generate',
      status: 'running',
      title: displayName ? `正在生成 ${displayName}` : '正在生成角色',
      detail: '任务已开始，你可以离开当前页面。',
      companionName: displayName || undefined,
      targetPath: '/manage',
      seen: true,
    });

    if (isMountedRef.current) {
      setLoading(true);
      setGenerating(false);
      setGenerationProgress('任务已转入后台，您可以先去别的页面。');
    }

    try {
      let modelUrl: string | null = null;
      let serverUrl: string | null = null;
      let resolvedAttributes = characterAttributes;

      if (unifiedRequest && !resolvedAttributes) {
        updateTask(taskId, { detail: '正在识别角色并生成档案…' });
        if (isMountedRef.current) {
          setGenerationProgress('正在识别角色并生成档案…');
        }
        resolvedAttributes = await generateAttributesForRequest(unifiedRequest);
      }

      const modelPrompt = buildUnifiedModelPrompt(unifiedRequest, resolvedAttributes);

      if (uploadedModelUrl) {
        modelUrl = uploadedModelUrl;
        serverUrl = uploadedModelUrl;
        updateTask(taskId, { detail: '正在使用已上传模型创建角色…' });
      } else if (uploadedImageFile) {
        if (isMountedRef.current) {
          setGenerating(true);
          setGenerationProgress('正在生成 3D 模型（图生 3D）…');
        }
        updateTask(taskId, { detail: '正在生成 3D 模型（图生 3D）…' });

        const result = await generateModelFromImage(uploadedImageFile, {
          seed: 1234,
          octree_resolution: octreeResolution,
          num_inference_steps: numInferenceSteps,
          guidance_scale: guidanceScale,
          texture: generateTexture,
          type: 'glb',
          ...(generateTexture && { face_count: 40000 })
        });

        if (result.success && result.modelUrl) {
          modelUrl = result.modelUrl;
          serverUrl = result.serverUrl || result.modelUrl;
          updateTask(taskId, { detail: '3D 模型生成完成，正在创建角色…' });
        } else {
          throw new Error(result.error || '3D 模型生成失败');
        }
      } else if (unifiedRequest) {
        if (isMountedRef.current) {
          setGenerating(true);
          setGenerationProgress('正在根据请求生成 3D 模型…');
        }
        updateTask(taskId, { detail: '正在根据请求生成 3D 模型…' });

        const result = await generateModelFromText(modelPrompt, {
          seed: 1234,
          octree_resolution: octreeResolution,
          num_inference_steps: numInferenceSteps,
          guidance_scale: guidanceScale,
          texture: generateTexture,
          type: 'glb',
          ...(generateTexture && { face_count: 40000 })
        });

        if (result.success && result.modelUrl) {
          modelUrl = result.modelUrl;
          serverUrl = result.serverUrl || result.modelUrl;
          updateTask(taskId, { detail: '3D 模型生成完成，正在创建角色…' });
        } else {
          throw new Error(result.error || '3D 模型生成失败');
        }
      }

      let defaultName;
      if (resolvedAttributes?.name) {
        defaultName = resolvedAttributes.name;
      } else if (characterDescription && characterDescription.trim()) {
        defaultName = characterDescription.substring(0, 20);
      } else if (uploadedImageFile) {
        defaultName = `3D角色_${Date.now().toString().slice(-6)}`;
      } else {
        defaultName = `角色_${Date.now().toString().slice(-6)}`;
      }

      const nextGeneratedData: any = {
        name: defaultName,
        role: resolvedAttributes?.position || '虚拟伙伴',
        personality: characterDescription || resolvedAttributes?.additional || '这是一个 3D 虚拟角色',
        visualPrompt: modelPrompt || characterDescription || '3D 角色',
        generatedAttributes: resolvedAttributes || undefined,
        avatarUrl: ''
      };

      if (modelUrl) {
        nextGeneratedData.model3dUrl = modelUrl;
      }
      if (serverUrl) {
        nextGeneratedData.serverModelUrl = serverUrl;
      }

      const normalizedCharacterDescription = normalizeCharacterReferenceText(
        characterDescription,
        nextGeneratedData.generatedAttributes?.name || nextGeneratedData.name
      );

      updateTask(taskId, { detail: '模型已生成，正在保存角色…' });

      const modelId = await modelService.createModel({
        name: nextGeneratedData.name,
        description: nextGeneratedData.role || characterDescription.trim() || nextGeneratedData.personality || '',
        character_description: normalizedCharacterDescription || undefined,
        attribute_json: nextGeneratedData.generatedAttributes || characterAttributes || undefined,
        model3d_url: nextGeneratedData?.serverModelUrl || nextGeneratedData?.model3dUrl || uploadedModelUrl || undefined,
        username: 'User',
        is_global: 0,
      });
      const backendModel = await modelService.getModelDetail(modelId);
      const normalizedCompanion = modelService.modelToCompanion(backendModel);

      const newCompanion: Companion = {
        id: modelId,
        model_id: modelId,
        name: nextGeneratedData.name,
        role: nextGeneratedData.role,
        personality: nextGeneratedData.personality,
        avatarUrl: nextGeneratedData.avatarUrl,
        isBound: normalizedCompanion.isBound,
        createdAt: Date.now(),
        model3dUrl: normalizedCompanion.model3dUrl || nextGeneratedData?.serverModelUrl || nextGeneratedData?.model3dUrl || uploadedModelUrl || '',
        idleModelUrl: normalizedCompanion.idleModelUrl,
        talkingModelUrl: normalizedCompanion.talkingModelUrl,
        waveModelUrl: normalizedCompanion.waveModelUrl,
        characterDescription: normalizedCharacterDescription || undefined,
        characterAttributes: nextGeneratedData.generatedAttributes || characterAttributes || undefined,
      };

      if (newCompanion.characterAttributes) {
        characterService.saveAttributes(newCompanion.id, newCompanion.characterAttributes);
      }

      await addCompanion(newCompanion);

      if (isMountedRef.current) {
        setGeneratedData({ ...nextGeneratedData, companionId: modelId, autoCreated: true });
      }

      finishTask(taskId, `${newCompanion.name} 已生成完成，可以前往绑骨。`, {
        companionId: newCompanion.id,
        companionName: newCompanion.name,
        targetPath: '/bind',
      });

      if (isMountedRef.current) {
        navigate('/bind');
      }
    } catch (error) {
      console.error('[CreatePage] 后台生成失败:', error);
      const message = error instanceof Error ? error.message : '未知错误';
      failTask(taskId, `生成失败：${message}`);
      if (isMountedRef.current) {
        alert(`生成失败: ${message}`);
      }
    } finally {
      createFlowInFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        setGenerating(false);
        setGenerationProgress('');
      }
    }
  };

  return (
    <PageContainer>
      <div className="mb-2 text-center">
        <h2 className="text-2xl font-bold mb-1">创造数字生命</h2>
        <p className="text-gray-600/70 text-xs">上传图片、输入描述或上传模型，生成 3D 虚拟实体</p>
      </div>

      {step === 1 ? (
        <div className="flex flex-col min-h-[70vh] items-center justify-between space-y-4">
          
          {/* Dynamic Sphere Section (Voice Interface) */}
          <div className="flex-1 w-full flex flex-col items-center justify-center relative">
             <div 
               onClick={toggleListening}
               className={`
                 relative w-48 h-48 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500
                 ${isListening ? 'scale-110' : 'scale-100 hover:scale-105'}
               `}
             >
                {/* Core Sphere */}
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 blur-md opacity-80 ${isListening ? 'animate-pulse' : ''}`}></div>
                <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 z-10 flex items-center justify-center border border-white/10">
                   {isListening ? (
                     <div className="flex gap-1 h-8 items-center">
                        <span className="w-1 bg-white animate-[bounce_1s_infinite] h-4"></span>
                        <span className="w-1 bg-white animate-[bounce_1.2s_infinite] h-8"></span>
                        <span className="w-1 bg-white animate-[bounce_0.8s_infinite] h-6"></span>
                        <span className="w-1 bg-white animate-[bounce_1.1s_infinite] h-5"></span>
                     </div>
                   ) : (
                     <Mic size={48} className="text-white/50" />
                   )}
                </div>
                {/* Outer Glow Rings */}
                {isListening && (
                  <>
                    <div className="absolute inset-[-20px] rounded-full border border-purple-500/30 animate-[spin_4s_linear_infinite]"></div>
                    <div className="absolute inset-[-40px] rounded-full border border-pink-500/10 animate-[spin_8s_linear_infinite_reverse]"></div>
                  </>
                )}
             </div>
             <p className="mt-6 text-sm text-gray-600/70 animate-pulse">
               {isListening ? '正在聆听您的构想…' : '点击球体开始对话，或下方输入'}
             </p>
          </div>

          {/* Input Area */}
          <div className="w-full space-y-4">
             {/* 角色描述输入 */}
             <CharacterDescriptionInput
               value={characterDescription}
               onChange={handleRequestChange}
               placeholder="输入一句你的请求，例如：我想和孔子对话"
               isListening={isListening}
               onVoiceInput={toggleListening}
               title="角色请求"
               description="输入你想交流或创建的角色，系统会自动识别并生成档案。"
               tips={[]}
               disabled={generating || loading}
             />

             {/* 显示生成的角色属性摘要 */}
             {characterAttributes && (
               <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-xs text-green-400">
                 <div className="flex items-center gap-2 mb-2">
                   <User size={14} />
                   <span className="font-semibold">角色属性已生成</span>
                 </div>
                 <div className="space-y-1 text-green-300">
                   <p><span className="text-green-400">姓名:</span> {characterAttributes.name}</p>
                   <p><span className="text-green-400">职业:</span> {characterAttributes.job}</p>
                   <p><span className="text-green-400">性格:</span> {characterAttributes.additional}</p>
                 </div>
               </div>
             )}

             {isGeneratingAttributes && !characterAttributes && (
               <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-400">
                 <div className="flex items-center gap-2">
                   <Activity size={14} className="animate-pulse" />
                   <span>正在识别角色并生成档案…</span>
                 </div>
               </div>
             )}

             {/* Generation Progress */}
             {generating && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-blue-400">
                   <div className="flex items-center gap-2 mb-2">
                     <Activity size={14} className="animate-pulse" />
                     <span>{generationProgress || '正在生成 3D 模型…'}</span>
                   </div>
                   <div className="w-full h-1 bg-blue-500/20 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }}></div>
                   </div>
                </div>
             )}

             {/* Upload Info */}
             {uploadedModelUrl && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center justify-between text-xs text-green-400">
                   <span className="flex items-center gap-2"><Box size={14}/> 模型已就绪（已上传）</span>
                   <button onClick={() => { setUploadedModelUrl(null); }} className="hover:text-gray-800"><X size={14}/></button>
                </div>
             )}

             {uploadedImageFile && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 flex items-center justify-between text-xs text-purple-400">
                   <span className="flex items-center gap-2"><ImageIcon size={14}/> 图片已就绪：{uploadedImageFile.name}</span>
                   <button onClick={() => { setUploadedImageFile(null); }} className="hover:text-gray-800"><X size={14}/></button>
                </div>
             )}

             {/* 生成参数面板 */}
             {(uploadedImageFile || characterDescription.trim()) && !uploadedModelUrl && (
                <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <Cpu size={14} className="text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-300">生成参数</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedParams(!showAdvancedParams)}
                      className="text-xs text-indigo-500 hover:text-indigo-600 transition-colors"
                    >
                      {showAdvancedParams ? '收起高级参数' : '展开高级参数'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(QUALITY_PRESETS) as Array<[keyof typeof QUALITY_PRESETS, typeof QUALITY_PRESETS.high]>).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleQualityPresetChange(key)}
                        disabled={generating || loading}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                          selectedQuality === key
                            ? 'border-indigo-500 bg-indigo-500 text-white shadow-lg'
                            : 'border-indigo-200 bg-white/70 text-gray-700 hover:border-indigo-300 hover:bg-white'
                        } ${generating || loading ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        <div>{preset.label}</div>
                        <div className={`mt-1 text-[10px] ${selectedQuality === key ? 'text-white/80' : 'text-gray-500'}`}>
                          {preset.octreeResolution} / {preset.numInferenceSteps} / {preset.guidanceScale.toFixed(0)}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  {/* 纹理开关 */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-700 font-medium">生成纹理</label>
                    <button
                      onClick={() => setGenerateTexture(!generateTexture)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        generateTexture ? 'bg-indigo-500' : 'bg-white/20'
                      }`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        generateTexture ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  {showAdvancedParams && (
                    <>
                      {/* 分辨率（八叉树） */}
                      <div>
                        <label className="text-xs text-gray-700 font-medium mb-1 block">分辨率 {octreeResolution}</label>
                        <input
                          type="range"
                          min="0"
                          max="1024"
                          step="1"
                          value={octreeResolution}
                          onChange={(e) => {
                            const nextResolution = Number(e.target.value);
                            setOctreeResolution(nextResolution);
                            updateQualitySelectionFromParams(nextResolution, numInferenceSteps, guidanceScale);
                          }}
                          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                          disabled={generating || loading}
                        />
                        <div className="flex justify-between text-[10px] text-gray-600/70 mt-1">
                          <span>0</span>
                          <span>256</span>
                          <span>512</span>
                          <span>768</span>
                          <span>1024</span>
                        </div>
                      </div>

                      {/* 推理步数 */}
                      <div>
                        <label className="text-xs text-gray-700 font-medium mb-1 block">推理步数: {numInferenceSteps}</label>
                        <input
                          type="range"
                          min="0"
                          max="150"
                          step="1"
                          value={numInferenceSteps}
                          onChange={(e) => {
                            const nextSteps = Number(e.target.value);
                            setNumInferenceSteps(nextSteps);
                            updateQualitySelectionFromParams(octreeResolution, nextSteps, guidanceScale);
                          }}
                          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                          disabled={generating || loading}
                        />
                        <div className="flex justify-between text-[10px] text-white/40 mt-1">
                          <span>0</span>
                          <span>50</span>
                          <span>100</span>
                          <span>150</span>
                        </div>
                      </div>

                      {/* 寮曞姣斾緥 */}
                      <div>
                        <label className="text-xs text-gray-700 font-medium mb-1 block">引导比例: {guidanceScale.toFixed(1)}</label>
                        <input
                          type="range"
                          min="0"
                          max="10.0"
                          step="0.1"
                          value={guidanceScale}
                          onChange={(e) => {
                            const nextGuidance = Number(e.target.value);
                            setGuidanceScale(nextGuidance);
                            updateQualitySelectionFromParams(octreeResolution, numInferenceSteps, nextGuidance);
                          }}
                          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                          disabled={generating || loading}
                        />
                        <div className="flex justify-between text-[10px] text-white/40 mt-1">
                          <span>0.0</span>
                          <span>3.0</span>
                          <span>5.0</span>
                          <span>8.0</span>
                          <span>10.0</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
             )}

             {/* Image Upload Button */}
             <div className="flex gap-2">
               <input 
                 type="file" 
                 ref={imageInputRef} 
                 onChange={handleImageUpload} 
                 className="hidden" 
                 accept="image/png,image/jpeg,image/jpg,image/webp" 
               />
               <Button
                 onClick={() => imageInputRef.current?.click()}
                 variant="outline"
                 className="flex-1 border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                 disabled={generating || loading}
               >
                 <ImageIcon size={16} className="mr-2" />
                 上传图片（图生 3D）
               </Button>
               
               <input 
                 type="file" 
                 ref={fileInputRef} 
                 onChange={handleFileUpload} 
                 className="hidden" 
                 accept=".glb,.gltf" 
               />
               <Button
                 onClick={() => fileInputRef.current?.click()}
                 variant="outline"
                 className="flex-1 border-green-500/30 text-green-300 hover:bg-green-500/20"
                 disabled={generating || loading}
               >
                 <Upload size={16} className="mr-2" />
                 上传模型（备选）
               </Button>
             </div>

             <Button 
               onClick={handleGenerateInBackground} 
               isLoading={loading || generating} 
                className="w-full py-4 text-lg bg-gradient-to-r from-violet-600 to-indigo-600 shadow-xl shadow-indigo-900/20" 
               disabled={(!characterDescription.trim() && !uploadedImageFile && !uploadedModelUrl) || loading || generating || isGeneratingAttributes}
             >
               {generating 
                 ? generationProgress || '正在生成 3D 模型…' 
                 : loading 
                   ? '正在生成角色资料…' 
                   : uploadedModelUrl 
                     ? '生成角色并使用已上传模型' 
                     : uploadedImageFile 
                       ? '生成角色并创建 3D 模型' 
                       : characterDescription.trim() 
                         ? '识别角色并生成 3D 模型' 
                         : '请输入请求或上传图片'}
             </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center animate-[fadeIn_0.5s_ease-out] min-h-[75vh] w-full">
          <div className="w-full h-[650px] relative mb-6 bg-white/5 rounded-2xl overflow-hidden border border-white/10">
            <div className="absolute top-4 left-4 z-10 bg-black/50 px-3 py-1 rounded-full text-xs text-green-400 border border-green-500/30 flex items-center gap-1">
                <Activity size={12} /> 3D 预览模式
            </div>
            {/* 3D Preview - uses generated or uploaded model */}
            {(() => {
              const modelUrl = generatedData?.model3dUrl || uploadedModelUrl || undefined;
              console.log('[CreatePage] Step 2 - 显示模型，URL:', modelUrl);
              console.log('[CreatePage] Step 2 - generatedData:', generatedData);
              if (!modelUrl) {
                return (
                  <div className="w-full h-full flex items-center justify-center text-gray-600/70">
                    <div className="text-center">
                      <Box size={48} className="mx-auto mb-2 opacity-50" />
                      <p>暂无模型预览</p>
                    </div>
                  </div>
                );
              }
              return <AvatarScene modelUrl={modelUrl} key={modelUrl || 'default'} />;
            })()}
          </div>
          
          <div className="w-full mb-4">
            <h3 className="text-2xl font-bold text-gray-700">{generatedData.name}</h3>
            <p className="text-sm text-purple-600">{generatedData.role}</p>
            
            {/* 显示角色描述 */}
            {getDisplayCharacterName(characterDescription, generatedData.generatedAttributes || characterAttributes) && (
              <div className="mt-3 p-3 bg-white/70 rounded-lg border border-pink-300/30">
                <p className="text-xs text-gray-600 mb-1 font-medium">角色</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {getDisplayCharacterName(characterDescription, generatedData.generatedAttributes || characterAttributes)}
                </p>
              </div>
            )}

            {/* 显示生成的角色属性摘要 */}
            {(generatedData.generatedAttributes || characterAttributes) && (
              <div className="mt-3 p-3 bg-blue-100/80 rounded-lg border border-blue-300/50">
                <p className="text-xs text-blue-700 mb-2 flex items-center gap-1 font-semibold">
                  <User size={12} />
                  生成的角色属性
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-blue-600 font-medium">姓名:</span> <span className="text-gray-700">{(generatedData.generatedAttributes || characterAttributes).name}</span></div>
                  <div><span className="text-blue-600 font-medium">职业:</span> <span className="text-gray-700">{(generatedData.generatedAttributes || characterAttributes).job}</span></div>
                  <div><span className="text-blue-600 font-medium">性格:</span> <span className="text-gray-700">{(generatedData.generatedAttributes || characterAttributes).additional}</span></div>
                  <div><span className="text-blue-600 font-medium">定位:</span> <span className="text-gray-700">{(generatedData.generatedAttributes || characterAttributes).position}</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 w-full">
            <Button variant="secondary" onClick={() => setStep(1)} className="flex-1">重试</Button>
            <Button onClick={handleConfirm} className="flex-[2] bg-gradient-to-r from-emerald-500 to-teal-600">确认模型</Button>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

const BindPage: React.FC<{
  companion: Companion | null,
  updateCompanion: (c: Partial<Companion>) => Promise<void>,
  createTask: (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt'>) => string,
  updateTask: (taskId: string, updater: Partial<BackgroundTask> | ((task: BackgroundTask) => BackgroundTask)) => void,
  finishTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void,
  failTask: (taskId: string, detail: string, extra?: Partial<BackgroundTask>) => void,
  tasks: BackgroundTask[],
}> = ({ companion, updateCompanion, createTask, updateTask, finishTask, failTask, tasks }) => {
  const [currentStep, setCurrentStep] = useState<ProcessStep>(ProcessStep.LoadModel);
  // 获取 Mesh2MotionViewer 导出模型 URL 的 ref
  const getExportedModelUrlsRef = useRef<(() => { idleModelUrl?: string; talkingModelUrl?: string }) | null>(null);
  const navigate = useNavigate();
  const [isAutoRigging, setIsAutoRigging] = useState(false);
  const isMountedRef = useRef(true);
  const activeRigTask = companion
    ? tasks.find(task => task.type === 'rig' && task.companionId === companion.id && task.status === 'running')
    : undefined;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!companion) {
    return (
      <PageContainer className="text-center pt-20">
        <p className="mb-4 text-white/50">请先创建模型</p>
        <Link to="/create"><Button>去创建</Button></Link>
      </PageContainer>
    );
  }

  if (companion.isBound) {
    return (
      <PageContainer className="flex flex-col min-h-[70vh]">
        {/* 模型预览区 - 上方 */}
        <div className="w-full h-[500px] relative mb-6 bg-white/5 rounded-2xl overflow-hidden border border-white/10">
          <AvatarScene modelUrl={companion.model3dUrl} />
          <div className="absolute top-4 right-4 bg-green-500 text-white p-2 rounded-full shadow-lg z-10">
            <Check size={20} />
          </div>
        </div>
        
        {/* 文案与按钮区 - 下方 */}
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-2">骨骼绑定已完成</h2>
          <p className="text-white/60 mb-8">模型 {companion.name} 已准备好被驱动。</p>
          <Link to="/chat">
            <Button size="lg" className="px-10">进入驱动交互</Button>
          </Link>
        </div>
      </PageContainer>
    );
  }

  /**
   * 绑骨完成后的处理（自动写回本地与后端）
   * @param idleModelUrl 含 Idle_Torch_Loop 的模型 URL（可选）
   * @param talkingModelUrl 含 Idle_Talking_Loop 的模型 URL（可选）
   */
  const handleBindingComplete = async (idleModelUrl?: string, talkingModelUrl?: string) => {
    console.log('[BindPage] ========== 绑骨完成回调（自动保存） ==========');
    console.log('[BindPage] 空闲模型 URL:', idleModelUrl);
    console.log('[BindPage] 说话模型 URL:', talkingModelUrl);
    
    // 自动把动画模型 URL 写入本地与后端
    const updateData: Partial<Companion> = {};
    
    if (idleModelUrl) {
      updateData.idleModelUrl = idleModelUrl;
      console.log('[BindPage] 已自动保存 idleModelUrl:', idleModelUrl);
    }
    
    if (talkingModelUrl) {
      updateData.talkingModelUrl = talkingModelUrl;
      console.log('[BindPage] 已自动保存 talkingModelUrl:', talkingModelUrl);
    }
    
    // 不改 model3dUrl，仍用原始模型
    // 仅在交互页明确需要动画时才用动画模型
    
    if (Object.keys(updateData).length > 0) {
      console.log('[BindPage] 已立即保存动画模型到 companion 数据');
      
      // 先更新本地
      updateCompanion(updateData);
      console.log('[BindPage] 本地数据已更新');
      
      // 若 companion 有 model_id，同步到后端数据库
      if (companion?.model_id) {
        try {
          console.log('[BindPage] 开始同步动画模型 URL 到后端数据库...');
          const modelData = modelService.companionToModelData({
            ...companion,
            ...updateData
          });
          
          const success = await modelService.updateModel(companion.model_id, {
            idle_model_url: modelData.idle_model_url,
            talking_model_url: modelData.talking_model_url,
          });
          
          if (success) {
            console.log('[BindPage] 动画模型 URL 已同步到后端数据库');
          } else {
            console.warn('[BindPage] 同步到后端失败，但本地已保存');
          }
        } catch (error) {
          console.error('[BindPage] 同步到后端时出错:', error);
          console.warn('[BindPage] 本地数据已保存，但后端同步失败');
        }
      } else {
        console.warn('[BindPage] Companion 没有 model_id，跳过后端同步（可能是本地创建的模型）');
      }
      
      console.log('[BindPage] 动画模型已自动保存完成');
    } else {
      console.warn('[BindPage] 没有动画模型 URL 需要保存');
    }
  };

  const handleStepChange = (step: ProcessStep) => {
    setCurrentStep(step);
  };

  const handleAutoRigInBackground = async () => {
    if (!companion?.model_id || !companion.model3dUrl) return;

    const taskId = createTask({
      type: 'rig',
      status: 'running',
      title: `正在为 ${companion.name} 自动绑骨`,
      detail: '绑骨已转入后台，你可以先去别的页面。',
      companionId: companion.id,
      companionName: companion.name,
      targetPath: '/bind',
      seen: true,
    });

    try {
      if (isMountedRef.current) {
        setIsAutoRigging(true);
      }
      updateTask(taskId, { detail: '正在调用自动绑骨服务…' });
      await modelService.autoRigModel(companion.model_id);
      updateTask(taskId, { detail: '绑骨完成，正在同步模型状态…' });

      const backendModel = await modelService.getModelDetail(companion.model_id);
      const updatedCompanion = modelService.modelToCompanion(backendModel);
      await updateCompanion({
        idleModelUrl: updatedCompanion.idleModelUrl,
        talkingModelUrl: updatedCompanion.talkingModelUrl,
        waveModelUrl: updatedCompanion.waveModelUrl,
        isBound: !!(updatedCompanion.idleModelUrl || updatedCompanion.talkingModelUrl),
      });

      finishTask(taskId, `${companion.name} 绑骨完成，可以进入互动。`, {
        companionId: companion.id,
        companionName: companion.name,
        targetPath: '/chat',
      });
    } catch (error) {
      failTask(taskId, `绑骨失败：${error instanceof Error ? error.message : '未知错误'}`, {
        companionId: companion.id,
        companionName: companion.name,
        targetPath: '/bind',
      });
    } finally {
      if (isMountedRef.current) {
        setIsAutoRigging(false);
      }
    }
  };

  return (
    <PageContainer className="min-h-screen flex flex-col">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold">骨骼绑定 (Rigging)</h2>
        <p className="text-sm text-white/50 mt-1">使用 Mesh2Motion 进行专业的骨骼绑定</p>
        {activeRigTask && (
          <div className="mt-3 mx-auto max-w-md rounded-xl border border-blue-300/40 bg-blue-500/10 px-4 py-3 text-left text-sm text-blue-100">
            <div className="flex items-center gap-2">
              <Activity size={14} className="animate-pulse" />
              <span className="font-medium">后台绑骨进行中</span>
            </div>
            <p className="mt-1 text-xs text-blue-100/80">{activeRigTask.detail}</p>
          </div>
        )}
        {/* 自动绑骨入口：仅在有后端 model_id 与原始 3D 模型时显示 */}
        {companion.model_id && companion.model3dUrl && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="secondary"
              disabled={isAutoRigging || !!activeRigTask}
              onClick={handleAutoRigInBackground}
              className="mr-3"
            >
              后台自动绑骨
            </Button>
            <Button
              variant="secondary"
              disabled={isAutoRigging || !!activeRigTask}
              onClick={async () => {
                if (!companion.model_id) {
                  console.warn('[BindPage] 自动骨骼绑定失败：缺少 model_id');
                  return;
                }
                if (!companion.model3dUrl) {
                  console.warn('[BindPage] 自动骨骼绑定失败：缺少 model3dUrl');
                  return;
                }

                try {
                  setIsAutoRigging(true);
                  console.log('[BindPage] 开始自动骨骼绑定，model_id:', companion.model_id);

                  // 触发后端自动绑骨流程（当前仅生成一个动画模型）
                  const autoRigResult = await modelService.autoRigModel(companion.model_id);
                  console.log('[BindPage] 自动骨骼绑定完成，返回结果:', autoRigResult);

                  // 从后端重新拉取模型信息，与数据库一致
                  const backendModel = await modelService.getModelDetail(companion.model_id);
                  const updatedCompanion = modelService.modelToCompanion(backendModel);

                  // 更新前端 companion
                  updateCompanion({
                    idleModelUrl: updatedCompanion.idleModelUrl,
                    talkingModelUrl: updatedCompanion.talkingModelUrl,
                    isBound: !!(updatedCompanion.idleModelUrl || updatedCompanion.talkingModelUrl),
                  });

                  console.log('[BindPage] 自动骨骼绑定完成，已更新本地 Companion 数据');
                } catch (error) {
                  console.error('[BindPage] 自动骨骼绑定过程出错:', error);
                } finally {
                  setIsAutoRigging(false);
                }
              }}
            >
              {isAutoRigging || activeRigTask ? '自动骨骼绑定中…' : '自动骨骼绑定'}
            </Button>
          </div>
        )}
      </div>

      {/* Mesh2Motion 3D 视图 */}
      <div className="flex-1 relative bg-white/5 rounded-2xl overflow-hidden border border-white/10 mb-4 min-h-[500px]">
        <Mesh2MotionViewer 
          companion={companion}
          onBindingComplete={handleBindingComplete}
          onStepChange={handleStepChange}
          getExportedModelUrls={(getter) => {
            getExportedModelUrlsRef.current = getter;
          }}
        />
      </div>

      {/* Mesh2Motion 控制面板 */}
      <div className="flex-shrink-0 mb-4">
        <Mesh2MotionControls 
          currentStep={currentStep}
          onBindingComplete={async () => {
            // 用户点击「进入对话」时：
            // 1. 看 companion 是否已有动画模型 URL（可能已由回调自动保存）
            // 2. 若没有，尝试取已导出的模型 URL
            // 3. 若仍无导出，等待更长时间让导出完成
            // 4. 最终保存动画 URL 并设 isBound: true
            // 5. 导航到对话页
            console.log('[BindPage] ========== 用户点击进入对话 ==========');
            console.log('[BindPage] 首先检查 companion 中是否已有动画模型…');
            console.log('[BindPage] companion.idleModelUrl:', companion?.idleModelUrl);
            console.log('[BindPage] companion.talkingModelUrl:', companion?.talkingModelUrl);
            
            // 先检查 companion 是否已有动画模型（可能回调已自动保存）
            let urls: { idleModelUrl?: string; talkingModelUrl?: string } | undefined;
            if (companion?.idleModelUrl || companion?.talkingModelUrl) {
              console.log('[BindPage] 检测到 companion 中已有动画模型 URL（已自动保存）');
              urls = {
                idleModelUrl: companion.idleModelUrl,
                talkingModelUrl: companion.talkingModelUrl
              };
            } else {
              // 没有则尝试从 Mesh2MotionViewer 获取
              console.log('[BindPage] companion 中没有动画模型，尝试从导出器获取...');
              urls = getExportedModelUrlsRef.current?.();
              console.log('[BindPage] 从导出器获取的 URL:', JSON.stringify(urls, null, 2));
              
              // 若仍未导出，最多等 30 秒
              if ((!urls?.idleModelUrl && !urls?.talkingModelUrl) && getExportedModelUrlsRef.current) {
                console.log('[BindPage] 模型尚未导出，等待导出完成（最多 30 秒）...');
                for (let i = 0; i < 60; i++) { // 60 * 500ms = 30s
                  await new Promise(resolve => setTimeout(resolve, 500));
                  urls = getExportedModelUrlsRef.current?.();
                  if (urls?.idleModelUrl || urls?.talkingModelUrl) {
                    console.log('[BindPage] 导出完成，获取到模型 URL:', JSON.stringify(urls, null, 2));
                    // 立即写入 companion
                    if (urls?.idleModelUrl || urls?.talkingModelUrl) {
                      handleBindingComplete(urls?.idleModelUrl, urls?.talkingModelUrl);
                    }
                    break;
                  }
                  // 每秒打一次进度
                  if (i > 0 && i % 10 === 0) {
                    console.log(`[BindPage] 等待中… ${i * 0.5}秒 / 30秒`);
                  }
                }
                
                // 最后再检查一次
                if (!urls?.idleModelUrl && !urls?.talkingModelUrl) {
                  urls = getExportedModelUrlsRef.current?.();
                  if (urls?.idleModelUrl || urls?.talkingModelUrl) {
                    console.log('[BindPage] 最终检查找到模型 URL，立即保存');
                    handleBindingComplete(urls?.idleModelUrl, urls?.talkingModelUrl);
                  } else {
                    console.warn('[BindPage] 等待超时，模型可能尚未导出，将使用原始模型（无动画）');
                  }
                }
              } else if (urls?.idleModelUrl || urls?.talkingModelUrl) {
                // 若已取到则立即保存
                console.log('[BindPage] 已获取模型 URL，立即保存到 companion');
                handleBindingComplete(urls?.idleModelUrl, urls?.talkingModelUrl);
              }
            }
            
            // 设置 isBound: true 并进入对话页
            console.log('[BindPage] 设置 isBound: true 并导航到对话页面');
            updateCompanion({ isBound: true });
            navigate('/chat');
          }}
        />
      </div>
    </PageContainer>
  );
};

const ChatPage: React.FC<{ companion: Companion | null }> = ({ companion }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isDriving, setIsDriving] = useState(false); // Controls the 3D model animation
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice'); // 语音：静态势波形；文字：输入框
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(false); // WebSocket 连接中
  const [modelLoading, setModelLoading] = useState(true); // 模型加载中
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const audioUnlockedRef = useRef<boolean>(false); // 音频是否已解锁（Capacitor 需要）
  const audioQueueRef = useRef<Array<{ url: string; isFirst: boolean; isEnd: boolean }>>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  /** 上一段已播放的音频 URL，避免同一段重复播 */
  const lastPlayedAudioUrlRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  /** 用 effect 自增 id 只保留最后一次建立的连接，避免旧连接残留 */
  const wsEffectRunIdRef = useRef<number>(0);
  /** 同步标记「已开始连接」，避免并发重复连 */
  const wsConnectStartedRef = useRef<boolean>(false);
  /** 当前回复占位消息 id（WebSocket 首包复用；HTTP 回复全文打字用） */
  const currentAudioMessageIdRef = useRef<string | null>(null);
  /** HTTP 发消息后占位 id 与回复全文，用于气泡打字 */
  const pendingHttpMessageIdRef = useRef<string | null>(null);
  const pendingHttpResponseTextRef = useRef<string>('');
  const pendingHttpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 本轮是否优先等 WebSocket 文本包；超时再退回 HTTP 文本 */
  const preferWebSocketReplyRef = useRef<boolean>(false);
  const pendingWebSocketSendAtRef = useRef<number>(0);
  const navigate = useNavigate();
  const chatStorageKey = companion
    ? getChatMessagesStorageKey(companion.model_id, companion.id)
    : null;
  /** 始终指向当前 companion，避免父组件每次新引用导致 loadMessageHistory 重建并反复触发「加载历史」覆盖正在聊的内容 */
  const companionRef = useRef<Companion | null>(companion);
  companionRef.current = companion;

  // 历史消息缓存，避免重复加载
  const messageCacheRef = useRef<Map<string, { messages: ChatMessage[], timestamp: number }>>(new Map());
  const loadHistoryTimeoutRef = useRef<number | null>(null);
  /** 逐字显示用定时器，只保留当前正在打字的一条 */
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 是否有 typewriter 在打字；用于决定是否在打字结束后再停驱动 */
  const typewriterActiveRef = useRef(false);
  /** 当前打字机对应的消息 id 与完整目标文本，避免拿屏幕上的半截文本继续拼接 */
  const typewriterMessageIdRef = useRef<string | null>(null);
  const typewriterTargetTextRef = useRef<string>('');

  const buildWelcomeMessages = useCallback((): ChatMessage[] => {
    if (!companion?.isBound) return [];
    return [{
      id: `welcome-${Date.now()}`,
      role: 'model',
      text: `系统已就绪。我是 ${companion.name}。`,
      timestamp: Date.now(),
    }];
  }, [companion]);

  /**
   * 对指定消息做逐字显示（打字机）
   * @param messageId 消息 id
   * @param fullText 完整文案
   * @param startIndex 从第几个字符开始显示，默认 0
   * @param charMs 每字间隔毫秒，默认 100（可与语音节奏接近）
   * @param onComplete 打完回调（用于文字播完后再停驱动）
   */
  const typewriterToMessage = useCallback((
    messageId: string,
    fullText: string,
    startIndex: number = 0,
    charMs: number = 100,
    onComplete?: () => void
  ) => {
    typewriterMessageIdRef.current = messageId;
    typewriterTargetTextRef.current = fullText;
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    if (startIndex >= fullText.length) {
      typewriterActiveRef.current = false;
      onComplete?.();
      return;
    }
    typewriterActiveRef.current = true;
    let index = startIndex;
    typewriterIntervalRef.current = setInterval(() => {
      index += 1;
      const slice = fullText.slice(0, index);
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, text: slice } : m)
      );
      if (index >= fullText.length && typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
        typewriterActiveRef.current = false;
        typewriterMessageIdRef.current = null;
        onComplete?.();
      }
    }, charMs);
  }, []);

  useEffect(() => {
    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
    };
  }, []);

  // useMemo 稳定 companion 关键字段，避免 effect 无意义重跑
  const companionKey = useMemo(() => {
    if (!companion) return null;
    return `${companion.id}_${companion.model_id}_${companion.isBound}`;
  }, [companion?.id, companion?.model_id, companion?.isBound]);

  const normalizeChatRole = useCallback((rawRole: unknown): ChatMessage['role'] => {
    const role = String(rawRole ?? '').toLowerCase();
    if (role === 'user' || role === 'member' || role === 'human') {
      return 'user';
    }
    return 'model';
  }, []);

  const normalizeChatMessages = useCallback((rawMessages: any[]): ChatMessage[] => {
    return rawMessages
      .map((msg, index) => {
        const rawTimestamp =
          typeof msg?.timestamp === 'number'
            ? msg.timestamp
            : typeof msg?.createtime === 'number'
              ? msg.createtime * 1000
              : Date.now() + index;

        return {
          id: String(msg?.id ?? `${rawTimestamp}-${index}`),
          role: normalizeChatRole(msg?.role ?? msg?.type),
          text:
            typeof msg?.text === 'string'
              ? msg.text
              : typeof msg?.content === 'string'
                ? msg.content
                : '',
          timestamp: rawTimestamp,
        };
      })
      .filter((msg) => msg.text.trim().length > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [normalizeChatRole]);

  // 从后端加载历史消息（仅依赖 normalizeChatMessages；当前角色用 companionRef 读取，避免引用抖动）
  const loadMessageHistory = useCallback(async (modelId?: string) => {
    const c = companionRef.current;
    if (!c) return;

    // 若 5 分钟内已加载过同一模型的消息，直接用缓存
    const cacheKey = modelId || c.model_id || '';
    const cached = messageCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('[ChatPage] 使用缓存的历史消息');
      setMessages(cached.messages);
      return;
    }

    const storageKey = getChatMessagesStorageKey(modelId || c.model_id, c.id);
    try {
      const storedRaw = localStorage.getItem(storageKey);
      if (storedRaw) {
        const storedMessages = JSON.parse(storedRaw);
        const normalizedStoredMessages = Array.isArray(storedMessages)
          ? normalizeChatMessages(storedMessages)
          : [];
        if (normalizedStoredMessages.length > 0) {
          console.log('[ChatPage] 使用本地持久化聊天记录');
          messageCacheRef.current.set(cacheKey, {
            messages: normalizedStoredMessages,
            timestamp: Date.now(),
          });
          setMessages(normalizedStoredMessages);
          return;
        }
      }
    } catch (storageError) {
      console.warn('[ChatPage] 读取本地聊天记录失败，回退后端历史:', storageError);
    }
    
    try {
      setIsLoadingHistory(true);
      const { getFayApiUrl } = await import('./services/apiConfig');
      const apiUrl = getFayApiUrl();
      
      const response = await fetch(`${apiUrl}/api/get-msg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(JSON.stringify({ 
          username: 'User',
          model_id: modelId || c.model_id 
        }))}`,
      });

      if (!response.ok) {
        throw new Error(`加载历史消息失败: ${response.status}`);
      }

      const result = await response.json();
      if (result.list && Array.isArray(result.list)) {
        // 将后端消息转为前端 ChatMessage
        const historyMessages = normalizeChatMessages(result.list);

        // 写入缓存
        messageCacheRef.current.set(cacheKey, {
          messages: historyMessages.length > 0 ? historyMessages : [],
          timestamp: Date.now()
        });

        // 有历史则用历史，否则显示欢迎语
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        } else if (c.isBound) {
          const welcomeMessage = [{ 
            id: 'welcome', 
            role: 'model' as const, 
            text: `系统已就绪。我是 ${c.name}。`,
            timestamp: Date.now() 
          }];
          messageCacheRef.current.set(cacheKey, {
            messages: welcomeMessage,
            timestamp: Date.now()
          });
          setMessages(welcomeMessage);
        }
      }
    } catch (error) {
      console.error('加载历史消息失败:', error);
      // 加载失败则显示欢迎语（用函数式更新避免闭包里的 messages 过期）
      if (c.isBound) {
        setMessages((prev) => {
          if (prev.length > 0) return prev;
          return [
            {
              id: 'welcome',
              role: 'model' as const,
              text: `系统已就绪。我是 ${c.name}。`,
              timestamp: Date.now(),
            },
          ];
        });
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [normalizeChatMessages]);

  // companion 变化时加载对应历史（防抖，避免频繁触发）
  useEffect(() => {
    // 重置模型加载状态
    setModelLoading(true);
    
    // 清除之前的定时器
    if (loadHistoryTimeoutRef.current) {
      clearTimeout(loadHistoryTimeoutRef.current);
    }

    // 防抖：延迟 300ms，避免频繁触发（用 ref 读当前角色，避免定时触发时闭包过期）
    loadHistoryTimeoutRef.current = window.setTimeout(() => {
      const c = companionRef.current;
      if (c && c.isBound) {
        loadMessageHistory(c.model_id);
      } else {
        // 未绑定则清空消息
        setMessages([]);
      }
    }, 300);

    return () => {
      if (loadHistoryTimeoutRef.current) {
        clearTimeout(loadHistoryTimeoutRef.current);
      }
    };
  }, [companionKey, loadMessageHistory]); // 稳定的 companionKey 与 loadMessageHistory

  // WebSocket URL 缓存（sessionStorage，关页后清除）
  const getCachedWsUrl = (): string | null => {
    try {
      return sessionStorage.getItem('websocket_cached_url');
    } catch {
      return null;
    }
  };

  const setCachedWsUrl = (url: string) => {
    try {
      sessionStorage.setItem('websocket_cached_url', url);
    } catch {
      // 忽略存储异常
    }
  };

  // WebSocket：接收 TTS 音频（依赖项保持稳定）
  const isBound = useMemo(() => companion?.isBound ?? false, [companion?.isBound]);
  
  useEffect(() => {
    if (!companion || !isBound) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      wsConnectStartedRef.current = false;
      return;
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('[ChatPage] WebSocket 已连接，跳过重复连接');
      return;
    }
    if (wsConnectStartedRef.current) {
      return;
    }
    wsConnectStartedRef.current = true;

    const runId = ++wsEffectRunIdRef.current;

    const connectWebSocket = async () => {
      setWsConnecting(true);
      try {
        const { getFayApiUrl } = await import('./services/apiConfig');
        const apiUrl = getFayApiUrl();

        // 解析主机与协议（含端口）
        const api = new URL(apiUrl);
        const scheme = api.protocol === 'https:' ? 'wss' : 'ws';

        // 优先走 /human_ws 反代，其次直连 :10003
        const wsUrl = `${scheme}://${api.host}/human_ws`;
        const directWsUrl = `${scheme}://${api.hostname}:10003`;

        // 候选 URL 列表，按优先级重试
        const candidateUrls = [wsUrl, directWsUrl];

        // 若有缓存的成功 URL，优先试它
        const cachedUrl = getCachedWsUrl();
        const prioritizedUrls = cachedUrl && candidateUrls.includes(cachedUrl)
          ? [cachedUrl, ...candidateUrls.filter(u => u !== cachedUrl)]
          : candidateUrls;

        console.log('[ChatPage] 将尝试连接 WebSocket 候选地址:', prioritizedUrls);

        const createWsWithTimeout = (url: string, timeoutMs = 2000) => {
          return new Promise<WebSocket>((resolve, reject) => {
            try {
              const socket = new WebSocket(url);
              const timer = setTimeout(() => {
                try { socket.close(); } catch {}
                reject(new Error(`WebSocket 连接超时: ${url}`));
              }, timeoutMs);
              socket.onopen = () => {
                clearTimeout(timer);
                resolve(socket);
              };
              socket.onerror = (err) => {
                clearTimeout(timer);
                reject(err instanceof Event ? new Error(`WebSocket 错误: ${url}`) : (err as any));
              };
            } catch (e) {
              reject(e);
            }
          });
        };

        // 串行尝试连接，避免并行导致频繁断开
        // 按优先级逐个试，仅当前一个失败再试下一个
        let connected = false;
        for (const url of prioritizedUrls) {
          if (connected) break;
          try {
            const ws = await createWsWithTimeout(url, 2000);
            if (runId !== wsEffectRunIdRef.current) {
              ws.close();
              setWsConnecting(false);
              wsConnectStartedRef.current = false;
              return;
            }
            console.log('[ChatPage] WebSocket 连接成功:', url);
            setCachedWsUrl(url);
            if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
            }
            setupWebSocketHandlers(ws);
            wsRef.current = ws;
            setWsConnecting(false);
            wsConnectStartedRef.current = false;
            connected = true;
            break;
          } catch (error) {
            console.log(`[ChatPage] 连接 ${url} 失败，尝试下一个…`, error);
            continue;
          }
        }
        
        if (!connected) {
          console.error('[ChatPage] 所有 WebSocket 候选地址均连接失败');
          setWsConnecting(false);
          wsConnectStartedRef.current = false;
          return;
        }
      } catch (error) {
        console.error('[ChatPage] WebSocket 连接失败:', error);
        setWsConnecting(false);
        wsConnectStartedRef.current = false;
      }
    };

    /**
     * 注册 WebSocket 事件
     * @param ws WebSocket 实例
     */
    const setupWebSocketHandlers = (ws: WebSocket) => {
        ws.onopen = () => {
          console.log('[ChatPage] WebSocket 连接已建立');
          setWsConnecting(false);
          // 连接成功，重置重连计数
          reconnectAttemptsRef.current = 0;
          // 发送用户名与输出设置，用于标识连接
          const initMessage = { 
            Username: 'User', 
            Output: true 
          };
          console.log('[ChatPage] 发送初始化消息:', initMessage);
          ws.send(JSON.stringify(initMessage));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // 处理音频消息
            if (data.Topic === 'human' && data.Data && data.Data.HttpValue) {
              const audioUrl = data.Data.HttpValue;
              const isFirst = data.Data.IsFirst === 1;
              const isEnd = data.Data.IsEnd === 1;

              console.log('[ChatPage] 收到音频消息:', {
                audioUrl,
                isFirst,
                isEnd,
                queueLength: audioQueueRef.current.length
              });

              // 首段：创建或复用一条 model 消息。
              // 这里不要取消 HTTP 文本兜底；部分链路只有音频包，没有 panelReply 文本包。
              // 若提前清掉兜底，当前回复会一直空白，直到刷新后重拉历史才显示。
              if (isFirst) {
                lastPlayedAudioUrlRef.current = null;
                setMessages(prev => {
                  if (prev.length === 0) return prev;
                  const last = prev[prev.length - 1];
                  if (last?.role === 'model' && last?.text === '') {
                    currentAudioMessageIdRef.current = last.id;
                    pendingHttpMessageIdRef.current = last.id;
                    return prev;
                  }
                  if (last?.role === 'user') {
                    const newId = Date.now().toString();
                    currentAudioMessageIdRef.current = newId;
                    pendingHttpMessageIdRef.current = newId;
                    return [...prev, { id: newId, role: 'model', text: '', timestamp: Date.now() }];
                  }
                  return prev;
                });
              }

              // 入队（同一 url 不重复入队）
              if (!audioQueueRef.current.some((item) => item.url === audioUrl)) {
                audioQueueRef.current.push({ url: audioUrl, isFirst, isEnd });
              }
              
              // 首段延后处理队列，确保 setState 与 currentAudioMessageIdRef 已更新
              if (isFirst) {
                setTimeout(() => processAudioQueue(), 0);
              } else {
                processAudioQueue();
              }

              // 首条消息时更新 UI 驱动状态
              if (isFirst) {
                setIsDriving(true);
              }

              // 末段且无打字机在打字时再停驱动（字未打完则保持驱动）
              if (isEnd && !typewriterActiveRef.current) {
                setTimeout(() => setIsDriving(false), 1000);
              }
            } else if (data.liveState !== undefined || data.panelMsg !== undefined) {
              // 忽略 Fay 内部状态消息，避免控制台噪音与「仍走文本链路」的错觉
            } else if (import.meta.env.DEV) {
              // 开发环境保留少量未知消息的调试出口
              console.debug('[ChatPage] 未处理的 WebSocket 消息:', {
                Topic: data.Topic,
                hasData: !!data.Data,
                keys: Object.keys(data),
              });
            }

            // 文本消息（若有）：优先使用数字人主链路的 fay 文本实时写气泡
            if (data.panelReply) {
              if (data.panelReply.type === 'member') {
                console.log('[ChatPage] 跳过用户回显 panelReply，避免重复显示:', data.panelReply);
                return;
              }

              setIsDriving(true);
              if (pendingHttpTimeoutRef.current) {
                clearTimeout(pendingHttpTimeoutRef.current);
                pendingHttpTimeoutRef.current = null;
              }
              preferWebSocketReplyRef.current = false;

              const fallbackMessageId = currentAudioMessageIdRef.current || pendingHttpMessageIdRef.current;
              const messageId =
                fallbackMessageId ||
                data.panelReply.id?.toString() ||
                Date.now().toString();
              const content = data.panelReply.content || '';
              console.log('[ChatPage] 收到 panelReply 文本:', {
                id: messageId,
                replyId: data.panelReply.id,
                type: data.panelReply.type,
                content,
              });
              const onComplete = () => setTimeout(() => setIsDriving(false), 2000);
              currentAudioMessageIdRef.current = messageId;
              pendingHttpMessageIdRef.current = null;
              setMessages(prev => {
                const existingIndex = prev.findIndex(m => m.id === messageId);
                if (existingIndex >= 0) {
                  const currentText =
                    typewriterMessageIdRef.current === messageId
                      ? typewriterTargetTextRef.current
                      : prev[existingIndex].text;
                  const fullText = currentText + content;
                  console.log('[ChatPage] 实时回复累计文本:', fullText);
                  setTimeout(() => typewriterToMessage(messageId, fullText, currentText.length, 90, onComplete), 0);
                  return prev;
                } else {
                  console.log('[ChatPage] 实时回复首段文本:', content);
                  setTimeout(() => typewriterToMessage(messageId, content, 0, 90, onComplete), 0);
                  return [...prev, { id: messageId, role: 'model', text: '', timestamp: Date.now() }];
                }
              });
            }
          } catch (error) {
            console.error('[ChatPage] 解析 WebSocket 消息失败:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('[ChatPage] WebSocket 错误:', error);
          const wsTarget = error.target as WebSocket;
          console.error('[ChatPage] WebSocket 错误详情:', {
            readyState: wsTarget?.readyState,
            url: wsTarget?.url || wsRef.current?.url,
            error: error
          });
          
          // Capacitor 下 WebSocket 可能不可用，HTTP 轮询作备选
          if (isCapacitor()) {
            console.warn('[ChatPage] Capacitor 环境下 WebSocket 连接失败，将使用 HTTP 轮询作为备选');
          }
        };

        ws.onclose = (event) => {
          console.log('[ChatPage] WebSocket 连接已关闭', {
            code: event.code,
            reason: event.reason || '无原因',
            wasClean: event.wasClean,
            url: wsRef.current?.url
          });
          wsRef.current = null;
          
          // 异常断开（如 code 1006）清除 URL 缓存
          if (event.code === 1006) {
            try {
              sessionStorage.removeItem('websocket_cached_url');
            } catch {}
            if (isCapacitor()) {
              console.warn('[ChatPage] WebSocket 异常关闭（可能是网络问题），Capacitor 环境下建议检查网络连接');
            }
          }
          
          // 非正常关闭才重连，指数退避
          if (event.code !== 1000 && companion && isBound) {
            const attempts = reconnectAttemptsRef.current;
            const maxReconnectAttempts = 5;
            
            if (attempts < maxReconnectAttempts) {
              // 指数退避：5s、10s、20s…上限 30s
              const delay = Math.min(5000 * Math.pow(2, attempts), 30000);
              console.log(`[ChatPage] 将在 ${delay / 1000} 秒后尝试重连（第 ${attempts + 1}/${maxReconnectAttempts} 次）...`);
              reconnectAttemptsRef.current = attempts + 1;
              
              setTimeout(() => {
                if (companion && isBound && !wsRef.current) {
                  console.log('[ChatPage] 开始重连 WebSocket...');
                  connectWebSocket();
                }
              }, delay);
            } else {
              console.error('[ChatPage] 达到最大重连次数，停止重连。请检查网络连接或刷新页面。');
              reconnectAttemptsRef.current = 0; // 重置，允许用户手动再连
            }
          } else {
            // 正常关闭（code 1000），重置重连次数
            reconnectAttemptsRef.current = 0;
          }
        };
    };

    connectWebSocket();

    // 清理：始终关掉当前连接，避免热更新下双连接导致重复消息/重复音频
    return () => {
      wsConnectStartedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close(1000, 'component cleanup');
        wsRef.current = null;
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, [isBound, companion]); // 稳定的 isBound 与 companion

  /**
   * 处理音频播放队列（顺序播放、避免叠音）
   */
  const processAudioQueue = async () => {
    // 正在处理或队列为空则返回
    if (isProcessingQueueRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    // 正在播则等当前段结束
    if (isPlayingRef.current && audioPlayerRef.current) {
      console.log('[ChatPage] 正在播放音频，等待完成后继续队列');
      return;
    }

    // 开始消费队列
    isProcessingQueueRef.current = true;

    while (audioQueueRef.current.length > 0) {
      // 若正在播放则等待结束
      if (isPlayingRef.current) {
        console.log('[ChatPage] 等待当前音频播放完成...');
        // 轮询等待播放结束
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
          
          // 超时：最多等 5 秒
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
      }

      // 取出队首音频
      const audioItem = audioQueueRef.current.shift();
      if (!audioItem) {
        break;
      }
      if (audioItem.url === lastPlayedAudioUrlRef.current) {
        continue;
      }
      lastPlayedAudioUrlRef.current = audioItem.url;

      console.log('[ChatPage] 从队列取出音频:', audioItem, '剩余队列长度:', audioQueueRef.current.length);
      try {
        await playAudio(audioItem.url, audioItem.isFirst, audioItem.isEnd);
        
        // 等待本段播完
        if (audioItem.isEnd) {
          // 末段再等播放完全结束
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
            
            // 设置瓒呮椂
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 5000);
          });
        }
      } catch (error) {
        console.error('[ChatPage] 播放队列音频失败:', error);
        // 继续下一段
      }
    }

    // 队列处理结束
    isProcessingQueueRef.current = false;
    console.log('[ChatPage] 音频队列处理完成');
  };

  /**
   * 播放一段 TTS 音频
   * @param audioUrl 音频 URL
   * @param isFirst 是否首段
   * @param isEnd 是否末段
   */
  const playAudio = async (
    audioUrl: string,
    isFirst: boolean,
    isEnd: boolean
  ): Promise<void> => {
    // 先在 Promise 外处理 URL 与解锁
    let fullAudioUrl = audioUrl;
    if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
      // 相对路径则拼接 API 根 URL
      const apiConfigModule = await import('./services/apiConfig');
      const apiUrl = apiConfigModule.getFayApiUrl();
      if (audioUrl.startsWith('/')) {
        fullAudioUrl = `${apiUrl}${audioUrl}`;
      } else {
        fullAudioUrl = `${apiUrl}/${audioUrl}`;
      }
    }

    // Capacitor 下若未解锁音频，先尝试解锁
    if (isCapacitor() && !audioUnlockedRef.current) {
      console.log('[ChatPage] Capacitor 环境音频未解锁，尝试解锁...');
      try {
        const unlockAudio = new Audio();
        unlockAudio.volume = 0.01;
        unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        await unlockAudio.play();
        unlockAudio.pause();
        unlockAudio.src = '';
        audioUnlockedRef.current = true;
        console.log('[ChatPage] 音频已解锁');
      } catch (unlockError) {
        console.warn('[ChatPage] 音频解锁失败，继续尝试播放:', unlockError);
      }
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[ChatPage] 准备播放音频:', { audioUrl: fullAudioUrl, isFirst, isEnd, isCapacitor: isCapacitor() });
        
        // 若已有音频在播先停（理论上不应发生，队列已串行）
        if (audioPlayerRef.current && isPlayingRef.current) {
          console.log('[ChatPage] 警告：停止当前播放的音频（不应发生）');
          audioPlayerRef.current.pause();
          audioPlayerRef.current = null;
          isPlayingRef.current = false;
        }

      console.log('[ChatPage] 完整音频 URL:', fullAudioUrl);

      // 创建新的 Audio 元素
      const audio = new Audio();
      audioPlayerRef.current = audio;
      
      // 音频属性
      audio.volume = 1.0;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous'; // 允许跨域（若需要）
      
      // 绑定音频事件
      setupAudioEvents(audio, isEnd, fullAudioUrl);
      
      // 先设 src，再等可播放
      audio.src = fullAudioUrl;
      
      // 等待 canplay
      const canPlayHandler = () => {
        console.log('[ChatPage] 音频可以播放，准备播放');
        audio.removeEventListener('canplay', canPlayHandler);
        audio.removeEventListener('canplaythrough', canPlayHandler);
        
        // Capacitor 下确认已解锁
        if (isCapacitor() && !audioUnlockedRef.current) {
          console.warn('[ChatPage] Capacitor 环境下音频未解锁，尝试解锁...');
          // 尝试解锁
          const unlockAudio = new Audio();
          unlockAudio.volume = 0.01;
          unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          unlockAudio.play()
            .then(() => {
              unlockAudio.pause();
              unlockAudio.src = '';
              audioUnlockedRef.current = true;
              console.log('[ChatPage] 音频已解锁，继续播放');
              // 继续播实际音频
              tryPlayAudio();
            })
            .catch(() => {
              console.warn('[ChatPage] 音频解锁失败，但仍继续尝试播放');
              tryPlayAudio();
            });
        } else {
          tryPlayAudio();
        }
      };
      
      const tryPlayAudio = () => {
        console.log('[ChatPage] 尝试播放音频:', fullAudioUrl);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[ChatPage] 音频播放已启动');
              audioUnlockedRef.current = true; // 标记已解锁
              resolve(); // play() 已启动
            })
            .catch((error) => {
              console.error('[ChatPage] 播放音频失败:', error);
              console.error('[ChatPage] 错误详情:', {
                name: error.name,
                message: error.message,
                code: audio.error?.code,
                errorMessage: audio.error?.message,
                readyState: audio.readyState,
                networkState: audio.networkState,
                src: audio.src
              });
              
              // Capacitor：等用户手势后再播
              if (isCapacitor()) {
                console.warn('[ChatPage] Capacitor 环境下音频播放失败，等待用户交互...');
                
                const tryPlayOnInteraction = (event?: Event) => {
                  if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  
                  console.log('[ChatPage] 用户交互触发，重试播放音频');
                  audio.play()
                    .then(() => {
                      console.log('[ChatPage] 用户交互后音频播放成功');
                      audioUnlockedRef.current = true;
                      document.removeEventListener('click', tryPlayOnInteraction);
                      document.removeEventListener('touchstart', tryPlayOnInteraction);
                      document.removeEventListener('touchend', tryPlayOnInteraction);
                      resolve(); // 播放成功
                    })
                    .catch((err) => {
                      console.error('[ChatPage] 用户交互后仍然播放失败:', err);
                      console.error('[ChatPage] 最终错误:', {
                        name: err.name,
                        message: err.message,
                        code: audio.error?.code,
                        errorMessage: audio.error?.message
                      });
                      reject(err); // 播放失败
                    });
                };
                
                // 监听用户手势重试
                document.addEventListener('click', tryPlayOnInteraction, { once: true });
                document.addEventListener('touchstart', tryPlayOnInteraction, { once: true });
                document.addEventListener('touchend', tryPlayOnInteraction, { once: true });
              } else {
                reject(error); // 非 Capacitor 直接失败
              }
            });
        } else {
          resolve(); // 无 playPromise 则直接 resolve
        }
      };
      
      audio.addEventListener('canplay', canPlayHandler);
      audio.addEventListener('canplaythrough', canPlayHandler);
      
      // 已可播则直接走 canPlayHandler
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        console.log('[ChatPage] 音频已就绪，立即播放');
        canPlayHandler();
      }
      
      // 加载超时则尝试直接 play（仅当尚未开始播且未 ended，避免播完又被超时逻辑再播）
      setTimeout(() => {
        if (!isPlayingRef.current && !audio.ended) {
          const readyState = audio.readyState;
          console.log('[ChatPage] 音频加载超时检查，readyState:', readyState);
          if (readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            console.log('[ChatPage] 音频加载超时，但数据已就绪，尝试播放');
            tryPlayAudio();
          } else {
            console.warn('[ChatPage] 音频加载超时，数据未就绪，readyState:', readyState);
            reject(new Error('音频加载超时'));
          }
        }
      }, 2000);
      
    } catch (error) {
      console.error('[ChatPage] 创建音频播放器失败:', error);
      reject(error); // 创建播放器异常
    }
  });
  };

  /**
   * 绑定音频事件监听
   */
  const setupAudioEvents = (
    audio: HTMLAudioElement,
    isEnd: boolean,
    fullAudioUrl?: string
  ) => {
    // 音量等
    audio.volume = 1.0; // 最大音量
    audio.preload = 'auto';

    audio.onloadstart = () => {
      console.log('[ChatPage] 音频开始加载');
    };

    audio.oncanplay = () => {
      console.log('[ChatPage] 音频可以播放');
    };

    audio.onplay = () => {
      isPlayingRef.current = true;
      console.log('[ChatPage] 开始播放音频:', fullAudioUrl || '未知 URL');
    };

    audio.onended = () => {
      isPlayingRef.current = false;
      console.log('[ChatPage] 音频播放完成');
      if (isEnd) {
        setIsDriving(false);
      }
      // 播完后继续跑队列
      setTimeout(() => {
        processAudioQueue();
      }, 50);
    };

    audio.onerror = (error) => {
      isPlayingRef.current = false;
      console.error('[ChatPage] 音频播放失败:', error);
      console.error('[ChatPage] 音频错误详情:', {
        error: audio.error,
        code: audio.error?.code,
        message: audio.error?.message,
        url: fullAudioUrl
      });
      if (isEnd) {
        setIsDriving(false);
      }
    };

    audio.onabort = () => {
      console.warn('[ChatPage] 音频加载被中止');
      isPlayingRef.current = false;
    };
  };

  // 解锁音频（Capacitor 需用户交互）
  useEffect(() => {
    if (isCapacitor() && !audioUnlockedRef.current) {
      console.log('[ChatPage] 检测到 Capacitor 环境，准备解锁音频播放');
      
      // 用极短静音片解锁播放权限
      const unlockAudio = () => {
        if (audioUnlockedRef.current) return;
        
        try {
          const unlockAudio = new Audio();
          unlockAudio.volume = 0.01; // 近乎静音
          unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          
          const playPromise = unlockAudio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('[ChatPage] 音频播放已解锁');
                audioUnlockedRef.current = true;
                unlockAudio.pause();
                unlockAudio.src = '';
              })
              .catch((error) => {
                console.warn('[ChatPage] 音频解锁失败，将在用户交互时重试:', error);
              });
          }
        } catch (error) {
          console.warn('[ChatPage] 音频解锁异常:', error);
        }
      };

      // 首次用户交互时解锁
      const unlockOnInteraction = () => {
        unlockAudio();
        document.removeEventListener('click', unlockOnInteraction);
        document.removeEventListener('touchstart', unlockOnInteraction);
        document.removeEventListener('touchend', unlockOnInteraction);
      };

      document.addEventListener('click', unlockOnInteraction, { once: true });
      document.addEventListener('touchstart', unlockOnInteraction, { once: true });
      document.addEventListener('touchend', unlockOnInteraction, { once: true });
    }
  }, []);

  // 新消息时滚到底部
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isChatExpanded]);

  useEffect(() => {
    if (!chatStorageKey || !companion) return;
    const cacheKey = companion.model_id || '';
    try {
      if (messages.length === 0) {
        localStorage.removeItem(chatStorageKey);
        if (cacheKey) messageCacheRef.current.delete(cacheKey);
        return;
      }
      const slice = messages.slice(-100);
      localStorage.setItem(chatStorageKey, JSON.stringify(slice));
      if (cacheKey) {
        messageCacheRef.current.set(cacheKey, { messages: slice, timestamp: Date.now() });
      }
    } catch (error) {
      console.warn('[ChatPage] 保存本地聊天记录失败:', error);
    }
  }, [chatStorageKey, messages, companion]);

  const handleClearCurrentChat = useCallback(async () => {
    if (!companion) return;

    const nextMessages = buildWelcomeMessages();
    const cacheKey = companion.model_id || '';

    try {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
      typewriterActiveRef.current = false;
      typewriterMessageIdRef.current = null;
      typewriterTargetTextRef.current = '';
      pendingHttpMessageIdRef.current = null;
      pendingHttpResponseTextRef.current = '';
      if (pendingHttpTimeoutRef.current) {
        clearTimeout(pendingHttpTimeoutRef.current);
        pendingHttpTimeoutRef.current = null;
      }
      currentAudioMessageIdRef.current = null;
      preferWebSocketReplyRef.current = false;
      pendingWebSocketSendAtRef.current = 0;
      audioQueueRef.current = [];
      isProcessingQueueRef.current = false;
      lastPlayedAudioUrlRef.current = null;
      isPlayingRef.current = false;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = '';
      }

      if (companion.model_id) {
        await modelService.clearModelHistory(companion.model_id);
      }
    } catch (error) {
      console.warn('[ChatPage] 清除当前角色聊天记录时后端返回异常，继续清理本地记录:', error);
    } finally {
      if (cacheKey) {
        messageCacheRef.current.delete(cacheKey);
      }
      if (chatStorageKey) {
        localStorage.removeItem(chatStorageKey);
      }
      setInput('');
      setIsDriving(false);
      setMessages(nextMessages);
    }
  }, [buildWelcomeMessages, chatStorageKey, companion]);

  const handleSend = async () => {
    sendMessageWithText(input.trim());
  };

  /**
   * 按给定文本发送一条消息（键盘发送与语音识别结果自动发送共用）
   * @param text 要发送的文本
   */
  const sendMessageWithText = async (text: string) => {
    if (!text.trim() || !companion) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: text.trim(), timestamp: Date.now() };
    const newId = (Date.now() + 1).toString();
    const shouldPreferWebSocketReply = true;
    if (pendingHttpTimeoutRef.current) {
      clearTimeout(pendingHttpTimeoutRef.current);
      pendingHttpTimeoutRef.current = null;
    }
    currentAudioMessageIdRef.current = null;
    pendingHttpMessageIdRef.current = null;
    pendingHttpResponseTextRef.current = '';
    preferWebSocketReplyRef.current = false;
    typewriterMessageIdRef.current = null;
    typewriterTargetTextRef.current = '';

    // flushSync：立刻追加用户消息与空的 model 占位，便于后续写入回复
    flushSync(() => {
      setMessages(prev => {
        const placeholder = { id: newId, role: 'model' as const, text: '', timestamp: Date.now() };
        return [...prev, userMsg, placeholder];
      });
      setInput('');
      setIsDriving(true);
    });
    pendingHttpMessageIdRef.current = newId;
    preferWebSocketReplyRef.current = shouldPreferWebSocketReply;

    const sendTime = Date.now();
    pendingWebSocketSendAtRef.current = sendTime;

    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const responseText = await chatWithCompanion(companion, history, text.trim());
      const textToShow = responseText;
      console.log('[ChatPage] HTTP 对话接口返回文本（兜底/对照）:', textToShow);
      pendingHttpResponseTextRef.current = textToShow;
      if (pendingHttpTimeoutRef.current) clearTimeout(pendingHttpTimeoutRef.current);
      pendingHttpTimeoutRef.current = null;
      if (shouldPreferWebSocketReply) {
        // WebSocket 已通时让 HTTP 仅作兜底，避免与 panelReply 双写导致重复与卡顿
        pendingHttpTimeoutRef.current = setTimeout(() => {
          const fallbackMessageId = currentAudioMessageIdRef.current || pendingHttpMessageIdRef.current;
          if (
            preferWebSocketReplyRef.current &&
            fallbackMessageId &&
            pendingWebSocketSendAtRef.current === sendTime
          ) {
            typewriterToMessage(fallbackMessageId, pendingHttpResponseTextRef.current, 0, 90, () => {
              setTimeout(() => setIsDriving(false), 2000);
            });
            pendingHttpMessageIdRef.current = null;
            preferWebSocketReplyRef.current = false;
          }
          pendingHttpTimeoutRef.current = null;
        }, 1800);
      } else {
        const messageId = currentAudioMessageIdRef.current || pendingHttpMessageIdRef.current;
        if (messageId) {
          typewriterToMessage(messageId, textToShow, 0, 90, () => {
            setTimeout(() => setIsDriving(false), 2000);
          });
          pendingHttpMessageIdRef.current = null;
        } else {
          pendingHttpTimeoutRef.current = setTimeout(() => {
            if (pendingHttpMessageIdRef.current) {
              typewriterToMessage(pendingHttpMessageIdRef.current, pendingHttpResponseTextRef.current, 0, 90, () => {
                setTimeout(() => setIsDriving(false), 2000);
              });
              pendingHttpMessageIdRef.current = null;
            }
            pendingHttpTimeoutRef.current = null;
          }, 2500);
        }
      }

      // Capacitor 且 WebSocket 未连上时，尝试用 HTTP 拉音频
      if (isCapacitor() && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        console.log('[ChatPage] WebSocket 未连接，尝试通过 HTTP 获取音频');
        setTimeout(() => {
          tryGetAudioFromHttp(sendTime, responseText);
        }, 2000);
      }
    } catch (error) {
      console.error('[ChatPage] 发送消息失败:', error);
      setIsDriving(false);
    }
  };

  /**
   * HTTP 轮询拉取 TTS 文件（WebSocket 不可用时的备选）
   * 轮询 /audio/sample-*.wav 等可能文件名
   */
  const tryGetAudioFromHttp = async (sendTime: number, text: string) => {
    try {
      const { getFayApiUrl } = await import('./services/apiConfig');
      const apiUrl = getFayApiUrl();
      
      console.log('[ChatPage] 开始通过 HTTP 获取音频，发送时间:', sendTime);
      
      // 轮询拉音频（最多 10 次，间隔 500ms）
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 500;
      
      const pollForAudio = setInterval(async () => {
        attempts++;
        console.log(`[ChatPage] 尝试获取音频 (${attempts}/${maxAttempts})`);
        
        // 按时间窗拼可能的 wav 名
        // 一般发消息后 1～5 秒内生成
        const timeWindow = sendTime + (attempts * pollInterval);
        const possibleAudioNames = [
          `sample-${timeWindow}.wav`,
          `sample-${timeWindow - 100}.wav`,
          `sample-${timeWindow - 200}.wav`,
          `sample-${timeWindow - 300}.wav`,
          `sample-${timeWindow - 400}.wav`,
        ];
        
        for (const audioName of possibleAudioNames) {
          const audioUrl = `${apiUrl}/audio/${audioName}`;
          
          try {
            // HEAD 探测是否存在（更快）
            const response = await fetch(audioUrl, { 
              method: 'HEAD',
              cache: 'no-cache'
            });
            
            if (response.ok) {
              console.log('[ChatPage] 找到音频文件:', audioUrl);
              clearInterval(pollForAudio);
              
              // 播放该文件
              playAudio(audioUrl, true, true).catch((error) => {
                console.error('[ChatPage] 播放 HTTP 获取的音频失败:', error);
              });
              return;
            }
          } catch (error) {
            // 试下一个文件名
            continue;
          }
        }
        
        // 达到最大次数则停止轮询
        if (attempts >= maxAttempts) {
          clearInterval(pollForAudio);
          console.warn('[ChatPage] 无法通过 HTTP 获取音频，可能 WebSocket 连接有问题或音频生成失败');
        }
      }, pollInterval);
      
    } catch (error) {
      console.error('[ChatPage] 通过 HTTP 获取音频失败:', error);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      // 停止录音
      if (recognitionRef.current) {
        // Web Speech API
        (recognitionRef.current as any).stop();
        recognitionRef.current = null;
      } else {
        // 用 audioService 停止录音
        try {
          const audioBlob = await audioService.stopRecording();
          if (audioBlob) {
            console.log('[ChatPage] 录音停止，音频大小:', audioBlob.size, 'bytes');
            // 上传并识别
            try {
              const transcript = await audioService.uploadAndRecognize(audioBlob, companion?.name || 'User');
              if (transcript && transcript.trim()) {
                sendMessageWithText(transcript);
                console.log('[ChatPage] 语音识别结果已发送:', transcript);
              }
            } catch (error) {
              console.error('[ChatPage] 语音识别失败:', error);
              alert('语音识别失败，请重试或使用文字输入');
            }
          }
        } catch (error) {
          console.error('[ChatPage] 停止录音失败:', error);
        }
      }
      setIsListening(false);
    } else {
      // 开始录音
      const useCapacitorRecorder = isCapacitor();
      
      if (useCapacitorRecorder) {
        // Capacitor：audioService 录音
        try {
          setIsChatExpanded(true); // 展开面板以显示语音条
          await audioService.startRecording();
          setIsListening(true);
          console.log('[ChatPage] 使用 audioService 开始录音（Capacitor 环境）');
        } catch (error) {
          console.error('[ChatPage] 启动录音失败:', error);
          alert(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      } else {
        // Web：优先 Web Speech API，失败再用 audioService
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          // Web Speech API
          const recognition = new SpeechRecognition();
          recognition.lang = 'zh-CN';
          recognition.continuous = false;
          recognition.interimResults = true;
          
          recognition.onstart = () => {
            setIsChatExpanded(true); // 展开面板以显示语音条
            setIsListening(true);
              console.log('[ChatPage] Web Speech API 录音已开始');
          };
          
          recognition.onresult = (event: any) => {
            const results = Array.from(event.results);
            const transcript = results
              .map((result: any) => result[0])
              .map((r: any) => r.transcript)
              .join('');
            const lastResult = results[results.length - 1];
            const isFinal = lastResult && (lastResult as any).isFinal;
            if (transcript && isFinal) {
              sendMessageWithText(transcript);
            }
          };
          
          recognition.onend = () => {
            setIsListening(false);
              console.log('[ChatPage] Web Speech API 录音已结束');
          };
          
          recognition.onerror = (event: any) => {
            console.error('[ChatPage] Web Speech API 错误:', event.error);
            setIsListening(false);
            // Web Speech 失败时退回 audioService
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
               alert('麦克风权限被拒绝，请允许访问麦克风');
            } else {
              console.log('[ChatPage] Web Speech API 失败，尝试使用 audioService');
              audioService.startRecording().then(() => {
                setIsChatExpanded(true);
                setIsListening(true);
              }).catch((err) => {
                alert(`启动录音失败: ${err.message}`);
              });
            }
          };
          
          recognition.start();
          recognitionRef.current = recognition;
        } else {
          // 浏览器无 Web Speech API，用 audioService
          try {
            setIsChatExpanded(true);
            await audioService.startRecording();
            setIsListening(true);
            console.log('[ChatPage] 使用 audioService 开始录音（浏览器不支持 Web Speech API）');
          } catch (error) {
            console.error('[ChatPage] 启动录音失败:', error);
            alert(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        }
      }
    }
  };

  if (!companion || !companion.isBound) {
    return (
      <PageContainer className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="mb-4 text-white/50">请先完成绑定流程</p>
        <Button onClick={() => navigate('/bind')}>前往绑定</Button>
      </PageContainer>
    );
  }

  // 无动画模型时仅静态展示（下面有 console 提示）
  const hasAnimationModels = !!(companion.idleModelUrl || companion.talkingModelUrl);
  if (!hasAnimationModels && companion.model3dUrl) {
    console.warn('[ChatPage] 当前模型没有配置动画模型文件');
    console.warn('[ChatPage] 模型将显示但不会动');
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-[#ffeef5] via-[#fff5e6] to-[#ffe4cc] overflow-hidden">
      {/* 3D 场景容器：固定尺寸，模型稳定显示 */}
      <div className="fixed inset-0 z-0">
        <div className="w-full h-full relative">
          {/* 模型加载占位 */}
          {modelLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#ffeef5] via-[#fff5e6] to-[#ffe4cc] z-10">
              <div className="text-center">
                <Cpu size={32} className="animate-spin text-purple-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">正在加载 3D 模型…</p>
                <p className="text-gray-500 text-xs mt-1">这可能需要几秒钟</p>
              </div>
            </div>
          )}
          <AvatarScene 
            idleModelUrl={companion.idleModelUrl || companion.model3dUrl}
            talkingModelUrl={companion.talkingModelUrl || companion.idleModelUrl || companion.model3dUrl}
            waveModelUrl={companion.waveModelUrl}
            modelUrl={companion.model3dUrl} // 向后兼容
            isTalking={isDriving}
            onLoadComplete={() => setModelLoading(false)}
            onLoadStart={() => setModelLoading(true)}
          />
        </div>
      </div>
      
      {/* Header 固定顶栏 */}
      <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-white/60 to-transparent backdrop-blur-md">
        <Button variant="ghost" className="rounded-full p-2 w-10 h-10 bg-white/60 hover:bg-white/80" onClick={() => navigate('/')}>
          <X size={20} />
        </Button>
        <div className="text-center">
            <h3 className="font-bold text-gray-700 drop-shadow-md">{companion.name}</h3>
            <div className="flex items-center gap-2 justify-center mt-1">
                {wsConnecting ? (
                  <>
                    <Cpu size={10} className="animate-spin text-blue-500" />
                    <span className="text-[10px] text-gray-600 bg-white/70 px-2 rounded-full border border-blue-300/40">
                      连接中…
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`w-2 h-2 rounded-full ${isDriving ? 'bg-green-500 animate-ping' : 'bg-green-600'}`}></span>
                    <span className="text-[10px] text-gray-600 bg-white/70 px-2 rounded-full border border-pink-300/40">
                      {isDriving ? 'Driving Model...' : 'Idle'}
                    </span>
                  </>
                )}
            </div>
        </div>
        <Button
          variant="ghost"
          className="rounded-full p-2 w-10 h-10 bg-white/60 hover:bg-white/80"
          onClick={handleClearCurrentChat}
          title="清空当前角色对话"
        >
          <Trash2 size={18} />
        </Button>
      </div>

      {/* 控制区：底栏上方固定，始终可点 */}
      <div className="fixed left-0 right-0 bottom-[84px] z-30 flex justify-center items-center gap-4 p-4">
        {!isChatExpanded && (
          <button 
            onClick={toggleListening} 
            className={`w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md border border-pink-300/50 shadow-2xl transition-all duration-300 ${isListening ? 'bg-red-500/80 animate-pulse scale-110' : 'bg-white/70 hover:bg-white/90'}`}
          >
            <Mic size={28} className="text-gray-700" />
          </button>
        )}
        <button 
          onClick={() => setIsChatExpanded(!isChatExpanded)} 
          className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-pink-300/40 text-xs font-medium text-gray-700 hover:bg-white/90 transition-colors flex items-center gap-2 shadow-lg"
        >
          {isChatExpanded ? <><ChevronDown size={14}/> 收起对话</> : <><ChevronUp size={14}/> 展开文字对话</>}
        </button>
      </div>

      {/* 聊天面板：固定定位；用 transform 收起，避免改 bottom/height 闪屏 */}
      <div 
        className={`fixed left-0 right-0 bottom-[72px] h-[48vh] z-40 bg-white/80 backdrop-blur-md border-t border-pink-300/50 rounded-t-3xl flex flex-col transition-transform duration-300 ease-out shadow-2xl ${
          isChatExpanded ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* 收起按钮 - 面板顶部 */}
        {isChatExpanded && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-2">
            <button 
              onClick={() => setIsChatExpanded(false)} 
              className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-full border border-pink-300/40 text-xs font-medium text-gray-700 hover:bg-white transition-colors flex items-center gap-2 shadow-md"
            >
              <ChevronDown size={14}/> 收起对话
            </button>
          </div>
        )}
        
        {/* 消息列表：固定高度可滚动；pt-6 为气泡上留白，可改为 pt-8/pt-10 */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto pt-6 px-4 pb-4 space-y-4 min-h-0"
        >
          {isLoadingHistory && (
            <div className="flex justify-center py-4">
              <div className="text-gray-600 text-sm flex items-center gap-2">
                <Cpu size={14} className="animate-spin" /> 加载历史消息…
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-sm ${msg.role === 'user' ? 'bg-primary/80 text-white rounded-tr-none' : 'bg-white/70 text-gray-700 rounded-tl-none'}`}>
                <p className="text-sm">{msg.text}</p>
              </div>
            </div>
          ))}
          {isDriving && (
            <div className="flex justify-start">
              <div className="bg-white/70 backdrop-blur-sm px-4 py-2 rounded-2xl rounded-tl-none text-xs text-gray-600 flex items-center gap-2">
                <Cpu size={12} className="animate-spin" /> 生成回复并驱动模型…
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
        
        {/* 输入区贴底；语音模式：点前静态波、点后动态波（微信风） */}
        <div className="flex-shrink-0 p-4 bg-white/90 backdrop-blur-sm border-t border-pink-300/50 flex gap-2 items-center shadow-lg">
          <Button variant="ghost" onClick={toggleListening} className={`p-2 rounded-full h-10 w-10 ${isListening ? 'text-red-500 bg-red-50' : ''}`}>
            <Mic size={20} />
          </Button>
          {inputMode === 'voice' ? (
            /* 语音条：与文字输入同高；波形中间高两边低 */
            (() => {
              const barCount = 20;
              const mid = (barCount - 1) / 2;
              const sigma = barCount / 3;
              const baseH = 6;
              const peakH = 14;
              const waveHeights = Array.from({ length: barCount }, (_, i) =>
                Math.round(baseH + peakH * Math.exp(-Math.pow((i - mid) / sigma, 2)))
              );
              const durations = [0.7, 1, 0.6, 1.1, 0.8, 1.2, 0.65, 1.05, 0.75, 1.15, 0.9, 1, 0.7, 1.1, 0.85, 0.8, 1.05, 0.9, 1.2, 0.7];
              return (
                <div 
                  className="flex-1 flex items-center justify-center bg-white/70 border border-pink-300/40 rounded-xl px-4 h-10 cursor-pointer hover:bg-white/90 transition-colors"
                  onClick={toggleListening}
                >
                  <div className="flex gap-1.5 h-8 items-end justify-center w-full" aria-hidden="true">
                    {waveHeights.map((h, i) => (
                      <span
                        key={i}
                        className="w-1.5 bg-gradient-to-t from-pink-500 to-pink-400 rounded-full origin-bottom flex-shrink-0"
                        style={isListening ? {
                          height: `${h}px`,
                          animation: `voiceBar ${durations[i]}s ease-in-out infinite`,
                          animationDelay: `${i * 0.05}s`,
                        } : {
                          height: `${h}px`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <input 
              className="flex-1 h-10 bg-white/70 border border-pink-300/40 rounded-xl px-4 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:border-primary/50 box-border" 
              placeholder="发送消息…" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setInputMode(m => m === 'voice' ? 'text' : 'voice')}
            title={inputMode === 'voice' ? '切换为文字输入' : '切换为语音输入'}
          >
            {inputMode === 'voice' ? <Keyboard size={20} className="text-gray-500" /> : <AudioLines size={20} className="text-pink-500" />}
          </Button>
          <Button onClick={handleSend} disabled={!input.trim()} className="h-10 w-10 p-0 rounded-xl shrink-0">
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface EmotionReportSummary {
  username: string;
  days: number;
  total: number;
  by_label: Record<string, number>;
  percentages: Record<string, number>;
  daily_trend: Record<string, Record<string, number>>;
  since: number;
  until: number;
}

const ManagePage: React.FC<{ companions: Companion[], activeCompanion: Companion | null, switchCompanion: (id: string) => void, updateCompanion: (c: Partial<Companion>) => void, deleteCompanion: (id: string) => void }> = ({ companions, activeCompanion, switchCompanion, updateCompanion, deleteCompanion }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showAnimationModal, setShowAnimationModal] = useState(false);
  const [showApiConfigModal, setShowApiConfigModal] = useState(false);
  const [showEmotionReportModal, setShowEmotionReportModal] = useState(false);
  const [modelUrl, setModelUrl] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [companionToDelete, setCompanionToDelete] = useState<string | null>(null);
  const [isUploadingIdle, setIsUploadingIdle] = useState(false);
  const [isUploadingTalking, setIsUploadingTalking] = useState(false);
  const [isUploadingModel3d, setIsUploadingModel3d] = useState(false);
  const [isSavingAnimation, setIsSavingAnimation] = useState(false);
  // 已上传但未点保存的模型 URL（未写库）
  const [pendingIdleUrl, setPendingIdleUrl] = useState<string | null>(null);
  const [pendingTalkingUrl, setPendingTalkingUrl] = useState<string | null>(null);
  const [pendingModel3dUrl, setPendingModel3dUrl] = useState<string | null>(null);
  const [emotionReportDays, setEmotionReportDays] = useState(7);
  const [emotionReportUser, setEmotionReportUser] = useState('User');
  const [emotionReportLoading, setEmotionReportLoading] = useState(false);
  const [emotionReportError, setEmotionReportError] = useState('');
  const [emotionReportData, setEmotionReportData] = useState<EmotionReportSummary | null>(null);
  const idleFileInputRef = useRef<HTMLInputElement>(null);
  const talkingFileInputRef = useRef<HTMLInputElement>(null);
  const model3dFileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 打开弹窗时同步 API 地址
  useEffect(() => {
    if (showApiConfigModal) {
      setApiUrl(APIConfig.getApiUrl());
      setConnectionStatus('idle');
      setConnectionMessage('');
    }
  }, [showApiConfigModal]);

  useEffect(() => {
    if (showEmotionReportModal) {
      setEmotionReportError('');
      setEmotionReportData(null);
      fetchEmotionReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEmotionReportModal]);

  const fetchEmotionReport = async () => {
    setEmotionReportLoading(true);
    setEmotionReportError('');
    try {
      const apiBase = APIConfig.getApiUrl();
      const resp = await fetch(`${apiBase}/api/emotion-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: emotionReportUser.trim() || 'User',
          days: emotionReportDays,
          // The report UI filters by user and date only, so aggregate across roles.
          model_id: null
        })
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.code !== 200) {
        throw new Error(payload?.message || '情绪报告获取失败');
      }
      setEmotionReportData(payload.data as EmotionReportSummary);
    } catch (error) {
      setEmotionReportError(error instanceof Error ? error.message : '情绪报告获取失败');
    } finally {
      setEmotionReportLoading(false);
    }
  };

  /**
   * 情绪趋势标签文案颜色（浅色卡片上用深色系保证对比度）
   * @param label - 后端返回的标签名，如 positive / negative
   * @returns Tailwind 文字色 class
   */
  const emotionTrendLabelClass = (label: string) => {
    const k = label.toLowerCase();
    if (k.includes('positive')) return 'text-emerald-700';
    if (k.includes('negative')) return 'text-rose-700';
    return 'text-gray-800';
  };

  /**
   * 每日趋势行内顺序：positive 在上、negative 在下，其余按标签名
   * @param labels - 某日各标签计数
   * @returns 排好序的 [标签, 数量] 列表
   */
  const sortEmotionDailyEntries = (labels: Record<string, number>): [string, number][] => {
    const rank = (label: string) => {
      const k = label.toLowerCase();
      if (k.includes('positive')) return 0;
      if (k.includes('negative')) return 1;
      return 2;
    };
    return Object.entries(labels).sort(([a], [b]) => {
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.localeCompare(b);
    });
  };

  /**
   * 选择 3D 模型文件并上传到服务器
   * @param file 所选文件
   */
  const handleModel3dFileSelect = async (file: File) => {
    if (!activeCompanion) return;
    
    setIsUploadingModel3d(true);
    
    try {
      console.log('[ManagePage] 开始上传 3D 模型文件:', file.name);
      
      const { modelService } = await import('./services/modelService');
      
      const serverUrl = await modelService.uploadModel(file, activeCompanion.model_id || undefined, 'source', activeCompanion.name);
      console.log('[ManagePage] 3D 模型上传成功，服务器 URL:', serverUrl);
      
      // 暂存，待用户点「保存配置」
      setPendingModel3dUrl(serverUrl);
      setModelUrl(serverUrl); // 同步输入框
      
      console.log('[ManagePage] 3D 模型 URL 已上传（请点击「保存配置」写入数据库）');
    } catch (error) {
      console.error('[ManagePage] 上传 3D 模型失败:', error);
      alert(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsUploadingModel3d(false);
    }
  };

  /**
   * 将 3D 模型 URL 保存到本地与后端
   */
  const handleUpdateModel = async () => {
    if (!activeCompanion) return;
    
    // 无 model_id 说明仅本地草稿，需先在创建页落库
    if (!activeCompanion.model_id) {
      alert('该模型尚未保存到后端，请先在「创建」页面创建模型');
      return;
    }
    
    try {
      // 优先待保存 URL，否则用手输
      const finalUrl = pendingModel3dUrl || modelUrl.trim();
      
      if (!finalUrl) {
        alert('请输入模型 URL 或上传模型文件');
        return;
      }
      
      updateCompanion({ model3dUrl: finalUrl });
      
      setPendingModel3dUrl(null);
      
      // 关闭弹窗
      setShowModelModal(false);
      
      console.log('[ManagePage] 3D 模型配置已保存');
      alert('配置已保存！刷新页面后配置仍然有效。');
    } catch (error) {
      console.error('[ManagePage] 保存 3D 模型配置失败:', error);
      alert(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  /**
   * 选择动画 GLB 上传；在点保存前只更新 pending，不写库
   * @param file 所选文件
   * @param type 'idle' | 'talking'
   */
  const handleFileSelect = async (file: File, type: 'idle' | 'talking') => {
    if (!activeCompanion) return;
    
    // 上传中状态
    if (type === 'idle') {
      setIsUploadingIdle(true);
    } else {
      setIsUploadingTalking(true);
    }
    
    try {
      console.log(`[ManagePage] 开始上传${type === 'idle' ? '空闲' : '说话'}动画模型文件:`, file.name);
      
      const { modelService } = await import('./services/modelService');
      
      const serverUrl = await modelService.uploadModel(file, activeCompanion.model_id || undefined, type === 'idle' ? 'idle' : 'talking', activeCompanion.name);
      console.log(`[ManagePage] ${type === 'idle' ? '空闲' : '说话'}动画模型上传成功，服务器 URL:`, serverUrl);
      
      // 暂存，点「保存配置」后再写入 companion 与数据库
      if (type === 'idle') {
        setPendingIdleUrl(serverUrl);
      } else {
        setPendingTalkingUrl(serverUrl);
      }
      
      console.log(`[ManagePage] ${type === 'idle' ? '空闲' : '说话'}动画模型 URL 已上传（请点击「保存配置」写入数据库）`);
    } catch (error) {
      console.error(`[ManagePage] 上传${type === 'idle' ? '空闲' : '说话'}动画模型失败:`, error);
      alert(`上传失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      if (type === 'idle') {
        setIsUploadingIdle(false);
      } else {
        setIsUploadingTalking(false);
      }
    }
  };

  /**
   * 保存空闲/说话动画 URL 到本地与后端
   */
  const handleSaveAnimationModels = async () => {
    if (!activeCompanion) {
      alert('请先选择一个模型');
      return;
    }
    
    // 无 model_id 则无法同步后端
    if (!activeCompanion.model_id) {
      alert('该模型尚未保存到后端，请先在「创建」页面创建模型');
      return;
    }
    
    setIsSavingAnimation(true);
    try {
      console.log('[ManagePage] 保存动画模型配置到数据库...');
      
      // 合并 pending 与当前
      const updates: Partial<Companion> = {};
      if (pendingIdleUrl) {
        updates.idleModelUrl = pendingIdleUrl;
      }
      if (pendingTalkingUrl) {
        updates.talkingModelUrl = pendingTalkingUrl;
      }
      
      if (Object.keys(updates).length > 0) {
        updateCompanion(updates);
        setPendingIdleUrl(null);
        setPendingTalkingUrl(null);
      }
      
      // updateCompanion 会持久化；再显式调后端 update 双保险
      const updatedCompanion = { ...activeCompanion, ...updates };
      const { modelService } = await import('./services/modelService');
      const modelData = modelService.companionToModelData(updatedCompanion);
      
      await modelService.updateModel(updatedCompanion.model_id, {
        idle_model_url: modelData.idle_model_url,
        talking_model_url: modelData.talking_model_url,
      });
      
      setShowAnimationModal(false);
      
      console.log('[ManagePage] 动画模型配置已保存到数据库');
      alert('配置已保存！刷新页面后配置仍然有效。');
    } catch (error) {
      console.error('[ManagePage] 保存动画模型配置失败:', error);
      alert(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsSavingAnimation(false);
    }
  };

  const confirmDelete = () => {
    if (companionToDelete) {
      deleteCompanion(companionToDelete);
      setShowDeleteModal(false);
      setCompanionToDelete(null);
    }
  };

  /**
   * 测试 API 是否可达
   */
  const handleTestConnection = async () => {
    if (!apiUrl.trim()) {
      setConnectionStatus('error');
      setConnectionMessage('请输入 API 地址');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('正在测试连接…');

    try {
      const isValid = await APIConfig.testConnection(apiUrl, 5000);
      if (isValid) {
        setConnectionStatus('success');
        setConnectionMessage('连接成功！');
      } else {
        setConnectionStatus('error');
        setConnectionMessage('连接失败，请检查地址是否正确或服务器是否运行');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(`连接错误: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  /**
   * 保存 API 地址并刷新页面
   */
  const handleSaveApiConfig = () => {
    if (!apiUrl.trim()) {
      setConnectionStatus('error');
      setConnectionMessage('请输入 API 地址');
      return;
    }

    try {
      APIConfig.setApiUrl(apiUrl.trim());
      setShowApiConfigModal(false);
      // 刷新以应用新配置
      window.location.reload();
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(`保存失败: ${error instanceof Error ? error.message : '无效的地址格式'}`);
    }
  };

  return (
    <PageContainer>
      <h2 className="text-2xl font-bold mb-8">系统管理</h2>
      <div className="mb-8 space-y-4">
         <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-white/80">人物列表</h3><span className="text-xs text-white/40">{companions.length} 个模型已载入</span></div>
         <div>
           <Button
             variant="outline"
             className="gap-2"
             onClick={() => setShowEmotionReportModal(true)}
           >
             <BarChart3 size={16} />
             查看情绪趋势报告
           </Button>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
           {companions.map(c => (
             <div key={c.id} onClick={() => switchCompanion(c.id)} className={`relative p-3 rounded-xl border transition-all cursor-pointer ${c.id === activeCompanion?.id ? 'bg-primary/20 border-primary/50 ring-1 ring-primary/50' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
               <div className="flex items-center gap-3 mb-2">
                 <CompanionAvatar avatarUrl={c.avatarUrl} name={c.name} size="sm" />
                 <div className="overflow-hidden flex-1">
                   <p className="text-sm font-bold truncate">{c.name}</p>
                   <p className="text-[10px] text-white/50 truncate">{c.role}</p>
                   {/* 角色描述预览 */}
                   {c.characterDescription && (
                     <p className="text-[9px] text-white/40 truncate mt-0.5">{c.characterDescription}</p>
                   )}
                   {/* 角色属性标签 */}
                   {c.characterAttributes && (
                     <div className="flex gap-1 mt-1">
                       <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">{c.characterAttributes.job}</span>
                       <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1 py-0.5 rounded">{c.characterAttributes.position}</span>
                     </div>
                   )}
                   {/* 创建时间 */}
                   {c.createdAtStr && (
                     <p className="text-[8px] text-white/30 mt-1 truncate">
                       {c.createdAtStr}
                     </p>
                   )}
                 </div>
               </div>
               {c.id === activeCompanion?.id && <div className="absolute top-2 right-2 text-green-400"><Check size={14} /></div>}
             </div>
           ))}
           <button onClick={() => navigate('/create')} className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors h-[74px]"><Plus size={20} /><span className="text-xs">添加新人物</span></button>
         </div>
      </div>
      {activeCompanion ? (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
           <div className="flex items-center gap-2 mb-2"><span className="w-1 h-4 bg-secondary rounded-full"></span><h3 className="text-sm font-bold text-white/60 uppercase tracking-widest">当前选中模型配置</h3></div>
          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center gap-4 relative z-10">
              <CompanionAvatar avatarUrl={activeCompanion.avatarUrl} name={activeCompanion.name} size="md" />
              <div>
                <h3 className="text-lg font-bold">{activeCompanion.name}</h3>
                <p className="text-sm text-white/50">{activeCompanion.role}</p>
                
                {/* 创建时间 */}
                {activeCompanion.createdAtStr && (
                  <p className="text-xs text-white/40 mt-1">
                    创建时间: {activeCompanion.createdAtStr}
                  </p>
                )}
                
                {/* 角色描述 */}
                {activeCompanion.characterDescription && (
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">{activeCompanion.characterDescription}</p>
                )}
              </div>
            </div>
            
            {/* 角色属性 */}
            {activeCompanion.characterAttributes && (
              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <User size={14} className="text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400">角色属性</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-white/60">姓名:</span> <span className="text-white/90">{activeCompanion.characterAttributes.name}</span></div>
                  <div><span className="text-white/60">性别:</span> <span className="text-white/90">{activeCompanion.characterAttributes.gender}</span></div>
                  <div><span className="text-white/60">年龄:</span> <span className="text-white/90">{activeCompanion.characterAttributes.age}</span></div>
                  <div><span className="text-white/60">职业:</span> <span className="text-white/90">{activeCompanion.characterAttributes.job}</span></div>
                  <div><span className="text-white/60">爱好:</span> <span className="text-white/90">{activeCompanion.characterAttributes.hobby}</span></div>
                  <div><span className="text-white/60">定位:</span> <span className="text-white/90">{activeCompanion.characterAttributes.position}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10">
                  <div><span className="text-white/60">性格特点:</span> <span className="text-white/90">{activeCompanion.characterAttributes.additional}</span></div>
                  <div className="mt-1"><span className="text-white/60">目标使命:</span> <span className="text-white/90">{activeCompanion.characterAttributes.goal}</span></div>
                </div>
              </div>
            )}
             <div className="mt-4 pt-4 border-t border-white/10">
                 <div className="flex items-center justify-between"><span className="text-xs text-white/40">3D Model Source</span><span className={`text-[10px] px-2 py-0.5 rounded ${activeCompanion.model3dUrl ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>{activeCompanion.model3dUrl ? 'Custom GLB Linked' : 'Default Procedural'}</span></div>
             </div>
          </div>
          <div className="space-y-2">
            <button onClick={() => {
              setModelUrl(activeCompanion.model3dUrl || '');
              setPendingModel3dUrl(null);
              setShowModelModal(true);
            }} className="w-full glass-panel p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors text-left group">
              <div className="flex items-center gap-3"><Box size={20} className="text-white/70 group-hover:text-secondary transition-colors" /><div><span className="block text-sm font-medium">配置 3D 模型</span><span className="block text-xs text-white/30">绑定 .glb / .gltf 文件链接</span></div></div>
            </button>
            <button onClick={() => setShowAnimationModal(true)} className="w-full glass-panel p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors text-left group">
              <div className="flex items-center gap-3">
                <Activity size={20} className="text-white/70 group-hover:text-secondary transition-colors" />
                <div className="flex-1">
                  <span className="block text-sm font-medium">配置动画模型</span>
                  <span className="block text-xs text-white/30">绑定包含动画的模型文件（解决模型不动的问题）</span>
                  {(activeCompanion.idleModelUrl || activeCompanion.talkingModelUrl) && (
                    <span className="block text-xs text-green-400 mt-1">✓ 已配置动画模型</span>
                  )}
                </div>
              </div>
            </button>
            <button onClick={() => setShowApiConfigModal(true)} className="w-full glass-panel p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors text-left group">
              <div className="flex items-center gap-3">
                <Server size={20} className="text-white/70 group-hover:text-secondary transition-colors" />
                <div className="flex-1">
                  <span className="block text-sm font-medium">配置后端地址</span>
                  <span className="block text-xs text-white/30">设置后端服务器的 IP 地址和端口</span>
                  <span className="block text-xs text-blue-400 mt-1">{APIConfig.getApiUrl()}</span>
                </div>
              </div>
            </button>
          </div>
          <Button variant="outline" className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 mt-8" onClick={() => {setCompanionToDelete(activeCompanion.id); setShowDeleteModal(true);}}><Trash2 size={18} className="mr-2" />删除当前人物数据</Button>
        </div>
      ) : (
        <div className="text-center py-10 glass-panel rounded-2xl"><p className="text-white/50 mb-4">请选择或创建一个人物</p><Link to="/create"><Button className="mx-auto"><UserPlus size={18} /> 创建新伙伴</Button></Link></div>
      )}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="确认删除"><p className="text-white/70 mb-6">这将永久删除该人物的所有记忆、设定与绑定关系。</p><div className="flex gap-4"><Button variant="secondary" onClick={() => setShowDeleteModal(false)} className="flex-1">取消</Button><Button onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-700 shadow-none">确认删除</Button></div></Modal>
      <Modal isOpen={showModelModal} onClose={() => setShowModelModal(false)} title="配置 3D 模型">
        <div className="mb-6 space-y-4">
          <p className="text-sm text-white/60 mb-4">选择 3D 模型文件或输入模型 URL：</p>
          
          {/* 方式一：文件上传 */}
          <div>
            <label className="block text-sm text-white/80 mb-2">方式一：上传模型文件</label>
            <div className="flex gap-2">
              <input
                ref={model3dFileInputRef}
                type="file"
                accept=".glb,.gltf,.fbx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleModel3dFileSelect(file);
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => model3dFileInputRef.current?.click()}
                className="flex-1"
                disabled={isUploadingModel3d}
              >
                <Upload size={16} className="mr-2" />
                {isUploadingModel3d ? '上传中…' : '选择模型文件'}
              </Button>
              {(activeCompanion?.model3dUrl || pendingModel3dUrl) && !isUploadingModel3d && (
                <span className="text-xs text-green-400 flex items-center">✓ 已设置</span>
              )}
            </div>
            {(activeCompanion?.model3dUrl || pendingModel3dUrl) && (
              <p className="text-xs text-white/40 mt-1">
                当前: {(pendingModel3dUrl || activeCompanion?.model3dUrl || '').startsWith('blob:')
                  ? '临时文件（请保存配置）'
                  : `${(pendingModel3dUrl || activeCompanion?.model3dUrl || '').substring(0, 50)}...`}
                {pendingModel3dUrl && <span className="text-yellow-400 ml-2">（未保存）</span>}
              </p>
            )}
          </div>
          
          {/* 方式二：URL */}
          <div>
            <label className="block text-sm text-white/80 mb-2">方式二：输入模型 URL</label>
            <Input 
              value={modelUrl} 
              onChange={(e) => {
                setModelUrl(e.target.value);
                // 手改 URL 时清掉待保存的上传结果
                if (pendingModel3dUrl) {
                  setPendingModel3dUrl(null);
                }
              }} 
              placeholder="https://.../model.glb 或 /models/model.glb" 
            />
          </div>
          
          <p className="text-xs text-white/30 mt-2 leading-relaxed">
            提示：此设置将覆盖默认形象。每个人物都可以绑定独立的 3D 模型文件。
            支持 .glb、.gltf、.fbx 格式。上传的文件会保存到服务器，删除本地文件后仍可正常使用。
          </p>
        </div>
        <div className="flex gap-4">
          <Button 
            variant="secondary" 
            onClick={() => {
              setShowModelModal(false);
              setPendingModel3dUrl(null);
            }} 
            className="flex-1"
          >
            取消
          </Button>
          <Button 
            onClick={handleUpdateModel} 
            className="flex-1"
            disabled={isUploadingModel3d}
          >
            {isUploadingModel3d ? '上传中…' : '保存配置'}
          </Button>
        </div>
      </Modal>
      
      <Modal isOpen={showAnimationModal} onClose={() => setShowAnimationModal(false)} title="配置动画模型">
        <div className="mb-6 space-y-4">
          <p className="text-sm text-white/60 mb-4">选择绑骨后下载的动画模型文件（.glb 格式）。</p>
          
          {/* 空闲动画模型 */}
          <div>
            <label className="block text-sm text-white/80 mb-2">空闲动画模型 (Idle_Torch_Loop)</label>
            <div className="flex gap-2">
              <input
                ref={idleFileInputRef}
                type="file"
                accept=".glb"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileSelect(file, 'idle');
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => idleFileInputRef.current?.click()}
                className="flex-1"
                disabled={isUploadingIdle}
              >
                <Upload size={16} className="mr-2" />
                {isUploadingIdle ? '上传中…' : '选择空闲动画模型'}
              </Button>
              {(activeCompanion?.idleModelUrl || pendingIdleUrl) && !isUploadingIdle && (
                <span className="text-xs text-green-400 flex items-center">✓ 已设置</span>
              )}
            </div>
            {(activeCompanion?.idleModelUrl || pendingIdleUrl) && (
              <p className="text-xs text-white/40 mt-1">
                当前: {(pendingIdleUrl || activeCompanion?.idleModelUrl || '').startsWith('blob:')
                  ? '临时文件（请保存配置）'
                  : `${(pendingIdleUrl || activeCompanion?.idleModelUrl || '').substring(0, 50)}...`}
                {pendingIdleUrl && <span className="text-yellow-400 ml-2">（未保存）</span>}
              </p>
            )}
          </div>
          
          {/* 说话动画模型 */}
          <div>
            <label className="block text-sm text-white/80 mb-2">说话动画模型 (Idle_Talking_Loop)</label>
            <div className="flex gap-2">
              <input
                ref={talkingFileInputRef}
                type="file"
                accept=".glb"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileSelect(file, 'talking');
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => talkingFileInputRef.current?.click()}
                className="flex-1"
                disabled={isUploadingTalking}
              >
                <Upload size={16} className="mr-2" />
                {isUploadingTalking ? '上传中…' : '选择说话动画模型'}
              </Button>
              {(activeCompanion?.talkingModelUrl || pendingTalkingUrl) && !isUploadingTalking && (
                <span className="text-xs text-green-400 flex items-center">✓ 已设置</span>
              )}
            </div>
            {(activeCompanion?.talkingModelUrl || pendingTalkingUrl) && (
              <p className="text-xs text-white/40 mt-1">
                当前: {(pendingTalkingUrl || activeCompanion?.talkingModelUrl || '').startsWith('blob:')
                  ? '临时文件（请保存配置）'
                  : `${(pendingTalkingUrl || activeCompanion?.talkingModelUrl || '').substring(0, 50)}...`}
                {pendingTalkingUrl && <span className="text-yellow-400 ml-2">（未保存）</span>}
              </p>
            )}
          </div>
          
          <p className="text-xs text-white/30 mt-4 leading-relaxed">
            提示: 绑骨完成后，系统会自动下载两个动画模型文件到您的下载目录。
            文件名格式为: <code className="bg-white/10 px-1 rounded">idle_model_*.glb</code> 和{' '}
            <code className="bg-white/10 px-1 rounded">talking_model_*.glb</code>
          </p>
        </div>
        <div className="flex gap-4">
          <Button 
            variant="secondary" 
            onClick={() => setShowAnimationModal(false)} 
            className="flex-1"
            disabled={isSavingAnimation}
          >
            取消
          </Button>
          <Button 
            onClick={handleSaveAnimationModels} 
            className="flex-1"
            disabled={isSavingAnimation || isUploadingIdle || isUploadingTalking}
          >
            {isSavingAnimation ? '保存中…' : '保存配置'}
          </Button>
        </div>
      </Modal>
      
      <Modal isOpen={showApiConfigModal} onClose={() => setShowApiConfigModal(false)} title="配置后端地址">
        <div className="mb-6 space-y-4">
          <div>
            <p className="text-sm text-white/60 mb-2">请输入后端服务器地址：</p>
            <Input 
              value={apiUrl} 
              onChange={(e) => setApiUrl(e.target.value)} 
              placeholder="http://192.168.1.100:5000 或 https://your-domain.com"
              className="font-mono text-sm"
            />
            <p className="text-xs text-white/30 mt-2 leading-relaxed">
              格式示例：<br/>
              · 本地/局域网：<code className="bg-white/10 px-1 rounded">http://192.168.1.100:5000</code><br/>
              · 域名：<code className="bg-white/10 px-1 rounded">https://your-domain.com</code>
            </p>
          </div>
          
          {/* 杩炴帴鐘舵€佹樉绀?*/}
          {connectionMessage && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              connectionStatus === 'success' ? 'bg-green-500/20 border border-green-500/30' :
              connectionStatus === 'error' ? 'bg-red-500/20 border border-red-500/30' :
              'bg-blue-500/20 border border-blue-500/30'
            }`}>
              {connectionStatus === 'success' && <Wifi size={16} className="text-green-400" />}
              {connectionStatus === 'error' && <WifiOff size={16} className="text-red-400" />}
              {connectionStatus === 'idle' && <Server size={16} className="text-blue-400" />}
              <span className={`text-sm ${
                connectionStatus === 'success' ? 'text-green-400' :
                connectionStatus === 'error' ? 'text-red-400' :
                'text-blue-400'
              }`}>
                {connectionMessage}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <Button 
            variant="secondary" 
            onClick={() => setShowApiConfigModal(false)} 
            className="flex-1"
          >
            取消
          </Button>
          <Button 
            variant="outline" 
            onClick={handleTestConnection}
            isLoading={isTestingConnection}
            className="flex-1"
          >
            {isTestingConnection ? '测试中…' : '测试连接'}
          </Button>
          <Button 
            onClick={handleSaveApiConfig}
            disabled={isTestingConnection || connectionStatus === 'error'}
            className="flex-1"
          >
            保存
          </Button>
        </div>
      </Modal>
      <Modal
        isOpen={showEmotionReportModal}
        onClose={() => setShowEmotionReportModal(false)}
        title="情绪趋势报告"
        panelClassName="max-w-lg"
        variant="light"
      >
        {/* 情绪报告：浅色玻璃面板，与底部导航 / 任务中心主体一致 */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              统计用户
              <Input
                value={emotionReportUser}
                onChange={(e) => setEmotionReportUser(e.target.value)}
                placeholder="用户名"
                className="border-gray-200 bg-white py-2.5 text-base !text-gray-900 shadow-sm placeholder:!text-gray-400 focus:!border-pink-300 focus:!ring-pink-200"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              天数
              <Input
                type="number"
                min={1}
                max={30}
                value={emotionReportDays}
                onChange={(e) => setEmotionReportDays(Number(e.target.value) || 7)}
                className="border-gray-200 bg-white py-2.5 text-base !text-gray-900 shadow-sm focus:!border-pink-300 focus:!ring-pink-200"
              />
            </label>
            <Button
              variant="primary"
              onClick={fetchEmotionReport}
              disabled={emotionReportLoading}
              className="h-11 w-full shrink-0 sm:w-auto sm:min-w-[5.5rem]"
            >
              {emotionReportLoading ? '加载中…' : '刷新'}
            </Button>
          </div>
          {emotionReportLoading && <p className="text-sm text-gray-600">加载中…</p>}
          {emotionReportError && <p className="text-sm font-medium text-red-600">{emotionReportError}</p>}
          {emotionReportData && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                统计周期：
                <span className="font-semibold text-gray-900">
                  {new Date(emotionReportData.since * 1000).toLocaleDateString()} —{' '}
                  {new Date(emotionReportData.until * 1000).toLocaleDateString()}
                </span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm sm:col-span-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">总记录</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{emotionReportData.total}</div>
                </div>
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm sm:col-span-2">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">标签分布</div>
                  <div className="space-y-2 text-sm">
                    {Object.entries(emotionReportData.percentages).map(([label, percent]) => {
                      const count = emotionReportData.by_label[label] || 0;
                      return (
                        <div
                          key={label}
                          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                        >
                          <span className={`min-w-[4.5rem] capitalize ${emotionTrendLabelClass(label)}`}>{label}</span>
                          <span className="font-semibold text-gray-900">{count} 条</span>
                          <span className="text-gray-500">{(Number(percent) * 100).toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold text-gray-800">每日趋势</div>
                <div className="space-y-3">
                  {Object.entries(emotionReportData.daily_trend).map(([day, labels]) => {
                    const counts = Object.values(labels);
                    const maxCount = counts.length ? Math.max(...counts, 1) : 1;
                    return (
                      <div
                        key={day}
                        className="rounded-xl border border-gray-200 bg-gray-50/90 p-3 shadow-sm"
                      >
                        <div className="mb-2 text-xs font-semibold tracking-wide text-gray-700">{day}</div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                          {sortEmotionDailyEntries(labels).map(([label, cnt]) => {
                            const pct = maxCount ? (cnt / maxCount) * 100 : 0;
                            const barGradient =
                              label.toLowerCase().includes('negative') && !label.toLowerCase().includes('positive')
                                ? 'from-rose-500 to-orange-400'
                                : label.toLowerCase().includes('positive')
                                  ? 'from-emerald-500 to-teal-400'
                                  : 'from-blue-500 to-cyan-400';
                            return (
                              <div key={label} className="min-w-0 flex-1">
                                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                                  <div
                                    className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-[width] duration-300`}
                                    style={{ width: `${Math.max(pct, cnt > 0 ? 8 : 0)}%` }}
                                  />
                                </div>
                                <div
                                  className={`mt-1.5 text-xs font-medium capitalize leading-snug ${emotionTrendLabelClass(label)}`}
                                >
                                  {label}{' '}
                                  <span className="tabular-nums font-semibold text-gray-900">{cnt}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
      <div className="mt-12 text-center"><p className="text-xs text-white/20">SoulLink - Virtual Companion System v2.1</p></div>
    </PageContainer>
  );
};

export default App;
