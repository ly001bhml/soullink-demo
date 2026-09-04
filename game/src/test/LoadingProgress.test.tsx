import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, test, expect } from 'vitest';
import { LoadingProgress } from '../components/LoadingProgress';

describe('LoadingProgress', () => {
  test('does not render when not visible', () => {
    render(
      <LoadingProgress
        isVisible={false}
        stage="generating"
      />
    );

    expect(screen.queryByText('正在生成角色属性')).not.toBeInTheDocument();
  });

  test('renders generating stage correctly', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="generating"
        progress={30}
        message="正在分析您的角色描述..."
        estimatedTime={20}
      />
    );

    expect(screen.getByText('正在生成角色属性')).toBeInTheDocument();
    expect(screen.getByText('正在分析您的角色描述...')).toBeInTheDocument();
    // Progress starts at 0 and animates to target, so we check for 0% initially
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('预计剩余 20秒')).toBeInTheDocument();
  });

  test('renders processing stage correctly', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="processing"
        progress={60}
        message="正在优化角色属性..."
      />
    );

    expect(screen.getByText('处理中')).toBeInTheDocument();
    expect(screen.getByText('正在优化角色属性...')).toBeInTheDocument();
    // Progress starts at 0 and animates to target, so we check for 0% initially
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  test('renders complete stage correctly', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="complete"
        progress={100}
        message="角色属性生成完成！"
      />
    );

    expect(screen.getByText('生成完成')).toBeInTheDocument();
    expect(screen.getByText('角色属性生成完成！')).toBeInTheDocument();
    expect(screen.getByText('生成成功')).toBeInTheDocument();
  });

  test('renders error stage correctly', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="error"
        message="生成失败，请重试"
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByText('生成失败，请重试')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  test('shows cancel button when showCancel is true', () => {
    const mockCancel = vi.fn();
    
    render(
      <LoadingProgress
        isVisible={true}
        stage="generating"
        progress={30}
        onCancel={mockCancel}
        showCancel={true}
      />
    );

    const cancelButton = screen.getByText('取消生成');
    expect(cancelButton).toBeInTheDocument();
    
    fireEvent.click(cancelButton);
    expect(mockCancel).toHaveBeenCalled();
  });

  test('does not show cancel button for complete stage', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="complete"
        onCancel={vi.fn()}
        showCancel={true}
      />
    );

    expect(screen.queryByText('取消生成')).not.toBeInTheDocument();
  });

  test('formats time correctly', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="generating"
        estimatedTime={125} // 2 minutes 5 seconds
      />
    );

    expect(screen.getByText('预计剩余 2分5秒')).toBeInTheDocument();
  });

  test('shows helpful tips for generating stage', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="generating"
      />
    );

    expect(screen.getByText(/正在分析您的描述并生成个性化角色属性/)).toBeInTheDocument();
    expect(screen.getByText(/这个过程通常需要 10-30 秒，请耐心等待/)).toBeInTheDocument();
  });

  test('shows helpful tips for processing stage', () => {
    render(
      <LoadingProgress
        isVisible={true}
        stage="processing"
      />
    );

    expect(screen.getByText(/正在优化角色属性的细节/)).toBeInTheDocument();
    expect(screen.getByText(/确保角色个性的一致性和丰富性/)).toBeInTheDocument();
  });
});
