import DraggablePanel from './DraggablePanel.jsx'
import EditableName from './EditableName.jsx'
import PagesPanel from './PagesPanel.jsx'
import { isMarkOwner } from '../permanence.js'

// A separate floating window from the main edit menu, opened via its own
// "Advanced" button rather than folded in as a collapsible section — a
// growing home for settings that don't belong in the everyday edit flow.
export default function AdvancedSettingsPanel({ entity, isAdmin, actorLabel, onClose, onRename, busy, onSavePage, onClearPage }) {
    if (!entity) return null

    // Same masking convention as ClaimPrompt.jsx's claimedByLabel/placedByLabel.
    const permanence = entity.components?.permanence || {}
    const showPlacedByRealName = isAdmin || permanence.placedByVisible !== false
    const placedByLabel = showPlacedByRealName ? (permanence.placedBy || 'someone') : 'an anonymous visitor'
    const isOwner = isMarkOwner({ permanence, actorLabel, isAdmin })

    return (
        <DraggablePanel className="ff-advanced" title="Advanced" onClickOutside={onClose} onClose={onClose} role="dialog" aria-modal="true">
            <div className="ff-advanced__row">
                <span className="ff-advanced__label">Name</span>
                <EditableName value={entity.name} onChange={onRename} disabled={busy || !isOwner} />
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
