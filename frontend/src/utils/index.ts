export { NotificationTemplates } from './notificationTemplates';
export type { NotificationTemplate, NotificationCategory, NotificationAction } from './notificationTemplates';

export {
  parseMagnet,
  downloadTorrentFile,
  openMagnetClient,
  copyToClipboard,
  getWebtorUrl,
  getBtorrentUrl,
  getMagnetShortHash,
} from './magnet';

export { camelizeKeys, type CamelCaseKeys } from '@codeseek/shared/utils';
