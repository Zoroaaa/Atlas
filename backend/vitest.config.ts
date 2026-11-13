/**
 * 后端单元测试配置（仅覆盖纯函数，不启动 Workers 运行时）。
 *
 * 通过 alias 复用与 tsconfig 相同的路径映射，测试可直接导入 src 下的服务模块。
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolveFromBackend = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@codeseek/shared/utils',
        replacement: resolveFromBackend('../packages/shared/src/utils/index.ts'),
      },
      {
        find: '@codeseek/shared/types',
        replacement: resolveFromBackend('../packages/shared/src/types/index.ts'),
      },
      {
        find: '@codeseek/shared',
        replacement: resolveFromBackend('../packages/shared/src/index.ts'),
      },
      { find: /^@\//, replacement: resolveFromBackend('./src/') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
