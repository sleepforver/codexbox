import type { Database } from 'sql.js'

export const currentSchemaVersion = 7

export function initializeSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_env_vars (
      project_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, key)
    );

    CREATE TABLE IF NOT EXISTS api_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      at TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_saved_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT NOT NULL,
      body TEXT NOT NULL,
      project_id TEXT,
      group_name TEXT,
      source_type TEXT,
      source_path TEXT,
      confidence INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_history (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      output TEXT NOT NULL,
      model TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      project_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_prompt_templates (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      variables TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      description TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT
    );

    CREATE TABLE IF NOT EXISTS geo_analysis_history (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      required_properties TEXT NOT NULL,
      result TEXT NOT NULL,
      feature_count INTEGER NOT NULL,
      issue_count INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_history_task_created ON ai_history (task_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_task ON ai_prompt_templates (task_type, is_builtin DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_projects_updated ON workspace_projects (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geo_analysis_project_created ON geo_analysis_history (project_id, created_at DESC);
  `)
}
