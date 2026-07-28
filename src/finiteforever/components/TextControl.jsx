// Only rendered for text-type marks — lets you change what it says after
// placing it (it otherwise defaults to "New Text" and would stay that way
// forever, permanent or not). Deliberately never disabled while saving in
// the background — blocking the input mid-keystroke would stop you typing.
export default function TextControl({ value, onChange }) {
    return (
        <label className="ff-text-control">
            <span className="ff-text-control__label">Text</span>
            <input
                type="text"
                value={value}
                maxLength={120}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    )
}
