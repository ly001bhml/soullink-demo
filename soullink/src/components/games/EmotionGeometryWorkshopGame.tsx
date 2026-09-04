import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlignCenter, ArrowRightLeft, ChevronDown, ChevronLeft, ChevronUp, Copy, DraftingCompass, Eraser, FileText, Palette, Pencil, Repeat, Sparkles, Trash2, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, PageContainer } from '../ui';
import { APIConfig } from '../../services/apiConfig';
import {
  type FusedSupportState,
  type InitialMultimodalState,
  type SupportAction,
  type SupportArousal,
  type SupportNeed,
  type SupportTrend,
  type SupportValence,
  type WorkshopColorFeatures,
  type WorkshopCompositionFeatures,
  type WorkshopInteractionSummary,
  type WorkshopShapeFeatures,
  type WorkshopStage,
  type WorkshopStateSnapshot,
  inferInitialWorkshopEmotion,
  loadInitialMultimodalState,
  saveFusedSupportState,
  saveWorkshopStateSnapshot,
} from '../../services/supportState';

type EmotionType = '平静' | '开心' | '难过' | '疲惫' | '焦虑' | '烦躁';
type ShapeType = 'circle' | 'square' | 'rounded-rect' | 'triangle' | 'line' | 'block';
type CanvasPoint = { x: number; y: number };

type GeometryElement = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  opacity: number;
  cornerRadius: number;
  isStroke?: boolean;
  doodlePoints?: CanvasPoint[];
  doodleWidth?: number;
};

type StyleRecommendation = {
  shapeFamily: ShapeType[];
  accentShapeFamily: ShapeType[];
  palette: string[];
  densityLabel: string;
  blankLabel: string;
  rhythmLabel: string;
  symmetryLabel: string;
  prompt: string;
};

type CompositionAnalysis = {
  totalShapes: number;
  triangleRatio: number;
  circleRatio: number;
  sharpness: number;
  contrastStrength: number;
  density: number;
  blankRatio: number;
  colorDiversity: number;
  averageBrightness: number;
  warmRatio: number;
  coolRatio: number;
  symmetryScore: number;
  centerOffset: number;
  clusterScore: number;
};

type WorkshopSuggestion = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  targetElementIds: string[];
  focusHint: string;
};

type WorkshopRecord = {
  id: string;
  createdAt: number;
  selectedEmotion: EmotionType;
  recommendedStyle: StyleRecommendation;
  draftElements: GeometryElement[];
  finalElements: GeometryElement[];
  analysis: {
    draft: CompositionAnalysis;
    final: CompositionAnalysis;
    deltaSharpness: number;
    deltaDensity: number;
  };
  report: string;
  trainingSaved: boolean;
  interactionSummary?: WorkshopInteractionSummary;
  fusedSupportState?: FusedSupportState;
  initialMultimodalState?: InitialMultimodalState | null;
};

type DrawingDraft = {
  elementId: string;
  shapeType: ShapeType;
  fill: string;
  startX: number;
  startY: number;
};

type DoodleDraft = {
  elementId: string;
  lastX: number;
  lastY: number;
  hasMoved: boolean;
};

type EraserDraft = {
  lastX: number;
  lastY: number;
  erasedAny: boolean;
};

type WorkshopEventType =
  | 'draw'
  | 'move'
  | 'style_change'
  | 'delete'
  | 'duplicate'
  | 'mirror'
  | 'repeat_three'
  | 'center'
  | 'apply_template'
  | 'finalize_draft'
  | 'apply_suggestion'
  | 'save';

type WorkshopEvent = {
  type: WorkshopEventType;
  at: number;
};

const HISTORY_KEY = 'soullink_emotion_geometry_history';
const EMOTIONS: EmotionType[] = ['平静', '开心', '难过', '疲惫', '焦虑', '烦躁'];
const SHAPE_LABELS: Record<ShapeType, string> = {
  circle: '圆',
  square: '方形',
  'rounded-rect': '圆角矩形',
  triangle: '三角形',
  line: '线',
  block: '色块',
};

const RECOMMENDATIONS: Record<EmotionType, StyleRecommendation> = {
  平静: {
    shapeFamily: ['circle', 'rounded-rect'],
    accentShapeFamily: ['line'],
    palette: ['#91C8A8', '#CDE6B5', '#F4E3C1', '#6E9F93', '#A7C9F1', '#F7B8A5'],
    densityLabel: '低密度',
    blankLabel: '高留白',
    rhythmLabel: '缓慢、均匀',
    symmetryLabel: '柔和对称',
    prompt: '先摆出一种稳定呼吸的感觉，不追求复杂。',
  },
  开心: {
    shapeFamily: ['circle', 'block'],
    accentShapeFamily: ['triangle'],
    palette: ['#FFB703', '#FB8500', '#FF6F59', '#FFD166', '#64C7FF', '#7EDC8B'],
    densityLabel: '中高密度',
    blankLabel: '中等留白',
    rhythmLabel: '跳跃、重复',
    symmetryLabel: '轻微放射',
    prompt: '让几个明亮元素像轻轻弹起来一样出现。',
  },
  难过: {
    shapeFamily: ['rounded-rect', 'circle'],
    accentShapeFamily: ['line'],
    palette: ['#4B5D78', '#7086A1', '#96A8B7', '#C7CED9', '#A7B59A', '#D8D2C7'],
    densityLabel: '低密度',
    blankLabel: '高留白',
    rhythmLabel: '缓慢、下沉',
    symmetryLabel: '偏单侧',
    prompt: '把沉重感摆出来就可以，不需要把它藏起来。',
  },
  疲惫: {
    shapeFamily: ['block', 'rounded-rect'],
    accentShapeFamily: ['circle'],
    palette: ['#9DBAA7', '#C9D8B5', '#E9EDC9', '#F6F1DD', '#8FA9AE', '#D7C9B7'],
    densityLabel: '低复杂度',
    blankLabel: '宽松留白',
    rhythmLabel: '慢节奏',
    symmetryLabel: '横向平衡',
    prompt: '试着让画面先变得没那么累，留一点喘息空间。',
  },
  焦虑: {
    shapeFamily: ['triangle', 'line'],
    accentShapeFamily: ['block'],
    palette: ['#D00000', '#FF6B35', '#FFBA08', '#264653', '#4CC9F0', '#7B2CBF'],
    densityLabel: '高密度',
    blankLabel: '低留白',
    rhythmLabel: '紧绷、斜向',
    symmetryLabel: '打破平衡',
    prompt: '可以先把紧张摆出来，等会儿我们再一起整理。',
  },
  烦躁: {
    shapeFamily: ['triangle', 'square'],
    accentShapeFamily: ['line'],
    palette: ['#E76F51', '#F4A261', '#E9C46A', '#2A9D8F', '#264653', '#FF6B6B'],
    densityLabel: '中高密度',
    blankLabel: '中低留白',
    rhythmLabel: '断续、冲突',
    symmetryLabel: '偏移重心',
    prompt: '先把那股刺刺的感觉拼出来，再看哪里能缓下来。',
  },
};

const cardClass = 'rounded-3xl border border-white/70 bg-white/75 p-4 shadow-[0_18px_45px_rgba(255,173,185,0.14)] backdrop-blur-xl';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const getSoftTrianglePolygon = (softness: number) => {
  const normalizedSoftness = clamp(softness || 0, 0, 1);
  const trianglePoints = [[50, 0], [75, 50], [100, 100], [75, 100], [50, 100], [25, 100], [0, 100], [25, 50]];
  const curvePoints = [[50, 0], [85, 15], [100, 50], [85, 85], [50, 100], [15, 85], [0, 50], [15, 15]];
  const points = trianglePoints.map((point, index) => (
    `${point[0] + (curvePoints[index][0] - point[0]) * normalizedSoftness}% ${point[1] + (curvePoints[index][1] - point[1]) * normalizedSoftness}%`
  ));
  return `polygon(${points.join(', ')})`;
};

const renderShapeGlyph = (shape: ShapeType) => {
  if (shape === 'circle') {
    return <span className="h-4 w-4 rounded-full border-2 border-current" />;
  }
  if (shape === 'square') {
    return <span className="h-4 w-4 border-2 border-current" />;
  }
  if (shape === 'rounded-rect') {
    return <span className="h-4 w-4 rounded-md border-2 border-current" />;
  }
  if (shape === 'triangle') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3L21 20H3L12 3Z" />
      </svg>
    );
  }
  if (shape === 'line') {
    return <span className="block h-0.5 w-4 rotate-45 bg-current" />;
  }
  return <span className="h-4 w-4 rounded-sm bg-current/20 ring-2 ring-current" />;
};

const buildApiUrl = (path: string) => `${APIConfig.getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`;

const saveGameTraining = async (score: number, timeSpent: number) => {
  try {
    const response = await fetch(buildApiUrl('/api/save-game-training'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'User',
        game_type: 'emotion-geometry',
        score,
        time_spent: timeSpent,
        level: 'mvp-v1',
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json().catch(() => null);
    return Boolean(data?.code === 200 || data?.data);
  } catch (error) {
    console.warn('[EmotionGeometryWorkshop] 保存训练记录失败:', error);
    return false;
  }
};

const cloneElements = (elements: GeometryElement[]) => elements.map((element) => ({ ...element }));

const loadHistory = (): WorkshopRecord[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[EmotionGeometryWorkshop] 读取历史失败:', error);
    return [];
  }
};

const persistHistory = (history: WorkshopRecord[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch (error) {
    console.warn('[EmotionGeometryWorkshop] 写入历史失败:', error);
  }
};

const getLuminance = (color: string) => {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) {
    return 0.5;
  }

  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const getRgb = (color: string) => {
  const normalized = color.replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }

  return {
    red: parseInt(normalized.slice(0, 2), 16) / 255,
    green: parseInt(normalized.slice(2, 4), 16) / 255,
    blue: parseInt(normalized.slice(4, 6), 16) / 255,
  };
};

const getHue = (color: string) => {
  const rgb = getRgb(color);
  if (!rgb) {
    return null;
  }

  const { red, green, blue } = rgb;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }

  let hue = 0;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return Math.round(hue * 60 < 0 ? hue * 60 + 360 : hue * 60);
};

const estimateElementArea = (element: GeometryElement) => {
  if (element.doodlePoints && element.doodlePoints.length > 1) {
    const pathLength = element.doodlePoints.slice(1).reduce((sum, point, index) => {
      const previous = element.doodlePoints?.[index];
      if (!previous) {
        return sum;
      }
      return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    return pathLength * Math.max(element.doodleWidth ?? element.height, 1.2);
  }
  if (element.type === 'triangle') {
    return (element.width * element.height) / 2;
  }
  if (element.type === 'line') {
    return element.width * Math.max(element.height, 1.6);
  }
  return element.width * element.height;
};

const analyzeComposition = (elements: GeometryElement[]): CompositionAnalysis => {
  if (elements.length === 0) {
    return {
      totalShapes: 0,
      triangleRatio: 0,
      circleRatio: 0,
      sharpness: 0,
      contrastStrength: 0,
      density: 0,
      blankRatio: 1,
      colorDiversity: 0,
      averageBrightness: 0.5,
      warmRatio: 0,
      coolRatio: 0,
      symmetryScore: 1,
      centerOffset: 0,
      clusterScore: 0,
    };
  }

  const triangleCount = elements.filter((element) => element.type === 'triangle').length;
  const circleCount = elements.filter((element) => element.type === 'circle' || element.type === 'rounded-rect').length;
  const totalArea = elements.reduce((sum, element) => sum + estimateElementArea(element), 0);
  const averageRotation = elements.reduce((sum, element) => sum + Math.abs(element.rotation), 0) / elements.length;
  const lineCount = elements.filter((element) => element.type === 'line').length;
  const luminances = elements.map((element) => getLuminance(element.fill));
  const colorKeys = new Set(elements.map((element) => element.fill.toLowerCase()));
  const hues = elements.map((element) => getHue(element.fill)).filter((value): value is number => value !== null);
  const warmCount = hues.filter((hue) => hue < 70 || hue >= 320).length;
  const coolCount = hues.filter((hue) => hue >= 140 && hue <= 260).length;
  const contrastStrength = clamp(Math.max(...luminances) - Math.min(...luminances), 0, 1);
  const density = clamp(totalArea / 1800, 0, 1);
  const blankRatio = clamp(1 - density, 0.06, 0.96);
  const sharpness = clamp(
    triangleCount / elements.length * 0.65 + lineCount / elements.length * 0.15 + averageRotation / 180 * 0.2,
    0,
    1,
  );
  const averageBrightness = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  const leftArea = elements
    .filter((element) => element.x < 50)
    .reduce((sum, element) => sum + estimateElementArea(element), 0);
  const rightArea = elements
    .filter((element) => element.x >= 50)
    .reduce((sum, element) => sum + estimateElementArea(element), 0);
  const symmetryScore = clamp(1 - Math.abs(leftArea - rightArea) / Math.max(totalArea, 1), 0, 1);
  const centroidX = elements.reduce((sum, element) => sum + element.x * estimateElementArea(element), 0) / Math.max(totalArea, 1);
  const centroidY = elements.reduce((sum, element) => sum + element.y * estimateElementArea(element), 0) / Math.max(totalArea, 1);
  const centerOffset = clamp(Math.hypot(centroidX - 50, centroidY - 50) / 70, 0, 1);
  const nearestDistances = elements.map((element, index) => {
    const distances = elements
      .filter((_, innerIndex) => innerIndex !== index)
      .map((candidate) => Math.hypot(candidate.x - element.x, candidate.y - element.y));
    return distances.length > 0 ? Math.min(...distances) : 50;
  });
  const clusterScore = clamp(1 - nearestDistances.reduce((sum, value) => sum + value, 0) / nearestDistances.length / 36, 0, 1);

  return {
    totalShapes: elements.length,
    triangleRatio: triangleCount / elements.length,
    circleRatio: circleCount / elements.length,
    sharpness,
    contrastStrength,
    density,
    blankRatio,
    colorDiversity: clamp(colorKeys.size / Math.max(elements.length, 1), 0, 1),
    averageBrightness,
    warmRatio: clamp(warmCount / Math.max(elements.length, 1), 0, 1),
    coolRatio: clamp(coolCount / Math.max(elements.length, 1), 0, 1),
    symmetryScore,
    centerOffset,
    clusterScore,
  };
};

const buildWorkshopColorFeatures = (analysis: CompositionAnalysis): WorkshopColorFeatures => {
  let tendency = 'balanced';
  if (analysis.coolRatio > analysis.warmRatio + 0.2) {
    tendency = analysis.averageBrightness < 0.45 ? 'cool_dim' : 'cool_soft';
  } else if (analysis.warmRatio > analysis.coolRatio + 0.2) {
    tendency = analysis.averageBrightness > 0.55 ? 'warm_bright' : 'warm_dense';
  } else if (analysis.contrastStrength > 0.45) {
    tendency = 'high_contrast';
  }

  return {
    colorDiversity: analysis.colorDiversity,
    averageBrightness: analysis.averageBrightness,
    warmRatio: analysis.warmRatio,
    coolRatio: analysis.coolRatio,
    tendency,
  };
};

const buildWorkshopShapeFeatures = (analysis: CompositionAnalysis): WorkshopShapeFeatures => ({
  triangleRatio: analysis.triangleRatio,
  circleRatio: analysis.circleRatio,
  sharpness: analysis.sharpness,
});

const buildWorkshopCompositionFeatures = (analysis: CompositionAnalysis): WorkshopCompositionFeatures => ({
  density: analysis.density,
  blankRatio: analysis.blankRatio,
  contrastStrength: analysis.contrastStrength,
  symmetryScore: analysis.symmetryScore,
  centerOffset: analysis.centerOffset,
  clusterScore: analysis.clusterScore,
});

const summarizeInteractionLog = (
  log: WorkshopEvent[],
  startedAt: number,
): WorkshopInteractionSummary => {
  const editEvents = log.filter((event) => event.type !== 'finalize_draft' && event.type !== 'save');
  const pauseCount = editEvents.slice(1).reduce((count, event, index) => {
    return count + (event.at - editEvents[index].at >= 8000 ? 1 : 0);
  }, 0);

  return {
    editCount: editEvents.length,
    deleteCount: log.filter((event) => event.type === 'delete').length,
    styleChangeCount: log.filter((event) => event.type === 'style_change').length,
    repetitionActionCount: log.filter((event) =>
      event.type === 'duplicate' || event.type === 'mirror' || event.type === 'repeat_three' || event.type === 'center'
    ).length,
    pauseCount,
    timeSpentSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
  };
};

const buildReconstructionDelta = (
  draftAnalysis: CompositionAnalysis | null,
  currentAnalysis: CompositionAnalysis,
  appliedSuggestionCount: number,
) => {
  if (!draftAnalysis) {
    return null;
  }

  return {
    deltaSharpness: Number((currentAnalysis.sharpness - draftAnalysis.sharpness).toFixed(3)),
    deltaDensity: Number((currentAnalysis.density - draftAnalysis.density).toFixed(3)),
    appliedSuggestionCount,
  };
};

const buildWorkshopSnapshot = (
  stage: WorkshopStage,
  selectedEmotion: EmotionType,
  analysis: CompositionAnalysis,
  interactionSummary: WorkshopInteractionSummary,
  draftAnalysis: CompositionAnalysis | null,
  appliedSuggestionCount: number,
): WorkshopStateSnapshot => ({
  stage,
  selectedEmotion,
  compositionFeatures: buildWorkshopCompositionFeatures(analysis),
  colorFeatures: buildWorkshopColorFeatures(analysis),
  shapeFeatures: buildWorkshopShapeFeatures(analysis),
  interactionSummary,
  reconstructionDelta: buildReconstructionDelta(draftAnalysis, analysis, appliedSuggestionCount),
  updatedAt: Date.now(),
});

const findSharpTargetIds = (elements: GeometryElement[]) => {
  const sharpCandidates = [...elements]
    .filter((element) => element.type === 'triangle' || element.type === 'line')
    .sort((left, right) => estimateElementArea(right) - estimateElementArea(left));
  if (sharpCandidates.length > 0) {
    return [sharpCandidates[0].id];
  }

  const rotatedCandidates = [...elements].sort((left, right) => Math.abs(right.rotation) - Math.abs(left.rotation));
  return rotatedCandidates[0] ? [rotatedCandidates[0].id] : [];
};

const findDenseTargetIds = (elements: GeometryElement[]) => {
  if (elements.length <= 1) {
    return elements[0] ? [elements[0].id] : [];
  }

  let bestPair: [GeometryElement, GeometryElement] | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  elements.forEach((element, index) => {
    elements.slice(index + 1).forEach((candidate) => {
      const distance = Math.hypot(candidate.x - element.x, candidate.y - element.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        bestPair = [element, candidate];
      }
    });
  });

  return bestPair ? [bestPair[0].id, bestPair[1].id] : [];
};

const findComfortTargetIds = (elements: GeometryElement[]) => {
  const comfortElement = elements.find((element) => element.type === 'circle' || element.type === 'rounded-rect' || element.type === 'block');
  if (comfortElement) {
    return [comfortElement.id];
  }

  const fallbackElement = [...elements].sort((left, right) => estimateElementArea(right) - estimateElementArea(left))[0];
  return fallbackElement ? [fallbackElement.id] : [];
};

const buildDraftSummary = (
  analysis: CompositionAnalysis,
  interactionSummary?: WorkshopInteractionSummary,
  fusedSupportState?: FusedSupportState | null,
) => {
  if (analysis.totalShapes === 0) {
    return '先放几个基础形状，把感觉摆出来就行。';
  }

  const canvasFeeling = analysis.density > 0.56
    ? '这张画现在有点挤，可以慢一点整理。'
    : analysis.density > 0.32
      ? '这张画已经有了一个清楚的起点。'
      : '这张画现在留出了不少呼吸空间。';
  const processFeeling = interactionSummary
    ? interactionSummary.pauseCount >= 2 || interactionSummary.styleChangeCount + interactionSummary.deleteCount >= 6
      ? '如果刚才有点卡住，就先只动一小块。'
      : '你刚才的整理节奏已经在慢慢成形。'
    : '';
  const supportFeeling = fusedSupportState
    ? fusedSupportState.supportNeed === 'stabilize'
      ? '接下来更适合先把最紧的那一处缓下来。'
      : fusedSupportState.supportNeed === 'comfort'
        ? '接下来更适合给画面补一点稳稳的支撑。'
        : fusedSupportState.supportNeed === 'reflect'
          ? '接下来可以先停一下，只挑一处最想动的地方。'
          : '接下来可以顺着已经舒服的节奏继续往下走。'
    : '';

  return `你已经摆出了 ${analysis.totalShapes} 个元素。${canvasFeeling}${processFeeling ? ` ${processFeeling}` : ''}${supportFeeling ? ` ${supportFeeling}` : ''}`;
};

const buildSuggestions = (
  elements: GeometryElement[],
  analysis: CompositionAnalysis,
  fusedSupportState?: FusedSupportState | null,
): WorkshopSuggestion[] => {
  const suggestions: WorkshopSuggestion[] = [];

  if (fusedSupportState?.nextSupportAction === 'reduce_sharpness' || analysis.sharpness > 0.42) {
    suggestions.push({
      id: 'soften-sharp',
      title: '先把这一处放松一点',
      description: '看着高亮的这块，试着把它转正一点、变圆一点，或者换成更柔和的颜色。',
      actionLabel: '定位这一处',
      targetElementIds: findSharpTargetIds(elements),
      focusHint: '从最刺的一处开始就够了，不用一次改完整张。',
    });
  }

  if (fusedSupportState?.nextSupportAction === 'increase_whitespace' || analysis.density > 0.36) {
    suggestions.push({
      id: 'spread-dense',
      title: '先让这一小块松一松',
      description: '把高亮区域里的元素稍微拉开一点，先留出一条能呼吸的空白。',
      actionLabel: '定位拥挤处',
      targetElementIds: findDenseTargetIds(elements),
      focusHint: '只整理这两块之间的距离，就已经是在重构了。',
    });
  }

  if (fusedSupportState?.nextSupportAction === 'add_structure') {
    suggestions.push({
      id: 'add-structure',
      title: '给这一处补一个更稳的搭子',
      description: '围着高亮元素再放一个圆形、圆角矩形，或一块更轻一点的颜色，让它没那么孤单。',
      actionLabel: '看这一处',
      targetElementIds: findComfortTargetIds(elements),
      focusHint: '不需要推翻重来，只要给这一处加一点支撑感。',
    });
  }

  suggestions.push({
    id: 'repeat-comfort',
    title: '把舒服的节奏再延长一点',
    description: '参考高亮的元素，再放一个相似的形状或颜色，让画面多一点稳定的重复。',
    actionLabel: '看舒服元素',
    targetElementIds: findComfortTargetIds(elements),
    focusHint: '顺着已经舒服的部分继续，不必硬改不想动的地方。',
  });

  return suggestions.slice(0, 3);
};

const inferWorkshopArousal = (analysis: CompositionAnalysis): SupportArousal => {
  const highSignals =
    Number(analysis.sharpness > 0.45) +
    Number(analysis.density > 0.5) +
    Number(analysis.contrastStrength > 0.45) +
    Number(analysis.clusterScore > 0.5);
  if (highSignals >= 2) {
    return 'high';
  }

  const lowSignals =
    Number(analysis.blankRatio > 0.45) +
    Number(analysis.circleRatio > 0.35) +
    Number(analysis.symmetryScore > 0.55);
  if (lowSignals >= 2) {
    return 'low';
  }

  return 'medium';
};

const inferWorkshopValence = (analysis: CompositionAnalysis): SupportValence => {
  const negativeSignals =
    Number(analysis.sharpness > 0.45) +
    Number(analysis.density > 0.45) +
    Number(analysis.contrastStrength > 0.45) +
    Number(analysis.clusterScore > 0.5);
  if (negativeSignals >= 3) {
    return 'negative';
  }

  const stableSignals =
    Number(analysis.blankRatio > 0.45) +
    Number(analysis.sharpness < 0.32) +
    Number(analysis.contrastStrength < 0.32) +
    Number(analysis.circleRatio > 0.35);
  if (stableSignals >= 3) {
    return 'neutral';
  }

  return 'neutral';
};

const inferRegulationTrend = (
  draftAnalysis: CompositionAnalysis | null,
  currentAnalysis: CompositionAnalysis,
  appliedSuggestionCount: number,
): SupportTrend => {
  if (!draftAnalysis) {
    return 'stable';
  }

  const deltaSharpness = Number((currentAnalysis.sharpness - draftAnalysis.sharpness).toFixed(3));
  const deltaDensity = Number((currentAnalysis.density - draftAnalysis.density).toFixed(3));

  if ((deltaSharpness <= -0.08 || deltaDensity <= -0.08) && appliedSuggestionCount > 0) {
    return 'improving';
  }
  if (deltaSharpness >= 0.08 || deltaDensity >= 0.08) {
    return 'worsening';
  }
  return 'stable';
};

const fuseSupportState = (
  stage: WorkshopStateSnapshot['stage'],
  initialState: InitialMultimodalState | null,
  analysis: CompositionAnalysis,
  interactionSummary: WorkshopInteractionSummary,
  appliedSuggestionCount: number,
  draftAnalysis: CompositionAnalysis | null,
): FusedSupportState => {
  const workshopArousal = inferWorkshopArousal(analysis);
  const workshopValence = inferWorkshopValence(analysis);
  const expressionFriction = interactionSummary.pauseCount >= 2 || interactionSummary.deleteCount + interactionSummary.styleChangeCount >= 6;
  const trend = inferRegulationTrend(draftAnalysis, analysis, appliedSuggestionCount);

  let estimatedValence: SupportValence = initialState?.valence ?? workshopValence;
  let estimatedArousal: SupportArousal = initialState?.arousal ?? workshopArousal;

  if (stage !== 'drafting') {
    const highTensionSignals =
      Number(analysis.sharpness > 0.45) +
      Number(analysis.density > 0.5) +
      Number(analysis.clusterScore > 0.5) +
      Number(analysis.contrastStrength > 0.45);
    if (highTensionSignals >= 2) {
      estimatedArousal = 'high';
      estimatedValence = 'negative';
    } else if (workshopArousal === 'low' && estimatedArousal === 'high') {
      estimatedArousal = 'medium';
    }
  }

  if (trend === 'improving') {
    if (estimatedArousal === 'high') {
      estimatedArousal = 'medium';
    }
    if (estimatedValence === 'negative' && analysis.blankRatio > 0.42 && analysis.sharpness < 0.4) {
      estimatedValence = 'neutral';
    }
  }

  let supportNeed: SupportNeed = 'creative-guide';
  let nextSupportAction: SupportAction = 'repeat_comfort_element';

  if (expressionFriction) {
    supportNeed = 'reflect';
    nextSupportAction = stage === 'drafting' ? 'complete_draft' : 'add_structure';
  } else if (estimatedValence === 'negative' && estimatedArousal === 'high' && stage === 'drafting') {
    supportNeed = 'stabilize';
    nextSupportAction = 'encourage_expression';
  } else if (estimatedValence === 'negative' && estimatedArousal === 'high') {
    supportNeed = 'stabilize';
    nextSupportAction = analysis.sharpness >= analysis.density ? 'reduce_sharpness' : 'increase_whitespace';
  } else if (estimatedValence === 'negative' && estimatedArousal === 'low' && analysis.blankRatio > 0.45 && analysis.averageBrightness < 0.45) {
    supportNeed = 'comfort';
    nextSupportAction = 'add_structure';
  } else if (trend === 'improving') {
    supportNeed = 'comfort';
    nextSupportAction = 'repeat_comfort_element';
  } else if ((estimatedValence === 'neutral' || estimatedValence === 'positive') && analysis.density < 0.35 && analysis.symmetryScore > 0.55) {
    supportNeed = 'creative-guide';
    nextSupportAction = 'repeat_comfort_element';
  } else if (stage === 'drafting') {
    supportNeed = 'creative-guide';
    nextSupportAction = 'complete_draft';
  }

  const chatCarryoverText =
    `workshop_summary=${stage}; emotion=${estimatedValence}/${estimatedArousal}; trend=${trend}; ` +
    `support=${supportNeed}; action=${nextSupportAction}; density=${analysis.density.toFixed(2)}; ` +
    `sharpness=${analysis.sharpness.toFixed(2)}; color=${buildWorkshopColorFeatures(analysis).tendency}`;

  return {
    estimatedValence,
    estimatedArousal,
    trend,
    supportNeed,
    nextSupportAction,
    chatCarryoverText,
    updatedAt: Date.now(),
  };
};

const buildReport = (
  emotion: EmotionType,
  draftAnalysis: CompositionAnalysis,
  finalAnalysis: CompositionAnalysis,
  deltaSharpness: number,
  deltaDensity: number,
) => {
  const description = `作品描述：你的画面一共使用了 ${finalAnalysis.totalShapes} 个元素，当前密度${finalAnalysis.density > 0.5 ? '偏高' : finalAnalysis.density > 0.3 ? '适中' : '偏低'}，${finalAnalysis.sharpness > 0.45 ? '张力比较明显' : '整体更偏柔和'}。`;

  let interpretation = '情绪解读：';
  if (emotion === '焦虑' || emotion === '烦躁') {
    interpretation += finalAnalysis.sharpness > 0.45
      ? '你保留了一部分紧绷和警觉感，画面还在表达没有完全放下的能量。'
      : '你已经把一部分紧绷感整理成更可控的形状，画面开始稳定下来。';
  } else if (emotion === '难过' || emotion === '疲惫') {
    interpretation += finalAnalysis.blankRatio > 0.45
      ? '作品里有明显的留白和停顿，像是在给自己腾出缓冲空间。'
      : '虽然画面不复杂，但现在还略显收缩，像是在慢慢整理情绪。';
  } else {
    interpretation += finalAnalysis.circleRatio > 0.35
      ? '圆润和重复的元素比较多，说明你更愿意把情绪组织成稳定的节奏。'
      : '你保留了较多变化和跳动，画面带着明显的个人能量。';
  }

  const reconstruction = `重构变化：${deltaSharpness < -0.08 ? '尖锐度明显下降，' : deltaSharpness > 0.08 ? '张力被进一步放大，' : '尖锐度变化不大，'}${deltaDensity < -0.08 ? '画面比首稿更松一点。' : deltaDensity > 0.08 ? '元素比首稿更聚拢。' : '整体疏密关系比首稿更稳定。'}`;

  return `${description}\n${interpretation}\n${reconstruction}`;
};

const createBaseElement = (type: ShapeType, fill: string, index: number): GeometryElement => ({
  id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
  type,
  x: 42 + (index % 3) * 12,
  y: 38 + (index % 2) * 14,
  width: type === 'line' ? 22 : type === 'block' ? 20 : 16,
  height: type === 'line' ? 2.2 : type === 'triangle' ? 16 : 16,
  rotation: type === 'line' ? (index % 2 === 0 ? -12 : 12) : 0,
  fill,
  opacity: 0.92,
  cornerRadius: type === 'rounded-rect' ? 24 : type === 'block' ? 10 : 0,
});

const createTemplateElements = (emotion: EmotionType, recommendation: StyleRecommendation) => {
  const baseShapes = [...recommendation.shapeFamily, recommendation.accentShapeFamily[0]].slice(0, 4);
  return baseShapes.map((type, index) => {
    const element = createBaseElement(type, recommendation.palette[index % recommendation.palette.length], index);
    if (emotion === '难过') {
      return { ...element, y: element.y + 10, opacity: 0.82 };
    }
    if (emotion === '开心') {
      return { ...element, rotation: index % 2 === 0 ? 14 : -14, y: element.y - 4 };
    }
    if (emotion === '疲惫') {
      return { ...element, width: element.width + 4, height: element.height + 2, opacity: 0.8 };
    }
    if (emotion === '焦虑' || emotion === '烦躁') {
      return { ...element, rotation: index % 2 === 0 ? 24 : -20, x: element.x + index * 3 };
    }
    return element;
  });
};

const computeScore = (draftExists: boolean, suggestionCount: number, finalAnalysis: CompositionAnalysis) => {
  let score = 28;
  if (draftExists) {
    score += 22;
  }
  if (finalAnalysis.totalShapes >= 5) {
    score += 20;
  }
  if (suggestionCount > 0) {
    score += 18;
  }
  if (finalAnalysis.blankRatio > 0.24 && finalAnalysis.density < 0.7) {
    score += 12;
  }
  return clamp(Math.round(score), 0, 100);
};

const createDrawnElement = (
  type: ShapeType,
  fill: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  existingId?: string,
): GeometryElement => {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const width = Math.abs(deltaX);
  const height = Math.abs(deltaY);

  if (type === 'line') {
    const distance = clamp(Math.hypot(deltaX, deltaY), 2, 72);
    const lineHeight = clamp(Math.max(height * 0.16, 1.6), 1.6, 8);
    return {
      id: existingId ?? `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      type,
      x: clamp((startX + endX) / 2, 4, 96),
      y: clamp((startY + endY) / 2, 4, 96),
      width: distance,
      height: lineHeight,
      rotation: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
      fill,
      opacity: 0.92,
      cornerRadius: 0,
    };
  }

  return {
    id: existingId ?? `${type}_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    type,
    x: clamp(Math.min(startX, endX) + clamp(width, 4, 72) / 2, 4, 96),
    y: clamp(Math.min(startY, endY) + clamp(height, type === 'block' ? 4 : 3, 72) / 2, 4, 96),
    width: clamp(width, 4, 72),
    height: clamp(height, type === 'block' ? 4 : 3, 72),
    rotation: 0,
    fill,
    opacity: 0.92,
    cornerRadius: type === 'rounded-rect' ? 24 : type === 'block' ? 10 : 0,
  };
};

const normalizeDoodlePoints = (points: CanvasPoint[]) => points.map((point) => ({
  x: clamp(point.x, 4, 96),
  y: clamp(point.y, 4, 96),
}));

const getDoodleBounds = (points: CanvasPoint[]) => {
  const safePoints = normalizeDoodlePoints(points);
  const xs = safePoints.map((point) => point.x);
  const ys = safePoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(0.8, maxX - minX);
  const height = Math.max(0.8, maxY - minY);
  return {
    points: safePoints,
    minX,
    minY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
};

const createDoodleElementFromPoints = (
  points: CanvasPoint[],
  fill: string,
  strokeWidth = 2.4,
  existingId?: string,
): GeometryElement => {
  const bounds = getDoodleBounds(points);
  return {
    id: existingId ?? `line_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    type: 'line',
    x: bounds.centerX,
    y: bounds.centerY,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    fill,
    opacity: 0.95,
    cornerRadius: 0,
    isStroke: true,
    doodlePoints: bounds.points,
    doodleWidth: clamp(strokeWidth, 1.2, 6),
  };
};

const appendDoodlePoint = (element: GeometryElement, point: CanvasPoint, minDistance = 0.2): GeometryElement => {
  const currentPoints = element.doodlePoints || [];
  const safePoint = { x: clamp(point.x, 4, 96), y: clamp(point.y, 4, 96) };
  if (currentPoints.length > 0) {
    const lastPoint = currentPoints[currentPoints.length - 1];
    if (Math.hypot(safePoint.x - lastPoint.x, safePoint.y - lastPoint.y) < minDistance) {
      return element;
    }
  }
  const nextPoints = [...currentPoints, safePoint];
  return createDoodleElementFromPoints(nextPoints, element.fill, element.doodleWidth ?? element.height, element.id);
};

const ShapePreview: React.FC<{
  element: GeometryElement;
  selected: boolean;
  focused?: boolean;
  interactive?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}> = ({ element, selected, focused = false, interactive = true, onPointerDown, onSelect }) => {
  const hasDoodlePath = Boolean(element.doodlePoints && element.doodlePoints.length > 1);
  const baseStyle: React.CSSProperties = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    opacity: element.opacity,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
    backgroundColor: hasDoodlePath ? 'transparent' : element.fill,
    borderRadius: element.type === 'circle' ? '999px' : `${element.cornerRadius}px`,
    clipPath: element.type === 'triangle' ? getSoftTrianglePolygon((element.cornerRadius || 0) / 32) : undefined,
  };

  if (element.type === 'line') {
    baseStyle.borderRadius = hasDoodlePath ? '0' : '999px';
  }

  const doodlePathPoints = hasDoodlePath
    ? (element.doodlePoints || []).map((point) => {
      const left = element.x - element.width / 2;
      const top = element.y - element.height / 2;
      const localX = ((point.x - left) / Math.max(element.width, 0.8)) * 100;
      const localY = ((point.y - top) / Math.max(element.height, 0.8)) * 100;
      return `${clamp(localX, 0, 100)},${clamp(localY, 0, 100)}`;
    }).join(' ')
    : '';

  return (
    <button
      type="button"
      className={`absolute cursor-grab ${
        element.isStroke
          ? selected
            ? 'border-0 shadow-[0_0_0_2px_rgba(15,23,42,0.25)]'
            : focused
              ? 'border-0 shadow-[0_0_0_3px_rgba(251,191,36,0.35)]'
              : 'border-0'
          : selected
            ? 'border-2 border-slate-900/60 shadow-[0_0_0_3px_rgba(255,255,255,0.6)]'
            : focused
              ? 'border-2 border-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.28)]'
              : 'border-2 border-white/50'
      } ${interactive ? 'touch-none select-none active:cursor-grabbing' : 'pointer-events-none'}`}
      style={baseStyle}
      onPointerDown={interactive ? onPointerDown : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-label={SHAPE_LABELS[element.type]}
    >
      {hasDoodlePath ? (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline
            points={doodlePathPoints}
            fill="none"
            stroke={element.fill}
            strokeWidth={Math.max(0.9, ((element.doodleWidth ?? 2.4) / Math.max(element.height, 0.8)) * 100)}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
};

export const EmotionGeometryWorkshopGame: React.FC = () => {
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const startedAtRef = useRef(Date.now());
  const drawingDraftRef = useRef<DrawingDraft | null>(null);
  const doodleDraftRef = useRef<DoodleDraft | null>(null);
  const eraserDraftRef = useRef<EraserDraft | null>(null);
  const eventLogRef = useRef<WorkshopEvent[]>([]);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionType>('平静');
  const [elements, setElements] = useState<GeometryElement[]>([]);
  const [pendingShapeType, setPendingShapeType] = useState<ShapeType | null>(null);
  const [doodleMode, setDoodleMode] = useState(false);
  const [eraserMode, setEraserMode] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState('');
  const [draftElements, setDraftElements] = useState<GeometryElement[] | null>(null);
  const [draftAnalysis, setDraftAnalysis] = useState<CompositionAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<WorkshopSuggestion[]>([]);
  const [appliedSuggestionIds, setAppliedSuggestionIds] = useState<string[]>([]);
  const [activeSuggestionId, setActiveSuggestionId] = useState('');
  const [reconstructionEdited, setReconstructionEdited] = useState(false);
  const [history, setHistory] = useState<WorkshopRecord[]>(() => loadHistory());
  const [report, setReport] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [canvasPointer, setCanvasPointer] = useState<{ x: number; y: number } | null>(null);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const [initialMultimodalState, setInitialMultimodalState] = useState<InitialMultimodalState | null>(null);
  const [fusedSupportState, setFusedSupportState] = useState<FusedSupportState | null>(null);
  const [workshopStage, setWorkshopStage] = useState<WorkshopStage>('drafting');
  const [hasManualEmotionOverride, setHasManualEmotionOverride] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [globalPolish, setGlobalPolish] = useState(0);
  const [showEmotionDetails, setShowEmotionDetails] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const elementsRef = useRef<GeometryElement[]>([]);

  const recommendation = useMemo(() => RECOMMENDATIONS[selectedEmotion], [selectedEmotion]);
  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) || null,
    [elements, selectedElementId],
  );
  const activeSuggestion = useMemo(
    () => suggestions.find((suggestion) => suggestion.id === activeSuggestionId) || null,
    [activeSuggestionId, suggestions],
  );
  const focusedSuggestionElementIds = useMemo(
    () => new Set(activeSuggestion?.targetElementIds || []),
    [activeSuggestion],
  );
  const currentAnalysis = useMemo(() => analyzeComposition(elements), [elements]);
  const interactionSummary = useMemo(
    () => summarizeInteractionLog(eventLogRef.current, startedAtRef.current),
    [interactionVersion],
  );
  const canSaveWorkshop = Boolean(draftElements && draftAnalysis && reconstructionEdited);
  const shouldExpandEmotionDetails = showEmotionDetails;

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  useEffect(() => {
    if (!selectedElementId) {
      return;
    }
    if (!elements.some((element) => element.id === selectedElementId)) {
      setSelectedElementId('');
    }
  }, [elements, selectedElementId]);

  useEffect(() => () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  const updateElement = (elementId: string, updater: (element: GeometryElement) => GeometryElement) => {
    setElements((current) => current.map((element) => (element.id === elementId ? updater(element) : element)));
  };

  const playAudioCue = (fileName: string) => {
    if (!voiceEnabled) {
      return;
    }
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
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
      currentAudioRef.current = audio;
    } catch (error) {
      console.warn('[EmotionGeometryWorkshop] Failed to play audio cue:', error);
    }
  };

  const resolveEditingStage = (
    hasDraft = Boolean(draftAnalysis),
    hasAppliedSuggestions = appliedSuggestionIds.length > 0,
  ): WorkshopStage => {
    if (hasAppliedSuggestions) {
      return 'reconstruction';
    }
    if (hasDraft) {
      return 'draft';
    }
    return 'drafting';
  };

  const markCanvasUpdated = (nextStage?: WorkshopStage) => {
    const hasDraft = Boolean(draftAnalysis);
    if (hasDraft) {
      setReconstructionEdited(true);
    }
    setWorkshopStage(nextStage ?? (hasDraft ? 'reconstruction' : resolveEditingStage()));
    setReport('');
    setSaveNotice('');
  };

  const recordWorkshopEvent = (type: WorkshopEventType) => {
    eventLogRef.current = [...eventLogRef.current, { type, at: Date.now() }];
    setInteractionVersion((current) => current + 1);
  };

  const updateElementStyle = (elementId: string, updater: (element: GeometryElement) => GeometryElement) => {
    updateElement(elementId, updater);
    recordWorkshopEvent('style_change');
    markCanvasUpdated(resolveEditingStage());
  };

  const handleEmotionSelect = (emotion: EmotionType) => {
    setHasManualEmotionOverride(true);
    setSelectedEmotion(emotion);
    setPendingShapeType(null);
    setCanvasPointer(null);
    setSaveNotice('');
    playAudioCue(emotion);
  };

  useEffect(() => {
    const nextInitialState = loadInitialMultimodalState();
    setInitialMultimodalState(nextInitialState);
    if (hasManualEmotionOverride) {
      return;
    }
    const inferredEmotion = inferInitialWorkshopEmotion(nextInitialState);
    if (inferredEmotion) {
      setSelectedEmotion(inferredEmotion as EmotionType);
    }
  }, [hasManualEmotionOverride]);

  useEffect(() => {
    const resolvedStage = workshopStage === 'saved' ? 'saved' : resolveEditingStage();
    const snapshot = buildWorkshopSnapshot(
      resolvedStage,
      selectedEmotion,
      currentAnalysis,
      interactionSummary,
      draftAnalysis,
      appliedSuggestionIds.length,
    );
    const nextFusedSupportState = fuseSupportState(
      resolvedStage,
      initialMultimodalState,
      currentAnalysis,
      interactionSummary,
      appliedSuggestionIds.length,
      draftAnalysis,
    );
    saveWorkshopStateSnapshot(snapshot);
    saveFusedSupportState(nextFusedSupportState);
    setFusedSupportState((current) => {
      if (
        current?.estimatedValence === nextFusedSupportState.estimatedValence &&
        current?.estimatedArousal === nextFusedSupportState.estimatedArousal &&
        current?.trend === nextFusedSupportState.trend &&
        current?.supportNeed === nextFusedSupportState.supportNeed &&
        current?.nextSupportAction === nextFusedSupportState.nextSupportAction &&
        current?.chatCarryoverText === nextFusedSupportState.chatCarryoverText
      ) {
        return current;
      }
      return nextFusedSupportState;
    });
  }, [
    appliedSuggestionIds.length,
    currentAnalysis,
    draftAnalysis,
    initialMultimodalState,
    interactionSummary,
    selectedEmotion,
    workshopStage,
  ]);

  useEffect(() => {
    if (!draftElements || !draftAnalysis) {
      setSuggestions([]);
      return;
    }
    setSuggestions(buildSuggestions(elements, currentAnalysis, fusedSupportState));
  }, [currentAnalysis, draftAnalysis, draftElements, fusedSupportState]);

  const addShape = (type: ShapeType) => {
    setPendingShapeType((current) => (current === type ? null : type));
    setDoodleMode(false);
    setEraserMode(false);
    setCanvasPointer(null);
    setSaveNotice('');
  };

  const toggleDoodleMode = () => {
    setDoodleMode((current) => {
      const next = !current;
      if (next) {
        setPendingShapeType(null);
        setEraserMode(false);
      }
      return next;
    });
    setCanvasPointer(null);
    setSaveNotice('');
  };

  const toggleEraserMode = () => {
    setEraserMode((current) => {
      const next = !current;
      if (next) {
        setPendingShapeType(null);
        setDoodleMode(false);
      }
      return next;
    });
    setCanvasPointer(null);
    setSaveNotice('');
  };

  const clearCanvas = () => {
    eventLogRef.current = [];
    setInteractionVersion(0);
    setElements([]);
    setPendingShapeType(null);
    setDoodleMode(false);
    setEraserMode(false);
    setCanvasPointer(null);
    setSelectedElementId('');
    setDraftElements(null);
    setDraftAnalysis(null);
    setSuggestions([]);
    setAppliedSuggestionIds([]);
    setActiveSuggestionId('');
    setReconstructionEdited(false);
    setReport('');
    setSaveNotice('');
    setFusedSupportState(null);
    setGlobalPolish(0);
    setWorkshopStage('drafting');
  };

  const applyTemplate = () => {
    const nextElements = createTemplateElements(selectedEmotion, recommendation);
    setElements(nextElements);
    setPendingShapeType(null);
    setDoodleMode(false);
    setEraserMode(false);
    setCanvasPointer(null);
    setSelectedElementId(nextElements[0]?.id || '');
    setDraftElements(null);
    setDraftAnalysis(null);
    setSuggestions([]);
    setAppliedSuggestionIds([]);
    setActiveSuggestionId('');
    setReconstructionEdited(false);
    setReport('');
    setSaveNotice('');
    recordWorkshopEvent('apply_template');
    setGlobalPolish(0);
    setWorkshopStage('drafting');
    playAudioCue(selectedEmotion);
  };

  const duplicateSelected = () => {
    if (!selectedElement) {
      return;
    }
    const duplicate = {
      ...selectedElement,
      id: `${selectedElement.type}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      x: clamp(selectedElement.x + 8, 8, 92),
      y: clamp(selectedElement.y + 6, 8, 92),
    };
    setElements((current) => [...current, duplicate]);
    setSelectedElementId(duplicate.id);
    recordWorkshopEvent('duplicate');
    markCanvasUpdated(resolveEditingStage());
  };

  const deleteSelected = () => {
    if (!selectedElement) {
      return;
    }
    setElements((current) => current.filter((element) => element.id !== selectedElement.id));
    setSelectedElementId('');
    recordWorkshopEvent('delete');
    markCanvasUpdated(resolveEditingStage());
  };

  const mirrorSelected = () => {
    if (!selectedElement) {
      return;
    }
    updateElement(selectedElement.id, (element) => ({ ...element, x: clamp(100 - element.x, 8, 92) }));
    recordWorkshopEvent('mirror');
    markCanvasUpdated(resolveEditingStage());
  };

  const repeatThree = () => {
    if (!selectedElement) {
      return;
    }
    const clones = [-14, 14].map((offset, index) => ({
      ...selectedElement,
      id: `${selectedElement.type}_${Date.now()}_${index}`,
      x: clamp(selectedElement.x + offset, 8, 92),
      y: clamp(selectedElement.y + (index === 0 ? -3 : 3), 8, 92),
      opacity: clamp(selectedElement.opacity - 0.08, 0.36, 1),
    }));
    setElements((current) => [...current, ...clones]);
    recordWorkshopEvent('repeat_three');
    markCanvasUpdated(resolveEditingStage());
  };

  const centerSelected = () => {
    if (!selectedElement) {
      return;
    }
    updateElement(selectedElement.id, (element) => ({ ...element, x: 50 }));
    recordWorkshopEvent('center');
    markCanvasUpdated(resolveEditingStage());
  };

  const applyGlobalPolish = (value: number) => {
    setGlobalPolish(value);
    setElements((current) => current.map((element) => {
      if (element.type === 'rounded-rect' || element.type === 'block' || element.type === 'triangle') {
        return { ...element, cornerRadius: value };
      }
      return element;
    }));
    recordWorkshopEvent('style_change');
    markCanvasUpdated(resolveEditingStage());
  };

  const finalizeDraft = () => {
    const snapshot = cloneElements(elements);
    const analysis = analyzeComposition(snapshot);
    setDraftElements(snapshot);
    setDraftAnalysis(analysis);
    setSuggestions(buildSuggestions(snapshot, analysis, fusedSupportState));
    setAppliedSuggestionIds([]);
    setActiveSuggestionId('');
    setReconstructionEdited(false);
    setReport('');
    setSaveNotice('');
    recordWorkshopEvent('finalize_draft');
    setWorkshopStage('draft');
  };

  const applySuggestion = (suggestionId: string) => {
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) {
      return;
    }

    if (suggestionId === 'soften-sharp') {
      playAudioCue('减少尖锐');
    } else if (suggestionId === 'spread-dense') {
      playAudioCue('拉开间距');
    } else if (suggestionId === 'repeat-comfort' || suggestionId === 'add-structure') {
      playAudioCue('节奏重复');
    }

    setAppliedSuggestionIds((current) => (current.includes(suggestionId) ? current : [...current, suggestionId]));
    setActiveSuggestionId(suggestionId);
    if (suggestion.targetElementIds[0]) {
      setSelectedElementId(suggestion.targetElementIds[0]);
    }
    recordWorkshopEvent('apply_suggestion');
    setWorkshopStage('reconstruction');
    setReport('');
    setSaveNotice('');
  };

  const saveWorkshop = async () => {
    if (!draftElements || !draftAnalysis || !reconstructionEdited) {
      return;
    }

    setSaving(true);
    try {
      recordWorkshopEvent('save');
      const finalAnalysis = analyzeComposition(elements);
      const deltaSharpness = Number((finalAnalysis.sharpness - draftAnalysis.sharpness).toFixed(3));
      const deltaDensity = Number((finalAnalysis.density - draftAnalysis.density).toFixed(3));
      const nextReport = buildReport(selectedEmotion, draftAnalysis, finalAnalysis, deltaSharpness, deltaDensity);
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const score = computeScore(Boolean(draftElements), appliedSuggestionIds.length, finalAnalysis);
      const summaryAtSave = summarizeInteractionLog(eventLogRef.current, startedAtRef.current);
      const savedSnapshot = buildWorkshopSnapshot(
        'saved',
        selectedEmotion,
        finalAnalysis,
        summaryAtSave,
        draftAnalysis,
        appliedSuggestionIds.length,
      );
      const savedFusedState = fuseSupportState(
        'saved',
        initialMultimodalState,
        finalAnalysis,
        summaryAtSave,
        appliedSuggestionIds.length,
        draftAnalysis,
      );
      saveWorkshopStateSnapshot(savedSnapshot);
      saveFusedSupportState(savedFusedState);
      const trainingSaved = await saveGameTraining(score, elapsedSeconds);

      const record: WorkshopRecord = {
        id: `record_${Date.now()}`,
        createdAt: Date.now(),
        selectedEmotion,
        recommendedStyle: recommendation,
        draftElements: cloneElements(draftElements),
        finalElements: cloneElements(elements),
        analysis: {
          draft: draftAnalysis,
          final: finalAnalysis,
          deltaSharpness,
          deltaDensity,
        },
        report: nextReport,
        trainingSaved,
        interactionSummary: summaryAtSave,
        fusedSupportState: savedFusedState,
        initialMultimodalState,
      };

      const nextHistory = [record, ...history].slice(0, 20);
      setHistory(nextHistory);
      persistHistory(nextHistory);
      setFusedSupportState(savedFusedState);
      setWorkshopStage('saved');
      setActiveSuggestionId('');
      setReport(nextReport);
      setSaveNotice(trainingSaved ? '作品已保存到本地历史，并写入训练记录。' : '作品已保存到本地历史，训练记录写入失败。');
      playAudioCue('报告重构');
    } finally {
      setSaving(false);
    }
  };

  const distancePointToSegment = (point: CanvasPoint, start: CanvasPoint, end: CanvasPoint) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    return Math.hypot(point.x - projX, point.y - projY);
  };

  const isPointNearElement = (x: number, y: number, element: GeometryElement, padding = 1.25) => {
    if (element.doodlePoints && element.doodlePoints.length > 0) {
      const threshold = Math.max(padding, (element.doodleWidth ?? element.height) / 2 + 0.6);
      if (element.doodlePoints.length === 1) {
        return Math.hypot(x - element.doodlePoints[0].x, y - element.doodlePoints[0].y) <= threshold;
      }
      for (let index = 1; index < element.doodlePoints.length; index += 1) {
        const start = element.doodlePoints[index - 1];
        const end = element.doodlePoints[index];
        if (distancePointToSegment({ x, y }, start, end) <= threshold) {
          return true;
        }
      }
      return false;
    }

    const radians = -(element.rotation * Math.PI / 180);
    const dx = x - element.x;
    const dy = y - element.y;
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
    const halfWidth = element.width / 2 + padding;
    const halfHeight = element.height / 2 + padding;

    if (element.type === 'circle') {
      const normalized = (localX * localX) / (halfWidth * halfWidth) + (localY * localY) / (halfHeight * halfHeight);
      return normalized <= 1;
    }
    if (element.type === 'line') {
      return Math.abs(localX) <= halfWidth && Math.abs(localY) <= Math.max(halfHeight, 1.2);
    }
    return Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight;
  };

  const eraseAtPoint = (x: number, y: number) => {
    const current = elementsRef.current;
    if (current.length === 0) {
      return;
    }
    const next = current.filter((element) => !isPointNearElement(x, y, element));
    if (next.length === current.length) {
      return;
    }
    elementsRef.current = next;
    setElements(next);
    setSelectedElementId((currentId) => (next.some((element) => element.id === currentId) ? currentId : ''));
    if (eraserDraftRef.current) {
      eraserDraftRef.current.erasedAny = true;
    }
  };

  const startEraserSweep = (startClientX: number, startClientY: number) => {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const toCanvasPoint = (clientX: number, clientY: number) => ({
      x: clamp((clientX - rect.left) / rect.width * 100, 4, 96),
      y: clamp((clientY - rect.top) / rect.height * 100, 4, 96),
    });
    const startPoint = toCanvasPoint(startClientX, startClientY);
    eraserDraftRef.current = {
      lastX: startPoint.x,
      lastY: startPoint.y,
      erasedAny: false,
    };
    eraseAtPoint(startPoint.x, startPoint.y);

    const eraseAlongPath = (fromX: number, fromY: number, toX: number, toY: number) => {
      const distance = Math.hypot(toX - fromX, toY - fromY);
      const steps = Math.max(1, Math.ceil(distance / 1.1));
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        const sampleX = fromX + (toX - fromX) * ratio;
        const sampleY = fromY + (toY - fromY) * ratio;
        eraseAtPoint(sampleX, sampleY);
      }
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const draft = eraserDraftRef.current;
      if (!draft) {
        return;
      }
      const point = toCanvasPoint(moveEvent.clientX, moveEvent.clientY);
      eraseAlongPath(draft.lastX, draft.lastY, point.x, point.y);
      draft.lastX = point.x;
      draft.lastY = point.y;
    };

    const handleUp = () => {
      const erasedAny = Boolean(eraserDraftRef.current?.erasedAny);
      eraserDraftRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
      if (erasedAny) {
        recordWorkshopEvent('delete');
        markCanvasUpdated(resolveEditingStage());
      }
    };

    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, elementId: string) => {
    if (eraserMode) {
      event.preventDefault();
      event.stopPropagation();
      startEraserSweep(event.clientX, event.clientY);
      return;
    }

    const rect = editorRef.current?.getBoundingClientRect();
    const targetElement = elements.find((element) => element.id === elementId);
    if (!rect || !targetElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (pendingShapeType) {
      setPendingShapeType(null);
      setCanvasPointer(null);
    }

    setSelectedElementId(elementId);

    const startX = event.clientX;
    const startY = event.clientY;
    const originX = targetElement.x;
    const originY = targetElement.y;
    const originDoodlePoints = targetElement.doodlePoints?.map((point) => ({ ...point })) || null;
    const pointerId = event.pointerId;
    const pointerTarget = event.currentTarget;
    let moved = false;

    if (pointerTarget.setPointerCapture) {
      pointerTarget.setPointerCapture(pointerId);
    }

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / rect.width * 100;
      const deltaY = (moveEvent.clientY - startY) / rect.height * 100;
      if (Math.abs(deltaX) > 0.2 || Math.abs(deltaY) > 0.2) {
        moved = true;
      }
      updateElement(elementId, (element) => ({
        ...element,
        x: clamp(originX + deltaX, 4, 96),
        y: clamp(originY + deltaY, 4, 96),
        doodlePoints: originDoodlePoints
          ? originDoodlePoints.map((point) => ({
            x: clamp(point.x + deltaX, 4, 96),
            y: clamp(point.y + deltaY, 4, 96),
          }))
          : element.doodlePoints,
      }));
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
      if (pointerTarget.releasePointerCapture) {
        pointerTarget.releasePointerCapture(pointerId);
      }
      if (moved) {
        recordWorkshopEvent('move');
        markCanvasUpdated(resolveEditingStage());
      }
    };

    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const startDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (eraserMode) {
      event.preventDefault();
      startEraserSweep(event.clientX, event.clientY);
      return;
    }

    if ((!pendingShapeType && !doodleMode) || event.target !== event.currentTarget) {
      return;
    }

    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();

    const startX = clamp((event.clientX - rect.left) / rect.width * 100, 4, 96);
    const startY = clamp((event.clientY - rect.top) / rect.height * 100, 4, 96);
    const fill = recommendation.palette[elements.length % recommendation.palette.length];

    if (doodleMode) {
      const strokeWidth = 2.4;
      const draftElement = createDoodleElementFromPoints([{ x: startX, y: startY }], fill, strokeWidth);
      doodleDraftRef.current = {
        elementId: draftElement.id,
        lastX: startX,
        lastY: startY,
        hasMoved: false,
      };
      setElements((current) => [...current, draftElement]);
      setSelectedElementId(draftElement.id);
      setSaveNotice('');

      const handleMove = (moveEvent: PointerEvent) => {
        const draft = doodleDraftRef.current;
        if (!draft) {
          return;
        }
        const currentX = clamp((moveEvent.clientX - rect.left) / rect.width * 100, 4, 96);
        const currentY = clamp((moveEvent.clientY - rect.top) / rect.height * 100, 4, 96);
        const distance = Math.hypot(currentX - draft.lastX, currentY - draft.lastY);
        if (distance < 0.12) {
          return;
        }
        const steps = Math.max(1, Math.ceil(distance / 0.55));
        setElements((current) => current.map((element) => {
          if (element.id !== draft.elementId) {
            return element;
          }
          let updated = element;
          for (let step = 1; step <= steps; step += 1) {
            const ratio = step / steps;
            updated = appendDoodlePoint(
              updated,
              {
                x: draft.lastX + (currentX - draft.lastX) * ratio,
                y: draft.lastY + (currentY - draft.lastY) * ratio,
              },
              0.16,
            );
          }
          return updated;
        }));
        draft.lastX = currentX;
        draft.lastY = currentY;
        draft.hasMoved = true;
      };

      const handleUp = () => {
        const draft = doodleDraftRef.current;
        doodleDraftRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        if (draft) {
          if (!draft.hasMoved) {
            setElements((current) => current.map((element) => (
              element.id === draft.elementId
                ? appendDoodlePoint(element, { x: clamp(draft.lastX + 0.01, 4, 96), y: draft.lastY }, 0)
                : element
            )));
          }
          recordWorkshopEvent('draw');
          markCanvasUpdated(resolveEditingStage());
        }
      };

      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
      return;
    }

    if (!pendingShapeType) {
      return;
    }
    const draftElement = createDrawnElement(pendingShapeType, fill, startX, startY, startX + 0.01, startY + 0.01);

    drawingDraftRef.current = {
      elementId: draftElement.id,
      shapeType: pendingShapeType,
      fill,
      startX,
      startY,
    };

    setElements((current) => [...current, draftElement]);
    setSelectedElementId(draftElement.id);
    setSaveNotice('');

    const handleMove = (moveEvent: PointerEvent) => {
      const draft = drawingDraftRef.current;
      if (!draft) {
        return;
      }

      const currentX = clamp((moveEvent.clientX - rect.left) / rect.width * 100, 4, 96);
      const currentY = clamp((moveEvent.clientY - rect.top) / rect.height * 100, 4, 96);

      setElements((current) => current.map((element) => (
        element.id === draft.elementId
          ? createDrawnElement(draft.shapeType, draft.fill, draft.startX, draft.startY, currentX, currentY, draft.elementId)
          : element
      )));
    };

    const handleUp = () => {
      drawingDraftRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
      recordWorkshopEvent('draw');
      markCanvasUpdated(resolveEditingStage());
    };

    document.body.style.userSelect = 'none';
    document.body.style.touchAction = 'none';
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pendingShapeType && !doodleMode && !eraserMode) {
      return;
    }

    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setCanvasPointer({
      x: clamp((event.clientX - rect.left) / rect.width * 100, 0, 100),
      y: clamp((event.clientY - rect.top) / rect.height * 100, 0, 100),
    });
  };

  const handleCanvasPointerLeave = () => {
    setCanvasPointer(null);
  };

  const latestHistory = history.slice(0, 3);
  const stageLabelMap: Record<WorkshopStage, string> = {
    drafting: '正在起稿',
    draft: '已完成首稿',
    reconstruction: '重构中',
    saved: '已保存',
  };
  const supportNeedLabelMap: Record<SupportNeed, string> = {
    comfort: '安抚',
    stabilize: '稳定',
    reflect: '反思',
    'creative-guide': '创作引导',
  };
  const actionLabelMap: Record<SupportAction, string> = {
    encourage_expression: '继续表达',
    complete_draft: '完成首稿',
    reduce_sharpness: '降低尖锐',
    increase_whitespace: '增加留白',
    add_structure: '补稳定结构',
    repeat_comfort_element: '重复舒适元素',
  };

  return (
    <PageContainer className="min-h-[80vh] overflow-y-auto pb-10 pt-6 !max-w-[1500px]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/mini-game')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-gray-600 shadow-sm transition-colors hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">情绪几何工坊</h1>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Geometry-Based Externalization</p>
              <p className="text-sm text-slate-500">用点、线、面和基础几何，把现在的感觉摆出来，再温柔地重构它。</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVoiceEnabled((current) => !current)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-all ${
              voiceEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-400'
            }`}
            aria-label={voiceEnabled ? '关闭语音提示' : '开启语音提示'}
            title={voiceEnabled ? '关闭语音提示' : '开启语音提示'}
          >
            {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>

        <section className={`${cardClass} !p-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-slate-500">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Wand2 size={16} className="text-orange-400" />
                起稿建议
              </div>
            {[recommendation.densityLabel, recommendation.rhythmLabel, recommendation.symmetryLabel].map((label) => (
              <span
                key={label}
                className="rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,241,224,0.85))] px-2.5 py-1 text-[11px] text-slate-700 ring-1 ring-white/80"
              >
                {label}
              </span>
            ))}
            </div>
            <Button className="shrink-0 !rounded-2xl !bg-[linear-gradient(135deg,#ff9aa2,#ffb347)] !px-4 !py-2 !text-sm !font-semibold !text-slate-900" onClick={applyTemplate}>
              推荐起稿
            </Button>
          </div>
        </section>

        <section className={`${cardClass} !px-4 !py-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Sparkles size={16} className="text-pink-500" />
                {initialMultimodalState ? '已识别的初始情绪' : '情绪选择'}
              </div>
              <span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-sm font-semibold text-black shadow-sm">
                {selectedEmotion}
              </span>
              <span className="text-xs text-slate-600">
                {initialMultimodalState ? '可手动微调' : '未读取到初始情绪，请手动选择'}
              </span>
              <div className="flex items-center gap-1.5">
                {recommendation.palette.slice(0, 4).map((color) => (
                  <span key={color} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
              onClick={() => setShowEmotionDetails((current) => !current)}
            >
              {shouldExpandEmotionDetails ? '收起' : '调整'}
              {shouldExpandEmotionDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {shouldExpandEmotionDetails ? (
            <div className="mt-3 rounded-2xl bg-white/72 px-3 py-3">
              <div className="text-xs font-semibold text-slate-500">推荐参数</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">{recommendation.prompt}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EMOTIONS.map((emotion) => (
                  <button
                      key={emotion}
                      type="button"
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
                        selectedEmotion === emotion
                          ? 'border border-orange-300 bg-orange-50 text-black shadow-sm'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                      }`}
                    onClick={() => handleEmotionSelect(emotion)}
                  >
                    {emotion}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-5 text-slate-700">
                <div>主形状：{recommendation.shapeFamily.map((shape) => SHAPE_LABELS[shape]).join(' / ')}</div>
                <div>辅助：{recommendation.accentShapeFamily.map((shape) => SHAPE_LABELS[shape]).join(' / ')}</div>
                <div>{recommendation.densityLabel}，{recommendation.blankLabel}</div>
                <div>{recommendation.rhythmLabel}，{recommendation.symmetryLabel}</div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="min-w-0 space-y-3">
          <div className={`${cardClass} !p-3`}>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <div className="text-sm font-semibold text-slate-700">画布与处理工作台</div>
              </div>
              <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                包含 {currentAnalysis.totalShapes} 个元素
              </div>
            </div>

            <div
              ref={editorRef}
              className={`relative h-[520px] overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(250,242,235,0.9))] touch-none select-none ${
                eraserMode ? 'cursor-not-allowed' : pendingShapeType || doodleMode ? 'cursor-crosshair' : ''
              }`}
              onPointerDown={startDraw}
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={handleCanvasPointerLeave}
              onClick={(event) => {
                if (!pendingShapeType && event.target === event.currentTarget) {
                  setSelectedElementId('');
                }
              }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,183,3,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(124,157,150,0.14),transparent_34%)]" />
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-200/70" />
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-200/70" />
              <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 rounded-full bg-white/78 p-2 shadow-sm backdrop-blur-md">
                {recommendation.palette.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-6 w-6 rounded-full ring-2 transition-transform ${
                      selectedElement?.fill === color ? 'scale-110 ring-slate-700' : 'ring-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (selectedElement) {
                        updateElementStyle(selectedElement.id, (element) => ({ ...element, fill: color }));
                      }
                    }}
                    aria-label={`切换颜色 ${color}`}
                  />
                ))}
                <div className="mx-auto h-px w-4 bg-slate-300/60" />
                <input
                  type="color"
                  className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  value={selectedElement?.fill || recommendation.palette[0]}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    if (selectedElement) {
                      updateElementStyle(selectedElement.id, (element) => ({ ...element, fill: event.target.value }));
                    }
                  }}
                  aria-label="自定义颜色"
                />
              </div>

              {(pendingShapeType || doodleMode || eraserMode) && canvasPointer ? (
                <div
                  className="pointer-events-none absolute z-20"
                  style={{ left: `${canvasPointer.x}%`, top: `${canvasPointer.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className="relative flex items-center justify-center">
                    <div className={`rounded-full border-2 bg-white/45 shadow-[0_0_0_2px_rgba(255,255,255,0.85)] ${
                      eraserMode ? 'h-8 w-8 border-rose-500/80' : 'h-7 w-7 border-slate-900/80'
                    }`}
                    />
                    <div className={`absolute rounded-full ring-2 ring-white ${
                      eraserMode ? 'h-3 w-3 bg-rose-500' : doodleMode ? 'h-2.5 w-2.5 bg-slate-700' : 'h-2.5 w-2.5 bg-orange-500'
                    }`}
                    />
                  </div>
                </div>
              ) : null}

              {activeSuggestion ? (
                <div className="pointer-events-none absolute right-4 top-4 z-20 max-w-[260px] rounded-2xl bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm ring-1 ring-amber-200">
                  <div className="font-medium text-amber-700">{activeSuggestion.title}</div>
                  <div className="mt-1 leading-5">{activeSuggestion.focusHint}</div>
                </div>
              ) : null}

              {elements.length === 0 && !pendingShapeType && !doodleMode && !eraserMode && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-slate-500">
                  <div className="text-lg font-semibold text-slate-700">先放几个基础形状吧</div>
                  <div className="mt-2 max-w-md text-sm">你不需要会画画，只要选形状、调大小、换颜色、摆位置就可以。</div>
                </div>
              )}

              {elements.map((element) => (
                <ShapePreview
                  key={element.id}
                  element={element}
                  selected={element.id === selectedElementId}
                  focused={focusedSuggestionElementIds.has(element.id)}
                  interactive={!doodleMode}
                  onPointerDown={(event) => startDrag(event, element.id)}
                  onSelect={() => setSelectedElementId(element.id)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-[26px] border border-slate-200/80 bg-white/92 px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2 overflow-x-auto">
                {(['circle', 'line', 'triangle', 'square', 'rounded-rect', 'block'] as ShapeType[]).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all ${
                      pendingShapeType === shape
                        ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200 shadow-sm'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                    onClick={() => addShape(shape)}
                    aria-label={`绘制${SHAPE_LABELS[shape]}`}
                    title={`绘制${SHAPE_LABELS[shape]}`}
                  >
                    {renderShapeGlyph(shape)}
                  </button>
                ))}

                <button
                  type="button"
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all ${
                    doodleMode
                      ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200 shadow-sm'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                  onClick={toggleDoodleMode}
                  aria-label="涂鸦"
                  title="涂鸦"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all ${
                    eraserMode
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                  onClick={toggleEraserMode}
                  aria-label="橡皮擦"
                  title="橡皮擦"
                >
                  <Eraser size={18} />
                </button>

                <div className="mx-1 h-8 w-px shrink-0 bg-slate-200" />

                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  onClick={mirrorSelected}
                  disabled={!selectedElement}
                  aria-label="镜像"
                  title="镜像"
                >
                  <ArrowRightLeft size={18} />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  onClick={repeatThree}
                  disabled={!selectedElement}
                  aria-label="重复"
                  title="重复"
                >
                  <Repeat size={18} />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  onClick={centerSelected}
                  disabled={!selectedElement}
                  aria-label="居中"
                  title="居中"
                >
                  <AlignCenter size={18} />
                </button>
                <button
                  type="button"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                  onClick={duplicateSelected}
                  disabled={!selectedElement}
                  aria-label="复制"
                  title="复制"
                >
                  <Copy size={18} />
                </button>
                <button
                  type="button"
                  className="ml-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-400 transition-colors hover:bg-rose-50"
                  onClick={clearCanvas}
                  aria-label="清空画布"
                  title="清空画布"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className={`${cardClass} mt-3`}>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="text-xs text-slate-500">画布状态</div>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                  <div>元素数量：{currentAnalysis.totalShapes}</div>
                  <div>尖锐度：{Math.round(currentAnalysis.sharpness * 100)}%</div>
                  <div>留白估计：{Math.round(currentAnalysis.blankRatio * 100)}%</div>
                </div>
              </div>
              <div className="rounded-2xl bg-white/80 p-3">
                <div className="text-xs text-slate-500">当前状态</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {eraserMode ? '橡皮擦模式' : doodleMode ? '涂鸦模式' : pendingShapeType ? `绘制 ${SHAPE_LABELS[pendingShapeType]}` : '未选绘制形状'}
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {selectedElement ? `已选中 ${SHAPE_LABELS[selectedElement.type]}` : '未选中元素'}
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {stageLabelMap[workshopStage]}
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {fusedSupportState ? `${supportNeedLabelMap[fusedSupportState.supportNeed]} / ${actionLabelMap[fusedSupportState.nextSupportAction]}` : '等待支持判断'}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className={`${cardClass} !p-3`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <DraftingCompass size={16} className="text-slate-400" />
                  点-线-面构成
                </div>
                {selectedElement ? (
                  <button type="button" className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-500" onClick={deleteSelected}>删除</button>
                ) : null}
              </div>
              {selectedElement ? (
                <div className="mt-2.5 space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span className="font-medium">{SHAPE_LABELS[selectedElement.type]}</span>
                    <span className="text-[11px] text-slate-400">拖拽微调</span>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11px] text-slate-500">颜色</div>
                    <div className="flex flex-wrap gap-1.5">
                      {recommendation.palette.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`h-6 w-6 rounded-full ring-[1.5px] shadow-sm transition-transform hover:scale-105 ${selectedElement.fill === color ? 'ring-slate-700' : 'ring-transparent'}`}
                          style={{ backgroundColor: color }}
                          onClick={() => updateElementStyle(selectedElement.id, (element) => ({ ...element, fill: color }))}
                        />
                      ))}
                      <input
                        type="color"
                        className="h-6 w-8 cursor-pointer rounded-md border-0 bg-transparent p-0"
                        value={selectedElement.fill}
                        onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, fill: event.target.value }))}
                      />
                    </div>
                  </div>

                  <label className="block text-[11px] text-slate-500">
                    宽度 {Math.round(selectedElement.width)}
                    <input
                      type="range"
                      min={6}
                      max={42}
                      value={selectedElement.width}
                      className="mt-1.5 h-1.5 w-full accent-[#2A9D8F]"
                      onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, width: Number(event.target.value) }))}
                    />
                  </label>

                  <label className="block text-[11px] text-slate-500">
                    高度 {Math.round(selectedElement.height)}
                    <input
                      type="range"
                      min={selectedElement.type === 'line' ? 1 : 4}
                      max={32}
                      value={selectedElement.height}
                      className="mt-1.5 h-1.5 w-full accent-[#2A9D8F]"
                      onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, height: Number(event.target.value) }))}
                    />
                  </label>

                  <label className="block text-[11px] text-slate-500">
                    旋转 {Math.round(selectedElement.rotation)}°
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedElement.rotation}
                      className="mt-1.5 h-1.5 w-full accent-[#2A9D8F]"
                      onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, rotation: Number(event.target.value) }))}
                    />
                  </label>

                  <label className="block text-[11px] text-slate-500">
                    透明度 {Math.round(selectedElement.opacity * 100)}%
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={Math.round(selectedElement.opacity * 100)}
                      className="mt-1.5 h-1.5 w-full accent-[#2A9D8F]"
                      onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, opacity: Number(event.target.value) / 100 }))}
                    />
                  </label>

                  {selectedElement.type === 'rounded-rect' || selectedElement.type === 'block' ? (
                    <label className="block text-[11px] text-slate-500">
                      圆角 {Math.round(selectedElement.cornerRadius)}
                      <input
                        type="range"
                        min={0}
                        max={32}
                        value={selectedElement.cornerRadius}
                        className="mt-1.5 h-1.5 w-full accent-[#2A9D8F]"
                        onChange={(event) => updateElementStyle(selectedElement.id, (element) => ({ ...element, cornerRadius: Number(event.target.value) }))}
                      />
                    </label>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2.5 text-xs leading-5 text-slate-500">点击画布中的任意形状，就可以调大小、旋转、颜色和透明度。</div>
              )}
            </div>

            <div className={cardClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText size={16} className="text-pink-400" />
                首稿摘要
              </div>
              <div className="mt-3 text-sm text-slate-600">{buildDraftSummary(currentAnalysis, interactionSummary, fusedSupportState)}</div>
              <Button className="mt-4 !text-gray-800" onClick={finalizeDraft} disabled={elements.length === 0}>
                完成首稿并生成建议
              </Button>
            </div>
            <div className={cardClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Sparkles size={16} className="text-amber-500" />
                4. 情绪重构区
              </div>
              {draftElements && draftAnalysis ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-amber-100/70 bg-amber-50/75 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">先选一个小动作</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          系统只帮你圈出值得先动的一小块，真正的调整由你来完成。
                        </div>
                      </div>
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {reconstructionEdited ? '已做过重构' : '等待你动手'}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-100/70 bg-amber-50/75 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-700">全局打磨</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          如果你想先把整张画的边缘缓一缓，可以轻轻拉一下，再继续手动整理局部。
                        </div>
                      </div>
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{globalPolish}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={32}
                      step={1}
                      value={globalPolish}
                      className="mt-3 h-2 w-full cursor-pointer rounded-lg accent-amber-500"
                      onChange={(event) => applyGlobalPolish(Number(event.target.value))}
                      onPointerUp={() => {
                        if (globalPolish > 0) {
                          playAudioCue('全局打磨');
                        }
                      }}
                    />
                  </div>

                  {suggestions.map((suggestion) => {
                    const applied = appliedSuggestionIds.includes(suggestion.id);
                    const isActive = activeSuggestionId === suggestion.id;
                    return (
                      <div
                        key={suggestion.id}
                        className={`rounded-2xl border p-3 transition-colors ${
                          isActive ? 'border-amber-300 bg-amber-50/80' : 'border-white/70 bg-white/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-800">{suggestion.title}</div>
                            <div className="mt-1 text-sm text-slate-500">{suggestion.description}</div>
                            <div className="mt-2 text-xs text-amber-700">{suggestion.focusHint}</div>
                          </div>
                          <button
                            type="button"
                            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                              isActive
                                ? 'border-amber-300 bg-amber-400 text-slate-900'
                                : applied
                                  ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                                  : 'border-amber-200 bg-amber-100 text-amber-700'
                            }`}
                            onClick={() => applySuggestion(suggestion.id)}
                          >
                            {isActive ? '正在看这块' : suggestion.actionLabel}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    你可以跟着提示改，也可以自己换一种改法。只要亲手动过这一小步，就算完成了一次重构。
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">先完成首稿，系统才会圈出值得先整理的一小块。</div>
              )}
            </div>

            <div className={cardClass}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText size={16} className="text-violet-400" />
                5. 报告与保存区
              </div>
              <div className="mt-3 rounded-2xl bg-white/80 p-3 text-sm text-slate-600">
                {draftAnalysis ? (
                  <div className="space-y-2">
                    <div>首稿之后，先亲手做一处小调整，再来保存这次变化。</div>
                    <div>
                      当前状态：{reconstructionEdited ? '你已经进入重构，可以保存了。' : '还没开始重构，先按上面的局部动作动一下。'}
                    </div>
                    {fusedSupportState ? (
                      <div>支持方向：{supportNeedLabelMap[fusedSupportState.supportNeed]} / {actionLabelMap[fusedSupportState.nextSupportAction]}</div>
                    ) : null}
                  </div>
                ) : (
                  <div>完成首稿后，这里会变成本轮重构的收尾区。</div>
                )}
              </div>

              <Button className="mt-4 !text-gray-800" onClick={saveWorkshop} disabled={!canSaveWorkshop || saving}>
                {saving ? '保存中...' : '保存这次重构'}
              </Button>

              {saveNotice ? (
                <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{saveNotice}</div>
              ) : null}

              {report ? (
                <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-4 text-sm whitespace-pre-line text-slate-100">
                  {report}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="text-sm font-semibold text-slate-700">最近 3 次本地历史</div>
          {latestHistory.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">你保存过的作品会出现在这里，方便比较自己最近的构图变化。</div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {latestHistory.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white/80 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800">{item.selectedEmotion}</span>
                    <span className="text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    元素 {item.finalElements.length} 个，尖锐度 {Math.round(item.analysis.final.sharpness * 100)}%
                  </div>
                  <div className="mt-3 line-clamp-4 text-sm text-slate-600">{item.report}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
};
