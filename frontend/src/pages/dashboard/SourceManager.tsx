/**
 * 个人源站页（/dashboard/sources）：个人大类/分类/源维护 + 系统源启停。
 *
 * 数据与权限由 SourceManagementPage 按 scope=user 处理；本文件只负责挂载。
 */
import React from 'react';
import { SourceManagementPage } from '@/components/sources/SourceManagementPage';

export const SourceManager: React.FC = () => <SourceManagementPage scope="user" />;

SourceManager.displayName = 'SourceManager';
