# 通知组件 (Notification/Toast) 使用文档

> 📖 [返回项目主页](../../readme.md) | [API接口文档](../docs/api/index.md) | [架构设计文档](../docs/backend-frontend-tree.md)

## 目录

- [概述](#概述)
- [功能特性](#功能特性)
- [引入方式](#引入方式)
- [基本使用](#基本使用)
- [API 文档](#api-文档)
- [使用示例](#使用示例)
- [全局配置](#全局配置)
- [样式定制](#样式定制)
- [最佳实践](#最佳实践)
- [项目中的使用示例](#项目中的使用示例)

---

## 概述

通知组件是一个统一的消息提示系统，用于在应用中显示各种类型的通知消息（成功、错误、警告、信息）。该组件基于项目现有的技术栈（React + TypeScript + Zustand + Tailwind CSS）实现，无需引入额外的第三方库。

## 功能特性

- ✅ 支持4种通知类型：成功(success)、错误(error)、警告(warning)、信息(info)
- ✅ 自定义标题、内容和显示时长
- ✅ 支持关闭按钮和自动关闭功能
- ✅ 进度条显示剩余时间
- ✅ 鼠标悬停暂停计时
- ✅ 美观的动画效果（入场/退出动画）
- ✅ 响应式设计，适配不同设备
- ✅ 支持深色模式
- ✅ 通知队列管理，最大数量限制
- ✅ 可配置通知位置
- ✅ 支持点击回调

## 引入方式

```tsx
import { useToast, ToastContainer } from '@/components/ui/Toast';
```

## 基本使用

### 1. 在应用根组件中放置容器

确保在应用的根组件（如 `App.tsx`）中包含 `ToastContainer`：

```tsx
import { ToastContainer } from '@/components/ui/Toast';

function App() {
  return (
    <>
      {/* 应用内容 */}
      <ToastContainer />
    </>
  );
}
```

### 2. 在组件中使用通知

```tsx
import { useToast } from '@/components/ui/Toast';

function MyComponent() {
  const toast = useToast();

  const handleSuccess = () => {
    toast.success('操作成功', '数据已保存');
  };

  const handleError = () => {
    toast.error('操作失败', '请稍后重试');
  };

  const handleWarning = () => {
    toast.warning('请注意', '此操作不可撤销');
  };

  const handleInfo = () => {
    toast.info('提示', '这是一条信息');
  };

  return (
    <div>
      <button onClick={handleSuccess}>成功提示</button>
      <button onClick={handleError}>错误提示</button>
      <button onClick={handleWarning}>警告提示</button>
      <button onClick={handleInfo}>信息提示</button>
    </div>
  );
}
```

## API 文档

### useToast Hook

`useToast` Hook 返回一个对象，包含以下方法：

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `success(title, message?)` | title: string, message?: string | toastId: string | 显示成功通知 |
| `error(title, message?)` | title: string, message?: string | toastId: string | 显示错误通知 |
| `warning(title, message?)` | title: string, message?: string | toastId: string | 显示警告通知 |
| `info(title, message?)` | title: string, message?: string | toastId: string | 显示信息通知 |
| `show(options)` | ToastOptions | toastId: string | 显示自定义通知 |
| `remove(id)` | id: string | void | 移除指定通知 |
| `clear()` | - | void | 清除所有通知 |

### ToastOptions 配置项

```typescript
interface ToastOptions {
  title: string;           // 通知标题（必填）
  message?: string;        // 通知内容（可选）
  type?: ToastType;        // 通知类型：'success' | 'error' | 'warning' | 'info'
  duration?: number;       // 显示时长（毫秒），默认5000，设为0则不自动关闭
  showProgress?: boolean;  // 是否显示进度条，默认true
  showCloseButton?: boolean; // 是否显示关闭按钮，默认true
  onClick?: () => void;    // 点击通知时的回调
  onClose?: () => void;    // 关闭通知时的回调
}
```

## 使用示例

### 基本用法

```tsx
const toast = useToast();

// 简单用法
toast.success('保存成功');

// 带描述信息
toast.error('网络错误', '请检查网络连接后重试');
```

### 自定义显示时长

```tsx
// 显示10秒
toast.show({
  type: 'info',
  title: '系统维护通知',
  message: '系统将于今晚22:00进行维护',
  duration: 10000,
});

// 不自动关闭（duration设为0）
toast.show({
  type: 'warning',
  title: '重要通知',
  message: '请仔细阅读此信息',
  duration: 0,
});
```

### 点击回调

```tsx
toast.show({
  type: 'info',
  title: '新消息',
  message: '您有一条新的消息',
  onClick: () => {
    navigate('/messages');
  },
});
```

### 关闭回调

```tsx
toast.show({
  type: 'success',
  title: '文件上传中',
  message: '请勿关闭页面',
  onClose: () => {
    console.log('通知已关闭');
  },
});
```

### 隐藏进度条和关闭按钮

```tsx
toast.show({
  type: 'info',
  title: '简洁提示',
  showProgress: false,
  showCloseButton: false,
  duration: 2000,
});
```

### 手动移除通知

```tsx
const toastId = toast.show({
  type: 'info',
  title: '处理中...',
  duration: 0,
});

// 任务完成后移除
async function doSomething() {
  await processTask();
  toast.remove(toastId);
  toast.success('处理完成');
}
```

### 清除所有通知

```tsx
toast.clear();
```

## 全局配置

可以通过 `useUIStore` 修改全局通知配置：

```tsx
import { useUIStore } from '@/stores';

function ConfigComponent() {
  const { setToastConfig, setToastPosition } = useUIStore();

  // 设置最大显示数量
  setToastConfig({ maxToasts: 3 });

  // 设置默认显示时长
  setToastConfig({ defaultDuration: 3000 });

  // 设置通知位置
  setToastPosition('bottom-right');
}
```

### 可用位置

| 位置 | 说明 |
|------|------|
| `top-right` | 右上角（默认） |
| `top-left` | 左上角 |
| `bottom-right` | 右下角 |
| `bottom-left` | 左下角 |
| `top-center` | 顶部居中 |
| `bottom-center` | 底部居中 |

## 样式定制

通知组件使用 Tailwind CSS，样式与项目整体设计风格保持一致：

- **成功**：绿色系配色
- **错误**：红色系配色
- **警告**：橙色系配色
- **信息**：蓝色系配色

组件自动适配深色模式，无需额外配置。

## 最佳实践

1. **标题简洁明了**：通知标题应简短，建议不超过10个字符
2. **合理使用类型**：根据消息性质选择正确的类型
3. **控制显示时长**：重要信息可延长显示时间或设为手动关闭
4. **避免滥用**：不要在同一时间显示过多通知
5. **提供操作引导**：对于需要用户操作的通知，可使用点击回调

## 项目中的使用示例

通知组件已在项目多处使用，可参考以下文件：

- [SourceManager.tsx](file:///d:/user/codeseek/frontend/src/pages/dashboard/SourceManager.tsx) - 数据源管理
- [CategoryManager.tsx](file:///d:/user/codeseek/frontend/src/pages/dashboard/CategoryManager.tsx) - 分类管理
- [SettingsManager.tsx](file:///d:/user/codeseek/frontend/src/pages/dashboard/SettingsManager.tsx) - 设置页面
- [MainSearchPage.tsx](file:///d:/user/codeseek/frontend/src/pages/MainSearchPage.tsx) - 搜索页面
