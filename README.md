<div align="center">

<img src="frontend/public/logo.svg" alt="Atlas Logo" width="120" height="120">

# Atlas

**An open-source search engine that aggregates content across categories — JAV, anime, movies, comics, and novels, all in one place.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-4.3.0-blue.svg)](https://github.com/Zoroaaa/Atlas)
[![Cloudflare](https://img.shields.io/badge/Powered%20by-Cloudflare-orange.svg)](https://www.cloudflare.com/)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%2B%20TypeScript-green.svg)](/)
[![Backend](https://img.shields.io/badge/Backend-Hono%20%2B%20TypeScript-blue.svg)](/)

</div>

> This repository contains both English and Chinese documentation.

**English** — this file is the English README.
**中文（简体）** — [查看中文 README](README.zh-CN.md)

## Table of Contents

- [Quick Access](#-quick-access)
- [Project Documentation](#-project-documentation)
- [Project Features](#-project-features)
- [Technology Stack Overview](#️-technology-stack-overview)
- [Quick Start](#-quick-start)
- [Performance Optimization](#-performance-optimization)
- [Security Features](#-security-features)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)
- [Contact and Support](#-contact-and-support)

## Quick Access

<div align="center">

| Resource Type | Link | Remarks |
|---------|------|------|
| Online Experience | [https://atlas.wort.uk/](https://atlas.wort.uk/) | Try out all features |  

</div>

## Project Documentation

The project uses a modular documentation system, where each specialized documentation is maintained independently.

### Core Documentation

| Document | Description | Link |
|----------|------|------|
| **Configuration Documentation** | Frontend configuration, backend configuration, environment variables, proxy services, database configuration, role permission configuration | [docs/config.md](docs/config.md) |
| **Deployment Guide** | Environment requirements, local development, backend deployment, frontend deployment, database configuration, FAQ | [docs/deploy.md](docs/deploy.md) |
| **Version Changelog** | Complete version change records: v2.0 (architecture reconstruction), v3.0 (security enhancement + feature expansion), v3.1 (monorepo sharing + security hardening + performance optimization), v4.0 (anime & movie search + architecture upgrade), v4.1 (comic search + architecture optimization), v4.2 (novel search + aggregation view + observability), **v4.3 (JAV actress search + data storage management + community improvements)** | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| **GitHub Push Guide** | Git operation process, submission specifications, branch management, GitHub Actions automatic deployment configuration | [docs/github_push.md](docs/github_push.md) |

### Frontend Specialized Documentation

| Document | Description | Link |
|----------|------|------|
| **Notification Component Documentation** | Toast notification component usage, API documentation, configuration options, and best practices | [frontend/docs/notification.md](frontend/docs/notification.md) |

## Project Features

### Core Advantages

#### 1. Open-Source Search Engine with Aggregated Content
- **JAV Search**: Aggregates metadata from DMM/FANZA and searches magnets from JavBus/JavDB, with a new actress search submode (v4.3 new, data source minnano-av.com)
- **Anime Search**: Aggregates data from Bangumi, Mikan, and ShowRSS, including subtitles (nyaa source disabled due to deployment environment restrictions, v4.3 adjusted)
- **Movie Search**: Aggregates metadata from TMDB, YTS, EZTV, and TPB, including seeds and magnets
- **Comic Search**: Aggregates metadata from MangaDex and 13 other search sources
- **Novel Search**: Aggregates book metadata from Anna's Archive and TXT direct links from Qishu (v4.2 new)
- **Unified Experience**: All five categories are accessible from a single entry, with search results aggregated from multiple sources

#### 2. Modern Technology Architecture
- **React 19 + TypeScript**: Utilizes the latest React features with complete type safety provided by TypeScript
- **Vite Ultra-fast Build**: Millisecond-level hot updates and a silky smooth development experience
- **Tailwind CSS**: An atomic CSS solution that supports seamless switching between light and dark themes
- **Zustand State Management**: A lightweight state management solution with automatic persistent storage

#### 3. Cloud-Native Edge Computing
- **Cloudflare Full-Stack Deployment**: Utilizes Cloudflare Pages for frontend, Workers for backend, and D1 for database, all in a fully serverless architecture
- **Global CDN Acceleration**: Leverages Cloudflare's 300+ global edge nodes for user-proximity access
- **Zero Operational Costs**: No need to purchase servers; the free tier can support small to medium-sized applications
- **Automatic Elastic Scaling**: Automatically scales during peak traffic, eliminating concerns about server crashes

#### 4. Enterprise-Grade Security Protection
- **JWT Stateless Authentication**: Token-based authentication implemented with the jose library, supporting automatic refresh
- **Comprehensive Email Verification**: Includes registration verification, password reset, email change, and account deletion, all with email confirmation
- **Multi-Layer Security Mechanisms**: Features login failure lock, verification code frequency limits, temporary email blacklists, and security event logs
- **RBAC Permission System**: Implements a four-level role permission system (Super Admin, Administrator, User, Guest) with fine-grained permission control

### Technical Highlights

#### Frontend Technology Stack
```
React 19 → Concurrent rendering, Suspense, automatic batching
TypeScript → Complete type inference, generic constraints, type guards
Vite → Native ESM support, on-demand compilation, ultra-fast HMR
Tailwind CSS → JIT compilation, dark mode, responsive design
Zustand → Ultra-simple API, middleware support, persistent storage
@codeseek/shared → Monorepo shared package (types, utilities, validation rules)
React Router → Data routing, lazy loading, nested layout
Lucide React → 1000+ beautiful icons, Tree-shaking optimization
date-fns → Lightweight date handling, internationalization support
```

#### Backend Technology Stack
```
Hono 4.x → Ultra-lightweight web framework with multi-runtime support
TypeScript → Type safety, interface definition, generic constraints
Cloudflare Workers → Edge computing, V8 isolation environment, zero cold start
Cloudflare D1 → SQLite-compatible, globally distributed, with automatic backup
JWT (jose) → Standardized authentication, support for multiple algorithms
Resend → Modern email service with high deliverability and real-time tracking
```

### User Experience

#### Seamless Responsive Design
- **Mobile-First**: Perfectly adapts to all device sizes, from 320px to 4K monitors
- **Touch Optimization**: Supports gesture operations, sliding menus, and long-press interactions, providing a mobile experience comparable to native apps
- **Performance Priority**: First-screen load time under 1 second, interaction response time under 100ms, with a Lighthouse score of 90+

#### Intelligent Interaction Experience
- **Toast Notification System**: Unified message prompts with four types: success, error, warning, and information
- **Automatic Data Synchronization**: Cross-device synchronization of search history, favorites, and personal settings
- **Theme Customization**: Supports light, dark, and system-following themes, with one-click switching and state persistence
- **Shortcut Key Support**: Common operations support keyboard shortcuts, improving operational efficiency

## Core Features

### 1. Intelligent Search System (v4.3: Five Categories + JAV Actress Submode + Aggregation View)

#### Five Search Categories

| Category | Data Source | Description |
|----------|--------|------|
| **JAV** | DMM/FANZA / JavBus / JavDB / **minnano-av (actress profiles, v4.3 new)** | Adult film metadata + magnet aggregation + actress profile search |
| **Anime** | Bangumi / Mikan / ShowRSS | Anime metadata + subtitle groups (nyaa source disabled due to deployment environment restrictions, v4.3 adjusted) |
| **Movie** | TMDB / YTS / EZTV / TPB | Movie/TV series metadata and seed resources |
| **Comic** | MangaDex / 13 search sources | Comic metadata and resource aggregation |
| **Novel** | Anna's Archive / Qishu | Book metadata and TXT direct link resources (v4.2 new) |

#### JAV Submodes (v4.3 new)

JAV search is refined into three submodes, with URL `sub` parameter persistence — refresh / forward-back / share links all restore correctly:

| Submode | Description |
|---------|------|
| **code** (code search) | Default mode, precise metadata + magnet matching by code |
| **actress** (actress search) | Data source minnano-av.com, parses actress profiles (name / kana / romaji / alias / birthday / zodiac / measurements / birthplace / agency / career period / tags / cover), and auto-supplements JavBus works list. Click a work card to jump to code search |
| **title** (title search) | Fuzzy match by title keyword |

Actress search keywords auto-convert to Japanese (mapping table + opencc simplified-to-Japanese conversion fallback), supporting direct search with Chinese nicknames; actress cards support favorites and sharing to community.

#### Three-Layer Search Architecture

```
Category (large category)        Classification (subcategory)         Source (source instance)
┌─────────────┐                   ┌──────────────────┐               ┌──────────────┐
│    jav      │ ────>             │ metadata         │ ────>           │ DMM/FANZA    │
│             │                   │ magnet           │               │ JavBus       │
│             │                   │                  │               │ JavDB        │
├─────────────┤                   ├──────────────────┤               ├──────────────┤
│   anime     │ ────>             │ bangumi          │ ────>           │ Bangumi API  │
│             │                   │ mikan            │               │ Mikan Project│
│             │                   │ nyaa             │               │ Nyaa.si      │
│             │                   │ showrss          │               │ ShowRSS      │
├─────────────┤                   ├──────────────────┐               ├──────────────┤
│   movie     │ ────>             │ tmdb             │ ────>           │ TMDB API     │
│             │                   │ yts              │               │ YTS          │
│             │                   │ eztv             │               │ EZTV         │
│             │                   │ tpb              │               │ TPB          │
├─────────────┤                   ├──────────────────┐               ├──────────────┤
│   manga     │ ────>             │ mangadex         │ ────>           │ MangaDex API │
│             │                   │ sources          │               │ 13 search sources   │
├─────────────┤                   ├──────────────────┐               ├──────────────┤
│   novel     │ ────>             │ anna-archive     │ ────>           │ Anna's Archive│
│             │                   │ qishu            │               │ Qishu        │
└─────────────┘                   └──────────────────┘               └──────────────┘
```

**Core Design:**
- **Provider Registration Mode**: Adding a new search category only requires creating a Provider class and registering one line in `backend/src/index.ts`
- **Classification Independent Routing**: Each classification has independent search logic and result panels
- **Database-Driven Source Management**: Enable/disable/weight of search sources managed through backend administration

#### Multi-Source Aggregation Search
- **One-Click Aggregation**: Select category and classification, input keyword, and display results from all sources
- **Intelligent Sorting**: Sort results based on search source priority, usage frequency, and availability status
- **Classification Filtering**: Support filtering by large category (JAV/Anime/Movie/Comic/Novel) and sub-classification
- **Fixed Source Management**: One-click fix common search sources for personalized customization (v4.1 new feature)
- **Aggregation View**: Work-level resource grouping, multi-source resources merged per work (v4.2 new)
- **Asynchronous Data Collection**: Search results asynchronously persisted to DB with deduplication and multi-source merging, anonymous design storing no user info (v4.3 new)
- **History Record**: Automatically save search history (with cover image), support quick re-search and history statistics

#### Search Suggestions and Hot Searches
- **Smart Prompt**: Automatically prompt related search suggestions when typing a keyword
- **Hot Search**: Real-time display of hot search keywords, helping discover popular resources
- **Search Statistics**: Personal search statistics to understand search habits

#### Search Source Management
- **Enable/Disable**: Free control which search sources participate in search
- **Priority Adjustment**: Customize search source display order
- **Status Monitoring**: Real-time view of search source availability
- **Custom Addition**: Support adding custom search sources (URL template)

### 2. User System

#### Authentication and Security
- **GitHub OAuth Login**: One-click login with GitHub account, automatically creating/associating an account
- **Google OAuth Login**: One-click login with Google account (v4.2 new)
- **JWT Token Authentication**: Stateless authentication with automatic token refresh support
- **Login Protection**: Automatically lock after 5 consecutive failed attempts for 15 minutes
- **Session Management**: View active sessions and support forced logout

#### Personal Data Management
- **Favorites**: Favorite commonly used search results (support all categories: JAV/Anime/Movie/Comic/Novel), with classification management
- **Search History**: Automatically record search history (with cover thumbnail), support clear and delete
- **Data Sync**: Cross-device synchronization of favorites, history, and settings
- **Data Export**: Support export personal data (JSON format)

### 3. Community Features

#### Search Source Sharing
- **Share Search Sources**: Share discovered useful search sources with the community
- **6 Share Categories Expanded**: Supports full-category content sharing across JAV / Anime / Movie / Comic / Novel / Actress (v4.3 improved — original manga / actress / novel links were broken, now fixed)
- **Tag Management**: Add tags to search sources for easy classification search
- **Review Mechanism**: Admin review required before listing to ensure quality

#### Interactive Features
- **Comment Rating**: Publish reviews on search sources to help others choose
- **Like/Favorite**: Like quality search sources and collect them in personal list
- **Report Mechanism**: Report违规内容, with admin processing

#### Contribution Statistics
- **Personal Contribution**: View number of shared search sources, download count, and rating
- **Community Rankings**: Hot shares and active contributor rankings

### 4. User Feedback

#### Feedback Submission
- **Multiple Feedback Types**: Problem feedback, optimization suggestions, others
- **Anonymous Support**: Unregistered users can also submit feedback
- **Automatic Collection**: Automatically record page URL and browser information

#### Feedback Management
- **Status Tracking**: View feedback processing status (pending/waiting/solved/closed)
- **Email Notification**: Automatic email notification after feedback processing completed
- **History Record**: View own feedback history

### 5. Administrator Functions

#### User Management
- **User List**: Paginated query, search filtering, status view
- **Role Permissions**: Four-level roles (Super Admin, Administrator, User, Guest)
- **Status Control**: Enable/disable user accounts
- **Login Logs**: View user login records and IP information

#### Content Management
- **Search Source Management**: CRUD system for search sources and classifications (support five major categories)
- **Data Storage Management**: Search results asynchronously persisted to DB with deduplication, multi-source merging; browse / hide / cleanup stale data by type, with statistics overview (v4.3 new)
- **Community Review**: Review user-shared search sources
- **Report Processing**: Process user-reported content

#### System Monitoring
- **Dashboard**: One-view system operation status and user activity
- **Trend Analysis**: User growth, search trends, activity changes
- **Behavior Logs**: User operation behavior record and analysis
- **Configuration Management**: Dynamic modification of system configuration without redeployment

### 6. JAV Ranking Function

#### Multi-Dimensional Rankings
- **Coded Selection**: JavBus homepage top 3 pages, random 20 entries
- **Uncoded Selection**: Uncoded area top 3 pages, random 20 entries
- **HD Ranking**: HD category top 3 pages, random 20 entries
- **Subtitle Ranking**: Subtitle category top 3 pages, random 20 entries
- **Random Category**: Random 10 categories, each category 12 entries
- **Random Actress**: Random 10 actresses, each actress 12 entries

#### Smart Recommendation
- **Number Suggestion**: Input keyword to automatically match numbers
- **Multi-Source Data**: Support multi-source data aggregation display
- **Login Required**: Need user login authentication to access

## Technology Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer (v4.3.0)              │
│  • React 19 + TypeScript                                │
│  • Vite Build Tool                                       │
│  • Tailwind CSS Styling Framework                        │
│  • Zustand State Management                              │
│  • React Router Routing Management                        │
│  • AnimeSearchResultPanel / MovieSearchResultPanel      │
│  • MangaSearchResultPanel (v4.1 new)                    │
│  • NovelSearchResultPanel (v4.2 new)                    │
│  • JavActressResultsPanel + ActressesPanel (v4.3 new)   │
│  • DataStorageTab (v4.3 new)                            │
│  • Deployment: Cloudflare Pages                         │
├─────────────────────────────────────────────────────────┤
│                  Provider Layer (v4.3 Extended)          │
│  • SearchProvider Interface + ProviderRegistry Registry   │
│  • anime-provider (Bangumi/Mikan/ShowRSS)               │
│  • movie-provider (TMDB/YTS/EZTV/TPB)                   │
│  • manga-provider (MangaDex/13 search sources)                 │
│  • novel-provider (Anna's Archive/Qishu) (v4.2 new)     │
│  • jav-provider (Metadata/Magnet + Actress submode v4.3) │
├─────────────────────────────────────────────────────────┤
│                  Backend Service Layer (v4.3.0)          │
│  • Hono Framework (Ultra-lightweight Web Framework)      │
│  • TypeScript Type Safety                                │
│  • Cloudflare Workers (Edge Computing)                  │
│  • Cloudflare D1 (SQLite Database)                      │
│  • JWT Token Authentication (jose)                       │
│  • Resend Email Service                                  │
│  • D1 Persisted Rate Limiting (v4.2 new)                │
│  • Google OAuth Login (v4.2 new)                        │
│  • Data Storage Management (async dedup, v4.3 new)       │
│  • opencc Simplified-to-Japanese conversion (actress keyword, v4.3 new) │
└─────────────────────────────────────────────────────────┘
```

[See Complete Architecture Design](docs/backend-frontend-tree.md)

## Quick Start

### Environment Requirements

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **Cloudflare Account**: For deploying Workers and D1 database
- **Wrangler CLI**: Cloudflare development tool (>= 3.x)

### Quick Deployment

```bash
# Clone project
git clone https://github.com/Zoroaaa/Atlas.git
cd Atlas

# Install dependencies
pnpm install

# Initialize database (including v4.2 new novel search sources, v4.3 new data storage tables)
npx wrangler d1 create atlas-db
npx wrangler d1 execute atlas-db --file=database/01_schema_core.sql
npx wrangler d1 execute atlas-db --file=database/02_schema_search.sql
npx wrangler d1 execute atlas-db --file=database/07_data_search_sources.sql
npx wrangler d1 execute atlas-db --file=database/11_schema_data_storage.sql

# Local development
pnpm dev

# Production deployment
pnpm build && cd backend && npx wrangler deploy
```

[See Detailed Deployment Guide](docs/deploy.md)
[See Configuration Instructions](docs/config.md)
[See Complete API Documentation](docs/api/index.md)
[See v4.3 Changelog](docs/CHANGELOG.md)

## Performance Optimization

### Frontend Performance Optimization
- React 19 concurrency features + Vite fast build
- Code splitting, route-level lazy loading, tree-shaking
- Zustand persistent state + API response cache
- React.memo and useMemo optimization to reduce re-rendering
- Search cache layer to reduce repeated requests (v4.2 new)

### Backend Performance Optimization
- Cloudflare global edge nodes for near-source processing
- Database index optimization + parameterized queries
- Response compression (gzip/brotli) + batch operation support
- Request throttling + concurrency control + degradation strategies
- D1 persisted multi-level rate limiting (v4.2 new)

## Security Features

### Frontend Security
- XSS protection + CSRF protection
- Content Security Policy (CSP) + Subresource Integrity (SRI)
- JWT Token authentication + request signature verification
- Self-built frontend error monitoring observability system (v4.2 new)

### Backend Security
- JWT Token authentication (jose library) + RBAC permission control
- SQL injection protection + password encryption storage (bcrypt)
- Login failure locking mechanism + security event logs
- CORS configuration + rate limiting + IP recording
- Email registration whitelist validation (v4.2 new)

## License

This project is licensed under the [MIT License](LICENSE).

You are free to:
- **Use** - for any purpose, including commercial use
- **Modify** - modify the source code to suit your needs
- **Distribute** - share the project or its modifications
- **Private Use** - use in private projects

But you must:
- **Retain Copyright Notices** - keep original copyright notices and license text
- **State Modifications** - indicate changes made to the source code

## Acknowledgments

### Technical Platforms
- **[Cloudflare](https://www.cloudflare.com/)** - providing an excellent edge computing platform
- **[GitHub](https://github.com/)** - code hosting and collaboration platform
- **[Resend](https://resend.com/)** - email sending service

### Open Source Community
Thanks to all developers who contribute to the open source community!

## Contact and Support

### Official Channels
- **Project Homepage**: [GitHub - Atlas](https://github.com/Zoroaaa/Atlas)
- **Issue Reporting**: [GitHub Issues](https://github.com/Zoroaaa/Atlas/issues)
- **Feature Suggestions**: [GitHub Discussions](https://github.com/Zoroaaa/Atlas/discussions)

### How to Contribute
We welcome all forms of contributions:
- Report Bugs
- Propose New Features
- Improve Documentation
- Submit Code
- Translate Documentation

#### Contribution Steps
1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

<div align="center">

### Atlas — Open Source Aggregation Search Engine

**JAV / Anime / Movies / Comics / Novels, one-stop search**

Made with ❤️ by [Zoro](https://github.com/Zoroaaa)

</div>
