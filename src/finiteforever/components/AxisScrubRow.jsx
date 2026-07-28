import { useCallback, useRef, useState } from 'react'

// Generic "drag a value left/right to change it" row, reused for Move
// (position), Scale, and Rotation — each just supplies its own step size,
// drag sensitivity, value range, and display formatting.
export default function AxisScrubRow({
    label,
    axisLabels = ['X', 'Y', 'Z'],
    values,
    step = 0.5,
    dragSensitivity = 0.02,
    min = -Infinity,
    max = Infinity,
    formatValue = (v) => v.toFixed(1),
    onNudge,
    onDragChange,
    busy
}) {
    const dragRef = useRef(null)
    const [preview, setPreview] = useState(null) // { axisIndex, value } while dragging — instant number feedback

    const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max])

    const startDrag = useCallback((axisIndex, e) => {
        if (busy || e.button !== 0) return
        const startValue = Number(values[axisIndex]) || 0
        dragRef.current = { axisIndex, startX: e.clientX, startValue }
        setPreview({ axisIndex, value: startValue })
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [busy, values])

    const onDragMove = useCallback((e) => {
        if (!dragRef.current) return
        const { axisIndex, startX, startValue } = dragRef.current
        const value = Math.round(clamp(startValue + (e.clientX - startX) * dragSensitivity) * 100) / 100
        setPreview({ axisIndex, value })
        onDragChange(axisIndex, value)
    }, [clamp, dragSensitivity, onDragChange])

    const endDrag = useCallback((e) => {
        if (!dragRef.current) return
        const { axisIndex } = dragRef.current
        const finalValue = preview?.value ?? values[axisIndex]
        dragRef.current = null
        setPreview(null)
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
        onDragChange(axisIndex, finalValue)
    }, [preview, values, onDragChange])

    return (
        <div className="ff-move">
            <span className="ff-move__label">{label}</span>
            <div className="ff-move__axes">
                {axisLabels.map((axisLabel, index) => {
                    const displayValue = preview?.axisIndex === index ? preview.value : (Number(values[index]) || 0)
                    return (
                        <div key={axisLabel} className="ff-move__axis">
                            <span className="ff-move__axis-label">{axisLabel}</span>
                            <button
                                type="button"
                                className="ff-button ff-button--ghost ff-move__step"
                                disabled={busy}
                                onClick={() => onNudge(index, -step)}
                            >
                                −
                            </button>
                            <span
                                className="ff-move__value ff-move__value--drag"
                                onPointerDown={(e) => startDrag(index, e)}
                                onPointerMove={onDragMove}
                                onPointerUp={endDrag}
                                title="Drag left/right to change"
                            >
                                {formatValue(displayValue)}
                            </span>
                            <button
                                type="button"
                                className="ff-button ff-button--ghost ff-move__step"
                                disabled={busy}
                                onClick={() => onNudge(index, step)}
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
