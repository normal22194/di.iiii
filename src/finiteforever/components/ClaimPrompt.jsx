import { useEffect, useState } from 'react'
import { formatRemainingDrift, getRemainingDriftMs } from '../permanence.js'
import AxisMoveControls from './AxisMoveControls.jsx'
import DraggablePanel from './DraggablePanel.jsx'

export default function ClaimPrompt({ entity, pool, onConfirm, onDismiss, onRecolor, onDuplicate, onDelete, onNudge, onAxisDragChange, busy }) {
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

    return (
        <DraggablePanel className="ff-claim-prompt" title="Edit mark" onClickOutside={onDismiss} role="dialog" aria-modal="true">
            {isPermanent ? (
                <>
                    <p className="ff-claim-prompt__question">Kept forever</p>
                    <p className="ff-claim-prompt__detail">
                        {permanence.claimedBy
                            ? `${permanence.claimedBy} chose to keep this. It won't drift.`
                            : "Someone chose to keep this. It won't drift."}
                    </p>
                </>
            ) : (
                <>
                    <p className="ff-claim-prompt__question">What&rsquo;s one thing you want to stay here?</p>
                    {status === 'drifting' && (
                        <p className="ff-claim-prompt__countdown" aria-live="polite">
                            ⏳ {formatRemainingDrift(remainingDriftMs)} until this fades to residue
                        </p>
                    )}
                    <p className="ff-claim-prompt__detail">
                        {willTake
                            ? 'Permanence has run out. Keeping this forever means taking it from whoever has held it longest.'
                            : `${remaining} of ${pool.total} permanence remains.`}
                        {status === 'residue' ? ' This has already drifted into residue — it can still be claimed.' : ''}
                    </p>
                </>
            )}

            <div className="ff-claim-prompt__edit">
                <label className="ff-claim-prompt__color-label">
                    <span>Color</span>
                    <input
                        type="color"
                        value={entity.components.appearance?.color || '#9fd8ff'}
                        disabled={busy}
                        onChange={(e) => onRecolor(e.target.value)}
                    />
                </label>
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={onDuplicate}>
                    Duplicate
                </button>
                <button type="button" className="ff-button ff-button--ghost ff-button--danger" disabled={busy} onClick={onDelete}>
                    ✕ Delete
                </button>
            </div>

            <AxisMoveControls
                position={entity.components.transform?.position || [0, 0, 0]}
                onNudge={onNudge}
                onDragChange={onAxisDragChange}
                busy={busy}
            />

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
        </DraggablePanel>
    )
}
