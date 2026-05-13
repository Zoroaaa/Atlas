import { Env } from '@/types';
import { generateId } from '@/utils';

export interface MajorCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requiresKeyword: boolean;
  displayOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SourceCategory {
  id: string;
  majorCategoryId: string;
  majorCategoryName: string;
  majorCategoryIcon: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  displayOrder: number;
  isSystem: boolean;
  isActive: boolean;
  defaultSearchable: boolean;
  defaultSiteType: string;
  searchPriority: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SearchSource {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  majorCategoryId: string;
  majorCategoryName: string;
  majorCategoryIcon: string;
  name: string;
  originalName: string;
  subtitle: string;
  originalSubtitle: string;
  description: string;
  icon: string;
  originalIcon: string;
  urlTemplate: string;
  homepageUrl: string;
  siteType: string;
  searchable: boolean;
  requiresKeyword: boolean;
  searchPriority: number;
  originalPriority: number;
  isSystem: boolean;
  isActive: boolean;
  displayOrder: number;
  usageCount: number;
  lastUsedAt: number | null;
  userEnabled: boolean;
  userNotes: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UserSourceConfig {
  id: string;
  userId: string;
  sourceId: string;
  sourceName: string;
  sourceIcon: string;
  isSystem: boolean;
  categoryName: string;
  majorCategoryName: string;
  isEnabled: boolean;
  customPriority: number | null;
  customName: string | null;
  customSubtitle: string | null;
  customIcon: string | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateMajorCategoryData {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  requiresKeyword?: boolean;
}

export interface CreateSourceCategoryData {
  majorCategoryId: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultSearchable?: boolean;
  defaultSiteType?: string;
  searchPriority?: number;
}

export interface UpdateSourceCategoryData {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  defaultSearchable?: boolean;
  defaultSiteType?: string;
  searchPriority?: number;
}

export interface CreateSearchSourceData {
  categoryId: string;
  name: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate: string;
  homepageUrl?: string;
  siteType?: string;
  searchable?: boolean;
  requiresKeyword?: boolean;
  searchPriority?: number;
}

export interface UpdateSearchSourceData {
  categoryId?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  urlTemplate?: string;
  homepageUrl?: string;
  siteType?: string;
  searchable?: boolean;
  requiresKeyword?: boolean;
  searchPriority?: number;
}

export interface UpdateUserSourceConfigData {
  sourceId: string;
  isEnabled?: boolean;
  customPriority?: number;
  customName?: string;
  customSubtitle?: string;
  customIcon?: string;
  notes?: string;
}

export class SearchSourcesService {
  async getAllMajorCategories(env: Env): Promise<{ majorCategories: MajorCategory[] }> {
    try {
      const result = await env.DB.prepare(
        `SELECT * FROM search_major_categories 
         WHERE is_active = 1 
         ORDER BY display_order ASC, created_at ASC`
      ).all();

      return {
        majorCategories: (result.results || []).map((cat) => this.formatMajorCategory(cat)),
      };
    } catch (error) {
      console.error('获取搜索源大类失败:', error);
      throw new Error('获取搜索源大类失败', { cause: error });
    }
  }

  async createMajorCategory(
    env: Env,
    majorCategoryData: CreateMajorCategoryData,
    _creatorId: string
  ): Promise<MajorCategory> {
    try {
      const existing = await env.DB.prepare(
        `SELECT id FROM search_major_categories 
         WHERE name = ? AND is_active = 1`
      )
        .bind(majorCategoryData.name)
        .first();

      if (existing) {
        throw new Error('大类名称已存在');
      }

      const majorCategoryId = generateId();
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO search_major_categories (
          id, name, description, icon, color, requires_keyword,
          display_order, is_system, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          majorCategoryId,
          majorCategoryData.name,
          majorCategoryData.description || '',
          majorCategoryData.icon || '🌟',
          majorCategoryData.color || '#6b7280',
          majorCategoryData.requiresKeyword ? 1 : 0,
          999,
          0,
          1,
          now,
          now
        )
        .run();

      return this.formatMajorCategory({
        id: majorCategoryId,
        name: majorCategoryData.name,
        description: majorCategoryData.description || '',
        icon: majorCategoryData.icon || '🌟',
        color: majorCategoryData.color || '#6b7280',
        requires_keyword: majorCategoryData.requiresKeyword ? 1 : 0,
        display_order: 999,
        is_system: 0,
        is_active: 1,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      console.error('创建搜索源大类失败:', error);
      throw error;
    }
  }

  async getUserSourceCategories(
    env: Env,
    userId: string,
    options: { majorCategoryId?: string; includeSystem?: boolean } = {}
  ): Promise<{ categories: SourceCategory[] }> {
    try {
      const { majorCategoryId, includeSystem = true } = options;

      let query = `
        SELECT sc.*, mc.name as major_category_name, mc.icon as major_category_icon
        FROM search_source_categories sc
        LEFT JOIN search_major_categories mc ON sc.major_category_id = mc.id
        WHERE sc.is_active = 1
      `;
      const params: (string | number)[] = [];

      if (majorCategoryId) {
        query += ` AND sc.major_category_id = ?`;
        params.push(majorCategoryId);
      }

      if (!includeSystem) {
        query += ` AND (sc.is_system = 0 OR sc.created_by = ?)`;
        params.push(userId);
      }

      query += ` ORDER BY sc.display_order ASC, sc.created_at ASC`;

      const result = await env.DB.prepare(query)
        .bind(...params)
        .all();

      return {
        categories: (result.results || []).map((cat) => this.formatSourceCategory(cat)),
      };
    } catch (error) {
      console.error('获取搜索源分类失败:', error);
      throw new Error('获取搜索源分类失败', { cause: error });
    }
  }

  async createSourceCategory(
    env: Env,
    categoryData: CreateSourceCategoryData,
    creatorId: string
  ): Promise<SourceCategory> {
    try {
      const majorCategory = await env.DB.prepare(
        `SELECT id FROM search_major_categories 
         WHERE id = ? AND is_active = 1`
      )
        .bind(categoryData.majorCategoryId)
        .first();

      if (!majorCategory) {
        throw new Error('指定的大类不存在');
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM search_source_categories 
         WHERE major_category_id = ? AND name = ? AND is_active = 1`
      )
        .bind(categoryData.majorCategoryId, categoryData.name)
        .first();

      if (existing) {
        throw new Error('在该大类下分类名称已存在');
      }

      const categoryId = generateId();
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO search_source_categories (
          id, major_category_id, name, description, icon, color,
          display_order, is_system, is_active, default_searchable,
          default_site_type, search_priority, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          categoryId,
          categoryData.majorCategoryId,
          categoryData.name,
          categoryData.description || '',
          categoryData.icon || '📁',
          categoryData.color || '#3b82f6',
          999,
          0,
          1,
          categoryData.defaultSearchable ? 1 : 0,
          categoryData.defaultSiteType || 'search',
          categoryData.searchPriority || 5,
          creatorId,
          now,
          now
        )
        .run();

      return this.formatSourceCategory({
        id: categoryId,
        major_category_id: categoryData.majorCategoryId,
        name: categoryData.name,
        description: categoryData.description || '',
        icon: categoryData.icon || '📁',
        color: categoryData.color || '#3b82f6',
        display_order: 999,
        is_system: 0,
        is_active: 1,
        default_searchable: categoryData.defaultSearchable ? 1 : 0,
        default_site_type: categoryData.defaultSiteType || 'search',
        search_priority: categoryData.searchPriority || 5,
        created_by: creatorId,
        created_at: now,
        updated_at: now,
      });
    } catch (error) {
      console.error('创建搜索源分类失败:', error);
      throw error;
    }
  }

  async updateSourceCategory(
    env: Env,
    categoryId: string,
    updateData: UpdateSourceCategoryData,
    userId: string
  ): Promise<{ category: SourceCategory }> {
    try {
      const category = (await env.DB.prepare(
        `SELECT * FROM search_source_categories 
         WHERE id = ? AND is_active = 1`
      )
        .bind(categoryId)
        .first()) as {
        is_system: number;
        created_by: string;
        name: string;
        major_category_id: string;
      } | null;

      if (!category) {
        throw new Error('搜索源分类不存在');
      }

      if (category.is_system && category.created_by !== userId) {
        throw new Error('无权限修改系统分类');
      }

      if (!category.is_system && category.created_by !== userId) {
        throw new Error('无权限修改此分类');
      }

      if (updateData.name && updateData.name !== category.name) {
        const existing = await env.DB.prepare(
          `SELECT id FROM search_source_categories 
           WHERE major_category_id = ? AND name = ? AND id != ? AND is_active = 1`
        )
          .bind(category.major_category_id, updateData.name, categoryId)
          .first();

        if (existing) {
          throw new Error('分类名称已存在');
        }
      }

      const updateFields: string[] = [];
      const updateValues: (string | number)[] = [];

      Object.keys(updateData).forEach((field) => {
        const dbField = this.convertCategoryFieldToDb(field);
        if (dbField) {
          updateFields.push(`${dbField} = ?`);
          updateValues.push((updateData as Record<string, string | number>)[field]);
        }
      });

      updateFields.push('updated_at = ?');
      updateValues.push(Date.now());
      updateValues.push(categoryId);

      await env.DB.prepare(
        `UPDATE search_source_categories 
         SET ${updateFields.join(', ')}
         WHERE id = ?`
      )
        .bind(...updateValues)
        .run();

      const updatedCategory = await env.DB.prepare(
        `SELECT sc.*, mc.name as major_category_name, mc.icon as major_category_icon
         FROM search_source_categories sc
         LEFT JOIN search_major_categories mc ON sc.major_category_id = mc.id
         WHERE sc.id = ?`
      )
        .bind(categoryId)
        .first();

      if (!updatedCategory) {
        throw new Error('更新后获取分类失败');
      }

      return {
        category: this.formatSourceCategory(updatedCategory),
      };
    } catch (error) {
      console.error('更新搜索源分类失败:', error);
      throw error;
    }
  }

  async deleteSourceCategory(
    env: Env,
    categoryId: string,
    userId: string
  ): Promise<{ message: string; deletedCategory: { id: string; name: string } }> {
    try {
      const category = (await env.DB.prepare(
        `SELECT * FROM search_source_categories 
         WHERE id = ? AND is_active = 1`
      )
        .bind(categoryId)
        .first()) as {
        id: string;
        name: string;
        is_system: number;
        created_by: string;
      } | null;

      if (!category) {
        throw new Error('搜索源分类不存在');
      }

      if (category.is_system) {
        throw new Error('系统分类不能删除');
      }

      if (category.created_by !== userId) {
        throw new Error('无权限删除此分类');
      }

      const sourcesUsingCategory = (await env.DB.prepare(
        `SELECT COUNT(*) as count FROM search_sources 
         WHERE category_id = ? AND is_active = 1`
      )
        .bind(categoryId)
        .first()) as { count: number };

      if (sourcesUsingCategory.count > 0) {
        throw new Error(`无法删除分类，还有 ${sourcesUsingCategory.count} 个搜索源正在使用此分类`);
      }

      await env.DB.prepare(
        `UPDATE search_source_categories 
         SET is_active = 0, updated_at = ?
         WHERE id = ?`
      )
        .bind(Date.now(), categoryId)
        .run();

      return {
        message: '搜索源分类删除成功',
        deletedCategory: {
          id: category.id,
          name: category.name,
        },
      };
    } catch (error) {
      console.error('删除搜索源分类失败:', error);
      throw error;
    }
  }

  async getUserSearchSources(
    env: Env,
    userId: string,
    filters: {
      categoryId?: string;
      majorCategoryId?: string;
      searchable?: boolean;
      includeSystem?: boolean;
      enabledOnly?: boolean;
    } = {}
  ): Promise<{ sources: SearchSource[] }> {
    try {
      const { categoryId, majorCategoryId, searchable, includeSystem = true, enabledOnly = false } = filters;

      let query = `
        SELECT 
          ss.*,
          sc.name as category_name,
          sc.icon as category_icon,
          sc.major_category_id,
          mc.name as major_category_name,
          mc.icon as major_category_icon,
          usc.is_enabled as user_enabled,
          usc.custom_priority,
          usc.custom_name,
          usc.custom_subtitle,
          usc.custom_icon,
          usc.notes as user_notes
        FROM search_sources ss
        LEFT JOIN search_source_categories sc ON ss.category_id = sc.id
        LEFT JOIN search_major_categories mc ON sc.major_category_id = mc.id
        LEFT JOIN user_source_configs usc ON ss.id = usc.source_id AND usc.user_id = ?
        WHERE ss.is_active = 1
      `;
      const params: (string | number | boolean)[] = [userId];

      if (categoryId) {
        query += ` AND ss.category_id = ?`;
        params.push(categoryId);
      }

      if (majorCategoryId) {
        query += ` AND sc.major_category_id = ?`;
        params.push(majorCategoryId);
      }

      if (searchable !== null && searchable !== undefined) {
        query += ` AND ss.searchable = ?`;
        params.push(searchable ? 1 : 0);
      }

      if (!includeSystem) {
        query += ` AND (ss.is_system = 0 OR ss.created_by = ?)`;
        params.push(userId);
      }

      if (enabledOnly) {
        query += ` AND (usc.is_enabled = 1 OR (usc.is_enabled IS NULL AND ss.is_system = 1 AND ss.searchable = 1))`;
      }

      query += ` ORDER BY 
        COALESCE(usc.custom_priority, ss.search_priority) ASC, 
        ss.display_order ASC, 
        ss.created_at ASC`;

      const result = await env.DB.prepare(query)
        .bind(...params)
        .all();

      return {
        sources: (result.results || []).map((source) => this.formatSearchSource(source)),
      };
    } catch (error) {
      console.error('获取搜索源失败:', error);
      throw new Error('获取搜索源失败', { cause: error });
    }
  }

  async createSearchSource(
    env: Env,
    sourceData: CreateSearchSourceData,
    creatorId: string
  ): Promise<SearchSource> {
    try {
      const category = await env.DB.prepare(
        `SELECT id FROM search_source_categories 
         WHERE id = ? AND is_active = 1`
      )
        .bind(sourceData.categoryId)
        .first();

      if (!category) {
        throw new Error('指定的分类不存在');
      }

      if (sourceData.searchable && !sourceData.urlTemplate.includes('{keyword}')) {
        throw new Error('搜索源的URL模板必须包含{keyword}占位符');
      }

      const existing = await env.DB.prepare(
        `SELECT id FROM search_sources 
         WHERE name = ? AND is_active = 1`
      )
        .bind(sourceData.name)
        .first();

      if (existing) {
        throw new Error('搜索源名称已存在');
      }

      const sourceId = generateId();
      const now = Date.now();

      await env.DB.prepare(
        `INSERT INTO search_sources (
          id, category_id, name, subtitle, description, icon, url_template,
          homepage_url, site_type, searchable, requires_keyword, search_priority,
          is_system, is_active, display_order, usage_count,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          sourceId,
          sourceData.categoryId,
          sourceData.name,
          sourceData.subtitle || '',
          sourceData.description || '',
          sourceData.icon || '📁',
          sourceData.urlTemplate,
          sourceData.homepageUrl || '',
          sourceData.siteType || 'search',
          sourceData.searchable ? 1 : 0,
          sourceData.requiresKeyword ? 1 : 0,
          sourceData.searchPriority || 5,
          0,
          1,
          999,
          0,
          creatorId,
          now,
          now
        )
        .run();

      await this.createUserSourceConfig(env, creatorId, sourceId, { isEnabled: true });

      return this.formatSearchSource({
        id: sourceId,
        category_id: sourceData.categoryId,
        name: sourceData.name,
        subtitle: sourceData.subtitle || '',
        description: sourceData.description || '',
        icon: sourceData.icon || '📁',
        url_template: sourceData.urlTemplate,
        homepage_url: sourceData.homepageUrl || '',
        site_type: sourceData.siteType || 'search',
        searchable: sourceData.searchable ? 1 : 0,
        requires_keyword: sourceData.requiresKeyword ? 1 : 0,
        search_priority: sourceData.searchPriority || 5,
        is_system: 0,
        is_active: 1,
        display_order: 999,
        usage_count: 0,
        created_by: creatorId,
        created_at: now,
        updated_at: now,
        user_enabled: 1,
      });
    } catch (error) {
      console.error('创建搜索源失败:', error);
      throw error;
    }
  }

  async updateSearchSource(
    env: Env,
    sourceId: string,
    updateData: UpdateSearchSourceData,
    userId: string
  ): Promise<{ source: SearchSource }> {
    try {
      const source = (await env.DB.prepare(
        `SELECT * FROM search_sources 
         WHERE id = ? AND is_active = 1`
      )
        .bind(sourceId)
        .first()) as {
        is_system: number;
        created_by: string;
        name: string;
        searchable: number;
      } | null;

      if (!source) {
        throw new Error('搜索源不存在');
      }

      if (source.is_system && source.created_by !== userId) {
        throw new Error('无权限修改系统搜索源');
      }

      if (!source.is_system && source.created_by !== userId) {
        throw new Error('无权限修改此搜索源');
      }

      if (updateData.urlTemplate && updateData.searchable && !updateData.urlTemplate.includes('{keyword}')) {
        throw new Error('搜索源的URL模板必须包含{keyword}占位符');
      }

      if (updateData.name && updateData.name !== source.name) {
        const existing = await env.DB.prepare(
          `SELECT id FROM search_sources 
           WHERE name = ? AND id != ? AND is_active = 1`
        )
          .bind(updateData.name, sourceId)
          .first();

        if (existing) {
          throw new Error('搜索源名称已存在');
        }
      }

      const updateFields: string[] = [];
      const updateValues: (string | number)[] = [];

      Object.keys(updateData).forEach((field) => {
        const dbField = this.convertSourceFieldToDb(field);
        if (dbField) {
          let value = (updateData as Record<string, string | number | boolean>)[field];
          if (typeof value === 'boolean') {
            value = value ? 1 : 0;
          }
          updateFields.push(`${dbField} = ?`);
          updateValues.push(value as string | number);
        }
      });

      updateFields.push('updated_at = ?');
      updateValues.push(Date.now());
      updateValues.push(sourceId);

      await env.DB.prepare(
        `UPDATE search_sources 
         SET ${updateFields.join(', ')}
         WHERE id = ?`
      )
        .bind(...updateValues)
        .run();

      const updatedSource = await env.DB.prepare(
        `SELECT 
          ss.*,
          sc.name as category_name,
          sc.icon as category_icon,
          sc.major_category_id,
          mc.name as major_category_name,
          mc.icon as major_category_icon
        FROM search_sources ss
        LEFT JOIN search_source_categories sc ON ss.category_id = sc.id
        LEFT JOIN search_major_categories mc ON sc.major_category_id = mc.id
        WHERE ss.id = ?`
      )
        .bind(sourceId)
        .first();

      if (!updatedSource) {
        throw new Error('更新后获取搜索源失败');
      }

      return {
        source: this.formatSearchSource(updatedSource),
      };
    } catch (error) {
      console.error('更新搜索源失败:', error);
      throw error;
    }
  }

  async deleteSearchSource(
    env: Env,
    sourceId: string,
    userId: string
  ): Promise<{ message: string; deletedSource: { id: string; name: string } }> {
    try {
      const source = (await env.DB.prepare(
        `SELECT * FROM search_sources 
         WHERE id = ? AND is_active = 1`
      )
        .bind(sourceId)
        .first()) as {
        id: string;
        name: string;
        is_system: number;
        created_by: string;
      } | null;

      if (!source) {
        throw new Error('搜索源不存在');
      }

      if (source.is_system) {
        throw new Error('系统搜索源不能删除');
      }

      if (source.created_by !== userId) {
        throw new Error('无权限删除此搜索源');
      }

      await env.DB.prepare(
        `UPDATE search_sources 
         SET is_active = 0, updated_at = ?
         WHERE id = ?`
      )
        .bind(Date.now(), sourceId)
        .run();

      await env.DB.prepare(
        `DELETE FROM user_source_configs 
         WHERE source_id = ?`
      )
        .bind(sourceId)
        .run();

      return {
        message: '搜索源删除成功',
        deletedSource: {
          id: source.id,
          name: source.name,
        },
      };
    } catch (error) {
      console.error('删除搜索源失败:', error);
      throw error;
    }
  }

  async getUserSourceConfigs(env: Env, userId: string): Promise<{ configs: UserSourceConfig[] }> {
    try {
      const result = await env.DB.prepare(
        `SELECT 
          usc.*,
          ss.name as source_name,
          ss.icon as source_icon,
          ss.is_system,
          sc.name as category_name,
          mc.name as major_category_name
        FROM user_source_configs usc
        LEFT JOIN search_sources ss ON usc.source_id = ss.id
        LEFT JOIN search_source_categories sc ON ss.category_id = sc.id
        LEFT JOIN search_major_categories mc ON sc.major_category_id = mc.id
        WHERE usc.user_id = ? AND ss.is_active = 1
        ORDER BY usc.custom_priority ASC, ss.search_priority ASC, ss.display_order ASC`
      )
        .bind(userId)
        .all();

      return {
        configs: (result.results || []).map((config) => this.formatUserSourceConfig(config)),
      };
    } catch (error) {
      console.error('获取用户搜索源配置失败:', error);
      throw new Error('获取用户搜索源配置失败', { cause: error });
    }
  }

  async updateUserSourceConfig(
    env: Env,
    userId: string,
    configData: UpdateUserSourceConfigData
  ): Promise<{
    message: string;
    config: {
      userId: string;
      sourceId: string;
      isEnabled?: boolean;
      customPriority?: number;
      customName?: string;
      customSubtitle?: string;
      customIcon?: string;
      notes?: string;
    };
  }> {
    try {
      const source = await env.DB.prepare(
        `SELECT id FROM search_sources 
         WHERE id = ? AND is_active = 1`
      )
        .bind(configData.sourceId)
        .first();

      if (!source) {
        throw new Error('搜索源不存在');
      }

      const configId = generateId();
      const now = Date.now();

      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_source_configs (
          id, user_id, source_id, is_enabled, custom_priority,
          custom_name, custom_subtitle, custom_icon, notes,
          created_at, updated_at
        ) VALUES (
          COALESCE((SELECT id FROM user_source_configs WHERE user_id = ? AND source_id = ?), ?),
          ?, ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT created_at FROM user_source_configs WHERE user_id = ? AND source_id = ?), ?),
          ?
        )`
      )
        .bind(
          userId,
          configData.sourceId,
          configId,
          userId,
          configData.sourceId,
          configData.isEnabled ? 1 : 0,
          configData.customPriority || null,
          configData.customName || null,
          configData.customSubtitle || null,
          configData.customIcon || null,
          configData.notes || null,
          userId,
          configData.sourceId,
          now,
          now
        )
        .run();

      return {
        message: '用户搜索源配置更新成功',
        config: {
          userId,
          sourceId: configData.sourceId,
          isEnabled: configData.isEnabled,
          customPriority: configData.customPriority,
          customName: configData.customName,
          customSubtitle: configData.customSubtitle,
          customIcon: configData.customIcon,
          notes: configData.notes,
        },
      };
    } catch (error) {
      console.error('更新用户搜索源配置失败:', error);
      throw error;
    }
  }

  private async createUserSourceConfig(
    env: Env,
    userId: string,
    sourceId: string,
    configData: { isEnabled?: boolean; customPriority?: number }
  ): Promise<void> {
    const configId = generateId();
    const now = Date.now();

    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_source_configs (
        id, user_id, source_id, is_enabled, custom_priority,
        custom_name, custom_subtitle, custom_icon, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        configId,
        userId,
        sourceId,
        configData.isEnabled ? 1 : 0,
        configData.customPriority || null,
        null,
        null,
        null,
        null,
        now,
        now
      )
      .run();
  }

  async batchUpdateUserSourceConfigs(
    env: Env,
    userId: string,
    configs: UpdateUserSourceConfigData[]
  ): Promise<{ message: string; updatedCount: number }> {
    try {
      const sourceIds = configs.map((c) => c.sourceId);
      const validSources = await env.DB.prepare(
        `SELECT id FROM search_sources 
         WHERE id IN (${sourceIds.map(() => '?').join(',')}) AND is_active = 1`
      )
        .bind(...sourceIds)
        .all();

      if (validSources.results.length !== sourceIds.length) {
        throw new Error('部分搜索源不存在');
      }

      const stmt = env.DB.prepare(
        `INSERT OR REPLACE INTO user_source_configs (
          id, user_id, source_id, is_enabled, custom_priority,
          custom_name, custom_subtitle, custom_icon, notes,
          created_at, updated_at
        ) VALUES (
          COALESCE((SELECT id FROM user_source_configs WHERE user_id = ? AND source_id = ?), ?),
          ?, ?, ?, ?, ?, ?, ?, ?,
          COALESCE((SELECT created_at FROM user_source_configs WHERE user_id = ? AND source_id = ?), ?),
          ?
        )`
      );

      const now = Date.now();
      const promises = configs.map((config) => {
        const configId = generateId();
        return stmt
          .bind(
            userId,
            config.sourceId,
            configId,
            userId,
            config.sourceId,
            config.isEnabled ? 1 : 0,
            config.customPriority || null,
            config.customName || null,
            config.customSubtitle || null,
            config.customIcon || null,
            config.notes || null,
            userId,
            config.sourceId,
            now,
            now
          )
          .run();
      });

      await Promise.all(promises);

      return {
        message: '批量更新用户搜索源配置成功',
        updatedCount: configs.length,
      };
    } catch (error) {
      console.error('批量更新用户搜索源配置失败:', error);
      throw error;
    }
  }

  async getSearchSourceStats(
    env: Env,
    userId: string
  ): Promise<{
    overview: {
      majorCategories: number;
      categories: number;
      totalSources: number;
      enabledSources: number;
    };
    majorCategoryStats: Array<{
      id: string;
      name: string;
      icon: string;
      categories_count: number;
      sources_count: number;
      enabled_sources_count: number;
    }>;
  }> {
    try {
      const [majorCategoriesCount, categoriesCount, sourcesCount, userConfigsCount] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as count FROM search_major_categories WHERE is_active = 1`).first(),
        env.DB.prepare(`SELECT COUNT(*) as count FROM search_source_categories WHERE is_active = 1`).first(),
        env.DB.prepare(`SELECT COUNT(*) as count FROM search_sources WHERE is_active = 1`).first(),
        env.DB.prepare(
          `SELECT COUNT(*) as count FROM user_source_configs WHERE user_id = ? AND is_enabled = 1`
        )
          .bind(userId)
          .first(),
      ]);

      const majorCategoryStats = await env.DB.prepare(
        `SELECT 
          mc.id,
          mc.name,
          mc.icon,
          COUNT(DISTINCT sc.id) as categories_count,
          COUNT(DISTINCT ss.id) as sources_count,
          COUNT(DISTINCT CASE WHEN usc.is_enabled = 1 THEN usc.id END) as enabled_sources_count
        FROM search_major_categories mc
        LEFT JOIN search_source_categories sc ON mc.id = sc.major_category_id AND sc.is_active = 1
        LEFT JOIN search_sources ss ON sc.id = ss.category_id AND ss.is_active = 1
        LEFT JOIN user_source_configs usc ON ss.id = usc.source_id AND usc.user_id = ?
        WHERE mc.is_active = 1
        GROUP BY mc.id
        ORDER BY mc.display_order ASC`
      )
        .bind(userId)
        .all();

      return {
        overview: {
          majorCategories: (majorCategoriesCount as { count: number }).count,
          categories: (categoriesCount as { count: number }).count,
          totalSources: (sourcesCount as { count: number }).count,
          enabledSources: (userConfigsCount as { count: number }).count,
        },
        majorCategoryStats: (majorCategoryStats.results || []) as Array<{
          id: string;
          name: string;
          icon: string;
          categories_count: number;
          sources_count: number;
          enabled_sources_count: number;
        }>,
      };
    } catch (error) {
      console.error('获取搜索源统计信息失败:', error);
      throw new Error('获取搜索源统计信息失败', { cause: error });
    }
  }

  async exportUserSearchSources(
    env: Env,
    userId: string
  ): Promise<{
    exportTime: string;
    userId: string;
    majorCategories: MajorCategory[];
    categories: SourceCategory[];
    sources: SearchSource[];
    userConfigs: UserSourceConfig[];
    version: string;
  }> {
    try {
      const sources = await this.getUserSearchSources(env, userId, { includeSystem: true });
      const configs = await this.getUserSourceConfigs(env, userId);
      const categories = await this.getUserSourceCategories(env, userId, { includeSystem: true });
      const majorCategories = await this.getAllMajorCategories(env);

      return {
        exportTime: new Date().toISOString(),
        userId,
        majorCategories: majorCategories.majorCategories,
        categories: categories.categories,
        sources: sources.sources,
        userConfigs: configs.configs,
        version: '2.3.1',
      };
    } catch (error) {
      console.error('导出用户搜索源配置失败:', error);
      throw new Error('导出用户搜索源配置失败', { cause: error });
    }
  }

  private formatMajorCategory(data: Record<string, unknown>): MajorCategory {
    return {
      id: data.id as string,
      name: data.name as string,
      description: (data.description as string) || '',
      icon: (data.icon as string) || '🌟',
      color: (data.color as string) || '#6b7280',
      requiresKeyword: Boolean(data.requires_keyword),
      displayOrder: (data.display_order as number) || 999,
      isSystem: Boolean(data.is_system),
      isActive: Boolean(data.is_active),
      createdAt: data.created_at as number,
      updatedAt: data.updated_at as number,
    };
  }

  private formatSourceCategory(data: Record<string, unknown>): SourceCategory {
    return {
      id: data.id as string,
      majorCategoryId: data.major_category_id as string,
      majorCategoryName: (data.major_category_name as string) || '',
      majorCategoryIcon: (data.major_category_icon as string) || '🌟',
      name: data.name as string,
      description: (data.description as string) || '',
      icon: (data.icon as string) || '📁',
      color: (data.color as string) || '#3b82f6',
      displayOrder: (data.display_order as number) || 999,
      isSystem: Boolean(data.is_system),
      isActive: Boolean(data.is_active),
      defaultSearchable: Boolean(data.default_searchable),
      defaultSiteType: (data.default_site_type as string) || 'search',
      searchPriority: (data.search_priority as number) || 5,
      createdBy: (data.created_by as string) || null,
      createdAt: data.created_at as number,
      updatedAt: data.updated_at as number,
    };
  }

  private formatSearchSource(data: Record<string, unknown>): SearchSource {
    return {
      id: data.id as string,
      categoryId: data.category_id as string,
      categoryName: (data.category_name as string) || '',
      categoryIcon: (data.category_icon as string) || '📁',
      majorCategoryId: data.major_category_id as string,
      majorCategoryName: (data.major_category_name as string) || '',
      majorCategoryIcon: (data.major_category_icon as string) || '🌟',
      name: (data.custom_name as string) || (data.name as string),
      originalName: data.name as string,
      subtitle: (data.custom_subtitle as string) || (data.subtitle as string) || '',
      originalSubtitle: (data.subtitle as string) || '',
      description: (data.description as string) || '',
      icon: (data.custom_icon as string) || (data.icon as string) || '📁',
      originalIcon: (data.icon as string) || '📁',
      urlTemplate: data.url_template as string,
      homepageUrl: (data.homepage_url as string) || '',
      siteType: (data.site_type as string) || 'search',
      searchable: Boolean(data.searchable),
      requiresKeyword: Boolean(data.requires_keyword),
      searchPriority: (data.custom_priority as number) || (data.search_priority as number) || 5,
      originalPriority: (data.search_priority as number) || 5,
      isSystem: Boolean(data.is_system),
      isActive: Boolean(data.is_active),
      displayOrder: (data.display_order as number) || 999,
      usageCount: (data.usage_count as number) || 0,
      lastUsedAt: (data.last_used_at as number) || null,
      userEnabled:
        data.user_enabled !== null && data.user_enabled !== undefined
          ? Boolean(data.user_enabled)
          : Boolean(data.is_system && data.searchable),
      userNotes: (data.user_notes as string) || '',
      createdBy: (data.created_by as string) || null,
      createdAt: data.created_at as number,
      updatedAt: data.updated_at as number,
    };
  }

  private formatUserSourceConfig(data: Record<string, unknown>): UserSourceConfig {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      sourceId: data.source_id as string,
      sourceName: data.source_name as string,
      sourceIcon: data.source_icon as string,
      isSystem: Boolean(data.is_system),
      categoryName: data.category_name as string,
      majorCategoryName: data.major_category_name as string,
      isEnabled: Boolean(data.is_enabled),
      customPriority: (data.custom_priority as number) || null,
      customName: (data.custom_name as string) || null,
      customSubtitle: (data.custom_subtitle as string) || null,
      customIcon: (data.custom_icon as string) || null,
      notes: (data.notes as string) || '',
      createdAt: data.created_at as number,
      updatedAt: data.updated_at as number,
    };
  }

  private convertCategoryFieldToDb(field: string): string | null {
    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      icon: 'icon',
      color: 'color',
      defaultSearchable: 'default_searchable',
      defaultSiteType: 'default_site_type',
      searchPriority: 'search_priority',
    };
    return fieldMap[field] || null;
  }

  private convertSourceFieldToDb(field: string): string | null {
    const fieldMap: Record<string, string> = {
      categoryId: 'category_id',
      name: 'name',
      subtitle: 'subtitle',
      description: 'description',
      icon: 'icon',
      urlTemplate: 'url_template',
      homepageUrl: 'homepage_url',
      siteType: 'site_type',
      searchable: 'searchable',
      requiresKeyword: 'requires_keyword',
      searchPriority: 'search_priority',
    };
    return fieldMap[field] || null;
  }

  parseJsonSafely<T>(jsonString: string | null, defaultValue: T): T {
    try {
      return jsonString ? JSON.parse(jsonString) : defaultValue;
    } catch {
      console.warn('JSON解析失败:', jsonString);
      return defaultValue;
    }
  }
}

export const searchSourcesService = new SearchSourcesService();
export default searchSourcesService;
