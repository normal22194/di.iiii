import { useEffect, useRef, useState } from 'react'

// Static, written explanation of the space — unlike RitualLogView, there's
// nothing to fetch here, it's just prose. Placeholder copy below; edit
// freely, this isn't derived from anything else.
const CONCEPT_PARAGRAPHS = [
    'Finite Forever is a shared space that does not hold still.',
    'Anyone who visits can place a mark — a small object left behind. Left alone, it drifts: fading slowly over twelve hours until it is gone, the way most things are.',
    'But the space also holds a small, shared amount of permanence. Spend some of it on a mark, and that one thing stays — forever, or until someone later decides something else deserves it more.',
    'Every placement, every choice to keep or let go, is recorded in the ritual log. The space forgets nothing, even as almost everything in it disappears.'
]

// How long the closing fade plays before this actually unmounts — must
// match finiteForeverExperience.css's .ff-concept opacity transition
// duration, kept in sync manually (same approach already used elsewhere for
// touch height ratios, see DraggablePanel.jsx).
const FADE_DURATION_MS = 300

// How long the panel stays at opacity 0 right after mounting before the
// entering class is dropped — needs to be >0 so the browser actually paints
// the opacity:0 frame before the CSS transition kicks in animating up to 1;
// a same-tick flip wouldn't leave anything for the transition to animate
// from. Well under FADE_DURATION_MS so the fade-in reads as prompt.
const ENTER_DELAY_MS = 20

// Kept mounted a little past `open` going false so the CSS opacity
// transition below actually has time to play — a plain conditional render
// would unmount instantly, before any fade could be seen. Used both for a
// manual close (Close button/click-outside) and for FiniteForeverExperience
// auto-closing this a few seconds after entry. Opening mirrors this the same
// way: mounts at opacity 0 (`entering`) and fades up, rather than appearing
// instantly.
export default function ConceptView({ open, onClose }) {
    const panelRef = useRef(null)
    const [rendered, setRendered] = useState(open)
    const [closing, setClosing] = useState(false)
    const [entering, setEntering] = useState(open)

    useEffect(() => {
        if (open) {
            setRendered(true)
            setClosing(false)
            setEntering(true)
            const enterTimer = setTimeout(() => setEntering(false), ENTER_DELAY_MS)
            return () => clearTimeout(enterTimer)
        }
        if (!rendered) return undefined
        setClosing(true)
        setEntering(false)
        const timer = setTimeout(() => {
            setRendered(false)
            setClosing(false)
        }, FADE_DURATION_MS)
        return () => clearTimeout(timer)
    }, [open, rendered])

    // Same pointerdown-outside-closes idiom as RitualLogView/DraggablePanel.
    useEffect(() => {
        if (!open) return undefined
        const handlePointerDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [open, onClose])

    if (!rendered) return null

    return (
        <div
            ref={panelRef}
            className={`ff-concept${closing ? ' ff-concept--closing' : ''}${entering ? ' ff-concept--entering' : ''}`}
            role="dialog"
            aria-label="The concept"
        >
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
