export function isBrowserStreamingAsrSupported(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const isEmbeddedCapacitorShell =
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && !window.location.port);

  // Android WebView/Capacitor frequently loops or crashes when Web Speech tries
  // to talk to device speech services (for example Xiaomi's mibrain service).
  // Keep this feature browser-only for now.
  if (isEmbeddedCapacitorShell) {
    return false;
  }

  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  );
}

export type BrowserAsrCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onStop?: () => void;
};

export class BrowserStreamingAsrController {
  private recognition: any = null;
  private running = false;

  isRunning(): boolean {
    return this.running;
  }

  start(callbacks: BrowserAsrCallbacks): boolean {
    this.stop();

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      callbacks.onError?.('当前浏览器不支持实时听写');
      return false;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'zh-CN';
    // Keep the recognition session open as long as possible so mobile WebView
    // does not repeatedly tear down and reacquire the microphone permission.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript?.trim() || '';
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interim += text;
        }
      }

      if (interim) {
        callbacks.onInterim(interim);
      }
      if (finalChunk) {
        callbacks.onFinal(finalChunk);
      }
    };

    recognition.onerror = (event: any) => {
      if (event?.error === 'aborted' || event?.error === 'no-speech') {
        return;
      }
      callbacks.onError?.(event?.message || event?.error || '浏览器语音听写失败');
    };

    recognition.onend = () => {
      this.running = false;
      this.recognition = null;
      callbacks.onStop?.();
    };

    try {
      recognition.start();
      this.recognition = recognition;
      this.running = true;
      return true;
    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error.message : '无法启动实时听写');
      return false;
    }
  }

  stop(): void {
    if (!this.recognition) {
      return;
    }

    try {
      this.recognition.stop();
    } catch {
      // ignore stop errors
    }

    this.recognition = null;
    this.running = false;
  }
}
