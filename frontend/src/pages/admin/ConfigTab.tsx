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
import { useTranslation } from 'react-i18next';

const CONFIG_TYPE_LABELS: Record<string, string> = {
  string: 'admin:config.type.string',
  integer: 'admin:config.type.integer',
  float: 'admin:config.type.float',
  boolean: 'admin:config.type.boolean',
  json: 'admin:config.type.json',
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
  const { t } = useTranslation(['admin']);
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
      notification.error(t('admin:config.loadFailed'), err.message);
    } finally {
      setIsLoading(false);
    }
  }, [notification, t]);

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
      notification.error(t('admin:config.loadLogsFailed'), error.message);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleUpdateConfig = async () => {
    if (!editingConfig) return;

    if (!editValue.trim()) {
      notification.error(t('admin:config.validateFailed'), t('admin:config.valueRequired'));
      return;
    }

    try {
      const response = await configApi.updateConfig(editingConfig.key, {
        value: editValue,
        changeReason: editReason || undefined,
      });

      if (response.success) {
        notification.success(t('admin:config.updateSuccess'), t('admin:config.updateSuccessMsg', { key: editingConfig.key }));
        setEditingConfig(null);
        setEditValue('');
        setEditReason('');
        loadConfigs();
        refreshConfig();
      } else {
        notification.error(t('admin:config.updateFailed'), response.message || t('admin:config.unknownError'));
      }
    } catch (error: any) {
      notification.error(t('admin:config.updateFailed'), error.message);
    }
  };

  const handleResetConfig = async (key: string) => {
    if (!confirm(t('admin:config.resetConfirm', { key }))) return;

    try {
      const response = await configApi.resetConfig(key);
      if (response.success) {
        notification.success(t('admin:config.resetSuccess'), t('admin:config.resetSuccessMsg', { key }));
        loadConfigs();
        refreshConfig();
      } else {
        notification.error(t('admin:config.resetFailed'), response.message || t('admin:config.unknownError'));
      }
    } catch (error: any) {
      notification.error(t('admin:config.resetFailed'), error.message);
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
        notification.success(t('admin:config.exportSuccess'), t('admin:config.exportSuccessMsg'));
        setShowExportModal(false);
      }
    } catch (error: any) {
      notification.error(t('admin:config.exportFailed'), error.message);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) {
      notification.error(t('admin:config.importFailed'), t('admin:config.importDataRequired'));
      return;
    }

    let configs;
    try {
      const parsed = JSON.parse(importData);
      configs = parsed.configs || parsed;
    } catch {
      notification.error(t('admin:config.importFailed'), t('admin:config.importJsonInvalid'));
      return;
    }

    if (!Array.isArray(configs)) {
      notification.error(t('admin:config.importFailed'), t('admin:config.importDataInvalid'));
      return;
    }

    try {
      const response = await configApi.importConfig(configs, importOverwrite);
      if (response.success) {
        notification.success(
          t('admin:config.importSuccess'),
          t('admin:config.importSuccessMsg', { created: response.data.created, updated: response.data.updated, skipped: response.data.skipped })
        );
        setShowImportModal(false);
        setImportData('');
        loadConfigs();
        refreshConfig();
      } else {
        notification.error(t('admin:config.importFailed'), response.message || t('admin:config.unknownError'));
      }
    } catch (error: any) {
      notification.error(t('admin:config.importFailed'), error.message);
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
            {t('admin:config.booleanYes')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-surface-500">
            <XCircle className="w-4 h-4" />
            {t('admin:config.booleanNo')}
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
            {t(CONFIG_TYPE_LABELS[config.config_type] || config.config_type)}
          </span>
          {config.is_sensitive === 1 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-warning-100 dark:bg-warning-900/30 text-warning-600 dark:text-warning-400">
              {t('admin:config.sensitive')}
            </span>
          )}
          {config.is_public === 1 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
              {t('admin:config.public')}
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
              title={showSensitive.has(config.key) ? t('admin:config.hideValueTitle') : t('admin:config.showValueTitle')}
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
            title={t('admin:config.editTitle')}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleResetConfig(config.key)}
            className="p-1.5 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 text-surface-500"
            title={t('admin:config.resetTitle')}
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
      title={t('admin:config.editModal.title', { key: editingConfig?.key })}
      size="md"
    >
      {editingConfig && (
        <div className="space-y-4">
          <div className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-1">{t('admin:config.editModal.descLabel')}</p>
            <p className="text-surface-900 dark:text-surface-100">
              {editingConfig.description || t('admin:config.editModal.noDescription')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
              {t('admin:config.editModal.valueLabel')}
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
                  <span className="block mt-1 text-sm">{t('admin:config.booleanYes')}</span>
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
                  <span className="block mt-1 text-sm">{t('admin:config.booleanNo')}</span>
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
            label={t('admin:config.editModal.changeReasonLabel')}
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder={t('admin:config.editModal.changeReasonPlaceholder')}
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
              {t('admin:config.editModal.cancel')}
            </Button>
            <Button variant="primary" fullWidth onClick={handleUpdateConfig}>
              {t('admin:config.editModal.save')}
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
      title={t('admin:config.logsModal.title')}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadConfigLogs()}
          >
            {t('admin:config.logsModal.all')}
          </Button>
        </div>

        {logsLoading ? (
          <div className="text-center py-8 text-surface-500">{t('admin:config.logsModal.loading')}</div>
        ) : configLogs.length === 0 ? (
          <div className="text-center py-8 text-surface-500">{t('admin:config.logsModal.empty')}</div>
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
                      ? t('admin:config.logsModal.typeCreate')
                      : log.change_type === 'update'
                      ? t('admin:config.logsModal.typeUpdate')
                      : log.change_type === 'delete'
                      ? t('admin:config.logsModal.typeDelete')
                      : t('admin:config.logsModal.typeReset')}
                  </span>
                </div>
                <div className="text-sm text-surface-600 dark:text-surface-400 space-y-1">
                  {log.old_value !== null && (
                    <p>
                      {t('admin:config.logsModal.oldValue')} <span className="font-mono">{log.old_value}</span>
                    </p>
                  )}
                  <p>
                    {t('admin:config.logsModal.newValue')} <span className="font-mono">{log.new_value}</span>
                  </p>
                  <div className="flex items-center gap-4 text-xs text-surface-500">
                    <span>{t('admin:config.logsModal.operator')} {log.changed_by_username || t('admin:config.logsModal.systemOperator')}</span>
                    <span>{t('admin:config.logsModal.time')} {new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.change_reason && (
                    <p className="text-xs text-surface-500">{t('admin:config.logsModal.reason')} {log.change_reason}</p>
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
      title={t('admin:config.exportModal.title')}
      size="md"
    >
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-surface-600 dark:text-surface-400">
              <p>{t('admin:config.exportModal.desc1')}</p>
              <p className="mt-1">{t('admin:config.exportModal.desc2')}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setShowExportModal(false)}>
            {t('admin:config.exportModal.cancel')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleExport}
            leftIcon={<Download className="w-4 h-4" />}
          >
            {t('admin:config.exportModal.exportJson')}
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
      title={t('admin:config.importModal.title')}
      size="lg"
    >
      <div className="space-y-4">
        <div className="p-4 bg-gradient-to-r from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-800/20 rounded-xl border border-warning-200 dark:border-warning-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning-600 dark:text-warning-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-surface-600 dark:text-surface-400">
              <p>{t('admin:config.importModal.warn1')}</p>
              <p className="mt-1">{t('admin:config.importModal.warn2')}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
            {t('admin:config.importModal.dataLabel')}
          </label>
          <textarea
            value={importData}
            onChange={(e) => setImportData(e.target.value)}
            placeholder={t('admin:config.importModal.dataPlaceholder')}
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
            {t('admin:config.importModal.overwriteLabel')}
          </span>
        </label>

        <div className="flex gap-3">
          <Button variant="outline" fullWidth onClick={() => setShowImportModal(false)}>
            {t('admin:config.importModal.cancel')}
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleImport}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            {t('admin:config.importModal.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-surface-500">{t('admin:config.pageLoading')}</div>
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
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">{t('admin:config.headerTitle')}</h2>
            <p className="text-surface-500 dark:text-surface-400">{t('admin:config.headerSubtitle')}</p>
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
            {t('admin:config.logsBtn')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
            leftIcon={<Upload className="w-4 h-4" />}
          >
            {t('admin:config.importBtn')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            leftIcon={<Download className="w-4 h-4" />}
          >
            {t('admin:config.exportBtn')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder={t('admin:config.searchPlaceholder')}
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
                      {t('admin:config.groupConfigCount', { count: configs.length })}
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
