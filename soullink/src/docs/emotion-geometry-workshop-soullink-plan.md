# soullink 中的“情绪几何工坊”开发落点

## 1. 先纠正项目落点

“情绪几何工坊”应开发在 `soullink`，不是 `bisheintereactive-main`。

当前 `soullink` 里已经具备可直接复用的结构：

- 小游戏入口在 [MiniGames.tsx](E:\soullink\3.29-put\soullink9\soullink\src\MiniGames.tsx)
- 路由已注册在 [App.tsx](E:\soullink\3.29-put\soullink9\soullink\src\App.tsx)
- 情绪采集组件在 [EmotionCapture.tsx](E:\soullink\3.29-put\soullink9\soullink\src\components\EmotionCapture.tsx)
- 小游戏训练结果已有保存接口调用：`/api/save-game-training`

所以这个新模块最自然的接法，是作为 `soullink` 里的一个新小游戏，而不是外接另一个 demo。

## 2. 我对论文的使用边界

我看了你提到的三篇核心文献的摘要、可访问正文片段和关键结果，也补了几篇邻近研究，用来支撑交互设计方向。

更准确地说：

- 不是三篇都逐字通读全文所有章节
- 但足够支持产品层的设计判断
- 不足以支持“临床治疗效果”这类强结论

目前可以放心拿来指导设计的结论是：

1. 基础几何形状和排列方式会影响主观情绪感受
2. 尖锐轮廓更容易关联威胁、紧张和警觉
3. 创作行为本身有助于情绪外化与整理
4. “先表达，再重构”比“只做一次画完”更符合艺术表达支持情绪处理的逻辑

## 3. 在 soullink 里的推荐产品定义

把它定义成一个新的小游戏：

`情绪几何工坊`

它不是自由绘画板，而是：

`情绪识别 -> 几何参数推荐 -> 拖拽式创作 -> 情绪重构 -> 分析报告 -> 保存历史`

这样和 `soullink` 当前的小游戏体系是统一的。

## 4. 在 soullink 里的具体接法

## 4.1 路由层

当前已有：

- `/mini-game`
- `/mini-game/:gameId`

建议直接在 `MiniGames.tsx` 里新增一个 game id：

- `emotion-geometry`

并把它加入游戏列表。

## 4.2 页面层

建议继续沿用 `MiniGames.tsx` 的组织方式，新增一个独立组件，例如：

- `EmotionGeometryWorkshopGame`

第一版不一定要拆文件；如果 `MiniGames.tsx` 已经过大，再拆成：

- `src/components/games/EmotionGeometryWorkshopGame.tsx`

## 4.3 情绪输入层

`soullink` 已经有 [EmotionCapture.tsx](E:\soullink\3.29-put\soullink9\soullink\src\components\EmotionCapture.tsx)，可以直接复用两类结果：

- 摄像头情绪
- 语音情绪

小游戏进入时可有两种模式：

1. 直接使用最近一次情绪结果
2. 在游戏页内再采一次情绪

第一版建议优先做第 1 种，流程最顺。

## 4.4 数据记录层

当前小游戏已经调用：

- `POST /api/save-game-training`

所以“情绪几何工坊”可以先复用现有训练记录接口保存基础成绩字段，再新增专门字段或新接口保存作品数据。

建议两层保存：

1. 训练记录
   - `game_type: "emotion-geometry"`
   - `score`
   - `time_spent`
   - `level`

2. 作品记录
   - 推荐参数
   - 初稿作品 JSON
   - 重构后作品 JSON
   - 分析结果
   - 文本报告
   - 触发时情绪

如果后端暂时不方便改，第一版也可以：

- 前端 `localStorage` 保存作品历史
- 后端只记训练完成记录

## 5. 作品结构建议

第一版不要做图片识别分析，直接分析结构化编辑数据。

每个图元记录：

- `id`
- `type`
- `x`
- `y`
- `width`
- `height`
- `rotation`
- `fill`
- `opacity`
- `cornerRadius`

整个作品记录：

- `elements`
- `background`
- `symmetryMode`
- `repeatUsed`
- `createdAt`

## 6. 游戏核心流程

### 6.1 开始前

系统读取情绪结果，给出推荐参数：

- 主要形状
- 辅助形状
- 颜色组
- 密度建议
- 留白建议
- 对称建议
- 节奏建议

### 6.2 首轮创作

用户只做这些事：

- 选形状
- 拖拽
- 缩放
- 旋转
- 复制
- 改色
- 镜像
- 对齐

### 6.3 情绪重构

系统根据初稿给出 1 到 3 条具体建议，例如：

- 把最尖锐的元素减少一点
- 拉开最拥挤的区域
- 增加一点留白
- 把一个舒服的元素做成重复节奏

### 6.4 结束后

生成分析报告：

- 当前作品特征
- 可能表达出的情绪倾向
- 重构前后变化
- 是否写入历史

## 7. 第一版最适合 soullink 的 MVP

建议只做这些：

1. 在 `MiniGames.tsx` 新增 `emotion-geometry`
2. 做一个基础几何画布
3. 读取最近情绪并返回推荐参数
4. 支持一次重构提示
5. 生成规则式报告
6. 保存到历史

先不做：

- AI 自动生成整幅图
- 复杂图层系统
- 手绘笔刷
- 专业心理评估

## 8. 为什么放在 soullink 比放在 bisheintereactive-main 更合适

因为 `soullink` 已经有：

- 现成小游戏入口
- 用户训练积分/徽章体系
- 情绪采集组件
- 用户侧交互主界面

而“情绪几何工坊”本质上更像：

`情绪支持型小游戏 + 可记录的互动训练模块`

这和 `soullink` 的产品定位是一致的。

## 9. 下一步建议

如果继续开发，下一步不该再停留在泛泛方案，而应该直接开始做：

1. 在 `MiniGames.tsx` 里注册 `emotion-geometry`
2. 先搭一个最小画布组件
3. 用假数据写通“推荐参数 -> 创作 -> 重构 -> 报告”
4. 再接入真实情绪输入和历史记录

这才是 `soullink` 上最稳的开发路径。
