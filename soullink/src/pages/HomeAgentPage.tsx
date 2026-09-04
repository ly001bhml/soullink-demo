import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronDown, Image as ImageIcon, MessageCircle, Mic, Send, Shuffle, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Button, Modal, PageContainer } from '../components/ui';
import { BackgroundTask, BackgroundTaskStatus, HOME_AGENT_MESSAGES_KEY } from '../appTypes';
import {
  DEFAULT_CHARACTER_REFERENCE, HomeAgentMessage,
  buildAgentModelPrompt,
  buildConversationalTaskFallbackReply,
  buildHomeAgentTaskSummary,
  buildTaskStatusReply,
  extractCharacterNameFromRequest,
  findExistingCompanionForRequest,
  getCharacterCreationClarification,
  getDefaultHomeAgentMessages,
  getMiniGameRecommendation,
  hasLegacyPersonaLeak,
  isCharacterGenerationIntent,
  isTaskStatusQuery,
  normalizeHomeAssistantReplyTone,
  normalizeCharacterReferenceText,
} from '../homeAgentUtils';
import { audioService, isCapacitor } from '../services/audioService';
import { BrowserStreamingAsrController, isBrowserStreamingAsrSupported } from '../services/browserStreamingAsr';
import { characterService } from '../services/characterService';
import { generateModelFromImage, generateModelFromText } from '../services/hunyuan3dService';
import { modelService } from '../services/modelService';
import { chatWithAgentAssistant } from '../services/qwenService';
import { buildEmotionContext } from '../services/emotionContext';
import { loadFusedSupportState, loadInitialMultimodalState, loadRealtimeEmotionSignals, loadWorkshopStateSnapshot } from '../services/supportState';
import { Companion } from '../types';

type CustomCharacterFormState = {
  name: string;
  gender: string;
  age: string;
  bodyType: string;
  style: string;
  hairstyle: string;
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  face: string;
  top: string;
  bottom: string;
  suit: string;
  material: string;
  accessory: string;
  identity: string;
  personality: string;
  notes: string;
};

type CustomCharacterSelectKey = Exclude<keyof CustomCharacterFormState, 'name' | 'notes'>;

type CustomCharacterField = {
  key: CustomCharacterSelectKey;
  label: string;
  options: string[];
};

const CUSTOM_CHARACTER_INITIAL_STATE: CustomCharacterFormState = {
  name: '',
  gender: '女性',
  age: '青年',
  bodyType: '',
  style: '动漫上色',
  hairstyle: '长发',
  hairColor: '',
  eyeColor: '蓝色',
  skinTone: '',
  face: '',
  top: '',
  bottom: '',
  suit: '',
  material: '',
  accessory: '',
  identity: '',
  personality: '',
  notes: '',
};

const CUSTOM_CHARACTER_SECTIONS: Array<{
  title: string;
  fields: CustomCharacterField[];
}> = [
  {
    title: '基础属性',
    fields: [
      { key: 'gender', label: '性别', options: ['女性', '男性', '中性'] },
      { key: 'age', label: '年龄', options: ['少女', '少年', '青年', '成年', '成熟', '银发长者'] },
      { key: 'bodyType', label: '体型', options: ['纤细', '匀称', '高挑', '运动型', '娇小', '圆润'] },
      { key: 'identity', label: '身份', options: ['学生', '教师', '研究者', '治愈系伙伴', '古风学者', '未来向导', '冒险者', '都市白领'] },
      { key: 'personality', label: '性格', options: ['温柔', '冷静', '开朗', '神秘', '机灵', '坚定', '优雅', '治愈'] },
    ],
  },
  {
    title: '外貌特征',
    fields: [
      { key: 'style', label: '风格', options: ['写实', '二次元', '动漫上色', '古风', '国潮', '赛博朋克', '校园风', '奇幻'] },
      { key: 'hairstyle', label: '发型', options: ['短发', '长发', '马尾', '双马尾', '卷发', '盘发', '狼尾', '丸子头'] },
      { key: 'hairColor', label: '发色', options: ['黑色', '棕色', '金色', '银色', '蓝色', '粉色', '红色', '渐变挑染'] },
      { key: 'eyeColor', label: '眼睛', options: ['黑色', '棕色', '蓝色', '绿色', '紫色', '金色', '异瞳'] },
      { key: 'skinTone', label: '肤色', options: ['白皙', '自然肤色', '健康小麦色', '冷白皮', '暖调肤色'] },
      { key: 'face', label: '面容', options: ['甜美', '清冷', '英气', '可爱', '成熟', '少年感', '精致立体'] },
    ],
  },
  {
    title: '服装搭配',
    fields: [
      { key: 'top', label: '上衣', options: ['衬衫', '卫衣', '战斗外套', '汉服上襦', '礼服上装', '机能夹克', '针织衫'] },
      { key: 'bottom', label: '下装', options: ['短裙', '长裙', '长裤', '短裤', '汉服下裙', '工装裤', '西装裤'] },
      { key: 'suit', label: '套装', options: ['校服', '西装', '汉服', '礼服', '机能套装', '休闲套装', '战斗套装'] },
      { key: 'material', label: '材质', options: ['棉麻', '丝绸', '皮革', '金属质感', '针织', '薄纱', '科技面料'] },
      { key: 'accessory', label: '配饰', options: ['眼镜', '耳环', '发饰', '项链', '披风', '手套', '头戴耳机', '无明显配饰'] },
    ],
  },
];

const CUSTOM_CHARACTER_FIELDS = CUSTOM_CHARACTER_SECTIONS.flatMap((section) => section.fields);

const EMOTION_UNAVAILABLE_HINTS = ['未开启', '未识别', '不可用', '未分析', '分析中', '识别失败', '录音中', '采集中', 'error', 'failed', 'unavailable', 'off'];
const HOME_REALTIME_SIGNAL_MAX_AGE_MS = 3 * 60 * 1000;
const HOME_WORKSHOP_SIGNAL_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * 判断情绪标签是否可用于 prompt 注入。
 * @param label 候选情绪标签。
 * @returns 若可用则返回 true，否则返回 false。
 */
const isUsableEmotionLabel = (label?: string) => {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return !EMOTION_UNAVAILABLE_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
};

/**
 * 从 emotion_state 文本中提取键值字段。
 * @param emotionState 形如 "emotion_state: valence=...; arousal=...;" 的文本。
 * @param key 要提取的字段名。
 * @returns 提取到的字段值，若不存在则返回空字符串。
 */
const parseEmotionStateField = (emotionState: string, key: string) => {
  const matcher = emotionState.match(new RegExp(`${key}=([^;]+)`));
  return String(matcher?.[1] || '').trim();
};

/**
 * 构建首页助手的实时多源情绪 prompt 片段。
 * @param requestText 当前用户输入文本。
 * @returns 情绪 prompt 片段；若四路都不可用则返回空字符串。
 */
const buildHomeEmotionPrompt = (requestText: string) => {
  const textEmotion = buildEmotionContext(requestText, 'text', { injectMultimodalEmotion: false });
  const textValence = textEmotion.emotionState ? parseEmotionStateField(textEmotion.emotionState, 'valence') : '';
  const textArousal = textEmotion.emotionState ? parseEmotionStateField(textEmotion.emotionState, 'arousal') : '';
  const realtimeSignals = loadRealtimeEmotionSignals(HOME_REALTIME_SIGNAL_MAX_AGE_MS);
  const initialMultimodalState = loadInitialMultimodalState(HOME_REALTIME_SIGNAL_MAX_AGE_MS);
  const workshopSnapshot = loadWorkshopStateSnapshot(HOME_WORKSHOP_SIGNAL_MAX_AGE_MS);
  const fusedState = loadFusedSupportState(HOME_WORKSHOP_SIGNAL_MAX_AGE_MS);
  const cameraEmotionLabel = isUsableEmotionLabel(realtimeSignals?.videoEmotionLabel)
    ? String(realtimeSignals?.videoEmotionLabel).trim()
    : isUsableEmotionLabel(initialMultimodalState?.videoEmotionLabel)
      ? String(initialMultimodalState?.videoEmotionLabel).trim()
    : '';
  const audioEmotionLabel = isUsableEmotionLabel(realtimeSignals?.voiceEmotionLabel)
    ? String(realtimeSignals?.voiceEmotionLabel).trim()
    : isUsableEmotionLabel(initialMultimodalState?.voiceEmotionLabel)
      ? String(initialMultimodalState?.voiceEmotionLabel).trim()
    : '';
  const gameEmotionLabel = workshopSnapshot?.selectedEmotion ? String(workshopSnapshot.selectedEmotion).trim() : '';

  const emotionLines: string[] = [];
  if (textValence || textArousal) {
    emotionLines.push(`文本情绪: valence=${textValence || 'unknown'}, arousal=${textArousal || 'unknown'}`);
  }
  if (cameraEmotionLabel) {
    emotionLines.push(`摄像头情绪: ${cameraEmotionLabel}`);
  }
  if (audioEmotionLabel) {
    emotionLines.push(`音频情绪: ${audioEmotionLabel}`);
  }
  if (gameEmotionLabel) {
    const fusedSummary = fusedState
      ? `, 估计状态=${fusedState.estimatedValence}/${fusedState.estimatedArousal}, 趋势=${fusedState.trend}`
      : '';
    emotionLines.push(`小游戏情绪: ${gameEmotionLabel}${fusedSummary}`);
  }

  if (!emotionLines.length) {
    return '';
  }

  return [
    '【实时情绪输入】',
    ...emotionLines,
    '【回复要求】结合以上情绪做自然、中性、简洁回应；不要使用幼态称呼（例如“小朋友”）；不要编造未出现的情绪信号；若多路信号冲突，优先稳妥表达并给出一个明确下一步。',
  ].join('；');
};

const getCustomCharacterChips = (form: CustomCharacterFormState) => {
  const chips: string[] = [];
  if (form.name.trim()) {
    chips.push(form.name.trim());
  }

  CUSTOM_CHARACTER_FIELDS.forEach((field) => {
    const value = form[field.key].trim();
    if (value) {
      chips.push(value);
    }
  });

  return chips;
};

const buildCustomCharacterRequest = (form: CustomCharacterFormState) => {
  const detailPairs: Array<[string, string]> = [
    ['性别', form.gender],
    ['年龄阶段', form.age],
    ['体型', form.bodyType],
    ['身份设定', form.identity],
    ['性格特点', form.personality],
    ['整体风格', form.style],
    ['发型', form.hairstyle],
    ['发色', form.hairColor],
    ['眼睛颜色', form.eyeColor],
    ['肤色', form.skinTone],
    ['面容气质', form.face],
    ['上衣', form.top],
    ['下装', form.bottom],
    ['套装', form.suit],
    ['材质', form.material],
    ['配饰', form.accessory],
  ];

  const details = detailPairs
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}是${value.trim()}`);

  const namePrefix = form.name.trim()
    ? `帮我创建一个名字叫${form.name.trim()}的 3D 自定义人物角色`
    : '帮我创建一个 3D 自定义人物角色';

  const noteSuffix = form.notes.trim() ? `，补充说明：${form.notes.trim()}` : '';

  return `${namePrefix}，请用于后续数字人建模和互动。${details.length > 0 ? `这个角色的设定如下：${details.join('，')}。` : ''}${noteSuffix}`;
};

const buildCustomCharacterSummary = (form: CustomCharacterFormState) => {
  const lines: string[] = [];

  if (form.name.trim()) {
    lines.push(`名字：${form.name.trim()}`);
  }

  CUSTOM_CHARACTER_SECTIONS.forEach((section) => {
    const selectedValues = section.fields
      .map((field) => form[field.key].trim())
      .filter(Boolean);

    if (selectedValues.length > 0) {
      lines.push(`${section.title}：${selectedValues.join('、')}`);
    }
  });

  if (form.notes.trim()) {
    lines.push(`补充说明：${form.notes.trim()}`);
  }

  if (lines.length === 0) {
    return '生成自定义人物';
  }

  return `生成自定义人物\n${lines.join('\n')}`;
};

const pickRandomOption = (options: string[]) => options[Math.floor(Math.random() * options.length)];

const getSectionSelectedCount = (
  section: { fields: CustomCharacterField[] },
  form: CustomCharacterFormState,
) => section.fields.filter((field) => form[field.key].trim()).length;

export const HomeAgentPage: React.FC<{
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
  const [isCustomCharacterModalOpen, setIsCustomCharacterModalOpen] = useState(false);
  const [customCharacterForm, setCustomCharacterForm] = useState<CustomCharacterFormState>(CUSTOM_CHARACTER_INITIAL_STATE);
  const [activeMobileSection, setActiveMobileSection] = useState(CUSTOM_CHARACTER_SECTIONS[0]?.title ?? '');
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
        text: '这张图片我暂时还读不了呀，换一张 PNG、JPG 或 WEBP 试试，好吗？',
      });
      return;
    }

    setUploadedImageFile(file);
    setUploadedModelFile(null);
    appendMessage({
      role: 'assistant',
      text: `图片收到啦，「${file.name}」。你可以继续说“我想和这个角色对话”，也可以告诉我你希望它长什么样、是什么性格。`,
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
        text: '这个文件类型我还不能直接用呀，换一个 .glb、.gltf 或 .fbx 模型再试一次，好吗？',
      });
      return;
    }

    setUploadedModelFile(file);
    setUploadedImageFile(null);
    appendMessage({
      role: 'assistant',
      text: `模型收到啦，「${file.name}」。你可以直接说“帮我绑定并和这个角色对话”，我会帮你继续准备。`,
    });
  };

  const handleActionClick = async (action: NonNullable<HomeAgentMessage['action']>) => {
    if (action.companionId) {
      await switchCompanion(action.companionId);
    }
    navigate(action.path);
  };

  const handleCustomCharacterFieldChange = (
    key: keyof CustomCharacterFormState,
    value: string,
  ) => {
    setCustomCharacterForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetCustomCharacterForm = () => {
    setCustomCharacterForm(CUSTOM_CHARACTER_INITIAL_STATE);
    setActiveMobileSection(CUSTOM_CHARACTER_SECTIONS[0]?.title ?? '');
  };

  const handleRandomizeCustomCharacterForm = () => {
    const randomized = CUSTOM_CHARACTER_FIELDS.reduce<CustomCharacterFormState>((acc, field) => {
      acc[field.key] = pickRandomOption(field.options);
      return acc;
    }, {
      ...customCharacterForm,
      notes: customCharacterForm.notes,
    });

    setCustomCharacterForm({
      ...randomized,
      name: customCharacterForm.name,
      notes: customCharacterForm.notes,
    });
  };

  const handleSubmitCustomCharacter = () => {
    const requestText = buildCustomCharacterRequest(customCharacterForm);

    appendMessage({
      role: 'user',
      text: buildCustomCharacterSummary(customCharacterForm),
    });

    setInput('');
    setIsCustomCharacterModalOpen(false);
    handleGenerateCharacter(requestText);
  };

  const handleDirectToChat = async (targetCompanion: Companion) => {
    await switchCompanion(targetCompanion.id);

    appendMessage({
      role: 'assistant',
      text: targetCompanion.isBound
        ? `已经帮你选好啦，现在是 ${targetCompanion.name}，点下面按钮就能去和它聊天啦。`
        : `我找到 ${targetCompanion.name} 啦，不过它还需要先完成绑定。我们先去绑定页把它准备好，好吗？`,
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
        ? `收到啦，我会用你上传的模型，慢慢帮 ${displayName} 做好绑定和互动准备。后台运行的时候你也可以继续跟我聊天。`
        : imageFile
        ? `收到啦，我会参考你上传的图片，慢慢把 ${displayName} 做出来。任务会在后台进行，你不用干等着。`
        : `好呀，我会帮你创建 ${displayName}。剩下的步骤会在后台进行，你想聊什么都可以继续跟我说。`,
    });

    setUploadedImageFile(null);
    setUploadedModelFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (modelInputRef.current) {
      modelInputRef.current.value = '';
    }

    /** 鍒涘缓鎴愬姛鍚庣殑 model_id锛屼緵 auto_rig 404 鏃惰烦杞粦瀹氶〉浣跨敤锛堜笌 Companion.id 涓€鑷达級 */
    let createdModelId: string | null = null;

    void (async () => {
      try {
        updateTask(taskId, { detail: '正在生成角色属性。' });
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

        // 浠?finishTask锛氬畬鎴愭€佺敱涓嬫柟 useEffect 缁熶竴鎻掑叆涓€鏉″姪鎵嬫秷鎭紙鍚寜閽級锛岄伩鍏嶄笌 appendMessage 閲嶅
        finishTask(taskId, `${riggedCompanion.name} 已经准备好啦，现在可以去和 TA 聊天了。`, {
          companionId: modelId,
          companionName: riggedCompanion.name,
          targetPath: '/chat',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        const autoRigSoftFail =
          error instanceof Error &&
          (error.message.includes('/api/models/auto_rig') ||
            error.message.includes('婧愭ā鍨嬫枃浠朵笉瀛樺湪') ||
            error.message.includes('鑷姩缁戦鎵句笉鍒版簮妯″瀷鏂囦欢'));

        if (autoRigSoftFail) {
          try {
            if (createdModelId) {
              await switchCompanion(createdModelId);
            }

            homeTaskFeedbackHandledRef.current.add(taskId);
            failTask(taskId, '自动绑骨暂未完成，但生成结果已经保留下来了，可以转到绑定页继续。', {
              companionId: createdModelId ?? undefined,
              targetPath: '/bind',
            });

            appendMessage({
              role: 'assistant',
              text: '模型已经做好啦，不过这边暂时还不能自动绑骨。别担心，角色和文件我都帮你留着了，点下面去绑定页继续就好，我会陪着你。',
              action: {
                label: '前往绑定页',
                type: 'navigate',
                path: '/bind',
                companionId: createdModelId ?? undefined,
              },
            });
            return;
          } catch (fallbackError) {
            console.error('[App] 鑷姩缁戦鎺ュ彛缂哄け鍚庣殑鍏滃簳澶勭悊澶辫触:', fallbackError);
          }
        }

        homeTaskFeedbackHandledRef.current.add(taskId);
        failTask(taskId, `创建失败：${errorMessage}`, {
          targetPath: '/create',
        });
        appendMessage({
          role: 'assistant',
          text: `这次没有成功，原因可能是：${errorMessage}。没关系，我们休息一下再试，或者先去生成页手动创建也可以。`,
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
    const emotionPrompt = buildHomeEmotionPrompt(requestText);
    const hasRunningTasks = tasks.some((t) => t.status === 'running');
    const llmWaitMs = hasRunningTasks ? 45000 : 15000;

    let reply = '';
    try {
      reply = await Promise.race([
        chatWithAgentAssistant(
          history,
          requestText,
          `你是「情智兼备的虚拟陪伴生成与互动系统」的首页大模型助手。回复风格要简洁、直接、自然、偏中性，用正常中文短句回答，优先先说结论，再补一句必要说明。一般控制在 1 到 3 句、40 到 90 个字，不要长篇抒情，不要写成散文，不要主动分段列标题，不要把普通回复包装成“角色请求已就绪”，也不要乱加 emoji。你的职责是陪用户聊天、回答问题，并在用户明确表达“要创建/生成/做一个人物角色”时，帮助他整理可生成的人物请求。支持原创人物、历史人物、名人风格化形象，但仍然只支持人物角色，不支持杯子、汽车、房子等普通物体；如果用户只是闲聊、讨论提示词、描述画面，或单纯贴来一段 prompt，没有明确说要生成，就不要直接触发创建流程，而是先确认他是否要拿这段描述生成一个人物。${taskSummary}${emotionPrompt ? `；${emotionPrompt}` : ''}`,
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
      text: normalizeHomeAssistantReplyTone(reply),
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
            text: '现在还没有准备好的小伙伴可以直接聊天呢。你可以先告诉我你想和谁对话，我来帮你一起做好。',
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
        text: `刚刚出了点小状况：${error instanceof Error ? error.message : '未知错误'}。没关系，我们休息一下再试，或者你换一句话告诉我也可以。`,
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

    if (isBrowserStreamingAsrSupported()) {
      const recognition = new BrowserStreamingAsrController();
      const started = recognition.start({
        onInterim: (transcript) => {
          setInput(transcript);
        },
        onFinal: (transcript) => {
          void submitHomeRequest(transcript);
        },
        onStop: () => {
          setIsListening(false);
          recognitionRef.current = null;
        },
        onError: async (error) => {
          console.error('[HomeAgentPage] Browser ASR error:', error);
          recognitionRef.current = null;
          setIsListening(false);
          if (error === 'not-allowed' || error === 'service-not-allowed') {
            alert('麦克风权限被拒绝，请允许访问麦克风。');
            return;
          }

          try {
            await audioService.startRecording();
            setIsListening(true);
          } catch (fallbackError) {
            alert(`启动录音失败: ${fallbackError instanceof Error ? fallbackError.message : '未知错误'}`);
          }
        },
      });

      if (started) {
        setIsListening(true);
        recognitionRef.current = recognition;
        return;
      }
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

  const quickActions: Array<{ label: string; prompt?: string; type?: 'custom-character' }> = [
    { label: '和孔子对话', prompt: '我想和孔子对话' },
    { label: '生成自定义人物', type: 'custom-character' },
    { label: '上传图片建角色', prompt: '我想和这个角色对话' },
    { label: '上传模型去绑定', prompt: '帮我绑定并和这个角色对话' },
  ];
  const customCharacterChips = getCustomCharacterChips(customCharacterForm);

  return (
    <PageContainer className="flex flex-col h-[calc(100dvh-72px-env(safe-area-inset-bottom))] min-h-0 overflow-hidden px-3 pt-0.5 pb-1 md:h-[calc(100dvh-64px)] md:max-h-[calc(100dvh-64px)] md:min-h-0 md:max-w-[1400px] md:overflow-hidden md:px-6 md:pt-1 md:pb-8">
      <div className="text-center pt-0 mb-2 md:pt-1 md:mb-4 shrink-0">
        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400 leading-tight drop-shadow-lg">
          情智兼备的          <br />
          虚拟陪伴生成与互动系统        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.9fr_1fr] flex-1 min-h-0">
        <div className="glass-panel rounded-3xl px-4 pb-1 pt-2 md:px-5 md:pb-3 md:pt-3 flex flex-col flex-1 min-h-0 h-full">
          <div className="flex items-center justify-end mb-1 md:mb-2">
            <div className="rounded-full bg-white/60 p-2 text-gray-600 flex items-center gap-2">
              <Sparkles size={14} className="text-purple-500" />
            </div>
          </div>

          <div
            ref={messagesRef}
            className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-contain gap-3 pr-1"
          >
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
                    正在帮你想一想，稍等一下呀…                  </div>
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
                    if (action.type === 'custom-character') {
                      setIsCustomCharacterModalOpen(true);
                      return;
                    }

                    setInput(action.prompt ?? '');
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
                <span>已附带图片：{uploadedImageFile.name}</span>
                <button onClick={() => setUploadedImageFile(null)} className="text-blue-500 hover:text-blue-700">
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadedModelFile && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
                <span>已附带模型：{uploadedModelFile.name}</span>
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
                placeholder="例如：我想和孔子聊天，或者先传一张图，再说想和图里的角色做朋友～"
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
                    小游戏                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!text-gray-500 !px-2 !py-0 text-sm"
                    onClick={() => navigate('/create')}
                  >
                    <Sparkles size={16} />
                    打开传统生成页                  </Button>
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
                  发送                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden md:block space-y-4 md:min-h-0 md:overflow-y-auto md:pr-1">
          <div className="glass-panel rounded-3xl p-5">
            <p className="text-sm font-semibold text-gray-800 mb-3">首页说明</p>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                首页这里主要帮你理解需求、回答问题，或者帮你发起角色创建、模型处理和互动准备。              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                当你进入 3D 互动页后，系统才会切换到具体角色，并开始按对应角色进行互动展示。              </div>
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
                1. 理解你的需求，判断你是想直接聊天、创建角色，还是进入绑定与互动流程。              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                2. 支持文生 3D、图生 3D、上传图片建角色，也可以直接上传模型继续处理。              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                3. 自动完成角色保存、绑骨与动作准备，并引导你进入 3D 互动页。              </div>
              <div className="rounded-2xl bg-white/70 px-3 py-3">
                4. 提供趣味小游戏入口，比如问答、识别、判断、记忆和反应类互动内容。              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isCustomCharacterModalOpen}
        onClose={() => setIsCustomCharacterModalOpen(false)}
        title="生成自定义人物"
        variant="light"
        panelClassName="max-w-5xl p-0 max-sm:h-[88dvh] max-sm:max-h-[88dvh] max-sm:w-[calc(100vw-12px)] max-sm:rounded-b-none"
      >
        <div className="max-h-[78dvh] overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-pink-100 bg-gradient-to-r from-rose-50/95 via-white/96 to-indigo-50/95 px-4 py-4 backdrop-blur md:px-6 md:py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 md:text-base">像搭角色卡一样选一遍参数</p>
                <p className="mt-1 text-xs text-gray-500 md:text-sm">
                  选完后会自动拼成角色描述，并直接走你现在的数字人生成功能。
                </p>
              </div>
              <button
                type="button"
                onClick={handleRandomizeCustomCharacterForm}
                className="inline-flex items-center gap-2 self-start rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-50 md:px-4 md:py-2 md:text-sm"
              >
                <Shuffle size={14} />
                随机填充
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mt-4 md:flex-wrap">
              {customCharacterChips.length > 0 ? (
                <>
                  {customCharacterChips.slice(0, 10).map((chip, index) => (
                    <span
                      key={`${chip}_${index}`}
                      className="shrink-0 rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm"
                    >
                      {chip}
                    </span>
                  ))}
                  {customCharacterChips.length > 10 && (
                    <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">
                      +{customCharacterChips.length - 10}
                    </span>
                  )}
                </>
              ) : (
                <span className="shrink-0 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-500">
                  还没有选参数，下面慢慢挑就好
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 pb-28 md:space-y-5 md:px-6 md:py-6 md:pb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block rounded-[28px] border border-gray-200 bg-white px-5 py-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">名字</span>
                <input
                  type="text"
                  value={customCharacterForm.name}
                  onChange={(event) => handleCustomCharacterFieldChange('name', event.target.value)}
                  placeholder="可选，例如：星澜、若溪"
                  className="mt-2 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                />
              </label>
              <div className="rounded-[28px] border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm text-amber-900 shadow-sm">
                <p className="text-sm font-semibold">生成提示</p>
                <p className="mt-2 text-sm leading-7 text-amber-800/80">
                  如果当前首页已经附带图片或模型，系统也会结合它们继续生成。
                </p>
              </div>
            </div>

            {CUSTOM_CHARACTER_SECTIONS.map((section) => (
              <section key={section.title} className="overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveMobileSection((prev) => (prev === section.title ? '' : section.title))}
                  className="flex w-full items-center justify-between px-5 py-5 text-left md:pointer-events-none"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{section.title}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      已选 {getSectionSelectedCount(section, customCharacterForm)} 项
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs text-gray-500 md:inline-flex">
                      {activeMobileSection === section.title ? '收起' : '展开'}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-gray-400 transition-transform ${
                        activeMobileSection === section.title ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>
                <div
                  className={`border-t border-gray-100 px-4 py-4 md:px-5 md:py-5 ${
                    activeMobileSection === section.title ? 'block' : 'hidden'
                  }`}
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {section.fields.map((field) => (
                      <label
                        key={field.key}
                        className="rounded-2xl border border-gray-200 bg-slate-50/90 px-4 py-3 transition-colors hover:border-sky-200 hover:bg-sky-50/50"
                      >
                        <span className="text-xs font-semibold text-gray-500">{field.label}</span>
                        <select
                          value={customCharacterForm[field.key]}
                          onChange={(event) => handleCustomCharacterFieldChange(field.key, event.target.value)}
                          className="mt-2 w-full rounded-xl border border-white bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-sky-300"
                        >
                          <option value="">未指定</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              </section>
            ))}

            <label className="block rounded-[30px] border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <span className="text-sm font-semibold text-gray-900">补充说明</span>
              <textarea
                value={customCharacterForm.notes}
                onChange={(event) => handleCustomCharacterFieldChange('notes', event.target.value)}
                placeholder="这里可以补一句额外要求，例如：希望更像温柔学姐，或者衣服偏浅色。"
                className="mt-3 min-h-[100px] w-full resize-none rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-sky-300"
              />
            </label>
          </div>

          <div className="sticky bottom-0 border-t border-gray-100 bg-white/96 px-4 py-3 backdrop-blur md:px-6 md:py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-[11px] leading-5 text-gray-500 md:text-xs">
                会把你的选择整理成角色设定，再交给现有生成模型去创建人物。
              </p>
              <div className="grid grid-cols-2 gap-3 md:flex">
              <button
                type="button"
                onClick={handleResetCustomCharacterForm}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                清空选择
              </button>
              <button
                type="button"
                onClick={handleSubmitCustomCharacter}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-200 transition-transform hover:scale-[1.01]"
              >
                <Sparkles size={16} />
                生成角色
              </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
