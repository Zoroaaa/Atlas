/**
 * 管理后台源站管理（/admin-panel/sources）：系统大类/分类/源维护。
 *
 * 约束：只渲染系统树，用户私有数据不会出现在管理后台。
 */
import React from 'react';
import { SourceManagementPage } from '@/components/sources/SourceManagementPage';

export const SourcesTab: React.FC = () => <SourceManagementPage scope="admin" />;

SourcesTab.displayName = 'SourcesTab';
