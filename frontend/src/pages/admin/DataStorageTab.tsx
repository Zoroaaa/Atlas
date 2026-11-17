/**
 * 数据存储入口
 *
 * 只做路由分发；具体页面在 ./data-storage/ 下，避免单文件继续膨胀。
 * AdminManager 仍只需挂载一个 data-storage tab，子路径由这里决定渲染哪一页。
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { CoversPage, DetailCompletionPage, OverviewPage, RecordsPage } from './data-storage';

export const DataStorageTab: React.FC = () => {
  const { pathname } = useLocation();

  if (pathname.includes('/data-storage/detail')) return <DetailCompletionPage />;
  if (pathname.includes('/data-storage/covers')) return <CoversPage />;
  if (pathname.includes('/data-storage/records')) return <RecordsPage />;
  return <OverviewPage />;
};
