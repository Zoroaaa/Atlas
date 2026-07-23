export { NotificationTemplates } from './notificationTemplates';
export type { NotificationTemplate, NotificationCategory, NotificationAction } from './notificationTemplates';

export {
  parseMagnet,
  downloadTorrentFile,
  openMagnetClient,
  copyToClipboard,
  getWebtorUrl,
  getMagnetShortHash,
} from './magnet';

export { getProxyImageUrl } from './imageProxy';

export { camelizeKeys, type CamelCaseKeys } from '@codeseek/shared/utils';
