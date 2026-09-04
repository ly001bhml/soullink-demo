import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { APIConfig } from '../services/apiConfig';

type Props = {
  onEmotionChange: (emotion: string) => void;
  onVoiceEmotionChange?: (voiceEmotion: string) => void;
  onVoiceTranscriptChange?: (transcript: string) => void;
  autoStartCameraWhenCall?: boolean;
  pipPosition?: 'bottom' | 'top';
  containerClassName?: string;
  fallbackEmotionLabel?: string;
  externalVoiceEmotionLabel?: string;
  externalVoiceTranscript?: string;
};

type DetectEmotionResponse = {
  emotion?: string;
  label?: string;
  available?: boolean;
  message?: string;
};

type DetectAudioEmotionResponse = {
  voice_emotion?: string;
  transcript?: string;
  available?: boolean;
  message?: string;
};

type FrameSample = {
  id: number;
  blob: Blob;
};

const FRAME_CAPTURE_INTERVAL_MS = 60;
const FRAME_BATCH_SIZE = 16;
const FRAME_BUFFER_SIZE = 32;
const MAX_FRAME_WIDTH = 320;
const MAX_FRAME_HEIGHT = 180;
const JPEG_QUALITY = 0.68;

const EMOTION_LABEL_MAP: Record<string, string> = {
  anger: '愤怒',
  anxiety: '焦虑',
  contempt: '轻蔑',
  disappointment: '失望',
  disgust: '厌恶',
  fear: '恐惧',
  happiness: '开心',
  helplessness: '无助',
  neutral: '平静',
  sadness: '悲伤',
  surprise: '惊讶',
};

function formatFrameName(index: number): string {
  return `${String(index).padStart(4, '0')}.jpg`;
}

function localizeEmotionLabel(label: string): string {
  const normalized = String(label || '').trim();
  if (!normalized) {
    return normalized;
  }
  return EMOTION_LABEL_MAP[normalized.toLowerCase()] || normalized;
}

function createImageBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export const EmotionCapture: React.FC<Props> = ({
  onEmotionChange,
  onVoiceEmotionChange,
  onVoiceTranscriptChange,
  autoStartCameraWhenCall,
  pipPosition = 'bottom',
  containerClassName,
  fallbackEmotionLabel,
  externalVoiceEmotionLabel,
  externalVoiceTranscript,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const frameBufferRef = useRef<FrameSample[]>([]);
  const nextFrameIdRef = useRef(0);
  const lastSentFrameIdRef = useRef(-1);
  const captureInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const enabledRef = useRef(false);
  const lastEmotionRef = useRef('');
  const lastVoiceEmotionRef = useRef('');
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const [enabled, setEnabled] = useState(false);
  const [emotion, setEmotion] = useState('未开启');
  const [busy, setBusy] = useState(false);
  const [frameProgress, setFrameProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceEmotion, setVoiceEmotion] = useState('麦克风不可用');
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const endpoint = useMemo(() => {
    const base = APIConfig.getApiUrl().replace(/\/+$/, '');
    return `${base}/api/detect_emotion`;
  }, []);

  const audioEndpoint = useMemo(() => {
    const base = APIConfig.getApiUrl().replace(/\/+$/, '');
    return `${base}/api/detect_audio_emotion`;
  }, []);

  const isUnavailableLabel = (label?: string) => {
    const normalized = String(label || '').trim().toLowerCase();
    if (!normalized) {
      return true;
    }

    return [
      '未开启',
      '未识别',
      '不可用',
      '未分析',
      '分析中',
      '识别失败',
      '录音中',
      '采集中',
      'processing',
      'error',
      'failed',
      'unavailable',
      'off',
    ].some((hint) => normalized.includes(hint.toLowerCase()));
  };

  const displayedEmotion = !isUnavailableLabel(emotion)
    ? emotion
    : (!isUnavailableLabel(fallbackEmotionLabel) ? String(fallbackEmotionLabel).trim() : emotion);
  const displayedVoiceEmotion = String(externalVoiceEmotionLabel || voiceEmotion).trim() || voiceEmotion;
  const displayedVoiceTranscript = String(externalVoiceTranscript || voiceTranscript).trim();

  const stopRecorder = () => {
    try {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {
      // Ignore stop errors from a recorder that has already ended.
    }
  };

  const stopMic = () => {
    stopRecorder();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
  };

  const stopAll = () => {
    enabledRef.current = false;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    frameBufferRef.current = [];
    nextFrameIdRef.current = 0;
    lastSentFrameIdRef.current = -1;
    captureInFlightRef.current = false;
    uploadInFlightRef.current = false;
    setFrameProgress(0);
  };

  const buildEmotionZip = async (frames: Blob[]) => {
    const zip = new JSZip();
    frames.forEach((frame, index) => {
      zip.file(formatFrameName(index), frame);
    });
    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  };

  const processLatestWindow = async () => {
    const bufferedFrames = frameBufferRef.current;
    if (uploadInFlightRef.current || bufferedFrames.length < FRAME_BATCH_SIZE) {
      return;
    }

    const frames = bufferedFrames.slice(-FRAME_BATCH_SIZE);
    const newestFrameId = frames[frames.length - 1]?.id ?? -1;
    if (newestFrameId <= lastSentFrameIdRef.current) {
      return;
    }

    uploadInFlightRef.current = true;
    setBusy(true);
    try {
      lastSentFrameIdRef.current = newestFrameId;

      const zipBlob = await buildEmotionZip(frames.map((frame) => frame.blob));
      const formData = new FormData();
      formData.append('file', zipBlob, `emotion_frames_${Date.now()}.zip`);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as DetectEmotionResponse | null;
      const rawNext = response.ok
        ? (data?.emotion || data?.label || data?.message || '识别失败').trim()
        : (data?.message || `请求失败(${response.status})`).trim();
      const next = localizeEmotionLabel(rawNext);

      if (enabledRef.current) {
        setEmotion(next);
        if (response.ok && data?.available !== false && next && next !== lastEmotionRef.current) {
          lastEmotionRef.current = next;
          onEmotionChange(next);
        }
      }
    } catch {
      if (enabledRef.current) {
        setEmotion('情绪服务不可用');
      }
    } finally {
      uploadInFlightRef.current = false;
      setBusy(false);
      if (enabledRef.current) {
        void processLatestWindow();
      }
    }
  };

  const captureOnce = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !enabledRef.current || video.readyState < 2 || captureInFlightRef.current) {
      return;
    }

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 360;
    if (!sourceWidth || !sourceHeight) {
      return;
    }

    const scale = Math.min(
      1,
      MAX_FRAME_WIDTH / sourceWidth,
      MAX_FRAME_HEIGHT / sourceHeight,
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    captureInFlightRef.current = true;
    try {
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await createImageBlob(canvas);
      if (!blob || !enabledRef.current) {
        return;
      }

      const nextFrameId = nextFrameIdRef.current++;
      frameBufferRef.current.push({ id: nextFrameId, blob });
      if (frameBufferRef.current.length > FRAME_BUFFER_SIZE) {
        frameBufferRef.current.splice(0, frameBufferRef.current.length - FRAME_BUFFER_SIZE);
      }

      setFrameProgress(Math.min(frameBufferRef.current.length, FRAME_BATCH_SIZE));
      if (frameBufferRef.current.length >= FRAME_BATCH_SIZE) {
        void processLatestWindow();
      }
    } finally {
      captureInFlightRef.current = false;
    }
  };

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      stopAll();
      setEmotion('未开启');
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        frameBufferRef.current = [];
        nextFrameIdRef.current = 0;
        lastSentFrameIdRef.current = -1;
        setFrameProgress(0);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        setEmotion('采集中...');
        intervalRef.current = window.setInterval(() => {
          void captureOnce();
        }, FRAME_CAPTURE_INTERVAL_MS);
        void captureOnce();
      } catch {
        setEmotion('摄像头不可用');
        setEnabled(false);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [enabled]);

  useEffect(() => () => {
    stopMic();
  }, []);

  useEffect(() => {
    if (autoStartCameraWhenCall) {
      setEnabled(true);
    }
  }, [autoStartCameraWhenCall]);

  const sendAudio = async (blob: Blob) => {
    setVoiceBusy(true);
    try {
      const formData = new FormData();
      const ext = blob.type.includes('wav') ? 'wav' : 'webm';
      formData.append('audio', blob, `record.${ext}`);

      const response = await fetch(audioEndpoint, { method: 'POST', body: formData });
      const data = (await response.json().catch(() => null)) as DetectAudioEmotionResponse | null;
      const next = response.ok
        ? (data?.voice_emotion || data?.message || '识别失败').trim()
        : (data?.message || `请求失败(${response.status})`).trim();
      setVoiceEmotion(next);
      setVoiceTranscript((data?.transcript || '').trim());
      onVoiceTranscriptChange?.((data?.transcript || '').trim());
      if (response.ok && data?.available !== false && next && next !== lastVoiceEmotionRef.current) {
        lastVoiceEmotionRef.current = next;
        onVoiceEmotionChange?.(next);
      }
    } catch {
      setVoiceEmotion('识别失败');
      setVoiceTranscript('');
      onVoiceTranscriptChange?.('');
    } finally {
      setVoiceBusy(false);
    }
  };

  const startRecording = async () => {
    if (recording || voiceBusy) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];
      const mimeType = mimeCandidates.find(
        (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
      );

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        stopMic();
        if (blob.size < 2000) {
          setVoiceEmotion('录音过短');
          setVoiceTranscript('');
          onVoiceTranscriptChange?.('');
          return;
        }
        setVoiceEmotion('分析中...');
        await sendAudio(blob);
      };

      recorder.start(250);
      setRecording(true);
      setVoiceTranscript('');
      onVoiceTranscriptChange?.('');
      setVoiceEmotion('录音中...');
    } catch {
      setVoiceEmotion('麦克风不可用');
      setVoiceTranscript('');
      onVoiceTranscriptChange?.('');
      stopMic();
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      stopRecorder();
      setRecording(false);
      return;
    }
    await startRecording();
  };

  const positionClass =
    containerClassName ||
    (pipPosition === 'top' ? 'fixed top-24 right-4 z-50 w-48' : 'fixed bottom-24 right-6 z-50 w-56');

  return (
    <div className={positionClass}>
      <div className="rounded-2xl border border-white/60 bg-white/82 p-3 shadow-xl backdrop-blur-md">
        <div className="h-32 w-full overflow-hidden rounded-lg bg-black/10">
          <video ref={videoRef} className="h-32 w-full rounded-lg object-cover" muted playsInline />
        </div>

        <div className="mt-2 text-center text-sm font-bold text-gray-700">当前情绪: {displayedEmotion}</div>
        <div className="mt-1 text-center text-[11px] text-gray-500">
          最近窗口: {Math.min(frameProgress, FRAME_BATCH_SIZE)}/{FRAME_BATCH_SIZE}
        </div>
        <div className="mt-1 text-center text-sm font-bold text-teal-600">语音情绪: {displayedVoiceEmotion}</div>
        {displayedVoiceTranscript ? (
          <div className="mt-1 line-clamp-2 text-center text-[11px] text-gray-500">识别文本: {displayedVoiceTranscript}</div>
        ) : null}

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setEnabled((value) => !value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
              enabled
                ? 'border-rose-400 bg-rose-500 text-white hover:bg-rose-600'
                : 'border-gray-200 bg-white/70 text-gray-700 hover:bg-white'
            }`}
          >
            {enabled ? (busy ? '分析中...' : '关闭摄像头') : '开启摄像头'}
          </button>
        </div>

        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => void toggleRecording()}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors ${
              recording
                ? 'border-teal-500 bg-teal-600 text-white hover:bg-teal-700'
                : 'border-gray-200 bg-white/70 text-gray-700 hover:bg-white'
            }`}
            disabled={voiceBusy}
          >
            {recording ? '停止录音' : voiceBusy ? '分析中...' : '点击录音'}
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};
