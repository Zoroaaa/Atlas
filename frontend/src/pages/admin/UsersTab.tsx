import React, { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { Search, RefreshCw, Ban, CheckCircle, Eye, Shield, LogIn, Activity, Server, Database, Award, MapPin, Users, UserCheck, UserX, Mail, TrendingUp } from 'lucide-react';
import { adminApi } from '@/services/api';
import type { AdminUser, AdminUserDetail, Role } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTranslation } from 'react-i18next';
import { Pagination, TableWrapper, StatCard, StatsGrid } from './shared';

export const UsersTab: React.FC = () => {
  const toast = useToast();
  const { t } = useTranslation(['admin']);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [permissionsModal, setPermissionsModal] = useState<{ open: boolean; userId: string; current: string[] }>({ open: false, userId: '', current: [] });
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    verified: number;
    newToday: number;
    newWeek: number;
    newMonth: number;
    activeToday: number;
    roleDistribution: Array<{ display_name: string; count: number }>;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminApi.getUsers({ page, pageSize: 10, search: search || undefined, status: statusFilter || undefined, roleId: roleFilter || undefined });
      setUsers(result.items);
      setTotalPages(result.totalPages);
    } catch { toast.error(t('admin:users.loadFailed')); } finally { setLoading(false); }
  }, [page, search, statusFilter, roleFilter, toast]);

  const loadStats = useCallback(async () => {
    try { setStats(await adminApi.getUsersStats()); } catch { toast.error(t('admin:users.loadStatsFailed')); }
  }, [toast]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { adminApi.getRoles().then(setRoles).catch(() => {}); }, []);

  const handleViewDetail = async (userId: string) => {
    try {
      const detail = await adminApi.getUserDetail(userId);
      setSelectedUser(detail);
      setShowDetail(true);
    } catch { toast.error(t('admin:users.fetchDetailFailed')); }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      await adminApi.updateUserStatus(userId, !currentStatus);
      toast.success(!currentStatus ? t('admin:users.enabledToast') : t('admin:users.disabledToast'));
      loadUsers();
      loadStats();
    } catch { toast.error(t('admin:users.opFailed')); }
  };

  const handleChangeRole = async (userId: string, roleId: string) => {
    try {
      await adminApi.updateUserRole(userId, roleId);
      toast.success(t('admin:users.roleUpdatedToast'));
      loadUsers();
    } catch { toast.error(t('admin:users.updateRoleFailed')); }
  };

  return (
    <div className="space-y-4">
      {stats && (
        <StatsGrid>
          <StatCard icon={Users} label={t('admin:users.stat.total')} value={stats.total} color="blue" />
          <StatCard icon={UserCheck} label={t('admin:users.stat.active')} value={stats.active} subLabel={t('admin:users.stat.activeSub', { percent: stats.total > 0 ? Math.round(stats.active / stats.total * 100) : 0 })} color="green" />
          <StatCard icon={UserX} label={t('admin:users.stat.inactive')} value={stats.inactive} color="red" />
          <StatCard icon={Mail} label={t('admin:users.stat.verified')} value={stats.verified} color="purple" />
          <StatCard icon={TrendingUp} label={t('admin:users.stat.newToday')} value={stats.newToday} subLabel={t('admin:users.stat.newTodaySub', { count: stats.newWeek })} color="orange" />
          <StatCard icon={Activity} label={t('admin:users.stat.activeToday')} value={stats.activeToday} color="teal" />
        </StatsGrid>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input placeholder={t('admin:users.filter.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} leftIcon={<Search className="w-4 h-4" />} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
          <option value="">{t('admin:users.filter.allStatus')}</option><option value="active">{t('admin:users.filter.statusActive')}</option><option value="inactive">{t('admin:users.filter.statusInactive')}</option>
        </select>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-sm">
          <option value="">{t('admin:users.filter.allRoles')}</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => { loadUsers(); loadStats(); }}><RefreshCw className="w-4 h-4" /></Button>
      </div>
      <TableWrapper>
        <table className="w-full text-sm">
          <thead className="bg-surface-50 dark:bg-surface-900">
            <tr>{[t('admin:users.table.colUser'), t('admin:users.table.colRole'), t('admin:users.table.colLoginCount'), t('admin:users.table.colStatus'), t('admin:users.table.colCreatedAt'), t('admin:users.table.colActions')].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-surface-600 dark:text-surface-400">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">{t('admin:users.table.loading')}</td></tr>
              : users.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-500">{t('admin:users.table.empty')}</td></tr>
              : users.map(user => (
                <tr key={user.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-surface-900 dark:text-surface-100">{user.username}</div>
                    <div className="text-xs text-surface-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select value={user.role} onChange={e => handleChangeRole(user.id, e.target.value)} className="text-xs px-2 py-1 rounded border border-surface-200 dark:border-surface-600 bg-transparent">
                      {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-surface-500">{user.loginCount}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', user.isActive ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400')}>
                      {user.isActive ? t('admin:users.table.statusActive') : t('admin:users.table.statusInactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-500">{new Date(user.createdAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleViewDetail(user.id)} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 hover:text-primary-600" title={t('admin:users.table.viewDetailTitle')}><Eye className="w-4 h-4" /></button>
                      <button onClick={() => handleToggleStatus(user.id, user.isActive)} className={clsx('p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700', user.isActive ? 'text-surface-500 hover:text-error-600' : 'text-surface-500 hover:text-success-600')} title={user.isActive ? t('admin:users.table.disableTitle') : t('admin:users.table.enableTitle')}>
                        {user.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setPermissionsModal({ open: true, userId: user.id, current: user.permissions || [] })} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 hover:text-rose-600" title={t('admin:users.table.managePermissionsTitle')}><Shield className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </TableWrapper>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title={t('admin:users.detail.modalTitle')} size="lg">
        {selectedUser && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {[{ label: t('admin:users.detail.username'), value: selectedUser.username }, { label: t('admin:users.detail.email'), value: selectedUser.email }, { label: t('admin:users.detail.role'), value: selectedUser.roleDisplayName }, { label: t('admin:users.detail.status'), value: selectedUser.isActive ? t('admin:users.table.statusActive') : t('admin:users.table.statusInactive') }].map(item => (
                <div key={item.label}><div className="text-xs text-surface-500 mb-1">{item.label}</div><div className="font-medium text-surface-900 dark:text-surface-100">{item.value}</div></div>
              ))}
            </div>
            <div className="border-t border-surface-200 dark:border-surface-700 pt-4">
              <h4 className="font-medium mb-3">{t('admin:users.detail.statsTitle')}</h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: LogIn, color: 'text-amber-500', value: selectedUser.stats?.totalLoginCount ?? 0, label: t('admin:users.detail.totalLogin') },
                  { icon: Search, color: 'text-green-500', value: selectedUser.stats?.totalSearchCount ?? 0, label: t('admin:users.detail.searchCount') },
                  { icon: Server, color: 'text-rose-500', value: selectedUser.stats?.activeSessions ?? 0, label: t('admin:users.detail.activeSessions') },
                  { icon: Activity, color: 'text-orange-500', value: selectedUser.stats?.favoritesCount ?? 0, label: t('admin:users.detail.favoritesCount') },
                  { icon: Database, color: 'text-teal-500', value: selectedUser.stats?.historyCount ?? 0, label: t('admin:users.detail.historyCount') },
                  { icon: Award, color: 'text-primary-500', value: selectedUser.loginCount ?? 0, label: t('admin:users.detail.cumulativeLogin') },
                ].map(item => (
                  <div key={item.label} className="bg-surface-50 dark:bg-surface-900 rounded-lg p-3 text-center">
                    <item.icon className={clsx('w-5 h-5 mx-auto mb-1', item.color)} />
                    <div className="text-xl font-bold">{item.value}</div>
                    <div className="text-xs text-surface-500">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {selectedUser.recentSessions && selectedUser.recentSessions.length > 0 && (
              <div className="border-t border-surface-200 dark:border-surface-700 pt-4">
                <h4 className="font-medium mb-3">{t('admin:users.detail.recentSessions')}</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedUser.recentSessions.map(session => (
                    <div key={session.id} className="flex items-center justify-between text-sm p-2 bg-surface-50 dark:bg-surface-900 rounded">
                      <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-surface-400" /><span>{session.ip_address || t('admin:users.detail.unknownIp')}</span></div>
                      <span className="text-surface-500">{new Date(session.last_activity).toLocaleString('zh-CN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={permissionsModal.open} onClose={() => setPermissionsModal({ open: false, userId: '', current: [] })} title={t('admin:users.permissions.modalTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-surface-500">{t('admin:users.permissions.description')}</p>
          <textarea defaultValue={permissionsModal.current.join('\n')} rows={8} id="permissions-textarea" className="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-800 text-sm font-mono" placeholder="community.share&#10;source.create" />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPermissionsModal({ open: false, userId: '', current: [] })}>{t('admin:users.permissions.cancel')}</Button>
            <Button variant="primary" onClick={async () => {
              const el = document.getElementById('permissions-textarea') as HTMLTextAreaElement;
              const perms = el.value.split('\n').map(p => p.trim()).filter(Boolean);
              try { await adminApi.updateUserPermissions(permissionsModal.userId, perms); toast.success(t('admin:users.permissionUpdatedToast')); setPermissionsModal({ open: false, userId: '', current: [] }); loadUsers(); } catch { toast.error(t('admin:users.updatePermissionFailed')); }
            }}>{t('admin:users.permissions.save')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
