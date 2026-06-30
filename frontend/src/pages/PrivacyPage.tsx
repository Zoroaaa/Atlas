import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock } from 'lucide-react';
import { useAppInfo } from '@/contexts';

export const PrivacyPage: React.FC = () => {
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
              <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <h1 className="display-font text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              隐私政策
            </h1>
          </div>

          {/* Accent line */}
          <div className="accent-line mb-6" />

          {/* Privacy content */}
          <div className="space-y-6 text-sm sm:text-base text-stone-700 dark:text-stone-300 leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">1. 我们重视你的隐私</h2>
              <p>
                嘿，我们是 {appInfo.NAME} 的开源团队！虽然这是一个 demo 项目，我们仍然重视你的隐私。
                这篇政策会告诉你我们如何处理你的信息，以及你有哪些权利。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">2. 我们收集什么信息</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>账号信息：用户名、邮箱地址（用于注册和登录）</li>
                <li>搜索历史：你搜索过的关键词和记录</li>
                <li>使用数据：访问时间、设备信息、IP地址（用于优化服务）</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">3. 我们如何使用这些信息</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>提供和改进我们的搜索服务</li>
                <li>验证你的身份，确保账号安全</li>
                <li>发送重要通知（比如验证码）</li>
                <li>分析使用情况，优化用户体验</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">4. 我们不会分享你的信息</h2>
              <p>
                作为一个开源项目，我们尊重你的隐私。我们不会向第三方分享你的个人信息，除非：
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>你明确授权我们这样做</li>
                <li>遵守法律法规的要求</li>
                <li>保护我们的权益和安全</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">5. 我们如何保护你的信息</h2>
              <p>
                虽然是 demo 项目，我们仍然采取了基本的安全措施来保护你的信息，包括加密存储和访问控制。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">6. 数据保留</h2>
              <p>
                我们会在必要的时间内保留你的个人信息，超出必要期限后会删除或匿名化处理。
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">7. 你的权利</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>访问和查看你的个人信息</li>
                <li>修改或删除你的个人信息</li>
                <li>注销你的账号</li>
                <li>限制个人信息的处理</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 mb-3">8. 政策可能会更新</h2>
              <p>
                作为一个开源项目，我们可能会根据需要更新隐私政策。变更会在网站上公布。
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
                to="/terms" 
                className="text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium transition-colors"
              >
                查看服务条款
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
