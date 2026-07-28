import DraggablePanel from './DraggablePanel.jsx'
import EditableName from './EditableName.jsx'
import PagesPanel from './PagesPanel.jsx'

// A separate floating window from the main edit menu, opened via its own
// "Advanced" button rather than folded in as a collapsible section — a
// growing home for settings that don't belong in the everyday edit flow.
export default function AdvancedSettingsPanel({ entity, isAdmin, actorLabel, onClose, onRename, busy, onSavePage, onClearPage }) {
    if (!entity) return null

    // Same masking convention as ClaimPrompt.jsx's claimedByLabel/placedByLabel.
    const permanence = entity.components?.permanence || {}
    const showPlacedByRealName = isAdmin || permanence.placedByVisible !== false
    const placedByLabel = showPlacedByRealName ? (permanence.placedBy || 'someone') : 'an anonymous visitor'
    // Who may draw/upload/switch pages — a soft, client-side check (this
    // app's identity system is a self-declared display name remembered per
    // device, not an authenticated account, so it's not spoof-proof; good
    // enough for this project's trust model, same as the rest of Finite
    // Forever's identity-based UI).
    const isOwner = isAdmin || (
        Boolean(actorLabel) && Boolean(permanence.placedBy) &&
        actorLabel.trim().toLowerCase() === permanence.placedBy.trim().toLowerCase()
    )

    return (
        <DraggablePanel className="ff-advanced" title="Advanced" onClickOutside={onClose} onClose={onClose} role="dialog" aria-modal="true">
            <div className="ff-advanced__row">
                <span className="ff-advanced__label">Name</span>
                <EditableName value={entity.name} onChange={onRename} disabled={busy} />
            </div>
            <div className="ff-advanced__row">
                <span className="ff-advanced__label">Placed by</span>
                <span>{placedByLabel}</span>
            </div>
            <PagesPanel
                key={entity.id}
                entity={entity}
                isOwner={isOwner}
                busy={busy}
                onSavePage={onSavePage}
                onClearPage={onClearPage}
            />
        </DraggablePanel>
    )
}
