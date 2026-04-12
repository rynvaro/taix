use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::error::AppError;

/// Ordered list of SQL migration statements.
/// Each entry is executed exactly once, identified by its 1-based index.
static MIGRATIONS: &[&str] = &[
    // Migration 1 — saved_sessions table
    "CREATE TABLE IF NOT EXISTS saved_sessions (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        session_type TEXT NOT NULL,
        config       TEXT NOT NULL,
        group_id     TEXT,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
    )",
    // Migration 2 — session_groups table
    "CREATE TABLE IF NOT EXISTS session_groups (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        color      TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
    )",
];

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    /// Opens (or creates) the SQLite database at `path` and runs pending migrations.
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path).map_err(|e| AppError::Database(e.to_string()))?;

        // Performance pragmas
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), AppError> {
        let conn = self.conn.lock().unwrap();

        // Ensure the migrations tracking table exists
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version    INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

        // Find the highest already-applied version
        let applied: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        // Apply any pending migrations in order
        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let version = (i + 1) as i64;
            if version > applied {
                conn.execute_batch(sql)
                    .map_err(|e| AppError::Database(e.to_string()))?;
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now'))",
                    rusqlite::params![version],
                )
                .map_err(|e| AppError::Database(e.to_string()))?;
            }
        }

        Ok(())
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.db");

        // First open: migrations run
        let db = Database::open(&path).expect("first open");
        {
            let conn = db.conn.lock().unwrap();
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM schema_migrations",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, MIGRATIONS.len() as i64);
        }

        // Second open: migrations must not run again (still same count)
        let db2 = Database::open(&path).expect("second open");
        {
            let conn = db2.conn.lock().unwrap();
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM schema_migrations",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, MIGRATIONS.len() as i64);
        }
    }
}
