# -*- coding: utf-8 -*-
"""
模型属性服务模块
用于获取、应用和更新模型的人格属性
"""
import json
from typing import Dict, Any, Optional
from core import model_db
from utils import util


def get_model_attributes(model_id: str) -> Optional[Dict[str, Any]]:
    """
    获取模型属性
    
    参数:
        model_id: 模型ID
        
    返回:
        模型属性字典，如果模型不存在返回None
    """
    db = model_db.new_instance()
    model_info = db.get_model_by_id(model_id)
    
    if model_info is None:
        util.log(1, f"[模型属性] 模型不存在: {model_id}")
        return None
    
    try:
        # 解析属性JSON
        attribute_json = model_info.get('attribute_json', '{}')
        if isinstance(attribute_json, str):
            attributes = json.loads(attribute_json)
        else:
            attributes = attribute_json
        
        util.log(1, f"[模型属性] 成功获取模型属性: {model_id}")
        return attributes
    except json.JSONDecodeError as e:
        util.log(1, f"[模型属性] 解析属性JSON失败: {e}")
        return None
    except Exception as e:
        util.log(1, f"[模型属性] 获取模型属性失败: {e}")
        return None


def apply_model_attributes(agent, model_id: Optional[str] = None, attributes: Optional[Dict[str, Any]] = None):
    """
    将模型属性应用到agent
    
    参数:
        agent: GenerativeAgent对象
        model_id: 模型ID（如果提供，将从数据库加载属性）
        attributes: 属性字典（如果提供，直接使用此属性）
        
    返回:
        是否应用成功
    """
    try:
        # 如果没有提供属性，尝试从数据库加载
        if attributes is None:
            if model_id is None:
                util.log(1, "[模型属性] 未提供模型ID或属性，无法应用")
                return False
            
            attributes = get_model_attributes(model_id)
            if attributes is None:
                util.log(1, f"[模型属性] 无法获取模型属性: {model_id}")
                return False
        
        # 确保agent有scratch属性
        if not hasattr(agent, 'scratch'):
            agent.scratch = {}
        
        # 映射属性字段
        # 从Fay的attribute格式映射到GenerativeAgent的scratch格式
        agent.scratch.update({
            "first_name": attributes.get("name", "Fay"),
            "last_name": "",
            "age": attributes.get("age", "成年"),
            "sex": attributes.get("gender", "女"),
            "additional": attributes.get("additional", "友好、乐于助人"),
            "birthplace": attributes.get("birth", ""),
            "position": attributes.get("position", ""),
            "zodiac": attributes.get("zodiac", ""),
            "constellation": attributes.get("constellation", ""),
            "contact": attributes.get("contact", ""),
            "voice": attributes.get("voice", "zhifeng_emo"),
            "goal": attributes.get("goal", ""),
            "occupation": attributes.get("job", "助手"),
        })
        
        util.log(1, f"[模型属性] 成功应用模型属性到agent")
        return True
        
    except Exception as e:
        util.log(1, f"[模型属性] 应用模型属性失败: {e}")
        import traceback
        util.log(1, f"[模型属性] 错误详情: {traceback.format_exc()}")
        return False


def update_model_attributes(model_id: str, attributes: Dict[str, Any]) -> tuple:
    """
    更新模型属性
    
    参数:
        model_id: 模型ID
        attributes: 新的属性字典
        
    返回:
        (success: bool, message: str)
    """
    try:
        # 将属性字典转换为JSON字符串
        attribute_json = json.dumps(attributes, ensure_ascii=False)
        
        # 更新数据库
        db = model_db.new_instance()
        success, message = db.update_model(model_id, attribute_json=attribute_json)
        
        if success:
            util.log(1, f"[模型属性] 成功更新模型属性: {model_id}")
        else:
            util.log(1, f"[模型属性] 更新模型属性失败: {message}")
        
        return success, message
        
    except Exception as e:
        util.log(1, f"[模型属性] 更新模型属性时出错: {e}")
        return False, f"更新失败: {str(e)}"


def get_model_attribute_for_system_prompt(model_id: Optional[str] = None, 
                                          attributes: Optional[Dict[str, Any]] = None) -> str:
    """
    获取用于构建系统提示词的模型属性描述
    
    参数:
        model_id: 模型ID（如果提供，将从数据库加载属性）
        attributes: 属性字典（如果提供，直接使用此属性）
        
    返回:
        属性描述字符串
    """
    # 如果没有提供属性，尝试从数据库加载
    if attributes is None:
        if model_id:
            attributes = get_model_attributes(model_id)
        else:
            # 如果没有模型ID，返回默认描述
            return "你是一个有用的AI助手。"
    
    if attributes is None:
        return "你是一个有用的AI助手。"
    
    # 构建属性描述
    name = attributes.get("name", "Fay")
    gender = attributes.get("gender", "女")
    age = attributes.get("age", "成年")
    job = attributes.get("job", "助手")
    position = attributes.get("position", "")
    goal = attributes.get("goal", "")
    additional = attributes.get("additional", "友好、乐于助人")
    birth = attributes.get("birth", "")
    hobby = attributes.get("hobby", "")
    
    description_parts = [f"你是{name}，"]
    
    if age:
        description_parts.append(f"年龄{age}，")
    
    if gender:
        description_parts.append(f"性别{gender}，")
    
    if birth:
        description_parts.append(f"来自{birth}，")
    
    if job:
        description_parts.append(f"职业是{job}，")
    
    if position:
        description_parts.append(f"定位是{position}，")
    
    if hobby:
        description_parts.append(f"爱好{hobby}，")
    
    if goal:
        description_parts.append(f"目标是{goal}。")
    
    if additional:
        description_parts.append(f"性格特点：{additional}。")
    
    description = "".join(description_parts)
    
    # 清理多余的逗号
    description = description.replace("，。", "。").replace("，，", "，")
    if description.endswith("，"):
        description = description[:-1] + "。"
    
    return description


def update_all_models_goal(goal_value: str) -> tuple:
    """
    批量将数据库中所有模型的 goal 设为指定值（如「情感陪伴」）。

    参数:
        goal_value: 目标字符串

    返回:
        (成功数: int, 失败数: int, 消息: str)
    """
    db = model_db.new_instance()
    models = db.get_model_list(username=None, include_global=False)
    ok, fail = 0, 0
    for m in models:
        try:
            raw = m.get("attribute_json") or "{}"
            attr = json.loads(raw) if isinstance(raw, str) else raw
            attr["goal"] = goal_value
            new_json = json.dumps(attr, ensure_ascii=False)
            success, _ = db.update_model(m["model_id"], attribute_json=new_json)
            if success:
                ok += 1
            else:
                fail += 1
        except Exception as e:
            util.log(1, f"[模型属性] 更新模型 {m.get('model_id')} goal 失败: {e}")
            fail += 1
    msg = f"已更新 {ok} 个模型的 goal 为「{goal_value}」，失败 {fail} 个"
    util.log(1, f"[模型属性] {msg}")
    return ok, fail, msg

