import React from 'react';
import { clsx } from 'clsx';

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200',
            activeTab === tab.id
              ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-sm'
              : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
};

interface TabPanelProps {
  children: React.ReactNode;
  isActive: boolean;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({
  children,
  isActive,
  className,
}) => {
  if (!isActive) return null;

  return (
    <div className={clsx('animate-fade-in', className)}>
      {children}
    </div>
  );
};
