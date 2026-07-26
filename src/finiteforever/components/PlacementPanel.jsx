const MARK_TYPES = [
    { key: 'box', label: 'Box' },
    { key: 'sphere', label: 'Sphere' },
    { key: 'cone', label: 'Cone' },
    { key: 'torus', label: 'Ring' },
    { key: 'text', label: 'Text' }
]

export default function PlacementPanel({ onPlace, disabled }) {
    return (
        <div className="ff-placement">
            <span className="ff-placement__prompt">Add a mark</span>
            <div className="ff-placement__buttons">
                {MARK_TYPES.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        className="ff-button"
                        disabled={disabled}
                        onClick={() => onPlace(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    )
}
