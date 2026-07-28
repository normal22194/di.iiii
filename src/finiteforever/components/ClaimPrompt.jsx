import { useEffect, useState } from 'react'
import { formatRemainingDrift, getRemainingDriftMs } from '../permanence.js'
import AxisMoveControls from './AxisMoveControls.jsx'
import ScaleControls from './ScaleControls.jsx'
import RotationControls from './RotationControls.jsx'
import OpacityControl from './OpacityControl.jsx'
import TextControl from './TextControl.jsx'
import CollapsibleSection from './CollapsibleSection.jsx'
import DraggablePanel from './DraggablePanel.jsx'
import EditableName from './EditableName.jsx'
import { MEDIA_MARK_TYPES } from '../permanence.js'

export default function ClaimPrompt({
    entity, pool, onConfirm, onDismiss, onRecolor, onDuplicate, onDelete, onRename,
    onNudge, onAxisDragChange, onScaleNudge, onScaleDragChange,
    onRotationNudge, onRotationDragChange, onOpacityChange, onTextChange,
    onOpenAdvanced, isAdmin, busy
}) {
    // Ticks once a second while this menu is open so the countdown for
    // *this* object reads live, not just a snapshot from when it was opened.
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!entity) return undefined
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [entity])

    if (!entity) return null
    const permanence = entity.components?.permanence || {}
    const status = permanence.status || 'drifting'
    const isPermanent = status === 'permanent'
    const remaining = Math.max(0, pool.total - pool.claimed)
    const willTake = remaining <= 0
    const remainingDriftMs = getRemainingDriftMs(permanence, now)
    const isMedia = MEDIA_MARK_TYPES.includes(entity.type)
    // Client-side masking, not server-enforced: unlike the ritual log (masked
    // server-side in finiteForeverRoutes.js's GET handler, so it can't be
    // bypassed by reading the response), the project document itself is
    // fetched identically for every viewer — there's no per-viewer document
    // masking. A visitor opening devtools could still see the real
    // claimedBy in the raw response. Good enough for what this UI displays;
    // not a guarantee against someone deliberately digging for it.
    const showClaimedByRealName = isAdmin || permanence.claimedByVisible !== false
    const claimedByLabel = showClaimedByRealName ? permanence.claimedBy : 'Someone'
    // Same masking convention, for whoever placed this mark (not necessarily
    // the same person who claimed it).
    const showPlacedByRealName = isAdmin || permanence.placedByVisible !== false
    const placedByLabel = showPlacedByRealName ? (permanence.placedBy || 'someone') : 'an anonymous visitor'

    return (
        <DraggablePanel className="ff-claim-prompt" title="Edit mark" onClickOutside={onDismiss} onClose={onDismiss} role="dialog" aria-modal="true">
            <div className="ff-claim-prompt__meta">
                <EditableName value={entity.name} onChange={onRename} disabled={busy} />
                <span className="ff-claim-prompt__placed-by">placed by {placedByLabel}</span>
            </div>

            {isPermanent ? (
                <>
                    <p className="ff-claim-prompt__question">Kept forever</p>
                    <p className="ff-claim-prompt__detail">
                        {claimedByLabel
                            ? `${claimedByLabel} chose to keep this. It won't drift.`
                            : "Someone chose to keep this. It won't drift."}
                    </p>
                </>
            ) : (
                <>
                    <p className="ff-claim-prompt__question">What&rsquo;s one thing you want to stay here?</p>
                    {status === 'drifting' && (
                        <p className="ff-claim-prompt__countdown" aria-live="polite">
                            ⏳ {formatRemainingDrift(remainingDriftMs)} until this fades away for good
                        </p>
                    )}
                    <p className="ff-claim-prompt__detail">
                        {willTake
                            ? 'Permanence has run out. Keeping this forever means taking it from whoever has held it longest.'
                            : `${remaining} of ${pool.total} permanence remains.`}
                    </p>
                </>
            )}

            <div className="ff-claim-prompt__edit">
                {!isMedia && (
                    <label className="ff-claim-prompt__color-label">
                        <span>Color</span>
                        <input
                            type="color"
                            value={entity.components.appearance?.color || '#9fd8ff'}
                            disabled={busy}
                            onChange={(e) => onRecolor(e.target.value)}
                        />
                    </label>
                )}
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onDuplicate}>
                    Duplicate
                </button>
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onOpenAdvanced}>
                    Advanced…
                </button>
            </div>

            {entity.type === 'text' && (
                <TextControl
                    value={entity.components.text?.value || ''}
                    onChange={onTextChange}
                />
            )}

            <OpacityControl
                opacity={typeof entity.components.appearance?.opacity === 'number' ? entity.components.appearance.opacity : 1}
                onChange={onOpacityChange}
                busy={busy}
            />

            <CollapsibleSection title="Move">
                <AxisMoveControls
                    position={entity.components.transform?.position || [0, 0, 0]}
                    onNudge={onNudge}
                    onDragChange={onAxisDragChange}
                    busy={busy}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Scale">
                <ScaleControls
                    scale={entity.components.transform?.scale || [1, 1, 1]}
                    onNudge={onScaleNudge}
                    onDragChange={onScaleDragChange}
                    busy={busy}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Rotate">
                <RotationControls
                    rotation={entity.components.transform?.rotation || [0, 0, 0]}
                    onNudge={onRotationNudge}
                    onDragChange={onRotationDragChange}
                    busy={busy}
                />
            </CollapsibleSection>

            <div className="ff-claim-prompt__actions">
                {!isPermanent && (
                    <button type="button" className="ff-button ff-button--primary" disabled={busy} onClick={onConfirm}>
                        {willTake ? 'Take it, keep this forever' : 'Keep this forever'}
                    </button>
                )}
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onDismiss}>
                    {isPermanent ? 'Close' : 'Let it drift'}
                </button>
            </div>

            <button
                type="button"
                className="ff-button ff-button--ghost ff-button--danger ff-claim-prompt__delete"
                disabled={busy}
                onClick={onDelete}
            >
                ✕ Delete this mark
            </button>
        </DraggablePanel>
    )
}
