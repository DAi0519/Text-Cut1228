## Context
The user is refining the "Edit" panel of a card generator app. The goal is to make the interface more "concise and powerful" for a creative editing task.

## First Impressions
The previous layout was cluttered with redundant headers (LAYOUT, TEXT, IMAGE, EXPORT) that doubled the vertical noise without adding meaning. The "Export -> Save" button inside the panel was confusingly distinct from the global "Download All" button. The Image Tuning controls felt disconnected and sprawled out.

## Visual Design
**Issue: Redundant Labelling** — Every button group had a small caps label above it. This created a "form-like" feeling rather than a "tool-like" feeling.
**Impact:** Visual noise, reduced vertical efficiency.
**Fix:** Removed all category labels. Buttons now speak for themselves via icons and text.

**Issue: Button Sprawl** — The 4-column grid forced "Save" to be a primary action equal to "Edit", even though it's an output action.
**Impact:** Confused the mental model (Edit vs Export).
**Fix:** Moved the individual "Download Current" action to the Top Bar, grouped with "Download All". Now the Edit panel contains *only* editing tools.

## Interface Design
**Issue: Missing Opportunity for Clarity** — "Download" vs "Download All" was ambiguous.
**Fix:** Grouped them in the top right: [Current] | [All]. This makes the scope clear.

**Issue: Image Tuning Layout** — The previous layout used a 4-column grid for Position/Zoom/Size/Remove, which felt mechanical.
**Fix:** Created a compact row. Position button on the left (distinct shape), vertical divider, then Sliders (paired), then a small icon-only Remove button. This visual grouping reflects the semantic relationship (Tuning vs Destructive).

## Top Opportunities Executed
1.  **Consolidated Downloads**: Moved individual card download to the top bar to clear the editing stage.
2.  **Removed Label Noise**: Deleted category headers for a cleaner, tool-centric look.
3.  **Unified Image Controls**: Grouped image position, sizing, and removal into a single cohesive row that only appears when needed.
