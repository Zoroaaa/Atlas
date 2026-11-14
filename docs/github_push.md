# GitHub 推送指南

本文档说明如何将 Atlas 项目推送到 GitHub 仓库（默认分支 `main`，当前版本 `v1.8.0`）。

---

## 目录

- [首次推送](#首次推送)
- [日常推送](#日常推送)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)
- [部署方式](#部署方式)

---

## 首次推送

### 1. 在GitHub创建新仓库

1. 登录 [GitHub](https://github.com/)
2. 点击右上角 `+` → `New repository`
3. 输入仓库名（建议：`Atlas`）
4. **不要勾选** "Initialize this repository with a README"（避免创建冲突）
5. 点击 `Create repository`

### 2. 在本地项目目录初始化Git

```bash
# 进入项目目录
cd /path/to/Atlas

# 初始化Git仓库
git init

# 添加所有文件到暂存区（确认 .gitignore 已排除 node_modules / .dev.vars / dist）
git add .

# 提交到本地仓库
git commit -m "chore(release): 初始化 Atlas v1.6.0"
```

### 3. 关联远程仓库

```bash
# 使用HTTPS方式（简单）
git remote add origin https://github.com/你的用户名/Atlas.git

# 或使用SSH方式（推荐，更安全）
git remote add origin git@github.com:你的用户名/Atlas.git

# 验证远程仓库
git remote -v
```

### 4. 推送到GitHub

```bash
# 首次推送（设置上游分支）
git push -u origin main

# 如果本地默认分支是master，先重命名
git branch -M main
git push -u origin main
```

---

## 日常推送

### 基本流程

```bash
# 1. 查看当前状态
git status

# 2. 添加修改的文件
git add .                    # 添加所有修改
git add filename.txt         # 添加特定文件

# 3. 提交更改
git commit -m "feat: 添加新功能描述"

# 4. 推送到远程
git push
```

### 提交信息规范

推荐使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）：**
- `feat`: 新功能
- `fix`: 修复Bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构代码
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例：**
```bash
git commit -m "feat(search): 添加搜索建议功能"
git commit -m "fix(auth): 修复登录Token过期问题"
git commit -m "docs: 更新API文档"
git commit -m "refactor(frontend): 重构组件结构"
git commit -m "feat(config): 新增系统配置管理页面"
git commit -m "security: 增强邮箱验证码限流机制"
```

---

## 常见问题

### 1. 权限错误

**问题**: 推送时提示权限错误

**解决方案**:
```bash
# 使用SSH方式需要先配置SSH密钥
# 参考: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

# 或使用HTTPS + Personal Access Token
# GitHub已不再支持密码认证，需要使用Token
```

### 2. 分支名称冲突

**问题**: 本地分支是master，远程是main

**解决方案**:
```bash
# 重命名本地分支
git branch -M main

# 推送到main分支
git push -u origin main
```

### 3. 远程仓库已有文件冲突

**问题**: 远程仓库初始化了README，导致推送失败

**解决方案**:
```bash
# 拉取远程更改并合并
git pull origin main --allow-unrelated-histories

# 解决冲突后提交
git add .
git commit -m "merge: 合并远程仓库"

# 推送
git push -u origin main
```

### 4. 合并冲突

**问题**: 存在未解决的合并冲突

**解决方案**:
```bash
# 查看冲突文件
git status

# 手动解决冲突后
git add <冲突文件>
git commit -m "merge: 解决合并冲突"

# 或中止合并
git merge --abort

# 强制使用远程版本
git fetch --all
git reset --hard origin/main
```

### 5. 撤销最近提交

**问题**: 提交了错误的代码

**解决方案**:
```bash
# 撤销最近一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最近一次提交（丢弃修改）
git reset --hard HEAD~1
```

已推送到远程时，优先用新的修复提交覆盖错误，而不是重写历史。多人协作或 `main` 受保护时禁止 force push；确需重写时先确认没有其他人基于该提交工作，并让仓库管理员临时解除保护。

---

## 最佳实践

### 1. 使用.gitignore

确保项目根目录有 `.gitignore` 文件：

```gitignore
# 依赖目录
node_modules/

# 构建输出
dist/
build/

# 环境变量
.env
.env.local
.env.*.local

# IDE配置
.idea/
.vscode/
*.swp
*.swo

# 系统文件
.DS_Store
Thumbs.db

# 日志文件
*.log
npm-debug.log*

# Wrangler临时文件
.wrangler/

# TypeScript缓存
*.tsbuildinfo
```

### 2. 分支管理

> 仓库默认分支为 `main`；历史分支 `v1` / `v2` / `v3` 已删除，请勿再向这些分支推送。

```bash
# 创建新功能分支
git checkout -b feature/new-feature

# 切换回主分支
git checkout main

# 合并分支
git merge feature/new-feature

# 删除已合并的分支
git branch -d feature/new-feature
```

### 3. 保持同步

```bash
# 拉取最新更改
git pull origin main

# 或使用fetch + merge
git fetch origin
git merge origin/main
```

### 4. 使用Pull Request

1. 创建功能分支进行开发
2. 推送分支到GitHub
3. 在GitHub上创建Pull Request
4. 代码审查后合并

```bash
# 创建功能分支
git checkout -b feature/amazing-feature

# 开发完成后推送
git push origin feature/amazing-feature

# 在GitHub上创建PR，合并后删除分支
git checkout main
git pull
git branch -d feature/amazing-feature
```

### 5. 保护敏感信息

```bash
# 不要提交敏感信息
# 使用环境变量存储密钥
# 在Cloudflare Dashboard中设置secrets

# 如果不小心提交了敏感信息
# 1. 立即在对应平台轮换/吊销密钥（最重要）
# 2. 从当前版本移除：git rm --cached path/to/sensitive-file 并提交
# 3. 历史记录清理需评估影响范围，由仓库管理员执行并通知所有协作者重新克隆
```

本项目敏感配置应放在 `backend/.dev.vars`（本地）或 Cloudflare Secrets（生产），两者都不进入版本库。

---

## 版本发布流程

1. 确认 `git status`、当前分支与远端（`git status -sb`、`git remote -v`、`git log -1 --oneline`）
2. 同步版本号：根 `package.json`、`backend/package.json`、`frontend/package.json`、`packages/shared/package.json`、`backend/wrangler.toml` 的 `APP_VERSION`、前后端版本常量、README 徽章与 `docs/CHANGELOG.md`
3. 在 `docs/CHANGELOG.md` 按「新增 / 修改 / 修复 / 优化」补版本章节
4. 按功能分组提交（例如 `feat(help): ...`、`fix(community): ...`、`docs: ...`、`chore(release): ...`）
5. 普通推送：`git push origin main`。不要 force push，不要跳过 hook
6. 推送后确认 Cloudflare → Workers & Pages → `atlas` → Deployments 里出现本次提交触发的构建且状态为成功

---

## 部署方式

项目采用 **Workers Builds 直连 GitHub** 部署：推送到 `main` 即自动构建（前端产物 + Worker）并部署到 Worker `atlas`。配置见 [deploy.md](./deploy.md) 第三节第 7 步。

### 应急手动部署

配置文件位置：`.github/workflows/backend-deploy.yml`

### 触发条件

- 仅在 Actions 页面手动触发（`workflow_dispatch`）；push **不会**触发，避免与 Workers Builds 双写互相覆盖
- 流程与 Workers Builds 等价（typecheck → lint → 构建前端 → `wrangler deploy`）

### 所需Secrets

在GitHub仓库设置中添加以下Secrets：

| Secret名称 | 说明 |
|-----------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（后端部署） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（后端部署） |
| `ATLAS_RANKING_IMPORT_URL` | 榜单导入接口完整地址（`${BACKEND_URL}/api/internal/rankings/import`） |
| `RANKINGS_IMPORT_SECRET` | 榜单导入共享密钥，与 Worker Secret 保持一致 |

### 创建API Token

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 My Profile > API Tokens
3. 创建Token，选择 "Edit Cloudflare Workers" 模板
4. 复制Token到GitHub Secrets

---

## 验证推送成功

推送完成后：

1. 访问 GitHub 仓库页面
2. 确认所有文件已上传
3. 检查 README.md 正确显示
4. 验证 GitHub Actions 是否成功运行（如有配置）

---

## 相关链接

- [Git官方文档](https://git-scm.com/doc)
- [GitHub文档](https://docs.github.com/)
- [GitHub SSH配置](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
- [Conventional Commits](https://www.conventionalcommits.org/)
