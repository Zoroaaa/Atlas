# GitHub 推送指南

本文档说明如何将CodeSeek项目推送到GitHub仓库。

---

## 目录

- [首次推送](#首次推送)
- [日常推送](#日常推送)
- [常见问题](#常见问题)
- [最佳实践](#最佳实践)
- [GitHub Actions自动部署](#github-actions自动部署)

---

## 首次推送

### 1. 在GitHub创建新仓库

1. 登录 [GitHub](https://github.com/)
2. 点击右上角 `+` → `New repository`
3. 输入仓库名（建议：`codeseek`）
4. **不要勾选** "Initialize this repository with a README"（避免创建冲突）
5. 点击 `Create repository`

### 2. 在本地项目目录初始化Git

```bash
# 进入项目目录
cd /path/to/codeseek

# 初始化Git仓库
git init

# 添加所有文件到暂存区
git add .

# 提交到本地仓库
git commit -m "Initial commit: CodeSeek v2.0.0"
```

### 3. 关联远程仓库

```bash
# 使用HTTPS方式（简单）
git remote add origin https://github.com/你的用户名/codeseek.git

# 或使用SSH方式（推荐，更安全）
git remote add origin git@github.com:你的用户名/codeseek.git

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

# 已推送到远程，需要强制推送（谨慎使用）
git push --force
```

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
# 1. 立即更改密钥
# 2. 从Git历史中移除
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/sensitive-file" \
  --prune-empty --tag-name-filter cat -- --all

# 3. 强制推送
git push --force --all
```

---

## GitHub Actions自动部署

项目已配置GitHub Actions，可实现自动部署。

### 配置文件位置

`.github/workflows/backend-deploy.yml`

### 触发条件

- 推送到 `main` 分支
- 手动触发

### 所需Secrets

在GitHub仓库设置中添加以下Secrets：

| Secret名称 | 说明 |
|-----------|------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare账户ID |

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
