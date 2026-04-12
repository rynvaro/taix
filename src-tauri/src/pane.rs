use serde::{Deserialize, Serialize};

/// Direction of a pane split.
#[derive(Serialize, Deserialize, specta::Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SplitDirection {
    Horizontal,
    Vertical,
}

/// Recursive pane layout tree.
#[derive(Serialize, Deserialize, specta::Type, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum PaneLayout {
    Leaf {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Split {
        direction: SplitDirection,
        /// Position of the divider: 0.0 = fully left/top, 1.0 = fully right/bottom.
        ratio: f32,
        first: Box<PaneLayout>,
        second: Box<PaneLayout>,
    },
}
