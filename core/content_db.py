import sqlite3
import time
import threading
import functools
from utils import util

def synchronized(func):
    @functools.wraps(func)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            return func(self, *args, **kwargs)
    return wrapper

__content_tb = None
def new_instance():
    global __content_tb
    if __content_tb is None:
        __content_tb = Content_Db()
        __content_tb.init_db()
    return __content_tb

class Content_Db:

    def __init__(self) -> None:
        self.lock = threading.RLock()

    # 初始化数据库
    def init_db(self):
        conn = sqlite3.connect('memory/fay.db')
        conn.text_factory = str
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS T_Msg
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
            type        CHAR(10),
            way         CHAR(10),
            content     TEXT    NOT NULL,
            createtime  INT,
            username    TEXT DEFAULT 'User',
            uid         INT,
            model_id    TEXT);''')
        
        # 检查并添加 model_id 字段（如果不存在）
        try:
            c.execute('ALTER TABLE T_Msg ADD COLUMN model_id TEXT')
        except sqlite3.OperationalError:
            # 字段已存在，忽略错误
            pass
        
        # 创建索引以提高查询性能
        try:
            c.execute('CREATE INDEX IF NOT EXISTS idx_model_id ON T_Msg(model_id)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_username_model ON T_Msg(username, model_id)')
        except:
            pass
        
        # 对话采纳记录表
        c.execute('''CREATE TABLE IF NOT EXISTS T_Adopted
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_id      INTEGER UNIQUE,
            adopted_time INT,
            FOREIGN KEY(msg_id) REFERENCES T_Msg(id));''')

        # 情绪事件记录表
        c.execute('''CREATE TABLE IF NOT EXISTS T_Emotion
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_id          INTEGER,
            username        TEXT DEFAULT 'User',
            uid             INT,
            model_id        TEXT,
            emotion_label   TEXT,
            emotion_source  TEXT,
            emotion_id      INT,
            createtime      INT,
            FOREIGN KEY(msg_id) REFERENCES T_Msg(id));''')

        # 索引
        try:
            c.execute('CREATE INDEX IF NOT EXISTS idx_emotion_user_time ON T_Emotion(username, createtime)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_emotion_label ON T_Emotion(emotion_label)')
        except:
            pass

        # 小游戏训练记录
        c.execute('''CREATE TABLE IF NOT EXISTS T_GameTraining
            (id INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT DEFAULT 'User',
            game_type       TEXT,
            score           REAL DEFAULT 0,
            time_spent      INT DEFAULT 0,
            level           TEXT,
            createtime      INT);''')

        try:
            c.execute('CREATE INDEX IF NOT EXISTS idx_game_training_user_time ON T_GameTraining(username, createtime)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_game_training_type ON T_GameTraining(game_type)')
        except:
            pass
        conn.commit()
        conn.close()

    # 添加对话
    @synchronized
    def add_content(self, type, way, content, username='User', uid=0, model_id=None):
        """
        添加对话记录
        
        参数:
            type: 消息类型（'member'或'fay'）
            way: 消息方式（'speak'等）
            content: 消息内容
            username: 用户名
            uid: 用户ID
            model_id: 模型ID（可选，用于按模型存储对话记录）
        """
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO T_Msg (type, way, content, createtime, username, uid, model_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (type, way, content, int(time.time()), username, uid, model_id))
            conn.commit()
            last_id = cur.lastrowid
        except Exception as e:
            util.log(1, "请检查参数是否有误: {}".format(e))
            conn.close()
            return 0
        conn.close()
        return last_id

    # 更新对话内容
    @synchronized
    def update_content(self, msg_id, content):
        """
        更新指定ID的消息内容
        :param msg_id: 消息ID
        :param content: 新的内容
        :return: 是否更新成功
        """
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        try:
            cur.execute("UPDATE T_Msg SET content = ? WHERE id = ?", (content, msg_id))
            conn.commit()
            affected_rows = cur.rowcount
        except Exception as e:
            util.log(1, f"更新消息内容失败: {e}")
            conn.close()
            return False
        conn.close()
        return affected_rows > 0

    # 根据ID查询对话记录
    @synchronized
    def get_content_by_id(self, msg_id):
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        cur.execute("SELECT * FROM T_Msg WHERE id = ?", (msg_id,))
        record = cur.fetchone()
        conn.close()
        return record

    # 添加对话采纳记录
    @synchronized
    def adopted_message(self, msg_id):
        conn = sqlite3.connect('memory/fay.db')
        conn.text_factory = str
        cur = conn.cursor()
        # 检查消息ID是否存在
        cur.execute("SELECT 1 FROM T_Msg WHERE id = ?", (msg_id,))
        if cur.fetchone() is None:
            util.log(1, "消息ID不存在")
            conn.close()
            return False
        try:
            cur.execute("INSERT INTO T_Adopted (msg_id, adopted_time) VALUES (?, ?)", (msg_id, int(time.time())))
            conn.commit()
        except sqlite3.IntegrityError:
            util.log(1, "该消息已被采纳")
            conn.close()
            return False
        conn.close()
        return True

    # 获取对话内容
    @synchronized
    def get_list(self, way, order, limit, uid=0, model_id=None):
        """
        获取对话记录列表
        
        参数:
            way: 消息方式（'all', 'notappended'或其他）
            order: 排序方式（'asc'或'desc'）
            limit: 限制数量
            uid: 用户ID
            model_id: 模型ID（可选，用于按模型筛选）
        """
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        where_conditions = []
        params = []
        
        if int(uid) != 0:
            where_conditions.append("T_Msg.uid = ?")
            params.append(uid)
        
        if model_id:
            where_conditions.append("T_Msg.model_id = ?")
            params.append(model_id)
        
        where_clause = " AND ".join(where_conditions) if where_conditions else "1"
        
        base_query = f"""
            SELECT T_Msg.type, T_Msg.way, T_Msg.content, T_Msg.createtime,
                   datetime(T_Msg.createtime, 'unixepoch', 'localtime') AS timetext,
                   T_Msg.username, T_Msg.id,
                   CASE WHEN T_Adopted.msg_id IS NOT NULL THEN 1 ELSE 0 END AS is_adopted
            FROM T_Msg
            LEFT JOIN T_Adopted ON T_Msg.id = T_Adopted.msg_id
            WHERE {where_clause}
        """
        if way == 'all':
            query = base_query + f" ORDER BY T_Msg.id {order} LIMIT ?"
            params.append(limit)
            cur.execute(query, params)
        elif way == 'notappended':
            query = base_query + f" AND T_Msg.way != 'appended' ORDER BY T_Msg.id {order} LIMIT ?"
            params.append(limit)
            cur.execute(query, params)
        else:
            query = base_query + f" AND T_Msg.way = ? ORDER BY T_Msg.id {order} LIMIT ?"
            params.insert(0, way)
            params.append(limit)
            cur.execute(query, params)
        list = cur.fetchall()
        conn.close()
        return list
    

    @synchronized
    def get_recent_messages_by_user(self, username='User', limit=30, model_id=None):
        """
        获取用户最近的对话记录
        
        参数:
            username: 用户名
            limit: 限制数量
            model_id: 模型ID（可选，用于按模型筛选）
        """
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        
        if model_id:
            cur.execute(
                """
                SELECT type, content
                FROM T_Msg
                WHERE username = ? AND model_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (username, model_id, limit),
            )
        else:
            cur.execute(
                """
                SELECT type, content
                FROM T_Msg
                WHERE username = ?
                ORDER BY id DESC
                LIMIT ?
                """,
            (username, limit),
        )
        rows = cur.fetchall()
        conn.close()
        rows.reverse()
        return rows

    @synchronized
    def get_previous_user_message(self, msg_id):
        conn = sqlite3.connect("memory/fay.db")
        cur = conn.cursor()
        cur.execute("""
            SELECT id, type, way, content, createtime, datetime(createtime, 'unixepoch', 'localtime') AS timetext, username
            FROM T_Msg
            WHERE id < ? AND type != 'fay'
            ORDER BY id DESC
            LIMIT 1
        """, (msg_id,))
        record = cur.fetchone()
        conn.close()
        return record

    # 记录情绪事件
    @synchronized
    def add_emotion_event(self, msg_id, username, uid, model_id, emotion_label, emotion_source="text", emotion_id=None):
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO T_Emotion (msg_id, username, uid, model_id, emotion_label, emotion_source, emotion_id, createtime) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (msg_id, username, uid, model_id, emotion_label, emotion_source, emotion_id, int(time.time())),
            )
            conn.commit()
            last_id = cur.lastrowid
        except Exception as e:
            util.log(1, f"记录情绪事件失败: {e}")
            conn.close()
            return 0
        conn.close()
        return last_id

    # 情绪报告汇总
    @synchronized
    def get_emotion_summary(self, username='User', days=7, model_id=None):
        now_ts = int(time.time())
        since_ts = now_ts - int(days) * 86400
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()

        params = [username, since_ts]
        model_clause = ""
        if model_id:
            model_clause = " AND model_id = ?"
            params.append(model_id)

        # 总计
        cur.execute(
            f"""
            SELECT emotion_label, COUNT(*) AS cnt
            FROM T_Emotion
            WHERE username = ? AND createtime >= ? {model_clause}
            GROUP BY emotion_label
            """,
            params,
        )
        totals = cur.fetchall()

        # 每日趋势
        cur.execute(
            f"""
            SELECT date(datetime(createtime, 'unixepoch', 'localtime')) AS day,
                   emotion_label,
                   COUNT(*) AS cnt
            FROM T_Emotion
            WHERE username = ? AND createtime >= ? {model_clause}
            GROUP BY day, emotion_label
            ORDER BY day ASC
            """,
            params,
        )
        daily_rows = cur.fetchall()
        conn.close()

        total_count = sum(row[1] for row in totals) if totals else 0
        by_label = {row[0] or "unknown": int(row[1]) for row in totals}
        percentages = {}
        if total_count > 0:
            for label, cnt in by_label.items():
                percentages[label] = round(cnt / total_count, 4)

        # 组织每日趋势
        trend = {}
        for day, label, cnt in daily_rows:
            if day not in trend:
                trend[day] = {}
            trend[day][label or "unknown"] = int(cnt)

        return {
            "username": username,
            "days": int(days),
            "total": total_count,
            "by_label": by_label,
            "percentages": percentages,
            "daily_trend": trend,
            "since": since_ts,
            "until": now_ts,
        }

    @synchronized
    def add_game_training(self, username='User', game_type='', score=0, time_spent=0, level=None):
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        try:
            cur.execute(
                "INSERT INTO T_GameTraining (username, game_type, score, time_spent, level, createtime) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    username or 'User',
                    str(game_type or '').strip(),
                    float(score or 0),
                    int(time_spent or 0),
                    str(level).strip() if level is not None else None,
                    int(time.time()),
                ),
            )
            conn.commit()
            last_id = cur.lastrowid
        except Exception as e:
            util.log(1, f"记录小游戏训练失败: {e}")
            conn.close()
            return 0
        conn.close()
        return last_id

    @staticmethod
    def _game_display_name(game_type):
        return {
            'wisdom': '智慧问答',
            'emotion': '表情识别',
            'truth-false': '真假判断',
            'sequence': '序列排列',
            'causality': '因果推断',
            'shulte': '舒尔特方格',
            'memory': '位置记忆',
            'simon-says': '西蒙说',
            'color-sorter': '色块归类机',
            'stable-connection': '稳定连线',
        }.get(game_type, game_type or '未知训练')

    @synchronized
    def get_training_summary(self, username='User', days=7):
        now_ts = int(time.time())
        since_ts = now_ts - int(days) * 86400
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()

        cur.execute(
            """
            SELECT game_type,
                   COUNT(*) AS sessions,
                   COALESCE(AVG(score), 0),
                   COALESCE(MAX(score), 0),
                   COALESCE(SUM(time_spent), 0)
            FROM T_GameTraining
            WHERE username = ? AND createtime >= ?
            GROUP BY game_type
            """,
            (username, since_ts),
        )
        game_rows = cur.fetchall()

        cur.execute(
            """
            SELECT COUNT(*),
                   COALESCE(SUM(time_spent), 0),
                   COALESCE(AVG(score), 0),
                   COUNT(DISTINCT date(datetime(createtime, 'unixepoch', 'localtime')))
            FROM T_GameTraining
            WHERE username = ? AND createtime >= ?
            """,
            (username, since_ts),
        )
        total_row = cur.fetchone() or (0, 0, 0, 0)

        cur.execute(
            """
            SELECT strftime('%Y-W%W', datetime(createtime, 'unixepoch', 'localtime')) AS week_key,
                   COUNT(*) AS sessions,
                   COALESCE(SUM(time_spent), 0) AS total_time,
                   COALESCE(AVG(score), 0) AS avg_score
            FROM T_GameTraining
            WHERE username = ? AND createtime >= ?
            GROUP BY week_key
            ORDER BY week_key ASC
            """,
            (username, since_ts),
        )
        weekly_rows = cur.fetchall()

        cur.execute(
            """
            SELECT date(datetime(createtime, 'unixepoch', 'localtime')) AS day
            FROM T_GameTraining
            WHERE username = ?
            GROUP BY day
            ORDER BY day DESC
            """,
            (username,),
        )
        day_rows = cur.fetchall()
        conn.close()

        total_sessions = int(total_row[0] or 0)
        total_time = int(total_row[1] or 0)
        avg_score = float(total_row[2] or 0)
        active_days = int(total_row[3] or 0)

        games_played = {}
        performance_by_game = {}
        for game_type, sessions, avg_game_score, high_score, game_time in game_rows:
            key = game_type or 'unknown'
            games_played[key] = int(sessions or 0)
            performance_by_game[key] = {
                'avg_score': round(float(avg_game_score or 0), 1),
                'high_score': round(float(high_score or 0), 1),
                'sessions': int(sessions or 0),
                'total_time': int(game_time or 0),
            }

        weekly_progress = {}
        for week_key, sessions, week_time, week_score in weekly_rows[-6:]:
            weekly_progress[str(week_key)] = {
                'sessions': int(sessions or 0),
                'total_time': int(week_time or 0),
                'score': round(float(week_score or 0), 1),
            }

        consecutive_days = 0
        if day_rows:
            today = time.strftime('%Y-%m-%d', time.localtime(now_ts))
            expected = today
            for (day_value,) in day_rows:
                if day_value != expected:
                    break
                consecutive_days += 1
                expected_ts = int(time.mktime(time.strptime(expected, '%Y-%m-%d'))) - 86400
                expected = time.strftime('%Y-%m-%d', time.localtime(expected_ts))

        engagement_score = 0
        if total_sessions > 0:
            engagement_score = min(
                100,
                int(
                    min(total_sessions * 6, 45)
                    + min(active_days * 5, 25)
                    + min(total_time / 60, 20)
                    + min(consecutive_days * 2, 10)
                ),
            )

        if total_sessions >= 18 and avg_score >= 85:
            skill_level = 'advanced'
        elif total_sessions >= 8 and avg_score >= 65:
            skill_level = 'intermediate'
        else:
            skill_level = 'beginner'

        ranked_games = sorted(
            performance_by_game.items(),
            key=lambda item: (item[1]['avg_score'], item[1]['sessions']),
            reverse=True,
        )
        weakest_games = sorted(
            performance_by_game.items(),
            key=lambda item: (item[1]['avg_score'], item[1]['sessions']),
        )

        strengths = []
        for game_type, stats in ranked_games[:2]:
            if stats['sessions'] <= 0:
                continue
            strengths.append(
                f"{self._game_display_name(game_type)}表现稳定，平均得分 {stats['avg_score']} 分。"
            )
        if consecutive_days >= 3:
            strengths.append(f"训练连续性不错，已连续训练 {consecutive_days} 天。")
        if not strengths:
            strengths.append("已经开始建立训练习惯，这是一个好的起点。")

        areas_for_improvement = []
        for game_type, stats in weakest_games[:2]:
            if stats['sessions'] <= 0:
                continue
            areas_for_improvement.append(
                f"{self._game_display_name(game_type)}仍有提升空间，当前平均得分 {stats['avg_score']} 分。"
            )
        if total_sessions < 5:
            areas_for_improvement.append("训练次数偏少，建议先建立稳定的练习频率。")
        if not areas_for_improvement:
            areas_for_improvement.append("整体状态比较均衡，可以继续保持。")

        personalized_recommendations = []
        if total_sessions < 5:
            personalized_recommendations.append("先把训练频率稳定下来，每周至少完成 3 次小游戏训练。")
        if 'shulte' in performance_by_game and performance_by_game['shulte']['avg_score'] < 75:
            personalized_recommendations.append("多做舒尔特方格，优先提升专注力和视觉扫描速度。")
        if 'memory' in performance_by_game and performance_by_game['memory']['avg_score'] < 75:
            personalized_recommendations.append("位置记忆训练可以适当增加轮次，帮助巩固短时记忆。")
        if 'emotion' in performance_by_game and performance_by_game['emotion']['sessions'] < 3:
            personalized_recommendations.append("表情识别训练次数偏少，建议补足情绪辨识练习。")
        if not personalized_recommendations:
            personalized_recommendations.append("继续保持当前节奏，并轮换不同类型小游戏，避免训练过于单一。")

        training_goals = []
        if total_sessions < 10:
            training_goals.append("下一阶段先累计完成 10 次训练，形成稳定习惯。")
        if avg_score < 80:
            training_goals.append("将整体平均得分提升到 80 分以上。")
        if consecutive_days < 5:
            training_goals.append("尝试把连续训练天数提升到 5 天以上。")
        if not training_goals:
            training_goals.append("继续保持当前训练质量，逐步冲击更高难度和更高分。")

        return {
            'username': username,
            'days': int(days),
            'total_sessions': total_sessions,
            'total_time': total_time,
            'games_played': games_played,
            'performance_by_game': performance_by_game,
            'weekly_progress': weekly_progress,
            'strengths': strengths,
            'areas_for_improvement': areas_for_improvement,
            'personalized_recommendations': personalized_recommendations,
            'training_goals': training_goals,
            'skill_level': skill_level,
            'engagement_score': engagement_score,
            'since': since_ts,
            'until': now_ts,
        }

    @synchronized
    def get_user_badges(self, username='User'):
        summary = self.get_training_summary(username=username, days=3650)
        total_sessions = int(summary.get('total_sessions') or 0)
        games_played = summary.get('games_played') or {}
        performance = summary.get('performance_by_game') or {}
        engagement_score = int(summary.get('engagement_score') or 0)

        badges = [
            {
                'id': 'first-training',
                'name': '初次训练',
                'description': '完成首次小游戏训练',
                'requirement': '至少完成 1 次训练',
                'earned': total_sessions >= 1,
            },
            {
                'id': 'emotion-observer',
                'name': '情绪观察员',
                'description': '持续进行表情识别训练',
                'requirement': '表情识别累计达到 3 次',
                'earned': int(games_played.get('emotion', 0)) >= 3,
            },
            {
                'id': 'focus-runner',
                'name': '专注冲刺',
                'description': '完成多次专注类训练',
                'requirement': '舒尔特方格或稳定连线累计达到 5 次',
                'earned': int(games_played.get('shulte', 0)) + int(games_played.get('stable-connection', 0)) >= 5,
            },
            {
                'id': 'memory-builder',
                'name': '记忆建造者',
                'description': '在记忆训练中保持稳定表现',
                'requirement': '位置记忆平均分达到 80 分',
                'earned': float((performance.get('memory') or {}).get('avg_score', 0)) >= 80,
            },
            {
                'id': 'training-camp',
                'name': '训练营常驻',
                'description': '保持较高参与度',
                'requirement': '参与度达到 80%',
                'earned': engagement_score >= 80,
            },
        ]

        for badge in badges:
            badge['earned_date'] = '已达成' if badge['earned'] else None
        return badges

    @synchronized
    def get_user_rewards(self, username='User'):
        summary = self.get_training_summary(username=username, days=3650)
        badges = self.get_user_badges(username=username)
        total_points = 0
        for stats in (summary.get('performance_by_game') or {}).values():
            total_points += int(stats.get('avg_score', 0) * max(stats.get('sessions', 0), 1))

        total_points += int(summary.get('total_sessions', 0)) * 5
        engagement_score = int(summary.get('engagement_score') or 0)

        if total_points >= 1200 or engagement_score >= 90:
            level = '高阶训练者'
        elif total_points >= 500 or engagement_score >= 70:
            level = '进阶训练者'
        else:
            level = '游戏训练营'

        day_rows = summary.get('weekly_progress') or {}
        consecutive_days = 0
        if day_rows:
            consecutive_days = min(7, len(day_rows))

        earned_badges_count = len([badge for badge in badges if badge.get('earned')])
        return {
            'points_info': {
                'level': level,
                'total_points': total_points,
                'consecutive_days': consecutive_days,
            },
            'earned_badges_count': earned_badges_count,
            'total_badges_count': len(badges),
        }

    # 清除历史对话
    @synchronized
    def clear_model_history(self, model_id=None, username='User', uid=0):
        """
        清除历史对话记录。

        参数:
            model_id: 模型ID（可选，传入后仅清除该模型）
            username: 用户名（当 model_id 为空时按用户名清理）
            uid: 用户ID（可选，优先级高于 username）
        返回:
            删除的记录数量
        """
        conn = sqlite3.connect("memory/fay.db")
        conn.text_factory = str
        cur = conn.cursor()
        try:
            where_clause = ""
            params = []
            if model_id:
                where_clause = "model_id = ?"
                params = [model_id]
            elif int(uid or 0) != 0:
                where_clause = "uid = ?"
                params = [int(uid)]
            else:
                where_clause = "username = ?"
                params = [username or 'User']

            cur.execute(f"DELETE FROM T_Msg WHERE {where_clause}", params)
            conn.commit()
            deleted_count = cur.rowcount
        except Exception as e:
            util.log(1, f"清除模型历史对话失败: {e}")
            conn.close()
            return 0
        conn.close()
        scope_desc = f"模型 {model_id}" if model_id else (f"uid={uid}" if int(uid or 0) != 0 else f"用户 {username or 'User'}")
        util.log(1, f"已清除{scope_desc}的 {deleted_count} 条历史对话记录")
        return deleted_count
