use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::storage::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedSession {
    pub id: String,
    pub name: String,
    pub session_type: String, // "local" | "ssh"
    pub config: String,       // JSON-serialised SessionConfig
    pub group_id: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Returns all saved sessions ordered by sort_order ascending.
pub fn list_sessions(db: &Database) -> Result<Vec<SavedSession>, AppError> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, session_type, config, group_id, sort_order, created_at, updated_at
             FROM saved_sessions
             ORDER BY sort_order ASC, created_at ASC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SavedSession {
                id: row.get(0)?,
                name: row.get(1)?,
                session_type: row.get(2)?,
                config: row.get(3)?,
                group_id: row.get(4)?,
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| AppError::Database(e.to_string()))
}

/// Returns a single saved session by id, or None if it doesn't exist.
pub fn get_session(db: &Database, id: &str) -> Result<Option<SavedSession>, AppError> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, session_type, config, group_id, sort_order, created_at, updated_at
             FROM saved_sessions WHERE id = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut rows = stmt
        .query_map(params![id], |row| {
            Ok(SavedSession {
                id: row.get(0)?,
                name: row.get(1)?,
                session_type: row.get(2)?,
                config: row.get(3)?,
                group_id: row.get(4)?,
                sort_order: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    match rows.next() {
        None => Ok(None),
        Some(row) => Ok(Some(row.map_err(|e| AppError::Database(e.to_string()))?)),
    }
}

/// Inserts or replaces a saved session.
pub fn save_session(db: &Database, session: &SavedSession) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO saved_sessions
         (id, name, session_type, config, group_id, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            session.id,
            session.name,
            session.session_type,
            session.config,
            session.group_id,
            session.sort_order,
            session.created_at,
            session.updated_at,
        ],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Deletes a saved session by id. No error if it doesn't exist.
pub fn delete_session(db: &Database, id: &str) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM saved_sessions WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Updates sort_order for a list of session ids in the given order.
pub fn reorder_sessions(db: &Database, ids: &[String]) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE saved_sessions SET sort_order = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::Database;

    fn in_memory_db() -> Database {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        db
    }

    fn make_session(id: &str, name: &str) -> SavedSession {
        SavedSession {
            id: id.to_string(),
            name: name.to_string(),
            session_type: "local".to_string(),
            config: r#"{"type":"local","shell":"/bin/zsh"}"#.to_string(),
            group_id: None,
            sort_order: 0,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn save_and_list() {
        let db = in_memory_db();
        save_session(&db, &make_session("a", "Alpha")).unwrap();
        save_session(&db, &make_session("b", "Beta")).unwrap();
        let sessions = list_sessions(&db).unwrap();
        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().any(|s| s.id == "a"));
        assert!(sessions.iter().any(|s| s.id == "b"));
    }

    #[test]
    fn get_existing_and_missing() {
        let db = in_memory_db();
        save_session(&db, &make_session("x", "X")).unwrap();
        assert!(get_session(&db, "x").unwrap().is_some());
        assert!(get_session(&db, "missing").unwrap().is_none());
    }

    #[test]
    fn delete_nonexistent_does_not_error() {
        let db = in_memory_db();
        delete_session(&db, "ghost").unwrap(); // must not panic
    }

    #[test]
    fn reorder_updates_sort_order() {
        let db = in_memory_db();
        save_session(&db, &make_session("1", "One")).unwrap();
        save_session(&db, &make_session("2", "Two")).unwrap();
        reorder_sessions(&db, &["2".to_string(), "1".to_string()]).unwrap();
        let sessions = list_sessions(&db).unwrap();
        assert_eq!(sessions[0].id, "2");
        assert_eq!(sessions[1].id, "1");
    }
}
