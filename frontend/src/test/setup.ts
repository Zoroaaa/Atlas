import '@testing-library/jest-dom';
import i18next from '@/i18n';

// 测试断言基于中文文案；语言检测在测试环境会落到英文，这里固定为 zh-CN
await i18next.changeLanguage('zh-CN');
