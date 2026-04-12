use rusqlite::params;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::storage::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionGroup {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
}

pub fn list_groups(db: &Database) -> Result<Vec<SessionGroup>, AppError> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, sort_order FROM session_groups ORDER BY sort_order ASC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SessionGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| AppError::Database(e.to_string()))
}

pub fn create_group(
    db: &Database,
    id: &str,
    name: &str,
    color: Option<&str>,
) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    let sort_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM session_groups",
            [],
            |r| r.get(0),
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO session_groups (id, name, color, sort_order) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, color, sort_order],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

/// Deletes a group and sets group_id = NULL on all sessions that belonged to it.
pub fn delete_group(db: &Database, id: &str) -> Result<(), AppError> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE saved_sessions SET group_id = NULL WHERE group_id = ?1",
        params![id],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;
    conn.execute("DELETE FROM session_groups WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;
    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::Database;
    use crate::storage::session_repo::{save_session, SavedSession};

    fn in_memory_db() -> Database {
        Database::open(std::path::Path::new(":memory:")).unwrap()
    }

    #[test]
    fn create_and_list_groups() {
        let db = in_memory_db();
        create_group(&db, "g1", "Web", Some("#3b82f6")).unwrap();
        create_group(&db, "g2", "Infra", None).unwrap();
        let groups = list_groups(&db).unwrap();
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn delete_group_nullifies_sessions() {
        let db = in_memory_db();
        create_group(&db, "g1", "Web", None).unwrap();
        // Insert a session belonging to g1
        save_session(
            &db,
            &SavedSession {
                id: "s1".to_string(),
                name: "Server".to_string(),
                session_type: "local".to_string(),
                config: "{}".to_string(),
                group_id: Some("g1".to_string()),
                sort_order: 0,
                created_at: "2026-04-12T00:00:00Z".to_string(),
                updated_at: "2026-04-12T00:00:00Z".to_string(),
            },
        )
        .unwrap();

        delete_group(&db, "g1").unwrap();

        let conn = db.conn.lock().unwrap();
        let group_id: Option<String> = conn
            .query_row(
                "SELECT group_id FROM saved_sessions WHERE id = 's1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(group_id.is_none());
    }
}
