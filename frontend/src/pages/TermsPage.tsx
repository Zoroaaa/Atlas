import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText } from 'lucide-react';
import { useAppInfo } from '@/contexts';

export const TermsPage: React.FC = () => {
  const appInfo = useAppInfo();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#0a0a0b] relative overflow-hidden">
      {/* Ambient bg */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-amber-400/6 dark:bg-amber-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-rose-400/6 dark:bg-rose-500/4 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12 relative">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors text-sm font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            返回首页
          </Link>
        </div>

        {/* Content */}
        <div className="rounded-2xl bg-white dark:bg-[#111113]/80 border border-stone-200/80 dark:border-stone-700/50 p-7 sm:p-8 shadow-soft-lg">
          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              服务条款
            </h1>
          </div>

          {/* Accent line */}
          <div className="accent-line mb-6" />

          {/* Terms content */}
          <div className="space-y-6 text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">1. 欢迎使用 {appInfo.NAME}！</h2>
              <p>
                嘿，欢迎来到 {appInfo.NAME} 的 demo 站点！这是一个开源项目，我们希望你在这里玩得开心。
                当你使用我们的服务时，就意味着你同意遵守这些简单的规则。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">2. 我们提供什么</h2>
              <p>
                我们是一个磁力搜索工具，帮助你快速找到想要的资源。
                请注意，我们不存储或托管任何资源文件，只是提供搜索和链接服务。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">3. 作为用户，你需要做到</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>遵守法律法规，不要搜索或获取非法内容</li>
                <li>不要滥用我们的服务，比如批量请求或自动化操作</li>
                <li>保护好自己的账号信息，对自己的行为负责</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">4. 关于开源</h2>
              <p>
                这个项目是开源的！你可以查看代码，提出建议，甚至贡献自己的力量。
                但请记得尊重知识产权，不要未经授权就复制或修改后商用。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">5. 服务可能会变化</h2>
              <p>
                作为一个 demo 项目，我们可能会随时调整功能或界面。
                如果你有好的建议，欢迎告诉我们！
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">6. 免责声明</h2>
              <p>
                由于这是一个 demo 项目，我们不对使用过程中产生的任何后果负责。
                请谨慎使用，确保你获取的资源是合法的。
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                <Shield className="w-4 h-4" />
                <span>© {new Date().getFullYear()} {appInfo.NAME} - 开源项目</span>
              </div>
              <Link 
                to="/privacy" 
                className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium transition-colors"
              >
                查看隐私政策
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
