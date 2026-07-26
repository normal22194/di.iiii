import { useCallback, useRef, useState } from 'react'

const AXES = [
    { index: 0, label: 'X' },
    { index: 1, label: 'Y' },
    { index: 2, label: 'Z' }
]
const STEP = 0.5
// World units moved per pixel dragged — dragging ~100px moves an object 2
// units, a comfortable scrub speed for objects placed a few meters apart.
const DRAG_SENSITIVITY = 0.02

// Drag left/right on any axis's value to scrub it live (mirrors Blender/
// Studio's numeric drag-to-scrub fields) — this viewer uses pointer-lock for
// the camera, so dragging the object directly in the 3D scene would fight
// that; scrubbing the number here gets the same "grab and move it" feel
// without touching camera controls at all. `onDragChange` fires on every
// pointer move (not just release) so the object moves in the 3D view live,
// as you drag — the parent chains these into the network so a slow
// connection throttles naturally instead of flooding it.
export default function AxisMoveControls({ position, onNudge, onDragChange, busy }) {
    const dragRef = useRef(null)
    const [preview, setPreview] = useState(null) // { axisIndex, value } while dragging — instant number feedback

    const startDrag = useCallback((axisIndex, e) => {
        if (busy || e.button !== 0) return
        const startValue = Number(position[axisIndex]) || 0
        dragRef.current = { axisIndex, startX: e.clientX, startValue }
        setPreview({ axisIndex, value: startValue })
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [busy, position])

    const onDragMove = useCallback((e) => {
        if (!dragRef.current) return
        const { axisIndex, startX, startValue } = dragRef.current
        const value = Math.round((startValue + (e.clientX - startX) * DRAG_SENSITIVITY) * 100) / 100
        setPreview({ axisIndex, value })
        onDragChange(axisIndex, value)
    }, [onDragChange])

    const endDrag = useCallback((e) => {
        if (!dragRef.current) return
        const { axisIndex } = dragRef.current
        const finalValue = preview?.value ?? position[axisIndex]
        dragRef.current = null
        setPreview(null)
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
        onDragChange(axisIndex, finalValue)
    }, [preview, position, onDragChange])

    return (
        <div className="ff-move">
            <span className="ff-move__label">Move (drag a value)</span>
            <div className="ff-move__axes">
                {AXES.map(({ index, label }) => {
                    const displayValue = preview?.axisIndex === index ? preview.value : (Number(position[index]) || 0)
                    return (
                        <div key={label} className="ff-move__axis">
                            <span className="ff-move__axis-label">{label}</span>
                            <button
                                type="button"
                                className="ff-button ff-button--ghost ff-move__step"
                                disabled={busy}
                                onClick={() => onNudge(index, -STEP)}
                            >
                                −
                            </button>
                            <span
                                className="ff-move__value ff-move__value--drag"
                                onPointerDown={(e) => startDrag(index, e)}
                                onPointerMove={onDragMove}
                                onPointerUp={endDrag}
                                title="Drag left/right to move"
                            >
                                {displayValue.toFixed(1)}
                            </span>
                            <button
                                type="button"
                                className="ff-button ff-button--ghost ff-move__step"
                                disabled={busy}
                                onClick={() => onNudge(index, STEP)}
                            >
                                +
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
