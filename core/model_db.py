# -*- coding: utf-8 -*-
"""
模型数据库管理模块
用于管理对话模型（角色）的创建、查询、更新和删除
"""
import sqlite3
import time
import threading
import functools
import json
import uuid
from utils import util

def synchronized(func):
    @functools.wraps(func)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            return func(self, *args, **kwargs)
    return wrapper

__model_db = None

def new_instance():
    """获取模型数据库单例实例"""
    global __model_db
    if __model_db is None:
        __model_db = Model_Db()
        __model_db.init_db()
    return __model_db


class Model_Db:
    """模型数据库操作类"""

    def __init__(self) -> None:
        self.lock = threading.Lock()

    def init_db(self):
        """初始化数据库表"""
        conn = sqlite3.connect('memory/user_profiles.db')
        conn.text_factory = str
        c = conn.cursor()
        
        # 创建模型表
        c.execute('''CREATE TABLE IF NOT EXISTS T_Model
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            attribute_json TEXT NOT NULL,
            creator_username TEXT,
            is_global INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            is_active INTEGER DEFAULT 1,
            model3d_url TEXT);''')
        
        # 数据库迁移：为现有表添加model3d_url字段（如果不存在）
        try:
            c.execute('SELECT model3d_url FROM T_Model LIMIT 1')
        except sqlite3.OperationalError:
            # 字段不存在，添加字段
            c.execute('ALTER TABLE T_Model ADD COLUMN model3d_url TEXT')
            util.log(1, "[模型数据库] 已添加model3d_url字段")
        
        # 数据库迁移：为现有表添加idle_model_url字段（如果不存在）
        try:
            c.execute('SELECT idle_model_url FROM T_Model LIMIT 1')
        except sqlite3.OperationalError:
            # 字段不存在，添加字段
            c.execute('ALTER TABLE T_Model ADD COLUMN idle_model_url TEXT')
            util.log(1, "[模型数据库] 已添加idle_model_url字段")
        
        # 数据库迁移：为现有表添加talking_model_url字段（如果不存在）
        try:
            c.execute('SELECT talking_model_url FROM T_Model LIMIT 1')
        except sqlite3.OperationalError:
            # 字段不存在，添加字段
            c.execute('ALTER TABLE T_Model ADD COLUMN talking_model_url TEXT')
            util.log(1, "[模型数据库] 已添加talking_model_url字段")
        
        # 数据库迁移：为现有表添加wave_model_url字段（如果不存在）
        try:
            c.execute('SELECT wave_model_url FROM T_Model LIMIT 1')
        except sqlite3.OperationalError:
            # 字段不存在，添加字段
            c.execute('ALTER TABLE T_Model ADD COLUMN wave_model_url TEXT')
            util.log(1, "[模型数据库] 已添加wave_model_url字段")
        
        # 创建索引
        c.execute('''CREATE INDEX IF NOT EXISTS idx_model_id ON T_Model(model_id)''')
        c.execute('''CREATE INDEX IF NOT EXISTS idx_creator ON T_Model(creator_username)''')
        c.execute('''CREATE INDEX IF NOT EXISTS idx_global ON T_Model(is_global)''')
        
        conn.commit()
        conn.close()

    @synchronized
    def create_model(self, name, description, attribute_json, creator_username=None, is_global=0,
                    model3d_url=None, idle_model_url=None, talking_model_url=None, wave_model_url=None):
        """
        创建新模型
        
        参数:
            name: 模型名称
            description: 模型描述
            attribute_json: 模型属性JSON字符串
            creator_username: 创建者用户名，None表示全局模型
            is_global: 是否为全局模型（0/1）
            model3d_url: 3D模型文件URL（可选）
            idle_model_url: 待机动画模型URL（可选）
            talking_model_url: 说话动画模型URL（可选）
            
        返回:
            (success: bool, model_id: str or error_message: str)
        """
        try:
            # 生成唯一模型ID
            model_id = str(uuid.uuid4())
            current_time = int(time.time())
            
            conn = sqlite3.connect('memory/user_profiles.db')
            conn.text_factory = str
            c = conn.cursor()
            
            c.execute('''INSERT INTO T_Model 
                (model_id, name, description, attribute_json, creator_username, is_global, created_at, updated_at, is_active, model3d_url, idle_model_url, talking_model_url, wave_model_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (model_id, name, description, attribute_json, creator_username, is_global,
                 current_time, current_time, 1, model3d_url, idle_model_url, talking_model_url, wave_model_url))
            
            conn.commit()
            conn.close()
            
            util.log(1, f"模型创建成功: {name} (ID: {model_id}, model3d_url: {model3d_url}, idle_model_url: {idle_model_url}, talking_model_url: {talking_model_url}, wave_model_url: {wave_model_url})")
            return True, model_id
        except sqlite3.IntegrityError:
            return False, "模型ID已存在"
        except Exception as e:
            util.log(1, f"创建模型失败: {str(e)}")
            return False, f"创建模型失败: {str(e)}"

    @synchronized
    def get_model_by_id(self, model_id):
        """
        根据模型ID获取模型信息
        
        参数:
            model_id: 模型ID
            
        返回:
            模型信息字典，如果不存在返回None
        """
        conn = sqlite3.connect('memory/user_profiles.db')
        conn.text_factory = str
        c = conn.cursor()
        
        c.execute('''SELECT id, model_id, name, description, attribute_json, 
                    creator_username, is_global, created_at, updated_at, is_active, model3d_url, idle_model_url, talking_model_url, wave_model_url
                    FROM T_Model WHERE model_id = ?''', (model_id,))
        
        row = c.fetchone()
        conn.close()
        
        if row is None:
            return None
        
        return {
            'id': row[0],
            'model_id': row[1],
            'name': row[2],
            'description': row[3],
            'attribute_json': row[4],
            'creator_username': row[5],
            'is_global': bool(row[6]),
            'created_at': row[7],
            'updated_at': row[8],
            'is_active': bool(row[9]),
            'model3d_url': row[10] if len(row) > 10 else None,
            'idle_model_url': row[11] if len(row) > 11 else None,
            'talking_model_url': row[12] if len(row) > 12 else None,
            'wave_model_url': row[13] if len(row) > 13 else None
        }

    @synchronized
    def get_model_list(self, username=None, include_global=True):
        """
        获取模型列表
        
        参数:
            username: 用户名，如果提供则返回该用户的私有模型和全局模型
            include_global: 是否包含全局模型
            
        返回:
            模型列表
        """
        conn = sqlite3.connect('memory/user_profiles.db')
        conn.text_factory = str
        c = conn.cursor()
        
        if username:
            # 返回用户的私有模型和全局模型
            # 注意：creator_username可能为NULL，需要使用IS NULL或=判断
            # 同时也要包含creator_username为NULL且is_global=0的模型（兼容旧数据）
            c.execute('''SELECT id, model_id, name, description, attribute_json, 
                        creator_username, is_global, created_at, updated_at, is_active, model3d_url, idle_model_url, talking_model_url, wave_model_url
                        FROM T_Model 
                        WHERE is_active = 1 AND (
                            creator_username = ? OR 
                            is_global = 1 OR 
                            (creator_username IS NULL AND is_global = 0)
                        )
                        ORDER BY is_global DESC, created_at DESC''', (username,))
        elif include_global:
            # 返回全局模型和creator_username为NULL的模型（兼容旧数据）
            c.execute('''SELECT id, model_id, name, description, attribute_json, 
                        creator_username, is_global, created_at, updated_at, is_active, model3d_url, idle_model_url, talking_model_url, wave_model_url
                        FROM T_Model 
                        WHERE is_active = 1 AND (is_global = 1 OR creator_username IS NULL)
                        ORDER BY created_at DESC''')
        else:
            # 返回所有模型
            c.execute('''SELECT id, model_id, name, description, attribute_json, 
                        creator_username, is_global, created_at, updated_at, is_active, model3d_url, idle_model_url, talking_model_url, wave_model_url
                        FROM T_Model 
                        WHERE is_active = 1
                        ORDER BY is_global DESC, created_at DESC''')
        
        rows = c.fetchall()
        conn.close()
        
        models = []
        for row in rows:
            models.append({
                'id': row[0],
                'model_id': row[1],
                'name': row[2],
                'description': row[3],
                'attribute_json': row[4],
                'creator_username': row[5],
                'is_global': bool(row[6]),
                'created_at': row[7],
                'updated_at': row[8],
                'is_active': bool(row[9]),
                'model3d_url': row[10] if len(row) > 10 else None,
                'idle_model_url': row[11] if len(row) > 11 else None,
                'talking_model_url': row[12] if len(row) > 12 else None,
                'wave_model_url': row[13] if len(row) > 13 else None
            })
        
        return models

    @synchronized
    def update_model(self, model_id, name=None, description=None, attribute_json=None,
                     model3d_url=None, idle_model_url=None, talking_model_url=None, wave_model_url=None):
        """
        更新模型信息
        
        参数:
            model_id: 模型ID
            name: 新名称（可选）
            description: 新描述（可选）
            attribute_json: 新属性JSON（可选）
            model3d_url: 3D模型文件URL（可选）
            idle_model_url: 待机动画模型URL（可选）
            talking_model_url: 说话动画模型URL（可选）
            
        返回:
            (success: bool, message: str)
        """
        try:
            conn = sqlite3.connect('memory/user_profiles.db')
            conn.text_factory = str
            c = conn.cursor()
            
            # 检查模型是否存在
            c.execute('SELECT id FROM T_Model WHERE model_id = ?', (model_id,))
            if c.fetchone() is None:
                conn.close()
                return False, "模型不存在"
            
            # 构建更新语句
            updates = []
            params = []
            
            if name is not None:
                updates.append("name = ?")
                params.append(name)
            
            if description is not None:
                updates.append("description = ?")
                params.append(description)
            
            if attribute_json is not None:
                updates.append("attribute_json = ?")
                params.append(attribute_json)
            
            if model3d_url is not None:
                updates.append("model3d_url = ?")
                params.append(model3d_url)
            
            if idle_model_url is not None:
                updates.append("idle_model_url = ?")
                params.append(idle_model_url)
            
            if talking_model_url is not None:
                updates.append("talking_model_url = ?")
                params.append(talking_model_url)

            if wave_model_url is not None:
                updates.append("wave_model_url = ?")
                params.append(wave_model_url)
            
            if not updates:
                conn.close()
                return False, "没有需要更新的字段"
            
            updates.append("updated_at = ?")
            params.append(int(time.time()))
            params.append(model_id)
            
            query = f"UPDATE T_Model SET {', '.join(updates)} WHERE model_id = ?"
            c.execute(query, params)
            
            conn.commit()
            conn.close()
            
            util.log(1, f"模型更新成功: {model_id}, model3d_url: {model3d_url}, idle_model_url: {idle_model_url}, talking_model_url: {talking_model_url}, wave_model_url: {wave_model_url}")
            return True, "更新成功"
        except Exception as e:
            util.log(1, f"更新模型失败: {str(e)}")
            return False, f"更新失败: {str(e)}"

    @synchronized
    def delete_model(self, model_id):
        """
        删除模型（软删除，设置is_active=0）
        同时返回模型文件URL，用于删除对应的文件
        
        参数:
            model_id: 模型ID
            
        返回:
            (success: bool, message: str, file_urls: dict) 
            file_urls包含: model3d_url, idle_model_url, talking_model_url
        """
        try:
            conn = sqlite3.connect('memory/user_profiles.db')
            conn.text_factory = str
            c = conn.cursor()
            
            # 先获取模型的文件URL信息
            c.execute('''SELECT model3d_url, idle_model_url, talking_model_url, wave_model_url 
                        FROM T_Model WHERE model_id = ?''', (model_id,))
            row = c.fetchone()
            
            if row is None:
                conn.close()
                return False, "模型不存在", {}
            
            # 保存文件URL信息
            file_urls = {
                'model3d_url': row[0] if len(row) > 0 else None,
                'idle_model_url': row[1] if len(row) > 1 else None,
                'talking_model_url': row[2] if len(row) > 2 else None,
                'wave_model_url': row[3] if len(row) > 3 else None
            }
            
            # 软删除
            c.execute('UPDATE T_Model SET is_active = 0, updated_at = ? WHERE model_id = ?',
                     (int(time.time()), model_id))
            
            conn.commit()
            conn.close()
            
            util.log(1, f"模型删除成功: {model_id}, 文件URL: {file_urls}")
            return True, "删除成功", file_urls
        except Exception as e:
            util.log(1, f"删除模型失败: {str(e)}")
            return False, f"删除失败: {str(e)}", {}

    @synchronized
    def hard_delete_model(self, model_id):
        """
        硬删除模型（从数据库中完全删除）
        
        参数:
            model_id: 模型ID
            
        返回:
            (success: bool, message: str)
        """
        try:
            conn = sqlite3.connect('memory/user_profiles.db')
            conn.text_factory = str
            c = conn.cursor()
            
            # 检查模型是否存在
            c.execute('SELECT id FROM T_Model WHERE model_id = ?', (model_id,))
            if c.fetchone() is None:
                conn.close()
                return False, "模型不存在"
            
            # 硬删除
            c.execute('DELETE FROM T_Model WHERE model_id = ?', (model_id,))
            
            conn.commit()
            conn.close()
            
            util.log(1, f"模型硬删除成功: {model_id}")
            return True, "删除成功"
        except Exception as e:
            util.log(1, f"硬删除模型失败: {str(e)}")
            return False, f"删除失败: {str(e)}"

    @synchronized
    def check_model_exists(self, model_id):
        """
        检查模型是否存在
        
        参数:
            model_id: 模型ID
            
        返回:
            bool
        """
        conn = sqlite3.connect('memory/user_profiles.db')
        conn.text_factory = str
        c = conn.cursor()
        
        c.execute('SELECT 1 FROM T_Model WHERE model_id = ? AND is_active = 1', (model_id,))
        result = c.fetchone() is not None
        conn.close()
        
        return result
