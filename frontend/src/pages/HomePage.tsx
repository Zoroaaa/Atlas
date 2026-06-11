import React, { useEffect, useState } from 'react';
import {
  Search,
  Sparkles,
  Zap,
  Shield,
  Globe,
  ChevronRight,
  Cloud,
  Heart,
  Layers,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore, useProxyStore } from '@/stores';
import { Modal } from '@/components/ui';
import { UnifiedNavBar } from '@/components/layout';
import { useNavigate } from 'react-router-dom';
import { useFeatureFlags } from '@/contexts';
import { FeedbackButton } from '@/components/feedback';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { initializeProxy } = useProxyStore();
  const { enableRegistration } = useFeatureFlags();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // 计算是否为管理员
  const isAdmin = isAuthenticated && user != null && (user.role === 'admin' || user.role === 'super_admin');

  useEffect(() => {
    initializeProxy();
  }, [initializeProxy]);

  const features = [
    {
      icon: <Zap className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '极速搜索',
      description: '多源并发搜索，快速获取结果，节省您的宝贵时间',
      gradient: 'from-amber-400 to-orange-500',
      glow: 'rgba(251,146,60,0.25)',
    },
    {
      icon: <Shield className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '安全可靠',
      description: '智能过滤有害内容，保护您的设备和隐私安全',
      gradient: 'from-emerald-400 to-teal-500',
      glow: 'rgba(52,211,153,0.25)',
    },
    {
      icon: <Globe className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '资源丰富',
      description: '聚合多个优质资源站点，一站式搜索体验',
      gradient: 'from-blue-400 to-cyan-500',
      glow: 'rgba(96,165,250,0.25)',
    },
    {
      icon: <Cloud className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '云端同步',
      description: '收藏和历史记录云端存储，多设备无缝切换',
      gradient: 'from-violet-400 to-purple-500',
      glow: 'rgba(167,139,250,0.25)',
    },
    {
      icon: <Heart className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '智能收藏',
      description: '一键收藏喜爱的资源，随时回顾精彩内容',
      gradient: 'from-rose-400 to-pink-500',
      glow: 'rgba(251,113,133,0.25)',
    },
    {
      icon: <Layers className="w-5 h-5 sm:w-6 sm:h-6" />,
      title: '分类管理',
      description: '清晰的分类体系，快速找到所需资源类型',
      gradient: 'from-cyan-400 to-teal-500',
      glow: 'rgba(34,211,238,0.25)',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden pb-16 md:pb-0">

      {/* ── Ambient background orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-400/8 dark:bg-blue-500/6 blur-[120px]" />
        <div className="absolute top-1/3 right-1/5 w-[400px] h-[400px] rounded-full bg-violet-400/8 dark:bg-violet-500/5 blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 w-[500px] h-[500px] rounded-full bg-cyan-400/6 dark:bg-cyan-500/4 blur-[120px]" />
      </div>

      {/* ── Navigation - 使用统一导航栏 ── */}
      <UnifiedNavBar
        activeTab="jav"
        onTabChange={(tab) => navigate(`/main?tab=${tab}`)}
        isAuthenticated={isAuthenticated}
        user={user}
        isAdmin={isAdmin}
        communityEnabled={enableRegistration}
      />

      {/* ── Hero Section ── */}
      <section className="relative pt-24 sm:pt-28 lg:pt-32 pb-16 sm:pb-20 lg:pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-200/60 dark:border-blue-500/20 bg-blue-50/80 dark:bg-blue-500/8 text-blue-600 dark:text-blue-400 text-xs sm:text-sm font-medium mb-8 animate-fade-in backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>简洁高效的磁力搜索工具</span>
          </div>

          {/* Headline */}
          <h1 className="display-font text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-slate-900 dark:text-white mb-6 sm:mb-8 leading-[1.05] tracking-tight animate-fade-in animation-delay-100">
            一站式
            <span className="gradient-text"> 磁力搜索 </span>
            <br className="hidden sm:block" />
            解决方案
          </h1>

          {/* Subhead */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-600 dark:text-slate-400 mb-10 sm:mb-12 max-w-2xl mx-auto leading-relaxed animate-fade-in animation-delay-200">
            聚合多个优质资源站点，提供快速、安全、便捷的搜索体验。
            支持云端同步、智能收藏，让资源管理更轻松。
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 animate-fade-in animation-delay-300">
            <button
              onClick={() => navigate(isAuthenticated ? '/main' : (enableRegistration ? '/register' : '/login'))}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-white btn-gradient text-sm sm:text-base"
            >
              {isAuthenticated ? '开始搜索' : (enableRegistration ? '立即体验' : '立即登录')}
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-base border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm"
            >
              已有账号？登录
            </button>
          </div>

          {/* Decorative stats row */}
          <div className="mt-14 sm:mt-16 grid grid-cols-3 gap-4 sm:gap-8 max-w-lg mx-auto animate-fade-in animation-delay-400">
            {[
              { num: '50+', label: '搜索源' },
              { num: '99%', label: '可用性' },
              { num: '极速', label: '响应时间' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="display-font text-2xl sm:text-3xl font-bold gradient-text mb-1">{stat.num}</div>
                <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">

          {/* Section header */}
          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-4 uppercase tracking-wider">
              产品特色
            </div>
            <h2 className="display-font text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 tracking-tight">
              专为搜索体验而生
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              我们致力于提供最佳的磁力搜索体验，以下是我们产品的核心功能
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group relative p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800/70 hover:border-blue-200 dark:hover:border-blue-800/60 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                style={{
                  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
                  animationDelay: `${index * 60}ms`,
                }}
              >
                {/* Hover glow background */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at top left, ${feature.glow} 0%, transparent 60%)` }}
                />

                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300`}
                  style={{ boxShadow: `0 6px 20px ${feature.glow}` }}>
                  {feature.icon}
                </div>

                <h3 className="relative text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 tracking-tight">
                  {feature.title}
                </h3>
                <p className="relative text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8 bg-slate-100/50 dark:bg-slate-900/40">
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-4 uppercase tracking-wider">
              使用流程
            </div>
            <h2 className="display-font text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-3 sm:mb-4 tracking-tight">
              三步开始搜索之旅
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
              简单三步，立即体验高效搜索
            </p>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-blue-300/40 dark:via-blue-600/20 to-transparent" />

            {[
              { step: '01', title: '注册账号', desc: '快速注册，开启个性化体验', icon: <Settings className="w-5 h-5 sm:w-6 sm:h-6" />, gradient: 'from-blue-500 to-violet-600' },
              { step: '02', title: '搜索资源', desc: '输入关键词，一键搜索全网', icon: <Search className="w-5 h-5 sm:w-6 sm:h-6" />, gradient: 'from-cyan-500 to-blue-600' },
              { step: '03', title: '收藏管理', desc: '收藏喜爱的资源，随时查看', icon: <Heart className="w-5 h-5 sm:w-6 sm:h-6" />, gradient: 'from-rose-500 to-pink-600' },
            ].map((item, index) => (
              <div key={index} className="text-center group relative">
                {/* Step badge */}
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 text-slate-400 dark:text-slate-500 text-xs font-bold mb-5 border border-slate-200/80 dark:border-slate-700/80 relative">
                  <div className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-gradient-to-br ${item.gradient} text-white text-xs font-bold flex items-center justify-center shadow-lg`}>
                    {index + 1}
                  </div>
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white`}
                    style={{ boxShadow: '0 4px 12px rgba(79,158,255,0.25)' }}>
                    {item.icon}
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 tracking-tight">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden p-8 sm:p-12 lg:p-16 text-center"
            style={{
              background: 'linear-gradient(135deg, #1e40af 0%, #5b21b6 50%, #0891b2 100%)',
              boxShadow: '0 24px 80px rgba(59,130,246,0.25), 0 4px 16px rgba(0,0,0,0.2)',
            }}>

            {/* Inner ambient glow */}
            <div className="absolute top-0 left-1/4 w-80 h-80 bg-white/8 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-60 h-60 bg-white/6 rounded-full blur-3xl pointer-events-none" />

            {/* Grid dots overlay */}
            <div className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

            <div className="relative">
              <h2 className="display-font text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4 tracking-tight">
                准备好开始了吗？
              </h2>
              <p className="text-sm sm:text-base text-white/75 mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed">
                {enableRegistration ? '免费注册，即刻开启高效磁力搜索体验' : '立即登录，开启高效磁力搜索体验'}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                {enableRegistration ? (
                  <button
                    onClick={() => navigate('/register')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl font-semibold bg-white text-blue-700 hover:bg-blue-50 transition-all duration-200 text-sm sm:text-base shadow-lg shadow-black/20"
                  >
                    免费注册
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                ) : null}
                <button
                  onClick={() => navigate('/login')}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl font-semibold transition-all duration-200 text-sm sm:text-base backdrop-blur-sm ${
                    enableRegistration 
                      ? 'border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/50' 
                      : 'bg-white text-blue-700 hover:bg-blue-50 shadow-lg shadow-black/20'
                  }`}
                >
                  {enableRegistration ? '已有账号' : '立即登录'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Help Modal */}
      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title="使用说明"
      >
        <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          <p className="mb-4">
            CodeSeek是一个高效的磁力搜索工具，帮助您快速找到所需资源。
          </p>
          <p className="mb-4">
            使用步骤：
          </p>
          <ol className="list-decimal pl-5 mb-4 space-y-2">
            <li>注册或登录账号</li>
            <li>在搜索框输入关键词，例如：SONE-520 MIMK-186</li>
            <li>选择合适的搜索源</li>
            <li>点击搜索按钮开始查找</li>
            <li>收藏和管理找到的资源</li>
          </ol>
        </div>
      </Modal>

      {/* 反馈建议按钮 */}
      <FeedbackButton />

    </div>
  );
};
