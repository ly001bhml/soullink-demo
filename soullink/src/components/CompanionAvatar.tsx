import React, { useState } from 'react';

/**
 * ??????????? URL ????????????????
 * @param avatarUrl - ?????????
 * @param name - ???????????
 * @param size - 'sm' ???? | 'md' ????
 */
export const CompanionAvatar: React.FC<{ avatarUrl?: string; name: string; size?: 'sm' | 'md' }> = ({ avatarUrl, name, size = 'sm' }) => {
  const [failed, setFailed] = useState(false);
  const showImg = avatarUrl && !failed;
  const sizeClass = size === 'sm' ? 'w-10 h-10' : 'w-16 h-16';
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <div className={`${sizeClass} rounded-full overflow-hidden flex items-center justify-center bg-white/10 text-white/60 shrink-0 ${size === 'md' ? 'shadow-lg' : ''}`}>
      {showImg ? (
        <img src={avatarUrl} alt="" className={`${sizeClass} object-cover`} onError={() => setFailed(true)} />
      ) : (
        <span className={size === 'sm' ? 'text-sm font-semibold' : 'text-xl font-semibold'}>{initial}</span>
      )}
    </div>
  );
};
