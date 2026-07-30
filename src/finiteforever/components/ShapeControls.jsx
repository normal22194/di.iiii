import AxisScrubRow from './AxisScrubRow.jsx'

// Only the 4 keys Text3DObject.jsx's own FONT_MAP recognizes — kept as a
// separate small list here rather than importing that map, since it maps to
// file paths (client concern) while this just needs the option list.
const FONT_OPTIONS = [
    { value: 'helvetiker_regular', label: 'Helvetiker' },
    { value: 'helvetiker_bold', label: 'Helvetiker Bold' },
    { value: 'optimer_regular', label: 'Optimer' },
    { value: 'gentilis_regular', label: 'Gentilis' }
]

// Which entity.components.primitive fields each shape exposes, and their
// on-screen labels — box/media types have nothing here (box's uniform Scale
// control in the main window already covers it; box has no single radius/
// height to expose, and media types have no primitive component at all).
const GEOMETRY_FIELDS = {
    sphere: { fields: ['radius'], labels: ['Radius'] },
    cone: { fields: ['radius', 'height'], labels: ['Radius', 'Height'] },
    torus: { fields: ['radius', 'tube'], labels: ['Radius', 'Tube'] }
}

const TEXT_SIZE_FIELDS = ['fontSize3D', 'depth3D']
const TEXT_SIZE_LABELS = ['Size', 'Depth']

// Shape-specific settings in the Advanced window — geometry sliders for the
// built-in primitives that have one (sphere/cone/ring), plus font/size/
// depth/bevel for text. Renders nothing for box/image/model (see
// GEOMETRY_FIELDS comment).
export default function ShapeControls({
    entity,
    isOwner,
    busy,
    onGeometryNudge,
    onGeometryDragChange,
    onTextSizeNudge,
    onTextSizeDragChange,
    onTextStyleChange
}) {
    const disabled = busy || !isOwner
    const geometry = GEOMETRY_FIELDS[entity.type]

    if (geometry) {
        const primitive = entity.components?.primitive || {}
        const values = geometry.fields.map((key) => Number(primitive[key]) || 0)
        return (
            <div className="ff-shape">
                <AxisScrubRow
                    label="Shape"
                    axisLabels={geometry.labels}
                    values={values}
                    step={0.1}
                    dragSensitivity={0.01}
                    min={0.05}
                    max={5}
                    formatValue={(v) => v.toFixed(2)}
                    busy={disabled}
                    onNudge={(axisIndex, delta) => onGeometryNudge(geometry.fields, axisIndex, delta)}
                    onDragChange={(axisIndex, value) => onGeometryDragChange(geometry.fields, axisIndex, value)}
                />
            </div>
        )
    }

    if (entity.type === 'text') {
        const text = entity.components?.text || {}
        const sizeValues = TEXT_SIZE_FIELDS.map((key) => Number(text[key]) || 0)
        return (
            <div className="ff-shape">
                <AxisScrubRow
                    label="Text"
                    axisLabels={TEXT_SIZE_LABELS}
                    values={sizeValues}
                    step={0.02}
                    dragSensitivity={0.005}
                    min={0.05}
                    max={2}
                    formatValue={(v) => v.toFixed(2)}
                    busy={disabled}
                    onNudge={(axisIndex, delta) => onTextSizeNudge(TEXT_SIZE_FIELDS, axisIndex, delta)}
                    onDragChange={(axisIndex, value) => onTextSizeDragChange(TEXT_SIZE_FIELDS, axisIndex, value)}
                />
                <div className="ff-advanced__row">
                    <span className="ff-advanced__label">Font</span>
                    <select
                        value={text.font3D || 'helvetiker_regular'}
                        disabled={disabled}
                        onChange={(e) => onTextStyleChange({ font3D: e.target.value })}
                    >
                        {FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <label className="ff-advanced__row">
                    <span className="ff-advanced__label">Bevel</span>
                    <input
                        type="checkbox"
                        checked={text.bevelEnabled3D !== false}
                        disabled={disabled}
                        onChange={(e) => onTextStyleChange({ bevelEnabled3D: e.target.checked })}
                    />
                </label>
            </div>
        )
    }

    return null
}
