import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, BarChart3, Box, Check, CheckCircle2, Plus, Server, Star, Trash2, Upload, User, UserPlus, Wifi, WifiOff } from 'lucide-react';
import { CompanionAvatar } from '../components/CompanionAvatar';
import { Button, Input, Modal, PageContainer } from '../components/ui';
import { APIConfig } from '../services/apiConfig';
import { Companion } from '../types';

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

interface TrainingReportSummary {
  username: string;
  days: number;
  total_sessions: number;
  total_time: number;
  games_played: Record<string, number>;
  performance_by_game: Record<string, {
    avg_score: number;
    high_score: number;
    sessions: number;
    total_time?: number;
  }>;
  weekly_progress: Record<string, {
    sessions: number;
    total_time: number;
    score: number;
  }>;
  strengths: string[];
  areas_for_improvement: string[];
  personalized_recommendations: string[];
  training_goals: string[];
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  engagement_score: number;
  since: number;
  until: number;
}

interface TrainingGamePerformance {
  avg_score: number;
  high_score: number;
  sessions: number;
  total_time?: number;
}

interface TrainingWeeklyProgress {
  sessions: number;
  total_time: number;
  score: number;
}

interface TrainingReportSummary {
  username: string;
  days: number;
  total_sessions: number;
  total_time: number;
  games_played: Record<string, number>;
  performance_by_game: Record<string, TrainingGamePerformance>;
  weekly_progress: Record<string, TrainingWeeklyProgress>;
  strengths: string[];
  areas_for_improvement: string[];
  personalized_recommendations: string[];
  training_goals: string[];
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  engagement_score: number;
  since: number;
  until: number;
}

export const ManagePage: React.FC<{ companions: Companion[], activeCompanion: Companion | null, switchCompanion: (id: string) => void, updateCompanion: (c: Partial<Companion>) => void, deleteCompanion: (id: string) => void }> = ({ companions, activeCompanion, switchCompanion, updateCompanion, deleteCompanion }) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showAnimationModal, setShowAnimationModal] = useState(false);
  const [showApiConfigModal, setShowApiConfigModal] = useState(false);
  const [showEmotionReportModal, setShowEmotionReportModal] = useState(false);
  const [showTrainingReportModal, setShowTrainingReportModal] = useState(false);
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
  const [trainingReportDays, setTrainingReportDays] = useState(7);
  const [trainingReportUser, setTrainingReportUser] = useState('User');
  const [trainingReportLoading, setTrainingReportLoading] = useState(false);
  const [trainingReportError, setTrainingReportError] = useState('');
  const [trainingReportData, setTrainingReportData] = useState<TrainingReportSummary | null>(null);
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

  useEffect(() => {
    if (showTrainingReportModal) {
      setTrainingReportError('');
      setTrainingReportData(null);
      fetchTrainingReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTrainingReportModal]);

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

  const fetchTrainingReport = async () => {
    setTrainingReportLoading(true);
    setTrainingReportError('');
    try {
      const apiBase = APIConfig.getApiUrl();
      const resp = await fetch(`${apiBase}/api/training-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trainingReportUser.trim() || 'User',
          days: trainingReportDays,
        }),
      });
      const payload = await resp.json();
      if (!resp.ok || payload?.code !== 200) {
        throw new Error(payload?.message || '训练报告获取失败');
      }
      setTrainingReportData(payload.data as TrainingReportSummary);
    } catch (error) {
      setTrainingReportError(error instanceof Error ? error.message : '训练报告获取失败');
    } finally {
      setTrainingReportLoading(false);
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

  const trainingGameLabel = (gameType: string) =>
    ({
      wisdom: '智慧问答',
      emotion: '表情识别',
      'truth-false': '真假判断',
      sequence: '序列推理',
      causality: '因果推断',
      shulte: '舒尔特方格',
      memory: '位置记忆',
      'simon-says': '西蒙说',
      'color-sorter': '色块归类机',
      'stable-connection': '稳定连线',
    } as Record<string, string>)[gameType] || gameType || '未知训练';

  const trainingSkillLevelLabel = (level: TrainingReportSummary['skill_level']) => {
    if (level === 'advanced') return '高级';
    if (level === 'intermediate') return '中级';
    return '初级';
  };

  const formatTrainingDuration = (seconds: number) => {
    const safe = Math.max(0, Math.round(seconds || 0));
    if (safe >= 3600) {
      return `${(safe / 3600).toFixed(1)} 小时`;
    }
    if (safe >= 60) {
      return `${Math.round(safe / 60)} 分钟`;
    }
    return `${safe} 秒`;
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
      
      const { modelService } = await import('../services/modelService');
      
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
      
      const { modelService } = await import('../services/modelService');
      
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
      const { modelService } = await import('../services/modelService');
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
    <PageContainer className="overflow-y-auto overscroll-contain">
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
         <div>
           <Button
             variant="outline"
             className="gap-2"
             onClick={() => setShowTrainingReportModal(true)}
           >
             <Activity size={16} />
             查看训练报告
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
      <Modal
        isOpen={showTrainingReportModal}
        onClose={() => setShowTrainingReportModal(false)}
        title="训练报告"
        panelClassName="max-w-3xl"
        variant="light"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              统计用户
              <Input
                value={trainingReportUser}
                onChange={(e) => setTrainingReportUser(e.target.value)}
                placeholder="用户名"
                className="border-gray-200 bg-white py-2.5 text-base !text-gray-900 shadow-sm placeholder:!text-gray-400 focus:!border-pink-300 focus:!ring-pink-200"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
              天数
              <Input
                type="number"
                min={1}
                max={90}
                value={trainingReportDays}
                onChange={(e) => setTrainingReportDays(Number(e.target.value) || 7)}
                className="border-gray-200 bg-white py-2.5 text-base !text-gray-900 shadow-sm focus:!border-pink-300 focus:!ring-pink-200"
              />
            </label>
            <Button
              variant="primary"
              onClick={fetchTrainingReport}
              disabled={trainingReportLoading}
              className="h-11 w-full shrink-0 sm:w-auto sm:min-w-[5.5rem]"
            >
              {trainingReportLoading ? '加载中…' : '刷新'}
            </Button>
          </div>

          {trainingReportLoading && <p className="text-sm text-gray-600">加载中…</p>}
          {trainingReportError && <p className="text-sm font-medium text-red-600">{trainingReportError}</p>}

          {trainingReportData && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                统计周期：
                <span className="font-semibold text-gray-900">
                  {new Date(trainingReportData.since * 1000).toLocaleDateString()} —{' '}
                  {new Date(trainingReportData.until * 1000).toLocaleDateString()}
                </span>
              </p>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">总训练次数</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{trainingReportData.total_sessions}</div>
                </div>
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">总训练时长</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">{formatTrainingDuration(trainingReportData.total_time)}</div>
                </div>
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">技能等级</div>
                  <div className="mt-1 text-2xl font-bold text-gray-900">{trainingSkillLevelLabel(trainingReportData.skill_level)}</div>
                </div>
                <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">参与度得分</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{trainingReportData.engagement_score}%</div>
                </div>
              </div>

              {trainingReportData.total_sessions === 0 ? (
                <div className="rounded-xl border border-dashed border-pink-200 bg-pink-50/70 p-5 text-sm leading-6 text-gray-600">
                  还没有可用于生成训练报告的小游戏记录。先去玩几局小游戏，报告就会逐渐形成你的训练画像。
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
                    <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-gray-800">游戏参与情况</div>
                      <div className="space-y-2 text-sm">
                        {Object.entries(trainingReportData.games_played).map(([gameType, sessions]) => (
                          <div
                            key={gameType}
                            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                          >
                            <span className="text-gray-700">{trainingGameLabel(gameType)}</span>
                            <span className="font-semibold tabular-nums text-gray-900">{sessions} 次</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-gray-800">游戏表现分析</div>
                      <div className="space-y-3 text-sm">
                        {Object.entries(trainingReportData.performance_by_game).map(([gameType, performance]) => (
                          <div key={gameType} className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
                            <div className="font-semibold text-gray-800">{trainingGameLabel(gameType)}</div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                              <div>
                                平均分
                                <span className="ml-1 font-semibold text-gray-900">{performance.avg_score}</span>
                              </div>
                              <div>
                                最高分
                                <span className="ml-1 font-semibold text-gray-900">{performance.high_score}</span>
                              </div>
                              <div>
                                训练次数
                                <span className="ml-1 font-semibold text-gray-900">{performance.sessions}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-pink-100 bg-white/90 p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-gray-800">阶段进度</div>
                    <div className="space-y-3">
                      {Object.entries(trainingReportData.weekly_progress).map(([bucket, data]) => (
                        <div key={bucket} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                          <div className="mb-2 text-xs font-semibold tracking-wide text-gray-700">{bucket}</div>
                          <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
                            <div>
                              训练次数
                              <span className="ml-1 font-semibold text-gray-900">{data.sessions}</span>
                            </div>
                            <div>
                              总时长
                              <span className="ml-1 font-semibold text-gray-900">{formatTrainingDuration(data.total_time)}</span>
                            </div>
                            <div>
                              平均分
                              <span className="ml-1 font-semibold text-gray-900">{data.score}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-emerald-800">当前优势</div>
                      <ul className="space-y-2 text-sm">
                        {trainingReportData.strengths.map((item, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Check size={16} className="mt-0.5 text-emerald-600 flex-shrink-0" />
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/85 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-amber-800">可提升方向</div>
                      <ul className="space-y-2 text-sm">
                        {trainingReportData.areas_for_improvement.map((item, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <BarChart3 size={16} className="mt-0.5 text-amber-600 flex-shrink-0" />
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-blue-800">个性化建议</div>
                      <ul className="space-y-2 text-sm">
                        {trainingReportData.personalized_recommendations.map((item, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Star size={16} className="mt-0.5 text-blue-600 flex-shrink-0" />
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-purple-100 bg-purple-50/85 p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-purple-800">训练目标</div>
                      <ul className="space-y-2 text-sm">
                        {trainingReportData.training_goals.map((item, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <Activity size={16} className="mt-0.5 text-purple-600 flex-shrink-0" />
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
      <div className="mt-12 text-center"><p className="text-xs text-white/20">SoulLink - Virtual Companion System v2.1</p></div>
    </PageContainer>
  );
};
