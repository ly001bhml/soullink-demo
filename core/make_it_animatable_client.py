# -*- coding: utf-8 -*-
"""
Make It Animatable API 客户端封装

职责：
- 从 Fay 加载配置，获取 Make It Animatable 服务地址
- 封装 /process 同步接口调用，将 GLB 模型字节发送给服务端
- 返回处理后的模型二进制数据（GLB/FBX）
"""

import base64
import json
from typing import List, Optional

import requests

from utils import config_util, util


def _get_api_base_url() -> str:
    """
    获取 Make It Animatable 服务的基础 URL。

    优先从 config.json 中读取 `make_it_animatable_api_url`，
    如果没有配置，则回退到默认的 `http://localhost:8080`。

    :return: 服务基础 URL（不包含路径）
    """
    try:
        cfg = config_util.load_config()
        user_cfg = cfg.get("config") or {}
        url = user_cfg.get("make_it_animatable_api_url")
        if isinstance(url, str) and url.strip():
            return url.strip().rstrip("/")
    except Exception as e:
        util.log(2, f"[MakeItAnimatable] 读取配置失败，使用默认地址: {e}")

    # 默认本地服务地址
    return "http://localhost:7860"


def process_glb_bytes(
    glb_bytes: bytes,
    animations: Optional[List[str]] = None,
    reset_to_rest: bool = True,
    no_fingers: bool = False,
    input_normal: bool = False,
    bw_fix: bool = True,
    retarget: bool = True,
    inplace: bool = True,
    timeout: int = 600,
) -> bytes:
    """
    调用 Make It Animatable 同步接口 `/process` 处理 GLB 模型（单动画版本）。
    
    :param glb_bytes: 原始 GLB 文件二进制内容
    :param animations: 可选动画标识列表（当前服务端仅取第一个）
    :param reset_to_rest: 是否重置到 rest pose
    :param no_fingers: 是否忽略手指
    :param input_normal: 是否使用法线信息
    :param bw_fix: 是否进行权重后处理
    :param retarget: 是否重定向动画到角色
    :param inplace: 是否保持循环动画在原位
    :param timeout: 请求超时时间（秒）
    :return: 处理后的模型二进制数据（GLB/FBX）
    :raises RuntimeError: 当服务返回错误或网络异常时抛出
    """
    base_url = _get_api_base_url()
    url = f"{base_url}/process"
    
    payload: dict = {
        "glb_base64": base64.b64encode(glb_bytes).decode("utf-8"),
        "reset_to_rest": reset_to_rest,
        "no_fingers": no_fingers,
        "input_normal": input_normal,
        "bw_fix": bw_fix,
        "retarget": retarget,
        "inplace": inplace,
    }
    
    if animations:
        payload["animations"] = animations
    
    util.log(1, f"[MakeItAnimatable] 调用 /process, url={url}")
    
    try:
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=timeout,
        )
    except Exception as e:
        util.log(1, f"[MakeItAnimatable] 请求失败: {e}")
        raise RuntimeError(f"调用 Make It Animatable 失败: {e}")
    
    if resp.status_code != 200:
        # 尝试解析错误信息
        error_msg = f"HTTP {resp.status_code}"
        try:
            data = resp.json()
            error_msg = data.get("error") or data.get("message") or error_msg
        except Exception:
            pass
        util.log(1, f"[MakeItAnimatable] 服务返回错误: {error_msg}")
        raise RuntimeError(f"Make It Animatable 返回错误: {error_msg}")
    
    # 同步接口直接返回二进制内容（GLB/FBX）
    return resp.content


def process_multi_glb_bytes(
    glb_bytes: bytes,
    animations: List[str],
    reset_to_rest: bool = True,
    retarget: bool = True,
    inplace: bool = True,
    timeout: int = 1200,
) -> bytes:
    """
    调用 Make It Animatable 的 `/process_multi` 接口，返回包含多个结果模型的 zip。
    
    约定：
    - animations 列表的第一个动画视为 idle，对应 zip 中第一个模型文件；
    - 第二个动画视为 talking，对应 zip 中第二个模型文件。
    
    :param glb_bytes: 原始 GLB 文件二进制内容
    :param animations: 动画文件路径列表（服务端会按顺序处理）
    :param reset_to_rest: 是否重置到 rest pose
    :param retarget: 是否重定向动画到角色
    :param inplace: 是否保持循环动画在原位
    :param timeout: 请求超时时间（秒）
    :return: zip 文件的二进制内容
    """
    if not animations:
        raise ValueError("process_multi_glb_bytes 需要至少一个动画路径")
    
    base_url = _get_api_base_url()
    url = f"{base_url}/process_multi"
    
    payload: dict = {
        "glb_base64": base64.b64encode(glb_bytes).decode("utf-8"),
        "animations": animations,
        "reset_to_rest": reset_to_rest,
        "retarget": retarget,
        "inplace": inplace,
    }
    
    util.log(1, f"[MakeItAnimatable] 调用 /process_multi, url={url}, animations={animations}")
    
    try:
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            timeout=timeout,
        )
    except Exception as e:
        util.log(1, f"[MakeItAnimatable] /process_multi 请求失败: {e}")
        raise RuntimeError(f"调用 Make It Animatable /process_multi 失败: {e}")
    
    if resp.status_code != 200:
        error_msg = f"HTTP {resp.status_code}"
        try:
            data = resp.json()
            error_msg = data.get("error") or data.get("message") or error_msg
        except Exception:
            pass
        util.log(1, f"[MakeItAnimatable] /process_multi 服务返回错误: {error_msg}")
        raise RuntimeError(f"Make It Animatable /process_multi 返回错误: {error_msg}")
    
    # 返回 zip 二进制内容
    return resp.content

