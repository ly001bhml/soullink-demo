import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Sparkles, Plus, Minus, Volume2, VolumeX, Trash2, MousePointer2, Brush, Eraser, ArrowRightLeft, Repeat, AlignCenter, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, PageContainer } from '../ui';
import { APIConfig } from '../../services/apiConfig';

/** * 保持原有类型定义不变
 */
type EmotionType = '平静' | '开心' | '难过' | '疲惫' | '焦虑' | '烦躁';
type ShapeType = 'circle' | 'square' | 'rounded-rect' | 'triangle' | 'line' | 'block' | 'path';

type GeometryElement = {
  id: string; type: ShapeType; x: number; y: number;
  width: number; height: number; rotation: number;
  fill: string; opacity: number; cornerRadius: number;
  points?: { x: number; y: number }[];
};

type StyleRecommendation = {
  shapeFamily: ShapeType[]; accentShapeFamily: ShapeType[];
  palette: string[]; densityLabel: string; blankLabel: string;
  rhythmLabel: string; symmetryLabel: string; prompt: string;
};

type CompositionAnalysis = {
  totalShapes: number; triangleRatio: number; circleRatio: number;
  sharpness: number; contrastStrength: number; density: number; blankRatio: number;
};

type WorkshopSuggestion = { id: string; title: string; description: string; };

type WorkshopRecord = {
  id: string; createdAt: number; selectedEmotion: EmotionType;
  recommendedStyle: StyleRecommendation; draftElements: GeometryElement[];
  finalElements: GeometryElement[]; analysis: { draft: CompositionAnalysis; final: CompositionAnalysis; deltaSharpness: number; deltaDensity: number; };
  report: string; trainingSaved: boolean;
};

/**
 * 保持原有常量与辅助函数不变
 */
const HISTORY_KEY = 'soullink_emotion_geometry_history';
const EMOTIONS: EmotionType[] = ['平静', '开心', '难过', '疲惫', '焦虑', '烦躁'];
const ALL_SHAPES: ShapeType[] = ['circle', 'square', 'rounded-rect', 'triangle', 'line', 'block'];

const SHAPE_LABELS: Record<ShapeType, string> = {
  circle: '圆', square: '方形', 'rounded-rect': '圆角矩形', triangle: '三角形', line: '线', block: '色块', path: '涂鸦',
};

const RECOMMENDATIONS: Record<EmotionType, StyleRecommendation> = {
  平静: {
    shapeFamily: ['circle', 'rounded-rect'], accentShapeFamily: ['line'], palette: ['#9EC5AB', '#DDE7C7', '#F2E8CF', '#7C9D96'],
    densityLabel: '低密度', blankLabel: '高留白', rhythmLabel: '缓慢、均匀', symmetryLabel: '柔和对称', prompt: '先摆出一种稳定呼吸的感觉，不追求复杂。',
  },
  开心: {
    shapeFamily: ['circle', 'block'], accentShapeFamily: ['triangle'], palette: ['#FFB703', '#FB8500', '#FFD166', '#8ECAE6'],
    densityLabel: '中高密度', blankLabel: '中等留白', rhythmLabel: '跳跃、重复', symmetryLabel: '轻微放射', prompt: '让几个明亮元素像轻轻弹起来一样出现。',
  },
  难过: {
    shapeFamily: ['rounded-rect', 'circle'], accentShapeFamily: ['line'], palette: ['#5C677D', '#7D8597', '#A5A58D', '#BFC0C0'],
    densityLabel: '低密度', blankLabel: '高留白', rhythmLabel: '缓慢、下沉', symmetryLabel: '偏单侧', prompt: '把沉重感摆出来就可以，不需要把它藏起来。',
  },
  疲惫: {
    shapeFamily: ['block', 'rounded-rect'], accentShapeFamily: ['circle'], palette: ['#CAD2C5', '#E9EDC9', '#F1FAEE', '#A3B18A'],
    densityLabel: '低复杂度', blankLabel: '宽松留白', rhythmLabel: '慢节奏', symmetryLabel: '横向平衡', prompt: '试着让画面先变得没那么累，留一点喘息空间。',
  },
  焦虑: {
    shapeFamily: ['triangle', 'line'], accentShapeFamily: ['block'], palette: ['#D00000', '#FFBA08', '#3A506B', '#6FFFE9'],
    densityLabel: '高密度', blankLabel: '低留白', rhythmLabel: '紧绷、斜向', symmetryLabel: '打破平衡', prompt: '可以先把紧张摆出来，等会儿我们再一起整理。',
  },
  烦躁: {
    shapeFamily: ['triangle', 'square'], accentShapeFamily: ['line'], palette: ['#E76F51', '#F4A261', '#264653', '#E9C46A'],
    densityLabel: '中高密度', blankLabel: '中低留白', rhythmLabel: '断续、冲突', symmetryLabel: '偏移重心', prompt: '先把那股刺刺的感觉拼出来，再看哪里能缓下来。',
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSoftTrianglePolygon = (softness: number) => {
  const s = clamp(softness || 0, 0, 1);
  const T = [ [50,0], [75,50], [100,100], [75,100], [50,100], [25,100], [0,100], [25,50] ];
  const C = [ [50,0], [85,15], [100,50],  [85,85],  [50,100], [15,85],  [0,50],  [15,15] ];
  const points = T.map((pt, i) => `${pt[0] + (C[i][0] - pt[0]) * s}% ${pt[1] + (C[i][1] - pt[1]) * s}%`);
  return `polygon(${points.join(', ')})`;
};

const getSvgPathFromPoints = (points: {x: number, y: number}[]) => {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${xc} ${yc}`;
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;
  return d;
};

const computeScore = (hasDraft: boolean, appliedSuggestionsCount: number, analysis: CompositionAnalysis) => {
  let score = 70;
  if (hasDraft) score += 15;
  score += appliedSuggestionsCount * 5;
  return Math.min(100, score);
};

const saveGameTraining = async (score: number, timeSpent: number) => {
  try { await new Promise(resolve => setTimeout(resolve, 500)); return true; }
  catch (error) { return false; }
};

const cloneElements = (elements: GeometryElement[]) => elements.map((element) => ({
  ...element, points: element.points ? [...element.points] : undefined
}));

const loadHistory = (): WorkshopRecord[] => {
  try { return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
};

const persistHistory = (history: WorkshopRecord[]) => {
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20))); } catch {}
};

const getLuminance = (color: string) => {
  const normalized = (color || '#000000').replace('#', '');
  if (normalized.length !== 6) return 0.5;
  return 0.2126 * (parseInt(normalized.slice(0, 2), 16) / 255) + 0.7152 * (parseInt(normalized.slice(2, 4), 16) / 255) + 0.0722 * (parseInt(normalized.slice(4, 6), 16) / 255);
};

const estimateElementArea = (element: GeometryElement) => {
  if (!element) return 0;
  if (element.type === 'triangle') return (element.width * element.height) / 2;
  if (element.type === 'line') return element.width * Math.max(element.height, 1.6);
  if (element.type === 'path') return (element.points ? element.points.length * 2 : 10) * element.width;
  return element.width * element.height;
};

const analyzeComposition = (elements: GeometryElement[]): CompositionAnalysis => {
  if (!elements || elements.length === 0) return { totalShapes: 0, triangleRatio: 0, circleRatio: 0, sharpness: 0, contrastStrength: 0, density: 0, blankRatio: 1 };
  const triangleCount = elements.filter((e) => e.type === 'triangle').length;
  const circleCount = elements.filter((e) => e.type === 'circle' || e.type === 'rounded-rect').length;
  const pathCount = elements.filter((e) => e.type === 'path').length;
  const totalArea = elements.reduce((sum, e) => sum + estimateElementArea(e), 0);
  const averageRotation = elements.reduce((sum, e) => sum + Math.abs(e.rotation || 0), 0) / elements.length;
  const lineCount = elements.filter((e) => e.type === 'line').length;
  const luminances = elements.map((e) => getLuminance(e.fill));
  const contrastStrength = clamp(Math.max(...luminances) - Math.min(...luminances), 0, 1);
  const density = clamp(totalArea / 1800, 0, 1);
  const blankRatio = clamp(1 - density, 0.06, 0.96);
  const sharpness = clamp((triangleCount / elements.length * 0.65) + (lineCount / elements.length * 0.15) - (pathCount / elements.length * 0.05) + (averageRotation / 180 * 0.2), 0, 1);
  return { totalShapes: elements.length, triangleRatio: triangleCount / elements.length, circleRatio: circleCount / elements.length, sharpness, contrastStrength, density, blankRatio };
};

const buildDraftSummary = (analysis: CompositionAnalysis) => {
  if (!analysis || analysis.totalShapes === 0) return '画布还是空的，可以先放几个形状试试看。';
  const densityLabel = analysis.density > 0.56 ? '偏拥挤' : analysis.density > 0.32 ? '中等密度' : '比较疏朗';
  const sharpnessLabel = analysis.sharpness > 0.52 ? '尖锐感较强' : analysis.sharpness > 0.3 ? '有一些张力' : '整体比较圆润';
  return `画面${densityLabel}，${sharpnessLabel}。`;
};

const buildSuggestions = (analysis: CompositionAnalysis): WorkshopSuggestion[] => {
  const suggestions: WorkshopSuggestion[] = [];
  if (!analysis) return suggestions;
  if (analysis.sharpness > 0.42) suggestions.push({ id: 'soften-sharp', title: '减少最尖锐的元素', description: '把最有攻击感的三角形或斜向元素柔和一点，让画面先缓一口气。' });
  if (analysis.density > 0.36) suggestions.push({ id: 'spread-dense', title: '拉开最拥挤的区域', description: '把画面中过于密集的部分拉散一点，给视线留出通道。' });
  if (analysis.blankRatio < 0.48) suggestions.push({ id: 'increase-blank', title: '增加一点留白', description: '让元素整体缩一点或者往边上让一点，留出一块能呼吸的空白。' });
  suggestions.push({ id: 'repeat-comfort', title: '把舒服的元素化作涟漪回音', description: '先在上方画布【选中】一个你觉得顺眼的图形，再点击应用，让它产生水波般柔和的连续回音。' });
  return suggestions.slice(0, 3);
};

const buildReport = (emotion: EmotionType, draftAnalysis: CompositionAnalysis, finalAnalysis: CompositionAnalysis, deltaSharpness: number, deltaDensity: number) => {
  const description = `作品描述：你的画面一共使用了 ${finalAnalysis.totalShapes} 个元素，当前密度${finalAnalysis.density > 0.5 ? '偏高' : finalAnalysis.density > 0.3 ? '适中' : '偏低'}，${finalAnalysis.sharpness > 0.45 ? '张力比较明显' : '整体更偏柔和'}。`;
  let interpretation = '情绪解读：';
  if (emotion === '焦虑' || emotion === '烦躁') interpretation += finalAnalysis.sharpness > 0.45 ? '你保留了一部分紧绷和警觉感，画面还在表达没有完全放下的能量。' : '你已经把一部分紧绷感整理成更可控的形状，画面开始稳定下来。';
  else if (emotion === '难过' || emotion === '疲惫') interpretation += finalAnalysis.blankRatio > 0.45 ? '作品里有明显的留白和停顿，像是在给自己腾出缓冲空间。' : '虽然画面不复杂，但现在还略显收缩，像是在慢慢整理情绪。';
  else interpretation += finalAnalysis.circleRatio > 0.35 ? '圆润和重复的元素比较多，说明你更愿意把情绪组织成稳定的节奏。' : '你保留了较多变化和跳动，画面带着明显的个人能量。';
  const reconstruction = `重构变化：${deltaSharpness < -0.08 ? '尖锐度明显下降，' : deltaSharpness > 0.08 ? '张力被进一步放大，' : '尖锐度变化不大，'}${deltaDensity < -0.08 ? '画面比首稿更松一点。' : deltaDensity > 0.08 ? '元素比首稿更聚拢。' : '整体疏密关系比首稿更稳定。'}`;
  return `${description}\n${interpretation}\n${reconstruction}`;
};

const createBaseElement = (type: ShapeType, fill: string, index: number): GeometryElement => ({
  id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
  type, x: 42 + (index % 3) * 12, y: 38 + (index % 2) * 14,
  width: type === 'line' ? 22 : type === 'block' ? 20 : 16,
  height: type === 'line' ? 2.2 : type === 'triangle' ? 16 : 16,
  rotation: type === 'line' ? (index % 2 === 0 ? -12 : 12) : 0,
  fill, opacity: 0.92, cornerRadius: type === 'rounded-rect' ? 24 : type === 'block' ? 10 : 0,
});

const createTemplateElements = (emotion: EmotionType, recommendation: StyleRecommendation) => {
  if (!recommendation) return [];
  const baseShapes = [...recommendation.shapeFamily, recommendation.accentShapeFamily[0]].slice(0, 4);
  return baseShapes.map((type, index) => {
    const safeFill = recommendation.palette[index % recommendation.palette.length] || '#000000';
    const element = createBaseElement(type, safeFill, index);
    if (emotion === '难过') return { ...element, y: element.y + 10, opacity: 0.82 };
    if (emotion === '开心') return { ...element, rotation: index % 2 === 0 ? 14 : -14, y: element.y - 4 };
    if (emotion === '疲惫') return { ...element, width: element.width + 4, height: element.height + 2, opacity: 0.8 };
    if (emotion === '焦虑' || emotion === '烦躁') return { ...element, rotation: index % 2 === 0 ? 24 : -20, x: element.x + index * 3 };
    return element;
  });
};

/**
 * ShapePreview 组件保持原有逻辑与样式不变
 */
const ShapePreview: React.FC<{ element: GeometryElement; selected: boolean; toolMode: 'pointer' | 'brush' | 'eraser'; onPointerDown: (event: React.PointerEvent<HTMLButtonElement | SVGElement>) => void; onSelect: () => void; }> = ({
  element, selected, toolMode, onPointerDown, onSelect,
}) => {
  if (!element) return null;

  if (element.type === 'path' && element.points) {
    const isEditing = selected && toolMode === 'pointer';
    return (
      <svg
        viewBox="0 0 100 100" preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
        style={{ zIndex: selected ? 20 : 10 }}
      >
        <g transform={`translate(${element.x || 0}, ${element.y || 0}) rotate(${element.rotation || 0})`} style={{ transformOrigin: 'center' }}>
          <path
            d={getSvgPathFromPoints(element.points)}
            fill="none" stroke={element.fill}
            strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={element.opacity}
            style={{ strokeWidth: `${element.width}cqmin` }}
            className={toolMode === 'pointer' ? 'pointer-events-auto cursor-grab active:cursor-grabbing transition-shadow' : 'pointer-events-none'}
            onPointerDown={(e) => { if (toolMode === 'pointer') { e.stopPropagation(); onPointerDown(e as any); } }}
            onClick={(e) => { if (toolMode === 'pointer') { e.stopPropagation(); onSelect(); } }}
          />
          {isEditing && (
            <path
              d={getSvgPathFromPoints(element.points)}
              fill="none" stroke="rgba(0,0,0,0.5)"
              strokeLinecap="round" strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={0.3}
              style={{ strokeWidth: `calc(${element.width}cqmin + 6px)` }}
              className="pointer-events-none"
            />
          )}
        </g>
      </svg>
    );
  }

  const baseStyle: React.CSSProperties = {
    left: `${element.x || 0}%`, top: `${element.y || 0}%`,
    width: `${element.width || 0}cqmin`, height: `${element.height || 0}cqmin`,
    opacity: element.opacity, transform: `translate(-50%, -50%) rotate(${element.rotation || 0}deg)`,
    backgroundColor: element.fill,
    pointerEvents: toolMode === 'pointer' ? 'auto' : 'none',
  };

  if (element.type === 'circle' || element.type === 'line') baseStyle.borderRadius = '999px';
  else baseStyle.borderRadius = `${element.cornerRadius || 0}px`;
  if (element.type === 'triangle') baseStyle.clipPath = getSoftTrianglePolygon((element.cornerRadius || 0) / 32);

  return (
    <button
      type="button"
      className={`absolute cursor-grab border-2 transition-shadow ${selected ? 'border-slate-900/60 shadow-[0_0_0_3px_rgba(255,255,255,0.6)] z-10' : 'border-white/50 z-0'} active:cursor-grabbing`}
      style={baseStyle}
      onPointerDown={onPointerDown as any}
      onClick={onSelect}
      aria-label={SHAPE_LABELS[element.type]}
    />
  );
};

export const EmotionGeometryWorkshopGame: React.FC = () => {
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const startedAtRef = useRef(Date.now());

  /** * 状态管理保持原有逻辑
   */
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>('平静');
  const [elements, setElements] = useState<GeometryElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string>('');

  const [toolMode, setToolMode] = useState<'pointer' | 'brush' | 'eraser'>('pointer');
  const brushRef = useRef({ isDrawing: false, currentPathId: '' });
  const [globalPolish, setGlobalPolish] = useState(0);

  const [brushColor, setBrushColor] = useState('#5C677D');
  const [brushWidth, setBrushWidth] = useState(3);

  const [draftElements, setDraftElements] = useState<GeometryElement[] | null>(null);
  const [draftAnalysis, setDraftAnalysis] = useState<CompositionAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<WorkshopSuggestion[]>([]);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<string[]>([]);
  const [history, setHistory] = useState<WorkshopRecord[]>(() => loadHistory());
  const [report, setReport] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [hasPlayedPolishAudio, setHasPlayedPolishAudio] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  /**
   * 核心交互方法保持原有逻辑
   */
  const playAudio = (fileName: string) => {
    if (!voiceEnabled) return;
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      }
      const safeFileName = encodeURIComponent(fileName);
      const audioUrl = `${import.meta.env.BASE_URL || '/'}audio/${safeFileName}.mp3`;
      const audio = new Audio(audioUrl);
      audio.volume = 0.8;
      const playPromise = audio.play();
      if (playPromise !== undefined) playPromise.catch(() => {});
      currentAudioRef.current = audio;
    } catch (err) {}
  };

  const recommendation = useMemo(() => RECOMMENDATIONS[selectedEmotion], [selectedEmotion]);
  const selectedElement = useMemo(() => elements.find((e) => e.id === selectedElementId) || null, [elements, selectedElementId]);
  const currentAnalysis = useMemo(() => analyzeComposition(elements), [elements]);

  useEffect(() => {
    if (recommendation && recommendation.palette.length > 0) {
      setBrushColor(recommendation.palette[0]);
    }
  }, [recommendation]);

  useEffect(() => {
    if (!selectedElementId) return;
    if (!elements.some((e) => e.id === selectedElementId)) setSelectedElementId('');
  }, [elements, selectedElementId]);

  const updateElement = (elementId: string, updater: (e: GeometryElement) => GeometryElement) => {
    setElements((current) => current.map((e) => e.id === elementId ? updater(e) : e));
  };

  const addShape = (type: ShapeType) => {
    const safeFill = recommendation.palette[elements.length % recommendation.palette.length] || '#ccc';
    const next = createBaseElement(type, safeFill, elements.length);
    setElements((current) => [...current, next]);
    setSelectedElementId(next.id);
    setSaveNotice('');
  };

  const clearCanvas = () => {
    setElements([]); setSelectedElementId(''); setDraftElements(null); setDraftAnalysis(null);
    setSuggestions([]); setAppliedSuggestionIds([]); setReport(''); setSaveNotice(''); setGlobalPolish(0); setHasPlayedPolishAudio(false);
  };

  const applyTemplate = () => {
    const nextElements = createTemplateElements(selectedEmotion, recommendation);
    setElements(nextElements);
    if (nextElements.length > 0) setSelectedElementId(nextElements[0].id);
    setDraftElements(null); setDraftAnalysis(null); setSuggestions([]); setAppliedSuggestionIds([]); setReport(''); setSaveNotice(''); setGlobalPolish(0); setHasPlayedPolishAudio(false);
  };

  const eraseAt = (ex: number, ey: number) => {
    const eraseRadius = 5;
    setElements(prev => prev.filter(el => {
      try {
        if (el.type === 'path' && Array.isArray(el.points)) {
          if (el.points.length === 0) return false;
          const hit = el.points.some(p => {
            const px = (p.x || 0) + (el.x || 0);
            const py = (p.y || 0) + (el.y || 0);
            return Math.hypot(px - ex, py - ey) < eraseRadius;
          });
          return !hit;
        } else {
          const hitX = Math.abs((el.x || 0) - ex) < ((el.width || 0) / 2);
          const hitY = Math.abs((el.y || 0) - ey) < ((el.height || 0) / 2);
          return !(hitX && hitY);
        }
      } catch (err) {
        console.error("Erase error:", err);
        return true;
      }
    }));
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode === 'pointer') {
      if (e.target === e.currentTarget) setSelectedElementId('');
      return;
    }
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return;

    brushRef.current.isDrawing = true;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (toolMode === 'eraser') {
      eraseAt(x, y);
    } else if (toolMode === 'brush') {
      const pathId = `path_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
      brushRef.current.currentPathId = pathId;
      const newPath: GeometryElement = {
        id: pathId, type: 'path', x: 0, y: 0,
        width: brushWidth, height: brushWidth, rotation: 0, fill: brushColor, opacity: 0.8, cornerRadius: 0,
        points: [{ x, y }]
      };
      setElements(prev => [...prev, newPath]);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode === 'pointer' || !brushRef.current.isDrawing) return;
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (toolMode === 'eraser') {
      eraseAt(x, y);
    } else if (toolMode === 'brush' && brushRef.current.currentPathId) {
      setElements(prev => prev.map(el => {
        if (el.id === brushRef.current.currentPathId && Array.isArray(el.points) && el.points.length > 0) {
          const lastPoint = el.points[el.points.length - 1];
          const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
          if (dist > 0.8) {
            return { ...el, points: [...el.points, { x, y }] };
          }
        }
        return el;
      }));
    }
  };

  const handleCanvasPointerUp = () => { brushRef.current.isDrawing = false; brushRef.current.currentPathId = ''; };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement | SVGElement>, elementId: string) => {
    if (toolMode !== 'pointer') return;
    event.stopPropagation();
    event.preventDefault();
    const rect = editorRef.current?.getBoundingClientRect();
    const targetElement = elements.find((e) => e.id === elementId);
    if (!rect || !targetElement) return;
    setSelectedElementId(elementId);

    const startX = event.clientX, startY = event.clientY;
    const originX = targetElement.x || 0, originY = targetElement.y || 0;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / rect.width * 100;
      const deltaY = (moveEvent.clientY - startY) / rect.height * 100;
      updateElement(elementId, (e) => ({ ...e, x: clamp(originX + deltaX, -50, 150), y: clamp(originY + deltaY, -50, 150) }));
    };
    const handleUp = () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp); document.body.style.userSelect = ''; };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleMove); window.addEventListener('pointerup', handleUp);
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const duplicate = { ...selectedElement, id: `${selectedElement.type}_${Date.now()}`, x: clamp((selectedElement.x || 0) + 8, -50, 150), y: clamp((selectedElement.y || 0) + 6, -50, 150) };
    setElements((current) => [...current, duplicate]); setSelectedElementId(duplicate.id);
  };

  const mirrorSelected = () => {
    if (!selectedElement) return;
    updateElement(selectedElement.id, (e) => ({ ...e, x: clamp(100 - (e.x || 0), -50, 150) }));
  };

  const repeatThree = () => {
    if (!selectedElement) return;
    const clones = [-14, 14].map((offset, index) => ({
      ...selectedElement, id: `${selectedElement.type}_${Date.now()}_${index}`,
      x: clamp((selectedElement.x || 0) + offset, -50, 150),
      y: clamp((selectedElement.y || 0) + (index === 0 ? -3 : 3), -50, 150),
      opacity: clamp((selectedElement.opacity || 1) - 0.08, 0.36, 1)
    }));
    setElements((current) => [...current, ...clones]);
  };

  const centerSelected = () => {
    if (!selectedElement) return;
    updateElement(selectedElement.id, (e) => ({ ...e, x: 50 }));
  };

  const deleteSelected = () => {
    if (!selectedElement) return;
    setElements((current) => current.filter((e) => e.id !== selectedElement.id)); setSelectedElementId('');
  };

  const finalizeDraft = () => {
    const snapshot = cloneElements(elements);
    const analysis = analyzeComposition(snapshot);
    setDraftElements(snapshot); setDraftAnalysis(analysis);
    setSuggestions(buildSuggestions(analysis)); setAppliedSuggestionIds([]); setReport(''); setSaveNotice('');
  };

  const applySuggestion = (suggestionId: string) => {
    if (suggestionId === 'repeat-comfort' && !selectedElementId) {
      alert('✨ 请先在上方画布中【点击选中】一个你觉得顺眼的图形或线条，再点击应用哦！');
      return;
    }

    if (suggestionId === 'soften-sharp') playAudio('减少尖锐');
    if (suggestionId === 'spread-dense') playAudio('拉开间距');
    if (suggestionId === 'increase-blank') playAudio('留白');
    if (suggestionId === 'repeat-comfort') playAudio('节奏重复');

    setElements((current) => {
      if (current.length === 0) return current;

      if (suggestionId === 'soften-sharp') {
        return current.map((e, index) => {
          if (e.type === 'triangle') return { ...e, type: 'circle', rotation: 0, width: (e.width||0) + 2, height: (e.height||0) + 2, opacity: clamp((e.opacity || 1) - 0.08, 0.3, 1) };
          if (index === 0) return { ...e, rotation: (e.rotation || 0) * 0.4 };
          return e;
        });
      }

      if (suggestionId === 'spread-dense') {
        return current.map((e) => {
          try {
            if (e.type === 'path' && Array.isArray(e.points) && e.points.length > 0) {
              const center = e.points.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}), {x:0, y:0});
              center.x /= e.points.length; center.y /= e.points.length;
              return { ...e, x: (e.x||0) + (center.x >= 50 ? 4 : -4), y: (e.y||0) + (center.y >= 50 ? 3 : -3) };
            }
            return { ...e, x: clamp((e.x||0) + ((e.x||0) >= 50 ? 6 : -6), -50, 150), y: clamp((e.y||0) + ((e.y||0) >= 50 ? 4 : -4), -50, 150) };
          } catch(err) { return e; }
        });
      }

      if (suggestionId === 'increase-blank') {
         return current.map((e) => ({ ...e, width: clamp((e.width||0) * 0.9, 4, 80), height: clamp((e.height||0) * 0.9, 1.2, 80) }));
      }

      if (suggestionId === 'repeat-comfort') {
        const target = current.find(e => e.id === selectedElementId);
        if (!target) return current;

        const echos: GeometryElement[] = [];
        const jitterX = (Math.random() - 0.5) * 8;
        const jitterY = (Math.random() - 0.5) * 8;

        for (let i = 1; i <= 3; i++) {
          const scale = Math.pow(0.85, i);
          const op = Math.max(0.1, (target.opacity || 1) - i * 0.25);
          if (target.type === 'path' && Array.isArray(target.points)) {
            echos.push({
              ...target, id: `${target.id}_echo_${i}_${Date.now()}`,
              points: target.points.map(p => ({ x: p.x + i * 10 + jitterX, y: p.y - i * 6 + jitterY })),
              width: (target.width||0) * scale, opacity: op,
            });
          } else {
            echos.push({
              ...target, id: `${target.id}_echo_${i}_${Date.now()}`,
              x: clamp((target.x||0) + i * 10 + jitterX, -50, 150), y: clamp((target.y||0) - i * 6 + jitterY, -50, 150),
              width: (target.width||0) * scale, height: (target.height||0) * scale, opacity: op,
            });
          }
        }
        return [...current, ...echos];
      }

      return current;
    });

    setAppliedSuggestionIds((current) => current.includes(suggestionId) ? current : [...current, suggestionId]);
  };

  const saveWorkshop = async () => {
    if (!draftElements || !draftAnalysis) return;
    setSaving(true);
    try {
      const finalAnalysis = analyzeComposition(elements);
      const deltaSharpness = Number((finalAnalysis.sharpness - draftAnalysis.sharpness).toFixed(3));
      const deltaDensity = Number((finalAnalysis.density - draftAnalysis.density).toFixed(3));
      const nextReport = buildReport(selectedEmotion, draftAnalysis, finalAnalysis, deltaSharpness, deltaDensity);
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const score = computeScore(Boolean(draftElements), appliedSuggestionIds.length, finalAnalysis);
      const trainingSaved = await saveGameTraining(score, elapsedSeconds);

      const record: WorkshopRecord = {
        id: `record_${Date.now()}`, createdAt: Date.now(), selectedEmotion, recommendedStyle: recommendation,
        draftElements: cloneElements(draftElements), finalElements: cloneElements(elements),
        analysis: { draft: draftAnalysis, final: finalAnalysis, deltaSharpness, deltaDensity }, report: nextReport, trainingSaved,
      };

      const nextHistory = [record, ...history].slice(0, 20);
      setHistory(nextHistory); persistHistory(nextHistory); setReport(nextReport);
      setSaveNotice(trainingSaved ? '作品已保存到本地历史，并写入训练记录。' : '作品已保存到本地历史，训练记录写入失败。');
      playAudio('报告重构');
    } catch (e) {
      console.error(e);
    } finally { setSaving(false); }
  };

  const cardClass = 'rounded-[2rem] border border-white/60 bg-white/70 p-5 shadow-[0_20px_60px_rgba(230,220,210,0.4)] backdrop-blur-2xl';
  const sectionHeaderClass = 'flex items-center gap-2 text-sm font-bold text-slate-800 mb-3';

  /**
   * 视图部分渲染：添加了针对滚动的容器样式
   */
  return (
    /* 添加了 overflow-y-auto 以确保容器可滚动 */
    <PageContainer className="h-screen overflow-y-auto bg-[#FAF9F6] pb-20 pt-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4">

        {/* 顶部栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/mini-game')} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"><ChevronLeft size={18} /></button>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">情绪几何工坊</h1>
              <p className="text-xs font-medium text-slate-400 mt-0.5">Geometry-based Externalization</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm transition-all ${voiceEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-400'}`}
          >
            {voiceEnabled ? <Volume2 size={18}/> : <VolumeX size={18}/>}
          </button>
        </div>

        {/* 1. 情绪选择 */}
        <section className={cardClass}>
          <div className={sectionHeaderClass}>1. 选择你当下的情绪</div>
          <div className="flex flex-wrap gap-2 mt-4">
            {EMOTIONS.map((emotion) => (
              <button
                key={emotion} type="button"
                className={`rounded-2xl px-5 py-2.5 text-sm font-bold transition-all ${selectedEmotion === emotion ? 'bg-[#E8DFD5] text-slate-800 shadow-inner' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                onClick={() => { setSelectedEmotion(emotion); playAudio(emotion); }}
              >
                {emotion}
              </button>
            ))}
          </div>
          {recommendation && (
            <div className="mt-5 rounded-2xl bg-orange-50/50 p-4 border border-orange-100/50">
              <div className="flex justify-between items-start gap-4">
                <p className="text-sm leading-relaxed text-slate-600">{recommendation.prompt}</p>
                <Button className="!bg-slate-800 !text-white !rounded-xl shrink-0" onClick={applyTemplate}>一键起稿</Button>
              </div>
            </div>
          )}
        </section>

        {/* 3. 画布核心区 */}
        <section className={`${cardClass} !p-2 !pb-6`}>
          <div
            ref={editorRef}
            className={`relative w-full h-[400px] overflow-hidden rounded-[1.5rem] bg-[#FDFCFB] shadow-inner ${toolMode === 'brush' ? 'cursor-crosshair' : toolMode === 'eraser' ? 'cursor-cell' : ''}`}
            style={{ touchAction: 'none', containerType: 'size' }}
            onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerLeave={handleCanvasPointerUp}
          >
            {/* 悬浮调色盘 */}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-30 bg-white/60 p-2 rounded-full shadow-sm backdrop-blur-md">
              {recommendation.palette.map((color) => (
                <button
                  key={color} type="button"
                  className={`h-6 w-6 rounded-full ring-2 transition-transform ${brushColor === color || selectedElement?.fill === color ? 'ring-slate-700 scale-110' : 'ring-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setBrushColor(color);
                    if (selectedElement) updateElement(selectedElement.id, (e) => ({ ...e, fill: color }));
                  }}
                />
              ))}
              <div className="w-6 h-px bg-slate-300/50 my-1" />
              <input type="color" value={brushColor} onChange={e => {
                setBrushColor(e.target.value);
                if (selectedElement) updateElement(selectedElement.id, el => ({ ...el, fill: e.target.value }));
              }} className="w-6 h-6 rounded-full cursor-pointer border-none bg-transparent p-0" />
            </div>

            {/* 背景辅助 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,183,3,0.05),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(124,157,150,0.05),transparent_40%)] pointer-events-none" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200/50 pointer-events-none" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-200/50 pointer-events-none" />

            {elements.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-400 pointer-events-none">
                <p className="text-sm font-medium">使用下方工具，将情绪具象化</p>
              </div>
            )}

            {elements.map((element) => (
              <ShapePreview key={element.id} element={element} selected={element.id === selectedElementId} toolMode={toolMode} onPointerDown={(event) => startDrag(event, element.id)} onSelect={() => setSelectedElementId(element.id)} />
            ))}
          </div>

          {/* 极简工具栏 */}
          <div className="flex items-center justify-between mx-4 mt-4 bg-white rounded-2xl p-2 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 px-2">
              <button type="button" onClick={() => addShape('circle')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600"><div className="w-4 h-4 rounded-full border-2 border-current" /></button>
              <button type="button" onClick={() => addShape('line')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600"><div className="w-5 h-0.5 bg-current rotate-45" /></button>
              <button type="button" onClick={() => addShape('triangle')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L22 20H2L12 2Z"/></svg>
              </button>
              <button type="button" onClick={() => addShape('square')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600"><div className="w-4 h-4 border-2 border-current" /></button>
              <button type="button" onClick={() => addShape('rounded-rect')} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-600"><div className="w-4 h-4 border-2 border-current rounded-md" /></button>
            </div>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            <div className="flex items-center gap-1">
              <button type="button" className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${toolMode === 'pointer' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`} onClick={() => setToolMode('pointer')}><MousePointer2 size={18} /></button>
              <button type="button" className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${toolMode === 'brush' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`} onClick={() => { setToolMode('brush'); setSelectedElementId(''); playAudio('涂鸦'); }}><Brush size={18} /></button>
              <button type="button" className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${toolMode === 'eraser' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`} onClick={() => { setToolMode('eraser'); setSelectedElementId(''); }}><Eraser size={18} /></button>
              <button type="button" className="w-10 h-10 flex items-center justify-center rounded-xl text-rose-400 hover:bg-rose-50 hover:text-rose-500 transition-all" onClick={clearCanvas}><Trash2 size={18} /></button>
            </div>
          </div>

          {/* 层叠控制面板 */}
          <div className="mt-6 flex flex-col gap-3 px-2">
            <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">📐 点-线-面 构成</span>
                {selectedElement && <button type="button" onClick={deleteSelected} className="text-rose-400 hover:text-rose-500"><Trash2 size={16}/></button>}
              </div>
              {selectedElement ? (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400 font-medium">{selectedElement.type === 'path' ? '线条粗细' : '宽度'}</span>
                    <input type="range" min={1} max={80} step={0.5} value={selectedElement.width || 0} className="w-full accent-slate-800" onChange={(e) => updateElement(selectedElement.id, (el) => ({ ...el, width: Number(e.target.value) }))} />
                  </div>
                  {selectedElement.type !== 'path' && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-slate-400 font-medium">高度</span>
                      <input type="range" min={selectedElement.type === 'line' ? 1 : 4} max={80} step={0.5} value={selectedElement.height || 0} className="w-full accent-slate-800" onChange={(e) => updateElement(selectedElement.id, (el) => ({ ...el, height: Number(e.target.value) }))} />
                    </div>
                  )}
                  {(selectedElement.type === 'rounded-rect' || selectedElement.type === 'block') && (
                    <div className="flex flex-col gap-2 col-span-2">
                      <span className="text-xs text-slate-400 font-medium">圆角曲率</span>
                      <input type="range" min={0} max={32} value={selectedElement.cornerRadius || 0} className="w-full accent-slate-800" onChange={(e) => updateElement(selectedElement.id, (el) => ({ ...el, cornerRadius: Number(e.target.value) }))} />
                    </div>
                  )}
                </div>
              ) : toolMode === 'brush' ? (
                 <div className="flex flex-col gap-2 mt-4">
                    <span className="text-xs text-slate-400 font-medium">全局画笔粗细</span>
                    <input type="range" min={1} max={30} value={brushWidth} className="w-full accent-slate-800" onChange={e => setBrushWidth(Number(e.target.value))} />
                 </div>
              ) : (
                <p className="text-xs text-slate-400 mt-2">请使用指针选中一个元素进行编辑</p>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <span className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">🎨
              色块与协调</span>
              {selectedElement ? (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-slate-400 font-medium">透明度</span>
                  <input type="range" min={20} max={100} value={Math.round((selectedElement.opacity || 1) * 100)} className="w-full accent-slate-800" onChange={(e) => updateElement(selectedElement.id, (el) => ({ ...el, opacity: Number(e.target.value) / 100 }))} />
                </div>
              ) : (
                <p className="text-xs text-slate-400">选择元素以调整透明度，或在左侧调色盘切换颜色</p>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <span className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">⚖️ 对称与重复</span>
              <div className="grid grid-cols-4 gap-2">
                <button type="button" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={mirrorSelected} disabled={!selectedElement}>
                  <ArrowRightLeft size={16} className="mb-1" /><span className="text-[10px] font-bold">镜像</span>
                </button>
                <button type="button" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={repeatThree} disabled={!selectedElement}>
                  <Repeat size={16} className="mb-1" /><span className="text-[10px] font-bold">重复</span>
                </button>
                <button type="button" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={centerSelected} disabled={!selectedElement}>
                  <AlignCenter size={16} className="mb-1" /><span className="text-[10px] font-bold">居中</span>
                </button>
                <button type="button" className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={duplicateSelected} disabled={!selectedElement}>
                  <Plus size={16} className="mb-1" /><span className="text-[10px] font-bold">复制</span>
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
              <span className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">🌀 密度与节奏控制</span>
              {selectedElement ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-medium">旋转角度</span>
                    <span className="text-xs font-mono text-slate-500">{Math.round(selectedElement.rotation || 0)}°</span>
                  </div>
                  <input type="range" min={-180} max={180} value={selectedElement.rotation || 0} className="w-full accent-slate-800" onChange={(e) => updateElement(selectedElement.id, (el) => ({ ...el, rotation: Number(e.target.value) }))} />
                </div>
              ) : (
                <p className="text-xs text-slate-400">选择元素以调整旋转张力</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col gap-3">
              <div className="flex items-center justify-between px-2 text-xs text-slate-500">
                <span>包含 {currentAnalysis.totalShapes} 个元素</span>
                <span className="truncate max-w-[200px]">{buildDraftSummary(currentAnalysis)}</span>
              </div>
              <Button className="w-full !py-3 !text-base !font-bold !bg-slate-800 !text-white !rounded-2xl" onClick={finalizeDraft} disabled={elements.length === 0}>
                完成首稿，进入心理重构
              </Button>
            </div>
          </div>
        </section>

        {/* 4. 情绪重构区 */}
        {draftElements && draftAnalysis && (
          <section className={`${cardClass} mt-4`}>
            <div className={sectionHeaderClass}>
              <Sparkles size={18} className="text-amber-500" /> 4. 心理重构
            </div>

            <div className="mt-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-700">全局打磨 (模拟捏泥)</span>
                <span className="text-xs font-mono text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">{globalPolish}</span>
              </div>
              <input
                type="range" min={0} max={32} step={1} value={globalPolish}
                className="w-full accent-amber-500 h-2 bg-amber-100 rounded-lg cursor-pointer"
                onPointerUp={() => { if (!hasPlayedPolishAudio) { playAudio('全局打磨'); setHasPlayedPolishAudio(true); } }}
                onChange={(e) => { const val = Number(e.target.value); setGlobalPolish(val); setElements(prev => prev.map(el => ({ ...el, cornerRadius: val }))); }}
              />
              <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                缓慢拖动滑块，连续抚平画面中所有尖锐的矩形和三角形，体会边缘变得圆润时的放松感。
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-xs font-bold text-slate-400 mb-2 px-1">智能重构建议</div>
              {suggestions.map((suggestion) => {
                const applied = appliedSuggestionIds.includes(suggestion.id);
                return (
                  <div key={suggestion.id} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-slate-800">{suggestion.title}</div>
                      <div className="mt-1 text-xs text-slate-500 leading-relaxed">{suggestion.description}</div>
                    </div>
                    <button
                      type="button"
                      className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all ${applied ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-slate-800 text-white shadow-md hover:bg-slate-700'}`}
                      onClick={() => applySuggestion(suggestion.id)}
                    >
                      {applied ? (suggestion.id === 'repeat-comfort' ? '再次应用' : '已应用') : '一键应用'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
               <Button className="w-full !py-3 !text-base !font-bold !bg-slate-800 !text-white !rounded-2xl" onClick={saveWorkshop} disabled={!draftElements || saving}>
                 {saving ? '正在生成深度报告...' : '完成重构，生成专属心理报告'}
               </Button>
               {saveNotice && <div className="mt-3 text-center text-xs text-emerald-600 font-medium">{saveNotice}</div>}
               {report && (
                 <div className="mt-5 rounded-2xl border-none bg-slate-800 text-white p-6 shadow-xl">
                   <div className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Sparkles size={16}/> 专属心理报告</div>
                   <div className="text-sm leading-loose whitespace-pre-line text-slate-200">{report}</div>
                 </div>
               )}
            </div>
          </section>
        )}

      </div>
    </PageContainer>
  );
};