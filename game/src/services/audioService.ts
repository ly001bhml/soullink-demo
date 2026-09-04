/**
 * 语音录音服务
 * 支持Capacitor和Web环境的语音录制和传输
 */

import { getFayApiUrl } from './apiConfig';

const getFAY_API_URL = (): string => {
  return getFayApiUrl();
};

/**
 * 检测是否是Capacitor环境
 */
export const isCapacitor = (): boolean => {
  return (
    typeof (window as any).Capacitor !== 'undefined' ||
    typeof (window as any).CapacitorWeb !== 'undefined' ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && !window.location.port)
  );
};

/**
 * 音频录制器接口
 */
export interface AudioRecorder {
  start(): Promise<void>;
  stop(): Promise<Blob | null>;
  isRecording(): boolean;
}

/**
 * Web环境音频录制器（使用MediaRecorder API）
 */
class WebAudioRecorder implements AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    try {
      // 请求麦克风权限
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      // 创建MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 16000,
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100); // 每100ms收集一次数据
      console.log('[AudioService] Web录音已开始');
    } catch (error) {
      console.error('[AudioService] 启动录音失败:', error);
      throw new Error(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('[AudioService] Web录音已停止，音频大小:', audioBlob.size, 'bytes');
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  private cleanup(): void {
    // 停止所有音频轨道
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm'; // 默认格式
  }
}

/**
 * Capacitor环境音频录制器（使用Capacitor VoiceRecorder插件或原生API）
 */
class CapacitorAudioRecorder implements AudioRecorder {
  private isRecordingState: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    try {
      // Capacitor环境使用MediaRecorder API
      // 权限会在getUserMedia时自动请求

      // 使用MediaRecorder API
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
        audioBitsPerSecond: 16000,
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(100);
      this.isRecordingState = true;
      console.log('[AudioService] Capacitor录音已开始');
    } catch (error) {
      console.error('[AudioService] Capacitor启动录音失败:', error);
      throw new Error(`启动录音失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecordingState) {
        this.cleanup();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('[AudioService] Capacitor录音已停止，音频大小:', audioBlob.size, 'bytes');
        this.cleanup();
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
      this.isRecordingState = false;
    });
  }

  isRecording(): boolean {
    return this.isRecordingState && (this.mediaRecorder?.state === 'recording');
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecordingState = false;
  }

  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'audio/webm';
  }
}

/**
 * 语音服务类
 */
class AudioService {
  private recorder: AudioRecorder | null = null;

  /**
   * 初始化录音器
   */
  private async initializeRecorder(): Promise<AudioRecorder> {
    if (this.recorder) {
      return this.recorder;
    }

    if (isCapacitor()) {
      this.recorder = new CapacitorAudioRecorder();
    } else {
      this.recorder = new WebAudioRecorder();
    }

    return this.recorder;
  }

  /**
   * 开始录音
   */
  async startRecording(): Promise<void> {
    const recorder = await this.initializeRecorder();
    await recorder.start();
  }

  /**
   * 停止录音并返回音频Blob
   */
  async stopRecording(): Promise<Blob | null> {
    if (!this.recorder) {
      return null;
    }
    return await this.recorder.stop();
  }

  /**
   * 检查是否正在录音
   */
  isRecording(): boolean {
    return this.recorder?.isRecording() || false;
  }

  /**
   * 上传音频文件到服务器并进行ASR识别
   * @param audioBlob 音频Blob数据
   * @param username 用户名
   * @returns Promise<string> 识别后的文本
   */
  async uploadAndRecognize(audioBlob: Blob, username: string = 'User'): Promise<string> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      
      // 创建FormData
      const formData = new FormData();
      formData.append('audio', audioBlob, `audio_${Date.now()}.webm`);
      formData.append('username', username);

      console.log('[AudioService] 上传音频文件，大小:', audioBlob.size, 'bytes');

      const response = await fetch(`${FAY_API_URL}/api/audio/recognize`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`音频识别失败: ${response.status}`);
      }

      const result = await response.json();
      if (result.code === 200 && result.text) {
        console.log('[AudioService] 识别结果:', result.text);
        return result.text;
      } else {
        throw new Error(result.message || '音频识别失败');
      }
    } catch (error) {
      console.error('[AudioService] 上传音频失败:', error);
      throw error;
    }
  }

  /**
   * 流式传输音频数据到服务器（实时ASR）
   * @param onTranscript 识别文本回调
   * @param username 用户名
   * @returns Promise<Function> 返回停止录音的函数
   */
  async startStreamingRecognition(
    onTranscript: (text: string, isFinal: boolean) => void,
    username: string = 'User'
  ): Promise<() => Promise<void>> {
    try {
      const FAY_API_URL = getFAY_API_URL();
      const wsUrl = FAY_API_URL.replace('http://', 'ws://').replace('https://', 'wss://');
      const ws = new WebSocket(`${wsUrl}/ws/audio/${username}`);

      return new Promise((resolve, reject) => {
        ws.onopen = async () => {
          console.log('[AudioService] WebSocket连接已建立，开始流式录音');
          
          // 开始录音
          const recorder = await this.initializeRecorder();
          await recorder.start();

          // 设置定时器定期发送音频数据
          const intervalId = setInterval(async () => {
            if (!recorder.isRecording()) {
              clearInterval(intervalId);
              return;
            }

            // 获取当前录音的音频块（需要MediaRecorder支持）
            // 这里简化处理，使用stop后重新start的方式
          }, 100);

          // 返回停止函数
          resolve(async () => {
            clearInterval(intervalId);
            const audioBlob = await recorder.stop();
            if (audioBlob) {
              // 发送最后的音频数据
              ws.send(audioBlob);
            }
            ws.close();
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.text) {
              onTranscript(data.text, data.isFinal || false);
            }
          } catch (e) {
            console.error('[AudioService] 解析WebSocket消息失败:', e);
          }
        };

        ws.onerror = (error) => {
          console.error('[AudioService] WebSocket错误:', error);
          reject(error);
        };

        ws.onclose = () => {
          console.log('[AudioService] WebSocket连接已关闭');
        };
      });
    } catch (error) {
      console.error('[AudioService] 启动流式识别失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const audioService = new AudioService();

