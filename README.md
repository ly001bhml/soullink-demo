# SoulLink Demo

SoulLink 是一个面向心理疗愈与辅助康复场景的 3D 虚拟陪伴系统。产品希望把心理对话从单轮问答，延伸为可看见、可听见、可记忆的长期陪伴体验。

系统面向青少年、儿童与家庭端使用场景，提供低压力的情绪表达入口。用户可以通过文字或语音与虚拟角色互动，系统结合当前情绪、历史状态和角色设定生成回应，并用对应角色的音色进行语音播报。

> 说明：本仓库只保留项目展示和二次开发所需的部分代码。真实服务器配置、API Key、模型权重、缓存、日志、音频样本和构建产物均未上传。

## 产品定位

SoulLink 不是普通聊天机器人，而是具备角色、情绪和记忆能力的陪伴式疗愈产品。

核心体验目标：

- 可见：用户面对的是可互动的 3D 角色，而不是单纯聊天窗口。
- 可听：系统可以识别语音输入，并用角色音色进行回应。
- 可说：回复内容按心理陪伴方式组织，先承认感受，再温和澄清。
- 可记：长期记录用户状态、证据线索、未确认假设和下一步问题。

产品原则：SoulLink 用于辅助心理陪伴与康复训练，不替代医生诊断、危机干预或专业医疗服务。

## 目标用户与应用场景

### 居家情绪陪伴

用户在课后、睡前或情绪波动时，可以用更低压力的方式表达感受。系统识别当前状态，给出共情回应，并把近期压力、情绪变化和互动线索沉淀到长期记忆中。

示例：

```text
用户：今天作业很多，我有点累，不想说话。
系统：今天确实很辛苦。我们可以先安静待一会儿，等你愿意时再聊一点点。
```

### 康复训练延续

线下训练结束后，家庭端仍然需要持续练习和反馈。SoulLink 可以把训练目标迁移到日常互动中，记录完成度、情绪状态和使用频次，为后续训练调整提供参考。

## 功能总览

- 角色创建：支持文本或图片驱动的 3D 角色生成流程。
- 虚拟陪伴：3D 角色具备待机、说话、招手等动作状态。
- 语音对话：支持文字输入和语音输入。
- 情绪识别：结合语音、文本和上下文线索识别低落、焦虑、生气、平静等状态。
- 疗愈式回复：按照共情、澄清、轻建议的方式组织回应。
- 角色音色：通过 VoxCPM2 接入角色参考音频，实现角色音色播报。
- 长期建模：将多轮对话沉淀为证据、假设、未知信息和下一问。

## 产品创新

### 3D 建模与虚拟陪伴

3D 角色让心理陪伴从聊天窗口转向具象互动。角色不只负责展示，还承担动作反馈、语音播报和情感连接。卡通化视觉可以降低表达压力，更适合青少年居家陪伴场景。

角色链路包括：

```text
文本/图片描述
T-pose 稳定化
3D 模型生成
自动骨骼绑定
动作状态接入
```

前端通过状态机把点击、待机、语音播报和陪伴状态连接起来，使角色可以在 `wave`、`idle`、`talk` 等状态之间切换。

### 情绪识别与角色音色

同一句话在不同语气下可能代表不同情绪。系统通过语音转写、语气线索、文本语义和上下文信息，输出当前情绪、强度、置信度和后续回复策略。

角色音色部分通过 VoxCPM2 完成文本转语音。系统根据当前角色选择参考音频，让回复文本用对应角色声音播报，增强熟悉感和陪伴感。

### 证据驱动的长期建模

系统避免把单次陈述直接当作人格判断或诊断结论。长期建模模块将信息拆分为不同来源：

- Observed：用户原话和明确行为。
- Inferred：系统推断出的可能状态。
- Measured：量表或外部测量结果。

系统保留证据来源、竞争假设和反证通道，减少过度诊断风险。暂停请求由状态机处理，用户明确表示不想继续分析时，系统会先进行支持性回应，再征求是否恢复刚才的信息目标。

## 技术架构

```text
应用层
角色创建页 / 互动页 / 管理页 / 移动端展示

业务编排层
输入处理 / 对话编排 / 动作状态控制 / 角色资产管理

模型服务层
Hunyuan3D / MIA / SenseVoiceSmall / PsyLLM / VoxCPM2

数据支撑层
角色信息 / 聊天记录 / 情绪记录 / 记忆文件
```

## 技术栈

- 前端：React、TypeScript、Vite、Three.js、Capacitor
- 后端：Python、Flask、WebSocket
- 大模型：兼容 OpenAI SDK 的 LLM 接口
- 语音识别：SenseVoiceSmall / 阿里云 ASR / 本地 ASR
- 语音合成：VoxCPM2 TTS API
- 3D 与动作：GLB/GLTF、自动绑骨、动作状态机

## 目录结构

```text
.
├── main.py                         # 后端启动入口
├── core/                           # 对话调度、音频播放、WebSocket 等核心逻辑
├── gui/                            # Flask HTTP API 与后台接口
├── llm/                            # 疗愈回复、专家层逻辑与长期建模
├── tts/
│   └── voxcpm2_tts.py              # VoxCPM2 角色语音克隆适配器
├── asr/                            # 语音识别模块
├── utils/                          # 配置和工具函数
├── simulation_engine/              # 生成式智能体与记忆相关模块
├── soullink/                       # 移动端前端工程
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── android/                    # Capacitor Android 工程
├── system.example.conf             # 后端配置示例，不含真实密钥
└── config.example.json             # 角色与交互配置示例
```

## 快速启动

### 后端

安装依赖：

```bash
pip install -r requirements.txt
pip install requests
```

复制示例配置：

```bash
cp system.example.conf system.conf
cp config.example.json config.json
```

修改 `system.conf`：

- `gpt_api_key`：大模型 API Key
- `gpt_base_url`：兼容 OpenAI SDK 的接口地址
- `gpt_model_engine`：模型名称
- `tts_module = voxcpm2`
- `fay_url`：后端对外访问地址，例如 `http://服务器IP:19500`

启动后端：

```bash
python main.py
```

### VoxCPM2 语音服务

后端通过环境变量连接 VoxCPM2：

```bash
export VOXCPM2_API_URL=http://127.0.0.1:18890
export VOXCPM2_REFERENCE_AUDIO_PATH=/path/to/role/reference.wav
export VOXCPM2_VOICE_PROMPT="目标角色的声音描述，例如音色、语气、表达风格"
export VOXCPM2_CFG_VALUE=2.0
export VOXCPM2_INFERENCE_TIMESTEPS=10
python main.py
```

VoxCPM2 服务需要提供：

```text
GET  /health
POST /v1/audio/speech
```

### 前端

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

移动端后端地址填写后端对外地址，例如：

```text
http://服务器IP:19500
```

## 安全边界

SoulLink 明确不声称：

- 对话估计等同于正式量表或临床诊断。
- 系统可以替代危机干预或医疗服务。
- 大模型回复已经在真实患者场景中验证疗效。

如果用户出现急性安全风险，系统应进入安全流程，并提示寻求现实中的紧急帮助。

## 仓库说明

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

提交真实部署版本前，请重新检查：

```bash
git status
git diff --cached
```
