import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { CharacterAttributesView } from '../components/CharacterAttributesView';
import { Companion, CharacterAttributes } from '../types';
import { characterService } from '../services/characterService';

// Mock the character service
vi.mock('../services/characterService', () => ({
  characterService: {
    getAttributes: vi.fn(),
    updateAttributes: vi.fn(),
  }
}));

const mockCompanion: Companion = {
  id: 'test-companion-1',
  name: 'Test Character',
  role: 'Friend',
  personality: 'Friendly and helpful',
  avatarUrl: 'https://example.com/avatar.jpg',
  isBound: false,
  createdAt: Date.now()
};

const mockAttributes: CharacterAttributes = {
  personality: '温柔善良，充满智慧',
  background: '来自遥远星球的智慧生命',
  speakingStyle: '温和而富有哲理',
  interests: ['读书', '音乐', '星空观察'],
  catchphrases: ['让我们一起思考', '智慧来自经验'],
  emotionalTendency: '平和乐观',
  responseStyle: '深思熟虑',
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now(),
  version: '1.0',
  companionId: 'test-companion-1'
};

describe('CharacterAttributesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('displays loading state when no attributes provided', async () => {
    (characterService.getAttributes as any).mockResolvedValue(null);
    
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={null}
      />
    );

    expect(screen.getByText('加载角色属性中...')).toBeInTheDocument();
    
    // Wait for the loading to complete
    await waitFor(() => {
      expect(screen.getByText('暂无角色属性')).toBeInTheDocument();
    });
  });

  test('displays no attributes message when attributes are null', async () => {
    (characterService.getAttributes as any).mockResolvedValue(null);
    
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('暂无角色属性')).toBeInTheDocument();
    });
  });

  test('displays attributes summary when collapsed', () => {
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
      />
    );

    expect(screen.getByText('角色属性详情')).toBeInTheDocument();
    expect(screen.getByText(/性格：温柔善良，充满智慧/)).toBeInTheDocument();
  });

  test('expands to show detailed attributes when expand button clicked', () => {
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
      />
    );

    const expandButton = screen.getByTitle('展开详情');
    fireEvent.click(expandButton);

    expect(screen.getByText('温柔善良，充满智慧')).toBeInTheDocument();
    expect(screen.getByText('来自遥远星球的智慧生命')).toBeInTheDocument();
  });

  test('enters edit mode when edit button clicked', () => {
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
        readonly={false}
      />
    );

    const expandButton = screen.getByTitle('展开详情');
    fireEvent.click(expandButton);

    const editButton = screen.getByText('编辑');
    fireEvent.click(editButton);

    expect(screen.getByText('保存')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  test('saves attributes when save button clicked', async () => {
    (characterService.updateAttributes as any).mockResolvedValue(undefined);
    
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
        readonly={false}
      />
    );

    const expandButton = screen.getByTitle('展开详情');
    fireEvent.click(expandButton);

    const editButton = screen.getByText('编辑');
    fireEvent.click(editButton);

    const personalityInput = screen.getByDisplayValue('温柔善良，充满智慧');
    fireEvent.change(personalityInput, { target: { value: '更新的性格描述' } });

    const saveButton = screen.getByText('保存');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(characterService.updateAttributes).toHaveBeenCalledWith(
        'test-companion-1',
        expect.objectContaining({
          personality: '更新的性格描述'
        })
      );
    });
  });

  test('does not show edit button in readonly mode', () => {
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
        readonly={true}
      />
    );

    const expandButton = screen.getByTitle('展开详情');
    fireEvent.click(expandButton);

    expect(screen.queryByText('编辑')).not.toBeInTheDocument();
  });

  test('displays interests as tags', () => {
    render(
      <CharacterAttributesView
        companion={mockCompanion}
        attributes={mockAttributes}
      />
    );

    const expandButton = screen.getByTitle('展开详情');
    fireEvent.click(expandButton);

    expect(screen.getByText('读书')).toBeInTheDocument();
    expect(screen.getByText('音乐')).toBeInTheDocument();
    expect(screen.getByText('星空观察')).toBeInTheDocument();
  });
});
