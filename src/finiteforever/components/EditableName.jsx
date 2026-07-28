import { useEffect, useRef, useState } from 'react'

// Double-click to rename — mirrors the identity/text-entry conventions
// elsewhere in Finite Forever (see identity.js's 40-char cap): shown as
// plain text until double-clicked, then swaps to an input. Enter/blur
// commits a trimmed, non-empty value; Escape (or blurring with no real
// change) reverts without calling onChange.
export default function EditableName({ value, onChange, disabled, className = '' }) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const inputRef = useRef(null)

    useEffect(() => {
        if (!editing) setDraft(value)
    }, [value, editing])

    useEffect(() => {
        if (editing) inputRef.current?.focus()
    }, [editing])

    const commit = () => {
        const trimmed = draft.trim()
        setEditing(false)
        if (trimmed && trimmed !== value) onChange(trimmed)
    }

    const cancel = () => {
        setDraft(value)
        setEditing(false)
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="text"
                className={`ff-editable-name__input ${className}`}
                value={draft}
                maxLength={60}
                disabled={disabled}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commit() }
                    if (e.key === 'Escape') { e.preventDefault(); cancel() }
                }}
            />
        )
    }

    const enterEdit = () => !disabled && setEditing(true)

    return (
        <span
            className={`ff-editable-name ${className}`}
            onDoubleClick={enterEdit}
            // Keyboard/a11y equivalent of the double-click: Enter or Space
            // while focused starts editing, same as activating a button.
            role="button"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterEdit() }
            }}
            title="Double-click to rename"
        >
            {value}
        </span>
    )
}
