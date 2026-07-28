import AxisScrubRow from './AxisScrubRow.jsx'

export default function ScaleControls({ scale, onNudge, onDragChange, busy }) {
    return (
        <AxisScrubRow
            label="Drag a value, or use the buttons"
            values={scale}
            step={0.1}
            dragSensitivity={0.01}
            min={0.1}
            max={10}
            formatValue={(v) => v.toFixed(2)}
            onNudge={onNudge}
            onDragChange={onDragChange}
            busy={busy}
        />
    )
}
