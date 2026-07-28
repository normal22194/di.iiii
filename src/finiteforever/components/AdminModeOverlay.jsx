// A persistent HUD strip shown while admin mode is active — not a floating
// window: no drag, no resize, no per-window close button. You toggle the
// whole mode on/off with Ctrl+Shift+A (or exit with Escape), the same way
// Studio's own Navigate/Edit mode works — this is a mode, not a panel you
// manage separately from it.
export default function AdminModeOverlay({ selectedEntities = [] }) {
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
                    <p className="ff-admin-mode__note">Backspace deletes all of these at once.</p>
                </>
            )}
        </div>
    )
}
