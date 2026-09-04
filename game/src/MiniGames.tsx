import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, Brain, ChevronLeft, ChevronRight, Cpu, MessageCircle, Smile, Star, Trophy } from 'lucide-react';
import { Button, Input, PageContainer } from './components/ui';
import { APIConfig } from './services/apiConfig';
import { EmotionGeometryWorkshopGame } from './components/games/EmotionGeometryWorkshopGame';

const buildApiUrl = (path: string) => `${APIConfig.getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;

const saveGameTraining = async (gameType: GameType, score: number, timeSpent: number, level?: string) => {
  try {
    const response = await fetch(buildApiUrl('/api/save-game-training'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'User',
        game_type: gameType,
        score,
        time_spent: timeSpent,
        level,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.data ?? null;
  } catch (error) {
    console.warn('[MiniGames] 保存游戏记录失败:', error);
    return null;
  }
};

const getUserRewards = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/user-rewards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'User' }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data?.data ?? null;
  } catch (error) {
    console.warn('[MiniGames] 获取奖励信息失败:', error);
    return null;
  }
};

const getUserBadges = async () => {
  try {
    const response = await fetch(buildApiUrl('/api/user-badges'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'User' }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.data) ? data.data : [];
  } catch (error) {
    console.warn('[MiniGames] 获取徽章失败:', error);
    return [];
  }
};

type GameType =
  | 'wisdom'
  | 'emotion'
  | 'emotion-geometry'
  | 'truth-false'
  | 'sequence'
  | 'causality'
  | 'shulte'
  | 'memory'
  | 'simon-says'
  | 'color-sorter'
  | 'stable-connection';

type GameInfo = {
  id: GameType;
  name: string;
  description: string;
  icon: React.ReactNode;
};

type ChoiceQuestion = {
  text: string;
  answer: string;
  explain: string;
  options: string[];
  scenario?: string;
  image?: string;
};

type SequenceQuestion = {
  sequence: string;
  answer: string;
  pattern: string;
};

const featuredGames: GameInfo[] = [
  { id: 'emotion', name: '表情识别', description: '观察表情图片，选择正确的情绪类别', icon: <Smile size={24} /> },
  { id: 'emotion-geometry', name: '情绪几何工坊', description: '用点、线、面拼出情绪，再做一次温柔的重构整理', icon: <MessageCircle size={24} /> },
  { id: 'shulte', name: '舒尔特方格', description: '按数字顺序点击方格，提升专注力', icon: <Activity size={24} /> },
  { id: 'memory', name: '位置记忆', description: '记住高亮位置并按顺序点击', icon: <Brain size={24} /> },
  { id: 'simon-says', name: '西蒙说', description: '记住颜色顺序并重复，训练控制力', icon: <Cpu size={24} /> },
  { id: 'color-sorter', name: '色块归类机', description: '接住同色方块，简单无压力的分类游戏', icon: <Activity size={24} /> },
  { id: 'stable-connection', name: '稳定连线', description: '按顺序连接点，形成完整图形，简单无压力', icon: <Activity size={24} /> },
];

const emotionNames: Record<string, string> = {
  happy: '高兴',
  angry: '愤怒',
  calm: '平静',
  scared: '害怕',
};

const emotionImages = [
  { image: '/pictures/happy/常见表情英语 (1).png', emotion: 'happy' },
  { image: '/pictures/happy/常见表情英语 (2).png', emotion: 'happy' },
  { image: '/pictures/happy/常见表情英语 (4).png', emotion: 'happy' },
  { image: '/pictures/angry/常见表情英语 (5).png', emotion: 'angry' },
  { image: '/pictures/angry/常见表情英语 (6).png', emotion: 'angry' },
  { image: '/pictures/angry/常见表情英语 (7).png', emotion: 'angry' },
  { image: '/pictures/calm/常见表情英语 (1).png', emotion: 'calm' },
  { image: '/pictures/calm/常见表情英语.png', emotion: 'calm' },
  { image: '/pictures/calm/OIP (1).jpg', emotion: 'calm' },
  { image: '/pictures/scared/OIP.jpg', emotion: 'scared' },
  { image: '/pictures/scared/OIP (1).webp', emotion: 'scared' },
  { image: '/pictures/scared/OIP.webp', emotion: 'scared' },
];

const cardClass = 'glass-panel rounded-2xl p-4';
const primaryButtonClass = 'w-full !text-gray-800';
const optionBaseClass = 'w-full !text-gray-700 bg-white/80 hover:bg-white';
const optionWrongClass = '!bg-red-100 !text-red-600';
const optionCorrectClass = '!text-white';

const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const MiniGameLayout: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => {
  const navigate = useNavigate();
  return (
    <PageContainer className="flex min-h-[80vh] flex-col pb-8">
      <div className="flex items-center gap-3 pb-4 pt-6">
        <button
          type="button"
          onClick={() => navigate('/mini-game')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-gray-600 shadow-sm transition-colors hover:bg-white"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="mb-1 text-2xl font-bold text-gray-800">{title}</h1>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </PageContainer>
  );
};

const CompletionModal: React.FC<{
  title: string;
  description: string;
  buttonLabel?: string;
  onClose: () => void;
}> = ({ title, description, buttonLabel = '再玩一次', onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="glass-panel w-full max-w-md rounded-2xl p-6 text-center">
      <Star size={48} className="mx-auto mb-3 text-yellow-400" />
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <p className="mt-3 whitespace-pre-line text-gray-700">{description}</p>
      <Button className={`${primaryButtonClass} mt-5`} onClick={onClose}>
        {buttonLabel}
      </Button>
    </div>
  </div>
);

const GameFeedbackCard: React.FC<{
  title?: string;
  content: string | null;
  placeholder: string;
}> = ({ title = '游戏提示', content, placeholder }) => (
  <div className={cardClass}>
    {content ? (
      <div className="space-y-2 text-sm whitespace-pre-line text-gray-800">
        <div className="font-semibold text-pink-600">{title}</div>
        <p>{content}</p>
      </div>
    ) : (
      <div className="text-sm text-gray-500">{placeholder}</div>
    )}
  </div>
);

const GameSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [userRewards, setUserRewards] = useState<any>(null);

  useEffect(() => {
    void getUserRewards().then((rewards) => {
      if (rewards) {
        setUserRewards(rewards);
      }
    });
  }, []);

  return (
    <PageContainer className="relative min-h-[80vh] overflow-x-hidden overflow-y-auto overscroll-y-contain pb-8 pt-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-8%] top-[2%] h-72 w-72 rounded-full bg-pink-300/25 blur-3xl" />
        <div className="absolute right-[-10%] top-[18%] h-80 w-80 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute bottom-[8%] left-[22%] h-48 w-48 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="absolute left-[4%] top-[18%] text-pink-300/60 text-5xl">◌</div>
        <div className="absolute right-[10%] top-[10%] text-yellow-300/80 text-4xl">✧</div>
        <div className="absolute left-1/2 top-[3%] text-pink-200/70 text-3xl">✧</div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-28">
        <div className="px-1">
          <h1 className="mb-1 text-[1.65rem] font-bold tracking-tight text-slate-800 md:text-[1.9rem]">趣味小游戏</h1>
          <p className="text-[0.92rem] text-slate-500 md:text-[0.98rem]">选择一个游戏开始吧！</p>
        </div>

        {userRewards && (
          <div className="rounded-[22px] border border-white/70 bg-white/65 px-4 py-3.5 shadow-[0_18px_45px_rgba(255,173,185,0.16)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[0.95rem] font-semibold text-slate-800">{userRewards.points_info?.level || '游戏训练营'}</div>
                <div className="mt-1 text-[0.82rem] text-slate-500">
                  连续登录 {userRewards.points_info?.consecutive_days ?? 0} 天
                </div>
              </div>
              <div className="text-right">
                <div className="text-[1rem] font-bold text-slate-800">{userRewards.points_info?.total_points ?? 0} 积分</div>
                <div className="mt-1 text-[0.82rem] text-slate-500">
                  已解锁 {userRewards.earned_badges_count ?? 0}/{userRewards.total_badges_count ?? 0} 枚徽章
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {featuredGames.map((game) => (
          <button
            key={game.id}
            type="button"
            className="group flex items-center gap-3 rounded-[22px] border border-white/75 bg-white/70 px-4 py-3.5 text-left shadow-[0_18px_45px_rgba(255,173,185,0.14)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/82 hover:shadow-[0_22px_55px_rgba(255,173,185,0.22)]"
            onClick={() => navigate(`/mini-game/${game.id}`)}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pink-100/80 text-pink-500 ring-1 ring-pink-200/70">
                {game.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-[1.2rem] font-bold tracking-tight text-slate-800 md:text-[1.3rem]">{game.name}</h3>
                <p className="mt-0.5 text-[0.88rem] text-slate-500 md:text-[0.92rem]">{game.description}</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-slate-400 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        ))}
        </div>

        <Button
          className="h-12 rounded-2xl border-0 bg-gradient-to-r from-[#ff9b9d] via-[#ffa76f] to-[#ffbf43] text-sm font-semibold text-slate-800 shadow-[0_18px_40px_rgba(255,171,111,0.3)] hover:brightness-[1.02]"
          onClick={() => navigate('/rewards')}
        >
          <Trophy size={18} className="mr-2 text-yellow-700" />
          查看我的徽章
        </Button>
      </div>
    </PageContainer>
  );
};

const useAutoAdvance = (enabled: boolean, onAdvance: () => void, delay = 1200) => {
  const onAdvanceRef = useRef(onAdvance);

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = window.setTimeout(() => onAdvanceRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [enabled, delay]);
};

const WisdomQuizGame: React.FC = () => {
  const questions = useMemo<ChoiceQuestion[]>(
    () => [
      {
        text: '小明今天很安静，不太想说话。这是不是说明他不喜欢朋友？',
        answer: 'wrong',
        explain: '有时候安静只是因为累了或需要休息，并不代表不喜欢朋友。',
        options: ['我觉得这是“对”的', '我觉得这是“不对”的'],
      },
      {
        text: '当我不太明白别人怎么想时，可以温柔地问一句：“你现在是什么感觉？”这样做是可以的。',
        answer: 'correct',
        explain: '直接而温柔地提问，是一种很好的沟通方式。',
        options: ['我觉得这是“对”的', '我觉得这是“不对”的'],
      },
      {
        text: '如果别人皱着眉头、声音变大，多半是在生气或紧张。',
        answer: 'correct',
        explain: '表情和语气可以帮助我们理解对方的大致情绪。',
        options: ['我觉得这是“对”的', '我觉得这是“不对”的'],
      },
      {
        text: '我必须每一次都回答对，才算是一个很棒的人。',
        answer: 'wrong',
        explain: '练习的目标不是每次都完美，而是愿意慢慢学习和尝试。',
        options: ['我觉得这是“对”的', '我觉得这是“不对”的'],
      },
    ],
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<'correct' | 'wrong' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const current = questions[currentIndex];

  const goNext = useCallback(() => {
    setUserAnswer(null);
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowCompletion(true);
    }
  }, [currentIndex, questions.length]);

  useAutoAdvance(!!userAnswer, goNext);

  const handleAnswer = (choice: 'correct' | 'wrong') => {
    if (userAnswer) return;
    setUserAnswer(choice);
    const isRight = choice === current.answer;
    if (isRight) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setFeedback(
        `${nextStreak >= 3 ? '答对了！你连续做出了很合适的判断，观察和思考都很认真。' : '这次判断很合适，继续保持。'}\n\n${current.explain}`,
      );
    } else {
      setStreak(0);
      setFeedback(`温柔提示：这次和标准答案有一点点不同，但没关系，我们一起看看原因。\n\n${current.explain}`);
    }
  };

  const restart = () => {
    setShowCompletion(false);
    setCurrentIndex(0);
    setUserAnswer(null);
    setFeedback(null);
    setStreak(0);
  };

  return (
    <MiniGameLayout title="智慧问答" subtitle="这里只有练习，没有考核。你可以慢慢想，系统会温柔地告诉你为什么。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>第 {currentIndex + 1} / {questions.length} 题</span>
            <span>连续合适判断：{streak} 次</span>
          </div>
          <div className="text-base leading-relaxed text-gray-800">{current.text}</div>
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <Button
              variant={userAnswer === 'correct' ? 'primary' : 'secondary'}
              className={`${userAnswer === 'correct' ? optionCorrectClass : optionBaseClass}`}
              onClick={() => handleAnswer('correct')}
              disabled={!!userAnswer}
            >
              我觉得这是“对”的
            </Button>
            <Button
              variant={userAnswer === 'wrong' ? 'primary' : 'secondary'}
              className={`${userAnswer === 'wrong' ? optionCorrectClass : optionBaseClass}`}
              onClick={() => handleAnswer('wrong')}
              disabled={!!userAnswer}
            >
              我觉得这是“不对”的
            </Button>
          </div>
        </div>
        <GameFeedbackCard title="温柔提示" content={feedback} placeholder="先选一个答案，系统会告诉你原因，然后自动进入下一题。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title="练习完成"
          description={`你完成了全部 ${questions.length} 道智慧问答练习。\n连续理解情境的能力正在慢慢变强，真的很不错。`}
          onClose={restart}
        />
      )}
    </MiniGameLayout>
  );
};

const EmotionRecognitionGame: React.FC = () => {
  const buildQuestions = useCallback((): ChoiceQuestion[] => {
    const selected = shuffle(emotionImages).slice(0, 10);
    return selected.map((item) => {
      const options = [item.emotion];
      const others = Object.keys(emotionNames).filter((emotion) => emotion !== item.emotion);
      while (options.length < 4) {
        const candidate = others[Math.floor(Math.random() * others.length)];
        if (!options.includes(candidate)) options.push(candidate);
      }
      return {
        text: '看看下面的表情，选择正确的情绪类别吧！',
        answer: item.emotion,
        explain: `正确答案是：${emotionNames[item.emotion]}的表情。`,
        options: shuffle(options).map((itemKey) => emotionNames[itemKey]),
        image: item.image,
      };
    });
  }, []);

  const [questions, setQuestions] = useState<ChoiceQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [allCorrect, setAllCorrect] = useState(true);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    setQuestions(buildQuestions());
  }, [buildQuestions]);

  const current = questions[currentIndex];

  const goNext = useCallback(() => {
    setUserAnswer(null);
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowCompletion(true);
    }
  }, [currentIndex, questions.length]);

  useAutoAdvance(!!userAnswer, goNext);

  const handleAnswer = (choice: string) => {
    if (!current || userAnswer) return;
    setUserAnswer(choice);
    const correctLabel = emotionNames[current.answer];
    const isRight = choice === correctLabel;
    if (isRight) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((prev) => prev + 10);
      setFeedback(`${nextStreak >= 3 ? '答对了！你连续答对了好多次，表情识别真的越来越稳了。' : '答对了！你观察得很仔细。'}\n\n这是${correctLabel}的表情。`);
    } else {
      setStreak(0);
      setAllCorrect(false);
      setFeedback(`这次答错了，但没关系，我们一起学习。\n\n正确答案是：${correctLabel}的表情。`);
    }
  };

  const restart = () => {
    setQuestions(buildQuestions());
    setCurrentIndex(0);
    setUserAnswer(null);
    setFeedback(null);
    setStreak(0);
    setScore(0);
    setAllCorrect(true);
    setShowCompletion(false);
  };

  if (!current) {
    return (
      <MiniGameLayout title="表情识别游戏" subtitle="观察表情图片，选择正确的情绪类别。">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Activity size={32} className="animate-spin text-pink-400" />
        </div>
      </MiniGameLayout>
    );
  }

  return (
    <MiniGameLayout title="表情识别游戏" subtitle="看看下面的表情，选择正确的情绪类别吧！">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>第 {currentIndex + 1} / {questions.length} 题</span>
            <div className="flex gap-4">
              <span>连续答对：{streak} 次</span>
              <span>得分：{score}</span>
            </div>
          </div>
          <div className="flex justify-center py-4">
            <div className="flex h-48 w-48 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg">
              <img
                src={current.image}
                alt="表情"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjEwMCIgeT0iMTAwIiBmb250LXNpemU9IjE2IiBmaWxsPSIjOTRhM2I4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5JbWFnZTwvdGV4dD48L3N2Zz4=';
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            {current.options.map((option) => {
              const isChosen = userAnswer === option;
              const isCorrect = option === emotionNames[current.answer];
              return (
                <Button
                  key={option}
                  variant={isChosen && isCorrect ? 'primary' : 'secondary'}
                  className={`${isChosen ? (isCorrect ? optionCorrectClass : optionWrongClass) : optionBaseClass}`}
                  onClick={() => handleAnswer(option)}
                  disabled={!!userAnswer}
                >
                  {option}
                </Button>
              );
            })}
          </div>
        </div>
        <GameFeedbackCard content={feedback} placeholder="选择一个你认为最合适的情绪类别，答题后会自动进入下一题。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title={allCorrect ? '恭喜你！' : '本轮完成'}
          description={
            allCorrect
              ? `你成功完成了全部 ${questions.length} 道表情识别题，而且全部答对了！\n你的表情识别能力真的很棒。`
              : `你完成了全部 ${questions.length} 道表情识别题。\n最终得分：${score} 分。`
          }
          onClose={restart}
        />
      )}
    </MiniGameLayout>
  );
};

const TruthFalseGame: React.FC = () => {
  const questions = useMemo<ChoiceQuestion[]>(
    () => [
      { text: '如果今天下雨，那么地面会湿。', answer: 'true', explain: '下雨时，雨水会让地面变湿，这是一个合理的因果关系。', options: ['对', '错'] },
      { text: '所有会飞的动物都是鸟。', answer: 'false', explain: '蝙蝠也会飞，但它不是鸟类，所以这句话不成立。', options: ['对', '错'] },
      { text: '太阳从东方升起。', answer: 'true', explain: '这是我们每天都能观察到的自然现象。', options: ['对', '错'] },
      { text: '鱼可以在陆地上长期生活。', answer: 'false', explain: '大多数鱼依赖水环境呼吸和活动，不能在陆地长期生活。', options: ['对', '错'] },
      { text: '冬天通常比夏天冷。', answer: 'true', explain: '在大多数地区，冬天平均温度会比夏天低。', options: ['对', '错'] },
      { text: '猫是植物。', answer: 'false', explain: '猫是动物，不是植物。', options: ['对', '错'] },
      { text: '读书可以帮助我们学习新知识。', answer: 'true', explain: '阅读是获取信息和理解世界的重要方式。', options: ['对', '错'] },
      { text: '月亮会自己发光。', answer: 'false', explain: '月亮本身不会发光，我们看到的是它反射太阳的光。', options: ['对', '错'] },
      { text: '喝足够的水对身体有帮助。', answer: 'true', explain: '补充足够水分有利于身体正常运转。', options: ['对', '错'] },
      { text: '一周有九天。', answer: 'false', explain: '一周只有七天。', options: ['对', '错'] },
    ],
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const current = questions[currentIndex];

  const goNext = useCallback(() => {
    setUserAnswer(null);
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowCompletion(true);
    }
  }, [currentIndex, questions.length]);

  useAutoAdvance(!!userAnswer, goNext);

  const handleAnswer = (choice: string) => {
    if (userAnswer) return;
    setUserAnswer(choice);
    const isRight = choice === current.answer;
    if (isRight) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((prev) => prev + 10);
      setFeedback(`${nextStreak >= 3 ? '答对了！你最近的判断越来越准确了。' : '答对了！你的判断很准确，很棒。'}\n\n${current.explain}`);
    } else {
      setStreak(0);
      setFeedback(`这次答错了，但没关系，我们继续练习。\n\n${current.explain}`);
    }
  };

  const restart = () => {
    setCurrentIndex(0);
    setUserAnswer(null);
    setFeedback(null);
    setStreak(0);
    setScore(0);
    setShowCompletion(false);
  };

  return (
    <MiniGameLayout title="真假判断游戏" subtitle="仔细阅读下面的陈述，判断它是对还是错。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>第 {currentIndex + 1} / {questions.length} 题</span>
            <div className="flex gap-4">
              <span>连续答对：{streak} 次</span>
              <span>得分：{score}</span>
            </div>
          </div>
          <div className="text-base leading-relaxed text-gray-800">{current.text}</div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {current.options.map((option, index) => {
              const value = index === 0 ? 'true' : 'false';
              const isChosen = userAnswer === value;
              const isCorrect = value === current.answer;
              return (
                <Button
                  key={option}
                  variant={isChosen && isCorrect ? 'primary' : 'secondary'}
                  className={`${isChosen ? (isCorrect ? optionCorrectClass : optionWrongClass) : optionBaseClass}`}
                  onClick={() => handleAnswer(value)}
                  disabled={!!userAnswer}
                >
                  {option}
                </Button>
              );
            })}
          </div>
        </div>
        <GameFeedbackCard content={feedback} placeholder="先判断对错，系统会给你解释，并自动进入下一题。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title="真假判断完成"
          description={`你完成了全部 ${questions.length} 道真假判断题。\n最终得分：${score} 分。`}
          onClose={restart}
        />
      )}
    </MiniGameLayout>
  );
};

const createSequenceQuestions = (): SequenceQuestion[] => {
  const result: SequenceQuestion[] = [];

  for (let i = 0; i < 3; i++) {
    const start = Math.floor(Math.random() * 8) + 1;
    const step = Math.floor(Math.random() * 4) + 1;
    const values = Array.from({ length: 5 }, (_, index) => start + index * step);
    result.push({
      sequence: values.join(', '),
      answer: String(start + step * 5),
      pattern: `等差数列，公差为 ${step}`,
    });
  }

  for (let i = 0; i < 3; i++) {
    const start = Math.floor(Math.random() * 4) + 2;
    const ratio = Math.floor(Math.random() * 2) + 2;
    const values = Array.from({ length: 4 }, (_, index) => start * Math.pow(ratio, index));
    result.push({
      sequence: values.join(', '),
      answer: String(start * Math.pow(ratio, 4)),
      pattern: `等比数列，公比为 ${ratio}`,
    });
  }

  result.push({ sequence: '1, 1, 2, 3, 5', answer: '8', pattern: '斐波那契数列，每一项等于前两项之和' });
  result.push({ sequence: '1, 4, 9, 16, 25', answer: '36', pattern: '平方数列，每一项是位置的平方' });
  result.push({ sequence: '2, 3, 5, 8, 12', answer: '17', pattern: '差值依次为 1、2、3、4，下一次增加 5' });
  result.push({ sequence: '3, 6, 12, 24', answer: '48', pattern: '每次乘以 2' });

  return shuffle(result).slice(0, 10);
};

const SequenceGame: React.FC = () => {
  const [questions, setQuestions] = useState<SequenceQuestion[]>(() => createSequenceQuestions());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const current = questions[currentIndex];

  const goNext = useCallback(() => {
    setUserAnswer('');
    setSubmitted(false);
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowCompletion(true);
    }
  }, [currentIndex, questions.length]);

  useAutoAdvance(submitted, goNext);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!userAnswer.trim() || submitted) return;
    setSubmitted(true);
    const isRight = userAnswer.trim() === current.answer;
    if (isRight) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((prev) => prev + 10);
      setFeedback(`${nextStreak >= 3 ? '答对了！你连续找到了规律，观察力很强。' : '答对了！你找到了正确的规律。'}\n\n规律：${current.pattern}\n正确答案：${current.answer}`);
    } else {
      setStreak(0);
      setFeedback(`这次答错了，但没关系，我们一起看看规律。\n\n规律：${current.pattern}\n正确答案：${current.answer}`);
    }
  };

  const restart = () => {
    setQuestions(createSequenceQuestions());
    setCurrentIndex(0);
    setUserAnswer('');
    setSubmitted(false);
    setFeedback(null);
    setStreak(0);
    setScore(0);
    setShowCompletion(false);
  };

  return (
    <MiniGameLayout title="序列排列游戏" subtitle="找出序列的规律，输入下一个数字。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>第 {currentIndex + 1} / {questions.length} 题</span>
            <div className="flex gap-4">
              <span>连续答对：{streak} 次</span>
              <span>得分：{score}</span>
            </div>
          </div>
          <div className="py-4 text-center text-2xl font-semibold text-gray-800">{current.sequence} ...</div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="number"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="输入下一个数字"
                className="flex-1 !border-gray-200 !bg-white/80 !text-gray-800 placeholder:!text-gray-400"
                disabled={submitted}
              />
              <Button type="submit" disabled={!userAnswer.trim() || submitted} className={primaryButtonClass}>
                提交
              </Button>
            </div>
          </form>
        </div>
        <GameFeedbackCard content={feedback} placeholder="先观察规律，输入答案后会显示解析，并自动进入下一题。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title="序列排列完成"
          description={`你完成了全部 ${questions.length} 道序列题。\n最终得分：${score} 分。`}
          onClose={restart}
        />
      )}
    </MiniGameLayout>
  );
};

const CausalityGame: React.FC = () => {
  const questions = useMemo<ChoiceQuestion[]>(
    () => [
      {
        scenario: '小明每天都认真做作业，期末考试时他取得了好成绩。',
        text: '小明取得好成绩的原因是什么？',
        options: ['小明每天都认真做作业', '小明运气好', '考试题目简单'],
        answer: '小明每天都认真做作业',
        explain: '认真做作业是取得好成绩的直接原因，运气和题目难度可能有影响，但不是主要原因。',
      },
      {
        scenario: '地面变湿了。',
        text: '哪个原因最直接？',
        options: ['刚下过雨', '有人在看电视', '门铃响了', '有人在唱歌'],
        answer: '刚下过雨',
        explain: '下雨和地面变湿之间有更直接的关联。',
      },
      {
        scenario: '小红每天坚持锻炼，她的身体越来越健康。',
        text: '小红身体更健康的直接原因是什么？',
        options: ['每天坚持锻炼', '她买了新衣服', '她家离学校近'],
        answer: '每天坚持锻炼',
        explain: '坚持锻炼与健康提升之间存在明显的因果关系。',
      },
      {
        scenario: '教室里很安静，大家都在认真做题。',
        text: '安静最可能是因为什么？',
        options: ['大家在认真做题', '窗外有小鸟', '有人带了水杯'],
        answer: '大家在认真做题',
        explain: '认真做题会让大家减少说话，所以更直接地导致教室安静。',
      },
    ],
    [],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);

  const current = questions[currentIndex];

  const goNext = useCallback(() => {
    setUserAnswer(null);
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowCompletion(true);
    }
  }, [currentIndex, questions.length]);

  useAutoAdvance(!!userAnswer, goNext);

  const handleAnswer = (choice: string) => {
    if (userAnswer) return;
    setUserAnswer(choice);
    const isRight = choice === current.answer;
    if (isRight) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((prev) => prev + 10);
      setFeedback(`${nextStreak >= 3 ? '答对了！你对因果关系的判断越来越稳了。' : '答对了！你的因果判断很准确。'}\n\n${current.explain}`);
    } else {
      setStreak(0);
      setFeedback(`这次答错了，但没关系，我们一起学习。\n\n${current.explain}`);
    }
  };

  const restart = () => {
    setCurrentIndex(0);
    setUserAnswer(null);
    setFeedback(null);
    setStreak(0);
    setScore(0);
    setShowCompletion(false);
  };

  return (
    <MiniGameLayout title="因果推断游戏" subtitle="分析场景中的因果关系，选择正确的原因。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>第 {currentIndex + 1} / {questions.length} 题</span>
            <div className="flex gap-4">
              <span>连续答对：{streak} 次</span>
              <span>得分：{score}</span>
            </div>
          </div>
          {current.scenario && <div className="text-sm text-gray-700">{current.scenario}</div>}
          <div className="text-base font-medium text-gray-800">{current.text}</div>
          <div className="space-y-2">
            {current.options.map((option) => {
              const isChosen = userAnswer === option;
              const isCorrect = option === current.answer;
              return (
                <Button
                  key={option}
                  variant={isChosen && isCorrect ? 'primary' : 'secondary'}
                  className={`${isChosen ? (isCorrect ? optionCorrectClass : optionWrongClass) : optionBaseClass} justify-start text-left`}
                  onClick={() => handleAnswer(option)}
                  disabled={!!userAnswer}
                >
                  {option}
                </Button>
              );
            })}
          </div>
        </div>
        <GameFeedbackCard content={feedback} placeholder="读完场景后选出最直接的原因，答题后会自动进入下一题。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title="因果推断完成"
          description={`你完成了全部 ${questions.length} 道因果推断题。\n最终得分：${score} 分。`}
          onClose={restart}
        />
      )}
    </MiniGameLayout>
  );
};

const ShulteGame: React.FC = () => {
  const [gridSize, setGridSize] = useState<3 | 4 | 5>(3);
  const [grid, setGrid] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bestTime, setBestTime] = useState<Record<string, number>>({});
  const [showCompletion, setShowCompletion] = useState(false);
  const timerRef = useRef<number | null>(null);

  const generateGrid = useCallback(() => {
    const values = shuffle(Array.from({ length: gridSize * gridSize }, (_, index) => index + 1));
    setGrid(values);
    setCurrentNumber(1);
    setTime(0);
    setIsPlaying(false);
    setShowCompletion(false);
  }, [gridSize]);

  useEffect(() => {
    generateGrid();
  }, [generateGrid]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const startGame = () => {
    generateGrid();
    setIsPlaying(true);
    timerRef.current = window.setInterval(() => {
      setTime((prev) => Number((prev + 0.1).toFixed(1)));
    }, 100);
  };

  const finishGame = () => {
    setIsPlaying(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const key = `${gridSize}x${gridSize}`;
    setBestTime((prev) => {
      const oldValue = prev[key];
      if (oldValue === undefined || time < oldValue) {
        return { ...prev, [key]: time };
      }
      return prev;
    });
    setShowCompletion(true);
  };

  const handleCellClick = (number: number) => {
    if (!isPlaying || number !== currentNumber) return;
    if (number === gridSize * gridSize) {
      finishGame();
      return;
    }
    setCurrentNumber((prev) => prev + 1);
  };

  return (
    <MiniGameLayout title="舒尔特方格" subtitle="按数字大小依次点击方格，提升专注力。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={cardClass}>
          <div className="mb-2 text-sm font-medium text-gray-800">选择难度</div>
          <div className="flex gap-2">
            {[3, 4, 5].map((size) => (
              <Button
                key={size}
                variant={gridSize === size ? 'primary' : 'secondary'}
                className={gridSize === size ? optionCorrectClass : optionBaseClass}
                onClick={() => setGridSize(size as 3 | 4 | 5)}
                disabled={isPlaying}
              >
                {size}x{size}
              </Button>
            ))}
          </div>
        </div>

        <div className={`${cardClass} flex flex-col items-center`}>
          <div className="mb-4 flex w-full items-center justify-between text-sm">
            <div className="text-gray-700">目标数字：{currentNumber}</div>
            <div className="font-medium text-gray-800">时间：{time.toFixed(1)} 秒</div>
          </div>
          <div
            className="mb-4 grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              width: `${Math.min(320, gridSize * 72)}px`,
            }}
          >
            {grid.map((number) => (
              <button
                key={number}
                type="button"
                className={`flex aspect-square items-center justify-center rounded-xl text-2xl font-semibold transition-all ${
                  number < currentNumber ? 'bg-gray-200 text-gray-400' : number === currentNumber ? 'bg-red-300 text-gray-800' : 'bg-white/90 text-gray-800 hover:bg-white'
                }`}
                onClick={() => handleCellClick(number)}
              >
                {number}
              </button>
            ))}
          </div>
          <Button className={primaryButtonClass} onClick={startGame} disabled={isPlaying}>
            {isPlaying ? '游戏进行中' : '开始游戏'}
          </Button>
        </div>

        <div className={cardClass}>
          <div className="mb-2 text-base font-medium text-gray-800">最佳时间</div>
          <div className="space-y-1 text-gray-700">
            <div>3x3: {bestTime['3x3'] ? `${bestTime['3x3'].toFixed(1)} 秒` : '未完成'}</div>
            <div>4x4: {bestTime['4x4'] ? `${bestTime['4x4'].toFixed(1)} 秒` : '未完成'}</div>
            <div>5x5: {bestTime['5x5'] ? `${bestTime['5x5'].toFixed(1)} 秒` : '未完成'}</div>
          </div>
        </div>
      </div>
      {showCompletion && (
        <CompletionModal
          title="恭喜你！"
          description={`你完成了 ${gridSize}x${gridSize} 的舒尔特方格。\n用时：${time.toFixed(1)} 秒`}
          buttonLabel="继续"
          onClose={() => setShowCompletion(false)}
        />
      )}
    </MiniGameLayout>
  );
};

const MemoryGame: React.FC = () => {
  const [gridSize, setGridSize] = useState<3 | 4 | 5>(3);
  const [grid, setGrid] = useState<Array<{ isActive: boolean; isClicked: boolean }>>([]);
  const [activeCells, setActiveCells] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [level, setLevel] = useState(1);
  const [score, setScore] = useState(0);
  const [isShowing, setIsShowing] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const timerRef = useRef<number | null>(null);

  const resetGrid = useCallback(() => {
    setGrid(Array.from({ length: gridSize * gridSize }, () => ({ isActive: false, isClicked: false })));
    setActiveCells([]);
    setCurrentStep(0);
  }, [gridSize]);

  useEffect(() => {
    resetGrid();
  }, [resetGrid]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const showPattern = useCallback(
    (nextLevel: number) => {
      const cells = shuffle(Array.from({ length: gridSize * gridSize }, (_, index) => index)).slice(0, Math.min(nextLevel + 1, gridSize * gridSize));
      setActiveCells(cells);
      setCurrentStep(0);
      setGrid(Array.from({ length: gridSize * gridSize }, (_, index) => ({ isActive: cells.includes(index), isClicked: false })));
      setIsShowing(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setGrid(Array.from({ length: gridSize * gridSize }, () => ({ isActive: false, isClicked: false })));
        setIsShowing(false);
      }, 1500);
    },
    [gridSize],
  );

  const startGame = () => {
    setHasStarted(true);
    setLevel(1);
    setScore(0);
    setShowCompletion(false);
    resetGrid();
    window.setTimeout(() => showPattern(1), 250);
  };

  const handleCellClick = (index: number) => {
    if (isShowing || !hasStarted) return;
    if (index === activeCells[currentStep]) {
      setGrid((prev) => prev.map((cell, cellIndex) => (cellIndex === index ? { ...cell, isClicked: true } : cell)));
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      if (nextStep === activeCells.length) {
        const nextLevel = level + 1;
        window.setTimeout(() => {
          setScore((prev) => prev + 10);
          setLevel(nextLevel);
          showPattern(nextLevel);
        }, 500);
      }
      return;
    }
    setHasStarted(false);
    setShowCompletion(true);
  };

  return (
    <MiniGameLayout title="位置记忆" subtitle="记住随机格子变化并准确点击，提高空间记忆。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={cardClass}>
          <div className="mb-2 text-sm font-medium text-gray-800">选择难度</div>
          <div className="flex gap-2">
            {[3, 4, 5].map((size) => (
              <Button
                key={size}
                variant={gridSize === size ? 'primary' : 'secondary'}
                className={gridSize === size ? optionCorrectClass : optionBaseClass}
                onClick={() => setGridSize(size as 3 | 4 | 5)}
                disabled={isShowing || hasStarted}
              >
                {size}x{size}
              </Button>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <div className="flex justify-between text-sm text-gray-800">
            <div>级别：{level}</div>
            <div>得分：{score}</div>
          </div>
        </div>

        <div className={`${cardClass} flex flex-col items-center`}>
          <div
            className="mb-4 grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
              width: `${Math.min(320, gridSize * 72)}px`,
              height: `${Math.min(320, gridSize * 72)}px`,
            }}
          >
            {grid.map((cell, index) => (
              <button
                key={index}
                type="button"
                className={`rounded-xl transition-all ${
                  cell.isActive ? 'bg-red-300' : cell.isClicked ? 'bg-green-500' : 'bg-white/90 hover:bg-white'
                }`}
                onClick={() => handleCellClick(index)}
                disabled={isShowing}
              />
            ))}
          </div>
          <div className="mb-4 text-sm text-gray-500">{isShowing ? '记住高亮的格子位置' : '按顺序点击刚才亮起的格子'}</div>
          <Button className={primaryButtonClass} onClick={startGame} disabled={isShowing}>
            开始游戏
          </Button>
        </div>

        <GameFeedbackCard content={null} placeholder="开始后会短暂出现高亮格子，记住它们的位置，再按顺序点击。" />
      </div>
      {showCompletion && (
        <CompletionModal
          title="游戏结束"
          description={`你完成了 ${level - 1} 个级别。\n最终得分：${score} 分。`}
          onClose={() => {
            setShowCompletion(false);
            resetGrid();
          }}
        />
      )}
    </MiniGameLayout>
  );
};

const SimonSaysGame: React.FC = () => {
  const colors = useMemo(
    () => [
      { name: '红色', color: '#FF6B6B' },
      { name: '青色', color: '#4ECDC4' },
      { name: '蓝色', color: '#45B7D1' },
      { name: '绿色', color: '#96CEB4' },
    ],
    [],
  );

  const [sequence, setSequence] = useState<number[]>([]);
  const [playerSequence, setPlayerSequence] = useState<number[]>([]);
  const [activeColor, setActiveColor] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShowing, setIsShowing] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showGameOver, setShowGameOver] = useState(false);
  const playbackTimeouts = useRef<number[]>([]);

  const clearPlayback = useCallback(() => {
    playbackTimeouts.current.forEach((timeout) => window.clearTimeout(timeout));
    playbackTimeouts.current = [];
  }, []);

  useEffect(() => clearPlayback, [clearPlayback]);

  const playSequence = useCallback(
    (nextSequence: number[]) => {
      clearPlayback();
      setIsShowing(true);
      setPlayerSequence([]);
      nextSequence.forEach((value, index) => {
        playbackTimeouts.current.push(
          window.setTimeout(() => setActiveColor(value), index * 700 + 200),
          window.setTimeout(() => setActiveColor(null), index * 700 + 550),
        );
      });
      playbackTimeouts.current.push(
        window.setTimeout(() => {
          setIsShowing(false);
          setActiveColor(null);
          setPlayerSequence([]);
        }, nextSequence.length * 700 + 250),
      );
    },
    [clearPlayback],
  );

  const startGame = () => {
    setScore(0);
    setPlayerSequence([]);
    setShowGameOver(false);
    setIsPlaying(true);
    const first = [Math.floor(Math.random() * 4)];
    setSequence(first);
    playSequence(first);
  };

  const handleColorClick = (index: number) => {
    if (!isPlaying || isShowing) return;
    const nextInput = [...playerSequence, index];
    setPlayerSequence(nextInput);
    const isCorrect = nextInput.every((value, inputIndex) => value === sequence[inputIndex]);

    if (!isCorrect) {
      setIsPlaying(false);
      setShowGameOver(true);
      setHighScore((prev) => Math.max(prev, score));
      return;
    }

    if (nextInput.length === sequence.length) {
      const newScore = score + 10;
      setScore(newScore);
      setHighScore((prev) => Math.max(prev, newScore));
      const nextSequence = [...sequence, Math.floor(Math.random() * 4)];
      setSequence(nextSequence);
      window.setTimeout(() => {
        playSequence(nextSequence);
      }, 700);
    }
  };

  return (
    <MiniGameLayout title="西蒙说" subtitle="记住颜色序列并重复，加强自我控制和专注力。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={cardClass}>
          <div className="flex justify-between text-sm text-gray-800">
            <div>得分：{score}</div>
            <div>最高分：{highScore}</div>
          </div>
        </div>

        <div className={`${cardClass} flex flex-col items-center`}>
          <div className="mb-4 grid grid-cols-2 gap-4">
            {colors.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={`h-32 w-32 rounded-2xl text-white shadow-md transition-all ${activeColor === index ? 'scale-95 brightness-110' : 'hover:scale-[1.03]'}`}
                style={{ backgroundColor: activeColor === index ? item.color : `${item.color}CC` }}
                onClick={() => handleColorClick(index)}
                disabled={isShowing || !isPlaying}
              >
                <span className="font-medium">{item.name}</span>
              </button>
            ))}
          </div>
          <div className="mb-4 text-sm text-gray-500">{isShowing ? '观察序列' : isPlaying ? '按顺序重复序列' : '点击开始游戏'}</div>
          <Button className={primaryButtonClass} onClick={startGame} disabled={isShowing || isPlaying}>
            开始游戏
          </Button>
        </div>

        <GameFeedbackCard content={null} placeholder="游戏会先播放一串颜色顺序，记住它，再按同样顺序点击。" />
      </div>
      {showGameOver && (
        <CompletionModal
          title="游戏结束"
          description={`你完成了 ${score / 10} 个回合。\n最终得分：${score} 分。${score > 0 && score === highScore ? '\n这是你的当前最佳成绩。' : ''}`}
          onClose={() => setShowGameOver(false)}
        />
      )}
    </MiniGameLayout>
  );
};

const ColorSorterGame: React.FC = () => {
  const colorOptions = useMemo(
    () => [
      { name: '红色', color: '#ff6b8a' },
      { name: '蓝色', color: '#5b8def' },
      { name: '黄色', color: '#ffbe3b' },
      { name: '绿色', color: '#4ecb88' },
    ],
    [],
  );
  const [currentBlock, setCurrentBlock] = useState<{ id: number; name: string; color: string } | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const blockIdRef = useRef(0);
  const totalRounds = 12;

  const spawnBlock = useCallback(() => {
    const next = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    setCurrentBlock({
      id: blockIdRef.current++,
      name: next.name,
      color: next.color,
    });
  }, [colorOptions]);

  const startGame = () => {
    setScore(0);
    setStreak(0);
    setRound(1);
    setFeedback('看一看掉下来的色块，把它送进同色的收集区就可以啦。');
    setIsPlaying(true);
    setShowCompletion(false);
    spawnBlock();
  };

  const finishGame = useCallback(
    (finalScore: number) => {
      setIsPlaying(false);
      setShowCompletion(true);
      void saveGameTraining('color-sorter', finalScore, totalRounds, `${finalScore}`);
    },
    [totalRounds],
  );

  const handleBucketClick = (targetName: string) => {
    if (!isPlaying || !currentBlock) return;

    const isCorrect = targetName === currentBlock.name;
    const nextScore = isCorrect ? score + 10 : score;
    const nextStreak = isCorrect ? streak + 1 : 0;

    setScore(nextScore);
    setStreak(nextStreak);
    setFeedback(
      isCorrect
        ? `${nextStreak >= 3 ? '接得很稳，连续分类成功了。' : '接对了。'} 这是${currentBlock.name}色块。`
        : `没关系，这个是${currentBlock.name}色块。再试一次就会更顺手。`,
    );

    if (round >= totalRounds) {
      finishGame(nextScore);
      return;
    }

    setRound((prev) => prev + 1);
    spawnBlock();
  };

  return (
    <MiniGameLayout title="色块归类机" subtitle="接住同色方块，简单无压力的分类游戏。">
      <div className="flex flex-1 flex-col gap-3">
        <div className={cardClass}>
          <div className="flex justify-between text-sm text-gray-800">
            <div>回合：{round}/{totalRounds}</div>
            <div>得分：{score}</div>
          </div>
        </div>

        <div className={`${cardClass} flex flex-col items-center overflow-hidden`}>
          <div className="mb-3 text-sm text-gray-500">
            {isPlaying ? '看准颜色，把色块送进对应的颜色收集区。' : '点击开始后，中间会出现一个待分类色块。'}
          </div>

          <div className="relative mb-6 flex h-44 w-full max-w-md items-center justify-center rounded-[28px] bg-gradient-to-b from-pink-50 via-white to-orange-50">
            <div className="absolute inset-x-0 top-4 mx-auto h-10 w-10 rounded-full border-2 border-dashed border-pink-200/80" />
            <div
              key={currentBlock?.id ?? 'idle'}
              className={`h-20 w-20 rounded-[24px] shadow-[0_18px_30px_rgba(255,170,150,0.25)] transition-all duration-500 ${
                isPlaying && currentBlock ? 'translate-y-6 animate-bounce' : ''
              }`}
              style={{ backgroundColor: currentBlock?.color ?? '#f9c2d1' }}
            />
          </div>

          <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
            {colorOptions.map((item) => (
              <button
                key={item.name}
                type="button"
                className="rounded-2xl px-4 py-4 text-sm font-semibold text-white shadow-md transition-transform hover:scale-[1.02] disabled:opacity-60"
                style={{ backgroundColor: item.color }}
                onClick={() => handleBucketClick(item.name)}
                disabled={!isPlaying || !currentBlock}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <GameFeedbackCard
          content={feedback}
          placeholder="开始后会出现一个色块，选择对应颜色的收集区即可完成分类。"
        />
      </div>

      {showCompletion && (
        <CompletionModal
          title="分类完成"
          description={`你完成了 ${totalRounds} 回合分类。\n最终得分：${score} 分。${streak >= 3 ? '\n后半段的节奏已经很稳了。' : ''}`}
          onClose={() => setShowCompletion(false)}
        />
      )}
    </MiniGameLayout>
  );
};

const StableConnectionGame: React.FC = () => {
  const patterns = useMemo(
    () => [
      [
        { x: 50, y: 12 },
        { x: 78, y: 28 },
        { x: 86, y: 56 },
        { x: 68, y: 80 },
        { x: 50, y: 90 },
        { x: 32, y: 80 },
        { x: 14, y: 56 },
        { x: 22, y: 28 },
      ],
      [
        { x: 50, y: 10 },
        { x: 64, y: 30 },
        { x: 86, y: 34 },
        { x: 70, y: 52 },
        { x: 76, y: 78 },
        { x: 50, y: 64 },
        { x: 24, y: 78 },
        { x: 30, y: 52 },
        { x: 14, y: 34 },
        { x: 36, y: 30 },
      ],
      [
        { x: 50, y: 14 },
        { x: 72, y: 30 },
        { x: 82, y: 54 },
        { x: 70, y: 74 },
        { x: 50, y: 88 },
        { x: 30, y: 74 },
        { x: 18, y: 54 },
        { x: 28, y: 30 },
      ],
    ],
    [],
  );
  const [points, setPoints] = useState<Array<{ id: number; x: number; y: number; number: number }>>([]);
  const [currentNumber, setCurrentNumber] = useState(1);
  const [lines, setLines] = useState<Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>>([]);
  const [completed, setCompleted] = useState(false);
  const [round, setRound] = useState(1);

  const generatePattern = useCallback(() => {
    const selected = patterns[Math.floor(Math.random() * patterns.length)];
    setPoints(
      selected.map((point, index) => ({
        id: index,
        x: point.x,
        y: point.y,
        number: index + 1,
      })),
    );
    setCurrentNumber(1);
    setLines([]);
    setCompleted(false);
  }, [patterns]);

  useEffect(() => {
    generatePattern();
  }, [generatePattern]);

  const handlePointClick = (number: number) => {
    if (completed || number !== currentNumber) return;

    const point = points.find((item) => item.number === number);
    if (!point) return;

    if (number > 1) {
      const previous = points.find((item) => item.number === number - 1);
      if (previous) {
        setLines((prev) => [
          ...prev,
          {
            start: { x: previous.x, y: previous.y },
            end: { x: point.x, y: point.y },
          },
        ]);
      }
    }

    if (number === points.length) {
      const first = points.find((item) => item.number === 1);
      if (first) {
        setLines((prev) => [
          ...prev,
          {
            start: { x: point.x, y: point.y },
            end: { x: first.x, y: first.y },
          },
        ]);
      }
      setCompleted(true);
      void saveGameTraining('stable-connection', 10, points.length, `round-${round}`);
      window.setTimeout(() => {
        setRound((prev) => prev + 1);
        generatePattern();
      }, 1300);
      return;
    }

    setCurrentNumber((prev) => prev + 1);
  };

  return (
    <MiniGameLayout title="稳定连线" subtitle="按顺序连接点，形成完整图形，简单无压力。">
      <div className="flex flex-col gap-3" style={{ minHeight: '620px' }}>
        <div className={cardClass}>
          <div className="flex justify-between text-sm text-gray-800">
            <div>当前目标：{currentNumber}</div>
            <div>训练轮次：{round}</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_18px_45px_rgba(255,173,185,0.14)] backdrop-blur-xl" style={{ height: '420px' }}>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {lines.map((line, index) => (
              <line
                key={index}
                x1={line.start.x}
                y1={line.start.y}
                x2={line.end.x}
                y2={line.end.y}
                stroke="#5b8def"
                strokeWidth="0.6"
                strokeLinecap="round"
              />
            ))}
          </svg>

          {points.map((point) => (
            <button
              key={point.id}
              type="button"
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow-md transition-all ${
                point.number < currentNumber
                  ? 'border-blue-300 bg-blue-50 text-blue-500'
                  : point.number === currentNumber
                    ? 'border-pink-300 bg-pink-50 text-pink-500 hover:scale-105'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onClick={() => handlePointClick(point.number)}
            >
              {point.number}
            </button>
          ))}

          {completed && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="rounded-2xl bg-white px-8 py-5 text-center shadow-lg">
                <div className="text-2xl font-bold text-slate-800">完成啦</div>
                <div className="mt-2 text-sm text-slate-500">马上为你切换到下一张图形</div>
              </div>
            </div>
          )}
        </div>

        <GameFeedbackCard
          content={null}
          placeholder="从 1 开始按顺序点击，系统会自动把点连起来，最后就会形成完整图形。"
        />

        <Button className={primaryButtonClass} onClick={generatePattern}>
          重新开始
        </Button>
      </div>
    </MiniGameLayout>
  );
};

export const MiniGamePage: React.FC = () => {
  const { gameId } = useParams<{ gameId: GameType }>();

  switch (gameId) {
    case 'wisdom':
      return <WisdomQuizGame />;
    case 'emotion':
      return <EmotionRecognitionGame />;
    case 'emotion-geometry':
      return <EmotionGeometryWorkshopGame />;
    case 'truth-false':
      return <TruthFalseGame />;
    case 'sequence':
      return <SequenceGame />;
    case 'causality':
      return <CausalityGame />;
    case 'shulte':
      return <ShulteGame />;
    case 'memory':
      return <MemoryGame />;
    case 'simon-says':
      return <SimonSaysGame />;
    case 'color-sorter':
      return <ColorSorterGame />;
    case 'stable-connection':
      return <StableConnectionGame />;
    default:
      return <GameSelectionPage />;
  }
};

export const BadgePage: React.FC = () => {
  const navigate = useNavigate();
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void getUserBadges().then((data) => {
      if (mounted) {
        setBadges(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PageContainer className="min-h-[80vh] pb-10 pt-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/mini-game')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-gray-600 shadow-sm transition-colors hover:bg-white"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="mb-1 text-3xl font-bold text-gray-800">我的徽章</h1>
            <p className="text-sm text-gray-500">完成小游戏训练后，这里会慢慢点亮起来。</p>
          </div>
        </div>

        {loading ? (
          <div className="glass-panel flex min-h-[280px] items-center justify-center rounded-3xl p-6">
            <Activity size={28} className="animate-spin text-pink-400" />
          </div>
        ) : badges.length === 0 ? (
          <div className="glass-panel rounded-3xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-yellow-500">
              <Trophy size={28} />
            </div>
            <div className="text-xl font-semibold text-slate-800">还没有解锁徽章</div>
            <div className="mt-2 text-sm text-slate-500">先去玩几局小游戏，训练记录积累起来后就会出现在这里。</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {badges.map((badge, index) => (
              <div
                key={badge.id || index}
                className={`rounded-[28px] border bg-white/70 p-5 shadow-[0_18px_45px_rgba(255,173,185,0.14)] backdrop-blur-xl ${
                  badge.earned ? 'border-yellow-200' : 'border-white/70'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full ${
                      badge.earned ? 'bg-yellow-100 text-yellow-500' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Trophy size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{badge.name || '训练徽章'}</div>
                    <div className="mt-1 text-sm text-slate-500">{badge.description || '完成游戏训练后可解锁。'}</div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-slate-500">
                  {badge.earned ? `获得时间：${badge.earned_date || '已解锁'}` : `解锁条件：${badge.requirement || '完成对应训练'}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};
