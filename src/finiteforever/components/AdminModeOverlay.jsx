// A persistent HUD strip shown while admin mode is active — not a floating
// window: no drag, no resize, no per-window close button. You toggle the
// whole mode on/off with Ctrl+Shift+A (or exit with Escape), the same way
// Studio's own Navigate/Edit mode works — this is a mode, not a panel you
// manage separately from it.
export default function AdminModeOverlay({ selectedEntities = [], onMakePermanent, onLeave, busy = false }) {
    return (
        <div className="ff-admin-mode">
            <span className="ff-admin-mode__badge">Admin mode</span>
            <p className="ff-admin-mode__hint">Right-click and drag to box-select marks.</p>

            {selectedEntities.length === 0 ? (
                <p className="ff-admin-mode__note">Nothing selected.</p>
            ) : (
                <>
                    <p className="ff-admin-mode__count">{selectedEntities.length} selected</p>
                    <ul className="ff-admin-mode__list">
                        {selectedEntities.map((entity) => (
                            <li key={entity.id}>{entity.name || entity.id}</li>
                        ))}
                    </ul>
                    {/* Admin override, not the normal ritual claim: no pool cap, no
                        choosing what to release, and nothing here drifts once
                        permanent — see claimMarksForever in permanence.js. This
                        one *does* count against the shared "kept forever" pool. */}
                    <button
                        type="button"
                        className="ff-button ff-button--ghost ff-admin-mode__make-permanent"
                        disabled={busy}
                        onClick={onMakePermanent}
                    >
                        Make all permanent
                    </button>
                    {/* The honest "uncapped" option — also never drifts, but
                        deliberately does NOT touch the shared pool at all (see
                        leaveMarksForever), so it doesn't inflate "kept forever"
                        with marks nobody in the pool actually chose to keep. */}
                    <button
                        type="button"
                        className="ff-button ff-button--ghost ff-admin-mode__leave"
                        disabled={busy}
                        onClick={onLeave}
                    >
                        Leave
                    </button>
                    <p className="ff-admin-mode__note">Backspace deletes all of these at once.</p>
                </>
            )}
        </div>
    )
}
