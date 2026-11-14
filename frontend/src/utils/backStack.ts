type BackHandler = () => void;

/**
 * 弹层返回栈：Android 返回键优先关闭最上层弹层（Modal / 大图 / 抽屉），
 * 没有弹层时才交给 WebView 历史或退出逻辑。
 */
const handlers: BackHandler[] = [];

export function registerBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function handleBackPress(): boolean {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  handler();
  return true;
}
