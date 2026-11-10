-- ============================================================================
-- 23_drop_legacy_permissions.sql
--
-- 背景：细粒度 RBAC 从未生效 —— checkPermission 全仓库零调用，
-- 管理端可编辑的 users.permissions / roles.permissions 不影响任何路由，
-- 真正生效的只有 admin / superadmin 角色名判定。
-- 本次已删除：checkPermission、PUT /api/admin/users/:id/permissions、
-- 管理端权限编辑弹窗、roles.permissions 展示与默认权限项。
--
-- ⚠️ 执行前提：后端必须先部署包含上述删除的版本。
--    旧代码仍在 SELECT / INSERT users.permissions，先跑本脚本会让旧版本报错。
--
-- ⚠️ SQLite 没有 DROP COLUMN IF EXISTS：
--    本脚本只执行一次。重复执行会报 "no such column: permissions"，可忽略。
--    本库没有索引、触发器或视图引用这两列，DROP COLUMN 是安全路径。
--
-- 回滚：列可重新加回，但历史权限数据不再保留（从未被读取，无业务价值）：
--    ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]';
--    ALTER TABLE roles ADD COLUMN permissions TEXT DEFAULT '[]';
-- ============================================================================

ALTER TABLE users DROP COLUMN permissions;

ALTER TABLE roles DROP COLUMN permissions;
