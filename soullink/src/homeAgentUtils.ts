import { BackgroundTask } from './appTypes';
import { CharacterAttributes, Companion } from './types';

export type HomeAgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: {
    label: string;
    type: 'navigate';
    path: string;
    companionId?: string;
  };
};

export type MiniGameRecommendation = {
  gameId: 'wisdom' | 'emotion' | 'truth-false' | 'sequence' | 'causality' | 'shulte' | 'memory' | 'simon-says';
  gameName: string;
  reason: string;
  prompt: string;
};

export const DEFAULT_CHARACTER_REFERENCE = '这个角色';

const GENERIC_REFERENCES = [
  '这个角色',
  '那个角色',
  '该角色',
  '这个人物',
  '那个人物',
  '该人物',
  '这个人',
  '那个人',
  '角色',
  '人物',
  '形象',
  '数字人',
];

const DIRECT_CHARACTER_HINTS = ['孔子', 'Confucius', '老子', 'Laozi', '庄子', 'Zhuangzi', '孟子', 'Mencius', '熊二'];

const stripQuotesAndSpaces = (value: string) =>
  value
    .replace(/[“”"'‘’《》【】「」]/g, '')
    .replace(/\s+/g, '')
    .trim();

const getDefaultHomeAgentMessages = (): HomeAgentMessage[] => [];

const hasLegacyPersonaLeak = (messages: HomeAgentMessage[]) =>
  messages.some((message) =>
    message.role === 'assistant' &&
    /小朋友你好呀|没关系啦|不急哦|慢慢来哦|轻轻接住情绪/.test(message.text)
  );

const buildAgentModelPrompt = (request: string, attributes?: CharacterAttributes | null) => {
  const cleanRequest = request.trim();
  if (!attributes) return cleanRequest;

  const promptParts = [
    'name ' + attributes.name,
    'gender ' + attributes.gender,
    'age ' + attributes.age,
    attributes.job ? 'job ' + attributes.job : '',
    attributes.birth ? 'birthplace ' + attributes.birth : '',
    attributes.additional ? 'personality ' + attributes.additional : '',
    attributes.hobby ? 'hobby ' + attributes.hobby : '',
    attributes.goal ? 'goal ' + attributes.goal : '',
    cleanRequest ? 'appearance details ' + cleanRequest : '',
    'high quality 3d digital human, full body, clear face, matching costume, natural standing pose',
  ].filter(Boolean);

  return promptParts.join(', ');
};

const normalizeExtractedCharacterName = (rawName: string) => {
  const cleaned = stripQuotesAndSpaces(rawName)
    .replace(/^(一个新的|一个新|一个|一位|新的|新|这个|那个|这位|那位)+/, '')
    .replace(/(角色|形象|数字人|人物|伙伴|小伙伴)$/g, '')
    .trim();

  if (!cleaned) return '';
  if (['他', '她', '它', 'ta'].includes(cleaned.toLowerCase())) return '';
  if (GENERIC_REFERENCES.includes(cleaned)) return '';
  return cleaned;
};

const extractCharacterNameFromRequest = (request: string) => {
  const trimmed = request.trim();
  if (!trimmed) return '';

  const patterns = [
    /(?:我想和|我想跟|想和|想跟|跟)(.+?)(?:对话|聊天|交流|互动)/,
    /(?:帮我创建|帮我生成|创建|生成)(.+?)(?:角色|形象|数字人|人物)/,
    /(?:帮我做|做一个|做个)(.+?)(?:角色|形象|数字人|人物)/,
    /(?:上传图片|上传模型).*(.+?)(?:对话|聊天|交流|互动)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = normalizeExtractedCharacterName(match?.[1] || '');
    if (candidate) {
      return candidate;
    }
  }

  for (const hint of DIRECT_CHARACTER_HINTS) {
    if (trimmed.includes(hint)) {
      return hint;
    }
  }

  return '';
};

const normalizeCharacterReferenceText = (text: string, preferredName?: string) => {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const resolvedName =
    normalizeExtractedCharacterName(preferredName || '') ||
    extractCharacterNameFromRequest(trimmed) ||
    DEFAULT_CHARACTER_REFERENCE;

  return trimmed
    .replace(/这个角色|那个角色|该角色|这个人物|那个人物|该人物|这个人|那个人/g, resolvedName)
    .replace(/([和跟与帮替让])(他|她|它|ta)(?=(对话|聊天|交流|互动|创建|生成|绑定|准备))/gi, `$1${resolvedName}`);
};

const isCharacterGenerationIntent = (request: string, hasImage: boolean, hasModel: boolean) => {
  const trimmed = request.trim();
  if (!trimmed) return false;
  const explicitGenerateIntent = /创建|生成|做一个|做个|做一位|create|generate|make|build/i.test(trimmed);

  const nonCreationQuestionPatterns = [
    /什么模型/,
    /啥模型/,
    /哪个模型/,
    /哪种模型/,
    /^你是.+模型/,
    /^你用.+模型/,
    /^你是什么/,
  ];
  if (nonCreationQuestionPatterns.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  const directIntentPatterns = [
    /我想[和跟与].+?(对话|聊天|交流|互动)/,
    /帮我.+?(创建|生成).+?(角色|形象|数字人|人物)/,
    /(创建|生成).+?(角色|形象|数字人|人物)/,
    /(做|做个|做一个).+?(角色|形象|数字人|人物)/,
    /(上传图片|上传模型).+?(创建|对话|绑定)/,
    /\b(create|generate|make|build)\b.+?\b(character|avatar|portrait|person|human|figure)\b/i,
    /\b(character|avatar|portrait)\s+prompt\b/i,
  ];

  return directIntentPatterns.some((pattern) => pattern.test(trimmed))
    || (explicitGenerateIntent && DIRECT_CHARACTER_HINTS.some((keyword) => trimmed.includes(keyword)))
    || ((hasImage || hasModel) && /对话|聊天|交流|互动|创建|生成|绑定|做成|做个|做一个|人物|角色|形象/.test(trimmed));
};

const getCharacterCreationClarification = (request: string, hasImage: boolean, hasModel: boolean) => {
  if (hasImage || hasModel) return null;

  const trimmed = request.trim();
  if (!trimmed || !isCharacterGenerationIntent(trimmed, hasImage, hasModel)) {
    return null;
  }

  if (extractCharacterNameFromRequest(trimmed)) {
    return null;
  }

  const genericPatterns = [
    /^帮我?(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[吧呀呢吗]?\s*$/,
    /^可以帮我?(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[吧呀呢吗]?\s*$/,
    /^我想(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[吧呀呢吗]?\s*$/,
    /^(创建|生成)(一个)?(3d|3D)?(角色|形象|数字人|人物)?[吧呀呢吗]?\s*$/,
  ];

  if (!genericPatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  return '好呀，我们先一起想清楚要做什么样的小伙伴。你可以说说名字、性格、外形，也可以直接上传一张喜欢的图片，我会认真听的。';
};

const findExistingCompanionForRequest = (companions: Companion[], request: string) => {
  const characterName = extractCharacterNameFromRequest(request);
  if (!characterName) return null;

  const normalized = characterName.toLowerCase();
  return companions.find((item) => {
    const haystacks = [
      item.name,
      item.role,
      item.characterDescription,
      item.characterAttributes?.name,
    ]
      .filter(Boolean)
      .map((value) => value!.toLowerCase());

    return haystacks.some((value) => value.includes(normalized) || normalized.includes(value));
  }) || null;
};

const getMiniGameRecommendation = (request: string): MiniGameRecommendation | null => {
  const text = request.toLowerCase();
  const matches = (keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

  if (matches(['难过', '伤心', '委屈', '害怕', '紧张', '情绪不好', '心情不好'])) {
    return {
      gameId: 'emotion',
      gameName: '表情识别',
      reason: '你可以先轻轻认一认现在的感觉，通常会舒服一点。',
      prompt: '如果你现在有点不舒服，我们可以先玩一个轻一点的小练习。',
    };
  }

  if (matches(['社交', '朋友', '沟通', '相处', '误会', '怎么表达', '怎么安慰'])) {
    return {
      gameId: 'wisdom',
      gameName: '智慧问答',
      reason: '这个小游戏会慢慢帮你看懂情境，也能练习怎么表达自己。',
      prompt: '如果你现在不想一下子说太多，可以先做个温柔的小练习。',
    };
  }

  if (matches(['注意力', '不专心', '专注', '分心', '走神', '控制力', '冲动'])) {
    return {
      gameId: 'shulte',
      gameName: '舒尔特方格',
      reason: '它比较短，适合先把注意力慢慢收回来。',
      prompt: '如果你现在有点坐不住，先做一个专注力小游戏会更合适。',
    };
  }

  if (matches(['记不住', '记忆', '老忘', '位置', '空间记忆'])) {
    return {
      gameId: 'memory',
      gameName: '位置记忆',
      reason: '它会一步一步帮你练习记住位置，节奏很清楚。',
      prompt: '如果你想练练记忆，这个小游戏会比较适合你。',
    };
  }

  if (matches(['逻辑', '真假', '判断', '推理', '是不是对', '是不是错'])) {
    return {
      gameId: 'truth-false',
      gameName: '真假判断',
      reason: '它会用很清楚的对和错，帮你慢慢把思路理顺。',
      prompt: '你可以先试试这个判断小游戏，让思路先稳下来。',
    };
  }

  if (matches(['原因', '为什么', '因果', '结果', '导致'])) {
    return {
      gameId: 'causality',
      gameName: '因果推断',
      reason: '它会帮你分清什么是原因，什么是结果。',
      prompt: '如果你想弄明白“为什么会这样”，可以先玩这个小游戏。',
    };
  }

  if (matches(['数学', '计算', '加减', '数字'])) {
    return {
      gameId: 'sequence',
      gameName: '序列排列',
      reason: '它会先带你找数字规律，节奏比较轻。',
      prompt: '如果你想从数字开始热身，可以先玩这个小游戏。',
    };
  }

  return null;
};

const buildHomeAgentTaskSummary = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '当前没有正在创建或绑骨的后台任务。';
  }

  const summaries = runningTasks.slice(0, 3).map((task) => {
    const matchedCompanion = task.companionId
      ? companions.find((item) => item.id === task.companionId || item.model_id === task.companionId)
      : null;
    const taskName = matchedCompanion?.name || task.companionName || '角色';
    const phase = task.type === 'generate' ? '创建与互动准备' : '自动绑骨';
    return task.detail?.trim()
      ? `${taskName}（当前步骤：${task.detail.trim()}）`
      : `${taskName}（阶段：${phase}）`;
  });

  return `【后台任务事实，供你组织语言】${summaries.join('；')}。有任务时也要正常陪聊；如果用户问进度，用一两句把当前步骤讲清楚，并轻轻安慰。`;
};

const isTaskStatusQuery = (request: string) => {
  const trimmed = request.trim();
  if (!trimmed) return false;

  const patterns = [
    /现在有任务吗/,
    /当前有任务吗/,
    /还有任务吗/,
    /有没有任务/,
    /任务完成了吗/,
    /还在创建吗/,
    /还在处理中吗/,
    /进度怎么样/,
    /现在什么状态/,
    /到哪一步了/,
    /好了吗/,
    /完成了吗/,
    /结束了吗/,
    /怎么回事/,
    /什么情况/,
    /卡住了吗/,
  ];

  return patterns.some((pattern) => pattern.test(trimmed));
};

const buildTaskStatusReply = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '现在没有正在忙的后台任务啦，你想聊什么都可以跟我说。';
  }

  const lines = runningTasks.slice(0, 3).map((task) => {
    const matchedCompanion = task.companionId
      ? companions.find((item) => item.id === task.companionId || item.model_id === task.companionId)
      : null;
    const taskName = matchedCompanion?.name || task.companionName || '角色';
    const phase = task.type === 'generate' ? '创建和互动准备' : '自动绑骨';
    return task.detail?.trim()
      ? `${taskName}：${task.detail.trim()}`
      : `${taskName}：正在${phase}`;
  });

  return `我帮你看了一下，现在有 ${runningTasks.length} 个后台任务在继续进行：\n\n${lines.join('\n')}\n\n我会继续陪你看着进度，你也可以继续和我聊天。`;
};

const buildBusyTaskFallbackReply = (tasks: BackgroundTask[], companions: Companion[]) => {
  const runningTasks = tasks.filter((task) => task.status === 'running');
  if (runningTasks.length === 0) {
    return '我在呀，现在没有后台任务在跑。你想聊什么都可以，也可以告诉我想做什么样的角色。';
  }

  const primaryTask = runningTasks[0];
  const matchedCompanion = primaryTask.companionId
    ? companions.find((item) => item.id === primaryTask.companionId || item.model_id === primaryTask.companionId)
    : null;
  const taskName = matchedCompanion?.name || primaryTask.companionName || DEFAULT_CHARACTER_REFERENCE;
  const phase = primaryTask.type === 'generate' ? '准备中' : '绑骨中';

  return `${taskName} 还在后台悄悄${phase}，我会一直帮你看着的。你也可以继续在这里跟我聊天；如果想问进度，直接发“现在有任务吗”就好。`;
};

const buildConversationalTaskFallbackReply = (
  request: string,
  tasks: BackgroundTask[],
  companions: Companion[],
) => {
  const trimmed = request.trim();
  if (isTaskStatusQuery(trimmed)) {
    return buildTaskStatusReply(tasks, companions);
  }

  const runningTasks = tasks.filter((task) => task.status === 'running');
  const primaryTask = runningTasks[0];
  const matchedCompanion = primaryTask?.companionId
    ? companions.find((item) => item.id === primaryTask.companionId || item.model_id === primaryTask.companionId)
    : null;
  const taskName = matchedCompanion?.name || primaryTask?.companionName || DEFAULT_CHARACTER_REFERENCE;

  if (/^(你好|嗨|哈喽|在吗)[呀啊吗呢\?\s]*$/.test(trimmed)) {
    return runningTasks.length > 0
      ? `我在呀，${taskName} 还在后台慢慢准备，不过你随时都可以继续跟我聊天。`
      : '我在呀，你想聊什么都可以跟我说。';
  }

  if (/介绍一下自己|你是谁|你是做什么的/.test(trimmed)) {
    return runningTasks.length > 0
      ? `我是首页小助手，会陪你一起想角色、上传图片或模型，再带你去绑定和互动页。现在 ${taskName} 还在后台准备中，你也可以继续跟我讲话，不用等它结束。`
      : '我是首页小助手，会陪你聊天，帮你做 3D 小伙伴、上传图片或模型，再带你去绑定和聊天页面。';
  }

  if (/介绍.{0,6}系统|系统是做什么|做什么的|有什么功能|能做什么|怎么用|SoulLink|虚拟陪伴|数字人系统/i.test(trimmed)) {
    const base =
      '这是一个可以做出“会说话的 3D 小伙伴”的系统：你在首页说一说想法，或者传图片、传模型，就能开始创建角色。后台会帮你准备绑定，之后到“互动”里就能和它聊天。下面一排按钮有生成、绑定、互动、管理，像小地图一样带你走。';
    if (runningTasks.length > 0) {
      return `${base}\n\n另外，${taskName} 还在后台继续准备；如果你想看进度，直接发“现在有任务吗”就行。`;
    }
    return base;
  }

  return buildBusyTaskFallbackReply(tasks, companions);
};

/**
 * 首页助手回复占位函数（当前不做文案改写，保持模型原始输出）。
 * @param text 原始回复文本。
 * @returns 原始文本。
 */
const normalizeHomeAssistantReplyTone = (text: string) => {
  return String(text || '').trim();
};

export {
  buildAgentModelPrompt,
  buildBusyTaskFallbackReply,
  buildConversationalTaskFallbackReply,
  buildHomeAgentTaskSummary,
  buildTaskStatusReply,
  extractCharacterNameFromRequest,
  findExistingCompanionForRequest,
  getCharacterCreationClarification,
  getDefaultHomeAgentMessages,
  getMiniGameRecommendation,
  hasLegacyPersonaLeak,
  isCharacterGenerationIntent,
  isTaskStatusQuery,
  normalizeHomeAssistantReplyTone,
  normalizeCharacterReferenceText,
};
