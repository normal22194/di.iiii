import { useEffect, useState } from 'react'
import { formatRemainingDrift, getRemainingDriftMs, isMarkOwner } from '../permanence.js'
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
    entity, pool, permanentMarks = [], actorLabel, onConfirm, onDismiss, onRecolor, onDuplicate, onDelete, onRename,
    onNudge, onGround, onAxisDragChange, onScaleNudge, onScaleDragChange,
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

    // Choosing which existing permanent mark to release, when the pool is
    // full — the one sanctioned way this panel lets you affect a mark you
    // didn't place (see isMarkOwner below, which locks out every other
    // control here). confirmingRevokeId holds the candidate picked from the
    // list, pending an explicit "are you sure" before onConfirm actually
    // fires — this is someone else's permanence being taken away, not
    // undoable, so it doesn't fire on the first click. Both reset whenever a
    // different mark is opened, or the picker is opened/closed, so a stale
    // choice from last time never carries over or reappears out of order.
    const [choosingRevoke, setChoosingRevoke] = useState(false)
    const [confirmingRevokeId, setConfirmingRevokeId] = useState(null)
    useEffect(() => { setChoosingRevoke(false); setConfirmingRevokeId(null) }, [entity?.id])
    const openRevokeChoice = () => { setConfirmingRevokeId(null); setChoosingRevoke(true) }
    const closeRevokeChoice = () => { setConfirmingRevokeId(null); setChoosingRevoke(false) }

    if (!entity) return null
    const permanence = entity.components?.permanence || {}
    const status = permanence.status || 'drifting'
    const isPermanent = status === 'permanent'
    const remaining = Math.max(0, pool.total - pool.claimed)
    const willTake = remaining <= 0
    const remainingDriftMs = getRemainingDriftMs(permanence, now)
    const isMedia = MEDIA_MARK_TYPES.includes(entity.type)
    // Normal rule: only the mark's placer (or an admin) may edit/move/
    // recolor/rename/delete it — Duplicate is exempt (it copies, never
    // mutates, the original) and claiming/letting-drift stay open to
    // everyone (the curatorial "what should stay" choice isn't ownership-
    // gated, only the destructive edit controls below are).
    const isOwner = isMarkOwner({ permanence, actorLabel, isAdmin })
    const editDisabled = busy || !isOwner
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
                <EditableName value={entity.name} onChange={onRename} disabled={editDisabled} />
                <span className="ff-claim-prompt__placed-by">placed by {placedByLabel}</span>
            </div>
            {!isOwner && (
                <p className="ff-claim-prompt__owner-note">
                    Only {placedByLabel} can edit or delete this mark.
                </p>
            )}

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
                            ? 'Permanence has run out. Keeping this forever means choosing something else to let go of.'
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
                            disabled={editDisabled}
                            onChange={(e) => onRecolor(e.target.value)}
                        />
                    </label>
                )}
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onDuplicate}>
                    Duplicate
                </button>
                <button
                    type="button"
                    className="ff-button ff-button--ghost ff-claim-prompt__ground"
                    disabled={editDisabled}
                    title="Snap to the grid"
                    onClick={onGround}
                >
                    ⤓ Ground
                </button>
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onOpenAdvanced}>
                    Advanced…
                </button>
            </div>

            {entity.type === 'text' && (
                <TextControl
                    value={entity.components.text?.value || ''}
                    onChange={onTextChange}
                    disabled={editDisabled}
                />
            )}

            <OpacityControl
                opacity={typeof entity.components.appearance?.opacity === 'number' ? entity.components.appearance.opacity : 1}
                onChange={onOpacityChange}
                busy={editDisabled}
            />

            <CollapsibleSection title="Move">
                {isOwner && (
                    <p className="ff-claim-prompt__detail">Or click and drag it directly in the scene.</p>
                )}
                <AxisMoveControls
                    position={entity.components.transform?.position || [0, 0, 0]}
                    onNudge={onNudge}
                    onDragChange={onAxisDragChange}
                    busy={editDisabled}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Scale">
                <ScaleControls
                    scale={entity.components.transform?.scale || [1, 1, 1]}
                    onNudge={onScaleNudge}
                    onDragChange={onScaleDragChange}
                    busy={editDisabled}
                />
            </CollapsibleSection>

            <CollapsibleSection title="Rotate">
                <RotationControls
                    rotation={entity.components.transform?.rotation || [0, 0, 0]}
                    onNudge={onRotationNudge}
                    onDragChange={onRotationDragChange}
                    busy={editDisabled}
                />
            </CollapsibleSection>

            {!isPermanent && willTake && choosingRevoke && (() => {
                const confirmingTarget = confirmingRevokeId
                    ? permanentMarks.find((mark) => mark.id === confirmingRevokeId)
                    : null
                if (confirmingTarget) {
                    const markPermanence = confirmingTarget.components?.permanence || {}
                    const showRealName = isAdmin || markPermanence.claimedByVisible !== false
                    const heldByLabel = showRealName ? (markPermanence.claimedBy || 'someone') : 'someone'
                    return (
                        <div className="ff-claim-prompt__revoke-picker" role="group" aria-label="Confirm letting go of a permanent mark">
                            <p className="ff-claim-prompt__question">
                                Let go of {confirmingTarget.name || confirmingTarget.id} (kept by {heldByLabel}) forever?
                            </p>
                            <div className="ff-claim-prompt__confirm-row">
                                <button
                                    type="button"
                                    className="ff-button ff-button--primary"
                                    disabled={busy}
                                    onClick={() => onConfirm(confirmingRevokeId)}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    className="ff-button ff-button--ghost"
                                    disabled={busy}
                                    onClick={() => setConfirmingRevokeId(null)}
                                >
                                    No
                                </button>
                            </div>
                        </div>
                    )
                }
                return (
                    <div className="ff-claim-prompt__revoke-picker" role="group" aria-label="Choose a permanent mark to let go of">
                        <p className="ff-claim-prompt__question">Permanence is full. Choose one to let go of:</p>
                        {permanentMarks.length === 0 ? (
                            <p className="ff-claim-prompt__detail">Nothing is being kept forever yet — there&rsquo;s nothing to let go of.</p>
                        ) : (
                            <ul className="ff-claim-prompt__revoke-list">
                                {permanentMarks.map((mark) => {
                                    const markPermanence = mark.components?.permanence || {}
                                    const showRealName = isAdmin || markPermanence.claimedByVisible !== false
                                    const heldByLabel = showRealName ? (markPermanence.claimedBy || 'someone') : 'someone'
                                    return (
                                        <li key={mark.id}>
                                            <button
                                                type="button"
                                                className="ff-button ff-button--ghost"
                                                disabled={busy}
                                                onClick={() => setConfirmingRevokeId(mark.id)}
                                            >
                                                {mark.name || mark.id} — kept by {heldByLabel}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                        <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={closeRevokeChoice}>
                            Cancel
                        </button>
                    </div>
                )
            })()}

            <div className="ff-claim-prompt__actions">
                {!isPermanent && !choosingRevoke && (
                    <button
                        type="button"
                        className="ff-button ff-button--primary ff-claim-prompt__claim-button"
                        disabled={busy}
                        onClick={() => (willTake ? openRevokeChoice() : onConfirm())}
                    >
                        <span className="ff-claim-prompt__claim-button-main">Keep this forever</span>
                        {willTake && (
                            <span className="ff-claim-prompt__claim-button-sub">
                                permanent slots full (you can delete one permanent thing to free up space)
                            </span>
                        )}
                    </button>
                )}
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onDismiss}>
                    {isPermanent ? 'Close' : 'Let it drift'}
                </button>
            </div>

            <button
                type="button"
                className="ff-button ff-button--ghost ff-button--danger ff-claim-prompt__delete"
                disabled={editDisabled}
                onClick={onDelete}
            >
                ✕ Delete this mark
            </button>
        </DraggablePanel>
    )
}
