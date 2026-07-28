import AxisScrubRow from './AxisScrubRow.jsx'

const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180

// Stored/submitted in radians (matches components.transform.rotation), shown
// in degrees since that's what actually reads intuitively while dragging.
export default function RotationControls({ rotation, onNudge, onDragChange, busy }) {
    const degrees = (rotation || [0, 0, 0]).map((r) => (Number(r) || 0) * RAD_TO_DEG)
    return (
        <AxisScrubRow
            label="Degrees — drag a value, or use the buttons"
            values={degrees}
            step={15}
            dragSensitivity={0.5}
            formatValue={(v) => `${Math.round(v)}°`}
            onNudge={(axisIndex, deltaDeg) => onNudge(axisIndex, deltaDeg * DEG_TO_RAD)}
            onDragChange={(axisIndex, valueDeg) => onDragChange(axisIndex, valueDeg * DEG_TO_RAD)}
            busy={busy}
        />
    )
}
