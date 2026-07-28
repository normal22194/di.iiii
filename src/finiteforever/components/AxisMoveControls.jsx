import AxisScrubRow from './AxisScrubRow.jsx'

// This viewer uses pointer-lock for the camera, so dragging the object
// directly in the 3D scene would fight that; scrubbing the number here gets
// the same "grab and move it" feel without touching camera controls at all.
export default function AxisMoveControls({ position, onNudge, onDragChange, busy }) {
    return (
        <AxisScrubRow
            label="Drag a value, or use the buttons"
            values={position}
            step={0.5}
            dragSensitivity={0.02}
            formatValue={(v) => v.toFixed(1)}
            onNudge={onNudge}
            onDragChange={onDragChange}
            busy={busy}
        />
    )
}
