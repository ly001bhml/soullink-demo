import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Sparkles, Heart, MessageCircle, Settings, Mic, Send, Trash2, UserPlus, Image as ImageIcon, X, ChevronUp, ChevronDown, Box, Check, Plus, Scan, Activity, Cpu, Upload, FileBox, Star, Cloud, Moon, User, Server, Wifi, WifiOff, Keyboard, AudioLines, BarChart3, Bell, CheckCircle2, AlertCircle, Lock, Unlock, Gamepad2 } from 'lucide-react';
import { generateModelFromImage, generateModelFromText } from './services/hunyuan3dService';
import { characterService } from './services/characterService';
import { modelService } from './services/modelService';
import { Button, Input, Modal, PageContainer } from './components/ui';
import { Mesh2MotionViewer } from './components/Mesh2MotionViewer';
import { Mesh2MotionControls } from './components/Mesh2MotionControls';
import { CharacterDescriptionInput } from './components/CharacterDescriptionInput';
import { BadgePage, MiniGamePage } from './MiniGames';
import { ProcessStep } from '@mesh2motion/lib/enums/ProcessStep.ts';
import { BackgroundTask, BACKGROUND_TASKS_KEY, getTaskTypeLabel, loadBackgroundTasks } from './appTypes';
import { AvatarScene } from './components/AvatarScene';
import { ChatPage } from './pages/ChatPage';
import { HomeAgentPage } from './pages/HomeAgentPage';
import { ManagePage } from './pages/ManagePage';
import { Companion, ChatMessage, CharacterAttributes } from './types';
import { APIConfig } from './services/apiConfig';

// --- Global Context for Companion Data ---
const STORAGE_KEY = 'soul_link_data';
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

/**
 * 人物头像：加载失败或无 URL 时显示首字或默认图标，避免破图
 * @param avatarUrl - 头像图片地址，可选
 * @param name - 人物名称，用于首字占位
 * @param size - 'sm' 列表小图 | 'md' 详情大图
 */
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
      <div className="flex h-[100dvh] min-h-screen flex-col overflow-hidden">
        <BackgroundDecorations />
        <main className="relative flex-1 min-h-0 overflow-hidden">
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
            <Route path="/mini-game" element={<MiniGamePage />} />
            <Route path="/mini-game/:gameId" element={<MiniGamePage />} />
            <Route path="/rewards" element={<BadgePage />} />
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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  const suppressNextToggleRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const visibleTasks = tasks.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const runningCount = tasks.filter(task => task.status === 'running').length;
  const unreadCount = tasks.filter(task => task.status !== 'running' && !task.seen).length;

  const clampPosition = useCallback((left: number, top: number) => {
    if (typeof window === 'undefined') {
      return { left, top };
    }
    const margin = 12;
    const width = wrapperRef.current?.offsetWidth || (expanded ? 320 : 148);
    const height = wrapperRef.current?.offsetHeight || (expanded ? 280 : 60);
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    return {
      left: Math.min(maxLeft, Math.max(margin, left)),
      top: Math.min(maxTop, Math.max(margin, top)),
    };
  }, [expanded]);

  const handleDragMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    const nextLeft = dragState.originLeft + (event.clientX - dragState.startX);
    const nextTop = dragState.originTop + (event.clientY - dragState.startY);
    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
    }
    setPosition(clampPosition(nextLeft, nextTop));
  }, [clampPosition]);

  const handleDragEnd = useCallback(() => {
    window.removeEventListener('pointermove', handleDragMove);
    window.removeEventListener('pointerup', handleDragEnd);
    document.body.style.userSelect = '';

    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    if (dragState?.moved) {
      suppressNextToggleRef.current = true;
      setPosition(prev => {
        if (prev) {
          try {
            window.localStorage.setItem('soul_link_task_center_position', JSON.stringify(prev));
          } catch (error) {
            console.warn('[TaskCenter] 保存拖拽位置失败:', error);
          }
        }
        return prev;
      });
    }
  }, [handleDragMove]);

  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const fallback = clampPosition(window.innerWidth - 164, 16);
    const current = position ?? fallback;
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: current.left,
      originTop: current.top,
      moved: false,
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handleDragEnd);
  }, [position, clampPosition, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (typeof window === 'undefined' || position) {
      return;
    }

    try {
      const raw = window.localStorage.getItem('soul_link_task_center_position');
      if (raw) {
        const parsed = JSON.parse(raw) as { left?: number; top?: number };
        if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
          setPosition(clampPosition(parsed.left, parsed.top));
          return;
        }
      }
    } catch (error) {
      console.warn('[TaskCenter] 恢复位置失败:', error);
    }

    const initialWidth = wrapperRef.current?.offsetWidth || 148;
    setPosition(clampPosition(window.innerWidth - initialWidth - 16, 16));
  }, [position, clampPosition]);

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

  useEffect(() => {
    if (!position || typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setPosition(prev => (prev ? clampPosition(prev.left, prev.top) : prev));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, clampPosition]);

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
    <div
      ref={wrapperRef}
      className="fixed z-[80] flex flex-col items-end gap-3"
      style={position ? { left: position.left, top: position.top } : { top: 16, right: 16 }}
    >
      {expanded && (
        <div className="w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/40 bg-white/90 backdrop-blur-xl shadow-2xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div
              className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
              onPointerDown={startDrag}
              title="拖动任务中心"
            >
              <p className="text-sm font-semibold text-gray-800">后台任务</p>
              <p className="text-[11px] text-gray-500">
                {runningCount > 0 ? ('进行中 ' + runningCount + ' 项') : '可随时离开页面，任务会继续执行'}
              </p>
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
                  <div className="mt-0.5 shrink-0">{statusIcon}</div>
                  <button onClick={() => openTask(task)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-gray-800">{task.title}</span>
                      <span className="shrink-0 text-[10px] rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">{getTaskTypeLabel(task.type)}</span>
                    </div>
                    <p className="mt-1 break-words text-xs text-gray-500">{task.detail}</p>
                  </button>
                  {task.status !== 'running' && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        removeTask(task.id);
                      }}
                      className="shrink-0 text-gray-300 hover:text-gray-600"
                      title="删除任务"
                    >
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
          if (suppressNextToggleRef.current) {
            suppressNextToggleRef.current = false;
            return;
          }
          setExpanded(value => {
            const next = !value;
            if (next && unreadCount > 0) {
              markAllTasksSeen();
            }
            return next;
          });
        }}
        onPointerDown={startDrag}
        className="relative flex items-center gap-2 rounded-full border border-white/50 bg-white/90 px-4 py-3 shadow-xl backdrop-blur-xl text-gray-800"
        title="点击展开，拖动可移动"
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
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  const navigationGameItem = { path: '/mini-game', icon: <Gamepad2 size={20} />, label: '游戏' };
  const navItems = [
    { path: '/', icon: <Home size={20} />, label: '首页' },
    { path: '/create', icon: <Sparkles size={20} />, label: '生成' },
    { path: '/bind', icon: <Heart size={20} />, label: '绑定' },
    { path: '/chat', icon: <MessageCircle size={20} />, label: '互动' },
    { path: '/manage', icon: <Settings size={20} />, label: '管理' },
  ];
  navItems.splice(4, 0, navigationGameItem);
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
    <PageContainer className="flex h-full min-h-0 flex-col overflow-y-auto md:overflow-hidden">
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
      <PageContainer className="flex h-full min-h-0 flex-col overflow-y-auto">
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
        extraActions: updatedCompanion.extraActions,
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
    <PageContainer className="flex h-full min-h-0 flex-col overflow-y-auto">
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

export default App;
