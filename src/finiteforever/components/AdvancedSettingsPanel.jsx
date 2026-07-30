import DraggablePanel from './DraggablePanel.jsx'
import EditableName from './EditableName.jsx'
import PagesPanel from './PagesPanel.jsx'
import ShapeControls from './ShapeControls.jsx'
import ShapeTexturePanel from './ShapeTexturePanel.jsx'
import { isMarkOwner, TEXTURABLE_SHAPE_TYPES } from '../permanence.js'

// A separate floating window from the main edit menu, opened via its own
// "Advanced" button rather than folded in as a collapsible section — a
// growing home for settings that don't belong in the everyday edit flow.
export default function AdvancedSettingsPanel({
    entity,
    isAdmin,
    actorLabel,
    onClose,
    onRename,
    busy,
    onSavePage,
    onClearPage,
    onGeometryNudge,
    onGeometryDragChange,
    onTextSizeNudge,
    onTextSizeDragChange,
    onTextStyleChange,
    onSaveShapeTexture,
    onClearShapeTexture
}) {
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
            <ShapeControls
                entity={entity}
                isOwner={isOwner}
                busy={busy}
                onGeometryNudge={onGeometryNudge}
                onGeometryDragChange={onGeometryDragChange}
                onTextSizeNudge={onTextSizeNudge}
                onTextSizeDragChange={onTextSizeDragChange}
                onTextStyleChange={onTextStyleChange}
            />
            {TEXTURABLE_SHAPE_TYPES.includes(entity.type) && (
                // No outer key needed here (unlike PagesPanel below) — this
                // panel already keys its own internal DrawingCanvas by
                // entity.id directly, so switching marks remounts it without
                // help from the parent.
                <ShapeTexturePanel
                    entity={entity}
                    isOwner={isOwner}
                    busy={busy}
                    onSaveTexture={onSaveShapeTexture}
                    onClearTexture={onClearShapeTexture}
                />
            )}
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
