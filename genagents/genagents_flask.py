from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import json
import sys
import threading
import time
from utils import util

# 添加项目根目录到sys.path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

# 导入项目中的模块
from llm.nlp_cognitive_stream import save_agent_memory, create_agent, set_memory_cleared_flag

# 创建Flask应用
app = Flask(__name__)

# 全局变量
instruction = ""
genagents_port = 5001
genagents_host = "0.0.0.0"
genagents_debug = True
server_thread = None
shutdown_flag = False
fay_agent = None

# 确保模板和静态文件目录存在
def setup_directories():
    os.makedirs(os.path.join(os.path.dirname(__file__), 'templates'), exist_ok=True)
    os.makedirs(os.path.join(os.path.dirname(__file__), 'static'), exist_ok=True)

# 读取指令文件
def load_instruction():
    global instruction
    instruction_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instruction.json')
    if os.path.exists(instruction_file):
        try:
            with open(instruction_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                instruction = data.get('instruction', '')
            # 读取后删除文件，防止重复使用
            os.remove(instruction_file)
        except Exception as e:
            print(f"读取指令文件出错: {str(e)}")

@app.route('/')
def index():
    """提供主页HTML"""
    return render_template('decision_interview.html', instruction=instruction)

# 关闭服务器的函数
def shutdown_server():
    global shutdown_flag
    shutdown_flag = True
    # 不再直接访问request对象，而是设置标志让服务器自行关闭
    print("服务器将在处理完当前请求后关闭...")

# 清除记忆API
@app.route('/api/clear-memory', methods=['POST'])
def api_clear_memory():
    try:
        # 获取memory目录路径
        memory_dir = os.path.join(os.getcwd(), "memory")
        
        # 检查目录是否存在
        if not os.path.exists(memory_dir):
            return jsonify({'success': False, 'message': '记忆目录不存在'}), 400
        
        # 清空memory目录下的所有文件（保留目录结构）
        for root, dirs, files in os.walk(memory_dir):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        util.log(1, f"已删除文件: {file_path}")
                except Exception as e:
                    util.log(1, f"删除文件时出错: {file_path}, 错误: {str(e)}")
        
        # 删除memory_dir下的所有子目录
        import shutil
        for item in os.listdir(memory_dir):
            item_path = os.path.join(memory_dir, item)
            if os.path.isdir(item_path):
                try:
                    shutil.rmtree(item_path)
                    util.log(1, f"已删除目录: {item_path}")
                except Exception as e:
                    util.log(1, f"删除目录时出错: {item_path}, 错误: {str(e)}")
        
        # 创建一个标记文件，表示记忆已被清除，防止退出时重新保存
        with open(os.path.join(memory_dir, ".memory_cleared"), "w") as f:
            f.write("Memory has been cleared. Do not save on exit.")
        
        # 设置记忆清除标记
        try:
            # 导入并修改nlp_cognitive_stream模块中的保存函数
            from llm.nlp_cognitive_stream import set_memory_cleared_flag, clear_agent_memory
            
            # 设置记忆清除标记
            set_memory_cleared_flag(True)
            
            # 清除内存中已加载的记忆
            clear_agent_memory()
            
            util.log(1, "已同时清除文件存储和内存中的记忆")
        except Exception as e:
            util.log(1, f"清除内存中记忆时出错: {str(e)}")
        
        util.log(1, "记忆已清除，需要重启应用才能生效")
        return jsonify({'success': True, 'message': '记忆已清除，请重启应用使更改生效'}), 200
    except Exception as e:
        util.log(1, f"清除记忆时出错: {str(e)}")
        return jsonify({'success': False, 'message': f'清除记忆时出错: {str(e)}'}), 500

@app.route('/api/submit', methods=['POST'])
def submit_data():
    """处理提交的表单数据并将其添加到Agent的记忆中"""
    try:
        # 接收JSON格式的表单数据
        data = request.json
        
        if not data or 'dimensions' not in data:
            return jsonify({'status': 'error', 'message': '数据格式不正确'}), 400
        
        # 导入需要的函数
        from llm.nlp_cognitive_stream import get_current_time_step, save_agent_memory, create_agent
        
        # 确保Fay的agent已经初始化
        global fay_agent
        if fay_agent is None:
            fay_agent = create_agent()
        
        # 确保embeddings不为None
        if fay_agent.memory_stream.embeddings is None:
            fay_agent.memory_stream.embeddings = {}
        
        # 使用全局函数获取时间步
        time_step = get_current_time_step() + 1
        
        # 处理各维度数据
        for dimension_name, dimension_qa in data['dimensions'].items():
            # 为每个维度创建一个摘要记忆
            dimension_summary = f"决策分析维度: {dimension_name}\n"
            
            for qa_pair in dimension_qa:
                question = qa_pair.get('问题', '')
                answer = qa_pair.get('回答', '')
                dimension_summary += f"问题: {question}\n回答: {answer}\n\n"
            
            # 将维度摘要添加到Agent的记忆中
            fay_agent.remember(dimension_summary, time_step=time_step)
            time_step += 1
        
        # 添加一个总结记忆
        global instruction  # 明确声明使用全局变量
        summary = f"[系统指令] 基于以上决策分析，你的人格已被重新定义。"
        if 'instruction' in globals() and instruction:
            summary += f" 你需要遵循以下指令：{instruction}"
        
        fay_agent.remember(summary, time_step=time_step)
        
        # 保存记忆
        save_agent_memory()
        
        # 设置关闭标志，让服务器在响应后关闭
        global shutdown_flag
        shutdown_flag = True
        
        # 返回响应，添加自动关闭窗口的JavaScript代码
        return jsonify({
            'status': 'success', 
            'message': '决策分析数据已克隆到记忆中，请关闭页面并重启Fay',
            'redirect': 'http://localhost:8080/setting',
            'closeWindow': True  # 添加标志，指示前端关闭窗口
        })
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"处理决策分析数据时出错: {str(e)}\n{error_details}")
        return jsonify({'status': 'error', 'message': f'处理数据时出错: {str(e)}'}), 500

@app.route('/api/auto-generate', methods=['POST'])
def api_auto_generate():
    """
    自动生成所有问题的答案
    
    根据instruction（如"孔子"）调用LLM生成所有9个维度的问题答案
    """
    try:
        # 获取instruction
        data = request.get_json()
        if not data or 'instruction' not in data:
            return jsonify({'success': False, 'message': '缺少instruction参数'}), 400
        
        instruction_text = data.get('instruction', '')
        if not instruction_text:
            return jsonify({'success': False, 'message': 'instruction不能为空'}), 400
        
        # 导入LLM调用模块
        from simulation_engine.gpt_structure import gpt_request
        from simulation_engine.settings import LLM_VERS
        
        model = LLM_VERS or "gpt-4o"
        
        # 构建prompt，包含所有9个维度的问题
        prompt = f"""你是一个人物价值观分析助手。请根据以下人物描述，回答所有关于该人物决策风格和价值观的问题。

人物描述：{instruction_text}

请按照以下9个维度，详细回答每个问题。每个回答应该充分体现该人物的特点、经历和价值观。

## 1. 核心价值观维度
问题1：在你的人生中，最重要的3-5个价值观是什么？
问题2：如果你必须在这些价值观之间做取舍，你会如何排序？
问题3：有什么原则是你认为在任何情况下都不应该违背的？
问题4：分享一个你坚守个人价值观的具体经历，以及这如何影响了当时的决策和结果？

## 2. 风险态度维度
问题1：在投资决策中，你倾向于保守还是激进？为什么？
问题2：面对不确定性较高但回报也高的机会，你通常如何抉择？
问题3：你如何看待'宁可错过机会也不要承担过大风险'这种说法？
问题4：描述一次你冒险（或拒绝冒险）的重要决策，事后你如何评价这个决定？

## 3. 时间偏好维度
问题1：在追求短期利益和长期发展之间，你通常如何平衡？
问题2：你愿意现在牺牲多少，来换取未来更大的收益？
问题3：在规划未来时，你会考虑多长的时间跨度？
问题4：回忆一个你为长远目标放弃短期利益的重要经历，这个决定最终如何影响了你？

## 4. 自主性与集体性维度
问题1：在团队决策中，你更倾向于坚持自己的判断还是顺应多数意见？
问题2：个人利益与集体利益冲突时，你通常如何处理？
问题3：你认为什么情况下应该妥协，什么情况下应该坚持立场？
问题4：分享一次你在团队中坚持己见或选择妥协的经历，结果如何？这教会了你什么？

## 5. 理性与情感维度
问题1：在做重要决策时，你更依赖理性分析还是直觉感受？
问题2：情感因素在你的决策过程中占多大比重？
问题3：回忆一次你的情感判断与理性分析相冲突的经历，你最终如何决定？
问题4：有没有一次决策，你完全依靠直觉而非分析做出，结果令你印象深刻？

## 6. 资源分配维度
问题1：在分配时间、金钱和精力时，你有什么原则或优先级？
问题2：面对多个重要但无法同时满足的需求，你如何决定先满足哪一个？
问题3：你会为了帮助他人而牺牲自己的资源吗？在什么条件下？
问题4：描述一次你必须在多个重要项目或责任之间分配有限资源的经历和你的处理方式？

## 7. 道德伦理维度
问题1：在面临道德两难时，你通常依据什么原则来决定？
问题2：你认为在商业决策中，道德因素应该占多大权重？
问题3：有没有某些行为，即使对你有利，你也坚决不会做？为什么？
问题4：分享一个你面临道德困境的经历，你如何做出抉择，事后有何反思？

## 8. 决策过程维度
问题1：你通常如何收集信息来支持重要决策？
问题2：在时间紧迫的情况下，你会如何简化决策过程？
问题3：当你对某个决定感到后悔时，你会如何调整未来的决策方式？
问题4：回忆一次你做出了错误决策的经历，你从中学到了什么？这如何改变了你后来的决策习惯？

## 9. 成长与变化维度
问题1：你的决策方式在人生不同阶段有什么变化？什么经历促成了这些变化？
问题2：有什么童年或成长经历显著塑造了你现在的决策方式或价值观？
问题3：描述一次彻底改变了你思维方式或价值观的关键经历？
问题4：你认为自己最大的决策失误是什么？它如何影响了你现在的思考方式？

请以JSON格式返回答案，格式如下：
{{
    "dimensions": {{
        "核心价值观维度": [
            {{"问题": "在你的人生中，最重要的3-5个价值观是什么？", "回答": "..."}},
            {{"问题": "如果你必须在这些价值观之间做取舍，你会如何排序？", "回答": "..."}},
            {{"问题": "有什么原则是你认为在任何情况下都不应该违背的？", "回答": "..."}},
            {{"问题": "分享一个你坚守个人价值观的具体经历，以及这如何影响了当时的决策和结果？", "回答": "..."}}
        ],
        "风险态度维度": [
            {{"问题": "在投资决策中，你倾向于保守还是激进？为什么？", "回答": "..."}},
            {{"问题": "面对不确定性较高但回报也高的机会，你通常如何抉择？", "回答": "..."}},
            {{"问题": "你如何看待'宁可错过机会也不要承担过大风险'这种说法？", "回答": "..."}},
            {{"问题": "描述一次你冒险（或拒绝冒险）的重要决策，事后你如何评价这个决定？", "回答": "..."}}
        ],
        "时间偏好维度": [
            {{"问题": "在追求短期利益和长期发展之间，你通常如何平衡？", "回答": "..."}},
            {{"问题": "你愿意现在牺牲多少，来换取未来更大的收益？", "回答": "..."}},
            {{"问题": "在规划未来时，你会考虑多长的时间跨度？", "回答": "..."}},
            {{"问题": "回忆一个你为长远目标放弃短期利益的重要经历，这个决定最终如何影响了你？", "回答": "..."}}
        ],
        "自主性与集体性维度": [
            {{"问题": "在团队决策中，你更倾向于坚持自己的判断还是顺应多数意见？", "回答": "..."}},
            {{"问题": "个人利益与集体利益冲突时，你通常如何处理？", "回答": "..."}},
            {{"问题": "你认为什么情况下应该妥协，什么情况下应该坚持立场？", "回答": "..."}},
            {{"问题": "分享一次你在团队中坚持己见或选择妥协的经历，结果如何？这教会了你什么？", "回答": "..."}}
        ],
        "理性与情感维度": [
            {{"问题": "在做重要决策时，你更依赖理性分析还是直觉感受？", "回答": "..."}},
            {{"问题": "情感因素在你的决策过程中占多大比重？", "回答": "..."}},
            {{"问题": "回忆一次你的情感判断与理性分析相冲突的经历，你最终如何决定？", "回答": "..."}},
            {{"问题": "有没有一次决策，你完全依靠直觉而非分析做出，结果令你印象深刻？", "回答": "..."}}
        ],
        "资源分配维度": [
            {{"问题": "在分配时间、金钱和精力时，你有什么原则或优先级？", "回答": "..."}},
            {{"问题": "面对多个重要但无法同时满足的需求，你如何决定先满足哪一个？", "回答": "..."}},
            {{"问题": "你会为了帮助他人而牺牲自己的资源吗？在什么条件下？", "回答": "..."}},
            {{"问题": "描述一次你必须在多个重要项目或责任之间分配有限资源的经历和你的处理方式？", "回答": "..."}}
        ],
        "道德伦理维度": [
            {{"问题": "在面临道德两难时，你通常依据什么原则来决定？", "回答": "..."}},
            {{"问题": "你认为在商业决策中，道德因素应该占多大权重？", "回答": "..."}},
            {{"问题": "有没有某些行为，即使对你有利，你也坚决不会做？为什么？", "回答": "..."}},
            {{"问题": "分享一个你面临道德困境的经历，你如何做出抉择，事后有何反思？", "回答": "..."}}
        ],
        "决策过程维度": [
            {{"问题": "你通常如何收集信息来支持重要决策？", "回答": "..."}},
            {{"问题": "在时间紧迫的情况下，你会如何简化决策过程？", "回答": "..."}},
            {{"问题": "当你对某个决定感到后悔时，你会如何调整未来的决策方式？", "回答": "..."}},
            {{"问题": "回忆一次你做出了错误决策的经历，你从中学到了什么？这如何改变了你后来的决策习惯？", "回答": "..."}}
        ],
        "成长与变化维度": [
            {{"问题": "你的决策方式在人生不同阶段有什么变化？什么经历促成了这些变化？", "回答": "..."}},
            {{"问题": "有什么童年或成长经历显著塑造了你现在的决策方式或价值观？", "回答": "..."}},
            {{"问题": "描述一次彻底改变了你思维方式或价值观的关键经历？", "回答": "..."}},
            {{"问题": "你认为自己最大的决策失误是什么？它如何影响了你现在的思考方式？", "回答": "..."}}
        ]
    }}
}}

只返回JSON，不要包含其他文字说明。"""
        
        util.log(1, f"开始调用LLM生成答案，人物：{instruction_text}")
        
        # 调用LLM
        response = gpt_request(prompt, model=model, max_tokens=4000)
        
        # 解析JSON响应
        import re
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                util.log(1, "成功生成答案")
                return jsonify({'success': True, 'data': result}), 200
            except json.JSONDecodeError as e:
                util.log(1, f"解析JSON失败: {str(e)}")
                util.log(1, f"LLM响应: {response[:500]}")
                return jsonify({'success': False, 'message': f'解析LLM响应失败: {str(e)}'}), 500
        else:
            util.log(1, f"未找到JSON格式的响应")
            util.log(1, f"LLM响应: {response[:500]}")
            return jsonify({'success': False, 'message': 'LLM响应格式不正确，未找到JSON数据'}), 500
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        util.log(1, f"自动生成答案时出错: {str(e)}\n{error_details}")
        return jsonify({'success': False, 'message': f'生成答案时出错: {str(e)}'}), 500

@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    """手动关闭服务器的API"""
    shutdown_server()
    return jsonify({'status': 'success', 'message': '服务器正在关闭'})

@app.route('/static/<path:filename>')
def serve_static(filename):
    # 提供静态文件
    return send_from_directory('static', filename)

@app.route('/templates/<path:filename>')
def serve_template(filename):
    # 提供模板文件（仅用于调试）
    return send_from_directory('templates', filename)

# 全局变量，用于控制服务器关闭
shutdown_flag = False

# 检查是否请求关闭服务器
def is_shutdown_requested():
    global shutdown_flag
    return shutdown_flag

# 设置应用程序，复制必要的文件到正确的位置
def setup():
    setup_directories()
    
    # 确保decision_interview.html存在于templates目录
    template_source = os.path.join(os.path.dirname(__file__), 'decision_interview.html')
    template_dest = os.path.join(os.path.dirname(__file__), 'templates', 'decision_interview.html')
    
    if os.path.exists(template_source) and not os.path.exists(template_dest):
        import shutil
        shutil.copy2(template_source, template_dest)

# 启动决策分析服务
def start_genagents_server(instruction_text="", port=None, host=None, debug=None):
    global instruction, genagents_port, genagents_host, genagents_debug, shutdown_flag
    
    # 重置关闭标志
    shutdown_flag = False
    
    # 设置指令
    if instruction_text:
        instruction = instruction_text
    else:
        load_instruction()
    
    # 设置服务器参数
    if port is not None:
        genagents_port = port
    if host is not None:
        genagents_host = host
    if debug is not None:
        genagents_debug = debug
    
    # 设置应用
    setup()
    
    # 返回应用实例，但不启动
    return app

# 直接运行时启动服务器
if __name__ == '__main__':
    setup()  # 确保所有必要的目录和文件都存在
    load_instruction()  # 加载指令
    print(f"启动Flask服务器，请访问 http://127.0.0.1:{genagents_port}/ 打开页面")
    
    # 使用Werkzeug的服务器，并添加关闭检查
    from werkzeug.serving import make_server
    
    # 创建服务器
    server = make_server(genagents_host, genagents_port, app)
    
    # 启动服务器，但在单独的线程中运行，以便我们可以检查shutdown_flag
    import threading
    
    def run_server():
        server.serve_forever()
    
    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()
    
    # 主线程检查shutdown_flag
    try:
        while not is_shutdown_requested():
            time.sleep(1)
    except KeyboardInterrupt:
        print("接收到键盘中断，正在关闭服务器...")
    finally:
        print("正在关闭服务器...")
        server.shutdown()