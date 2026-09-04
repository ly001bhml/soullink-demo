import React, { useState } from 'react';
import { ProcessStep } from '@mesh2motion/lib/enums/ProcessStep.ts';
import { Button } from './ui';
import { Upload, RotateCw, Move, Edit, Undo2, Redo2, Download, Eye, Play, MessageCircle } from 'lucide-react';

interface Mesh2MotionControlsProps {
  currentStep: ProcessStep;
  onBindingComplete?: (idleModelUrl?: string, talkingModelUrl?: string) => void;
}

// 隐藏滚动条的样式
const hideScrollbarStyle: React.CSSProperties = {
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
};

/**
 * Mesh2MotionControls 组件
 * 使用标签页设计，每个步骤显示核心功能，更紧凑的布局
 * 
 * @param currentStep - 当前的处理步骤
 * @param onBindingComplete - 绑定完成时的回调函数，用于进入对话页面
 */
export const Mesh2MotionControls: React.FC<Mesh2MotionControlsProps> = ({ currentStep, onBindingComplete }) => {
  // 直接使用 currentStep，不维护独立状态，确保与引擎同步
  const activeTab = currentStep;

  const steps: { step: ProcessStep; label: string; index: string }[] = [
    { step: ProcessStep.LoadModel, label: '加载模型', index: '1/5' },
    { step: ProcessStep.LoadSkeleton, label: '加载骨骼', index: '2/5' },
    { step: ProcessStep.EditSkeleton, label: '编辑骨骼', index: '3/5' },
    { step: ProcessStep.BindPose, label: '绑定姿态', index: '4/5' },
    { step: ProcessStep.AnimationsListing, label: '动画列表', index: '5/5' },
  ];

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col" style={{ height: '500px', maxHeight: '500px' }}>
      {/* 标签页导航栏 */}
      <div className="flex-shrink-0 border-b border-white/10 bg-white/5">
        <div className="flex overflow-x-auto" style={hideScrollbarStyle}>
          {steps.map(({ step, label, index }) => (
            <div
              key={step}
              className={`
                flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors border-b-2 cursor-default
                ${activeTab === step
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-transparent text-white/30'
                }
              `}
            >
              <span className="block">{index}</span>
              <span className="block mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 步骤指示器（供 Mesh2Motion 查找） */}
      <div className="hidden">
        <span id="current-step-index">{steps.find(s => s.step === activeTab)?.index || '1/5'}</span>
        <span id="current-step-label">{steps.find(s => s.step === activeTab)?.label || '加载模型'}</span>
      </div>

      {/* 内容区域 - 固定高度，可滚动 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 'calc(600px - 120px)' }}>
        {/* Load Model 面板 */}
        <div id="load-model-tools" style={{ display: activeTab === ProcessStep.LoadModel ? 'flex' : 'none' }} className="flex-col gap-3">
          <div>
            <input 
              id="model-upload" 
              type="file" 
              accept=".glb,.zip,.fbx" 
              className="hidden"
            />
            <label htmlFor="model-upload" className="block cursor-pointer">
              <Button variant="secondary" className="w-full pointer-events-none text-sm py-2">
                <Upload size={14} />
                上传模型
              </Button>
            </label>
          </div>

          <div className="text-center text-white/40 text-xs py-1">或</div>

          <div className="space-y-2">
            <p className="text-xs text-white/60">参考模型</p>
            <select 
              id="model-selection" 
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
            >
              <option value="models/model-human.glb">Human</option>
              <option value="models/model-fox.glb">Fox</option>
              <option value="models/model-bird.glb">Bird</option>
              <option value="models/model-dragon.glb">Dragon</option>
            </select>
            <Button id="load-model-button" variant="primary" className="w-full text-sm py-2">
              加载模型
            </Button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input 
              type="checkbox" 
              id="load-model-debug-checkbox" 
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
            />
            <label htmlFor="load-model-debug-checkbox" className="text-xs text-white/70">
              Debug 模式
            </label>
          </div>
        </div>

        {/* Load Skeleton 面板 */}
        <div id="load-skeleton-tools" style={{ display: activeTab === ProcessStep.LoadSkeleton ? 'flex' : 'none' }} className="flex-col gap-3">
          <div>
            <p className="text-xs text-white/60 mb-1.5">旋转模型</p>
            <div className="flex gap-1.5">
              <Button id="rotate-model-x-button" variant="secondary" size="sm" className="flex-1 text-xs py-1.5">
                X
              </Button>
              <Button id="rotate-model-y-button" variant="secondary" size="sm" className="flex-1 text-xs py-1.5">
                Y
              </Button>
              <Button id="rotate-model-z-button" variant="secondary" size="sm" className="flex-1 text-xs py-1.5">
                Z
              </Button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-2">
            <Button id="move-model-to-floor-button" variant="secondary" className="w-full text-xs py-2">
              <Move size={12} />
              移动到地面
            </Button>
          </div>

          <div className="border-t border-white/10 pt-2 space-y-2">
            <p className="text-xs text-white/60">骨骼模板</p>
            <select 
              id="skeleton-selection" 
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
            >
              <option value="select-skeleton">选择骨骼</option>
              <option value="human">Human</option>
              <option value="quadraped">4 Leg Creature</option>
              <option value="bird">Bird</option>
              <option value="dragon">Dragon</option>
            </select>
          </div>

          {/* 手部骨骼选项 */}
          <div id="hand-skeleton-options" className="bg-white/5 border border-white/10 rounded-lg p-2 space-y-1.5" style={{ display: 'none' }}>
            <span className="text-xs text-white/60">手部选项</span>
            <select 
              id="hand-skeleton-selection" 
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50"
            >
              <option value="all-fingers">All Fingers</option>
              <option value="thumb-and-index">Thumb + Main Finger</option>
              <option value="simplified-hand">All Fingers - Simplified</option>
              <option value="single-bone">Single Hand Bone</option>
            </select>
          </div>

          {/* 骨骼缩放控制 */}
          <div id="scale-skeleton-controls" className="border-t border-white/10 pt-2 space-y-1.5" style={{ display: 'none' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">缩放骨骼</span>
              <Button id="reset-skeleton-scale-button" variant="secondary" size="sm" className="px-2 py-1">
                <RotateCw size={12} />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span id="scale-skeleton-percentage-display" className="text-xs text-white/70 w-10">100%</span>
              <input 
                id="scale-skeleton-input" 
                type="range" 
                min="0.10" 
                max="2.00" 
                defaultValue="1.0" 
                step="0.01"
                className="flex-1"
              />
            </div>
          </div>

          <div className="border-t border-white/10 pt-2 flex gap-1.5">
            <Button id="action_back_to_load_model" variant="secondary" size="sm" className="text-xs py-1.5">
              ← 返回
            </Button>
            <Button id="load-skeleton-button" variant="primary" className="flex-1 text-xs py-1.5">
              <Edit size={12} />
              编辑骨骼 →
            </Button>
          </div>
        </div>

        {/* Edit Skeleton 面板 */}
        <div id="skeleton-step-actions" style={{ display: activeTab === ProcessStep.EditSkeleton ? 'flex' : 'none' }} className="flex-col gap-3">
          <div className="flex gap-1.5">
            <Button id="undo-button" variant="secondary" size="sm" title="撤销 (Ctrl+Z)" className="text-xs py-1.5">
              <Undo2 size={12} />
            </Button>
            <Button id="redo-button" variant="secondary" size="sm" title="重做 (Ctrl+Y)" className="text-xs py-1.5">
              <Redo2 size={12} />
            </Button>
          </div>

          <div className="border-t border-white/10 pt-2">
            <p className="text-xs text-white/60 mb-1">选中的骨骼</p>
            <span id="edit-selected-bone-label" className="text-sm text-white font-medium">
              None
            </span>
          </div>

          {/* 网格预览模式切换 */}
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs text-white/60 mb-1.5">预览模式</p>
            <div id="mesh-preview-group" className="flex gap-1.5">
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="mesh-preview-type" 
                  value="weight-painted" 
                  id="preview-painted"
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  权重
                </div>
              </label>
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="mesh-preview-type" 
                  value="textured" 
                  id="preview-textured"
                  defaultChecked
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  纹理
                </div>
              </label>
            </div>
          </div>

          {/* 变换控制类型 */}
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs text-white/60 mb-1.5">变换类型</p>
            <div id="transform-control-type-group" className="flex gap-1.5">
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="transform-control-type" 
                  value="translate" 
                  id="transform-translate"
                  defaultChecked
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  移动
                </div>
              </label>
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="transform-control-type" 
                  value="rotation" 
                  id="transform-rotate"
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  旋转
                </div>
              </label>
            </div>
          </div>

          {/* 变换空间 */}
          <div className="border-t border-white/10 pt-2">
            <p className="text-xs text-white/60 mb-1.5">变换空间</p>
            <div id="transform-space-group" className="flex gap-1.5">
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="transform-space" 
                  value="global" 
                  id="transform-global"
                  defaultChecked
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  全局
                </div>
              </label>
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="transform-space" 
                  value="local" 
                  id="transform-local"
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50 text-center text-xs text-white/70 peer-checked:text-white">
                  局部
                </div>
              </label>
            </div>
          </div>

          {/* 镜像骨骼 */}
          <div className="border-t border-white/10 pt-2 flex items-center gap-2">
            <input 
              type="checkbox" 
              id="mirror-skeleton" 
              defaultChecked
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
            />
            <label htmlFor="mirror-skeleton" className="text-xs text-white/70">
              镜像左右关节
            </label>
          </div>

          {/* 头部权重校正 */}
          <div id="use-head-weight-correction-container" className="border-t border-white/10 pt-2 space-y-1.5" style={{ display: 'none' }}>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="preview-plane-checkbox" 
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
              />
              <label htmlFor="preview-plane-checkbox" className="text-xs text-white/70">
                头部权重校正
              </label>
            </div>
            <div id="preview-plane-setting-container" className="flex items-center gap-2">
              <label htmlFor="preview-plane-height-input" className="text-xs text-white/60">高度:</label>
              <input 
                type="range" 
                id="preview-plane-height-input" 
                min="0.20" 
                max="2.00" 
                step="0.01" 
                defaultValue="0.50"
                className="flex-1"
              />
              <span id="preview-plane-height-label" className="text-xs text-white/70 w-10">0.50</span>
            </div>
          </div>

          {/* 隐藏的算法选择器（用于兼容旧代码） */}
          <select id="skinning-algorithm-options" className="hidden">
            <option value="closest-distance-targeting">Closest Distance Targeting</option>
          </select>

          <button id="action_move_to_origin" className="hidden"></button>
          <input type="checkbox" id="debug-skinning-checkbox" className="hidden" />

          <div className="border-t border-white/10 pt-2 flex gap-1.5">
            <Button id="action_back_to_load_skeleton" variant="secondary" size="sm" className="text-xs py-1.5">
              ← 返回
            </Button>
            <Button id="action_bind_pose" variant="primary" className="flex-1 text-xs py-1.5">
              绑定姿态
            </Button>
          </div>
        </div>

        {/* Bind Pose 面板 */}
        {activeTab === ProcessStep.BindPose && (
          <div className="space-y-3">
            <p className="text-sm text-white/60 text-center py-4">正在处理绑定姿态...</p>
          </div>
        )}

        {/* Animations Listing 面板 */}
        <div id="skinned-step-animation-export-options" style={{ display: activeTab === ProcessStep.AnimationsListing ? 'flex' : 'none' }} className="flex-col gap-3">
          <div id="animations-listing" className="space-y-3">
            {/* 动画过滤 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-white/60">动画列表</span>
                <span id="animation-listing-count" className="text-xs text-white/40">0</span>
              </div>
              <input 
                type="text" 
                id="animation-filter" 
                placeholder="过滤动画..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* 加载进度 */}
            <div id="animation-progress-loader-container" className="hidden space-y-1.5">
              <div id="loading-status-text" className="text-xs text-white/60">加载动画数据</div>
              <div id="loading-progress-bar" className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all"></div>
              </div>
              <div id="current-file-progress-bar" className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary/50 transition-all"></div>
              </div>
            </div>

            {/* 动画列表容器 */}
            <div id="animations-items" className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {/* 动画列表将由 Mesh2Motion 动态填充 */}
            </div>

            {/* A-Pose 校正选项 */}
            <div id="a-pose-correction-options" className="border-t border-white/10 pt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/60">A-Pose 校正</span>
                <Button id="reset-a-pose-button" variant="secondary" size="sm" className="px-2 py-1">
                  <RotateCw size={12} />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  id="extend-arm-numeric-input" 
                  min="-70" 
                  max="100" 
                  defaultValue="0"
                  className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                />
                <span className="text-xs text-white/60">%</span>
                <input 
                  id="extend-arm-range-input" 
                  type="range" 
                  min="-70" 
                  max="100" 
                  defaultValue="0"
                  className="flex-1"
                />
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="border-t border-white/10 pt-2 flex flex-wrap gap-1.5">
              <Button id="action_back_to_edit_skeleton" variant="secondary" size="sm" className="text-xs py-1.5">
                ← 返回
              </Button>
              
              <label className="cursor-pointer">
                <input 
                  type="checkbox" 
                  id="mirror-animations-checkbox" 
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50">
                  <Eye size={12} className="text-white/70" />
                </div>
              </label>

              <label className="cursor-pointer">
                <input 
                  type="checkbox" 
                  id="show-skeleton-checkbox" 
                  className="hidden peer"
                />
                <div className="px-2 py-1.5 rounded-lg border border-white/10 bg-white/5 peer-checked:bg-primary/20 peer-checked:border-primary/50">
                  <Eye size={12} className="text-white/70" />
                </div>
              </label>

              <Button id="export-button" variant="secondary" className="flex-1 text-xs py-1.5">
                <Download size={12} />
                导出 <span id="animation-selection-count">0</span>
              </Button>
              
              {/* 进入对话按钮 */}
              <Button 
                onClick={() => {
                  console.log('Mesh2MotionControls - Enter chat button clicked');
                  onBindingComplete?.();
                }}
                variant="primary" 
                className="flex-1 text-xs py-1.5"
              >
                <MessageCircle size={12} />
                进入对话
              </Button>
            </div>

            {/* 隐藏的下载链接 */}
            <a id="download-hidden-link" href="#" className="hidden"></a>
          </div>
        </div>
      </div>

      {/* 动画播放器（固定在底部） */}
      <div id="animation-player" className="flex-shrink-0 border-t border-white/10 p-2 bg-white/5">
        <div className="space-y-1.5">
          <div id="current-animation-container" className="text-center">
            <span id="current-animation-name" className="text-xs text-white/60">未选择动画</span>
          </div>
          <div id="play-controls" className="flex items-center gap-1.5">
            <Button id="play-pause-button" variant="secondary" size="sm" disabled className="px-2 py-1">
              <Play size={12} />
            </Button>
            <span className="text-xs text-white/60">
              <span id="current-time">0f</span> / <span id="total-time">0f</span>
            </span>
            <input 
              type="range" 
              id="animation-scrubber" 
              min="0" 
              max="100" 
              defaultValue="0"
              disabled
              className="flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
