import React from 'react';

export interface CompanionExtraAction {
  id: string;
  label: string;
  modelUrl: string;
}

export interface Companion {
  id: string;
  name: string;
  role: string;
  personality: string;
  avatarUrl: string;
  isBound: boolean;
  userNickname?: string;
  createdAt: number;
  createdAtStr?: string;
  visualPrompt?: string;
  model3dUrl?: string;
  idleModelUrl?: string;
  talkingModelUrl?: string;
  waveModelUrl?: string;
  extraActions?: CompanionExtraAction[];
  characterDescription?: string;
  characterAttributes?: CharacterAttributes;
  model_id?: string;
  is_global?: boolean;
}

export interface CharacterAttributes {
  name: string;
  gender: string;
  age: string;
  birth: string;
  zodiac: string;
  constellation: string;
  job: string;
  hobby: string;
  contact?: string;
  voice?: string;
  position: string;
  goal: string;
  additional: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  imageUrl?: string;
  audioUrl?: string;
  audioMimeType?: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}
