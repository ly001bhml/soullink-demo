# -*- coding: utf-8 -*-
import audioop
import importlib
import json
import time
import os
import shutil
import subprocess
import pyaudio
import re
import wave
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, Response, send_file, send_from_directory, redirect, url_for, session
from flask_cors import CORS
import requests
import datetime
import pytz
import logging
import uuid

import fay_booter
from tts import tts_voice
from gevent import pywsgi
try:
    # Use gevent.sleep to avoid blocking the gevent loop; fallback to time.sleep if unavailable
    from gevent import sleep as gsleep
except Exception:
    from time import sleep as gsleep
from scheduler.thread_manager import MyThread
from utils import config_util, util
from utils import auth_db
from ai_module import realtime_emotion
from core import wsa_server
from core import fay_core
from core import content_db
from core.interact import Interact
from core import member_db
import fay_booter
from flask_httpauth import HTTPBasicAuth
from core import qa_service
from core import stream_manager
from core.face_landmark_service import face_landmark_service

# 全局变量，用于跟踪当前的genagents服务器
genagents_server = None
genagents_thread = None
monitor_thread = None

__app = Flask(__name__)
# 禁用 Flask 默认日志
__app.logger.disabled = True
log = logging.getLogger('werkzeug')
log.disabled = True
# 禁用请求日志中间件
__app.config['PROPAGATE_EXCEPTIONS'] = True
# 设置最大请求大小限制为150MB（略大于100MB，留出余量）
__app.config['MAX_CONTENT_LENGTH'] = 150 * 1024 * 1024  # 150MB
__app.config['SECRET_KEY'] = os.environ.get('SOULLINK_SECRET_KEY', 'soullink-dev-secret')
__app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
__app.config['SESSION_COOKIE_HTTPONLY'] = True
__app.permanent_session_lifetime = timedelta(days=30)

auth = HTTPBasicAuth()

# CORS 配置：支持通过环境变量配置允许的域名
# 开发环境：允许所有域名（默认行为）
# 生产环境：设置环境变量 ALLOWED_ORIGINS 为逗号分隔的域名列表
# 例如：ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
allowed_origins = os.getenv('ALLOWED_ORIGINS', None)
if allowed_origins:
    # 生产环境：限制特定域名
    origins_list = [origin.strip() for origin in allowed_origins.split(',')]
    CORS(__app, origins=origins_list, supports_credentials=True)
    util.log(1, f'[CORS] 已配置允许的域名: {origins_list}')
else:
    # 开发环境：允许所有域名
    CORS(__app, supports_credentials=True)
    util.log(1, '[CORS] 开发模式：允许所有域名访问')

auth_db.ensure_default_user()

VIDEO_EMOTION_LABELS = {
    'anger',
    'anxiety',
    'contempt',
    'disappointment',
    'disgust',
    'fear',
    'happiness',
    'helplessness',
    'neutral',
    'sadness',
    'surprise',
}


def _get_models_root_dir():
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models'))


def _get_video_emotion_infer_url():
    return os.getenv('SOULLINK_VIDEO_EMOTION_INFER_URL', 'http://127.0.0.1:7861/infer').strip()


def _normalize_emotion_state_text(raw_state):
    if raw_state is None:
        return ''

    if isinstance(raw_state, dict):
        parts = []
        for key, value in raw_state.items():
            if value is None:
                continue
            parts.append(f'{key}={value}')
        if not parts:
            return ''
        return f"emotion_state: {'; '.join(parts)}"

    text = str(raw_state).strip()
    if not text:
        return ''
    if text.startswith('emotion_state:'):
        return text
    return f'emotion_state: {text}'


def _normalize_voice_emotion_hint(raw_hint):
    if raw_hint is None:
        return None

    if isinstance(raw_hint, str):
        text = raw_hint.strip()
        if not text:
            return None
        normalized = {'valence': text if text in ('negative', 'neutral', 'positive') else 'neutral'}
        normalized['source'] = 'frontend'
        return normalized

    if not isinstance(raw_hint, dict):
        return None

    valence = str(raw_hint.get('valence', 'neutral')).lower()
    if valence not in ('negative', 'neutral', 'positive'):
        valence = 'neutral'

    normalized = {'valence': valence}

    arousal = str(raw_hint.get('arousal', '')).lower()
    if arousal in ('low', 'medium', 'high'):
        normalized['arousal'] = arousal

    source = str(raw_hint.get('source', 'frontend')).strip()
    normalized['source'] = source or 'frontend'
    return normalized


def _normalize_workshop_state_text(raw_state):
    if raw_state is None:
        return ''

    if isinstance(raw_state, dict):
        parts = []
        for key, value in raw_state.items():
            if value is None:
                continue
            parts.append(f'{key}={value}')
        if not parts:
            return ''
        return f"workshop_state: {'; '.join(parts)}"

    text = str(raw_state).strip()
    if not text:
        return ''
    if text.startswith('workshop_state:'):
        return text
    return f'workshop_state: {text}'


def _normalize_childlike_tone_text(raw_text):
    """
    将模型返回的幼态措辞统一为中性表达，避免前端出现“小朋友腔”。
    """
    text = str(raw_text or '').strip()
    if not text:
        return text

    pattern = re.compile(r'(小朋友|宝宝|宝贝|乖乖|胡萝卜|没关系[啦呀]?|不急[哦呀哈的]?|慢慢来|慢慢分享|喘口气|轻轻接住情绪|[呀哦啦吧呢][～~])')
    if not pattern.search(text):
        return text

    text = re.sub(r'小朋友你好[呀啊吗呢]?[～~]?', '你好', text)
    text = re.sub(r'小朋友|宝宝|宝贝|乖乖', '你', text)
    text = re.sub(r'胡萝卜', '建议', text)
    text = re.sub(r'没关系[啦呀]?', '没关系', text)
    text = re.sub(r'不急[哦呀哈的]?', '不用着急', text)
    text = re.sub(r'慢慢来[哦呀]?', '我们一步步来', text)
    text = re.sub(r'慢慢分享[呀吧]?', '按你的节奏说', text)
    text = re.sub(r'喘口气', '先缓一缓', text)
    text = re.sub(r'轻轻接住情绪', '先理解你的感受', text)
    text = re.sub(r'[～~]+', '', text)
    return text.strip()


def _get_uploaded_audio_extension(audio_file):
    filename = str(getattr(audio_file, 'filename', '') or '').strip().lower()
    ext = os.path.splitext(filename)[1].lower()
    if ext in {'.wav', '.webm', '.ogg', '.mp3', '.m4a', '.aac'}:
        return ext

    mimetype = str(getattr(audio_file, 'mimetype', '') or '').lower()
    if 'wav' in mimetype:
        return '.wav'
    if 'ogg' in mimetype:
        return '.ogg'
    if 'mp3' in mimetype or 'mpeg' in mimetype:
        return '.mp3'
    if 'm4a' in mimetype or 'mp4' in mimetype or 'aac' in mimetype:
        return '.m4a'
    return '.webm'


def _cleanup_audio_temp_files(*paths):
    for path in paths:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception as exc:
            util.log(1, f"[AudioTemp] cleanup failed: {exc}")


def _prepare_uploaded_audio(audio_file, username='User'):
    temp_dir = os.path.join(os.getcwd(), 'temp_audio')
    os.makedirs(temp_dir, exist_ok=True)

    ts = int(time.time() * 1000)
    safe_username = re.sub(r'[^A-Za-z0-9_-]+', '_', str(username or 'User')).strip('_') or 'User'
    source_ext = _get_uploaded_audio_extension(audio_file)
    base_name = f'audio_{safe_username}_{ts}'
    source_path = os.path.join(temp_dir, base_name + source_ext)
    wav_path = os.path.join(temp_dir, base_name + '.wav')

    audio_file.save(source_path)
    util.log(
        1,
        f"[AudioRecognize] received {os.path.basename(source_path)}, user={safe_username}, "
        f"size={os.path.getsize(source_path)} bytes",
    )

    ffmpeg_cmd = [
        'ffmpeg',
        '-y',
        '-i', source_path,
        '-ac', '1',
        '-ar', '16000',
        '-f', 'wav',
        wav_path,
    ]
    subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return source_path, wav_path


def _recognize_wav_with_config(wav_path, username='User'):
    from utils import config_util as cfg
    from asr.ali_nls import ALiNls
    from asr.funasr import FunASR

    asr_mode = cfg.ASR_mode

    def recognize_with_ali():
        asr = ALiNls(username)
        asr.start()
        start_ts = time.time()
        while not asr.started and time.time() - start_ts < 5:
            time.sleep(0.01)

        with wave.open(wav_path, 'rb') as wf:
            frame_samples = 320
            while True:
                frames = wf.readframes(frame_samples)
                if not frames:
                    break
                asr.send(frames)

        asr.end()
        wait_start = time.time()
        while not asr.done and time.time() - wait_start < 10:
            time.sleep(0.05)
        return asr.finalResults or ''

    def recognize_with_funasr():
        asr = FunASR(username)
        asr.start()
        asr.send_url(wav_path)
        wait_start = time.time()
        while not asr.done and time.time() - wait_start < 10:
            time.sleep(0.05)
        return asr.finalResults or ''

    if asr_mode == 'ali':
        return recognize_with_ali()
    if asr_mode in ('funasr', 'sensevoice'):
        return recognize_with_funasr()

    util.log(1, f"[AudioRecognize] unsupported ASR_mode: {asr_mode}")
    return ''


def _analyze_wav_signal(wav_path):
    try:
        with wave.open(wav_path, 'rb') as wav_file:
            frames = wav_file.readframes(wav_file.getnframes())
            sample_width = wav_file.getsampwidth() or 2
            frame_rate = wav_file.getframerate() or 16000
            frame_count = wav_file.getnframes() or 0

        duration_sec = (frame_count / frame_rate) if frame_rate > 0 else 0.0
        if not frames:
            return {
                'duration_sec': round(duration_sec, 3),
                'energy': 0.0,
                'peak': 0.0,
            }

        rms = audioop.rms(frames, sample_width)
        peak = audioop.max(frames, sample_width)
        max_pcm = float((1 << (sample_width * 8 - 1)) - 1) if sample_width > 0 else 32767.0
        return {
            'duration_sec': round(duration_sec, 3),
            'energy': round(max(0.0, min(1.0, float(rms) / 5000.0)), 4),
            'peak': round(max(0.0, min(1.0, float(peak) / max_pcm)), 4),
        }
    except Exception as exc:
        util.log(1, f"[AudioSignal] analyze failed: {exc}")
        return {
            'duration_sec': 0.0,
            'energy': 0.0,
            'peak': 0.0,
        }


@__app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'soullink-fay-backend'
    }), 200


def _get_faymcp_static_dir():
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'faymcp', 'static'))


def _build_mcp_proxy_url(path=''):
    normalized_path = (path or '').lstrip('/')
    base_url = 'http://127.0.0.1:5010'
    return f'{base_url}/{normalized_path}' if normalized_path else base_url


def _proxy_mcp_request(path='', rewrite_html=False):
    target_url = _build_mcp_proxy_url(path)
    try:
        upstream = requests.request(
            method=request.method,
            url=target_url,
            params=request.args,
            data=request.get_data(),
            headers={
                key: value
                for key, value in request.headers.items()
                if key.lower() not in ('host', 'content-length')
            },
            cookies=request.cookies,
            allow_redirects=False,
            timeout=30
        )
    except requests.exceptions.RequestException as e:
        util.log(1, f'[MCP代理] 请求失败: {target_url}, error={e}')
        return jsonify({
            'code': 502,
            'message': 'MCP 服务暂时不可用，请确认 5010 服务已启动'
        }), 502

    body = upstream.content
    content_type = upstream.headers.get('Content-Type', '')
    if rewrite_html and 'text/html' in content_type:
        try:
            html = upstream.content.decode(upstream.encoding or 'utf-8')
        except UnicodeDecodeError:
            html = upstream.content.decode('utf-8', errors='replace')
        html = html.replace('"/static/', '"/mcp/static/')
        html = html.replace("'/static/", "'/mcp/static/")
        html = html.replace('href="/Page3"', 'href="/mcp"')
        body = html.encode('utf-8')

    response_headers = [
        (key, value)
        for key, value in upstream.headers.items()
        if key.lower() not in ('content-encoding', 'content-length', 'transfer-encoding', 'connection')
    ]
    return Response(body, status=upstream.status_code, headers=response_headers)


_MODEL_NAME_ALIASES = {
    '孔子': 'confucius',
    '老子': 'laozi',
    '孟子': 'mencius',
    '光头强': 'guangtouqiang',
    '拉布布': 'labubu',
    '奥特曼': 'ultraman',
}

_ANCIENT_CHARACTER_KEYS = {
    '孔子',
    '老子',
    '孟子',
    'confucius',
    'laozi',
    'mencius',
}


def _sanitize_model_segment(value):
    raw = str(value or '').strip()
    cleaned = re.sub(r'[^A-Za-z0-9._-]+', '_', raw).strip('._')
    return cleaned or None


def _slugify_model_name(name):
    raw = str(name or '').strip()
    if not raw:
        return 'model'
    if raw in _MODEL_NAME_ALIASES:
        return _MODEL_NAME_ALIASES[raw]
    ascii_only = raw.encode('ascii', 'ignore').decode('ascii')
    ascii_only = re.sub(r'[^A-Za-z0-9]+', '_', ascii_only).strip('_').lower()
    return ascii_only or 'model'


def _build_model_dir_name(model_id, model_name=None):
    model_segment = _sanitize_model_segment(model_id)
    if not model_segment:
        raise ValueError('无效的 model_id')
    alias = _sanitize_model_segment(_slugify_model_name(model_name)) or 'model'
    return f"{alias}__{model_segment}"


def _get_default_animation_folder(model_name):
    raw_name = str(model_name or '').strip()
    slug_name = _slugify_model_name(raw_name)
    if raw_name in _ANCIENT_CHARACTER_KEYS or slug_name in _ANCIENT_CHARACTER_KEYS:
        return 'oldman'
    return 'feshman'


def _find_existing_model_dir(model_id):
    model_segment = _sanitize_model_segment(model_id)
    if not model_segment:
        return None
    models_root = _get_models_root_dir()
    if not os.path.isdir(models_root):
        return None
    direct_path = os.path.join(models_root, model_segment)
    if os.path.isdir(direct_path):
        return model_segment
    suffix = f"__{model_segment}"
    for entry in os.listdir(models_root):
        entry_path = os.path.join(models_root, entry)
        if os.path.isdir(entry_path) and entry.endswith(suffix):
            return entry
    return None


def _normalize_model_url(url):
    if not url:
        return None
    normalized = str(url).strip()
    if normalized.startswith('http://') or normalized.startswith('https://'):
        parts = normalized.split('/')[3:]
        normalized = '/' + '/'.join(parts)
    return normalized


def _model_url_to_relative_path(url):
    normalized = _normalize_model_url(url)
    if not normalized:
        return None
    if normalized.startswith('/models/'):
        relative_path = normalized[len('/models/'):]
    elif normalized.startswith('models/'):
        relative_path = normalized[len('models/'):]
    else:
        return None
    relative_path = relative_path.replace('\\', '/').strip('/')
    if not relative_path or '..' in relative_path.split('/'):
        return None
    return relative_path


def _relative_path_to_model_url(relative_path):
    normalized = str(relative_path or '').replace('\\', '/').strip('/')
    if not normalized:
        return None
    return f"/models/{normalized}"


def _ensure_model_dir(model_id, model_name=None):
    desired_dir_name = _build_model_dir_name(model_id, model_name)
    models_root = _get_models_root_dir()
    os.makedirs(models_root, exist_ok=True)

    existing_dir_name = _find_existing_model_dir(model_id)
    if existing_dir_name and existing_dir_name != desired_dir_name:
        src_dir = os.path.join(models_root, existing_dir_name)
        dst_dir = os.path.join(models_root, desired_dir_name)
        if not os.path.exists(dst_dir):
            try:
                os.rename(src_dir, dst_dir)
                existing_dir_name = desired_dir_name
            except Exception:
                pass

    final_dir_name = existing_dir_name or desired_dir_name
    model_dir = os.path.join(models_root, final_dir_name)
    os.makedirs(model_dir, exist_ok=True)
    return final_dir_name, model_dir


def _delete_slot_variants(model_dir, slot_name):
    slot_base = _sanitize_model_segment(slot_name) or 'asset'
    for entry in os.listdir(model_dir):
        entry_path = os.path.join(model_dir, entry)
        if not os.path.isfile(entry_path):
            continue
        name_without_ext, _ = os.path.splitext(entry)
        if name_without_ext == slot_base:
            try:
                os.remove(entry_path)
            except Exception:
                pass


def _store_upload_file(file_storage, model_id=None, slot=None, model_name=None):
    file_ext = os.path.splitext(file_storage.filename)[1].lower()
    if model_id:
        model_segment, model_dir = _ensure_model_dir(model_id, model_name)
        slot_base = _sanitize_model_segment(slot) or 'asset'
        _delete_slot_variants(model_dir, slot_base)
        filename = f"{slot_base}{file_ext}"
        file_path = os.path.join(model_dir, filename)
        file_storage.save(file_path)
        return _relative_path_to_model_url(f"{model_segment}/{filename}"), file_path, filename

    tmp_dir = os.path.join(_get_models_root_dir(), 'tmp')
    os.makedirs(tmp_dir, exist_ok=True)
    timestamp = int(time.time() * 1000)
    random_str = str(uuid.uuid4())[:8]
    filename = f"model_{timestamp}_{random_str}{file_ext}"
    file_path = os.path.join(tmp_dir, filename)
    file_storage.save(file_path)
    return _relative_path_to_model_url(f"tmp/{filename}"), file_path, filename


def _move_model_asset_to_model_dir(model_id, asset_url, slot_name, model_name=None):
    relative_path = _model_url_to_relative_path(asset_url)
    if not relative_path:
        return asset_url

    src_path = os.path.join(_get_models_root_dir(), relative_path.replace('/', os.sep))
    if not os.path.exists(src_path):
        return asset_url

    model_segment, model_dir = _ensure_model_dir(model_id, model_name)
    file_ext = os.path.splitext(src_path)[1].lower() or '.glb'
    slot_base = _sanitize_model_segment(slot_name) or 'asset'
    dst_filename = f"{slot_base}{file_ext}"
    dst_path = os.path.join(model_dir, dst_filename)

    if os.path.normcase(os.path.abspath(src_path)) == os.path.normcase(os.path.abspath(dst_path)):
        return _relative_path_to_model_url(f"{model_segment}/{dst_filename}")

    _delete_slot_variants(model_dir, slot_base)
    os.makedirs(model_dir, exist_ok=True)
    shutil.move(src_path, dst_path)

    src_parent = os.path.dirname(src_path)
    if os.path.basename(src_parent).lower() == 'tmp':
        try:
            if not os.listdir(src_parent):
                os.rmdir(src_parent)
        except Exception:
            pass

    return _relative_path_to_model_url(f"{model_segment}/{dst_filename}")


def _delete_generated_action_variants(model_dir):
    for entry in os.listdir(model_dir):
        entry_path = os.path.join(model_dir, entry)
        if not os.path.isfile(entry_path):
            continue
        name_without_ext, _ = os.path.splitext(entry)
        match = re.fullmatch(r'action(\d+)', name_without_ext)
        if not match:
            continue
        if int(match.group(1)) < 4:
            continue
        try:
            os.remove(entry_path)
        except Exception:
            pass


def _get_generated_action_urls(model_id, model_name=None):
    try:
        model_segment = _find_existing_model_dir(model_id) or _build_model_dir_name(model_id, model_name)
    except Exception:
        return []

    model_dir = os.path.join(_get_models_root_dir(), model_segment)
    if not os.path.isdir(model_dir):
        return []

    action_urls = []
    for entry in os.listdir(model_dir):
        entry_path = os.path.join(model_dir, entry)
        if not os.path.isfile(entry_path):
            continue
        name_without_ext, ext = os.path.splitext(entry)
        if ext.lower() not in {'.glb', '.gltf', '.fbx'}:
            continue
        match = re.fullmatch(r'action(\d+)', name_without_ext)
        if not match:
            continue
        action_index = int(match.group(1))
        if action_index < 4:
            continue
        action_urls.append((action_index, _relative_path_to_model_url(f"{model_segment}/{entry}")))

    return [url for _, url in sorted(action_urls, key=lambda item: item[0])]


def _append_generated_action_fields(model_dict):
    if not isinstance(model_dict, dict):
        return model_dict

    extra_action_model_urls = _get_generated_action_urls(
        model_dict.get('model_id'),
        model_dict.get('name'),
    )
    model_dict['extra_action_model_urls'] = extra_action_model_urls

    action_model_urls = [
        model_dict.get('idle_model_url'),
        model_dict.get('talking_model_url'),
        model_dict.get('wave_model_url'),
        *extra_action_model_urls,
    ]
    model_dict['action_model_urls'] = [url for url in action_model_urls if url]
    return model_dict


def _extract_model_dir_segments(urls):
    segments = set()
    for url in urls:
        relative_path = _model_url_to_relative_path(url)
        if not relative_path or '/' not in relative_path:
            continue
        first_segment = relative_path.split('/', 1)[0]
        if first_segment and first_segment.lower() != 'tmp':
            segments.add(first_segment)
    return segments

def _login_required():
    if config_util.start_mode == 'common':
        return False
    # 开发模式（未配置 ALLOWED_ORIGINS）默认不强制登录，保持本机/局域网可用
    if not os.getenv('ALLOWED_ORIGINS'):
        return False
    return auth_db.has_users()

def _is_authenticated():
    return session.get('user') is not None

@__app.before_request
def _enforce_login():
    if not _login_required():
        return None
    if request.method == 'OPTIONS':
        return None
    path = request.path
    if path.startswith('/static/') or path in ('/login', '/logout', '/favicon.ico'):
        return None
    if _is_authenticated():
        return None
    if path.startswith('/api/'):
        return jsonify({'code': 401, 'message': 'unauthorized'}), 401
    return redirect(url_for('login', next=request.full_path))

@auth.verify_password
def verify_password(username, password):
    if not auth_db.has_users() or config_util.start_mode == 'common':
        return True
    if auth_db.verify_user(username, password):
        return username


def __get_template():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"Error rendering template: {e}", 500

@__app.route('/login', methods=['get', 'post'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        remember = request.form.get('remember') == 'on'
        if not _login_required():
            session['user'] = username or 'user'
            session.permanent = remember
            next_url = request.args.get('next') or '/'
            return redirect(next_url)
        if auth_db.verify_user(username, password):
            session['user'] = username
            session.permanent = remember
            next_url = request.args.get('next') or '/'
            return redirect(next_url)
        error = '账号或密码错误'
    return render_template('login.html', error=error)

@__app.route('/logout', methods=['get'])
def logout():
    session.clear()
    return redirect(url_for('login'))

def __get_device_list():
    try:
        if config_util.start_mode == 'common':
            audio = pyaudio.PyAudio()
            device_list = []
            for i in range(audio.get_device_count()):
                devInfo = audio.get_device_info_by_index(i)
                if devInfo['hostApi'] == 0:
                    device_list.append(devInfo["name"])
            return list(set(device_list))
        else:
            return []
    except Exception as e:
        print(f"Error getting device list: {e}")
        return []

@__app.route('/api/submit', methods=['post'])
def api_submit():
    data = request.values.get('data')
    if not data:
        return jsonify({'result': 'error', 'message': '未提供数据'})
    try:
        config_data = json.loads(data)
        if 'config' not in config_data:
            return jsonify({'result': 'error', 'message': '数据中缺少config'})

        config_util.load_config()
        existing_config = config_util.config

        def merge_configs(existing, new):
            for key, value in new.items():
                if isinstance(value, dict) and key in existing:
                    if isinstance(existing[key], dict):
                        merge_configs(existing[key], value)
                    else:
                        existing[key] = value
                else:
                    existing[key] = value

        merge_configs(existing_config, config_data['config'])

        config_util.save_config(existing_config)
        config_util.load_config()

        return jsonify({'result': 'successful'})
    except json.JSONDecodeError:
        return jsonify({'result': 'error', 'message': '无效的JSON数据'})
    except Exception as e:
        return jsonify({'result': 'error', 'message': f'保存配置时出错: {e}'}), 500
    



@__app.route('/api/get-data', methods=['post'])
def api_get_data():
    # 获取配置和语音列表
    try:
        config_util.load_config()
        voice_list = tts_voice.get_voice_list()
        send_voice_list = []
        if config_util.tts_module == 'ali':
            voice_list = [
                {"id": "abin", "name": "阿斌"},
                {"id": "zhixiaobai", "name": "知小白"},
                {"id": "zhixiaoxia", "name": "知小夏"},
                {"id": "zhixiaomei", "name": "知小妹"},
                {"id": "zhigui", "name": "知柜"},
                {"id": "zhishuo", "name": "知硕"},
                {"id": "aixia", "name": "艾夏"},
                {"id": "zhifeng_emo", "name": "知锋_多情感"},
                {"id": "zhibing_emo", "name": "知冰_多情感"},
                {"id": "zhimiao_emo", "name": "知妙_多情感"},
                {"id": "zhimi_emo", "name": "知米_多情感"},
                {"id": "zhiyan_emo", "name": "知燕_多情感"},
                {"id": "zhibei_emo", "name": "知贝_多情感"},
                {"id": "zhitian_emo", "name": "知甜_多情感"},
                {"id": "xiaoyun", "name": "小云"},
                {"id": "xiaogang", "name": "小刚"},
                {"id": "ruoxi", "name": "若兮"},
                {"id": "siqi", "name": "思琪"},
                {"id": "sijia", "name": "思佳"},
                {"id": "sicheng", "name": "思诚"},
                {"id": "aiqi", "name": "艾琪"},
                {"id": "aijia", "name": "艾佳"},
                {"id": "aicheng", "name": "艾诚"},
                {"id": "aida", "name": "艾达"},
                {"id": "ninger", "name": "宁儿"},
                {"id": "ruilin", "name": "瑞琳"},
                {"id": "siyue", "name": "思悦"},
                {"id": "aiya", "name": "艾雅"},
                {"id": "aimei", "name": "艾美"},
                {"id": "aiyu", "name": "艾雨"},
                {"id": "aiyue", "name": "艾悦"},
                {"id": "aijing", "name": "艾婧"},
                {"id": "xiaomei", "name": "小美"},
                {"id": "aina", "name": "艾娜"},
                {"id": "yina", "name": "伊娜"},
                {"id": "sijing", "name": "思婧"},
                {"id": "sitong", "name": "思彤"},
                {"id": "xiaobei", "name": "小北"},
                {"id": "aitong", "name": "艾彤"},
                {"id": "aiwei", "name": "艾薇"},
                {"id": "aibao", "name": "艾宝"},
                {"id": "shanshan", "name": "姗姗"},
                {"id": "chuangirl", "name": "小玥"},
                {"id": "lydia", "name": "Lydia"},
                {"id": "aishuo", "name": "艾硕"},
                {"id": "qingqing", "name": "青青"},
                {"id": "cuijie", "name": "翠姐"},
                {"id": "xiaoze", "name": "小泽"},
                {"id": "zhimao", "name": "知猫"},
                {"id": "zhiyuan", "name": "知媛"},
                {"id": "zhiya", "name": "知雅"},
                {"id": "zhiyue", "name": "知悦"},
                {"id": "zhida", "name": "知达"},
                {"id": "zhistella", "name": "知莎"},
                {"id": "kelly", "name": "Kelly"},
                {"id": "jiajia", "name": "佳佳"},
                {"id": "taozi", "name": "桃子"},
                {"id": "guijie", "name": "柜姐"},
                {"id": "stella", "name": "Stella"},
                {"id": "stanley", "name": "Stanley"},
                {"id": "kenny", "name": "Kenny"},
                {"id": "rosa", "name": "Rosa"},
                {"id": "mashu", "name": "马树"},
                {"id": "xiaoxian", "name": "小仙"},
                {"id": "yuer", "name": "悦儿"},
                {"id": "maoxiaomei", "name": "猫小美"},
                {"id": "aifei", "name": "艾飞"},
                {"id": "yaqun", "name": "亚群"},
                {"id": "qiaowei", "name": "巧薇"},
                {"id": "dahu", "name": "大虎"},
                {"id": "ailun", "name": "艾伦"},
                {"id": "jielidou", "name": "杰力豆"},
                {"id": "laotie", "name": "老铁"},
                {"id": "laomei", "name": "老妹"},
                {"id": "aikan", "name": "艾侃"}
            ]
            send_voice_list = {"voiceList": voice_list}
            wsa_server.get_web_instance().add_cmd(send_voice_list)
        elif config_util.tts_module == 'volcano':
            voice_list = [
                {"id": "BV001_streaming", "name": "通用女声"},
                {"id": "BV002_streaming", "name": "通用男声"},
                {"id": "zh_male_jingqiangkanye_moon_bigtts", "name": "京腔侃爷/Harmony"},
                {"id": "zh_female_shuangkuaisisi_moon_bigtts", "name": "爽快思思/Skye"},
                {"id": "zh_male_wennuanahu_moon_bigtts", "name": "温暖阿虎/Alvin"},
                {"id": "zh_female_wanwanxiaohe_moon_bigtts", "name": "湾湾小何"}
            ]
            send_voice_list = {"voiceList": voice_list}
            wsa_server.get_web_instance().add_cmd(send_voice_list)

        else:
            voice_list = tts_voice.get_voice_list()
            send_voice_list = []
            for voice in voice_list:
                voice_data = voice.value
                send_voice_list.append({"id": voice_data['name'], "name": voice_data['name']})
            wsa_server.get_web_instance().add_cmd({"voiceList": send_voice_list})
            voice_list = send_voice_list
        wsa_server.get_web_instance().add_cmd({"deviceList": __get_device_list()})
        if fay_booter.is_running():
            wsa_server.get_web_instance().add_cmd({"liveState": 1})
        return json.dumps({'config': config_util.config, 'voice_list': voice_list})
    except Exception as e:
        return jsonify({'result': 'error', 'message': f'获取数据时出错: {e}'}), 500


@__app.route('/api/emotion-report', methods=['POST'])
def api_emotion_report():
    """
    情绪报告汇总
    请求参数:
      - username: 用户名（可选，默认 User）
      - days: 统计天数（可选，默认 7）
      - model_id: 模型ID（可选）
    """
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'User').strip() or 'User'
        days = data.get('days', 7)
        model_id = data.get('model_id')

        try:
            days = int(days)
        except Exception:
            days = 7

        from core import content_db
        summary = content_db.new_instance().get_emotion_summary(
            username=username,
            days=days,
            model_id=model_id
        )
        return jsonify({'code': 200, 'message': 'ok', 'data': summary}), 200
    except Exception as e:
        util.log(1, f"[情绪报告] 生成失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'情绪报告生成失败: {str(e)}'}), 500

@__app.route('/api/save-game-training', methods=['POST'])
def api_save_game_training():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'User').strip() or 'User'
        game_type = (data.get('game_type') or '').strip()
        if not game_type:
            return jsonify({'code': 400, 'message': 'game_type is required'}), 400

        score = data.get('score', 0)
        time_spent = data.get('time_spent', 0)
        level = data.get('level')

        from core import content_db
        record_id = content_db.new_instance().add_game_training(
            username=username,
            game_type=game_type,
            score=score,
            time_spent=time_spent,
            level=level,
        )
        return jsonify({'code': 200, 'message': 'ok', 'data': {'id': record_id}}), 200
    except Exception as e:
        util.log(1, f"[小游戏训练] 保存失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'小游戏训练保存失败: {str(e)}'}), 500

@__app.route('/api/training-report', methods=['POST'])
def api_training_report():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'User').strip() or 'User'
        days = data.get('days', 7)
        try:
            days = int(days)
        except Exception:
            days = 7

        from core import content_db
        summary = content_db.new_instance().get_training_summary(username=username, days=days)
        return jsonify({'code': 200, 'message': 'ok', 'data': summary}), 200
    except Exception as e:
        util.log(1, f"[训练报告] 生成失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'训练报告生成失败: {str(e)}'}), 500

@__app.route('/api/user-rewards', methods=['POST'])
def api_user_rewards():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'User').strip() or 'User'
        from core import content_db
        rewards = content_db.new_instance().get_user_rewards(username=username)
        return jsonify({'code': 200, 'message': 'ok', 'data': rewards}), 200
    except Exception as e:
        util.log(1, f"[奖励信息] 获取失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'奖励信息获取失败: {str(e)}'}), 500

@__app.route('/api/user-badges', methods=['POST'])
def api_user_badges():
    try:
        data = request.get_json(silent=True) or {}
        username = (data.get('username') or 'User').strip() or 'User'
        from core import content_db
        badges = content_db.new_instance().get_user_badges(username=username)
        return jsonify({'code': 200, 'message': 'ok', 'data': badges}), 200
    except Exception as e:
        util.log(1, f"[徽章信息] 获取失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'徽章信息获取失败: {str(e)}'}), 500

def ensure_fay_service_running(timeout=10):
    """
    确保Fay数字人服务正在运行
    如果服务未运行，则自动启动并等待服务就绪
    
    参数:
        timeout: 等待服务启动的超时时间（秒），默认10秒
        
    返回:
        tuple: (是否成功, 消息, 详细信息)
        - (True, "服务已运行", {}): 服务已在运行
        - (True, "服务启动成功", {"startup_time": 3}): 服务启动成功
        - (False, "服务启动超时", {"timeout": timeout}): 启动超时
        - (False, "启动失败: {错误信息}", {"error": str(e)}): 启动失败
    """
    try:
        # 检查服务是否已在运行
        if fay_booter.is_running():
            util.log(1, "[自动启动] 服务已在运行")
            return True, "服务已运行", {"status": "already_running"}
        
        util.log(1, "[自动启动] 服务未运行，开始自动启动...")
        
        # 记录启动开始时间
        start_time = time.time()
        
        # 启动服务
        try:
            fay_booter.start()
            util.log(1, "[自动启动] 服务启动命令已发送，等待服务就绪...")
        except Exception as e:
            util.log(1, f"[自动启动] 启动命令失败: {e}")
            import traceback
            util.log(1, f"[自动启动] 错误详情: {traceback.format_exc()}")
            return False, f"启动失败: {str(e)}", {"error": str(e), "stage": "start_command"}
        
        # 等待服务就绪（最多等待timeout秒）
        for i in range(timeout):
            gsleep(1)  # 等待1秒
            if fay_booter.is_running():
                elapsed_time = int(time.time() - start_time)
                util.log(1, f"[自动启动] 服务启动成功（耗时 {elapsed_time} 秒）")
                # 通知前端服务状态
                try:
                    wsa_server.get_web_instance().add_cmd({"liveState": 1})
                except:
                    pass
                return True, "服务启动成功", {"startup_time": elapsed_time, "status": "started"}
            
            if i < timeout - 1:  # 不是最后一次循环
                util.log(1, f"[自动启动] 等待服务就绪... ({i+1}/{timeout})")
        
        # 超时
        elapsed_time = int(time.time() - start_time)
        util.log(1, f"[自动启动] 服务启动超时（等待了 {timeout} 秒）")
        return False, f"服务启动超时（已等待 {timeout} 秒），请稍后重试", {"timeout": timeout, "elapsed_time": elapsed_time, "stage": "timeout"}
        
    except Exception as e:
        util.log(1, f"[自动启动] 确保服务运行过程中出错: {e}")
        import traceback
        util.log(1, f"[自动启动] 错误详情: {traceback.format_exc()}")
        return False, f"启动失败: {str(e)}", {"error": str(e), "stage": "exception"}


@__app.route('/api/start-live', methods=['post'])
def api_start_live():
    # 启动
    try:
        success, message, details = ensure_fay_service_running()
        if success:
            return jsonify({
                'result': 'successful',
                'message': message,
                'details': details
            })
        else:
            return jsonify({
                'result': 'error', 
                'message': message,
                'details': details
            }), 500
    except Exception as e:
        return jsonify({'result': 'error', 'message': f'启动时出错: {e}'}), 500

@__app.route('/api/stop-live', methods=['post'])
def api_stop_live():
    # 停止
    try:
        fay_booter.stop()
        gsleep(1)
        wsa_server.get_web_instance().add_cmd({"liveState": 0})
        return '{"result":"successful"}'
    except Exception as e:
        return jsonify({'result': 'error', 'message': f'停止时出错: {e}'}), 500

@__app.route('/api/send', methods=['post'])
def api_send():
    # 接收前端发送的消息
    data = request.values.get('data')
    if not data:
        return jsonify({'result': 'error', 'message': '未提供数据'})
    try:
        info = json.loads(data)
        username = info.get('username')
        msg = info.get('msg')
        pure_mode = info.get('pure_mode', False)  # 获取纯模型模式参数
        if not username or not msg:
            return jsonify({'result': 'error', 'message': '用户名和消息内容不能为空'})
        msg = msg.strip()
        
        # 如果不在纯模式，确保数字人服务正在运行
        if not pure_mode:
            if not fay_booter.is_running():
                util.log(1, "[对话API] 服务未运行，自动启动...")
                start_success, start_message, start_details = ensure_fay_service_running(timeout=10)
                if not start_success:
                    return jsonify({
                        'result': 'error', 
                        'message': f'数字人服务启动失败: {start_message}，请稍后重试',
                        'details': start_details,
                        'suggestion': '请尝试手动启动服务，或稍后重试'
                    }), 500
                util.log(1, f"[对话API] 服务启动成功: {start_message}，继续处理消息")
      
        interact = Interact("text", 1, {'user': username, 'msg': msg, 'pure_mode': pure_mode})
        util.printInfo(1, username, '[文字发送按钮]{}'.format(interact.data["msg"]), time.time())
        fay_booter.feiFei.on_interact(interact)
        return '{"result":"successful"}'
    except json.JSONDecodeError:
        return jsonify({'result': 'error', 'message': '无效的JSON数据'})
    except Exception as e:
        return jsonify({'result': 'error', 'message': f'发送消息时出错: {e}'}), 500

# 获取指定用户的消息记录
@__app.route('/api/get-msg', methods=['post'])
def api_get_Msg():
    try:
        data = request.form.get('data')
        if data is None:
            data = request.get_json()
        else:
            data = json.loads(data)
        username = data.get("username", "User")
        model_id = data.get("model_id")  # 支持按模型ID筛选
        
        uid = member_db.new_instance().find_user(username)
        contentdb = content_db.new_instance()
        if uid == 0:
            return json.dumps({'list': []})
        else:
            # 如果提供了model_id，按模型筛选；否则获取所有消息
            list = contentdb.get_list('all', 'desc', 1000, uid, model_id)
        
        relist = []
        i = len(list) - 1
        while i >= 0:
            timezone = pytz.timezone('Asia/Shanghai')
            timetext = datetime.datetime.fromtimestamp(list[i][3], timezone).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
            relist.append(dict(type=list[i][0], way=list[i][1], content=list[i][2], createtime=list[i][3], timetext=timetext, username=list[i][5], id=list[i][6], is_adopted=list[i][7]))
            i -= 1
        if fay_booter.is_running():
            wsa_server.get_web_instance().add_cmd({"liveState": 1})
        return json.dumps({'list': relist})
    except json.JSONDecodeError:
        return jsonify({'list': [], 'message': '无效的JSON数据'})
    except Exception as e:
        return jsonify({'list': [], 'message': f'获取消息时出错: {e}'}), 500

#文字沟通接口
@__app.route('/v1/chat/completions', methods=['post'])
@__app.route('/api/send/v1/chat/completions', methods=['post'])
def api_send_v1_chat_completions():
    # 处理聊天完成请求
    data = request.get_json()
    if not data:
        return jsonify({'error': '未提供数据'})
    
    # 获取pure_mode参数
    pure_mode = data.get('pure_mode', False)
    
    # 如果不在纯模式，确保数字人服务正在运行
    if not pure_mode:
        # 检查服务是否运行或feiFei是否已初始化
        if not fay_booter.is_running() or fay_booter.feiFei is None:
            if fay_booter.feiFei is None:
                util.log(1, "[对话API-v1] feiFei 未初始化，尝试自动启动服务...")
            else:
                util.log(1, "[对话API-v1] 服务未运行，自动启动...")
            
            start_success, start_message, start_details = ensure_fay_service_running(timeout=10)
            if not start_success:
                # 启动失败，回退到直接调用LLM API
                util.log(1, f"[对话API-v1] 服务启动失败: {start_message}，回退到直接LLM调用")
                # 记录启动失败信息，但仍然尝试直接调用LLM
                try:
                    response = direct_llm_api_call(data)
                    # 如果直接LLM调用成功，在响应中添加警告信息
                    if isinstance(response, dict):
                        response['warning'] = f'数字人服务未启动（{start_message}），已使用直接LLM模式'
                    return response
                except:
                    # 如果直接LLM也失败，返回错误
                    return jsonify({
                        'error': f'服务启动失败且LLM调用失败: {start_message}',
                        'details': start_details
                    }), 500
            util.log(1, f"[对话API-v1] 服务启动成功: {start_message}，继续处理消息")
            
            # 再次检查feiFei是否已初始化（启动后应该已初始化）
            if fay_booter.feiFei is None:
                util.log(1, "[对话API-v1] ⚠️ 服务已启动但feiFei仍未初始化，等待初始化...")
                # 等待一小段时间让feiFei初始化（time模块已在文件顶部导入）
                for i in range(5):  # 最多等待5秒
                    time.sleep(1)
                    if fay_booter.feiFei is not None:
                        util.log(1, f"[对话API-v1] ✅ feiFei 已初始化（等待了 {i+1} 秒）")
                        break
                
                # 如果仍然未初始化，回退到直接LLM调用
                if fay_booter.feiFei is None:
                    util.log(1, "[对话API-v1] ⚠️ feiFei 初始化超时，使用直接LLM调用")
                    try:
                        response = direct_llm_api_call(data)
                        if isinstance(response, dict):
                            response['warning'] = '数字人服务启动但未完全初始化，已使用直接LLM模式'
                        return response
                    except:
                        return jsonify({
                            'error': '服务启动但feiFei未初始化，LLM调用也失败'
                        }), 500
    
    try:
        last_content = ""
        system_override = ""
        if 'messages' in data and data['messages']:
            for m in data['messages']:
                if m.get('role') == 'system' and m.get('content'):
                    system_override = m.get('content', '')
                    break
            last_message = data['messages'][-1]
            username = last_message.get('role', 'User')
            if username == 'user':
                username = 'User'
            last_content = last_message.get('content', 'No content provided')
        else:
            last_content = 'No messages found'
            username = 'User'

        model = data.get('model', 'fay')
        observation = data.get('observation', '')
        frontend_emotion_state = _normalize_emotion_state_text(data.get('emotion_state'))
        if frontend_emotion_state:
            observation = f"{observation}\n{frontend_emotion_state}".strip() if observation else frontend_emotion_state
        frontend_workshop_state = _normalize_workshop_state_text(data.get('workshop_state'))
        if frontend_workshop_state:
            observation = f"{observation}\n{frontend_workshop_state}".strip() if observation else frontend_workshop_state
        voice_emotion_hint = _normalize_voice_emotion_hint(data.get('voice_emotion_hint'))
        interaction_mode = str(data.get('interaction_mode') or '').strip().lower()
        if interaction_mode == 'call':
            call_mode_hint = '当前为实时通话模式，请优先使用简短、口语化、适合边听边理解的回复。'
            observation = f"{observation}\n{call_mode_hint}".strip() if observation else call_mode_hint
        interact_data = {'user': username, 'msg': last_content, 'observation': str(observation), 'stream': False, 'pure_mode': pure_mode}
        if voice_emotion_hint:
            interact_data['voice_emotion_hint'] = voice_emotion_hint
        if system_override:
            interact_data['system_override'] = system_override
        # 检查请求中是否指定了流式传输
        stream_requested = data.get('stream', False)
        # 纯模型模式：直接走LLM，不经过数字人交互总线
        if pure_mode:
            return direct_llm_api_call(data)
        if stream_requested or model == 'fay-streaming':
            interact_data['stream'] = True
            interact = Interact("text", 1, interact_data)
            util.printInfo(1, username, '[文字沟通接口(流式)]{}'.format(interact.data["msg"]), time.time())
            fay_booter.feiFei.on_interact(interact)
            return gpt_stream_response(last_content, username)
        else:
            interact = Interact("text", 1, interact_data)
            util.printInfo(1, username, '[文字沟通接口(非流式)]{}'.format(interact.data["msg"]), time.time())
            fay_booter.feiFei.on_interact(interact)
            return non_streaming_response(last_content, username)
    except Exception as e:
        util.log(1, f"[API] 处理请求时出错: {e}")
        return jsonify({'error': f'处理请求时出错: {e}'}), 500

def direct_llm_api_call(data):
    """
    直接调用 LLM API（当 feiFei 未初始化时使用）
    """
    try:
        import openai
        
        # 加载配置
        config_util.load_config()
        
        # 构建消息
        messages = []
        pure_mode = bool(data.get('pure_mode', False))
        if 'messages' in data:
            for msg in data['messages']:
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if role == 'system':
                    messages.append({'role': 'system', 'content': content})
                elif role == 'assistant':
                    messages.append({'role': 'assistant', 'content': content})
                else:
                    messages.append({'role': 'user', 'content': content})

        if pure_mode:
            # 纯LLM模式：只保留用户消息上下文，避免继承历史 assistant 风格化语气。
            user_only_messages = [
                {'role': 'user', 'content': str(m.get('content') or '').strip()}
                for m in messages
                if m.get('role') == 'user' and str(m.get('content') or '').strip()
            ]
            # 控制上下文长度，保留最近几轮用户输入即可。
            messages = user_only_messages[-6:]
            messages.insert(0, {
                'role': 'system',
                'content': (
                    "你是普通对话助手。只做直接问答，不做角色扮演，不写舞台动作，不写括号旁白，"
                    "不输出抒情场景描写，不反问小游戏。不要自报家门，不要说自己是某公司或某模型，"
                    "开场直接围绕用户问题作答或追问需求。回复保持简洁自然，通常 1-2 句。"
                )
            })
        else:
            has_system_prompt = any((m.get('role') == 'system' and str(m.get('content') or '').strip()) for m in messages)
            if not has_system_prompt:
                messages.insert(0, {
                    'role': 'system',
                    'content': (
                        "你是普通对话助手。请直接回答用户输入，不做角色扮演，不写舞台动作，不写括号旁白，"
                        "不输出抒情场景描写。不要自报家门，不要说自己是某公司或某模型，"
                        "开场直接围绕用户问题作答或追问需求。回复保持简洁自然，通常 1-2 句。"
                    )
                })

        observation_parts = []
        raw_observation = str(data.get('observation', '') or '').strip()
        if raw_observation:
            observation_parts.append(raw_observation)

        frontend_emotion_state = _normalize_emotion_state_text(data.get('emotion_state'))
        if frontend_emotion_state:
            observation_parts.append(frontend_emotion_state)

        frontend_workshop_state = _normalize_workshop_state_text(data.get('workshop_state'))
        if frontend_workshop_state:
            observation_parts.append(frontend_workshop_state)

        if observation_parts:
            messages.insert(0, {
                'role': 'system',
                'content': "额外观察：\n" + "\n".join(observation_parts)
            })
        
        # 使用配置中的API设置，不做任何修改
        base_url = config_util.gpt_base_url
        api_key = config_util.key_gpt_api_key
        model_name = config_util.gpt_model_engine or 'qwen3.5-122b-a10b'
        
        util.log(1, f"[API] 直接调用LLM API，base_url: {base_url}, model: {model_name}")
        
        # 使用配置的API设置
        client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        
        # 调用 API
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=False,
            temperature=0.2
        )
        
        # 返回 OpenAI 兼容格式
        return jsonify({
            'choices': [{
                'message': {
                    'role': 'assistant',
                    'content': response.choices[0].message.content
                }
            }]
        })
    except Exception as e:
        util.log(1, f"[API] 直接调用 LLM API 失败: {e}")
        import traceback
        util.log(1, f"[API] 错误详情: {traceback.format_exc()}")
        return jsonify({'error': f'LLM API 调用失败: {e}'}), 500


SOULLINK_THERAPY_SYSTEM_PROMPT = '你是 SoulLink 的心理陪伴型数字人，也是用户正在互动的卡通伙伴。你的任务不是只聊天，而是让用户感觉被理解、被接住，并给出一点能马上做到的小建议。回复方式：先回应用户当下情绪，再结合他说的具体事情给出温和建议，最后可以用一个自然的问题继续对话。一般控制在2到4句、50到110个字，适合语音播报。语气要像可靠朋友，不要说教，不要上价值，不要堆概念，不要机械地说“我理解你”。如果用户只是普通闲聊，也保持角色语气自然回应；如果用户表达明显危险或伤害自己的想法，先认真表达关切，再建议马上联系身边可信任的人或专业帮助。'

@__app.route('/api/direct-llm/chat', methods=['post'])
def api_direct_llm_chat():
    """
    纯 LLM 直聊接口：
    - 不走 feiFei / 数字人总线
    - 不读取 current_model_id
    - 不附加当前数字人人设、记忆或陪伴型提示
    """
    try:
        from llm import llm_service

        data = request.get_json(silent=True) or {}
        messages = data.get('messages') or []
        system_prompt = data.get('system_prompt') or ''
        username = data.get('username') or 'User'
        model_id = None

        history = []
        last_user_message = ''

        if isinstance(messages, list):
            for msg in messages:
                if not isinstance(msg, dict):
                    continue
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if not content:
                    continue
                if role == 'system' and not system_prompt:
                    system_prompt = content
                    continue
                if role == 'assistant':
                    history.append({'role': 'assistant', 'content': content})
                    continue
                last_user_message = content
                history.append({'role': 'user', 'content': content})

        if history and history[-1].get('role') == 'user':
            history = history[:-1]

        if not last_user_message:
            return jsonify({'error': '缺少用户消息'}), 400

        # 鐩磋繛陪伴对话也要落库用户输入，否则历史记录会只剩模型回复
        content_db.new_instance().add_content('member', 'speak', last_user_message, username, 0, model_id)

        reply = llm_service.chat_with_model(
            message=last_user_message,
            username=username,
            model_id=None,
            history=history,
            system_prompt=system_prompt or SOULLINK_THERAPY_SYSTEM_PROMPT
        )
        reply = _normalize_childlike_tone_text(reply)

        return jsonify({
            'choices': [{
                'message': {
                    'role': 'assistant',
                    'content': reply
                }
            }]
        })
    except Exception as e:
        util.log(1, f"[API] 纯LLM直聊失败: {e}")
        return jsonify({'error': f'纯LLM直聊失败: {e}'}), 500

@__app.route('/api/direct-llm/companion-chat', methods=['post'])
def api_direct_llm_companion_chat():
    """
    数字人人设直连 LLM：
    - 文本回复由 llm_service 直接生成
    - 不走 feiFei 的文本理解/记忆/思考中链路
    - 可选把最终文本交给 feiFei(type=2) 做 TTS 与数字人驱动
    """
    try:
        from llm import llm_service

        data = request.get_json(silent=True) or {}
        messages = data.get('messages') or []
        system_prompt = data.get('system_prompt') or ''
        username = data.get('username') or 'User'
        model_id = data.get('model_id')
        speak_reply = bool(data.get('speak_reply', True))

        history = []
        last_user_message = ''

        if isinstance(messages, list):
            for msg in messages:
                if not isinstance(msg, dict):
                    continue
                role = msg.get('role', 'user')
                content = msg.get('content', '')
                if not content:
                    continue
                if role == 'system' and not system_prompt:
                    system_prompt = content
                    continue
                if role == 'assistant':
                    history.append({'role': 'assistant', 'content': content})
                    continue
                last_user_message = content
                history.append({'role': 'user', 'content': content})

        if history and history[-1].get('role') == 'user':
            history = history[:-1]

        if not last_user_message:
            return jsonify({'error': '缺少用户消息'}), 400

        reply = llm_service.chat_with_model(
            message=last_user_message,
            username=username,
            model_id=model_id,
            history=history,
            system_prompt=system_prompt or SOULLINK_THERAPY_SYSTEM_PROMPT
        )
        reply = _normalize_childlike_tone_text(reply)

        speak_started = False
        speak_warning = None

        if speak_reply and reply and str(reply).strip():
            try:
                if not fay_booter.is_running() or fay_booter.feiFei is None:
                    start_success, start_message, _start_details = ensure_fay_service_running(timeout=10)
                    if not start_success or fay_booter.feiFei is None:
                        speak_warning = f'数字人驱动未就绪，已仅返回文本：{start_message}'
                    else:
                        util.log(1, "[API] 直连LLM数字人对话：数字人服务已启动，准备播报")

                if fay_booter.feiFei is not None:
                    interact = Interact("direct_llm", 2, {
                        'user': username,
                        'text': reply,
                    })
                    import threading
                    threading.Thread(
                        target=fay_booter.feiFei.on_interact,
                        args=(interact,),
                        daemon=True
                    ).start()
                    speak_started = True
            except Exception as speak_error:
                speak_warning = f'文本已生成，但语音驱动失败：{speak_error}'
                util.log(1, f"[API] 直连LLM数字人播报失败: {speak_error}")

        if reply and str(reply).strip() and not speak_started:
            content_db.new_instance().add_content('fay', 'speak', reply, username, 0, model_id)

        response_payload = {
            'choices': [{
                'message': {
                    'role': 'assistant',
                    'content': reply,
                }
            }],
            'speak_started': speak_started,
        }

        if speak_warning:
            response_payload['warning'] = speak_warning

        return jsonify(response_payload)
    except Exception as e:
        util.log(1, f"[API] 数字人人设直连LLM失败: {e}")
        return jsonify({'error': f'数字人人设直连LLM失败: {e}'}), 500

@__app.route('/api/get-member-list', methods=['post'])
def api_get_Member_list():
    # 获取成员列表
    try:
        memberdb = member_db.new_instance()
        list = memberdb.get_all_users()
        return json.dumps({'list': list})
    except Exception as e:
        return jsonify({'list': [], 'message': f'获取成员列表时出错: {e}'}), 500

@__app.route('/api/get-run-status', methods=['post'])
def api_get_run_status():
    # 获取运行状态
    try:
        status = fay_booter.is_running()
        return json.dumps({'status': status})
    except Exception as e:
        return jsonify({'status': False, 'message': f'获取运行状态时出错: {e}'}), 500

@__app.route('/api/adopt-msg', methods=['POST'])
def adopt_msg():
    # 采纳消息
    data = request.get_json()
    if not data:
        return jsonify({'status':'error', 'msg': '未提供数据'})

    id = data.get('id')

    if not id:
        return jsonify({'status':'error', 'msg': 'id不能为空'})

    if  config_util.config["interact"]["QnA"] == "":
        return jsonify({'status':'error', 'msg': '请先设置Q&A文件'})

    try:
        info = content_db.new_instance().get_content_by_id(id)
        content = info[3] if info else ''
        if info is not None:
            previous_info = content_db.new_instance().get_previous_user_message(id)
            previous_content = previous_info[3] if previous_info else ''
            result = content_db.new_instance().adopted_message(id)
            if result:
                qa_service.QAService().record_qapair(previous_content, content)
                return jsonify({'status': 'success', 'msg': '采纳成功'})
            else:
                return jsonify({'status':'error', 'msg': '采纳失败'}), 500
        else:
            return jsonify({'status':'error', 'msg': '消息未找到'}), 404
    except Exception as e:
        return jsonify({'status':'error', 'msg': f'采纳消息时出错: {e}'}), 500


def _speak_reply_text_async(username, text):
    """Force a generated text reply to be spoken by the configured TTS module."""
    clean_text = re.sub(r"<think>[\s\S]*?</think>", "", str(text or ""), flags=re.IGNORECASE).strip()
    if not clean_text:
        return False
    try:
        if not fay_booter.is_running() or fay_booter.feiFei is None:
            ensure_fay_service_running(timeout=10)
        if fay_booter.feiFei is None:
            util.log(1, "[TTS兜底] feiFei 未初始化，无法播报")
            return False
        interact = Interact("direct_llm", 2, {
            "user": username or "User",
            "text": clean_text,
        })
        import threading
        threading.Thread(
            target=fay_booter.feiFei.on_interact,
            args=(interact,),
            daemon=True,
        ).start()
        util.log(1, "[TTS兜底] 已提交播报任务")
        return True
    except Exception as exc:
        util.log(1, f"[TTS兜底] 播报失败: {exc}")
        return False

def gpt_stream_response(last_content, username):
    sm = stream_manager.new_instance()
    _, nlp_Stream = sm.get_Stream(username)
    def generate():
        conversation_id = sm.get_conversation_id(username)
        spoken_text_parts = []
        while True:
            sentence = nlp_Stream.read()
            if sentence is None:
                gsleep(0.01)
                continue
            
            # 跳过非当前会话
            try:
                m = re.search(r"__<cid=([^>]+)>__", sentence)
                producer_cid = m.group(1)
                if producer_cid != conversation_id:
                    continue
                if m:
                    sentence = sentence.replace(m.group(0), "")
            except Exception as e:
                print(e)
            is_first = "_<isfirst>" in sentence
            is_end = "_<isend>" in sentence
            content = sentence.replace("_<isfirst>", "").replace("_<isend>", "").replace("_<isqa>", "")
            if content:
                spoken_text_parts.append(content)
            if content or is_first or is_end:  # 只有当有实际内容时才发送
                message = {
                    "id": "faystreaming-" + str(uuid.uuid4()),
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": "fay-streaming",
                    "choices": [
                        {
                            "delta": {
                                "content": content
                            },
                            "index": 0,
                            "finish_reason": "stop" if is_end else None
                        }
                    ],
                    #TODO 这里的token计算方式需要优化
                    "usage": {
                        "prompt_tokens": len(last_content) if is_first else 0, 
                        "completion_tokens": len(content),
                        "total_tokens": len(last_content) + len(content)
                    },
                    "system_fingerprint": ""
                }
                yield f"data: {json.dumps(message)}\n\n"
            if is_end:
                _speak_reply_text_async(username, "".join(spoken_text_parts))
                break
            gsleep(0.01)
        yield 'data: [DONE]\n\n'
    
    return Response(generate(), mimetype='text/event-stream')

# 处理非流式响应
def non_streaming_response(last_content, username):
    sm = stream_manager.new_instance()
    _, nlp_Stream = sm.get_Stream(username)
    text = ""
    conversation_id = sm.get_conversation_id(username)
    while True:
        sentence = nlp_Stream.read()
        if sentence is None:
            gsleep(0.01)
            continue
        
        # 跳过非当前会话
        try:
            m = re.search(r"__<cid=([^>]+)>__", sentence)
            producer_cid = m.group(1)
            if producer_cid != conversation_id:
                continue
            if m:
                sentence = sentence.replace(m.group(0), "")
        except Exception as e:
            print(e)
        is_first = "_<isfirst>" in sentence
        is_end = "_<isend>" in sentence
        text += sentence.replace("_<isfirst>", "").replace("_<isend>", "").replace("_<isqa>", "")
        if is_end:
            break
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE).strip()
    return jsonify({
        "id": "fay-" + str(uuid.uuid4()),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": "fay",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": text
                },
                "logprobs": "",
                "finish_reason": "stop"
            }
        ],
        #TODO 这里的token计算方式需要优化
        "usage": {
            "prompt_tokens": len(last_content), 
            "completion_tokens": len(text),
            "total_tokens": len(last_content) + len(text)
        },
        "system_fingerprint": ""
    })

@__app.route('/', methods=['get'])
def home_get():
    try:
        return __get_template()
    except Exception as e:
        return f"Error loading home page: {e}", 500

@__app.route('/', methods=['post'])
def home_post():
    try:
        return __get_template()
    except Exception as e:
        return f"Error processing request: {e}", 500

@__app.route('/setting', methods=['get'])
def setting():
    try:
        return render_template('setting.html')
    except Exception as e:
        return f"Error loading settings page: {e}", 500

@__app.route('/models', methods=['get'])
def models():
    try:
        return render_template('models.html')
    except Exception as e:
        return f"Error loading models page: {e}", 500

@__app.route('/mcp', methods=['get'])
def mcp_page():
    return _proxy_mcp_request('Page3', rewrite_html=True)

@__app.route('/mcp/', methods=['get'])
def mcp_page_slash():
    return _proxy_mcp_request('Page3', rewrite_html=True)

@__app.route('/mcp/static/<path:filename>', methods=['get'])
def mcp_static(filename):
    try:
        return send_from_directory(_get_faymcp_static_dir(), filename)
    except Exception as e:
        util.log(1, f'[MCP静态资源] 加载失败: {filename}, error={e}')
        return f"Error loading MCP static asset: {e}", 404

@__app.route('/api/mcp/servers', methods=['GET', 'POST'])
@__app.route('/api/mcp/servers/<path:subpath>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@__app.route('/api/mcp/tools/<path:subpath>', methods=['POST'])
def mcp_api_proxy(subpath=''):
    proxy_path = request.path.lstrip('/')
    return _proxy_mcp_request(proxy_path)

@__app.route('/Page3', methods=['get'])
def Page3():
    return redirect(url_for('mcp_page'))

@__app.route('/test-pure-llm', methods=['get'])
def test_pure_llm():
    try:
        with open('test_pure_llm_api.html', 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading test page: {e}", 500

@__app.route('/debug-pure-mode', methods=['get'])
def debug_pure_mode():
    try:
        with open('debug_pure_mode.html', 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading debug page: {e}", 500

@__app.route('/quick_test_pure_mode.html', methods=['get'])
def quick_test_pure_mode():
    try:
        with open('quick_test_pure_mode.html', 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading test page: {e}", 500

@__app.route('/simple_chat.html', methods=['get'])
def simple_chat():
    try:
        with open('simple_chat.html', 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading simple chat page: {e}", 500

@__app.route('/simple-chat', methods=['get'])
def simple_chat_route():
    try:
        with open('simple_chat.html', 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error loading simple chat page: {e}", 500


# 输出的音频http
@__app.route('/api/audio/recognize', methods=['POST'])
def api_audio_recognize():
    """
    接收音频文件并进行ASR识别
    支持WebM、WAV等格式
    （供Web端/移动端上传录音文件使用）
    """
    try:
        import time
        import subprocess
        import wave

        from utils import config_util as cfg
        from asr.ali_nls import ALiNls
        from asr.funasr import FunASR

        if 'audio' not in request.files:
            return jsonify({'code': 400, 'message': '未提供音频文件'}), 400

        audio_file = request.files['audio']
        username = request.form.get('username', 'User')

        if audio_file.filename == '':
            return jsonify({'code': 400, 'message': '文件名不能为空'}), 400

        # 保存临时音频文件（原始 webm）
        temp_dir = os.path.join(os.getcwd(), 'temp_audio')
        os.makedirs(temp_dir, exist_ok=True)

        ts = int(time.time())
        base_name = f'audio_{username}_{ts}'
        webm_path = os.path.join(temp_dir, base_name + '.webm')
        wav_path = os.path.join(temp_dir, base_name + '.wav')
        audio_file.save(webm_path)

        util.log(1, f"[音频识别] 接收到音频文件: {os.path.basename(webm_path)}, 用户: {username}, 大小: {os.path.getsize(webm_path)} bytes")

        try:
            # 1. 使用 ffmpeg 将 WebM 转为 16k 单声道 WAV（PCM16）
            # 依赖外部 ffmpeg，可按项目其他模块的方式安装
            ffmpeg_cmd = [
                'ffmpeg',
                '-y',
                '-i', webm_path,
                '-ac', '1',
                '-ar', '16000',
                '-f', 'wav',
                wav_path,
            ]
            subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            # 2. 调用现有 ASR 客户端（与麦克风流式识别共用配置）
            asr_mode = cfg.ASR_mode

            def recognize_with_ali(wav_file: str) -> str:
                asr = ALiNls(username)
                asr.start()
                # 等待连接就绪
                start_ts = time.time()
                while not asr.started and time.time() - start_ts < 5:
                    time.sleep(0.01)

                with wave.open(wav_file, 'rb') as wf:
                    # 按 20ms 一帧发送：16000 * 0.02 = 320 帧（*2 字节）
                    frame_samples = 320
                    while True:
                        frames = wf.readframes(frame_samples)
                        if not frames:
                            break
                        asr.send(frames)

                asr.end()

                # 等待结果返回（最多 10 秒）
                wait_start = time.time()
                while not asr.done and time.time() - wait_start < 10:
                    time.sleep(0.05)

                return asr.finalResults or ""

            def recognize_with_funasr(wav_file: str) -> str:
                """
                FunASR 部署通常支持基于 URL/路径的识别，这里复用 FunASR 客户端。
                具体行为取决于本地 FunASR 服务实现。
                """
                asr = FunASR(username)
                asr.start()
                # 直接通过 send_url 让后端读取本地文件
                asr.send_url(wav_file)

                wait_start = time.time()
                while not asr.done and time.time() - wait_start < 10:
                    time.sleep(0.05)

                return asr.finalResults or ""

            if asr_mode == "ali":
                text = recognize_with_ali(wav_path)
            elif asr_mode in ("funasr", "sensevoice"):
                text = recognize_with_funasr(wav_path)
            else:
                util.log(1, f"[音频识别] 未配置有效的 ASR_mode: {asr_mode}")
                text = ""

            # 清理临时文件
            try:
                if os.path.exists(webm_path):
                    os.remove(webm_path)
                if os.path.exists(wav_path):
                    os.remove(wav_path)
            except Exception as e:
                util.log(1, f"[音频识别] 清理临时文件失败: {e}")

            if text:
                util.log(1, f"[音频识别] 识别结果: {text}")
                return jsonify({
                    'code': 200,
                    'message': '识别成功',
                    'text': text,
                }), 200
            else:
                util.log(1, "[音频识别] 未得到有效识别结果")
                return jsonify({
                    'code': 500,
                    'message': '未能识别出有效文本，请重试或检查ASR服务',
                }), 500

        except Exception as e:
            util.log(1, f"[音频识别] ASR识别失败: {str(e)}")
            # 清理临时文件
            try:
                if os.path.exists(webm_path):
                    os.remove(webm_path)
                if os.path.exists(wav_path):
                    os.remove(wav_path)
            except:
                pass
            return jsonify({'code': 500, 'message': f'ASR识别失败: {str(e)}'}), 500

    except Exception as e:
        util.log(1, f"[音频识别API] 处理失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'处理失败: {str(e)}'}), 500

@__app.route('/api/face/landmarks', methods=['POST'])
def api_face_landmarks():
    try:
        payload = request.get_json(silent=True) or {}
        image_payload = payload.get('image') or payload.get('imageBase64') or ''
        preferred_method = payload.get('preferredMethod') or 'auto'
        if not image_payload:
            return jsonify({
                'code': 400,
                'message': 'Missing image payload.'
            }), 400

        result = face_landmark_service.detect_from_data_url(
            image_payload,
            preferred_method=preferred_method,
        )
        response = {
            'code': 200,
            'message': 'Face landmarks detected.' if result.get('ok') else result.get('diagnostics', {}).get('message', 'Face landmarks not found.'),
            **result,
        }
        return jsonify(response), 200
    except Exception as e:
        util.log(1, f"[FaceLandmarks] request failed: {e}")
        return jsonify({
            'code': 500,
            'message': f'Face landmark detection failed: {e}',
            'ok': False,
            'landmarks': [],
        }), 500


@__app.route('/api/detect_emotion', methods=['POST'])
def api_detect_emotion():
    try:
        uploaded_file = request.files.get('file')
        if uploaded_file is not None:
            filename = str(uploaded_file.filename or '').strip()
            if not filename:
                return jsonify({
                    'code': 400,
                    'message': 'Missing uploaded zip file.',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 400

            if not filename.lower().endswith('.zip'):
                return jsonify({
                    'code': 400,
                    'message': 'Only zip files are supported.',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 400

            file_bytes = uploaded_file.read()
            if not file_bytes:
                return jsonify({
                    'code': 400,
                    'message': 'Uploaded zip file is empty.',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 400

            infer_url = _get_video_emotion_infer_url()
            try:
                upstream = requests.post(
                    infer_url,
                    files={
                        'file': (
                            filename,
                            file_bytes,
                            'application/zip',
                        )
                    },
                    timeout=120,
                )
            except requests.exceptions.Timeout:
                util.log(1, f"[DetectEmotion] upstream timeout: {infer_url}")
                return jsonify({
                    'code': 504,
                    'message': 'Emotion inference request timed out.',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 504
            except requests.exceptions.RequestException as e:
                util.log(1, f"[DetectEmotion] upstream request failed: {e}")
                return jsonify({
                    'code': 502,
                    'message': f'Emotion inference service unavailable: {e}',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 502

            try:
                upstream_data = upstream.json()
            except ValueError:
                upstream_data = {}

            if not upstream.ok:
                status_code = upstream.status_code
                response_body = {
                    'code': status_code,
                    'message': upstream_data.get('message') or f'Emotion inference failed ({status_code}).',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }
                if upstream_data.get('request_id'):
                    response_body['request_id'] = upstream_data.get('request_id')
                if upstream_data.get('detail'):
                    response_body['detail'] = upstream_data.get('detail')
                return jsonify(response_body), status_code

            label = str(upstream_data.get('label') or '').strip().lower()
            if not label:
                return jsonify({
                    'code': 502,
                    'message': 'Emotion inference service returned an empty label.',
                    'emotion': 'neutral',
                    'label': 'neutral',
                    'available': False,
                }), 502

            if label not in VIDEO_EMOTION_LABELS:
                util.log(1, f"[DetectEmotion] unexpected label from upstream: {label}")

            return jsonify({
                'code': 200,
                'message': 'Emotion detected.',
                'emotion': label,
                'label': label,
                'available': True,
                'source': 'video_frames_zip',
            }), 200

        payload = request.get_json(silent=True) or {}
        image_payload = (
            payload.get('image_base64')
            or payload.get('image')
            or payload.get('imageBase64')
            or ''
        )
        preferred_method = payload.get('preferredMethod') or payload.get('preferred_method') or 'auto'
        if not image_payload:
            return jsonify({
                'code': 400,
                'message': 'Missing image payload.',
                'emotion': '平静',
                'available': False,
            }), 400

        landmark_result = face_landmark_service.detect_from_data_url(
            image_payload,
            preferred_method=preferred_method,
        )
        emotion_result = realtime_emotion.analyze_face_emotion(landmark_result, image_payload=image_payload)
        return jsonify({
            'code': 200,
            'message': emotion_result.get('message') or 'Emotion detected.',
            'emotion': emotion_result.get('emotion', '平静'),
            'confidence': emotion_result.get('confidence', 0.2),
            'available': emotion_result.get('available', False),
            'tags': emotion_result.get('tags', []),
            'distribution': emotion_result.get('distribution', {}),
            'hint': emotion_result.get('hint', {}),
            'source': emotion_result.get('source', 'face'),
            'metrics': emotion_result.get('metrics', {}),
            'evidence': emotion_result.get('evidence', []),
            'face_box': emotion_result.get('face_box') or landmark_result.get('faceBox'),
            'detection_method': emotion_result.get('inference') or landmark_result.get('method'),
            'diagnostics': landmark_result.get('diagnostics', {}),
        }), 200
    except Exception as e:
        util.log(1, f"[DetectEmotion] request failed: {e}")
        fallback = realtime_emotion.analyze_face_emotion({'ok': False, 'diagnostics': {'message': str(e)}})
        return jsonify({
            'code': 500,
            'message': f'Face emotion detection failed: {e}',
            'emotion': fallback.get('emotion', '平静'),
            'available': False,
            'hint': fallback.get('hint', {}),
        }), 500


@__app.route('/api/detect_audio_emotion', methods=['POST'])
def api_detect_audio_emotion():
    try:
        if 'audio' not in request.files:
            return jsonify({
                'code': 400,
                'message': 'Missing audio upload.',
                'voice_emotion': '平静',
                'available': False,
            }), 400

        audio_file = request.files['audio']
        username = request.form.get('username', 'User')
        if audio_file.filename == '':
            return jsonify({
                'code': 400,
                'message': 'Audio file name is empty.',
                'voice_emotion': '平静',
                'available': False,
            }), 400

        source_path = None
        wav_path = None
        try:
            source_path, wav_path = _prepare_uploaded_audio(audio_file, username=username)
            transcript = _recognize_wav_with_config(wav_path, username=username)
            audio_metrics = _analyze_wav_signal(wav_path)
            emotion_result = realtime_emotion.analyze_voice_emotion(transcript, audio_metrics)
            return jsonify({
                'code': 200,
                'message': emotion_result.get('message') or 'Voice emotion analyzed.',
                'voice_emotion': emotion_result.get('emotion', '平静'),
                'confidence': emotion_result.get('confidence', 0.2),
                'available': emotion_result.get('available', False),
                'transcript': transcript,
                'tags': emotion_result.get('tags', []),
                'distribution': emotion_result.get('distribution', {}),
                'voice_emotion_hint': emotion_result.get('hint', {}),
                'metrics': audio_metrics,
                'evidence': emotion_result.get('evidence', []),
            }), 200
        except Exception as e:
            util.log(1, f"[DetectAudioEmotion] failed: {e}")
            return jsonify({
                'code': 500,
                'message': f'Voice emotion detection failed: {e}',
                'voice_emotion': '平静',
                'available': False,
            }), 500
        finally:
            _cleanup_audio_temp_files(source_path, wav_path)

    except Exception as e:
        util.log(1, f"[DetectAudioEmotionAPI] request failed: {e}")
        return jsonify({
            'code': 500,
            'message': f'Voice emotion detection failed: {e}',
            'voice_emotion': '平静',
            'available': False,
        }), 500


@__app.route('/audio/<filename>')
def serve_audio(filename):
    audio_file = os.path.join(os.getcwd(), "samples", filename)
    if os.path.exists(audio_file):
        return send_file(audio_file)
    else:
        return jsonify({'error': '文件未找到'}), 404

# 输出的表情gif
@__app.route('/robot/<filename>')
def serve_gif(filename):
    gif_file = os.path.join(os.getcwd(), "gui", "robot", filename)
    if os.path.exists(gif_file):
        return send_file(gif_file)
    else:
        return jsonify({'error': '文件未找到'}), 404

# 输出的3D模型文件
@__app.route('/models/<path:filename>')
def serve_model(filename):
    """
    提供3D模型文件服务
    支持 .glb, .gltf, .fbx 等格式
    """
    try:
        normalized_filename = str(filename or '').replace('\\', '/').strip('/')
        # 安全检查：防止路径遍历攻击
        if not normalized_filename or '..' in normalized_filename.split('/'):
            return jsonify({'error': '非法文件名'}), 400
        
        models_dir = _get_models_root_dir()
        model_file = os.path.normpath(os.path.join(models_dir, normalized_filename))
        if not model_file.startswith(models_dir):
            return jsonify({'error': '非法文件名'}), 400
        
        if not os.path.exists(model_file):
            return jsonify({'error': '文件未找到'}), 404
        
        # 根据文件扩展名设置MIME类型
        mime_types = {
            '.glb': 'model/gltf-binary',
            '.gltf': 'model/gltf+json',
            '.fbx': 'application/octet-stream'
        }
        
        ext = os.path.splitext(normalized_filename)[1].lower()
        mimetype = mime_types.get(ext, 'application/octet-stream')
        
        return send_file(model_file, mimetype=mimetype)
    except Exception as e:
        util.log(1, f"[模型文件服务] 提供模型文件失败: {str(e)}")
        return jsonify({'error': f'提供文件失败: {str(e)}'}), 500

#打招呼
@__app.route('/to-greet', methods=['POST'])
def to_greet():
    data = request.get_json()
    username = data.get('username', 'User')
    observation = data.get('observation', '')
    interact = Interact("hello", 1, {'user': username, 'msg': '按观测要求打个招呼', 'observation': str(observation)})
    text = fay_booter.feiFei.on_interact(interact)
    return jsonify({'status': 'success', 'data': text, 'msg': '已进行打招呼'}), 200 

#唤醒:在普通唤醒模式，进行大屏交互才有意义
@__app.route('/to-wake', methods=['POST'])
def to_wake():
    data = request.get_json()
    username = data.get('username', 'User')
    observation = data.get('observation', '')
    fay_booter.recorderListener.wakeup_matched = True
    return jsonify({'status': 'success', 'msg': '已唤醒'}), 200 

#打断
@__app.route('/to-stop-talking', methods=['POST'])
def to_stop_talking():
    try:
        data = request.get_json()
        username = data.get('username', 'User')
        stream_manager.new_instance().clear_Stream_with_audio(username)
        
        result = "interrupted"  # 简单的结果标识
        return jsonify({
            'status': 'success',
            'data': str(result) if result is not None else '',
            'msg': f'已停止用户 {username} 的说话'
        }), 200
    except Exception as e:
        username_str = username if 'username' in locals() else 'Unknown'
        util.printInfo(1, username_str, f"打断操作失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'msg': str(e)
        }), 500


#消息透传接口
@__app.route('/transparent-pass', methods=['post'])
def transparent_pass():
    try:
        data = request.form.get('data')
        if data is None:
            data = request.get_json()
        else:
            data = json.loads(data)
        username = data.get('user', 'User')
        response_text = data.get('text', None)
        audio_url = data.get('audio', None)
        if response_text or audio_url:
            # 新消息到达，立即中断该用户之前的所有处理（文本流+音频队列）
            util.printInfo(1, username, f'[API中断] 新消息到达，完整中断用户 {username} 之前的所有处理')
            util.printInfo(1, username, f'[API中断] 用户 {username} 的文本流和音频队列已清空，准备处理新消息')
            interact = Interact('transparent_pass', 2, {'user': username, 'text': response_text, 'audio': audio_url, 'isend':True, 'isfirst':True})
            util.printInfo(1, username, '透传播放：{}，{}'.format(response_text, audio_url), time.time())
            success = fay_booter.feiFei.on_interact(interact)
            if (success == 'success'):
                return jsonify({'code': 200, 'message' : '成功'})
        return jsonify({'code': 500, 'message' : '未知原因出错'})
    except Exception as e:
        return jsonify({'code': 500, 'message': f'出错: {e}'}), 500

# 直接LLM对话API - 完全绕过Fay框架
@__app.route('/api/direct-llm', methods=['POST'])
def api_direct_llm():
    """
    直接LLM对话接口 - 不走任何Fay逻辑，不使用记忆，不使用角色设定
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '未提供数据'}), 400
        
        message = data.get('message', '')
        if not message.strip():
            return jsonify({'error': '消息内容不能为空'}), 400
        
        # 加载基础配置（仅用于LLM连接）
        config_util.load_config()
        
        # 直接使用OpenAI兼容的API
        import openai
        
        # 使用配置中的LLM设置，完全按照配置来
        base_url = config_util.gpt_base_url
        api_key = config_util.key_gpt_api_key
        model_name = config_util.gpt_model_engine or 'qwen3.5-122b-a10b'
        
        util.log(1, f"[直接LLM] 使用配置: base_url={base_url}, model={model_name}")
        
        client = openai.OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        
        # 简单的系统提示 - 不包含任何角色设定
        messages = [
            {"role": "system", "content": "你是一个有用的AI助手。请直接、简洁地回答用户的问题。不要称呼用户为'主人'。"},
            {"role": "user", "content": message}
        ]
        
        # 调用LLM
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.7,
            max_tokens=2000
        )
        
        # 返回结果
        reply = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'reply': reply,
            'model': model_name
        })
        
    except Exception as e:
        util.log(1, f"[直接LLM] 调用失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'LLM调用失败: {str(e)}'
        }), 500

# 直接LLM流式对话API
@__app.route('/api/direct-llm-stream', methods=['POST'])
def api_direct_llm_stream():
    """
    直接LLM流式对话接口 - 完全绕过Fay框架
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '未提供数据'}), 400
        
        message = data.get('message', '')
        if not message.strip():
            return jsonify({'error': '消息内容不能为空'}), 400
        
        # 加载基础配置
        config_util.load_config()
        
        import openai
        
        client = openai.OpenAI(
            api_key=config_util.key_gpt_api_key,
            base_url=config_util.gpt_base_url
        )
        
        messages = [
            {"role": "system", "content": "你是一个有用的AI助手。请直接、简洁地回答用户的问题。"},
            {"role": "user", "content": message}
        ]
        
        def generate():
            try:
                stream = client.chat.completions.create(
                    model=config_util.gpt_model_engine or 'qwen3.5-122b-a10b',
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2000,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                
                yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        util.log(1, f"[直接LLM流式] 调用失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'LLM调用失败: {str(e)}'
        }), 500
@__app.route('/api/clear-memory', methods=['POST'])
def api_clear_memory():
    try:
        # 获取memory目录路径
        memory_dir = os.path.join(os.getcwd(), "memory")
        
        # 检查目录是否存在
        if not os.path.exists(memory_dir):
            return jsonify({'success': False, 'message': '记忆目录不存在'}), 400
        
        # 清空memory目录下的所有文件（保留目录结构）
        for root, dirs, files in os.walk(memory_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        util.log(1, f"已删除文件: {file_path}")
                except Exception as e:
                    util.log(1, f"删除文件时出错: {file_path}, 错误: {str(e)}")
        
        # 删除memory_dir下的所有子目录
        import shutil
        for item in os.listdir(memory_dir):
            item_path = os.path.join(memory_dir, item)
            if os.path.isdir(item_path):
                try:
                    shutil.rmtree(item_path)
                    util.log(1, f"已删除目录: {item_path}")
                except Exception as e:
                    util.log(1, f"删除目录时出错: {item_path}, 错误: {str(e)}")
        
        # 创建一个标记文件，表示记忆已被清除，防止退出时重新保存
        with open(os.path.join(memory_dir, ".memory_cleared"), "w") as f:
            f.write("Memory has been cleared. Do not save on exit.")
        
        # 设置记忆清除标记
        try:
            # 导入并修改nlp_cognitive_stream模块中的保存函数
            from llm.nlp_cognitive_stream import set_memory_cleared_flag, clear_agent_memory
            
            # 设置记忆清除标记
            set_memory_cleared_flag(True)
            
            # 清除内存中已加载的记忆
            clear_agent_memory()
            
            util.log(1, "已同时清除文件存储和内存中的记忆")
        except Exception as e:
            util.log(1, f"清除内存中记忆时出错: {str(e)}")
        
        util.log(1, "记忆已清除，需要重启应用才能生效")
        return jsonify({'success': True, 'message': '记忆已清除，请重启应用使更改生效'}), 200
    except Exception as e:
        util.log(1, f"清除记忆时出错: {str(e)}")
        return jsonify({'success': False, 'message': f'清除记忆时出错: {str(e)}'}), 500

# ==================== 模型管理API ====================

@__app.route('/api/models/create', methods=['POST'])
def api_models_create():
    """创建新模型"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'code': 400, 'message': '模型名称不能为空'}), 400
        
        description = data.get('description', '').strip()
        character_description = data.get('character_description', '').strip()
        attribute_json = data.get('attribute_json')
        model3d_url = data.get('model3d_url')  # 获取3D模型URL
        idle_model_url = data.get('idle_model_url')  # 获取待机动画模型URL
        talking_model_url = data.get('talking_model_url')  # 获取说话动画模型URL
        wave_model_url = data.get('wave_model_url')  # 获取招手动画模型URL（可选）
        wave_model_url = data.get('wave_model_url')  # 获取招手动画模型URL
        wave_model_url = data.get('wave_model_url')  # 获取招手动画模型URL（可选）
        creator_username = data.get('username')
        # 如果没有提供username，默认为全局模型
        if creator_username is None or creator_username == '':
            is_global = 1
            creator_username = None
        else:
            is_global = data.get('is_global', 0)
        
        # 如果提供了character_description，使用通用LLM生成属性
        if character_description:
            try:
                from llm import llm_service
                attributes = llm_service.generate_character_attributes(character_description)
                if attributes:
                    import json
                    attribute_json = json.dumps(attributes, ensure_ascii=False)
                    util.log(1, f"[模型API] 成功生成模型属性")
                else:
                    return jsonify({'code': 500, 'message': '生成模型属性失败'}), 500
            except Exception as e:
                util.log(1, f"[模型API] 生成属性失败: {str(e)}")
                return jsonify({'code': 500, 'message': f'生成属性失败: {str(e)}'}), 500
        
        # 如果没有属性，返回错误
        if not attribute_json:
            return jsonify({'code': 400, 'message': '必须提供属性或人物描述'}), 400
        
        # 如果attribute_json是字典，转换为JSON字符串
        if isinstance(attribute_json, dict):
            import json
            attribute_json = json.dumps(attribute_json, ensure_ascii=False)
        
        # 创建模型
        from core import model_db
        db = model_db.new_instance()
        success, result = db.create_model(name, description, attribute_json,
                                          creator_username, is_global,
                                          model3d_url, idle_model_url, talking_model_url, wave_model_url)
        
        if success:
            model_id = result
            model_name = name
            moved_urls = {}
            try:
                if model3d_url:
                    moved_urls['model3d_url'] = _move_model_asset_to_model_dir(model_id, model3d_url, 'source', model_name=model_name)
                if idle_model_url:
                    moved_urls['idle_model_url'] = _move_model_asset_to_model_dir(model_id, idle_model_url, 'idle', model_name=model_name)
                if talking_model_url:
                    moved_urls['talking_model_url'] = _move_model_asset_to_model_dir(model_id, talking_model_url, 'talking', model_name=model_name)
                if wave_model_url:
                    moved_urls['wave_model_url'] = _move_model_asset_to_model_dir(model_id, wave_model_url, 'wave', model_name=model_name)
                if moved_urls:
                    db.update_model(model_id, **moved_urls)
            except Exception as move_exc:
                util.log(1, f"[模型API] 创建后归档模型文件失败: {move_exc}")

            model_info = db.get_model_by_id(model_id)
            
            # 创建模型成功后，自动启动数字人服务（如果未运行）
            util.log(1, f"[模型API] 模型创建成功，检查并启动数字人服务...")
            start_success, start_message, start_details = ensure_fay_service_running(timeout=10)
            if start_success:
                util.log(1, f"[模型API] {start_message}")
            else:
                util.log(1, f"[模型API] 自动启动服务失败: {start_message}，但模型创建成功")
            
            return jsonify({
                'code': 200,
                'message': '创建成功',
                'data': {
                    'model_id': result,
                    'model_urls': moved_urls,
                    'name': model_info['name'],
                    'description': model_info['description'],
                    'is_global': model_info['is_global'],
                    'service_started': start_success,
                    'service_message': start_message,
                    'service_details': start_details
                }
            }), 200
        else:
            return jsonify({'code': 500, 'message': result}), 500
            
    except Exception as e:
        util.log(1, f"[模型API] 创建模型失败: {str(e)}")
        import traceback
        util.log(1, f"[模型API] 错误详情: {traceback.format_exc()}")
        return jsonify({'code': 500, 'message': f'创建模型失败: {str(e)}'}), 500


@__app.route('/api/models/list', methods=['POST'])
def api_models_list():
    """获取模型列表"""
    try:
        data = request.get_json() or {}
        username = data.get('username')
        include_global = data.get('include_global', True)
        
        from core import model_db
        db = model_db.new_instance()
        models = db.get_model_list(username, include_global)
        
        util.log(1, f"[模型API] 查询到 {len(models)} 个模型，username={username}, include_global={include_global}")
        
        # 格式化返回数据
        from datetime import datetime
        result = []
        for model in models:
            try:
                import json
                attributes = json.loads(model['attribute_json']) if isinstance(model['attribute_json'], str) else model['attribute_json']
            except Exception as e:
                util.log(1, f"[模型API] 解析属性JSON失败: {e}")
                attributes = {}
            
            # 格式化时间戳为可读的时间字符串
            created_at_timestamp = model.get('created_at', 0)
            updated_at_timestamp = model.get('updated_at', 0)
            created_at_str = ''
            updated_at_str = ''
            
            if created_at_timestamp:
                try:
                    created_at_str = datetime.fromtimestamp(created_at_timestamp).strftime('%Y-%m-%d %H:%M:%S')
                except:
                    created_at_str = ''
            
            if updated_at_timestamp:
                try:
                    updated_at_str = datetime.fromtimestamp(updated_at_timestamp).strftime('%Y-%m-%d %H:%M:%S')
                except:
                    updated_at_str = ''
            
            result.append(_append_generated_action_fields({
                'model_id': model['model_id'],
                'name': model['name'],
                'description': model['description'],
                'attributes': attributes,
                'creator_username': model['creator_username'],
                'is_global': model['is_global'],
                'created_at': model['created_at'],  # 保留时间戳
                'created_at_str': created_at_str,  # 添加格式化后的时间字符串
                'updated_at': model['updated_at'],  # 保留时间戳
                'updated_at_str': updated_at_str,  # 添加格式化后的时间字符串
                'is_active': model.get('is_active', True),
                'model3d_url': model.get('model3d_url'),
                'idle_model_url': model.get('idle_model_url'),
                'talking_model_url': model.get('talking_model_url'),
                'wave_model_url': model.get('wave_model_url')
            }))
        
        util.log(1, f"[模型API] 返回 {len(result)} 个模型")
        return jsonify({
            'code': 200,
            'message': '获取成功',
            'data': result
        }), 200
        
    except Exception as e:
        util.log(1, f"[模型API] 获取模型列表失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'获取模型列表失败: {str(e)}'}), 500


@__app.route('/api/models/detail', methods=['POST'])
def api_models_detail():
    """获取模型详情"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        model_id = data.get('model_id')
        if not model_id:
            return jsonify({'code': 400, 'message': '模型ID不能为空'}), 400
        
        from core import model_db
        db = model_db.new_instance()
        model = db.get_model_by_id(model_id)
        
        if not model:
            return jsonify({'code': 404, 'message': '模型不存在'}), 404
        
        # 解析属性JSON
        try:
            import json
            attributes = json.loads(model['attribute_json']) if isinstance(model['attribute_json'], str) else model['attribute_json']
        except:
            attributes = {}
        
        # 格式化时间戳为可读的时间字符串
        from datetime import datetime
        created_at_timestamp = model.get('created_at', 0)
        updated_at_timestamp = model.get('updated_at', 0)
        created_at_str = ''
        updated_at_str = ''
        
        if created_at_timestamp:
            try:
                created_at_str = datetime.fromtimestamp(created_at_timestamp).strftime('%Y-%m-%d %H:%M:%S')
            except:
                created_at_str = ''
        
        if updated_at_timestamp:
            try:
                updated_at_str = datetime.fromtimestamp(updated_at_timestamp).strftime('%Y-%m-%d %H:%M:%S')
            except:
                updated_at_str = ''
        
        return jsonify({
            'code': 200,
            'message': '获取成功',
            'data': _append_generated_action_fields({
                'model_id': model['model_id'],
                'name': model['name'],
                'description': model['description'],
                'attributes': attributes,
                'creator_username': model['creator_username'],
                'is_global': model['is_global'],
                'created_at': model.get('created_at', 0),  # 保留时间戳
                'created_at_str': created_at_str,  # 添加格式化后的时间字符串
                'updated_at': model.get('updated_at', 0),  # 保留时间戳
                'updated_at_str': updated_at_str,  # 添加格式化后的时间字符串
                'created_at': model['created_at'],
                'updated_at': model['updated_at'],
                'is_active': model['is_active'],
                'model3d_url': model.get('model3d_url'),
                'idle_model_url': model.get('idle_model_url'),
                'talking_model_url': model.get('talking_model_url'),
                'wave_model_url': model.get('wave_model_url')
            })
        }), 200
        
    except Exception as e:
        util.log(1, f"[模型API] 获取模型详情失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'获取模型详情失败: {str(e)}'}), 500


@__app.route('/api/models/auto_rig', methods=['POST'])
def api_models_auto_rig():
    """对已有3D模型执行自动骨骼绑定，并生成带动画的模型文件。

    当前实现：
    - 从 T_Model 中读取指定 model_id 的 model3d_url
    - 读取对应 GLB/FBX 文件内容
    - 调用 Make It Animatable /process 同步接口进行自动绑骨与驱动
    - 将返回的模型二进制保存到项目根目录 models/ 下（与 _get_models_root_dir 一致）
    - 使用保存后的 URL 同时更新 idle_model_url 与 talking_model_url
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400

        model_id = data.get('model_id')
        if not model_id:
            return jsonify({'code': 400, 'message': '模型ID不能为空'}), 400

        animations = data.get('animations')
        if animations is not None and not isinstance(animations, list):
            return jsonify({'code': 400, 'message': 'animations 必须为字符串数组'}), 400

        from core import model_db
        db = model_db.new_instance()
        model_info = db.get_model_by_id(model_id)
        if not model_info:
            return jsonify({'code': 404, 'message': '模型不存在'}), 404

        model3d_url = model_info.get('model3d_url')
        if not model3d_url:
            return jsonify({'code': 400, 'message': '模型未配置 model3d_url，无法自动骨骼绑定'}), 400

        # 解析模型文件路径（与 /api/models/upload-model 保持一致）
        models_dir = _get_models_root_dir()
        os.makedirs(models_dir, exist_ok=True)

        relative_path = _model_url_to_relative_path(model3d_url)
        if not relative_path:
            return jsonify({'code': 400, 'message': f'模型路径非法: {model3d_url}'}), 400

        filename = os.path.basename(relative_path)
        src_path = os.path.join(models_dir, relative_path.replace('/', os.sep))

        if not os.path.exists(src_path):
            return jsonify({'code': 404, 'message': f'源模型文件不存在: {filename}'}), 404

        with open(src_path, 'rb') as f:
            src_bytes = f.read()

        # 调用 Make It Animatable 服务进行自动绑骨（多动画版本）
        from core import make_it_animatable_client
        try:
            # 如果调用方没有显式传 animations，就使用默认的 idle / talking 动画配置
            if not animations:
                animation_folder = _get_default_animation_folder(model_info.get('name'))
                animations = [
                    f"./data/{animation_folder}/idle11111.fbx",  # idle
                    f"./data/{animation_folder}/talk11111.fbx",  # talking
                    f"./data/{animation_folder}/bow11111.fbx",  # greeting
                    f"./data/{animation_folder}/dance11111.fbx",  # dance
                    f"./data/{animation_folder}/dance22222.fbx",  # dance2
                    f"./data/{animation_folder}/dance33333.fbx",  # dance3
                ]
            
            zip_bytes = make_it_animatable_client.process_multi_glb_bytes(
                src_bytes,
                animations=animations
            )
        except Exception as e:
            util.log(1, f"[模型API] 自动骨骼绑定失败: {str(e)}")
            return jsonify({'code': 500, 'message': f'自动骨骼绑定失败: {str(e)}'}), 500

        # 解析 zip，提取前三个模型文件：
        # 第一个 → idle，第二个 → talking，第三个 → wave（招手）
        import io
        import zipfile

        idle_model_url = None
        talking_model_url = None
        wave_model_url = None
        extra_action_model_urls = []

        try:
            with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                # 只考虑常见 3D 模型扩展名
                model_members = [
                    info for info in zf.infolist()
                    if not info.is_dir() and os.path.splitext(info.filename)[1].lower() in {".glb", ".gltf", ".fbx"}
                ]

                if not model_members:
                    raise RuntimeError("zip 中未找到任何模型文件（.glb/.gltf/.fbx）")

                # 确保顺序稳定：按在 zip 中出现的先后顺序
                # 第 1 个 → idle，第 2 个 → talking（如果有），第 3 个 → wave（如果有）
                model_segment, model_output_dir = _ensure_model_dir(model_id, model_info.get('name'))

                _delete_generated_action_variants(model_output_dir)

                def _save_member(member, slot: str) -> str:
                    member_ext = os.path.splitext(member.filename)[1].lower() or ".glb"
                    if member_ext not in {".glb", ".gltf", ".fbx"}:
                        member_ext = ".glb"
                    _delete_slot_variants(model_output_dir, slot)
                    out_name = f"{slot}{member_ext}"
                    out_path = os.path.join(model_output_dir, out_name)
                    with zf.open(member, "r") as src_f, open(out_path, "wb") as dst_f:
                        dst_f.write(src_f.read())
                    return f"/models/{model_segment}/{out_name}"

                # idle
                idle_member = model_members[0]
                idle_model_url = _save_member(idle_member, "idle")

                # talking（如果存在第二个）
                if len(model_members) > 1:
                    talking_member = model_members[1]
                    talking_model_url = _save_member(talking_member, "talking")
                else:
                    talking_model_url = idle_model_url

                # wave（如果存在第三个）
                if len(model_members) > 2:
                    wave_member = model_members[2]
                    wave_model_url = _save_member(wave_member, "wave")

                for member_index, member in enumerate(model_members[3:], start=4):
                    extra_action_model_urls.append(_save_member(member, f"action{member_index}"))

        except Exception as e:
            util.log(1, f"[模型API] 解析 process_multi 返回的 zip 失败: {str(e)}")
            return jsonify({'code': 500, 'message': f'解析自动骨骼绑定结果失败: {str(e)}'}), 500

        util.log(1, f"[模型API] 自动骨骼绑定完成，生成模型: idle={idle_model_url}, talking={talking_model_url}, wave={wave_model_url}, extra={extra_action_model_urls}")

        # 更新 idle_model_url、talking_model_url 和 wave_model_url
        success, message = db.update_model(
            model_id,
            idle_model_url=idle_model_url,
            talking_model_url=talking_model_url,
            wave_model_url=wave_model_url
        )

        if not success:
            util.log(1, f"[模型API] 自动骨骼绑定生成文件成功，但更新数据库失败: {message}")
            return jsonify({'code': 500, 'message': message}), 500

        return jsonify({
            'code': 200,
            'message': '自动骨骼绑定成功',
            'data': {
                'model_id': model_id,
                'model3d_url': model3d_url,
                'idle_model_url': idle_model_url,
                'talking_model_url': talking_model_url,
                'wave_model_url': wave_model_url,
                'extra_action_model_urls': extra_action_model_urls,
                'action_model_urls': [
                    url for url in [
                        idle_model_url,
                        talking_model_url,
                        wave_model_url,
                        *extra_action_model_urls,
                    ] if url
                ]
            }
        }), 200

    except Exception as e:
        util.log(1, f"[模型API] 自动骨骼绑定接口异常: {str(e)}")
        return jsonify({'code': 500, 'message': f'自动骨骼绑定失败: {str(e)}'}), 500


@__app.route('/api/models/upload-model', methods=['POST'])
def api_models_upload_model():
    """上传3D模型文件"""
    try:
        # 检查是否有文件
        if 'file' not in request.files:
            return jsonify({'code': 400, 'message': '未提供文件'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'code': 400, 'message': '文件名不能为空'}), 400
        
        # 验证文件类型
        allowed_extensions = {'.glb', '.gltf', '.fbx'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in allowed_extensions:
            return jsonify({'code': 400, 'message': f'不支持的文件格式，仅支持: {", ".join(allowed_extensions)}'}), 400
        
        # 检查文件大小（限制为100MB）
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        max_size = 100 * 1024 * 1024  # 100MB
        if file_size > max_size:
            return jsonify({'code': 400, 'message': f'文件大小超过限制（最大100MB）'}), 400
        
        model_id = request.form.get('model_id')
        slot = request.form.get('slot')
        model_name = request.form.get('model_name')
        model_url, file_path, filename = _store_upload_file(file, model_id=model_id, slot=slot, model_name=model_name)
        
        util.log(1, f"[模型上传] 文件上传成功: {filename}, 大小: {file_size} bytes")
        
        return jsonify({
            'code': 200,
            'message': '上传成功',
            'data': {
                'model_url': model_url,
                'filename': filename,
                'size': file_size
            }
        }), 200
        
    except Exception as e:
        util.log(1, f"[模型上传] 上传失败: {str(e)}")
        import traceback
        util.log(1, f"[模型上传] 错误详情: {traceback.format_exc()}")
        return jsonify({'code': 500, 'message': f'上传失败: {str(e)}'}), 500


@__app.route('/api/models/update', methods=['POST'])
def api_models_update():
    """更新模型"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        model_id = data.get('model_id')
        if not model_id:
            return jsonify({'code': 400, 'message': '模型ID不能为空'}), 400
        
        name = data.get('name')
        description = data.get('description')
        attribute_json = data.get('attribute_json')
        model3d_url = data.get('model3d_url')  # 获取3D模型URL
        idle_model_url = data.get('idle_model_url')  # 获取待机动画模型URL
        talking_model_url = data.get('talking_model_url')  # 获取说话动画模型URL
        wave_model_url = data.get('wave_model_url')  # 获取招手动画模型URL（可选）
        
        current_model = None
        from core import model_db
        db = model_db.new_instance()
        current_model = db.get_model_by_id(model_id)

        # 如果attribute_json是字典，转换为JSON字符串
        if isinstance(attribute_json, dict):
            import json
            attribute_json = json.dumps(attribute_json, ensure_ascii=False)

        model_name = name or (current_model.get('name') if current_model else None)
        try:
            if model3d_url:
                model3d_url = _move_model_asset_to_model_dir(model_id, model3d_url, 'source', model_name=model_name)
            if idle_model_url:
                idle_model_url = _move_model_asset_to_model_dir(model_id, idle_model_url, 'idle', model_name=model_name)
            if talking_model_url:
                talking_model_url = _move_model_asset_to_model_dir(model_id, talking_model_url, 'talking', model_name=model_name)
            if wave_model_url:
                wave_model_url = _move_model_asset_to_model_dir(model_id, wave_model_url, 'wave', model_name=model_name)
        except Exception as move_exc:
            util.log(1, f"[模型API] 更新前归档模型文件失败: {move_exc}")
            return jsonify({'code': 500, 'message': f'归档模型文件失败: {move_exc}'}), 500

        success, message = db.update_model(model_id, name, description, attribute_json,
                                           model3d_url, idle_model_url, talking_model_url, wave_model_url)
        
        if success:
            return jsonify({'code': 200, 'message': message}), 200
        else:
            return jsonify({'code': 500, 'message': message}), 500
            
    except Exception as e:
        util.log(1, f"[模型API] 更新模型失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'更新模型失败: {str(e)}'}), 500


@__app.route('/api/models/delete', methods=['POST'])
def api_models_delete():
    """删除模型"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        model_id = data.get('model_id')
        if not model_id:
            return jsonify({'code': 400, 'message': '模型ID不能为空'}), 400
        
        from core import model_db
        db = model_db.new_instance()
        success, message, file_urls = db.delete_model(model_id)
        
        if success:
            # 删除模型对应的文件
            models_dir = _get_models_root_dir()
            deleted_files = []
            deleted_dirs = []
            removed_dir_segments = set()

            for dir_segment in _extract_model_dir_segments(file_urls.values()):
                dir_path = os.path.join(models_dir, dir_segment)
                if os.path.isdir(dir_path):
                    try:
                        shutil.rmtree(dir_path)
                        deleted_dirs.append(dir_segment)
                        removed_dir_segments.add(dir_segment)
                        util.log(1, f"[模型删除] 已删除模型目录: {dir_segment}")
                    except Exception as e:
                        util.log(1, f"[模型删除] 删除模型目录失败: {dir_segment}, 错误: {str(e)}")
             
            # 删除model3d_url对应的文件
            if file_urls.get('model3d_url'):
                model_file = extract_filename_from_url(file_urls['model3d_url'])
                if model_file:
                    if '/' in model_file and model_file.split('/', 1)[0] in removed_dir_segments:
                        model_file = None
                if model_file:
                    file_path = os.path.join(models_dir, model_file)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files.append(model_file)
                            util.log(1, f"[模型删除] 已删除文件: {model_file}")
                        except Exception as e:
                            util.log(1, f"[模型删除] 删除文件失败: {model_file}, 错误: {str(e)}")
            
            # 删除idle_model_url对应的文件
            if file_urls.get('idle_model_url'):
                idle_file = extract_filename_from_url(file_urls['idle_model_url'])
                if idle_file:
                    if '/' in idle_file and idle_file.split('/', 1)[0] in removed_dir_segments:
                        idle_file = None
                if idle_file:
                    file_path = os.path.join(models_dir, idle_file)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files.append(idle_file)
                            util.log(1, f"[模型删除] 已删除空闲动画模型文件: {idle_file}")
                        except Exception as e:
                            util.log(1, f"[模型删除] 删除空闲动画模型文件失败: {idle_file}, 错误: {str(e)}")
            
            # 删除talking_model_url对应的文件
            if file_urls.get('talking_model_url'):
                talking_file = extract_filename_from_url(file_urls['talking_model_url'])
                if talking_file:
                    if '/' in talking_file and talking_file.split('/', 1)[0] in removed_dir_segments:
                        talking_file = None
                if talking_file:
                    file_path = os.path.join(models_dir, talking_file)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files.append(talking_file)
                            util.log(1, f"[模型删除] 已删除说话动画模型文件: {talking_file}")
                        except Exception as e:
                            util.log(1, f"[模型删除] 删除说话动画模型文件失败: {talking_file}, 错误: {str(e)}")
            
            if file_urls.get('wave_model_url'):
                wave_file = extract_filename_from_url(file_urls['wave_model_url'])
                if wave_file:
                    if '/' in wave_file and wave_file.split('/', 1)[0] in removed_dir_segments:
                        wave_file = None
                if wave_file:
                    file_path = os.path.join(models_dir, wave_file)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                            deleted_files.append(wave_file)
                            util.log(1, f"[模型删除] 已删除招手动画模型文件: {wave_file}")
                        except Exception as e:
                            util.log(1, f"[模型删除] 删除招手动画模型文件失败: {wave_file}, 错误: {str(e)}")

            if deleted_files or deleted_dirs:
                util.log(1, f"[模型删除] 模型删除成功，已删除 {len(deleted_dirs)} 个目录、{len(deleted_files)} 个文件")
            else:
                util.log(1, f"[模型删除] 模型删除成功，但没有找到需要删除的文件")
             
            return jsonify({'code': 200, 'message': message, 'deleted_files': deleted_files, 'deleted_dirs': deleted_dirs}), 200
        else:
            return jsonify({'code': 500, 'message': message}), 500
            
    except Exception as e:
        util.log(1, f"[模型API] 删除模型失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'删除模型失败: {str(e)}'}), 500


@__app.route('/api/models/clear-history', methods=['POST'])
def api_models_clear_history():
    """清除历史对话（优先按模型，其次按用户）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        model_id = data.get('model_id')
        username = data.get('username', 'User')
        
        # 按模型清理；若未提供模型ID则按用户名清理（用于前端未绑定 model_id 的会话）
        from core import content_db
        db = content_db.new_instance()
        deleted_count = db.clear_model_history(model_id=model_id, username=username)
        
        scope_desc = f"模型 {model_id}" if model_id else f"用户 {username}"
        util.log(1, f"[模型API] 已清除{scope_desc}的 {deleted_count} 条历史对话记录")
        
        return jsonify({
            'code': 200,
            'message': f'已清除 {deleted_count} 条历史对话记录',
            'data': {
                'model_id': model_id,
                'username': username,
                'deleted_count': deleted_count
            }
        }), 200
            
    except Exception as e:
        util.log(1, f"[模型API] 清除模型历史对话失败: {str(e)}")
        import traceback
        util.log(1, f"[模型API] 错误详情: {traceback.format_exc()}")
        return jsonify({'code': 500, 'message': f'清除历史对话失败: {str(e)}'}), 500


def extract_filename_from_url(url):
    """
    从URL中提取文件名
    支持格式: /models/filename.glb, /models/model_xxx.glb, http://host/models/filename.glb
    """
    if not url:
        return None
    
    # 如果是完整URL，提取路径部分
    if url.startswith('http://') or url.startswith('https://'):
        url = '/' + '/'.join(url.split('/')[3:])  # 提取路径部分
    
    # 提取文件名
    if url.startswith('/models/'):
        filename = url.replace('/models/', '', 1)
        return filename.replace('\\', '/')
    elif url.startswith('models/'):
        filename = url.replace('models/', '', 1)
        return filename.replace('\\', '/')
    else:
        # 假设直接是文件名
        return url


@__app.route('/api/models/select', methods=['POST'])
def api_models_select():
    """选择模型"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        username = data.get('username', 'User')
        model_id = data.get('model_id')
        
        if not model_id:
            return jsonify({'code': 400, 'message': '模型ID不能为空'}), 400
        
        # 检查模型是否存在
        from core import model_db
        db = model_db.new_instance()
        if not db.check_model_exists(model_id):
            return jsonify({'code': 404, 'message': '模型不存在'}), 404
        
        # 设置用户当前模型
        from core import member_db
        member_db_instance = member_db.new_instance()
        success, message = member_db_instance.set_current_model(username, model_id)
        
        if success:
            return jsonify({'code': 200, 'message': message}), 200
        else:
            return jsonify({'code': 500, 'message': message}), 500
            
    except Exception as e:
        util.log(1, f"[模型API] 选择模型失败: {str(e)}")
        return jsonify({'code': 500, 'message': f'选择模型失败: {str(e)}'}), 500


@__app.route('/api/models/generate-attributes', methods=['POST'])
def api_models_generate_attributes():
    """
    生成模型属性
    
    此API使用通用LLM，完全独立于数字人服务和当前选中的模型。
    不会受到对话系统的影响。
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'code': 400, 'message': '未提供数据'}), 400
        
        character_description = data.get('character_description', '').strip()
        if not character_description:
            return jsonify({'code': 400, 'message': '人物描述不能为空'}), 400
        
        util.log(1, f"[模型API-生成属性] 开始生成属性，此调用独立于数字人服务")
        util.log(1, f"[模型API-生成属性] 人物描述: {character_description}")
        
        # 使用通用LLM生成属性 - 确保这是完全独立的调用
        # 不涉及任何模型选择或对话路由逻辑
        from llm import llm_service
        attributes = llm_service.generate_character_attributes(character_description)
        
        if attributes:
            util.log(1, f"[模型API-生成属性] 属性生成成功")
            return jsonify({
                'code': 200,
                'message': '生成成功',
                'data': attributes
            }), 200
        else:
            util.log(1, f"[模型API-生成属性] 属性生成失败")
            return jsonify({'code': 500, 'message': '生成属性失败'}), 500
            
    except Exception as e:
        util.log(1, f"[模型API-生成属性] 生成属性失败: {str(e)}")
        import traceback
        util.log(1, f"[模型API-生成属性] 错误详情: {traceback.format_exc()}")
        return jsonify({'code': 500, 'message': f'生成属性失败: {str(e)}'}), 500

# 启动genagents_flask.py的API
@__app.route('/api/start-genagents', methods=['POST'])
def api_start_genagents():
    try:
        # 只有在数字人启动后才能克隆人格
        if not fay_booter.is_running():
            return jsonify({'success': False, 'message': 'Fay未启动，无法启动决策分析'}), 400
        
        # 获取克隆要求
        data = request.get_json()
        if not data or 'instruction' not in data:
            return jsonify({'success': False, 'message': '缺少克隆要求参数'}), 400
        
        instruction = data['instruction']
        
        # 保存指令到临时文件，供genagents_flask.py读取
        instruction_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'genagents', 'instruction.json')
        with open(instruction_file, 'w', encoding='utf-8') as f:
            json.dump({'instruction': instruction}, f, ensure_ascii=False)
        
        # 导入genagents_flask模块
        import sys
        sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
        from genagents.genagents_flask import start_genagents_server, is_shutdown_requested
        from werkzeug.serving import make_server
        
        # 关闭之前的genagents服务器（如果存在）
        global genagents_server, genagents_thread, monitor_thread
        if genagents_server is not None:
            try:
                # 主动关闭之前的服务器
                util.log(1, "关闭之前的决策分析服务...")
                genagents_server.shutdown()
                # 等待线程结束
                if genagents_thread and genagents_thread.is_alive():
                    genagents_thread.join(timeout=2)
                if monitor_thread and monitor_thread.is_alive():
                    monitor_thread.join(timeout=2)
            except Exception as e:
                util.log(1, f"关闭之前的决策分析服务时出错: {str(e)}")
        
        # 清除之前的记忆，确保只保留最新的决策分析
        try:
            from llm.nlp_cognitive_stream import clear_agent_memory
            util.log(1, "已清除之前的决策分析记忆")
        except Exception as e:
            util.log(1, f"清除之前的决策分析记忆时出错: {str(e)}")
        
        # 启动决策分析服务（不启动单独进程，而是返回Flask应用实例）
        genagents_app = start_genagents_server(instruction_text=instruction)
        
        # 创建服务器
        genagents_server = make_server('0.0.0.0', 5001, genagents_app)
        
        # 在后台线程中启动Flask服务
        import threading
        def run_genagents_app():
            try:
                # 使用serve_forever而不是app.run
                genagents_server.serve_forever()
            except Exception as e:
                util.log(1, f"决策分析服务运行出错: {str(e)}")
            finally:
                util.log(1, f"决策分析服务已关闭")
        
        # 启动监控线程，检查是否需要关闭服务器
        def monitor_shutdown():
            try:
                while not is_shutdown_requested():
                    gsleep(1)
                util.log(1, f"检测到关闭请求，正在关闭决策分析服务...")
                genagents_server.shutdown()
            except Exception as e:
                util.log(1, f"监控决策分析服务时出错: {str(e)}")
        
        # 启动服务器线程
        genagents_thread = threading.Thread(target=run_genagents_app)
        genagents_thread.daemon = True
        genagents_thread.start()
        
        # 启动监控线程
        monitor_thread = threading.Thread(target=monitor_shutdown)
        monitor_thread.daemon = True
        monitor_thread.start()
        
        util.log(1, f"已启动决策分析页面，指令: {instruction}")
        
        # 返回决策分析页面的URL
        return jsonify({
            'success': True, 
            'message': '已启动决策分析页面',
            'url': 'http://127.0.0.1:5001/'
        }), 200
    except Exception as e:
        util.log(1, f"启动决策分析页面时出错: {str(e)}")
        return jsonify({'success': False, 'message': f'启动决策分析页面时出错: {str(e)}'}), 500

# Hunyuan3D 转发用的线程池（懒加载）
_hunyuan_http_pool = None


def _get_hunyuan_http_pool():
    """
    gevent + pywsgi 同进程内，若在请求里直接 requests.post 长时间阻塞，会卡住整个事件循环，
    导致同端口上的 /api/direct-llm/chat 等接口无法响应。将阻塞 HTTP 放到 ThreadPool 中执行。
    """
    global _hunyuan_http_pool
    if _hunyuan_http_pool is None:
        from gevent.threadpool import ThreadPool
        _hunyuan_http_pool = ThreadPool(4)
    return _hunyuan_http_pool


def _post_hunyuan_generate_sync(api_url, request_params):
    """在线程中调用，避免阻塞 gevent hub。"""
    return requests.post(
        api_url,
        json=request_params,
        headers={'Content-Type': 'application/json'},
        timeout=600,
    )


# Hunyuan3D-2 API 代理端点
@__app.route('/api/hunyuan3d/generate', methods=['POST'])
def api_hunyuan3d_generate():
    """
    Hunyuan3D-2 模型生成API代理端点
    支持图生3D和文字生3D两种模式
    """
    try:
        # 加载配置
        config_util.load_config()
        hunyuan3d_api_url = config_util.hunyuan3d_api_url or 'http://localhost:8081'
        
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '未提供请求数据'}), 400
        
        # 验证必需参数：必须提供image或text之一
        if not data.get('image') and not data.get('text'):
            return jsonify({'success': False, 'error': '必须提供image（图生3D）或text（文字生3D）参数'}), 400
        
        # 构建请求参数
        request_params = {
            'seed': data.get('seed', 1234),
            'octree_resolution': data.get('octree_resolution', 128),
            'num_inference_steps': data.get('num_inference_steps', 5),
            'guidance_scale': data.get('guidance_scale', 5.0),
            'texture': data.get('texture', False),
            'type': data.get('type', 'glb')
        }
        
        # 添加image或text参数
        if data.get('image'):
            request_params['image'] = data['image']
        if data.get('text'):
            request_params['text'] = data['text']
        if data.get('text_seed'):
            request_params['text_seed'] = data['text_seed']
        if data.get('face_count'):
            request_params['face_count'] = data['face_count']
        
        util.log(1, f"[Hunyuan3D] 开始生成3D模型，模式: {'图生3D' if data.get('image') else '文字生3D'}")
        
        # 调用Hunyuan3D-2 API（必须走线程池，否则阻塞 gevent，首页 LLM 同进程无响应）
        api_url = f"{hunyuan3d_api_url}/generate"
        response = _get_hunyuan_http_pool().apply(_post_hunyuan_generate_sync, (api_url, request_params))
        
        # 检查响应状态
        if response.status_code != 200:
            error_text = response.text
            try:
                error_json = response.json()
                error_msg = error_json.get('text', error_json.get('error', error_text))
            except:
                error_msg = error_text
            util.log(1, f"[Hunyuan3D] API调用失败: {response.status_code} - {error_msg}")
            return jsonify({'success': False, 'error': f'生成失败: {error_msg}'}), response.status_code
        
        # 获取生成的模型文件（二进制数据）
        model_data = response.content
        
        # 与 /api/models/upload-model（无 model_id 时）及 auto_rig 读盘路径一致：写入项目 models 根目录下的 tmp
        # 原先写入 soullink/public/models 会导致库中 URL 为 /models/xxx.glb 但磁盘实际在另一目录，auto_rig 报源文件不存在
        timestamp = int(time.time() * 1000)
        random_str = str(uuid.uuid4())[:8]
        filename = f"model_{timestamp}_{random_str}.glb"
        tmp_dir = os.path.join(_get_models_root_dir(), 'tmp')
        os.makedirs(tmp_dir, exist_ok=True)
        file_path = os.path.join(tmp_dir, filename)
        with open(file_path, 'wb') as f:
            f.write(model_data)

        util.log(1, f"[Hunyuan3D] 模型生成成功，已保存到: {file_path}")

        model_url = _relative_path_to_model_url(f"tmp/{filename}")
        
        # 将文件转换为base64（用于前端直接使用）
        import base64
        blob_base64 = base64.b64encode(model_data).decode('utf-8')
        
        return jsonify({
            'success': True,
            'modelUrl': model_url,
            'blobBase64': blob_base64,
            'filename': filename
        }), 200
        
    except requests.exceptions.Timeout:
        util.log(1, "[Hunyuan3D] API调用超时")
        return jsonify({'success': False, 'error': '生成超时，请稍后重试'}), 504
    except requests.exceptions.ConnectionError:
        util.log(1, "[Hunyuan3D] 无法连接到Hunyuan3D-2 API服务")
        return jsonify({'success': False, 'error': '无法连接到3D生成服务，请检查服务是否启动'}), 503
    except Exception as e:
        util.log(1, f"[Hunyuan3D] 生成过程中出错: {str(e)}")
        return jsonify({'success': False, 'error': f'生成失败: {str(e)}'}), 500

def run():
    class NullLogHandler:
        def write(self, *args, **kwargs):
            pass
    server = pywsgi.WSGIServer(
        ('0.0.0.0', 5002), 
        __app,
        log=NullLogHandler()  
    )
    server.serve_forever()

def start():
    MyThread(target=run).start()
