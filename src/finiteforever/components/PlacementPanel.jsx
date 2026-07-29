const MARK_TYPES = [
    { key: 'box', label: 'Box' },
    { key: 'sphere', label: 'Sphere' },
    { key: 'cone', label: 'Cone' },
    { key: 'torus', label: 'Ring' },
    { key: 'text', label: 'Text' }
]

// Places with the default color immediately — FiniteForeverExperience opens
// the just-placed mark's edit menu (ClaimPrompt) right after, which already
// has a live color swatch. Choosing a color there recolors the real object
// in the scene as you pick, instead of choosing blind against a flat swatch
// before the mark even exists.
export default function PlacementPanel({ onPlace, onImportClick, disabled }) {
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
                <button
                    type="button"
                    className="ff-button ff-button--ghost"
                    disabled={disabled}
                    onClick={onImportClick}
                >
                    ⤒ Import…
                </button>
            </div>
        </div>
    )
}
