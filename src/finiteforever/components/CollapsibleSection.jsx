import { useState } from 'react'

// Collapsed by default — keeps the edit panel short until you actually want
// to move/scale/rotate something.
export default function CollapsibleSection({ title, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="ff-section">
            <button
                type="button"
                className="ff-section__toggle"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
            >
                <span className="ff-section__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                <span>{title}</span>
            </button>
            {open && <div className="ff-section__body">{children}</div>}
        </div>
    )
}
