import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  RotateCcw,
  Download,
  Upload,
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Globe,
  Shield,
  Mail,
  Zap,
  Trash2,
} from 'lucide-react';
import { Card, Button, Input, Modal } from '@/components/ui';
import { configApi, type SystemConfigItem, type ConfigGroup, type GroupedConfigs, type ConfigChangeLog } from '@/services/api';
import { useNotification } from '@/hooks';
import { useConfig } from '@/contexts';

const CONFIG_TYPE_LABELS: Record<string, string> = {
  string: '文本',
  integer: '整数',
  float: '小数',
  boolean: '布尔值',
  json: 'JSON',
};

const CONFIG_GROUP_ICONS: Record<string, React.ReactNode> = {
  basic: <Globe className="w-4 h-4" />,
  features: <Zap className="w-4 h-4" />,
  security: <Shield className="w-4 h-4" />,
  email: <Mail className="w-4 h-4" />,
  cleanup: <Trash2 className="w-4 h-4" />,
};

export const ConfigTab: React.FC = () => {
  const notification = useNotification();
  const { refreshConfig } = useConfig();
  const [isLoading, setIsLoading] = useState(true);
  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [groupedConfigs, setGroupedConfigs] = useState<Record<string, GroupedConfigs>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['basic']));
  const [searchQuery, setSearchQuery] = useState('');
  const [editingConfig, setEditingConfig] = useState<SystemConfigItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showSensitive, setShowSensitive] = useState<Set<string>>(new Set());
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [configLogs, setConfigLogs] = useState<ConfigChangeLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [importOverwrite, setImportOverwrite] = useState(false);

  const loadConfigs = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await configApi.getConfigGroups();
      if (response.success && response.data) {
        setGroups(response.data.groups || []);
        setGroupedConfigs(response.data.groupedConfigs || {});
      }
    } catch (err: any) {
      notification.error('加载失败', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [notification]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const loadConfigLogs = async (key?: string) => {
    setLogsLoading(true);
    try {
      const response = await configApi.getConfigLogs({ key, pageSize: 50 });
      if (response.success && response.data) {
        setConfigLogs(response.data.logs);
      }
    } catch (error: any) {
      notification.error('加载日志失败', error.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUpdateConfig = async () => {
    if (!editingConfig) return;

    if (!editValue.trim()) {
      notification.error('验证失败', '配置值不能为空');
      return;
    }

    try {
      const response = await configApi.updateConfig(editingConfig.key, {
        value: editValue,
        changeReason: editReason || undefined,
      });

      if (response.success) {
        notification.success('更新成功', `配置 ${editingConfig.key} 已更新`);
        setEditingConfig(null);
        setEditValue('');
        setEditReason('');
        loadConfigs();
        refreshConfig();
      } else {
        notification.error('更新失败', response.message || '未知错误');
      }
    } catch (error: any) {
      notification.error('更新失败', error.message);
    }
  };

  const handleResetConfig = async (key: string) => {
    if (!confirm(`确定要重置配置 ${key} 为默认值吗？`)) return;

    try {
      const response = await configApi.resetConfig(key);
      if (response.success) {
        notification.success('重置成功', `配置 ${key} 已重置为默认值`);
        loadConfigs();
        refreshConfig();
      } else {
        notification.error('重置失败', response.message || '未知错误');
      }
    } catch (error: any) {
      notification.error('重置失败', error.message);
    }
  };

  const handleExport = async () => {
    try {
      const response = await configApi.exportConfig();
      if (response.success && response.data) {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `config-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        notification.success('导出成功', '配置已导出为JSON文件');
        setShowExportModal(false);
      }
    } catch (error: any) {
      notification.error('导出失败', error.message);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      notification.error('导入失败', '请粘贴配置数据');
      return;
    }

    let configs;
    try {
      const parsed = JSON.parse(importData);
      configs = parsed.configs || parsed;
    } catch {
      notification.error('导入失败', 'JSON格式错误');
      return;
    }

    if (!Array.isArray(configs)) {
      notification.error('导入失败', '配置数据格式错误');
      return;
    }

    try {
      const response = await configApi.importConfig(configs, importOverwrite);
      if (response.success) {
        notification.success(
          '导入成功',
          `创建 ${response.data.created} 项，更新 ${response.data.updated} 项，跳过 ${response.data.skipped} 项`
        );
        setShowImportModal(false);
        setImportData('');
        loadConfigs();
        refreshConfig();
      } else {
        notification.error('导入失败', response.message || '未知错误');
      }
    } catch (error: any) {
      notification.error('导入失败', error.message);
    }
  };

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleSensitive = (key: string) => {
    const newShow = new Set(showSensitive);
    if (newShow.has(key)) {
      newShow.delete(key);
    } else {
      newShow.add(key);
    }
    setShowSensitive(newShow);
  };

  const filteredGroups = groups.filter((group) => {
    if (!searchQuery) return true;
    const groupConfigs = groupedConfigs[group.name]?.configs || [];
    return (
      group.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      groupConfigs.some(
        (c) =>
          c.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  });

  const renderConfigValue = (config: SystemConfigItem) => {
    const isSensitive = config.is_sensitive === 1;
    const isHidden = isSensitive && !showSensitive.has(config.key);

    if (isHidden) {
      return '******';
    }

    switch (config.config_type) {
      case 'boolean':
        return config.value === '1' || config.value === 'true' ? (
          <span className="inline-flex items-center gap-1 text-success-600 dark:text-success-400">
            <CheckCircle className="w-4 h-4" />
            是
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-surface-500">
            <XCircle className="w-4 h-4" />
            否
          </span>
        );
      default:
        return config.value;
    }
  };

  const renderConfigItem = (config: SystemConfigItem) => (
    <div
      key={config.key}
      className="flex items-center justify-between p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm font-medium text-surface-900 dark:text-surface-100">
            {config.key}
          </span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
            {CONFIG_TYPE_LABELS[config.config_type] || config.config_type}
          </span>
          {config.is_sensitive === 1 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400">
              敏感
            </span>
          )}
          {config.is_public === 1 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
              公开
            </span>
          )}
        </div>
        {config.description && (
          <p className="text-sm text-surface-500 dark:text-surface-400 truncate">
            {config.description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="max-w-xs truncate text-sm text-surface-700 dark:text-surface-300">
          {renderConfigValue(config)}
        </div>
        <div className="flex items-center gap-1">
          {config.is_sensitive === 1 && (
            <button
              onClick={() => toggleSensitive(config.key)}
              className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500"
              title={showSensitive.has(config.key) ? '隐藏值' : '显示值'}
            >
              {showSensitive.has(config.key) ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={() => {
              setEditingConfig(config);
              setEditValue(config.value);
              setEditReason('');
            }}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500"
            title="编辑"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleResetConfig(config.key)}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500"
            title="重置为默认值"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderEditModal = () => (
    <Modal
      isOpen={!!editingConfig}
      onClose={() => {
        setEditingConfig(null);
        setEditValue('');
        setEditReason('');
      }}
      title={`编辑配置: ${editingConfig?.key}`}
      size="md"
    >
      {editingConfig && (
        <div className="space-y-4">
          <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-1">描述</p>
            <p className="text-surface-900 dark:text-surface-100">
              {editingConfig.description || '无描述'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              配置值
            </label>
            {editingConfig.config_type === 'boolean' ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setEditValue('1')}
                  className={`flex-1 py-3 rounded-xl border-2 transition-all ${
                    editValue === '1'
                      ? 'border-success-500 bg-success-50 dark:bg-success-900/20'
                      : 'border-surface-200 dark:border-surface-700'
                  }`}
                >
                  <CheckCircle
                    className={`w-5 h-5 mx-auto ${
                      editValue === '1' ? 'text-success-600' : 'text-surface-400'
                    }`}
                  />
                  <span className="block mt-1 text-sm">是</span>
                </button>
                <button
                  onClick={() => setEditValue('0')}
                  className={`flex-1 py-3 rounded-xl border-2 transition-all ${
                    editValue === '0'
                      ? 'border-error-500 bg-error-50 dark:bg-error-900/20'
                      : 'border-surface-200 dark:border-surface-700'
                  }`}
                >
                  <XCircle
                    className={`w-5 h-5 mx-auto ${
                      editValue === '0' ? 'text-error-600' : 'text-surface-400'
                    }`}
                  />
                  <span className="block mt-1 text-sm">否</span>
                </button>
              </div>
            ) : (
              <Input
                type={editingConfig.config_type === 'integer' || editingConfig.config_type === 'float' ? 'number' : 'text'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                fullWidth
              />
            )}
          </div>

          <Input
            label="变更原因（可选）"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="请输入变更原因"
            fullWidth
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setEditingConfig(null);
                setEditValue('');
                setEditReason('');
              }}
            >
              取消
            </Button>
            <Button variant="primary" fullWidth onClick={handleUpdateConfig}>
              保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );

  const renderLogsModal = () => (
    <Modal
      isOpen={showLogsModal}
      onClose={() => setShowLogsModal(false)}
      title="配置变更日志"
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadConfigLogs()}
          >
            全部
          </Button>
        </div>

        {logsLoading ? (
          <div className="text-center py-8 text-surface-500">加载中...</div>
        ) : configLogs.length === 0 ? (
          <div className="text-center py-8 text-surface-500">暂无日志记录</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {configLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-medium">{log.config_key}</span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      log.change_type === 'create'
                        ? 'bg-success-100 text-success-600'
                        : log.change_type === 'update'
                        ? 'bg-primary-100 text-primary-600'
                        : log.change_type === 'delete'
                        ? 'bg-error-100 text-error-600'
                        : 'bg-warning-100 text-warning-600'
                    }`}
                  >
                    {log.change_type === 'create'
                      ? '创建'
                      : log.change_type === 'update'
                      ? '更新'
                      : log.change_type === 'delete'
                      ? '删除'
                      : '重置'}
                  </span>
                </div>
                <div className="text-sm text-surface-600 dark:text-surface-400 space-y-1">
                  {log.old_value !== null && (
                    <p>
                      旧值: <span className="font-mono">{log.old_value}</span>
                    </p>
                  )}
                  <p>
                    新值: <span className="font-mono">{log.new_value}</span>
                  </p>
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span>操作人: {log.changed_by_username || '系统'}</span>
                    <span>时间: {new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.change_reason && (
                    <p className="text-xs text-surface-500">原因: {log.change_reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );

  const renderExportModal = () => (
    <Modal
      isOpen={showExportModal}
      onClose={() => setShowExportModal(false)}
      title="导出配置"
      size="md"
    >
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-surface-600 dark:text-surface-400">
              <p>导出的配置文件将包含所有配置项的当前值。</p>
              <p className="mt-1">敏感配置的值将被替换为 ****** ，需要手动设置。</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setShowExportModal(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleExport}
            leftIcon={<Download className="w-4 h-4" />}
          >
            导出JSON
          </Button>
        </div>
      </div>
    </Modal>
  );

  const renderImportModal = () => (
    <Modal
      isOpen={showImportModal}
      onClose={() => {
        setShowImportModal(false);
        setImportData('');
      }}
      title="导入配置"
      size="lg"
    >
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-800/20 rounded-xl border border-warning-200 dark:border-warning-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 dark:text-warning-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-surface-600 dark:text-surface-400">
              <p>导入配置将修改系统配置，请确保配置文件来源可信。</p>
              <p className="mt-1">敏感配置需要手动设置，无法通过导入修改。</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
            配置数据（JSON格式）
          </label>
          <textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder="粘贴配置JSON数据..."
            className="w-full h-48 p-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <label className="flex items-center gap-2 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={importOverwrite}
            onChange={(e) => setImportOverwrite(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 dark:border-surface-600"
          />
          <span className="text-sm text-surface-700 dark:text-surface-300">
            覆盖已存在的配置
          </span>
        </label>

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setShowImportModal(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleImport}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            导入配置
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-surface-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">系统配置</h2>
            <p className="text-surface-500 dark:text-surface-400">管理系统全局配置项</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowLogsModal(true);
              loadConfigLogs();
            }}
            leftIcon={<History className="w-4 h-4" />}
          >
            变更日志
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            leftIcon={<Download className="w-4 h-4" />}
          >
            导出
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="搜索配置项..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-5 h-5" />}
            fullWidth
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredGroups.map((group) => {
          const configs = groupedConfigs[group.name]?.configs || [];
          const isExpanded = expandedGroups.has(group.name);

          return (
            <Card key={group.id} className="overflow-hidden">
              <button
                onClick={() => toggleGroup(group.name)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-surface-50 to-surface-100 dark:from-surface-800/50 dark:to-surface-800 hover:from-surface-100 hover:to-surface-150 dark:hover:from-surface-800 dark:hover:to-surface-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    {CONFIG_GROUP_ICONS[group.name] || <Settings className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-surface-900 dark:text-surface-100">
                      {group.display_name}
                    </h3>
                    <p className="text-sm text-surface-500 dark:text-surface-400">
                      {configs.length} 个配置项
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-surface-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-surface-500" />
                )}
              </button>

              {isExpanded && configs.length > 0 && (
                <div className="p-4 space-y-2">{configs.map(renderConfigItem)}</div>
              )}
            </Card>
          );
        })}
      </div>

      {renderEditModal()}
      {renderLogsModal()}
      {renderExportModal()}
      {renderImportModal()}
    </div>
  );
};
