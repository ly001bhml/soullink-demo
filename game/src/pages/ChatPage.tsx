import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AudioLines, Camera, ChevronDown, ChevronUp, Cpu, Image as ImageIcon, Keyboard, Lock, Mic, Move, Phone, PhoneOff, Send, StopCircle, Trash2, Unlock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AvatarScene } from '../components/AvatarScene';
import { EmotionCapture } from '../components/EmotionCapture';
import { Button, Modal, PageContainer } from '../components/ui';
import { getChatMessagesStorageKey } from '../appTypes';
import { audioService, isCapacitor } from '../services/audioService';
import { BrowserStreamingAsrController, isBrowserStreamingAsrSupported } from '../services/browserStreamingAsr';
import { buildEmotionContext, InteractionSource } from '../services/emotionContext';
import { modelService } from '../services/modelService';
import { chatWithCompanion, requestAssistantInterrupt, streamChatWithCompanion } from '../services/qwenService';
import { ChatMessage, Companion } from '../types';

const CHAT_PAGE_BACKGROUND_KEY = 'soul_link_chat_page_background';

type ChatBackgroundSelection =
  | { kind: 'none' }
  | { kind: 'preset'; presetId: string }
  | { kind: 'custom-image'; src: string }
  | { kind: 'custom-video'; src: string };

type LipSyncFrame = {
  Lip: string;
  Time: number;
};

type ActiveLipSync = {
  sequence: LipSyncFrame[];
  startedAt: number;
  audioUrl: string;
};

const CHAT_BACKGROUND_PRESETS: Array<{
  id: string;
  name: string;
  mediaType: 'image' | 'video';
  src: string;
}> = [
  {
    id: 'grassland',
    name: '草原',
    mediaType: 'video',
    src: '/backgrounds/grassland.mp4',
  },
  {
    id: 'forest',
    name: '森林',
    mediaType: 'video',
    src: '/backgrounds/forest.mp4',
  },
  {
    id: 'party',
    name: '派对',
    mediaType: 'video',
    src: '/backgrounds/party.mp4',
  },
  {
    id: 'stu',
    name: '学堂',
    mediaType: 'video',
    src: '/backgrounds/stu.mp4',
  },
  
];

const concatLiveAsrText = (base: string, next: string): string => {
  const left = String(base || '').trim();
  const right = String(next || '').trim();
  if (!left) return right;
  if (!right) return left;
  return `${left}${right}`;
};

export const ChatPage: React.FC<{ companion: Companion | null }> = ({ companion }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isDriving, setIsDriving] = useState(false); // Controls the 3D model animation
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAvatarRotationLocked, setIsAvatarRotationLocked] = useState(false);
  const [showFaceControllerDebug, setShowFaceControllerDebug] = useState(false);
  const [activeLipSync, setActiveLipSync] = useState<ActiveLipSync | null>(null);
  const [faceAnchorRefreshToken, setFaceAnchorRefreshToken] = useState(0);
  const [isFaceToolsExpanded, setIsFaceToolsExpanded] = useState(false);
  const [isEmotionCaptureMinimized, setIsEmotionCaptureMinimized] = useState(false);
  const [isScenePanelMinimized, setIsScenePanelMinimized] = useState(false);
  const [scenePanelOffset, setScenePanelOffset] = useState({ x: 0, y: 0 });
  const [browserAsrEnabled, setBrowserAsrEnabled] = useState(false);
  const [liveAsrCommittedText, setLiveAsrCommittedText] = useState('');
  const [liveAsrInterimText, setLiveAsrInterimText] = useState('');
  const [liveAsrStatus, setLiveAsrStatus] = useState<'off' | 'ready' | 'listening' | 'processing' | 'error'>('off');
  const [liveAsrError, setLiveAsrError] = useState('');
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [activeExtraActionId, setActiveExtraActionId] = useState<string | null>(null);
  const [isCallLayout, setIsCallLayout] = useState(false);
  const isCallLayoutRef = useRef(false);
  isCallLayoutRef.current = isCallLayout;
  const [callStreamCaption, setCallStreamCaption] = useState('');
  const [useStreamLlm, setUseStreamLlm] = useState(false);
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  const [detectedEmotionLabel, setDetectedEmotionLabel] = useState('未识别');
  const [detectedVoiceEmotionLabel, setDetectedVoiceEmotionLabel] = useState('未分析');
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const browserAsrStartInFlightRef = useRef(false);
  const autoStartBrowserAsrRef = useRef(false);
  const callAutoSendInFlightRef = useRef(false);
  const scenePanelDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const isPlayingRef = useRef<boolean>(false);
  const audioUnlockedRef = useRef<boolean>(false);
  const audioQueueRef = useRef<Array<{ url: string; isFirst: boolean; isEnd: boolean; lips?: LipSyncFrame[] }>>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  /** 涓婁竴娈靛凡缁忔挱鏀惧畬鐨勯煶棰?URL锛岄伩鍏嶉噸澶嶆挱鏀惧悓涓€娈?*/
  const lastPlayedAudioUrlRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  /** 閫氳繃 effect 鑷 id锛屽彧淇濈暀鏈€杩戜竴娆″垱寤虹殑杩炴帴锛岄伩鍏嶆棫杩炴帴鎶㈠崰 */
  const wsEffectRunIdRef = useRef<number>(0);
  /** 鍚屾鏍囪鈥滃凡寮€濮嬭繛鎺モ€濓紝閬垮厤骞跺彂閲嶅鍙戣捣杩炴帴 */
  const wsConnectStartedRef = useRef<boolean>(false);
  /** 褰撳墠鍥炲鍗犱綅娑堟伅 id锛歐ebSocket 棣栧寘浣跨敤锛孒TTP 鍥炲鏁存鎵撳瓧鏈哄鐢?*/
  const currentAudioMessageIdRef = useRef<string | null>(null);
  /** HTTP 鍙戦€佹秷鎭悗瀵瑰簲鐨勫崰浣?id 涓庡畬鏁存枃鏈紝鐢ㄤ簬瓒呮椂鍥為€€鎵撳瓧鏈?*/
  const pendingHttpMessageIdRef = useRef<string | null>(null);
  const pendingHttpResponseTextRef = useRef<string>('');
  const pendingHttpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 鏄惁浼樺厛绛夊緟 WebSocket 鏂囨湰锛涜秴鏃跺悗鍐嶅洖閫€鍒?HTTP 鏂囨湰 */
  const preferWebSocketReplyRef = useRef<boolean>(false);
  const pendingWebSocketSendAtRef = useRef<number>(0);
  const suppressPanelReplyTextRef = useRef(false);
  const navigate = useNavigate();
  const chatStorageKey = companion
    ? getChatMessagesStorageKey(companion.model_id, companion.id)
    : null;
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [backgroundSelection, setBackgroundSelection] = useState<ChatBackgroundSelection>({ kind: 'none' });
  /** 濮嬬粓鎸囧悜褰撳墠 companion锛岄伩鍏嶄緷璧栧彉鍖栧鑷?loadMessageHistory 閲嶅缓涓庨噸澶嶈Е鍙?*/
  const companionRef = useRef<Companion | null>(companion);
  companionRef.current = companion;

  // Cache loaded history by model for a short time to reduce repeat fetches.
  const messageCacheRef = useRef<Map<string, { messages: ChatMessage[], timestamp: number }>>(new Map());
  const loadHistoryTimeoutRef = useRef<number | null>(null);
  /** 鎵撳瓧鏈烘晥鏋滀娇鐢ㄧ殑瀹氭椂鍣紝鍙繚鐣欏綋鍓嶆鍦ㄦ墦瀛楃殑涓€鏉?*/
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 鏄惁瀛樺湪姝ｅ湪杩愯鐨勬墦瀛楁満锛岀敤浜庡喅瀹氫綍鏃跺仠姝㈤┍鍔?3D 鍔ㄧ敾 */
  const typewriterActiveRef = useRef(false);
  /** 褰撳墠鎵撳瓧鏈哄搴旂殑娑堟伅 id 涓庡畬鏁寸洰鏍囨枃鏈紝閬垮厤鎴睆绛夋儏鍐典笅鏂囨湰閲嶅鎷兼帴 */
  const typewriterMessageIdRef = useRef<string | null>(null);
  const typewriterTargetTextRef = useRef<string>('');

  const liveAsrPreviewText = useMemo(
    () => concatLiveAsrText(liveAsrCommittedText, liveAsrInterimText),
    [liveAsrCommittedText, liveAsrInterimText],
  );
  const browserStreamingAsrAvailable = useMemo(() => isBrowserStreamingAsrSupported(), []);
  const liveAsrPreviewTextRef = useRef(liveAsrPreviewText);
  liveAsrPreviewTextRef.current = liveAsrPreviewText;

  const liveAsrHasDraft = Boolean(liveAsrPreviewText.trim());

  const stopScenePanelDrag = useCallback(() => {
    scenePanelDragRef.current = null;
    window.removeEventListener('pointermove', handleScenePanelPointerMove);
    window.removeEventListener('pointerup', stopScenePanelDrag);
    window.removeEventListener('pointercancel', stopScenePanelDrag);
    document.body.style.removeProperty('user-select');
  }, []);

  const handleScenePanelPointerMove = useCallback((event: PointerEvent) => {
    const drag = scenePanelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setScenePanelOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }, []);

  const beginScenePanelDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    scenePanelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: scenePanelOffset.x,
      originY: scenePanelOffset.y,
    };
    document.body.style.setProperty('user-select', 'none');
    window.addEventListener('pointermove', handleScenePanelPointerMove);
    window.addEventListener('pointerup', stopScenePanelDrag);
    window.addEventListener('pointercancel', stopScenePanelDrag);
  }, [handleScenePanelPointerMove, scenePanelOffset.x, scenePanelOffset.y, stopScenePanelDrag]);

  const liveAsrStatusText = useMemo(() => {
    if (!browserAsrEnabled) {
      return '实时听写已关闭';
    }
    switch (liveAsrStatus) {
      case 'ready':
        return '实时听写已就绪';
      case 'listening':
        return '正在实时听写中';
      case 'processing':
        return '正在整理语音内容';
      case 'error':
        return liveAsrError || '实时听写暂时不可用';
      case 'off':
      default:
        return '实时听写已关闭';
    }
  }, [browserAsrEnabled, liveAsrError, liveAsrStatus]);

  useEffect(() => {
    return () => {
      stopScenePanelDrag();
    };
  }, [stopScenePanelDrag]);

  useEffect(() => {
    try {
      const savedBackground = localStorage.getItem(CHAT_PAGE_BACKGROUND_KEY);
      if (!savedBackground) {
        setBackgroundSelection({ kind: 'none' });
        return;
      }

      // Backward compatibility for the older direct-image storage format.
      if (!savedBackground.trim().startsWith('{')) {
        setBackgroundSelection({ kind: 'custom-image', src: savedBackground });
        return;
      }

      const parsed = JSON.parse(savedBackground) as
        | ChatBackgroundSelection
        | { kind: 'custom'; image: string };

      if (parsed?.kind === 'custom' && typeof parsed.image === 'string') {
        setBackgroundSelection({ kind: 'custom-image', src: parsed.image });
        return;
      }

      if (
        parsed?.kind === 'preset' ||
        parsed?.kind === 'custom-image' ||
        parsed?.kind === 'custom-video' ||
        parsed?.kind === 'none'
      ) {
        setBackgroundSelection(parsed);
        return;
      }

      setBackgroundSelection({ kind: 'none' });
    } catch (error) {
      console.log('[ChatPage] debug');
      setBackgroundSelection({ kind: 'none' });
    }
  }, []);

  useEffect(() => {
    if (!isCallLayout) {
      setCallElapsedSec(0);
      setCallStreamCaption('');
      return;
    }

    setCallStreamCaption('');
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setCallElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isCallLayout]);

  const persistBackgroundSelection = useCallback((nextSelection: ChatBackgroundSelection) => {
    setBackgroundSelection(nextSelection);

    try {
      localStorage.setItem(CHAT_PAGE_BACKGROUND_KEY, JSON.stringify(nextSelection));
    } catch (error) {
      console.error('[ChatPage] Failed to save chat background:', error);
    }
  }, []);

  const handlePickBackground = useCallback(() => {
    setIsBackgroundModalOpen(true);
  }, []);

  const handleChooseNoBackground = useCallback(() => {
    persistBackgroundSelection({ kind: 'none' });
    setIsBackgroundModalOpen(false);
  }, [persistBackgroundSelection]);

  const handleChoosePresetBackground = useCallback((presetId: string) => {
    persistBackgroundSelection({ kind: 'preset', presetId });
    setIsBackgroundModalOpen(false);
  }, [persistBackgroundSelection]);

  const handleChooseCustomUpload = useCallback(() => {
    backgroundInputRef.current?.click();
  }, []);

  const handleBackgroundUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      window.alert('请选择图片或视频文件。');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return;
      }

      const nextSelection: ChatBackgroundSelection = isVideo
        ? { kind: 'custom-video', src: reader.result }
        : { kind: 'custom-image', src: reader.result };

      setBackgroundSelection(nextSelection);
      setIsBackgroundModalOpen(false);

      try {
        localStorage.setItem(CHAT_PAGE_BACKGROUND_KEY, JSON.stringify(nextSelection));
      } catch (error) {
        console.error('[ChatPage] Failed to save chat background:', error);
        window.alert(
          isVideo
            ? '视频背景已临时应用，但文件较大，无法保存到本地，刷新页面后会失效。'
            : '背景已临时应用，但图片过大，无法保存到本地。'
        );
      }
    };

    reader.onerror = () => {
      console.error('[ChatPage] Failed to read selected background file:', reader.error);
      window.alert('读取所选背景文件失败，请换一个试试。');
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  }, []);

  const activePresetBackground = useMemo(
    () =>
      backgroundSelection.kind === 'preset'
        ? CHAT_BACKGROUND_PRESETS.find((preset) => preset.id === backgroundSelection.presetId) || null
        : null,
    [backgroundSelection]
  );

  const pageBackgroundStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (backgroundSelection.kind === 'custom-image') {
      return {
        backgroundImage: `url(${backgroundSelection.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }

    if (
      backgroundSelection.kind === 'preset' &&
      activePresetBackground &&
      activePresetBackground.mediaType === 'image'
    ) {
      return {
        backgroundImage: `url(${activePresetBackground.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }

    return undefined;
  }, [activePresetBackground, backgroundSelection]);

  const faceAnchorCacheKey = useMemo(() => {
    if (!companion) {
      return '';
    }
    return companion.model_id
      ? `${companion.id}__${companion.model_id}`
      : companion.id;
  }, [companion]);

  const pageBackgroundVideoSrc = useMemo(() => {
    if (backgroundSelection.kind === 'custom-video') {
      return backgroundSelection.src;
    }

    if (
      backgroundSelection.kind === 'preset' &&
      activePresetBackground &&
      activePresetBackground.mediaType === 'video'
    ) {
      return activePresetBackground.src;
    }

    return null;
  }, [activePresetBackground, backgroundSelection]);

  const hasBackground = backgroundSelection.kind !== 'none';
  const extraActionButtons = useMemo(() => {
    const labels = ['动作1', '动作2', '动作3'];
    const extraActions = companion?.extraActions ?? [];

    return labels.map((label, index) => {
      const action = extraActions[index];

      return {
        id: action?.id ?? `extra-action-${index + 1}`,
        label,
        modelUrl: action?.modelUrl ?? '',
        disabled: !action?.modelUrl,
      };
    });
  }, [companion]);
  const activeExtraActionIndex = useMemo(() => {
    const index = extraActionButtons.findIndex(
      (action) => action.id === activeExtraActionId && Boolean(action.modelUrl)
    );

    return index >= 0 ? index : null;
  }, [activeExtraActionId, extraActionButtons]);

  const handleToggleExtraAction = useCallback((actionId: string, modelUrl: string) => {
    if (!modelUrl) {
      return;
    }

    if (isDriving) {
      return;
    }

    setActiveExtraActionId((current) => (current === actionId ? null : actionId));
  }, [isDriving]);

  useEffect(() => {
    setActiveExtraActionId(null);
  }, [companion?.id]);

  useEffect(() => {
    if (
      activeExtraActionId &&
      !extraActionButtons.some((action) => action.id === activeExtraActionId && action.modelUrl)
    ) {
      setActiveExtraActionId(null);
    }
  }, [activeExtraActionId, extraActionButtons]);

  const buildWelcomeMessages = useCallback((): ChatMessage[] => {
    if (!companion?.isBound) return [];
    return [{
      id: `welcome-${Date.now()}`,
      role: 'model',
      text: `System ready. I am ${companion.name}.`,
      timestamp: Date.now(),
    }];
  }, [companion]);

  const stopAssistantPlaybackLocally = useCallback(() => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
    if (pendingHttpTimeoutRef.current) {
      clearTimeout(pendingHttpTimeoutRef.current);
      pendingHttpTimeoutRef.current = null;
    }

    typewriterActiveRef.current = false;
    typewriterMessageIdRef.current = null;
    typewriterTargetTextRef.current = '';
    pendingHttpMessageIdRef.current = null;
    pendingHttpResponseTextRef.current = '';
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

    setActiveLipSync(null);
    setCallStreamCaption('');
    setIsDriving(false);
  }, []);

  const interruptAssistantPlayback = useCallback(async () => {
    stopAssistantPlaybackLocally();
    suppressPanelReplyTextRef.current = false;
    await requestAssistantInterrupt('User');
  }, [stopAssistantPlaybackLocally]);

  /**
   * 瀵规寚瀹氭秷鎭仛鈥滄墦瀛楁満鈥濋€愬瓧鏄剧ず銆?   * @param messageId 娑堟伅 id
   * @param fullText 瀹屾暣鏂囨湰
   * @param startIndex 璧峰瀛楃绱㈠紩锛岄粯璁?0
   * @param charMs 姣忎釜瀛楃鐨勯棿闅旀绉掓暟锛岄粯璁?100
   * @param onComplete 瀹屾垚鍚庣殑鍥炶皟锛堜緥濡傚仠姝㈤┍鍔?3D 鍔ㄧ敾锛?   */
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
      if (isCallLayoutRef.current) {
        setCallStreamCaption(slice);
      }
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

  // Memoize the companion identity used by history-loading effects.
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

  // 浠庡悗绔姞杞戒細璇濆巻鍙诧紙閬靛惊 normalizeChatMessages锛涘綋鍓嶈鑹查€氳繃 companionRef 璇诲彇锛岄伩鍏嶉棴鍖呰繃鏈燂級
  const loadMessageHistory = useCallback(async (modelId?: string) => {
    const c = companionRef.current;
    if (!c) return;

    // Reuse cached history for five minutes to avoid unnecessary reloads.
    const cacheKey = modelId || c.model_id || '';
    const cached = messageCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('[ChatPage] Using cached history messages.');
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
          console.log('[ChatPage] Using locally persisted chat history.');
          messageCacheRef.current.set(cacheKey, {
            messages: normalizedStoredMessages,
            timestamp: Date.now(),
          });
          setMessages(normalizedStoredMessages);
          return;
        }
      }
    } catch (storageError) {
      console.log('[ChatPage] debug');
    }
    
    try {
      setIsLoadingHistory(true);
      const { getFayApiUrl } = await import('../services/apiConfig');
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
        throw new Error(`鍔犺浇鍘嗗彶娑堟伅澶辫触: ${response.status}`);
      }

      const result = await response.json();
      if (result.list && Array.isArray(result.list)) {
        // 灏嗗悗绔秷鎭浆鎹负鍓嶇 ChatMessage
        const historyMessages = normalizeChatMessages(result.list);

        // 鍐欏叆鍐呭瓨缂撳瓨
        messageCacheRef.current.set(cacheKey, {
          messages: historyMessages.length > 0 ? historyMessages : [],
          timestamp: Date.now()
        });

        // Show history when available, otherwise fall back to a welcome message.
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        } else if (c.isBound) {
          const welcomeMessage = [{ 
            id: 'welcome', 
            role: 'model' as const, 
            text: `System ready. I am ${c.name}.`,
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
      console.error('鍔犺浇鍘嗗彶娑堟伅澶辫触:', error);
      // If history loading fails, fall back to the welcome message.
      if (c.isBound) {
        setMessages((prev) => {
          if (prev.length > 0) return prev;
          return [
            {
              id: 'welcome',
              role: 'model' as const,
              text: `System ready. I am ${c.name}.`,
              timestamp: Date.now(),
            },
          ];
        });
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [normalizeChatMessages]);

  // companion 鍙樺寲鏃跺姞杞藉搴斾細璇濆巻鍙诧紙鍋氳妭娴侊紝閬垮厤棰戠箒瑙﹀彂涓庢姈鍔級
  useEffect(() => {
    // Reset model loading whenever the active companion changes.
    setModelLoading(true);
    
    // 娓呯悊涔嬪墠鐨勫畾鏃跺櫒
    if (loadHistoryTimeoutRef.current) {
      clearTimeout(loadHistoryTimeoutRef.current);
    }

    // 鑺傛祦锛氬欢杩?300ms 鍐嶅姞杞斤紝閬垮厤棰戠箒鍒囨崲瑙掕壊瀵艰嚧鎶栧姩
    loadHistoryTimeoutRef.current = window.setTimeout(() => {
      const c = companionRef.current;
      if (c && c.isBound) {
        loadMessageHistory(c.model_id);
      } else {
        // 鏈粦瀹氬垯娓呯┖娑堟伅
        setMessages([]);
      }
    }, 300);

    return () => {
      if (loadHistoryTimeoutRef.current) {
        clearTimeout(loadHistoryTimeoutRef.current);
      }
    };
  }, [companionKey, loadMessageHistory]); // 渚濊禆绋冲畾鐨?companionKey 鍜?loadMessageHistory

  // Cache the last successful websocket URL for the current session.
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
      // 蹇界暐缂撳瓨寮傚父
    }
  };

  // Memoize the bound state so the websocket effect does not churn unnecessarily.
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
      console.log('[ChatPage] debug');
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
        const { getFayApiUrl } = await import('../services/apiConfig');
        const apiUrl = getFayApiUrl();

        // 瑙ｆ瀽鍚庣 API 鍦板潃锛堝惈鍗忚涓庣鍙ｏ級
        const api = new URL(apiUrl);
        const scheme = api.protocol === 'https:' ? 'wss' : 'ws';

        // 浼樺厛灏濊瘯 /human_ws锛屽叾娆″洖閫€鍒?:10003
        const wsUrl = `${scheme}://${api.host}/human_ws`;
        const directWsUrl = `${scheme}://${api.hostname}:10003`;

        // Candidate URLs ordered by preference.
        const candidateUrls = [wsUrl, directWsUrl];

        // Prefer a previously successful WebSocket URL when one is cached.
        const cachedUrl = getCachedWsUrl();
        const prioritizedUrls = cachedUrl && candidateUrls.includes(cachedUrl)
          ? [cachedUrl, ...candidateUrls.filter(u => u !== cachedUrl)]
          : candidateUrls;

        console.log('[ChatPage] debug');

        const createWsWithTimeout = (url: string, timeoutMs = 2000) => {
          return new Promise<WebSocket>((resolve, reject) => {
            try {
              const socket = new WebSocket(url);
              const timer = setTimeout(() => {
                try { socket.close(); } catch {}
                reject(new Error(`WebSocket 鏉╃偞甯寸搾鍛: ${url}`));
              }, timeoutMs);
              socket.onopen = () => {
                clearTimeout(timer);
                resolve(socket);
              };
              socket.onerror = (err) => {
                clearTimeout(timer);
                reject(err instanceof Event ? new Error(`WebSocket 闁挎瑨顕? ${url}`) : (err as any));
              };
            } catch (e) {
              reject(e);
            }
          });
        };

        // 娑撹尪顢戠亸婵婄槸鏉╃偞甯撮敍宀勪缉閸忓秴鑻熺悰灞筋嚤閼锋挳顣剁换浣规焽瀵偓
        // Try candidate URLs in priority order and stop at the first successful connection.
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
            console.log('[ChatPage] debug');
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
            console.log(`[ChatPage] Connection failed for ${url}, trying the next candidate.`, error);
            continue;
          }
        }
        
        if (!connected) {
          console.error('[ChatPage] All WebSocket connection attempts failed.');
          setWsConnecting(false);
          wsConnectStartedRef.current = false;
          return;
        }
      } catch (error) {
        console.log('[ChatPage] debug');
        setWsConnecting(false);
        wsConnectStartedRef.current = false;
      }
    };

    /**
     * 娉ㄥ唽 WebSocket 浜嬩欢
     * @param ws WebSocket 瀹炰緥
     */
    const setupWebSocketHandlers = (ws: WebSocket) => {
        ws.onopen = () => {
          console.log('[ChatPage] debug');
          setWsConnecting(false);
          reconnectAttemptsRef.current = 0;
          const initMessage = { 
            Username: 'User', 
            Output: true 
          };
          console.log('[ChatPage] debug');
          ws.send(JSON.stringify(initMessage));
        };


        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // 澶勭悊闊抽娑堟伅
            if (data.Topic === 'human' && data.Data && data.Data.HttpValue) {
              const audioUrl = data.Data.HttpValue;
              const isFirst = data.Data.IsFirst === 1;
              const isEnd = data.Data.IsEnd === 1;
              const lips = Array.isArray(data.Data.Lips)
                ? data.Data.Lips.filter(
                    (item: any) =>
                      item &&
                      typeof item.Lip === 'string' &&
                      typeof item.Time === 'number',
                  )
                : [];

              console.log('[ChatPage] debug');






              // Reuse or create the placeholder model message when the first chunk arrives.
              if (isFirst) {
                lastPlayedAudioUrlRef.current = null;
                setMessages(prev => {
                  const preferredMessageId =
                    currentAudioMessageIdRef.current || pendingHttpMessageIdRef.current;
                  if (preferredMessageId && prev.some((message) => message.id === preferredMessageId)) {
                    currentAudioMessageIdRef.current = preferredMessageId;
                    pendingHttpMessageIdRef.current = preferredMessageId;
                    return prev;
                  }
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

              // 鍏ラ槦锛堝悓涓€ url 涓嶉噸澶嶅叆闃燂級
              if (!audioQueueRef.current.some((item) => item.url === audioUrl)) {
                audioQueueRef.current.push({ url: audioUrl, isFirst, isEnd, lips });
              }
              
              // Delay queue processing until state updates for the first chunk have landed.
              if (isFirst) {
                setTimeout(() => processAudioQueue(), 0);
              } else {
                processAudioQueue();
              }

              // Drive the avatar as soon as the first audio chunk is ready.
              if (isFirst) {
                setIsDriving(true);
              }

              // 鏈缁撴潫涓旀病鏈夋墦瀛楁満鏃跺啀鍋滄椹卞姩锛堟枃瀛楁湭鎵撳畬鍒欎繚鎸侀┍鍔級
              if (isEnd && !typewriterActiveRef.current) {
                setTimeout(() => setIsDriving(false), 1000);
              }
            } else if (data.liveState !== undefined || data.panelMsg !== undefined) {
              // 蹇界暐 Fay 鍐呴儴鐘舵€佹秷鎭紝閬垮厤鎺у埗鍙拌鏃犵敤鏃ュ織鍒峰睆
            } else if (import.meta.env.DEV) {
              // 寮€鍙戠幆澧冧繚鐣欏皯閲忔湭鐭ユ秷鎭殑璋冭瘯鍑哄彛
              console.debug('[ChatPage] 鏈鐞嗙殑 WebSocket 娑堟伅:', {
                Topic: data.Topic,
                hasData: !!data.Data,
                keys: Object.keys(data),
              });
            }

            // Prefer streamed panel replies when the websocket provides them.
            if (data.panelReply) {
              if (suppressPanelReplyTextRef.current) {
                return;
              }
              if (data.panelReply.type === 'member') {
                console.log('[ChatPage] debug');
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
              console.log('[ChatPage] debug');





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
                  console.log('[ChatPage] debug');
                  setTimeout(() => typewriterToMessage(messageId, fullText, currentText.length, 90, onComplete), 0);
                  return prev;
                } else {
                  console.log('[ChatPage] debug');
                  setTimeout(() => typewriterToMessage(messageId, content, 0, 90, onComplete), 0);
                  return [...prev, { id: messageId, role: 'model', text: '', timestamp: Date.now() }];
                }
              });
            }
          } catch (error) {
            console.log('[ChatPage] debug');
          }
        };

        ws.onerror = (error) => {
          console.log('[ChatPage] debug');
          const wsTarget = error.target as WebSocket;
          console.log('[ChatPage] debug');




          
          // On Capacitor, WebSocket can fail and HTTP becomes the fallback path.
          if (isCapacitor()) {
            console.warn('[ChatPage] WebSocket failed on Capacitor; HTTP fallback will be used when possible.');
          }
        };

        ws.onclose = (event) => {
          console.log('[ChatPage] WebSocket connection closed:', {
            code: event.code,
            reason: event.reason || 'none',
            wasClean: event.wasClean,
            url: wsRef.current?.url
          });
          wsRef.current = null;
          
          // 寮傚父鏂紑锛堝 code 1006锛夋椂娓呯悊 URL 缂撳瓨
          if (event.code === 1006) {
            try {
              sessionStorage.removeItem('websocket_cached_url');
            } catch {}
            if (isCapacitor()) {
              console.warn('[ChatPage] WebSocket closed unexpectedly on Capacitor. Please check the network connection.');
            }
          }
          
          // Reconnect only after abnormal closes.
          if (event.code !== 1000 && companion && isBound) {
            const attempts = reconnectAttemptsRef.current;
            const maxReconnectAttempts = 5;
            
            if (attempts < maxReconnectAttempts) {
              // 閹稿洦鏆熼柅鈧柆鍖＄窗5s閵?0s閵?0s閳ワ缚绗傞梽?30s
              const delay = Math.min(5000 * Math.pow(2, attempts), 30000);
              console.log(`[ChatPage] 鐏忓棗婀?${delay / 1000} 缁夋帒鎮楃亸婵婄槸闁插秷绻涢敍鍫㈩儑 ${attempts + 1}/${maxReconnectAttempts} 濞嗏槄绱?..`);
              reconnectAttemptsRef.current = attempts + 1;
              
              setTimeout(() => {
                if (companion && isBound && !wsRef.current) {
                  console.log('[ChatPage] debug');
                  connectWebSocket();
                }
              }, delay);
            } else {
              console.error('[ChatPage] Maximum reconnect attempts reached. Please refresh the page after checking the network connection.');
              reconnectAttemptsRef.current = 0; // Reset so the user can retry manually.
            }
          } else {
            // 姝ｅ父鍏抽棴锛坈ode 1000锛夛紝閲嶇疆閲嶈繛娆℃暟
            reconnectAttemptsRef.current = 0;
          }
        };
    };

    connectWebSocket();

    // 濞撳懐鎮婇敍姘潗缂佸牆鍙ч幒澶婄秼閸撳秷绻涢幒銉礉闁灝鍘ら悜顓熸纯閺傞绗呴崣宀冪箾閹恒儱顕遍懛鎾櫢婢跺秵绉烽幁?闁插秴顦查棅鎶筋暥
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
  }, [isBound, companion]); // 缁嬪啿鐣鹃惃?isBound 娑?companion

  /**
   * 澶勭悊闊抽鎾斁闃熷垪锛堟寜椤哄簭鎾斁锛岄伩鍏嶉噸澶嶆挱鏀撅級
   */
  const processAudioQueue = async () => {
    // 姝ｅ湪澶勭悊鎴栭槦鍒椾负绌哄垯杩斿洖
    if (isProcessingQueueRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    // 姝ｅ湪鎾斁鍒欑瓑寰呭綋鍓嶆缁撴潫
    if (isPlayingRef.current && audioPlayerRef.current) {
        console.log('[ChatPage] debug');
      return;
    }
    isProcessingQueueRef.current = true;


    while (audioQueueRef.current.length > 0) {
      // 閼汇儲顒滈崷銊︽尡閺€鎯у灟缁涘绶熺紒鎾存将
      if (isPlayingRef.current) {
        console.log('[ChatPage] debug');
        // 鏉烆喛顕楃粵澶婄窡閹绢厽鏂佺紒鎾存将
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
          
          // Stop waiting after a fixed timeout so the queue cannot hang forever.
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });
      }
      const audioItem = audioQueueRef.current.shift();

      if (!audioItem) {
        break;
      }
      if (audioItem.url === lastPlayedAudioUrlRef.current) {
        continue;
      }
      lastPlayedAudioUrlRef.current = audioItem.url;

      console.log('[ChatPage] debug');
      try {
        await playAudio(audioItem.url, audioItem.isFirst, audioItem.isEnd, audioItem.lips);
        
        if (audioItem.isEnd) {
          // 等到最后一段音频真正播放完成后再继续。
        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            if (!isPlayingRef.current) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
            
            // Resolve the wait after a maximum timeout as a safety valve.
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 5000);
          });
        }
      } catch (error) {
        // Continue with the next queued item.
      }
    }
    isProcessingQueueRef.current = false;

    console.log('[ChatPage] debug');
  };

  const attachAudioToModelMessage = useCallback((audioUrl: string) => {
    const messageId = currentAudioMessageIdRef.current || pendingHttpMessageIdRef.current;
    if (!messageId) {
      return;
    }
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              audioUrl,
            }
          : message,
      ),
    );
  }, []);

  /**
   * 閹绢厽鏂佹稉鈧▓?TTS 闂婃娊顣?   * @param audioUrl 闂婃娊顣?URL
   * @param isFirst 閺勵垰鎯佹＃鏍唽
   * @param isEnd 閺勵垰鎯侀張顐ｎ唽
   */
  const playAudio = async (
    audioUrl: string,
    isFirst: boolean,
    isEnd: boolean,
    lips?: LipSyncFrame[],
  ): Promise<void> => {
    // Resolve relative URLs and prepare audio unlock checks before playback.
    let fullAudioUrl = audioUrl;
    if (!audioUrl.startsWith('http://') && !audioUrl.startsWith('https://')) {
      // 閻╃顕捄顖氱窞閸掓瑦瀚鹃幒?API 閺?URL
      const apiConfigModule = await import('../services/apiConfig');
      const apiUrl = apiConfigModule.getFayApiUrl();
      if (audioUrl.startsWith('/')) {
        fullAudioUrl = `${apiUrl}${audioUrl}`;
      } else {
        fullAudioUrl = `${apiUrl}/${audioUrl}`;
      }
    }

    // Unlock audio first on Capacitor before playing streamed speech.
    if (isCapacitor() && !audioUnlockedRef.current) {
      console.log('[ChatPage] debug');
      try {
        const unlockAudio = new Audio();
        unlockAudio.volume = 0.01;
        unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        await unlockAudio.play();
        unlockAudio.pause();
        unlockAudio.src = '';
        audioUnlockedRef.current = true;
        console.log('[ChatPage] Audio unlocked.');
      } catch (unlockError) {
        console.log('[ChatPage] debug');
      }
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[ChatPage] debug');
        
        // 閼汇儱鍑￠張澶愮叾妫版垵婀幘顓炲帥閸嬫粣绱欓悶鍡氼啈娑撳﹣绗夋惔鏂垮絺閻㈢噦绱濋梼鐔峰灙瀹歌弓瑕嗙悰宀嬬礆
        if (audioPlayerRef.current && isPlayingRef.current) {
          console.log('[ChatPage] debug');
          audioPlayerRef.current.pause();
          audioPlayerRef.current = null;
          isPlayingRef.current = false;
        }

      console.log('[ChatPage] debug');
      const audio = new Audio();
      audioPlayerRef.current = audio;

      
      // Configure the audio element before playback starts.
      audio.volume = 1.0;
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous'; // 閸忎浇顔忕捄銊ョ厵閿涘牐瀚㈤棁鈧憰渚婄礆
      
      // 缂佹垵鐣鹃棅鎶筋暥娴滃娆?      setupAudioEvents(audio, isEnd, fullAudioUrl);
      
      // 閸忓牐顔?src閿涘苯鍟€缁涘褰查幘顓熸杹
      audio.src = fullAudioUrl;
      
      // 缁涘绶?canplay
      const canPlayHandler = () => {
        console.log('[ChatPage] Audio can play now, starting playback.');
        audio.removeEventListener('canplay', canPlayHandler);
        audio.removeEventListener('canplaythrough', canPlayHandler);
        
        if (isCapacitor() && !audioUnlockedRef.current) {
          console.log('[ChatPage] debug');
          // 鐏忔繆鐦憴锝夋敚
          const unlockAudio = new Audio();
          unlockAudio.volume = 0.01;
          unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          unlockAudio.play()
            .then(() => {
              unlockAudio.pause();
              unlockAudio.src = '';
              audioUnlockedRef.current = true;
              console.log('[ChatPage] debug');
              tryPlayAudio();
            })
            .catch(() => {
              console.warn('[ChatPage] Audio unlock failed, but playback will still be attempted.');
              tryPlayAudio();
            });
        } else {
          tryPlayAudio();
        }
      };
      
      const tryPlayAudio = () => {
        console.log('[ChatPage] debug');
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[ChatPage] Audio playback started.');
              audioUnlockedRef.current = true;
              attachAudioToModelMessage(fullAudioUrl);
              if (lips && lips.length > 0) {
                setActiveLipSync({
                  sequence: lips,
                  startedAt: Date.now(),
                  audioUrl: fullAudioUrl,
                });
              } else {
                setActiveLipSync(null);
              }
              resolve();
            })
            .catch((error) => {
              console.log('[ChatPage] debug');
              console.log('[ChatPage] debug');








              
              // On Capacitor, retry playback after a user gesture.
              if (isCapacitor()) {
                console.log('[ChatPage] debug');
                
                const tryPlayOnInteraction = (event?: Event) => {
                  if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  
                  console.log('[ChatPage] User interaction detected, retrying audio playback.');
                  audio.play()
                    .then(() => {
                      console.log('[ChatPage] Audio playback succeeded after user interaction.');
                      audioUnlockedRef.current = true;
                      attachAudioToModelMessage(fullAudioUrl);
                      if (lips && lips.length > 0) {
                        setActiveLipSync({
                          sequence: lips,
                          startedAt: Date.now(),
                          audioUrl: fullAudioUrl,
                        });
                      } else {
                        setActiveLipSync(null);
                      }
                      document.removeEventListener('click', tryPlayOnInteraction);
                      document.removeEventListener('touchstart', tryPlayOnInteraction);
                      document.removeEventListener('touchend', tryPlayOnInteraction);
                      resolve(); // 閹绢厽鏂侀幋鎰
                    })
                    .catch((err) => {
                      console.log('[ChatPage] debug');
                      console.log('[ChatPage] debug');





                      reject(err); // 閹绢厽鏂佹径杈Е
                    });
                };
                
                // 閻╂垵鎯夐悽銊﹀煕閹靛濞嶉柌宥堢槸
                document.addEventListener('click', tryPlayOnInteraction, { once: true });
                document.addEventListener('touchstart', tryPlayOnInteraction, { once: true });
                document.addEventListener('touchend', tryPlayOnInteraction, { once: true });
              } else {
                reject(error); // 闂?Capacitor 閻╁瓨甯存径杈Е
              }
            });
        } else {
          resolve(); // 閺?playPromise 閸掓瑧娲块幒?resolve
        }
      };
      
      audio.addEventListener('canplay', canPlayHandler);
      audio.addEventListener('canplaythrough', canPlayHandler);
      
      // 瀹告彃褰查幘顓炲灟閻╁瓨甯寸挧?canPlayHandler
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        console.log('[ChatPage] debug');
        canPlayHandler();
      }
      
      // As a fallback, try playback after a short load timeout.
      setTimeout(() => {
        if (!isPlayingRef.current && !audio.ended) {
          const readyState = audio.readyState;
          console.log('[ChatPage] debug');
          if (readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            console.log('[ChatPage] debug');
            tryPlayAudio();
          } else {
            console.log('[ChatPage] debug');
            reject(new Error('音频加载超时'));
          }
        }
      }, 2000);
      
    } catch (error) {
      console.error('[ChatPage] Failed to create audio player:', error);
      reject(error);
    }
  });
  };

  /**
   * 缂佹垵鐣鹃棅鎶筋暥娴滃娆㈤惄鎴濇儔
   */
  const setupAudioEvents = (
    audio: HTMLAudioElement,
    isEnd: boolean,
    fullAudioUrl?: string
  ) => {
    // Ensure the audio element uses the expected playback settings.
    audio.volume = 1.0;
    audio.preload = 'auto';

    audio.onloadstart = () => {
      console.log('[ChatPage] Audio started loading.');
    };

    audio.oncanplay = () => {
      console.log('[ChatPage] debug');
    };

    audio.onplay = () => {
      isPlayingRef.current = true;
      console.log('[ChatPage] debug');
    };

    audio.onended = () => {
      isPlayingRef.current = false;
      console.log('[ChatPage] debug');
      if (!audioQueueRef.current.length) {
        setActiveLipSync(null);
      }
      if (isEnd) {
        setIsDriving(false);
      }
      // 閹绢厼鐣崥搴ｆ埛缂侇叀绐囬梼鐔峰灙
      setTimeout(() => {
        processAudioQueue();
      }, 50);
    };

    audio.onerror = (error) => {
      isPlayingRef.current = false;
      setActiveLipSync(null);
      console.log('[ChatPage] debug');
      console.log('[ChatPage] debug');





      if (isEnd) {
        setIsDriving(false);
      }
    };

    audio.onabort = () => {
      console.warn('[ChatPage] Audio loading was aborted.');
      isPlayingRef.current = false;
      setActiveLipSync(null);
    };
  };

  // Unlock audio playback on Capacitor after a user interaction.
  useEffect(() => {
    if (isCapacitor() && !audioUnlockedRef.current) {
      console.log('[ChatPage] Capacitor detected, preparing audio unlock flow.');
      
      // 閻劍鐎惌顓㈡饯闂婂磭澧栫憴锝夋敚閹绢厽鏂侀弶鍐
      const unlockAudio = () => {
        if (audioUnlockedRef.current) return;
        
        try {
          const unlockAudio = new Audio();
          unlockAudio.volume = 0.01; // 鏉╂垳绠棃娆撶叾
          unlockAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          
          const playPromise = unlockAudio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('[ChatPage] Audio playback successfully unlocked.');
                audioUnlockedRef.current = true;
                unlockAudio.pause();
                unlockAudio.src = '';
              })
              .catch((error) => {
                console.log('[ChatPage] debug');
              });
          }
        } catch (error) {
          console.log('[ChatPage] debug');
        }
      };

      // Unlock audio playback on the first user interaction when required.
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

  // 閺傜増绉烽幁顖涙濠婃艾鍩屾惔鏇㈠劥
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
      console.log('[ChatPage] debug');
    }
  }, [chatStorageKey, messages, companion]);

  const handleClearCurrentChat = useCallback(async () => {
    if (!companion) return;

    const nextMessages = buildWelcomeMessages();
    const cacheKey = companion.model_id || '';

    try {
      stopAssistantPlaybackLocally();
      suppressPanelReplyTextRef.current = false;
      void requestAssistantInterrupt('User');

      await modelService.clearModelHistory({
        modelId: companion.model_id || undefined,
        username: 'User',
      });
    } catch (error) {
      console.log('[ChatPage] debug');
    } finally {
      if (cacheKey) {
        messageCacheRef.current.delete(cacheKey);
      }
      if (chatStorageKey) {
        localStorage.removeItem(chatStorageKey);
      }
      setInput('');
      setPendingImageUrl(null);
      setCallStreamCaption('');
      setIsDriving(false);
      setMessages(nextMessages);
    }
  }, [buildWelcomeMessages, chatStorageKey, companion, stopAssistantPlaybackLocally]);

  const buildHistoryText = (message: ChatMessage) => {
    const parts: string[] = [];
    if (message.text?.trim()) {
      parts.push(message.text.trim());
    }
    if (message.imageUrl) {
      parts.push('[用户附带一张图片]');
    }
    if (message.audioUrl) {
      parts.push('[用户附带一段音频]');
    }
    return parts.join('\n').trim();
  };

  const handleChatImagePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('目前互动页只支持发送图片。');
      event.currentTarget.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        setPendingImageUrl(result);
        setInput((prev) => prev || '请看看这张图片');
      }
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = '';
  };

  const handleSend = async () => {
    await sendMessageWithText(
      input.trim(),
      'text',
      pendingImageUrl
        ? {
            imageUrl: pendingImageUrl,
          }
        : undefined,
    );
    setLiveAsrCommittedText('');
    setLiveAsrInterimText('');
    setLiveAsrError('');
    setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
  };

  const handleToggleCallLayout = useCallback(() => {
    setIsCallLayout((value) => {
      if (value) {
        setCallStreamCaption('');
      }
      return !value;
    });
  }, []);

  const clearLiveAsrDraft = useCallback(() => {
    setLiveAsrCommittedText('');
    setLiveAsrInterimText('');
    setLiveAsrError('');
    setInput('');
    setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
  }, [browserAsrEnabled]);

  const startBrowserListening = useCallback((): boolean => {
    if (browserAsrStartInFlightRef.current || recognitionRef.current || audioService.isRecording()) {
      return false;
    }

    if (!isBrowserStreamingAsrSupported()) {
      setLiveAsrStatus('error');
      setLiveAsrError('当前浏览器不支持实时听写');
      return false;
    }

    browserAsrStartInFlightRef.current = true;
    const controller = new BrowserStreamingAsrController();
    const started = controller.start({
      onInterim: (transcript) => {
        setLiveAsrStatus('listening');
        setLiveAsrError('');
        setLiveAsrInterimText(transcript);
        setInput(concatLiveAsrText(liveAsrCommittedText, transcript));
      },
      onFinal: (transcript) => {
        setLiveAsrStatus('listening');
        setLiveAsrError('');
        setLiveAsrCommittedText((prev) => {
          const merged = concatLiveAsrText(prev, transcript);
          setInput(merged);
          return merged;
        });
        setLiveAsrInterimText('');
      },
      onError: (message) => {
        browserAsrStartInFlightRef.current = false;
        setIsListening(false);
        setLiveAsrStatus('error');
        setLiveAsrError(message || '实时听写启动失败');
        recognitionRef.current = null;
      },
      onStop: () => {
        browserAsrStartInFlightRef.current = false;
        setIsListening(false);
        setLiveAsrInterimText('');
        setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
        recognitionRef.current = null;
      },
    });

    if (started) {
      setIsListening(true);
      setLiveAsrStatus('listening');
      setLiveAsrError('');
      recognitionRef.current = controller;
      return true;
    }

    browserAsrStartInFlightRef.current = false;
    setLiveAsrStatus('error');
    setLiveAsrError('无法启动实时听写');
    return false;
  }, [browserAsrEnabled, liveAsrCommittedText]);

  useEffect(() => {
    if (isListening) {
      return;
    }

    setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
    if (!browserAsrEnabled) {
      setLiveAsrInterimText('');
    }
  }, [browserAsrEnabled, isListening]);

  useEffect(() => {
    if (!browserAsrEnabled) {
      autoStartBrowserAsrRef.current = false;
      return;
    }

    if (!autoStartBrowserAsrRef.current || isListening || recognitionRef.current) {
      return;
    }

    autoStartBrowserAsrRef.current = false;
    startBrowserListening();
  }, [browserAsrEnabled, isListening, startBrowserListening]);

  /**
   * 閹稿绮扮€规碍鏋冮張顒€褰傞柅浣风閺夆剝绉烽幁顖ょ礄闁款喚娲忛崣鎴︹偓浣风瑢鐠囶參鐓剁拠鍡楀焼缂佹挻鐏夐懛顏勫З閸欐垿鈧礁鍙￠悽顭掔礆
   * @param text 鐟曚礁褰傞柅浣烘畱閺傚洦婀?   */
  const sendMessageWithText = async (
    text: string,
    source: InteractionSource = 'text',
    media?: { imageUrl?: string; audioUrl?: string; audioMimeType?: string },
  ) => {
    const normalizedText =
      text.trim() ||
      (media?.imageUrl ? '请看看这张图片' : media?.audioUrl ? '这是一段语音内容' : '');
    if (!normalizedText || !companion) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: normalizedText,
      timestamp: Date.now(),
      imageUrl: media?.imageUrl,
      audioUrl: media?.audioUrl,
      audioMimeType: media?.audioMimeType,
    };
    const newId = (Date.now() + 1).toString();
    const streamThisTurn = useStreamLlm || isCallLayout;
    const shouldPreferWebSocketReply = !streamThisTurn;
    const hadActiveAssistant =
      isDriving ||
      isPlayingRef.current ||
      typewriterActiveRef.current ||
      audioQueueRef.current.length > 0 ||
      Boolean(pendingHttpMessageIdRef.current);

    if (hadActiveAssistant) {
      stopAssistantPlaybackLocally();
      void requestAssistantInterrupt('User');
    }

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

    // Use flushSync so the user message and placeholder render immediately.
    flushSync(() => {
      setMessages(prev => {
        const placeholder = { id: newId, role: 'model' as const, text: '', timestamp: Date.now() };
        return [...prev, userMsg, placeholder];
      });
      setInput('');
      setLiveAsrCommittedText('');
      setLiveAsrInterimText('');
      setLiveAsrError('');
      setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
      setPendingImageUrl(null);
      setIsDriving(true);
      if (isCallLayoutRef.current) {
        setCallStreamCaption('');
      }
    });
    pendingHttpMessageIdRef.current = newId;
    currentAudioMessageIdRef.current = newId;
    preferWebSocketReplyRef.current = shouldPreferWebSocketReply;

    const sendTime = Date.now();
    pendingWebSocketSendAtRef.current = sendTime;

    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: buildHistoryText(m) }] }));
      const requestText = buildHistoryText(userMsg);
      const emotionContext = buildEmotionContext(normalizedText, source);
      let responseText = '';
      let streamSucceeded = false;

      if (streamThisTurn) {
        suppressPanelReplyTextRef.current = true;
        try {
          responseText = await streamChatWithCompanion(
            companion,
            history,
            requestText,
            emotionContext,
            (accumulatedText) => {
              if (isCallLayoutRef.current) {
                setCallStreamCaption(accumulatedText);
              }
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === newId ? { ...message, text: accumulatedText } : message,
                ),
              );
            },
            { interactionMode: isCallLayoutRef.current ? 'call' : 'chat' },
          );
          pendingHttpResponseTextRef.current = responseText;
          preferWebSocketReplyRef.current = false;
          pendingHttpMessageIdRef.current = null;
          streamSucceeded = true;
          window.setTimeout(() => {
            if (pendingWebSocketSendAtRef.current === sendTime) {
              suppressPanelReplyTextRef.current = false;
            }
          }, 4000);
        } catch (streamError) {
          console.warn('[ChatPage] Streaming companion chat failed, falling back to standard mode.', streamError);
          suppressPanelReplyTextRef.current = false;
          responseText = await chatWithCompanion(
            companion,
            history,
            requestText,
            emotionContext,
            { interactionMode: isCallLayoutRef.current ? 'call' : 'chat' },
          );
          if (isCallLayoutRef.current) {
            setCallStreamCaption(responseText);
          }
          pendingHttpResponseTextRef.current = responseText;
          preferWebSocketReplyRef.current = true;
        }
      } else {
        suppressPanelReplyTextRef.current = false;
        responseText = await chatWithCompanion(
          companion,
          history,
          requestText,
          emotionContext,
          { interactionMode: isCallLayoutRef.current ? 'call' : 'chat' },
        );
        if (isCallLayoutRef.current) {
          setCallStreamCaption(responseText);
        }
        pendingHttpResponseTextRef.current = responseText;
      }

      const textToShow = responseText;
      console.log('[ChatPage] debug');
      if (pendingHttpTimeoutRef.current) clearTimeout(pendingHttpTimeoutRef.current);
      pendingHttpTimeoutRef.current = null;
      if (!streamSucceeded && shouldPreferWebSocketReply) {
        // Keep an HTTP fallback in case the WebSocket reply does not arrive in time.
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
      } else if (!streamSucceeded) {
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
      } else {
        setTimeout(() => {
          if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
            setIsDriving(false);
          }
        }, 2200);
      }

      // On Capacitor, fall back to the HTTP audio fetch when WebSocket is unavailable.
      if (isCapacitor() && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        console.log('[ChatPage] debug');
        setTimeout(() => {
          tryGetAudioFromHttp(sendTime, responseText);
        }, 2000);
      }
    } catch (error) {
      console.log('[ChatPage] debug');
      suppressPanelReplyTextRef.current = false;
      setIsDriving(false);
    }
  };

  const sendLiveAsrDraft = useCallback(async () => {
    const transcript = liveAsrPreviewText.trim();
    if (!transcript) {
      return;
    }

    await sendMessageWithText(transcript, 'voice');
    setLiveAsrCommittedText('');
    setLiveAsrInterimText('');
    setLiveAsrError('');
    setInput('');
    setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
  }, [browserAsrEnabled, liveAsrPreviewText, sendMessageWithText]);

  const stopCurrentListening = useCallback(async () => {
    let hadBrowserRecognition = false;
    if (recognitionRef.current) {
      hadBrowserRecognition = true;
      try {
        (recognitionRef.current as BrowserStreamingAsrController).stop?.();
      } catch {
        try {
          (recognitionRef.current as any).stop();
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null;
      browserAsrStartInFlightRef.current = false;
      setIsListening(false);
      setLiveAsrInterimText('');
      setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
      if (audioService.isRecording()) {
        try {
          await audioService.stopRecording();
        } catch {
          // ignore cleanup failures
        }
      }
      if (hadBrowserRecognition) {
        return;
      }
    }

    try {
      const audioBlob = await audioService.stopRecording();
      if (audioBlob) {
        setLiveAsrStatus('processing');
        const transcript = await audioService.uploadAndRecognize(audioBlob, companion?.name || 'User');
        if (transcript && transcript.trim()) {
          const localAudioUrl = URL.createObjectURL(audioBlob);
          await sendMessageWithText(transcript, 'voice', {
            audioUrl: localAudioUrl,
            audioMimeType: audioBlob.type || 'audio/webm',
          });
        }
      }
    } catch {
      setLiveAsrStatus('error');
      setLiveAsrError('语音识别失败，请稍后重试');
    } finally {
      setIsListening(false);
      setLiveAsrInterimText('');
      setLiveAsrStatus(browserAsrEnabled ? 'ready' : 'off');
    }
  }, [browserAsrEnabled, companion?.name, sendMessageWithText]);

  const handleToggleBrowserAsr = useCallback(async () => {
    if (!browserStreamingAsrAvailable) {
      setBrowserAsrEnabled(false);
      setLiveAsrStatus('off');
      setLiveAsrError('当前手机 App 内暂不支持实时听写，请使用普通录音识别。');
      window.alert('当前手机 App 内暂不支持实时听写，请使用普通录音识别。');
      return;
    }

    if (browserAsrEnabled) {
      autoStartBrowserAsrRef.current = false;
      callAutoSendInFlightRef.current = false;
      setBrowserAsrEnabled(false);
      await stopCurrentListening();
      return;
    }

    autoStartBrowserAsrRef.current = true;
    setBrowserAsrEnabled(true);
    setLiveAsrError('');
    setLiveAsrStatus('ready');
  }, [browserAsrEnabled, browserStreamingAsrAvailable, stopCurrentListening]);

  useEffect(() => {
    if (browserStreamingAsrAvailable || !browserAsrEnabled) {
      return;
    }

    autoStartBrowserAsrRef.current = false;
    callAutoSendInFlightRef.current = false;
    setBrowserAsrEnabled(false);
    setLiveAsrStatus('off');
  }, [browserAsrEnabled, browserStreamingAsrAvailable]);

  useEffect(() => {
    if (!isCallLayout || !browserAsrEnabled) {
      callAutoSendInFlightRef.current = false;
      return;
    }

    if (
      isListening ||
      recognitionRef.current ||
      browserAsrStartInFlightRef.current ||
      audioService.isRecording() ||
      callAutoSendInFlightRef.current
    ) {
      return;
    }

    const assistantBusy =
      isDriving ||
      isPlayingRef.current ||
      typewriterActiveRef.current ||
      audioQueueRef.current.length > 0 ||
      Boolean(pendingHttpMessageIdRef.current);

    if (assistantBusy) {
      return;
    }

    const transcript = liveAsrPreviewTextRef.current.trim();
    if (transcript) {
      callAutoSendInFlightRef.current = true;
      window.setTimeout(() => {
        void sendLiveAsrDraft().finally(() => {
          callAutoSendInFlightRef.current = false;
          autoStartBrowserAsrRef.current = true;
        });
      }, 160);
      return;
    }

    autoStartBrowserAsrRef.current = true;
    startBrowserListening();
  }, [
    browserAsrEnabled,
    isCallLayout,
    isDriving,
    isListening,
    liveAsrPreviewText,
    sendLiveAsrDraft,
    startBrowserListening,
  ]);

  /**
   * HTTP 鏉烆喛顕楅幏澶婂絿 TTS 閺傚洣娆㈤敍鍦礶bSocket 娑撳秴褰查悽銊︽閻ㄥ嫬顦柅澶涚礆
   * 鏉烆喛顕?/audio/sample-*.wav 缁涘褰查懗鑺ユ瀮娴犺泛鎮?   */
  const tryGetAudioFromHttp = async (sendTime: number, text: string) => {
    try {
      const { getFayApiUrl } = await import('../services/apiConfig');
      const apiUrl = getFayApiUrl();
      
      console.log('[ChatPage] debug');
      
      // Poll for generated audio with a bounded retry window.
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 500;
      
      const pollForAudio = setInterval(async () => {
        attempts++;
        console.log(`[ChatPage] 鐏忔繆鐦懢宄板絿闂婃娊顣?(${attempts}/${maxAttempts})`);
        
        // 閹稿妞傞梻瀵哥崶閹风厧褰查懗鐣屾畱 wav 閸?        // 娑撯偓閼割剙褰傚☉鍫熶紖閸?1閿? 缁夋帒鍞撮悽鐔稿灇
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
          
            const response = await fetch(audioUrl, {
              method: 'HEAD',
              cache: 'no-cache'
            });

            
            if (response.ok) {
              console.log('[ChatPage] debug');
              clearInterval(pollForAudio);
              
              // Play the audio file once it becomes available.
              playAudio(audioUrl, true, true).catch((error) => {
                console.log('[ChatPage] debug');
              });
              return;
            }



        }
        
        // 鏉堟儳鍩岄張鈧径褎顐奸弫鏉垮灟閸嬫粍顒涙潪顔款嚄
        if (attempts >= maxAttempts) {
          clearInterval(pollForAudio);
          console.log('[ChatPage] debug');
        }
      }, pollInterval);
      
    } catch (error) {
      console.log('[ChatPage] debug');
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      await stopCurrentListening();
    } else {
      if (browserAsrEnabled && browserStreamingAsrAvailable) {
        setIsChatExpanded(true);
        startBrowserListening();
        return;
      }

      // Start recording using the environment-appropriate recorder.
      const useCapacitorRecorder = isCapacitor();
      
      if (useCapacitorRecorder) {
        try {
          setIsChatExpanded(true);
          await audioService.startRecording();
          setIsListening(true);
          setLiveAsrStatus('processing');
          setLiveAsrError('');
          console.log('[ChatPage] Starting recording with audioService in Capacitor.');
        } catch (error) {
          console.log('[ChatPage] debug');
          alert('启动录音失败，请稍后重试');
        }
      } else {
        if (browserAsrEnabled && browserStreamingAsrAvailable) {
          if (startBrowserListening()) {
            return;
          }
        }

        // 濞村繗顫嶉崳銊︽￥ Web Speech API閿涘瞼鏁?audioService
        try {
          setIsChatExpanded(true);
          await audioService.startRecording();
          setIsListening(true);
          setLiveAsrStatus('processing');
          setLiveAsrError('');
          console.log('[ChatPage] Starting recording with audioService because Web Speech API is unavailable.');
        } catch (error) {
          console.log('[ChatPage] debug');
          alert('启动录音失败，请稍后重试');
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

  // Fall back to the base model when animation variants are missing.
  const hasAnimationModels = !!(companion.idleModelUrl || companion.talkingModelUrl);
  if (!hasAnimationModels && companion.model3dUrl) {
    console.log('[ChatPage] debug');
    console.warn('[ChatPage] The model will render without animation.' );
  }

  const liveStatusLabel = wsConnecting
    ? '连接中'
    : isDriving
      ? isCallLayout
        ? '通话中'
        : '对话中'
      : isCallLayout
        ? '实时通话'
        : '待机';

  const liveStatusTone = wsConnecting
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : isDriving
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-white/90 text-slate-600';
  const showCallMiniAsr = isCallLayout && browserAsrEnabled && !isChatExpanded;
  const utilityStackBottom = isChatExpanded
    ? 'calc(48vh + env(safe-area-inset-bottom, 0px) + 1.1rem)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 5.9rem)';
  const scenePanelBottom = isChatExpanded
    ? 'calc(48vh + env(safe-area-inset-bottom, 0px) + 5.9rem)'
    : showCallMiniAsr
      ? 'calc(env(safe-area-inset-bottom, 0px) + 13.8rem)'
      : 'calc(env(safe-area-inset-bottom, 0px) + 8rem)';
  const callMiniAsrBottom = 'calc(env(safe-area-inset-bottom, 0px) + 10.6rem)';
  const callCaptionBottom = isChatExpanded
    ? 'calc(48vh + env(safe-area-inset-bottom, 0px) + 1.2rem)'
    : showCallMiniAsr
      ? 'calc(env(safe-area-inset-bottom, 0px) + 13.4rem)'
      : 'calc(env(safe-area-inset-bottom, 0px) + 10.8rem)';

  return (
    <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-[#ffeef5] via-[#fff5e6] to-[#ffe4cc] overflow-hidden">
      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/*,video/mp4,video/webm,video/ogg"
        className="hidden"
        onChange={handleBackgroundUpload}
      />
      <Modal
        isOpen={isBackgroundModalOpen}
        onClose={() => setIsBackgroundModalOpen(false)}
        title="选择背景"
        variant="light"
        panelClassName="max-w-lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleChooseNoBackground}
              className={`overflow-hidden rounded-2xl border text-left transition-all ${
                backgroundSelection.kind === 'none'
                  ? 'border-pink-400 shadow-lg ring-2 ring-pink-200'
                  : 'border-pink-100 hover:border-pink-200'
              }`}
            >
              <div className="h-24 bg-gradient-to-br from-white to-slate-100 flex items-center justify-center text-sm font-medium text-gray-500">
                无背景              </div>
              <div className="px-3 py-2 text-sm text-gray-700">默认页面背景</div>
            </button>
            {CHAT_BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleChoosePresetBackground(preset.id)}
                className={`overflow-hidden rounded-2xl border text-left transition-all ${
                  backgroundSelection.kind === 'preset' && backgroundSelection.presetId === preset.id
                    ? 'border-pink-400 shadow-lg ring-2 ring-pink-200'
                    : 'border-pink-100 hover:border-pink-200'
                }`}
              >
                {preset.mediaType === 'video' ? (
                  <video
                    className="h-24 w-full object-cover"
                    src={preset.src}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <div
                    className="h-24"
                    style={{
                      backgroundImage: `url(${preset.src})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                )}
                <div className="px-3 py-2 text-sm text-gray-700">{preset.name}</div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleChooseCustomUpload}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
              backgroundSelection.kind === 'custom-image' || backgroundSelection.kind === 'custom-video'
                ? 'border-pink-400 bg-pink-50 text-pink-700'
                : 'border-pink-200 bg-white text-gray-700 hover:bg-pink-50'
            }`}
          >
            <ImageIcon size={16} />
            上传自定义背景（图片/视频）
          </button>
          <p className="text-xs leading-5 text-gray-500">
            建议使用 3 到 6 秒、静音、体积较小的 MP4 或 WebM 循环视频。
          </p>
        </div>
      </Modal>
      {hasBackground && (
        <>
          {pageBackgroundVideoSrc && (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              src={pageBackgroundVideoSrc}
              autoPlay
              loop
              muted
              playsInline
            />
          )}
          <div className="absolute inset-0" style={pageBackgroundStyle} />
          <div className="absolute inset-0 bg-black/5" />
        </>
      )}
      {/* 3D 閸︾儤娅欑€圭懓娅掗敍姘祼鐎规艾鏄傜€甸潻绱濆Ο鈥崇€风粙鍐茬暰閺勫墽銇?*/}
      <div className="fixed inset-0 z-0">
        <div className="w-full h-full relative">
          {/* 濡€崇€烽崝鐘烘祰閸楃姳缍?*/}
          {modelLoading && (
            <div
              className={`absolute inset-0 flex items-center justify-center z-10 ${
                hasBackground ? 'bg-black/20 backdrop-blur-sm' : 'bg-gradient-to-br from-[#ffeef5] via-[#fff5e6] to-[#ffe4cc]'
              }`}
              style={hasBackground ? pageBackgroundStyle : undefined}
            >
              <div className="text-center">
                <Cpu size={32} className="animate-spin text-purple-400 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">Loading 3D model...</p>
                <p className="text-gray-500 text-xs mt-1">This may take a few seconds</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsAvatarRotationLocked((locked) => !locked)}
            className="hidden"
            title={isAvatarRotationLocked ? 'Unlock avatar rotation' : 'Lock avatar rotation'}
          >
            {isAvatarRotationLocked ? <Lock size={14} /> : <Unlock size={14} />}
            <span>{isAvatarRotationLocked ? 'Locked' : 'Unlocked'}</span>
          </button>
          <AvatarScene 
            idleModelUrl={companion.idleModelUrl || companion.model3dUrl}
            talkingModelUrl={companion.talkingModelUrl || companion.idleModelUrl || companion.model3dUrl}
            waveModelUrl={companion.waveModelUrl}
            extraActionModelUrls={extraActionButtons.map((action) => action.modelUrl)}
            activeExtraActionIndex={activeExtraActionIndex}
            modelUrl={companion.model3dUrl} // 閸氭垵鎮楅崗鐓庮啇
            isTalking={isDriving}
            lipSyncData={activeLipSync}
            isRotationLocked={isAvatarRotationLocked}
            showFaceControllerDebug={showFaceControllerDebug}
            faceAnchorCacheKey={faceAnchorCacheKey}
            faceAnchorRefreshToken={faceAnchorRefreshToken}
            onLoadComplete={() => setModelLoading(false)}
            onLoadStart={() => setModelLoading(true)}
          />
        </div>
      </div>

      <div className="fixed left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3">
        {extraActionButtons.map((action) => {
          const isActive = activeExtraActionId === action.id;
          const isDisabled = action.disabled || isDriving;

          return (
            <button
              key={action.id}
              type="button"
              disabled={isDisabled}
              onClick={() => handleToggleExtraAction(action.id, action.modelUrl)}
              className={`min-h-[52px] min-w-[92px] rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md transition-all ${
                isDisabled
                  ? 'cursor-not-allowed border-white/25 bg-white/25 text-white/55'
                  : isActive
                    ? 'border-orange-300 bg-orange-500/85 text-white shadow-orange-200/50'
                    : 'border-white/60 bg-white/72 text-gray-700 hover:bg-white/88'
              }`}
            >
              {action.label}
            </button>
          );
        })}
      </div>

      <div className="fixed right-4 top-4 z-30">
        {isEmotionCaptureMinimized ? (
          <button
            type="button"
            onClick={() => setIsEmotionCaptureMinimized(false)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/88 text-gray-700 shadow-xl backdrop-blur-md transition hover:bg-white"
            title="展开摄像头识别"
          >
            <Camera size={20} />
          </button>
        ) : (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsEmotionCaptureMinimized(true)}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/85 text-sm font-bold text-gray-600 shadow-sm transition hover:bg-white"
              title="收起摄像头识别"
            >
              -
            </button>
            <EmotionCapture
              onEmotionChange={setDetectedEmotionLabel}
              onVoiceEmotionChange={setDetectedVoiceEmotionLabel}
              autoStartCameraWhenCall={isCallLayout}
              pipPosition="top"
              containerClassName={`transition-all ${isCallLayout ? 'w-52' : 'w-44'}`}
            />
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        className="fixed left-4 top-4 z-30 rounded-[22px] border border-white/70 bg-white/88 p-2.5 text-gray-700 shadow-xl backdrop-blur-md hover:bg-white"
        onClick={() => navigate('/')}
      >
        <X size={20} />
      </Button>

      <div className="fixed left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/70 bg-white/78 px-4 py-2 shadow-lg backdrop-blur-md">
        <span className="text-base font-semibold text-slate-700">{companion.name}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${liveStatusTone}`}>
          {liveStatusLabel}
        </span>
        {isCallLayout ? (
          <>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              实时语音
            </span>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              {String(Math.floor(callElapsedSec / 60)).padStart(2, '0')}:
              {String(callElapsedSec % 60).padStart(2, '0')}
            </span>
          </>
        ) : null}
      </div>

      {isCallLayout ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[24] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 px-2"
          style={{ bottom: callCaptionBottom }}
        >
          <div className="rounded-[26px] border border-emerald-200/70 bg-white/78 px-4 py-3 text-center shadow-lg backdrop-blur-md">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600/90">
              Live Caption
            </div>
            <div className="mt-1 min-h-[3.2rem] text-sm leading-7 text-slate-700">
              {callStreamCaption ? (
                <span>{callStreamCaption}</span>
              ) : (
                <span className="text-slate-400">
                  通话模式下会在这里同步显示流式回复字幕。
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isScenePanelMinimized ? (
        <></>
      ) : (
        <div
          className="fixed left-3 z-[44] w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] border border-white/70 bg-white/84 p-3 shadow-xl backdrop-blur-md"
          style={{
            bottom: scenePanelBottom,
            transform: `translate3d(${scenePanelOffset.x}px, ${scenePanelOffset.y}px, 0)`,
          }}
        >
          <button
            type="button"
            onClick={() => setIsScenePanelMinimized(true)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/90 text-sm font-bold text-slate-500 shadow-sm transition hover:bg-white"
            title="最小化实时与场景"
          >
            -
          </button>
          <div
            className="flex cursor-grab items-center gap-2 rounded-2xl pr-8 active:cursor-grabbing"
            onPointerDown={beginScenePanelDrag}
            style={{ touchAction: 'none' }}
            title="拖动实时与场景"
          >
            <Move size={16} className="text-violet-500" />
            <h3 className="text-base font-semibold text-slate-800">实时与场景</h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void interruptAssistantPlayback()}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow-sm transition hover:bg-rose-50"
            >
              <StopCircle size={14} />
              打断
            </button>
            <button
              type="button"
              onClick={() => setUseStreamLlm((value) => !value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                useStreamLlm
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <AudioLines size={14} />
              流式回复{useStreamLlm ? '开' : '关'}
            </button>
            <button
              type="button"
              onClick={handleToggleCallLayout}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                isCallLayout
                  ? 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {isCallLayout ? <PhoneOff size={14} /> : <Phone size={14} />}
              实时通话{isCallLayout ? '开' : '关'}
            </button>
            <button
              type="button"
              onClick={handleClearCurrentChat}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              <Trash2 size={14} />
              清空对话
            </button>
            <button
              type="button"
              disabled={!browserStreamingAsrAvailable}
              onClick={() => void handleToggleBrowserAsr()}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                browserAsrEnabled
                  ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              } disabled:opacity-50`}
            >
              <Mic size={14} />
              实时听写{browserAsrEnabled ? '开' : '关'}
            </button>
            <button
              type="button"
              onClick={handlePickBackground}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition ${
                hasBackground
                  ? 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ImageIcon size={14} />
              背景
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 font-medium text-amber-700">
              当前情绪：{detectedEmotionLabel}
            </span>
            <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 font-medium text-teal-700">
              语音情绪：{detectedVoiceEmotionLabel}
            </span>
            <span className="rounded-full border border-fuchsia-100 bg-fuchsia-50 px-3 py-1 font-medium text-fuchsia-700">
              {inputMode === 'voice' ? '语音输入' : '文本输入'}
            </span>
          </div>

          {browserAsrEnabled && !showCallMiniAsr ? (
            <div className="mt-2 rounded-2xl border border-cyan-100 bg-cyan-50/85 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-cyan-700">实时听写</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{liveAsrStatusText}</div>
                </div>
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    isListening
                      ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                      : 'border-cyan-200 bg-white text-cyan-700 hover:bg-cyan-100'
                  }`}
                >
                  <Mic size={12} />
                  {isListening ? '停止听写' : '开始听写'}
                </button>
              </div>

              <div className="mt-2 min-h-[4.5rem] rounded-2xl border border-white/80 bg-white/80 px-3 py-2">
                {liveAsrHasDraft ? (
                  <div className="max-h-28 overflow-y-auto text-[12px] leading-6 text-slate-700 whitespace-pre-wrap break-words">
                    {liveAsrPreviewText}
                  </div>
                ) : (
                  <div className="text-[11px] leading-5 text-slate-400">
                    {isListening
                      ? '正在实时接收你的语音，识别结果会出现在这里。'
                      : '开启后可以边说边出字，整理好的听写内容可以直接发送到对话。'}
                  </div>
                )}
              </div>

              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={clearLiveAsrDraft}
                  disabled={!liveAsrHasDraft && !liveAsrError}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  清空听写
                </button>
                <button
                  type="button"
                  onClick={() => void sendLiveAsrDraft()}
                  disabled={!liveAsrHasDraft}
                  className="rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  发送听写
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {isScenePanelMinimized ? (
        <div
          className="fixed left-3 z-[43]"
          style={{
            bottom: isChatExpanded
              ? 'calc(48vh + env(safe-area-inset-bottom, 0px) + 8.1rem)'
              : 'calc(env(safe-area-inset-bottom, 0px) + 13.6rem)',
            transform: `translate3d(${scenePanelOffset.x}px, ${scenePanelOffset.y}px, 0)`,
          }}
        >
          <button
            type="button"
            onClick={() => setIsScenePanelMinimized(false)}
            className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/84 px-3 py-2 text-xs font-semibold text-slate-700 shadow-xl backdrop-blur-md transition hover:bg-white"
          >
            <span
              className="inline-flex cursor-grab items-center active:cursor-grabbing"
              onPointerDown={beginScenePanelDrag}
              style={{ touchAction: 'none' }}
              title="拖动实时与场景"
            >
              <Move size={15} className="text-violet-500" />
            </span>
            实时与场景 +
          </button>
        </div>
      ) : null}

      <div className="fixed left-0 right-0 bottom-[84px] z-30 flex justify-center px-4">
        <div className="flex max-w-[min(30rem,calc(100vw-7rem))] flex-wrap items-center justify-center gap-3 rounded-full border border-white/70 bg-white/66 px-4 py-3 shadow-xl backdrop-blur-md">
        {!isChatExpanded && (
          <button 
            onClick={toggleListening} 
            className={`w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md border border-pink-300/50 shadow-2xl transition-all duration-300 ${isListening ? 'bg-red-500/80 animate-pulse scale-110' : 'bg-white/70 hover:bg-white/90'}`}
          >
            <Mic size={28} className="text-gray-700" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsChatExpanded(!isChatExpanded)}
          className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-pink-300/40 bg-white/80 px-3 text-xs font-medium text-gray-700 backdrop-blur-md shadow-lg transition-colors hover:bg-white/90"
          title={isChatExpanded ? '收起对话面板' : '展开对话'}
        >
          {isChatExpanded ? (
            <>
              <ChevronDown size={14} className="shrink-0" />
              收起对话
            </>
          ) : (
            <>
              <ChevronUp size={14} className="shrink-0" />
              展开对话
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsAvatarRotationLocked((locked) => !locked)}
          className={`inline-flex h-8 min-w-0 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-pink-300/40 px-2 text-[11px] font-medium text-gray-700 backdrop-blur-md shadow-lg transition-colors ${
            isAvatarRotationLocked ? 'bg-pink-100/95' : 'bg-white/80 hover:bg-white/90'
          }`}
          title={isAvatarRotationLocked ? '取消固定' : '固定'}
        >
          {isAvatarRotationLocked ? '取消固定' : '固定'}
        </button>
        <button
          type="button"
          onClick={() => setIsFaceToolsExpanded((value) => !value)}
          className={`inline-flex h-8 min-w-0 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-pink-300/40 px-3 text-[11px] font-medium text-gray-700 backdrop-blur-md shadow-lg transition-colors ${
            isFaceToolsExpanded ? 'bg-pink-100/95' : 'bg-white/80 hover:bg-white/90'
          }`}
          title={isFaceToolsExpanded ? '收起面部工具' : '展开面部工具'}
        >
          {isFaceToolsExpanded ? '面部 -' : '面部 +'}
        </button>
        {isFaceToolsExpanded ? (
          <>
            <button
              type="button"
              onClick={() => setShowFaceControllerDebug((enabled) => !enabled)}
              className={`inline-flex h-8 min-w-0 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-pink-300/40 px-3 text-[11px] font-medium text-gray-700 backdrop-blur-md shadow-lg transition-colors ${
                showFaceControllerDebug ? 'bg-pink-100/95' : 'bg-white/80 hover:bg-white/90'
              }`}
              title={showFaceControllerDebug ? '关闭面部调试' : '显示面部调试'}
            >
              {showFaceControllerDebug ? '关闭面部调试' : '显示面部调试'}
            </button>
            <button
              type="button"
              onClick={() => setFaceAnchorRefreshToken((token) => token + 1)}
              className="inline-flex h-8 min-w-0 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-pink-300/40 bg-white/80 px-3 text-[11px] font-medium text-gray-700 backdrop-blur-md shadow-lg transition-colors hover:bg-white/90"
              title="重新标点并保存新的面部数据"
            >
              重新标点保存
            </button>
          </>
        ) : null}
        </div>
      </div>

      {showCallMiniAsr ? (
        <div
          className="fixed left-1/2 z-[32] w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 rounded-[22px] border border-white/70 bg-white/82 px-3 py-2 shadow-xl backdrop-blur-md"
          style={{ bottom: callMiniAsrBottom }}
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-full border border-cyan-100 bg-rose-50/70 px-3 py-2 text-[11px] leading-5 text-slate-700">
              <div className="truncate">
                {liveAsrHasDraft
                  ? liveAsrPreviewText
                  : isListening
                    ? '正在实时听写中...'
                    : browserAsrEnabled
                      ? '自动听写已开启，说完会自动发送。'
                      : '点击麦克风开启自动听写。'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleToggleBrowserAsr()}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  browserAsrEnabled
                    ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                    : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                }`}
                title={browserAsrEnabled ? '取消自动录音' : '开启自动录音'}
              >
                <Mic size={15} />
              </button>
              <button
                type="button"
                onClick={clearLiveAsrDraft}
                disabled={!liveAsrHasDraft && !liveAsrError}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="清空听写"
              >
                <Trash2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => void sendLiveAsrDraft()}
                disabled={!liveAsrHasDraft}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200 bg-white text-cyan-700 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="发送听写"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 閼卞﹤銇夐棃銏℃緲閿涙艾娴愮€规艾鐣炬担宥忕幢閻?transform 閺€鎯版崳閿涘矂浼╅崗宥嗘暭 bottom/height 闂傤亜鐫?*/}
      <div 
        className={`fixed left-0 right-0 bottom-[72px] h-[48vh] z-40 bg-white/80 backdrop-blur-md border-t border-pink-300/50 rounded-t-3xl flex flex-col transition-transform duration-300 ease-out shadow-2xl ${
          isChatExpanded ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* 閺€鎯版崳閹稿鎸?- 闂堛垺婢樻い鍫曞劥 */}
        {isChatExpanded && (
          <div className="flex-shrink-0 flex justify-center pt-3 pb-2">
            <button 
              onClick={() => setIsChatExpanded(false)} 
              className="px-4 py-2 bg-white/90 backdrop-blur-md rounded-full border border-pink-300/40 text-xs font-medium text-gray-700 hover:bg-white transition-colors flex items-center gap-2 shadow-md"
            >
              <ChevronDown size={14}/> 收起对话            </button>
          </div>
        )}
        
        {/* 濞戝牊浼呴崚妤勩€冮敍姘祼鐎规岸鐝惔锕€褰插姘З閿涙埠t-6 娑撶儤鐨靛▔鈥茬瑐閻ｆ瑧娅ч敍灞藉讲閺€閫涜礋 pt-8/pt-10 */}
        <div
          ref={messagesContainerRef}
          className="flex flex-1 min-h-0 flex-col justify-end overflow-y-auto pt-6 px-4 pb-4 gap-4"
        >
          {isLoadingHistory && (
            <div className="flex justify-center py-4">
              <div className="text-gray-600 text-sm flex items-center gap-2">
                <Cpu size={14} className="animate-spin" /> 加载历史消息中…              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 backdrop-blur-sm ${msg.role === 'user' ? 'bg-primary/80 text-white rounded-tr-none' : 'bg-white/70 text-gray-700 rounded-tl-none'}`}>
                {msg.imageUrl ? (
                  <img src={msg.imageUrl} alt="" className="mb-2 max-h-48 w-full max-w-xs rounded-xl object-contain border border-white/20" />
                ) : null}
                {msg.audioUrl ? (
                  <div className="mb-2">
                    <audio controls src={msg.audioUrl} className="w-64 max-w-full" />
                  </div>
                ) : null}
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              </div>
            </div>
          ))}
          {isDriving && (
            <div className="flex justify-start">
              <div className="bg-white/70 backdrop-blur-sm px-4 py-2 rounded-2xl rounded-tl-none text-xs text-gray-600 flex items-center gap-2">
                <Cpu size={12} className="animate-spin" /> 正在生成回复并驱动模型...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
        
        {/* 鏉堟挸鍙嗛崠楦垮垱鎼存洩绱辩拠顓㈢叾濡€崇础閿涙氨鍋ｉ崜宥夋饯閹焦灏濋妴浣哄仯閸氬骸濮╅幀浣瑰皾閿涘牆浜曟穱锟狀棑閿?*/}
        <div className="flex-shrink-0 space-y-2 border-t border-pink-300/50 bg-white/90 p-3 shadow-lg backdrop-blur-sm sm:p-4">
          <input
            ref={chatImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChatImagePick}
          />
          {pendingImageUrl ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-pink-50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
              <img src={pendingImageUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
                <span className="truncate text-xs text-pink-700">已选择图片</span>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-pink-600"
                onClick={() => setPendingImageUrl(null)}
              >
                移除
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" onClick={toggleListening} className={`h-9 w-9 rounded-full p-2 sm:h-10 sm:w-10 ${isListening ? 'bg-red-50 text-red-500' : ''}`}>
              <Mic size={18} className="sm:h-5 sm:w-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => chatImageInputRef.current?.click()}
              className="h-9 w-9 rounded-full p-2 sm:h-10 sm:w-10"
              title="发送图片"
            >
              <ImageIcon size={17} className="sm:h-[18px] sm:w-[18px]" />
            </Button>
            {inputMode === 'voice' ? (
              /* 鐠囶參鐓堕弶鈽呯窗娑撳孩鏋冪€涙绶崗銉ユ倱妤傛﹫绱卞▔銏犺埌娑擃參妫挎妯硅⒈鏉堥€涚秵 */
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
                    className="flex h-10 min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-pink-300/40 bg-white/70 px-2 transition-colors hover:bg-white/90 sm:px-4"
                    onClick={toggleListening}
                  >
                    <div className="flex h-8 w-full items-end justify-center gap-1 overflow-hidden sm:gap-1.5" aria-hidden="true">
                      {waveHeights.map((h, i) => (
                        <span
                          key={i}
                          className="w-1 shrink-0 rounded-full bg-gradient-to-t from-pink-500 to-pink-400 origin-bottom sm:w-1.5"
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
                className="h-10 min-w-0 rounded-xl border border-pink-300/40 bg-white/70 px-3 py-2 text-gray-700 placeholder-gray-400 box-border focus:outline-none focus:border-primary/50 sm:px-4"
                placeholder="发送消息…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              title={inputMode === 'voice' ? '切换为文字输入' : '切换为语音输入'}
              onClick={() => setInputMode(m => m === 'voice' ? 'text' : 'voice')}
              className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            >
              {inputMode === 'voice' ? <Keyboard size={18} className="text-gray-500 sm:h-5 sm:w-5" /> : <AudioLines size={18} className="text-pink-500 sm:h-5 sm:w-5" />}
            </Button>
            <Button onClick={handleSend} disabled={!input.trim() && !pendingImageUrl} className="h-9 w-9 shrink-0 rounded-xl p-0 sm:h-10 sm:w-10">
              <Send size={17} className="sm:h-[18px] sm:w-[18px]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
