export const BACKGROUND_TASKS_KEY = 'soul_link_background_tasks';
export const HOME_AGENT_MESSAGES_KEY = 'soul_link_home_agent_messages';
const CHAT_MESSAGES_KEY_PREFIX = 'soul_link_chat_messages_';

export type BackgroundTaskType = 'generate' | 'rig';
export type BackgroundTaskStatus = 'running' | 'success' | 'error';

export interface BackgroundTask {
  id: string;
  type: BackgroundTaskType;
  status: BackgroundTaskStatus;
  title: string;
  detail: string;
  createdAt: number;
  updatedAt: number;
  companionId?: string;
  companionName?: string;
  targetPath?: string;
  seen?: boolean;
}

export const getChatMessagesStorageKey = (modelId?: string, companionId?: string) =>
  `${CHAT_MESSAGES_KEY_PREFIX}${modelId || companionId || 'default'}`;

export const loadBackgroundTasks = (): BackgroundTask[] => {
  try {
    const raw = localStorage.getItem(BACKGROUND_TASKS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((task: BackgroundTask) =>
      task.status === 'running'
        ? {
            ...task,
            detail: task.companionId
              ? '任务状态已恢复，系统会继续检查后台处理结果。'
              : '任务状态已恢复，如果长时间没有更新，可以重新发起一次。',
            seen: false,
            updatedAt: Date.now(),
          }
        : task
    );
  } catch (error) {
    console.warn('[App] 读取后台任务失败，已重置:', error);
    return [];
  }
};

export const getTaskTypeLabel = (type: BackgroundTaskType) => {
  return type === 'generate' ? '生成任务' : '绑骨任务';
};
