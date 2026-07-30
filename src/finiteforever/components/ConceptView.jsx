import { useEffect, useRef } from 'react'

// Static, written explanation of the space — unlike RitualLogView, there's
// nothing to fetch here, it's just prose. Placeholder copy below; edit
// freely, this isn't derived from anything else.
const CONCEPT_PARAGRAPHS = [
    'Finite Forever is a shared space that does not hold still.',
    'Anyone who visits can place a mark — a small object left behind. Left alone, it drifts: fading slowly over twelve hours until it is gone, the way most things are.',
    'But the space also holds a small, shared amount of permanence. Spend some of it on a mark, and that one thing stays — forever, or until someone later decides something else deserves it more.',
    'Every placement, every choice to keep or let go, is recorded in the ritual log. The space forgets nothing, even as almost everything in it disappears.'
]

export default function ConceptView({ open, onClose }) {
    const panelRef = useRef(null)

    // Same pointerdown-outside-closes idiom as RitualLogView/DraggablePanel.
    useEffect(() => {
        if (!open) return undefined
        const handlePointerDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [open, onClose])

    if (!open) return null

    return (
        <div ref={panelRef} className="ff-concept" role="dialog" aria-label="The concept">
            <header className="ff-concept__header">
                <span>The concept</span>
                <button type="button" className="ff-button ff-button--ghost" onClick={onClose}>Close</button>
            </header>
            {CONCEPT_PARAGRAPHS.map((paragraph, index) => (
                <p key={index} className="ff-concept__paragraph">{paragraph}</p>
            ))}
        </div>
    )
}
