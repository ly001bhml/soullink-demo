# -*- coding: utf-8 -*-
"""
LLM服务模块
区分通用LLM（用于生成属性）和对话LLM（用于对话）
虽然使用相同的LLM配置，但在调用时明确区分用途
"""
from typing import Dict, Any, Optional
from utils import config_util as cfg
from utils import util
from simulation_engine.gpt_structure import gpt_request
from simulation_engine.settings import LLM_VERS


def generate_character_attributes(character_description: str, model: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    使用通用LLM根据人物描述生成人物属性
    
    注意：此函数完全独立于数字人服务，不会受到当前选中模型的影响。
    直接调用底层LLM API，不经过任何对话处理流程。
    
    参数:
        character_description: 用户描述的人物信息
        model: 使用的LLM模型名称，如果为None则使用配置中的默认模型
        
    返回:
        生成的人物属性字典，如果生成失败返回None
    """
    import json
    import re
    import threading
    
    # 保存当前线程ID，用于日志追踪，确保这是独立的通用LLM调用
    thread_id = threading.current_thread().ident
    
    if model is None:
        model = LLM_VERS or cfg.gpt_model_engine or "qwen3.5-122b-a10b"
    
    util.log(1, f"[通用LLM-独立调用] 线程ID: {thread_id}, 使用模型 {model} 生成人物属性")
    util.log(1, f"[通用LLM-独立调用] 人物描述: {character_description}")
    util.log(1, f"[通用LLM-独立调用] 此调用完全独立，不受当前选中模型影响")
    
    # 生成提示词
    prompt = f"""你是一个人物属性生成助手。根据以下人物描述，生成符合Fay数字人项目配置格式的人物属性。

人物描述：
{character_description}

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
- voice: 声音类型（如：zhifeng_emo、abin、xiaoyun等，可选，如果没有则使用"zhifeng_emo"）
- position: 定位（从以下选项中选择：客服、陪伴、教培、娱乐、销售、助理，必填）
- goal: 目标/使命（如：工作协助、陪伴聊天等，必填）
- additional: 附加信息/性格特点（如：活泼、内向、专业等，必填）

请以JSON格式返回，格式如下：
{{
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
}}

只返回JSON，不要包含其他文字说明。"""
    
    # 调用LLM - 确保完全独立，不经过任何数字人处理流程
    try:
        # 直接使用gpt_request，这是底层LLM调用，不会路由到对话系统
        util.log(1, f"[通用LLM-独立调用] 开始调用底层LLM API（线程ID: {thread_id}）")
        response = gpt_request(prompt, model=model, max_tokens=2000)
        util.log(1, f"[通用LLM-独立调用] LLM响应接收成功（线程ID: {thread_id}）")
        util.log(1, f"[通用LLM-独立调用] 响应内容: {response[:200]}..." if len(response) > 200 else f"[通用LLM-独立调用] 响应内容: {response}")
    except Exception as e:
        util.log(1, f"[通用LLM-独立调用] 调用LLM失败（线程ID: {thread_id}）: {e}")
        import traceback
        util.log(1, f"[通用LLM-独立调用] 错误详情: {traceback.format_exc()}")
        return None
    
    # 提取JSON
    attributes = _extract_json_from_response(response)
    if attributes is None:
        util.log(1, f"[通用LLM-独立调用] 无法从LLM响应中提取有效的JSON数据（线程ID: {thread_id}）")
        return None
    
    # 验证属性
    is_valid, error_msg = _validate_character_attributes(attributes)
    if not is_valid:
        util.log(1, f"[通用LLM-独立调用] 属性验证失败（线程ID: {thread_id}）: {error_msg}")
        return None
    
    util.log(1, f"[通用LLM-独立调用] 人物属性生成成功（线程ID: {thread_id}）")
    return attributes


def _extract_json_from_response(response: str) -> Optional[Dict[str, Any]]:
    """
    从LLM响应中提取JSON数据
    
    参数:
        response: LLM返回的响应文本
        
    返回:
        解析后的JSON字典，如果解析失败返回None
    """
    import json
    import re
    
    # 尝试直接解析JSON
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        pass
    
    # 尝试提取代码块中的JSON
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass
    
    # 尝试提取大括号中的内容
    json_match = re.search(r'\{.*\}', response, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    
    return None


def _validate_character_attributes(attributes: Dict[str, Any]) -> tuple:
    """
    验证人物属性是否完整和有效
    
    参数:
        attributes: 人物属性字典
        
    返回:
        (是否有效, 错误信息)
    """
    required_fields = ['name', 'gender', 'age', 'birth', 'zodiac', 'constellation', 
                      'job', 'hobby', 'position', 'goal', 'additional']
    
    missing_fields = [field for field in required_fields if field not in attributes or not attributes[field]]
    if missing_fields:
        return False, f"缺少必填字段: {', '.join(missing_fields)}"
    
    # 验证性别
    if attributes['gender'] not in ['男', '女']:
        return False, f"性别字段无效: {attributes['gender']}，应为'男'或'女'"
    
    # 验证定位
    valid_positions = ['客服', '陪伴', '教培', '娱乐', '销售', '助理']
    if attributes['position'] not in valid_positions:
        return False, f"定位字段无效: {attributes['position']}，应为: {', '.join(valid_positions)}"
    
    return True, ""


def chat_with_model(message: str, username: str, model_id: Optional[str] = None, 
                   system_prompt: Optional[str] = None, history: Optional[list] = None) -> str:
    """
    使用对话LLM进行对话
    
    参数:
        message: 用户消息
        username: 用户名
        model_id: 模型ID（可选，用于日志记录）
        system_prompt: 系统提示词（可选）
        history: 对话历史（可选）
        
    返回:
        LLM生成的回复文本
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI
    
    # 加载配置
    cfg.load_config()
    
    # 使用配置中的LLM设置
    base_url = cfg.gpt_base_url
    api_key = cfg.key_gpt_api_key
    model_name = cfg.gpt_model_engine or 'qwen3.5-122b-a10b'
    
    util.log(1, f"[对话LLM] 用户: {username}, 模型ID: {model_id}, 使用模型: {model_name}")
    
    try:
        # 创建LLM客户端
        llm = ChatOpenAI(
            model=model_name,
            base_url=base_url,
            api_key=api_key,
            streaming=False,
            temperature=0.7,
            max_tokens=512  # 限制回复长度，约100字内；需更长可改为 1024 或 2048
        )
        
        # 构建消息列表
        messages = []
        
        # 添加系统提示词
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        else:
            messages.append(SystemMessage(content="你是一个有用的AI助手，请直接回答用户的问题。"))
        
        # 添加历史消息
        if history:
            for msg in history:
                if isinstance(msg, dict):
                    role = msg.get('role', 'user')
                    content = msg.get('content', '')
                    if role == 'system':
                        messages.append(SystemMessage(content=content))
                    elif role == 'assistant':
                        messages.append(AIMessage(content=content))
                    else:
                        messages.append(HumanMessage(content=content))
                else:
                    messages.append(HumanMessage(content=str(msg)))
        
        # 添加当前用户消息
        messages.append(HumanMessage(content=message))
        
        # 调用LLM
        response = llm.invoke(messages)
        
        # 提取回复文本
        reply = response.content if hasattr(response, 'content') else str(response)
        
        util.log(1, f"[对话LLM] 回复生成成功，长度: {len(reply)}")
        return reply
        
    except Exception as e:
        util.log(1, f"[对话LLM] 调用失败: {str(e)}")
        import traceback
        util.log(1, f"[对话LLM] 错误详情: {traceback.format_exc()}")
        return f"抱歉，我暂时无法回复。错误: {str(e)}"
