# SoulLink Demo

这是一个面向心理陪伴场景的移动端数字人交互项目。项目在原有 SoulLink/Fay 后端基础上，接入了大语言模型回复、前端 3D/动画交互，以及可扩展的角色语音合成接口。

当前 Demo 中包含一个基于 VoxCPM2 的角色音色接入案例：通过参考音频生成指定角色的语音反馈。具体角色可以在配置中替换，项目并不绑定某一个固定角色。

> 说明：本仓库只保留项目展示和二次开发所需的部分代码。真实服务器配置、API Key、模型权重、缓存、日志、音频样本和构建产物均未上传。

## 主要功能

- 移动端数字人交互界面：角色选择、文本输入、流式回复、实时场景面板等。
- 心理陪伴式回复：在后端提示词中加入更温和、共情、非诊断式的对话风格。
- VoxCPM2 音色克隆：后端通过 `tts/voxcpm2_tts.py` 调用独立的 VoxCPM2 TTS 服务，生成指定角色音色的 `.wav` 语音。
- 前后端联动：移动端配置后端地址后，可通过后端接口获取文本回复和语音资源。
- Android 打包支持：前端使用 Capacitor，可同步到 Android 工程进行真机测试。

## 技术栈

- 前端：React、TypeScript、Vite、Three.js、Capacitor
- 后端：Python、Flask、WebSocket、Fay/SoulLink 交互框架
- 大模型：兼容 OpenAI SDK 的 LLM 接口
- 语音合成：VoxCPM2 TTS API
- 可选语音识别：阿里云 ASR / 本地 ASR

## 目录结构

```text
.
├── main.py                         # 后端启动入口
├── core/                           # 对话调度、音频播放、WebSocket 等核心逻辑
├── gui/                            # Flask HTTP API 与后台接口
├── llm/                            # LLM 回复与心理陪伴提示词逻辑
├── tts/
│   └── voxcpm2_tts.py              # VoxCPM2 角色语音克隆适配器
├── asr/                            # 语音识别模块
├── utils/                          # 配置和工具函数
├── simulation_engine/              # 生成式智能体/记忆相关模块
├── soullink/                       # 移动端前端工程
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── android/                    # Capacitor Android 工程
├── system.example.conf             # 后端配置示例，不含真实密钥
└── config.example.json             # 角色与交互配置示例
```

## 启动方式

### 1. 后端

先安装 Python 依赖：

```bash
pip install -r requirements.txt
pip install requests
```

复制示例配置：

```bash
cp system.example.conf system.conf
cp config.example.json config.json
```

按自己的服务器情况修改 `system.conf`：

- `gpt_api_key`：填写自己的大模型 API Key
- `gpt_base_url`：填写兼容 OpenAI SDK 的接口地址
- `gpt_model_engine`：填写使用的模型名
- `tts_module = voxcpm2`
- `fay_url`：填写后端对外访问地址，例如 `http://服务器IP:19500`

启动后端：

```bash
python main.py
```

如果使用 nginx 反向代理，对外端口可配置为 `19500`，移动端后端地址填写：

```text
http://服务器IP:19500
```

### 2. VoxCPM2 语音服务

本项目假设 VoxCPM2 TTS 服务单独运行，并提供以下接口：

```text
GET  /health
POST /v1/audio/speech
```

后端通过环境变量连接 VoxCPM2：

```bash
export VOXCPM2_API_URL=http://127.0.0.1:18890
export VOXCPM2_REFERENCE_AUDIO_PATH=/path/to/role/reference.wav
export VOXCPM2_VOICE_PROMPT="目标角色的声音描述，例如音色、语气、表达风格"
export VOXCPM2_CFG_VALUE=2.0
export VOXCPM2_INFERENCE_TIMESTEPS=10
python main.py
```

如果 VoxCPM2 在另一台服务器上，可以用 SSH tunnel 或内网地址让后端访问到 `VOXCPM2_API_URL`。

### 3. 前端

进入前端目录：

```bash
cd soullink
npm install
npm run dev
```

构建并同步 Android：

```bash
npm run android:build
npx cap open android
```

手机端/模拟器内的后端地址需要填写后端对外地址，例如：

```text
http://211.87.224.136:19500
```

## 安全说明

仓库中没有上传以下内容：

- `system.conf`
- `config.json`
- `.env.local`
- API Key / Secret Key
- SSH key
- 模型权重
- `node_modules`
- `dist` / build 产物
- 日志、缓存、临时音频、生成音频样本

提交真实部署版本前，请务必重新检查：

```bash
git status
git diff --cached
```

## 当前状态

这是课程/毕设展示用的项目代码切片，核心改动集中在：

- `tts/voxcpm2_tts.py`
- `core/fay_core.py`
- `gui/flask_server.py`
- `llm/nlp_cognitive_stream.py`
- `soullink/src/`

项目运行需要自行准备大模型服务、VoxCPM2 模型服务和对应配置文件。
