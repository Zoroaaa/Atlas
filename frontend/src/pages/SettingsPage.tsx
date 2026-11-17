import React from 'react';
import { SettingsManager } from './dashboard/SettingsManager';

/**
 * 系统设置独立页：桌面端由 AppShell 承载，移动端由 AccountLayout 提供返回栏。
 */
export const SettingsPage: React.FC = () => (
  <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
    <SettingsManager />
  </div>
);
