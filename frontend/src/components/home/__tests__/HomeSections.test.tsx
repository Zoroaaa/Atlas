import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { HeroSection } from '../HeroSection';
import { CapabilityGrid } from '../CapabilityGrid';
import { FeatureShowcase } from '../FeatureShowcase';
import { ScaleStrip } from '../ScaleStrip';
import { TrustSection } from '../TrustSection';
import { StartSection } from '../StartSection';

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('门户首页新版区块', () => {
  it('首屏展示新主张、类别与注册 CTA', () => {
    renderWithRouter(<HeroSection enableRegistration />);

    expect(
      screen.getByRole('heading', { level: 1, name: '一个入口，聚合五类内容的多源搜索结果' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /创建账号/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: '查看能力' })).toHaveAttribute('href', '#capabilities');
    expect(screen.getByText('JAV搜索')).toBeInTheDocument();
    expect(screen.getByText('注册后即可搜索；可用源站与功能以站点配置为准。')).toBeInTheDocument();
    expect(screen.queryByText(/永久免费/)).not.toBeInTheDocument();
    expect(screen.queryByText(/毫秒级/)).not.toBeInTheDocument();
  });

  it('关闭注册时首屏 CTA 指向登录', () => {
    renderWithRouter(<HeroSection enableRegistration={false} />);

    expect(screen.getByRole('link', { name: /登录使用/ })).toHaveAttribute('href', '/login');
  });

  it('能力概览覆盖六项能力', () => {
    renderWithRouter(<CapabilityGrid showCommunity />);

    expect(screen.getByRole('heading', { level: 2, name: '五类内容，一套搜索与账号体系' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '五类内容' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '多源聚合' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '源站看板' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'JAV 深度' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '关注与通知' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '账号与社区' })).toBeInTheDocument();
  });

  it('社区关闭时能力概览不承诺社区能力', () => {
    renderWithRouter(<CapabilityGrid showCommunity={false} />);

    expect(screen.getByText('收藏、历史与多端同步；社区能力以站点配置为准。')).toBeInTheDocument();
  });

  it('四组核心功能覆盖搜索、JAV、关注与账号', () => {
    renderWithRouter(<FeatureShowcase showCommunity />);

    expect(screen.getByRole('heading', { level: 2, name: '从聚合搜索到关注与账号' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '一次搜索，多个源站' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'JAV 搜索，从番号到演员与实体' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '关注之后，更新会来找你' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: '收藏、历史与社区，留在同一个账号' })
    ).toBeInTheDocument();
    expect(screen.getByText('跨语言别名：同一作品的中文、日文、英文标题可指向同一条目（按已收录别名）。')).toBeInTheDocument();
  });

  it('可核验事实不写用户量或资源量', () => {
    renderWithRouter(<ScaleStrip />);

    expect(screen.getByRole('heading', { level: 2, name: '可核验的产品事实' })).toBeInTheDocument();
    expect(screen.getByText('类内容')).toBeInTheDocument();
    expect(screen.getByText('种语言')).toBeInTheDocument();
    expect(screen.getByText('种使用方式')).toBeInTheDocument();
    expect(screen.getByText('个账号')).toBeInTheDocument();
    expect(screen.getByText('内置源站数量随版本与部署配置变化，首页不写死数字。')).toBeInTheDocument();
  });

  it('开源合规区块包含条款、隐私与年龄提示', () => {
    renderWithRouter(<TrustSection />);

    expect(screen.getByRole('heading', { level: 2, name: '可审计，也可自行部署' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看服务条款/ })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /阅读隐私政策/ })).toHaveAttribute('href', '/privacy');
    expect(screen.getByText('站点包含成人内容，仅限 18 岁及以上用户访问。')).toBeInTheDocument();
  });

  it('三步上手展示账号、搜索与保存', () => {
    renderWithRouter(<StartSection enableRegistration />);

    expect(screen.getByRole('heading', { level: 2, name: '三步进入搜索' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '创建账号或登录' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '选择类别并搜索' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '保存与关注' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /创建账号/ })).toHaveAttribute('href', '/register');
  });
});
