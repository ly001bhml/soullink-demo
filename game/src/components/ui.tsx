import React from 'react';
import { Loader2, X } from 'lucide-react';

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', size = 'md', isLoading, className, ...props 
}) => {
  const baseStyles = "rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2",
    lg: "px-6 py-3 text-lg"
  };

  const variants = {
    primary: "bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/25 hover:shadow-primary/40",
    secondary: "bg-white/10 text-white hover:bg-white/20 backdrop-blur-md",
    outline: "border border-white/20 text-white hover:bg-white/5",
    ghost: "text-white/70 hover:text-white hover:bg-white/5",
  };

  return (
    <button 
      className={`${baseStyles} ${sizeStyles[size]} ${variants[variant]} ${className || ''}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm text-gray-300 mb-1 ml-1">{label}</label>}
      <input 
        className={`w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all ${className}`}
        {...props}
      />
    </div>
  );
};

// --- Modal ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 追加到弹层面板上的 class（如 max-w-lg） */
  panelClassName?: string;
  /**
   * dark：深蓝面板（默认，适合多数设置类弹窗）
   * light：与主导航一致的浅玻璃风格，正文对比度更高
   */
  variant?: 'dark' | 'light';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  panelClassName,
  variant = 'dark',
}) => {
  if (!isOpen) return null;

  const isLight = variant === 'light';
  const panelTone = isLight
    ? 'border-pink-200/50 bg-white/95 text-gray-800 shadow-2xl backdrop-blur-xl'
    : 'border-white/10 bg-[#1a1744] text-slate-100 shadow-2xl';
  const titleTone = isLight ? 'text-gray-900' : 'text-white';
  const closeTone = isLight
    ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
    : 'text-slate-400 hover:bg-white/10 hover:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 backdrop-blur-sm ${isLight ? 'bg-black/35' : 'bg-black/60'}`}
        onClick={onClose}
      />
      <div
        className={`relative max-h-[min(90dvh,840px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border p-6 animate-float [-webkit-overflow-scrolling:touch] ${panelTone} ${panelClassName || ''}`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className={`text-xl font-bold tracking-tight ${titleTone}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg p-1 transition-colors ${closeTone}`}
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// --- Page Container ---
export const PageContainer: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
  <div className={`h-full min-h-0 w-full max-w-4xl mx-auto overflow-hidden p-4 pb-24 animate-[fadeIn_0.5s_ease-out] [-webkit-overflow-scrolling:touch] md:p-8 md:pb-28 ${className}`}>
    {children}
  </div>
);
