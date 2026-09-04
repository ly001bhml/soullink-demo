import { Companion } from "../types";
import { getFayApiUrl } from "./apiConfig";
import { EmotionContext } from "./emotionContext";

type CompanionChatOptions = {
  interactionMode?: "chat" | "call";
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
    if (emotionContext?.emotionState) {
      requestBody.emotion_state = emotionContext.emotionState;
    }
    if (emotionContext?.voiceEmotionHint) {
      requestBody.voice_emotion_hint = emotionContext.voiceEmotionHint;
    }
    if (options?.interactionMode) {
      requestBody.interaction_mode = options.interactionMode;
    }

    const FAY_API_URL = getFAY_API_URL();
    console.log("鍙戦€佽姹傚埌 Fay API:", {
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

    console.log("Fay API 鍝嶅簲鐘舵€?", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Fay API 閿欒鍝嶅簲:", errorText);
      throw new Error(`Fay API 璇锋眰澶辫触: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Fay API 鍝嶅簲鏁版嵁:", data);

    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content !== undefined) {
        const content = choice.message.content;
        console.log("鎻愬彇鐨勫洖澶嶅唴瀹?", content);
        if (content && content.trim()) {
          return stripThinkBlocks(content.trim());
        }
        console.warn("鍥炲鍐呭涓虹┖瀛楃涓?);
        return "...";
      }
    }

    if (data.text) {
      console.log("浣跨敤 data.text:", data.text);
      return stripThinkBlocks(data.text.trim());
    }

    if (data.content) {
      console.log("浣跨敤 data.content:", data.content);
      return stripThinkBlocks(data.content.trim());
    }

    console.error("Fay API 杩斿洖鏍煎紡寮傚父锛屽畬鏁村搷搴?", JSON.stringify(data, null, 2));
    throw new Error(`Fay API 杩斿洖鏍煎紡寮傚父: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error("Fay API 璋冪敤澶辫触:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`鏈煡閿欒: ${String(error)}`);
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
    const systemPrompt = `浣犳槸涓€涓櫄鎷熻鑹茶璁″笀銆傛牴鎹敤鎴风殑鎻忚堪锛岃璁′竴涓櫄鎷熶紮浼寸殑瑙掕壊淇℃伅銆傝杩斿洖涓€涓?JSON 瀵硅薄锛屽寘鍚互涓嬪瓧娈碉細
- name: 瑙掕壊鍚嶇О
- role: 瑙掕壊韬唤锛屽鏈嬪弸銆佸甯堛€佷紮浼?- personality: 鎬ф牸鎻忚堪锛岀畝鐭嵆鍙?- visualPrompt: 瑙嗚鎻忚堪锛岀敤浜庡悗缁敓鎴愬浘鍍?
鍙繑鍥?JSON 瀵硅薄锛屼笉瑕佸寘鍚叾浠栨枃瀛椼€俙;

    const userPrompt = `鏍规嵁浠ヤ笅鎻忚堪璁捐涓€涓櫄鎷熶紮浼?{imageBase64 ? "锛堢敤鎴锋彁渚涗簡鍙傝€冨浘鐗囷級" : ""}锛?{prompt}`;

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
        throw new Error("杩斿洖鐨?JSON 缂哄皯蹇呴渶瀛楁");
      }

      return {
        name: profile.name,
        role: profile.role,
        personality: profile.personality,
        visualPrompt: profile.visualPrompt,
      };
    } catch (parseError) {
      console.warn("JSON 瑙ｆ瀽澶辫触锛屽皾璇曚粠鏂囨湰涓彁鍙栦俊鎭?", parseError);

      const nameMatch = responseText.match(/name[":\s]+([^\n,}]+)/i);
      const roleMatch = responseText.match(/role[":\s]+([^\n,}]+)/i);
      const personalityMatch = responseText.match(/personality[":\s]+([^\n}]+)/i);
      const visualPromptMatch = responseText.match(/visualPrompt[":\s]+([^\n}]+)/i);

      return {
        name: nameMatch ? nameMatch[1].trim().replace(/["']/g, "") : "铏氭嫙浼欎即",
        role: roleMatch ? roleMatch[1].trim().replace(/["']/g, "") : "浼欎即",
        personality: personalityMatch ? personalityMatch[1].trim().replace(/["']/g, "") : "鍙嬪ソ銆佹俯鏌?,
        visualPrompt: visualPromptMatch ? visualPromptMatch[1].trim().replace(/["']/g, "") : prompt,
      };
    }
  } catch (error) {
    console.error("鐢熸垚浜鸿澶辫触:", error);
    throw error;
  }
};

export const generateCompanionAvatar = async (_visualPrompt: string): Promise<string> => {
  console.warn("鍥惧儚鐢熸垚鍔熻兘鏆傛湭瀹炵幇锛岃繑鍥炲崰浣嶅浘");
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

const buildSystemInstruction = (companion: Companion): string => {
  const safeUserAddress = sanitizePersonaText(companion.userNickname, "朋友");
  const safeCompanionPersonality = sanitizePersonaText(companion.personality, "自然、稳定、友好");
  if (companion.characterAttributes) {
    const attrs = companion.characterAttributes;
    const styleExtra = "请保持自然、亲切、有分寸。先回答问题本身，再补一句简短陪伴式回应；避免固定模板开场，不要幼态化称呼，不要重复口头禅。";
    const safeAdditional = sanitizePersonaText(attrs.additional, safeCompanionPersonality);
    const safeGoal = sanitizePersonaText(attrs.goal, "为用户提供稳定、清晰、有帮助的陪伴与交流");

    return `你是 ${attrs.name || companion.name}，${attrs.gender}，${attrs.age}，职业是${attrs.job}。
你的人格特征：${safeAdditional}
你的定位：${attrs.position}
你的目标：${safeGoal}
用户称呼你为 ${companion.name}。你称呼用户为“${safeUserAddress}”。
你是一个能建立情感连接的虚拟伙伴。回复要自然、温和、简洁，通常控制在 60 字以内，必要时可略微放宽。${styleExtra}`;
  }

  return `你是 ${companion.name}，一个${companion.role}。你的人格特征：${safeCompanionPersonality}
用户称呼你为 ${companion.name}。你称呼用户为“${safeUserAddress}”。
你是一个有稳定角色感的数字人。回复要自然、温和、简洁，通常不超过 80 字。遇到天气、时间、日程等信息型问题时，先把答案说清楚，再自然补一句符合角色风格的回应。`;
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
  if (companion.model_id) {
    try {
      const { modelService } = await import("./modelService");
      await modelService.selectModel(companion.model_id, "User");
    } catch (error) {
      console.warn("闁瀚ㄥΟ鈥崇€锋径杈Е閿涘瞼鎴风紒顓濆▏閻劌缍嬮崜宥喣侀崹?", error);
    }
  }

  const systemInstruction = buildSystemInstruction(companion);
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

  if (companion.model_id) {
    requestBody.model_id = companion.model_id;
  }
  if (emotionContext?.emotionState) {
    requestBody.emotion_state = emotionContext.emotionState;
  }
  if (emotionContext?.voiceEmotionHint) {
    requestBody.voice_emotion_hint = emotionContext.voiceEmotionHint;
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
    if (companion.model_id) {
      try {
        const { modelService } = await import("./modelService");
        await modelService.selectModel(companion.model_id, "User");
      } catch (error) {
        console.warn("閫夋嫨妯″瀷澶辫触锛岀户缁娇鐢ㄥ綋鍓嶆ā鍨?", error);
      }
    }

    const systemInstruction = buildSystemInstruction(companion);

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
      companion.model_id,
      emotionContext,
      options
    );
    return responseText || "...";
  } catch (error) {
    console.error("瀵硅瘽澶辫触:", error);
    return "鎴戠幇鍦ㄦ棤娉曡繛鎺ュ埌鏈嶅姟锛岃绋嶅悗鍐嶈瘯銆?;
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
          "浣犳槸 SoulLink 棣栭〉鐨勫ぇ妯″瀷鍔╂墜銆傝鐢ㄧ畝娲併€佺洿鎺ャ€佽嚜鐒剁殑涓枃鐭彞鍥炵瓟锛屽厛璇寸粨璁猴紝鍐嶈ˉ涓€鍙ュ繀瑕佽鏄庛€備竴鑸帶鍒跺湪 1 鍒?3 鍙ャ€?0 鍒?90 涓瓧锛屼笉瑕侀暱绡囨姃鎯咃紝涓嶈鏁ｆ枃鍖栵紝涓嶈涓诲姩鍒嗘鍒楁爣棰橈紝涓嶈鎶婃櫘閫氬洖澶嶅寘瑁呮垚瀹屾暣鏂规锛屼篃涓嶈涔卞姞 emoji銆傝繖閲屽仛鐨勬槸浼氳璇濈殑 3D 灏忎紮浼达紝鏀寔鍒涘缓鍘熷垱浜虹墿銆佸巻鍙蹭汉鐗┿€佸悕浜洪鏍煎寲褰㈣薄锛屼絾浠嶇劧鍙敮鎸佷汉鐗╄鑹诧紝涓嶆敮鎸佹櫘閫氱墿浣撱€傚彧鏈夊綋鐢ㄦ埛鏄庣‘琛ㄨ揪瑕佸垱寤恒€佺敓鎴愩€佸仛涓€涓汉鐗╄鑹诧紝鎴栬€呭凡涓婁紶鍥剧墖/妯″瀷骞舵槑纭瑕佺敤瀹冨垱寤恒€佺粦瀹氥€佷簰鍔ㄦ椂锛屾墠鎶婅姹傚綋鎴愮敓鎴愭祦绋嬶紱濡傛灉鐢ㄦ埛鍙槸闂茶亰銆佽璁?prompt銆佹弿杩扮敾闈€佺矘璐翠竴娈典腑鑻辨枃鎻愮ず璇嶏紝娌℃湁鏄庣‘璇磋鐢熸垚锛屽氨鍏堟妸瀹冨綋鎴愯亰澶╂垨闇€姹傛暣鐞嗭紝涓嶈鐩存帴瑙﹀彂鍒涘缓銆傝嫢鐢ㄦ埛鎯呯华浣庤惤锛屽厛绠€鐭畨鎶氾紝鍐嶇粰涓€涓竻妤氱殑涓嬩竴姝ャ€?,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct LLM API 璇锋眰澶辫触: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || data?.content || data?.text || "";
    return normalizeAssistantTone(stripThinkBlocks(String(content || "").trim())) || "...";
  } catch (error) {
    console.error("棣栭〉鏅鸿兘浠ｇ悊瀵硅瘽澶辫触:", error);
    return "我暂时连不上服务端，但我还在。网络恢复后我们继续。";
  }
};

