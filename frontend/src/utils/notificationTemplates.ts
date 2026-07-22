import type { ToastType } from '@/types';

export interface NotificationTemplate {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export const NotificationTemplates = {
  auth: {
    loginSuccess: (username: string): NotificationTemplate => ({
      type: 'success',
      title: '登录成功',
      message: `欢迎回来，${username}`,
    }),
    loginFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '登录失败',
      message: reason || '用户名或密码错误',
    }),
    logoutSuccess: (): NotificationTemplate => ({
      type: 'info',
      title: '已退出登录',
      message: '期待您的再次使用',
    }),
    registerSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '注册成功',
      message: '欢迎加入 Atlas',
    }),
    registerFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '注册失败',
      message: reason || '请稍后重试',
    }),
    emailCodeSent: (): NotificationTemplate => ({
      type: 'success',
      title: '验证码已发送',
      message: '请检查您的邮箱',
    }),
    emailCodeResent: (): NotificationTemplate => ({
      type: 'success',
      title: '验证码已重新发送',
    }),
    emailCodeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '发送失败',
      message: reason || '请稍后重试',
    }),
    passwordResetSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '密码重置成功',
      message: '请使用新密码登录',
    }),
    passwordResetFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '重置失败',
      message: reason || '验证码错误或已过期',
    }),
    passwordChangeSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '密码已更新',
      message: '请重新登录',
    }),
    passwordChangeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '修改失败',
      message: reason || '当前密码可能不正确',
    }),
    profileUpdateSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '更新成功',
      message: '个人资料已更新',
    }),
    profileUpdateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '更新失败',
      message: reason || '请稍后重试',
    }),
    accountDeleted: (): NotificationTemplate => ({
      type: 'success',
      title: '账户已删除',
      message: '感谢您的使用',
    }),
  },

  proxy: {
    enabled: (): NotificationTemplate => ({
      type: 'success',
      title: '代理已启用',
      message: '搜索将通过代理服务器进行',
    }),
    disabled: (): NotificationTemplate => ({
      type: 'info',
      title: '代理已关闭',
      message: '搜索将直接访问目标站点',
    }),
    toggleFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '代理切换失败',
      message: reason || '请检查代理服务状态',
    }),
    healthCheckFailed: (): NotificationTemplate => ({
      type: 'warning',
      title: '代理健康检查失败',
      message: '代理服务可能不可用',
    }),
  },

  favorite: {
    added: (): NotificationTemplate => ({
      type: 'success',
      title: '已添加到收藏',
    }),
    removed: (): NotificationTemplate => ({
      type: 'success',
      title: '已取消收藏',
    }),
    addFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '收藏失败',
      message: reason || '请稍后重试',
    }),
    removeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '取消收藏失败',
      message: reason || '请稍后重试',
    }),
    syncSuccess: (count: number): NotificationTemplate => ({
      type: 'success',
      title: '同步成功',
      message: `已同步 ${count} 个收藏`,
    }),
    syncFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '同步失败',
      message: reason || '请稍后重试',
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '加载失败',
      message: '无法加载收藏列表',
    }),
  },

  source: {
    created: (name?: string): NotificationTemplate => ({
      type: 'success',
      title: '创建成功',
      message: name ? `搜索源「${name}」已添加` : undefined,
    }),
    updated: (): NotificationTemplate => ({
      type: 'success',
      title: '更新成功',
    }),
    deleted: (): NotificationTemplate => ({
      type: 'success',
      title: '删除成功',
    }),
    createFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '创建失败',
      message: reason || '请稍后重试',
    }),
    updateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '更新失败',
      message: reason || '请稍后重试',
    }),
    deleteFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '删除失败',
      message: reason || '请稍后重试',
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '加载失败',
      message: '无法加载搜索源数据',
    }),
    enabled: (name?: string): NotificationTemplate => ({
      type: 'success',
      title: '已启用',
      message: name ? `搜索源「${name}」已启用` : undefined,
    }),
    disabled: (name?: string): NotificationTemplate => ({
      type: 'info',
      title: '已禁用',
      message: name ? `搜索源「${name}」已禁用` : undefined,
    }),
    batchEnabled: (count: number): NotificationTemplate => ({
      type: 'success',
      title: '批量启用成功',
      message: `已启用 ${count} 个搜索源`,
    }),
    batchDisabled: (count: number): NotificationTemplate => ({
      type: 'info',
      title: '批量禁用成功',
      message: `已禁用 ${count} 个搜索源`,
    }),
    exported: (): NotificationTemplate => ({
      type: 'success',
      title: '导出成功',
    }),
    exportFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '导出失败',
      message: '请稍后重试',
    }),
    imported: (count: number): NotificationTemplate => ({
      type: 'success',
      title: '导入成功',
      message: `已导入 ${count} 个搜索源`,
    }),
    importFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '导入失败',
      message: reason || '请检查文件格式',
    }),
    testSuccess: (name: string, reason?: string): NotificationTemplate => ({
      type: 'success',
      title: '测试通过',
      message: reason || `搜索源「${name}」连接正常`,
    }),
    testFailed: (name: string, reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '测试失败',
      message: reason || `搜索源「${name}」无法连接`,
    }),
  },

  category: {
    created: (): NotificationTemplate => ({
      type: 'success',
      title: '创建成功',
    }),
    updated: (): NotificationTemplate => ({
      type: 'success',
      title: '更新成功',
    }),
    deleted: (): NotificationTemplate => ({
      type: 'success',
      title: '删除成功',
    }),
    createFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '创建失败',
      message: reason || '请稍后重试',
    }),
    updateFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '更新失败',
      message: reason || '请稍后重试',
    }),
    deleteFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '删除失败',
      message: reason || '请稍后重试',
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '加载失败',
      message: '无法加载分类数据',
    }),
  },

  search: {
    noKeyword: (): NotificationTemplate => ({
      type: 'warning',
      title: '请输入搜索关键词',
    }),
    noResults: (): NotificationTemplate => ({
      type: 'info',
      title: '未找到结果',
      message: '尝试更换关键词搜索',
    }),
    searchFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '搜索失败',
      message: reason || '请稍后重试',
    }),
    historyCleared: (): NotificationTemplate => ({
      type: 'success',
      title: '历史已清空',
    }),
    exportSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '导出成功',
    }),
  },

  community: {
    shared: (): NotificationTemplate => ({
      type: 'success',
      title: '分享成功',
      message: '等待审核通过后将会公开显示',
    }),
    shareFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '分享失败',
      message: reason || '请稍后重试',
    }),
    liked: (isLiked: boolean): NotificationTemplate => ({
      type: 'success',
      title: isLiked ? '已点赞' : '已取消点赞',
    }),
    likeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '操作失败',
      message: '请稍后重试',
    }),
    imported: (): NotificationTemplate => ({
      type: 'success',
      title: '导入成功',
      message: '搜索源已添加到您的列表',
    }),
    importFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '导入失败',
      message: reason || '请稍后重试',
    }),
    tagCreated: (): NotificationTemplate => ({
      type: 'success',
      title: '标签创建成功',
    }),
    tagCreateFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '创建失败',
      message: '请稍后重试',
    }),
    loadFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '加载失败',
      message: '无法加载社区数据',
    }),
  },

  settings: {
    saved: (): NotificationTemplate => ({
      type: 'success',
      title: '设置已保存',
    }),
    saveFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '保存失败',
      message: reason || '请稍后重试',
    }),
    emailChangeCodeSent: (): NotificationTemplate => ({
      type: 'success',
      title: '验证码已发送到新邮箱',
    }),
    emailChangeSuccess: (): NotificationTemplate => ({
      type: 'success',
      title: '邮箱更改成功',
      message: '请重新登录',
    }),
    emailChangeFailed: (reason?: string): NotificationTemplate => ({
      type: 'error',
      title: '验证失败',
      message: reason || '验证码错误',
    }),
  },

  admin: {
    userStatusChanged: (enabled: boolean): NotificationTemplate => ({
      type: 'success',
      title: enabled ? '用户已启用' : '用户已禁用',
    }),
    userStatusChangeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '操作失败',
      message: '无法更新用户状态',
    }),
    userRoleChanged: (): NotificationTemplate => ({
      type: 'success',
      title: '角色已更新',
    }),
    userRoleChangeFailed: (): NotificationTemplate => ({
      type: 'error',
      title: '操作失败',
      message: '无法更新用户角色',
    }),
    loadFailed: (resource: string): NotificationTemplate => ({
      type: 'error',
      title: '加载失败',
      message: `无法加载${resource}数据`,
    }),
  },

  common: {
    validationError: (field: string): NotificationTemplate => ({
      type: 'warning',
      title: '请填写必填字段',
      message: field ? `${field}不能为空` : undefined,
    }),
    networkError: (): NotificationTemplate => ({
      type: 'error',
      title: '网络错误',
      message: '请检查网络连接后重试',
    }),
    unknownError: (): NotificationTemplate => ({
      type: 'error',
      title: '操作失败',
      message: '请稍后重试',
    }),
    comingSoon: (feature?: string): NotificationTemplate => ({
      type: 'info',
      title: '功能开发中',
      message: feature ? `${feature}功能即将上线` : undefined,
    }),
    loginRequired: (): NotificationTemplate => ({
      type: 'warning',
      title: '请先登录',
      message: '登录后才能使用此功能',
    }),
  },
} as const;

export type NotificationCategory = keyof typeof NotificationTemplates;
export type NotificationAction<C extends NotificationCategory> = keyof typeof NotificationTemplates[C];
