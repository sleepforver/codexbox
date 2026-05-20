import type { Database } from 'sql.js'

export const currentSchemaVersion = 12

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
      task_id TEXT,
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
      task_id TEXT,
      source_type TEXT,
      source_ref TEXT,
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
      project_type TEXT NOT NULL DEFAULT '',
      tech_stack TEXT NOT NULL DEFAULT '',
      install_command TEXT NOT NULL DEFAULT '',
      dev_command TEXT NOT NULL DEFAULT '',
      test_command TEXT NOT NULL DEFAULT '',
      build_command TEXT NOT NULL DEFAULT '',
      important_paths TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      task_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_knowledge (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_task_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      responsibilities TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_workflow_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      task_id TEXT,
      title TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      steps TEXT NOT NULL,
      output TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ai_history_task_created ON ai_history (task_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_prompt_templates_task ON ai_prompt_templates (task_type, is_builtin DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspace_projects_updated ON workspace_projects (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project_status ON project_tasks (project_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project_updated ON project_tasks (project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON project_knowledge (project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_task_files_task ON project_task_files (task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_agents_project ON project_agents (project_id, role, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_project ON agent_workflow_runs (project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_task ON agent_workflow_runs (task_id, updated_at DESC);
  `)
}
