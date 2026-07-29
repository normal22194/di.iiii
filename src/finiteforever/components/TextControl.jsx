// Only rendered for text-type marks — lets you change what it says after
// placing it (it otherwise defaults to "New Text" and would stay that way
// forever, permanent or not). `disabled` is for ownership gating only
// (non-placers can't edit someone else's mark) — deliberately never
// disabled just for being busy while saving in the background, since
// blocking the input mid-keystroke would stop you typing.
export default function TextControl({ value, onChange, disabled }) {
    return (
        <label className="ff-text-control">
            <span className="ff-text-control__label">Text</span>
            <input
                type="text"
                value={value}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    )
}
