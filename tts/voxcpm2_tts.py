# -*- coding: utf-8 -*-
"""VoxCPM2 TTS adapter for SoulLink/Fay."""
import os
import time
import requests

from utils import util


class Speech:
    def __init__(self):
        self.api_url = os.getenv('VOXCPM2_API_URL', 'http://127.0.0.1:18890').rstrip('/')
        self.reference_audio_path = os.getenv(
            'VOXCPM2_REFERENCE_AUDIO_PATH',
            '/mnt/wpkb2/cerate_api/voices/guangtouqiang/reference.wav',
        )
        self.voice_prompt = os.getenv(
            'VOXCPM2_VOICE_PROMPT',
            '光头强的卡通男声音色，语气夸张，清晰自然',
        )
        self.cfg_value = float(os.getenv('VOXCPM2_CFG_VALUE', '2.0'))
        self.inference_timesteps = int(os.getenv('VOXCPM2_INFERENCE_TIMESTEPS', '10'))
        self.timeout = int(os.getenv('VOXCPM2_TIMEOUT', '300'))

    def connect(self):
        pass

    def close(self):
        pass

    def to_sample(self, text, style):
        clean_text = str(text or '').strip()
        if not clean_text:
            return None

        os.makedirs('./samples', exist_ok=True)
        file_url = './samples/sample-' + str(int(time.time() * 1000)) + '.wav'
        payload = {
            'input': clean_text,
            'voice': self.voice_prompt,
            'cfg_value': self.cfg_value,
            'inference_timesteps': self.inference_timesteps,
        }
        if self.reference_audio_path:
            payload['reference_audio_path'] = self.reference_audio_path

        try:
            response = requests.post(
                self.api_url + '/v1/audio/speech',
                json=payload,
                timeout=self.timeout,
            )
            if response.status_code != 200:
                util.log(1, '[x] VoxCPM2 语音转换失败！')
                util.log(1, '[x] HTTP {}: {}'.format(response.status_code, response.text[:500]))
                return None
            content_type = response.headers.get('content-type', '')
            if 'audio' not in content_type and not response.content.startswith(b'RIFF'):
                util.log(1, '[x] VoxCPM2 返回内容不是音频: {}'.format(content_type))
                util.log(1, response.text[:500])
                return None
            with open(file_url, 'wb') as f:
                f.write(response.content)
            return file_url
        except Exception as e:
            util.log(1, '[x] VoxCPM2 语音转换失败！')
            util.log(1, '[x] 原因: {}'.format(str(e)))
            return None
