import { Companion } from "../types";
import { getFayApiUrl } from "./apiConfig";

// Fay API 地址，使用动态配置（支持运行时修改）
const getFAY_API_URL = (): string => {
  return getFayApiUrl();
};

/**
 * 调用 Fay API 的通用函数
 * @param messages 消息数组，格式为 OpenAI 兼容格式
 * @param systemInstruction 可选的系统指令
 * @returns Promise<string> 返回模型的回复文本
 */
async function callFayAPI(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string
): Promise<string> {
  try {
    // 如果有系统指令，添加到消息数组开头
    const requestMessages = systemInstruction
      ? [{ role: 'system', content: systemInstruction }, ...messages]
      : messages;

    const requestBody = {
      model: 'fay', // 使用 fay 模型标识
      messages: requestMessages,
      stream: false, // 使用非流式响应
    };

    const FAY_API_URL = getFAY_API_URL();
    const response = await fetch(`${FAY_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fay API 错误响应:', errorText);
      throw new Error(`Fay API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // 检查响应格式
    if (data.choices && Array.isArray(data.choices) && data.choices.length > 0) {
      const choice = data.choices[0];
      if (choice.message && choice.message.content !== undefined) {
        const content = choice.message.content;
        if (content && content.trim()) {
          return content.trim();
        }
      }
    }
    
    // 如果响应格式不符合预期，尝试直接返回文本
    if (data.text) {
      return data.text.trim();
    }
    
    if (data.content) {
      return data.content.trim();
    }
    
    console.error('Fay API 返回格式异常，完整响应:', JSON.stringify(data, null, 2));
    throw new Error(`Fay API 返回格式异常: ${JSON.stringify(data)}`);
  } catch (error) {
    console.error('Fay API 调用失败:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`未知错误: ${String(error)}`);
  }
}

// 1. Generate Companion Personality & Details
export const generateCompanionProfile = async (prompt: string, imageBase64?: string): Promise<Partial<Companion>> => {
  try {
    // 构建生成个人资料的提示词
    const systemPrompt = `你是一个虚拟角色设计师。根据用户的描述${imageBase64 ? '和提供的参考图片' : ''}，设计一个虚拟伙伴的角色信息。
请返回一个 JSON 对象，包含以下字段：
- name: 角色名称（字符串）
- role: 角色身份（字符串，如：朋友、导师、伙伴等）
- personality: 性格描述（字符串，简短描述）
- visualPrompt: 视觉描述（字符串，用于后续生成图像）

只返回 JSON 对象，不要包含其他文字。`;

    const userPrompt = `根据以下描述设计一个虚拟伙伴${imageBase64 ? '（用户提供了参考图片）' : ''}：${prompt}`;

    const messages = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    const responseText = await callFayAPI(messages, systemPrompt);

    // 尝试解析 JSON 响应
    // 如果响应包含代码块，提取 JSON 部分
    let jsonText = responseText.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // 尝试解析 JSON
    try {
      const profile = JSON.parse(jsonText);
      
      // 验证必需字段
      if (!profile.name || !profile.role || !profile.personality || !profile.visualPrompt) {
        throw new Error('返回的 JSON 缺少必需字段');
      }

      return {
        name: profile.name,
        role: profile.role,
        personality: profile.personality,
        visualPrompt: profile.visualPrompt,
      };
    } catch (parseError) {
      // 如果解析失败，尝试从文本中提取信息
      console.warn('JSON 解析失败，尝试从文本中提取信息:', parseError);
      
      // 简单的文本解析作为后备方案
      const nameMatch = responseText.match(/name[":\s]+([^\n,}]+)/i);
      const roleMatch = responseText.match(/role[":\s]+([^\n,}]+)/i);
      const personalityMatch = responseText.match(/personality[":\s]+([^\n}]+)/i);
      const visualPromptMatch = responseText.match(/visualPrompt[":\s]+([^\n}]+)/i);

      return {
        name: nameMatch ? nameMatch[1].trim().replace(/["']/g, '') : '虚拟伙伴',
        role: roleMatch ? roleMatch[1].trim().replace(/["']/g, '') : '伙伴',
        personality: personalityMatch ? personalityMatch[1].trim().replace(/["']/g, '') : '友好、善良',
        visualPrompt: visualPromptMatch ? visualPromptMatch[1].trim().replace(/["']/g, '') : prompt,
      };
    }
  } catch (error) {
    console.error('生成伙伴个人资料失败:', error);
    throw error;
  }
};

// 2. Generate Companion Avatar
export const generateCompanionAvatar = async (visualPrompt: string): Promise<string> => {
  // 目前返回占位符，后续可以集成图像生成 API
  // 例如：调用 Stable Diffusion、DALL-E 或其他图像生成服务
  console.warn('图像生成功能暂未实现，返回占位符');
  return `https://picsum.photos/500/500?grayscale&blur=2`;
};

// 3. Chat with Companion
export const chatWithCompanion = async (
  companion: Companion,
  history: { role: string; parts: { text: string }[] }[],
  userMessage: string
): Promise<string> => {
  try {
    // 构建系统指令，融入角色属性
    let systemInstruction = `你是 ${companion.name}，一个 ${companion.role}。
你的性格特点：${companion.personality}
用户称呼你为 ${companion.name}。你称呼用户为 "${companion.userNickname || '朋友'}"。`;

    // 如果有角色属性，添加更详细的角色设定
    if (companion.characterAttributes) {
      const attrs = companion.characterAttributes;
      systemInstruction += `

详细角色设定：
- 姓名：${attrs.name}
- 性别：${attrs.gender}
- 年龄：${attrs.age}
- 职业：${attrs.job}
- 爱好：${attrs.hobby}
- 性格特点：${attrs.additional}
- 目标使命：${attrs.goal}
- 定位：${attrs.position}`;

      if (attrs.birth) systemInstruction += `\n- 出生地：${attrs.birth}`;
      if (attrs.constellation) systemInstruction += `\n- 星座：${attrs.constellation}`;
    }

    systemInstruction += `

上下文：你是一个能够建立情感连接的虚拟伙伴。
保持回复情感化、支持性，并且简洁（不超过 100 字）。
请根据你的角色设定和性格特点来回应，保持角色一致性。`;

    // 转换历史记录格式
    const messages = history.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.parts[0]?.text || '',
    }));

    // 添加当前用户消息
    messages.push({
      role: 'user',
      content: userMessage,
    });

    const responseText = await callFayAPI(messages, systemInstruction);
    return responseText || "...";
  } catch (error) {
    console.error('对话失败:', error);
    return "我现在无法连接到服务器，请稍后再试。";
  }
};