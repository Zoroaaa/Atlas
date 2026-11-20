/**
 * 源健康状态的展示映射：status 只描述「哪类问题」，文案与配色统一由这里决定。
 *
 * 集中在一处的理由：管理页、源看板、搜索侧栏三处都要展示同一批状态，
 * 分散写 switch 会出现同一个状态在不同页面叫法不一致。
 */
import type { SourceHealthStatus } from '@/types';

const STATUS_LABEL_KEY: Record<SourceHealthStatus, string> = {
  online: 'dashboard:sources.healthOnline',
  empty_result: 'dashboard:sources.healthEmptyResult',
  degraded: 'dashboard:sources.healthDegraded',
  challenge: 'dashboard:sources.healthChallenge',
  login_required: 'dashboard:sources.healthLoginRequired',
  search_path_changed: 'dashboard:sources.healthSearchPathChanged',
  restricted: 'dashboard:sources.healthRestricted',
  timeout: 'dashboard:sources.healthTimeout',
  offline: 'dashboard:sources.healthOffline',
  error: 'dashboard:sources.healthError',
};

/** 状态 → i18n key；未知状态回落到通用错误文案，避免界面出现空标签 */
export function sourceHealthLabelKey(status: string): string {
  return STATUS_LABEL_KEY[status as SourceHealthStatus] ?? STATUS_LABEL_KEY.error;
}

/** 可用但不完全正常的状态：界面用琥珀色提示而不是绿色，避免把「待确认」当「健康」 */
export function isSourceHealthWarning(status: string): boolean {
  return status === 'degraded' || status === 'empty_result';
}
