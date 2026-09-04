import React, { useState, useEffect } from 'react';
import { CharacterAttributesViewProps, CharacterAttributes } from '../types';
import { characterService } from '../services/characterService';
import { 
  User, 
  Heart, 
  MessageSquare, 
  Sparkles, 
  Edit3, 
  Save, 
  X, 
  Clock, 
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';

/**
 * CharacterAttributesView 组件
 * 在管理页面显示角色属性详情，支持属性编辑功能和预览摘要显示
 */
export const CharacterAttributesView: React.FC<CharacterAttributesViewProps> = ({
  companion,
  attributes,
  onEdit,
  readonly = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingAttributes, setEditingAttributes] = useState<CharacterAttributes | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localAttributes, setLocalAttributes] = useState<CharacterAttributes | null>(attributes);

  // 当传入的attributes变化时，更新本地状态
  useEffect(() => {
    setLocalAttributes(attributes);
  }, [attributes]);

  // 如果没有属性，尝试从服务加载
  useEffect(() => {
    if (!localAttributes && companion && !loading) {
      loadAttributes();
    }
  }, [companion, localAttributes]);

  const loadAttributes = async () => {
    if (!companion) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const attrs = await characterService.getAttributes(companion.id);
      setLocalAttributes(attrs);
    } catch (err) {
      console.error('Failed to load attributes:', err);
      setError('加载角色属性失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (!localAttributes) return;
    setEditingAttributes({ ...localAttributes });
    setIsEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!editingAttributes || !companion) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await characterService.updateAttributes(companion.id, editingAttributes);
      setLocalAttributes(editingAttributes);
      setIsEditing(false);
      setSuccess('角色属性已成功更新');
      
      // 通知父组件
      if (onEdit) {
        onEdit(editingAttributes);
      }

      // 3秒后清除成功消息
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to update attributes:', err);
      setError('更新角色属性失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingAttributes(null);
    setError(null);
    setSuccess(null);
  };

  const handleInputChange = (field: keyof CharacterAttributes, value: string | string[]) => {
    if (!editingAttributes) return;
    
    setEditingAttributes({
      ...editingAttributes,
      [field]: value,
      updatedAt: Date.now()
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const getAttributesSummary = () => {
    if (!localAttributes) return '暂无角色属性';
    
    const { personality, background, speakingStyle, interests } = localAttributes;
    const summary = [
      personality ? `性格：${personality.substring(0, 20)}...` : '',
      background ? `背景：${background.substring(0, 20)}...` : '',
      speakingStyle ? `风格：${speakingStyle.substring(0, 15)}...` : '',
      interests?.length ? `兴趣：${interests.slice(0, 2).join('、')}${interests.length > 2 ? '等' : ''}` : ''
    ].filter(Boolean);
    
    return summary.join(' | ') || '基础属性已设置';
  };

  // 加载状态
  if (loading && !localAttributes) {
    return (
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex items-center justify-center gap-3 text-white/60">
          <Loader2 size={20} className="animate-spin" />
          <span>加载角色属性中...</span>
        </div>
      </div>
    );
  }

  // 没有属性的状态
  if (!localAttributes) {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-white/10">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
            <User size={24} className="text-white/40" />
          </div>
          <h3 className="text-lg font-medium text-white/80 mb-2">暂无角色属性</h3>
          <p className="text-sm text-white/50 mb-4">
            该角色尚未生成详细属性，可以在创建页面添加人物描述来生成。
          </p>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg mb-4">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 状态消息 */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-3 rounded-xl border border-red-500/20">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 px-4 py-3 rounded-xl border border-green-500/20">
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      {/* 主要内容区域 */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">角色属性详情</h3>
              <p className="text-xs text-white/50">
                {companion.name} 的个性化设定
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 展开/收起按钮 */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              title={isExpanded ? "收起详情" : "展开详情"}
            >
              {isExpanded ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            
            {/* 编辑按钮 */}
            {!readonly && !isEditing && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors text-sm"
              >
                <Edit3 size={14} />
                编辑
              </button>
            )}
            
            {/* 编辑模式按钮 */}
            {isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors text-sm disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors text-sm"
                >
                  <X size={14} />
                  取消
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 摘要预览 */}
        {!isExpanded && (
          <div className="relative z-10">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-sm text-white/70 leading-relaxed">
                {getAttributesSummary()}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  <span>更新于 {formatDate(localAttributes.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  <span>版本 {localAttributes.version}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 详细内容 */}
        {isExpanded && (
          <div className="space-y-6 relative z-10">
            {/* 基本信息 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 性格特征 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Heart size={16} className="text-pink-400" />
                  <label className="text-sm font-medium text-white/80">性格特征</label>
                </div>
                {isEditing ? (
                  <textarea
                    value={editingAttributes?.personality || ''}
                    onChange={(e) => handleInputChange('personality', e.target.value)}
                    className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                    placeholder="描述角色的性格特征..."
                  />
                ) : (
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <p className="text-sm text-white/70 leading-relaxed">
                      {localAttributes.personality}
                    </p>
                  </div>
                )}
              </div>

              {/* 说话风格 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-blue-400" />
                  <label className="text-sm font-medium text-white/80">说话风格</label>
                </div>
                {isEditing ? (
                  <textarea
                    value={editingAttributes?.speakingStyle || ''}
                    onChange={(e) => handleInputChange('speakingStyle', e.target.value)}
                    className="w-full h-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                    placeholder="描述角色的说话风格..."
                  />
                ) : (
                  <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                    <p className="text-sm text-white/70 leading-relaxed">
                      {localAttributes.speakingStyle}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 背景故事 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User size={16} className="text-green-400" />
                <label className="text-sm font-medium text-white/80">背景故事</label>
              </div>
              {isEditing ? (
                <textarea
                  value={editingAttributes?.background || ''}
                  onChange={(e) => handleInputChange('background', e.target.value)}
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                  placeholder="描述角色的背景故事..."
                />
              ) : (
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <p className="text-sm text-white/70 leading-relaxed">
                    {localAttributes.background}
                  </p>
                </div>
              )}
            </div>

            {/* 兴趣爱好 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-yellow-400" />
                <label className="text-sm font-medium text-white/80">兴趣爱好</label>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={editingAttributes?.interests?.join(', ') || ''}
                  onChange={(e) => handleInputChange('interests', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                  placeholder="用逗号分隔多个兴趣爱好，如：读书, 音乐, 绘画"
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {localAttributes.interests?.map((interest, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 rounded-full text-xs border border-purple-500/30"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 扩展字段 */}
            {(localAttributes.catchphrases?.length || localAttributes.emotionalTendency || localAttributes.responseStyle) && (
              <div className="pt-4 border-t border-white/10">
                <h4 className="text-sm font-medium text-white/60 mb-4">扩展属性</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {localAttributes.catchphrases?.length && (
                    <div>
                      <span className="text-white/40">口头禅：</span>
                      <div className="mt-1 space-y-1">
                        {localAttributes.catchphrases.map((phrase, index) => (
                          <div key={index} className="bg-white/5 px-2 py-1 rounded text-white/60">
                            "{phrase}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {localAttributes.emotionalTendency && (
                    <div>
                      <span className="text-white/40">情感倾向：</span>
                      <div className="mt-1 bg-white/5 px-2 py-1 rounded text-white/60">
                        {localAttributes.emotionalTendency}
                      </div>
                    </div>
                  )}
                  {localAttributes.responseStyle && (
                    <div>
                      <span className="text-white/40">回应风格：</span>
                      <div className="mt-1 bg-white/5 px-2 py-1 rounded text-white/60">
                        {localAttributes.responseStyle}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 元数据 */}
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between text-xs text-white/40">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>创建于 {formatDate(localAttributes.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>更新于 {formatDate(localAttributes.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  <span>版本 {localAttributes.version}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterAttributesView;