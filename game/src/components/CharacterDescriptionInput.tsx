import React, { useState } from 'react';
import { AlertCircle, Mic, Sparkles, User } from 'lucide-react';

interface CharacterDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  onGenerate?: (description: string) => void;
  isGenerating?: boolean;
  isListening?: boolean;
  onVoiceInput?: () => void;
  title?: string;
  description?: string;
  tips?: string[];
}

export const CharacterDescriptionInput: React.FC<CharacterDescriptionInputProps> = ({
  value,
  onChange,
  placeholder = '例如：我想和孔子对话',
  maxLength = 500,
  disabled = false,
  onGenerate,
  isGenerating = false,
  isListening = false,
  onVoiceInput,
  title = '角色请求',
  description = '输入一句自然语言请求，系统会自动识别角色并生成档案。',
  tips = [
    '例如：我想和孔子对话',
    '系统会自动提取角色，并继续生成角色档案与 3D 模型',
  ],
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const characterCount = value.length;
  const isOverLimit = characterCount > maxLength;
  const isNearLimit = characterCount > maxLength * 0.8;

  const handleGenerate = () => {
    if (value.trim() && onGenerate && !isGenerating) {
      onGenerate(value.trim());
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500">
          <User size={16} className="text-white" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
          <p className="text-xs text-gray-600/70">{description}</p>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled || isGenerating}
          className={`
            h-24 w-full resize-none rounded-xl border bg-white/70 px-4 py-3 pr-14 text-gray-700 placeholder-gray-400
            transition-all duration-200 focus:outline-none focus:ring-2
            ${isFocused ? 'border-purple-500/50 focus:ring-purple-500/20' : 'border-pink-300/40'}
            ${isOverLimit ? 'border-red-500/50 focus:ring-red-500/20' : ''}
            ${disabled || isGenerating ? 'cursor-not-allowed opacity-50' : ''}
          `}
        />

        {onVoiceInput && (
          <button
            type="button"
            onClick={onVoiceInput}
            disabled={disabled || isGenerating}
            title={isListening ? '停止语音输入' : '开始语音输入'}
            className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              isListening
                ? 'bg-red-500 text-white shadow-lg'
                : 'bg-white/80 text-gray-600 hover:bg-white'
            } ${disabled || isGenerating ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <Mic size={16} className={isListening ? 'animate-pulse' : ''} />
          </button>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {isOverLimit && <AlertCircle size={14} className="text-red-400" />}
          <span
            className={`text-xs ${
              isOverLimit ? 'text-red-600' : isNearLimit ? 'text-yellow-600' : 'text-gray-500'
            }`}
          >
            {characterCount}/{maxLength}
          </span>
        </div>
      </div>

      {isOverLimit && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertCircle size={14} />
          <span>内容过长，请精简到 {maxLength} 字以内</span>
        </div>
      )}

      {onGenerate && (
        <button
          onClick={handleGenerate}
          disabled={!value.trim() || isOverLimit || disabled || isGenerating}
          className={`
            flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200
            ${
              !value.trim() || isOverLimit || disabled || isGenerating
                ? 'cursor-not-allowed bg-white/40 text-gray-400'
                : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg hover:from-purple-600 hover:to-blue-600 hover:shadow-xl'
            }
          `}
        >
          {isGenerating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>正在生成角色档案...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>生成角色档案</span>
            </>
          )}
        </button>
      )}

      <div className="space-y-1 text-xs text-gray-600/70">
        {tips.map((tip) => (
          <p key={tip}>{tip}</p>
        ))}
      </div>
    </div>
  );
};

export default CharacterDescriptionInput;
