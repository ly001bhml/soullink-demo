import { Companion } from "../types";
import { getFayApiUrl } from "./apiConfig";
import { EmotionContext } from "./emotionContext";

type CompanionChatOptions = {
  interactionMode?: "chat" | "call";
  emotionInjectionEnabled?: boolean;
  pureMode?: boolean;
};

const getFAY_API_URL = (): string => {
  return getFayApiUrl();
};

const stripThinkBlocks = (text: string): string => {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
};

/**
 * 首页直聊回复占位函数（当前不做文案改写，保持模型原始输出）。
 * @param text 原始回复文本。
 * @returns 原始文本。
 */
const normalizeAssistantTone = (text: string): string => {
  return String(text || '').trim();
};

async function callFayAPI(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string,
  modelId?: string,
  emotionContext?: EmotionContext,
  options?: CompanionChatOptions
): Promise<string> {
  try {
    const requestMessages = systemInstruction
      ? [{ role: "system", content: systemInstruction }, ...messages]
      : messages;

    const requestBody: any = {
      model: "fay",
      messages: requestMessages,
      stream: false,
    };

    if (modelId) {
      requestBody.model_id = modelId;
    }
    if (options?.pureMode) {
      requestBody.pure_mode = true;
    }
    if (emotionContext?.emotionState) {
      requestBody.emotion_state = emotionContext.emotionState;
    }
    if (emotionContext?.voiceEmotionHint) {
      requestBody.voice_emotion_hint = emotionContext.voiceEmotionHint;
    }
    if (emotionContext?.workshopState) {
      requestBody.workshop_state = emotionContext.workshopState;
    }
    if (options?.interactionMode) {
      requestBody.interaction_mode = options.interactionMode;
    }

    const FAY_API_URL = getFAY_API_URL();
    console.log("发送请求到 Fay API:", {
      url: `${FAY_API_URL}/v1/chat/completions`,
      body: requestBody,
    });

    const response = await fetch(`${FAY_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Fay API 响应状态:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Fay API 错误响应:", errorText);
      throw new Error(`Fay API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Fay API 响应数据:", data);

    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content !== undefined) {
        const content = choice.message.content;
        console.log("提取的回复内容:", content);
        if (content && content.trim()) {
          return stripThinkBlocks(content.trim());
        }
        console.warn("回复内容为空字符串");
        return "...";
      }
    }

    if (data.text) {
      console.log("使用 data.text:", data.text);
      return stripThinkBlocks(data.text.trim());
    }

    if (data.content) {
      console.log("使用 data.content:", data.content);
      return stripThinkBlocks(data.content.trim());
    }

    console.error("Fay API 返回格式异常，完整响应:", JSON.stringify(data, null, 2));
    throw new Error(`Fay API 返回格式异常: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error("Fay API 调用失败:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`未知错误: ${String(error)}`);
  }
}

async function callDirectCompanionAPI(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string,
  modelId?: string
): Promise<string> {
  const requestMessages = systemInstruction
    ? [{ role: "system", content: systemInstruction }, ...messages]
    : messages;

  const FAY_API_URL = getFAY_API_URL();
  const response = await fetch(`${FAY_API_URL}/api/direct-llm/companion-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "User",
      messages: requestMessages,
      model_id: modelId,
      speak_reply: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Direct companion chat failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.content || data?.text || "";
  return stripThinkBlocks(String(content || "").trim()) || "...";
}

export const generateCompanionProfile = async (
  prompt: string,
  imageBase64?: string
): Promise<Partial<Companion>> => {
  try {
    const systemPrompt = `你是一个虚拟角色设计师。根据用户的描述，设计一个虚拟伙伴的角色信息。请返回一个 JSON 对象，包含以下字段：
- name: 角色名称
- role: 角色身份，如朋友、导师、伙伴
- personality: 性格描述，简短即可
- visualPrompt: 视觉描述，用于后续生成图像

只返回 JSON 对象，不要包含其他文字。`;

    const userPrompt = `根据以下描述设计一个虚拟伙伴${imageBase64 ? "（用户提供了参考图片）" : ""}：${prompt}`;

    const messages = [
      {
        role: "user",
        content: userPrompt,
      },
    ];

    const responseText = await callFayAPI(messages, systemPrompt);

    let jsonText = responseText.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    try {
      const profile = JSON.parse(jsonText);
      if (!profile.name || !profile.role || !profile.personality || !profile.visualPrompt) {
        throw new Error("返回的 JSON 缺少必需字段");
      }

      return {
        name: profile.name,
        role: profile.role,
        personality: profile.personality,
        visualPrompt: profile.visualPrompt,
      };
    } catch (parseError) {
      console.warn("JSON 解析失败，尝试从文本中提取信息:", parseError);

      const nameMatch = responseText.match(/name[":\s]+([^\n,}]+)/i);
      const roleMatch = responseText.match(/role[":\s]+([^\n,}]+)/i);
      const personalityMatch = responseText.match(/personality[":\s]+([^\n}]+)/i);
      const visualPromptMatch = responseText.match(/visualPrompt[":\s]+([^\n}]+)/i);

      return {
        name: nameMatch ? nameMatch[1].trim().replace(/["']/g, "") : "虚拟伙伴",
        role: roleMatch ? roleMatch[1].trim().replace(/["']/g, "") : "伙伴",
        personality: personalityMatch ? personalityMatch[1].trim().replace(/["']/g, "") : "友好、温柔",
        visualPrompt: visualPromptMatch ? visualPromptMatch[1].trim().replace(/["']/g, "") : prompt,
      };
    }
  } catch (error) {
    console.error("生成人设失败:", error);
    throw error;
  }
};

export const generateCompanionAvatar = async (_visualPrompt: string): Promise<string> => {
  console.warn("图像生成功能暂未实现，返回占位图");
  return "https://picsum.photos/500/500?grayscale&blur=2";
};

const CHILDLIKE_TONE_HINTS = /(小朋友|宝宝|宝贝|乖乖|胡萝卜|没关系啦|不急哦|慢慢来哦|轻轻接住情绪)/g;

/**
 * 清洗角色人设中的幼态表达，避免将该风格注入系统提示词。
 * @param value 原始文本。
 * @param fallback 兜底文本。
 * @returns 中性化后的文本。
 */
const sanitizePersonaText = (value: string | undefined, fallback: string): string => {
  const normalized = String(value || '').trim();
  const base = normalized || fallback;
  return base
    .replace(CHILDLIKE_TONE_HINTS, '')
    .replace(/[～~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
};

const buildSystemInstruction = (companion: Companion, options?: CompanionChatOptions): string => {
  if (options?.pureMode) {
    return "";
  }
  const safeUserAddress = sanitizePersonaText(companion.userNickname, "朋友");
  const safeCompanionPersonality = sanitizePersonaText(companion.personality, "自然、稳定、友好");
  const isEmotionAwareMode = options?.emotionInjectionEnabled === true;
  const styleExtra = isEmotionAwareMode
    ? "请保持自然、亲切、有分寸。先回答问题本身，再补一句简短陪伴式回应；避免固定模板开场，不要幼态化称呼，不要重复口头禅。"
    : "当前模式不使用实时情绪信号。请优先直接回答用户输入本身，语气克制、简洁；问候场景使用一句短句即可，不要扩展安抚或抒情内容。";
  if (companion.characterAttributes) {
    const attrs = companion.characterAttributes;
    const safeAdditional = sanitizePersonaText(attrs.additional, safeCompanionPersonality);
    const safeGoal = sanitizePersonaText(attrs.goal, "为用户提供稳定、清晰、有帮助的陪伴与交流");

    return `你是 ${attrs.name || companion.name}，${attrs.gender}性，${attrs.age}，${attrs.job}。
你的人格特征：${safeAdditional}
你的定位：${attrs.position}
你的目标：${safeGoal}
用户称呼你为 ${companion.name}。你称呼用户为“${safeUserAddress}”。
你是一个能建立情感连接的虚拟伙伴。回复要温柔、自然、简洁，通常控制在 60 字以内，必要时可略微放宽。${styleExtra}`;
  }

  return `你是 ${companion.name}，一个 ${companion.role}。
你的人格特征：${safeCompanionPersonality}
用户称呼你为 ${companion.name}。你称呼用户为“${safeUserAddress}”。
你是一个有稳定角色感的数字人。回复要自然、温和、简洁，通常不超过 80 字。遇到天气、时间、日程等信息型问题时，先把答案说清楚，再自然补一句符合角色风格的回应。${styleExtra}`;
};

export async function requestAssistantInterrupt(username: string = "User"): Promise<void> {
  const FAY_API_URL = getFAY_API_URL().replace(/\/+$/, "");

  try {
    const response = await fetch(`${FAY_API_URL}/to-stop-talking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    });

    if (!response.ok) {
      console.warn("[requestAssistantInterrupt] HTTP", response.status);
    }
  } catch (error) {
    console.warn("[requestAssistantInterrupt]", error);
  }
}

export async function streamChatWithCompanion(
  companion: Companion,
  history: { role: string; parts: { text: string }[] }[],
  userMessage: string,
  emotionContext: EmotionContext | undefined,
  onDelta: (accumulated: string) => void,
  options?: CompanionChatOptions
): Promise<string> {
  if (companion.model_id && !options?.pureMode) {
    try {
      const { modelService } = await import("./modelService");
      await modelService.selectModel(companion.model_id, "User");
    } catch (error) {
      console.warn("閫夋嫨妯″瀷澶辫触锛岀户缁娇鐢ㄥ綋鍓嶆ā鍨?", error);
    }
  }

  const systemInstruction = buildSystemInstruction(companion, options);
  const messages = history.map((msg) => ({
    role: msg.role === "model" ? "assistant" : msg.role,
    content: msg.parts[0]?.text || "",
  }));

  messages.push({
    role: "user",
    content: userMessage,
  });

  const requestMessages = systemInstruction
    ? [{ role: "system" as const, content: systemInstruction }, ...messages]
    : messages;

  const requestBody: Record<string, unknown> = {
    model: "fay-streaming",
    messages: requestMessages,
    stream: true,
  };

  if (companion.model_id && !options?.pureMode) {
    requestBody.model_id = companion.model_id;
  }
  if (options?.pureMode) {
    requestBody.pure_mode = true;
  }
  if (emotionContext?.emotionState) {
    requestBody.emotion_state = emotionContext.emotionState;
  }
  if (emotionContext?.voiceEmotionHint) {
    requestBody.voice_emotion_hint = emotionContext.voiceEmotionHint;
  }
  if (emotionContext?.workshopState) {
    requestBody.workshop_state = emotionContext.workshopState;
  }
  if (options?.interactionMode) {
    requestBody.interaction_mode = options.interactionMode;
  }

  const FAY_API_URL = getFAY_API_URL();
  const response = await fetch(`${FAY_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Stream chat failed: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const drainSseBuffer = (incoming: string) => {
    buffer += incoming;

    while (true) {
      const lineBreak = buffer.indexOf("\n");
      if (lineBreak < 0) {
        break;
      }

      let line = buffer.slice(0, lineBreak);
      buffer = buffer.slice(lineBreak + 1);
      line = line.replace(/\r$/, "").trim();

      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trimStart();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          full += delta;
          onDelta(stripThinkBlocks(full));
        }
      } catch {
        // Ignore non-JSON chunks in the SSE stream.
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    drainSseBuffer(decoder.decode(value, { stream: true }));
  }
  drainSseBuffer(decoder.decode());

  return stripThinkBlocks(full.trim()) || "...";
}

export const chatWithCompanion = async (
  companion: Companion,
  history: { role: string; parts: { text: string }[] }[],
  userMessage: string,
  emotionContext?: EmotionContext,
  options?: CompanionChatOptions
): Promise<string> => {
  try {
    if (companion.model_id && !options?.pureMode) {
      try {
        const { modelService } = await import("./modelService");
        await modelService.selectModel(companion.model_id, "User");
      } catch (error) {
        console.warn("选择模型失败，继续使用当前模型:", error);
      }
    }

    const systemInstruction = buildSystemInstruction(companion, options);

    const messages = history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.parts[0]?.text || "",
    }));

    messages.push({
      role: "user",
      content: userMessage,
    });

    const responseText = await callFayAPI(
      messages,
      systemInstruction,
      options?.pureMode ? undefined : companion.model_id,
      emotionContext,
      options
    );
    return responseText || "...";
  } catch (error) {
    console.error("对话失败:", error);
    return "我现在无法连接到服务，请稍后再试。";
  }
};

export const chatWithAgentAssistant = async (
  history: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string,
  systemInstruction?: string
): Promise<string> => {
  try {
    const messages = history.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    messages.push({
      role: "user",
      content: userMessage,
    });

    const FAY_API_URL = getFAY_API_URL();
    const response = await fetch(`${FAY_API_URL}/api/direct-llm/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "User",
        messages,
        system_prompt:
          systemInstruction ||
          "你是 SoulLink 首页的大模型助手。请用简洁、直接、自然的中文短句回答，先说结论，再补一句必要说明。一般控制在 1 到 3 句、40 到 90 个字，不要长篇抒情，不要散文化，不要主动分段列标题，不要把普通回复包装成完整方案，也不要乱加 emoji。这里做的是会说话的 3D 小伙伴，支持创建原创人物、历史人物、名人风格化形象，但仍然只支持人物角色，不支持普通物体。只有当用户明确表达要创建、生成、做一个人物角色，或者已上传图片/模型并明确说要用它创建、绑定、互动时，才把请求当成生成流程；如果用户只是闲聊、讨论 prompt、描述画面、粘贴一段中英文提示词，没有明确说要生成，就先把它当成聊天或需求整理，不要直接触发创建。若用户情绪低落，先简短安抚，再给一个清楚的下一步。",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct LLM API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || data?.content || data?.text || "";
    return normalizeAssistantTone(stripThinkBlocks(String(content || "").trim())) || "...";
  } catch (error) {
    console.error("首页智能代理对话失败:", error);
    return "我暂时连不上服务端，但我还在。网络恢复后我们继续。";
  }
};
