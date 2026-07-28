export default function OpacityControl({ opacity, onChange, busy }) {
    return (
        <label className="ff-opacity">
            <span className="ff-opacity__label">Opacity</span>
            <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                disabled={busy}
                onChange={(e) => onChange(Number(e.target.value))}
            />
            <span className="ff-opacity__value">{Math.round(opacity * 100)}%</span>
        </label>
    )
}
