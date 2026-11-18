import { describe, expect, it } from 'vitest';
import { resolveOAuthUsername } from '../oauth-username';

type DbParam = Parameters<typeof resolveOAuthUsername>[0];

/** 最小 D1 桩：只响应 `SELECT 1 FROM users WHERE username = ?` 的存在性查询 */
function createFakeDb(taken: string[] | 'always') {
  const set = new Set(taken === 'always' ? [] : taken);
  const db = {
    prepare: () => ({
      bind: (username: string) => ({
        first: async () => (taken === 'always' || set.has(username) ? { 1: 1 } : null),
      }),
    }),
  };
  return db as unknown as DbParam;
}

describe('resolveOAuthUsername', () => {
  it('展示名可用时直接使用', async () => {
    const username = await resolveOAuthUsername(createFakeDb([]), {
      displayName: 'Zhang_San',
      email: 'zs@qq.com',
      prefix: 'g',
    });
    expect(username).toBe('Zhang_San');
  });

  it('展示名被占用时追加 6 位后缀并保持在 20 位以内', async () => {
    const username = await resolveOAuthUsername(createFakeDb(['alice']), {
      displayName: 'alice',
      email: 'alice@qq.com',
      prefix: 'gh',
    });
    expect(username).toMatch(/^alice_\d{6}$/);
    expect(username.length).toBeLessThanOrEqual(20);
  });

  it('长名冲突时压缩基名，保证总长不超过 20', async () => {
    const longName = 'a'.repeat(20);
    const username = await resolveOAuthUsername(createFakeDb([longName]), {
      displayName: longName,
      email: 'a@qq.com',
      prefix: 'g',
    });
    expect(username).toMatch(/^a{13}_\d{6}$/);
    expect(username).toHaveLength(20);
  });

  it('中文名被整体替换为下划线时回退邮箱前缀', async () => {
    const username = await resolveOAuthUsername(createFakeDb([]), {
      displayName: '张三',
      email: 'zhangsan@qq.com',
      prefix: 'g',
    });
    expect(username).toBe('zhangsan');
  });

  it('展示名与邮箱前缀都无信息量时退回固定名', async () => {
    const username = await resolveOAuthUsername(createFakeDb([]), {
      displayName: '李雷',
      email: '王@qq.com',
      prefix: 'g',
    });
    expect(username).toBe('g_user');
  });

  it('连续冲突到上限时抛错，不返回可能重复的名字', async () => {
    await expect(
      resolveOAuthUsername(createFakeDb('always'), {
        displayName: 'alice',
        email: 'alice@qq.com',
        prefix: 'g',
      })
    ).rejects.toThrow(/OAuth 用户名生成失败/);
  });
});
