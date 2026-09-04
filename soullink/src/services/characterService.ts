import { CharacterAttributes } from '../types';
import { getFayApiUrl } from './apiConfig';

// Fay API 地址，使用动态配置（支持运行时修改）
const getFAY_API_URL = (): string => {
  return getFayApiUrl();
};

/**
 * 角色属性服务
 * 基于soullink1的generate_character.py实现
 */
class CharacterService {
  /**
   * 生成角色属性
   * @param description 用户输入的角色描述
   * @param companionId 角色ID（可选，用于向后兼容）
   * @returns 生成的角色属性
   */
  async generateAttributes(description: string, companionId?: string): Promise<CharacterAttributes> {
    try {
      // 优先调用后端生成属性API
      const FAY_API_URL = getFAY_API_URL();
      const response = await fetch(`${FAY_API_URL}/api/models/generate-attributes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          character_description: description,
        }),
      });

      if (!response.ok) {
        throw new Error(`后端API请求失败: ${response.status}`);
      }

      const result = await response.json();
      
      // 检查响应格式
      if (result.code === 200 && result.data) {
        const attributes = result.data as CharacterAttributes;
        
        // 验证属性
        this.validateAttributes(attributes);
        
        // 设置默认voice
        if (!attributes.voice) {
          attributes.voice = 'abin';
        }
        
        return attributes;
      } else {
        throw new Error(result.message || '生成属性失败');
      }
    } catch (error) {
      console.error('调用后端生成属性API失败，尝试备用方案:', error);
      
      // 备用方案：如果后端API失败，使用原来的直接调用LLM的方式
      try {
        return await this.generateAttributesFallback(description);
      } catch (fallbackError) {
        console.error('备用方案也失败:', fallbackError);
        throw new Error(`生成角色属性失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 备用方案：直接调用LLM生成属性（向后兼容）
   * @param description 用户输入的角色描述
   * @returns 生成的角色属性
   */
  private async generateAttributesFallback(description: string): Promise<CharacterAttributes> {
    // 构建生成角色属性的提示词（基于generate_character.py）
    const prompt = `你是一个人物属性生成助手。根据以下人物描述，生成符合Fay数字人项目配置格式的人物属性。

人物描述：
${description}

请根据描述生成以下属性（如果描述中没有明确信息，请根据人物特点合理推断）：
- name: 姓名（必填）
- gender: 性别（男/女，必填）
- age: 年龄（如：成年、18岁、25岁等，必填）
- birth: 出生地（如：北京、上海、Github等，必填）
- zodiac: 生肖（如：鼠、牛、虎、兔、龙、蛇、马、羊、猴、鸡、狗、猪，必填）
- constellation: 星座（如：白羊座、金牛座等，必填）
- job: 职业（如：程序员、教师、医生等，必填）
- hobby: 爱好（如：编程、阅读、运动等，必填）
- contact: 联系方式（如：邮箱、QQ等，可选）
- voice: 声音类型（如：abin、xiaoyun等，可选，如果没有则使用"abin"）
- position: 定位（从以下选项中选择：客服、陪伴、教培、娱乐、销售、助理，必填）
- goal: 目标/使命（如：工作协助、陪伴聊天等，必填）
- additional: 附加信息/性格特点（如：活泼、内向、专业等，必填）

请以JSON格式返回，格式如下：
{
    "name": "姓名",
    "gender": "性别",
    "age": "年龄",
    "birth": "出生地",
    "zodiac": "生肖",
    "constellation": "星座",
    "job": "职业",
    "hobby": "爱好",
    "contact": "联系方式",
    "voice": "声音类型",
    "position": "定位",
    "goal": "目标",
    "additional": "附加信息"
}

只返回JSON，不要包含其他文字说明。`;

    // 调用Fay API
    const FAY_API_URL = getFAY_API_URL();
    const response = await fetch(`${FAY_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'fay',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Fay API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    // 提取JSON（基于generate_character.py的extract_json_from_response）
    const attributes = this.extractJsonFromResponse(responseText);
    
    if (!attributes) {
      throw new Error('无法从LLM响应中提取有效的JSON数据');
    }

    // 验证属性
    this.validateAttributes(attributes);

    // 设置默认voice
    if (!attributes.voice) {
      attributes.voice = 'abin';
    }

    return attributes;
  }

  /**
   * 从LLM响应中提取JSON数据
   * @param response LLM返回的响应文本
   * @returns 解析后的JSON对象
   */
  private extractJsonFromResponse(response: string): CharacterAttributes | null {
    // 尝试直接解析JSON
    try {
      return JSON.parse(response);
    } catch {
      // 继续尝试其他方法
    }

    // 尝试提取代码块中的JSON
    const jsonMatch = response.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // 继续尝试其他方法
      }
    }

    // 尝试提取大括号中的内容
    const bracesMatch = response.match(/\{.*\}/s);
    if (bracesMatch) {
      try {
        return JSON.parse(bracesMatch[0]);
      } catch {
        // 解析失败
      }
    }

    return null;
  }

  /**
   * 验证角色属性
   * @param attributes 角色属性对象
   */
  private validateAttributes(attributes: any): void {
    const requiredFields = ['name', 'gender', 'age', 'birth', 'zodiac', 'constellation', 
                           'job', 'hobby', 'position', 'goal', 'additional'];
    
    const missingFields = requiredFields.filter(field => !attributes[field]);
    if (missingFields.length > 0) {
      throw new Error(`缺少必填字段: ${missingFields.join(', ')}`);
    }

    // 验证性别
    if (!['男', '女'].includes(attributes.gender)) {
      throw new Error(`性别字段无效: ${attributes.gender}，应为'男'或'女'`);
    }

    // 验证定位
    const validPositions = ['客服', '陪伴', '教培', '娱乐', '销售', '助理'];
    if (!validPositions.includes(attributes.position)) {
      throw new Error(`定位字段无效: ${attributes.position}，应为: ${validPositions.join(', ')}`);
    }
  }

  /**
   * 获取角色属性（从localStorage缓存）
   * @param companionId 角色ID
   * @returns 角色属性或null
   */
  getAttributes(companionId: string): CharacterAttributes | null {
    try {
      const stored = localStorage.getItem(`character_attributes_${companionId}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  /**
   * 保存角色属性（到localStorage缓存）
   * @param companionId 角色ID
   * @param attributes 角色属性
   */
  saveAttributes(companionId: string, attributes: CharacterAttributes): void {
    try {
      localStorage.setItem(`character_attributes_${companionId}`, JSON.stringify(attributes));
    } catch (error) {
      console.error('保存角色属性失败:', error);
    }
  }

  /**
   * 删除角色属性
   * @param companionId 角色ID
   */
  deleteAttributes(companionId: string): void {
    try {
      localStorage.removeItem(`character_attributes_${companionId}`);
    } catch (error) {
      console.error('删除角色属性失败:', error);
    }
  }
}

// 导出单例
export const characterService = new CharacterService();