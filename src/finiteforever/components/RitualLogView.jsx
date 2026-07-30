import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRitualLog } from '../permanence.js'

const ACTION_COPY = {
    place: (e) => `${e.actorLabel || 'someone'} placed ${e.targetLabel}`,
    claim: (e) => `${e.actorLabel || 'someone'} chose to keep ${e.targetLabel} forever`,
    leave: (e) => `${e.actorLabel || 'someone'} left ${e.targetLabel} here — it won't drift, but it isn't counted as kept forever`,
    revoke: (e) => `${e.actorLabel || 'someone'} chose to let go of ${e.targetLabel} in order to keep ${e.detail?.takenBy || 'their own mark'} forever`,
    release: (e) => `${e.actorLabel || 'someone'} let go of ${e.targetLabel} — its permanence returned to the pool`,
    delete: (e) => `${e.actorLabel || 'someone'} deleted ${e.targetLabel}`,
    advance: (e) => `the space drifted (${e.detail?.stepped ?? 0} marks)`,
    residue: (e) => `${e.detail?.reachedResidue ?? 0} mark(s) faded away completely`
}

const describe = (entry) => (ACTION_COPY[entry.action] || ((e) => `${e.action}: ${e.targetLabel}`))(entry)

// Polls rather than subscribing to realtime — the ritual log deliberately
// lives outside the project doc's live sync (it must survive independent of
// it), and a manual-first-pass feature doesn't need sub-second freshness here.
const POLL_MS = 15000

export default function RitualLogView({ open, onClose }) {
    const [entries, setEntries] = useState([])
    const [error, setError] = useState(null)
    const sinceRef = useRef(0)
    const panelRef = useRef(null)

    // pointerdown (not click) so this fires before any other press logic
    // reacts, same convention as DraggablePanel's own click-outside handling.
    useEffect(() => {
        if (!open) return undefined
        const handlePointerDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [open, onClose])

    const refresh = useCallback(async () => {
        try {
            const next = await fetchRitualLog(0)
            sinceRef.current = next.length ? next[next.length - 1].createdAt : 0
            setEntries(next)
            setError(null)
        } catch (err) {
            // Never trust err.message directly — for error bodies without an
            // `.error` field, apiClient.js's createHttpError falls back to
            // the entire raw response text (bit us once already, see
            // FiniteForeverExperience.jsx's handleOpError).
            setError(err?.data?.error || 'Could not load the ritual log')
        }
    }, [])

    useEffect(() => {
        if (!open) return undefined
        refresh()
        const timer = setInterval(refresh, POLL_MS)
        return () => clearInterval(timer)
    }, [open, refresh])

    if (!open) return null

    return (
        <div ref={panelRef} className="ff-ritual-log" role="dialog" aria-label="Ritual log">
            <header className="ff-ritual-log__header">
                <span>The ritual remembers</span>
                <button type="button" className="ff-button ff-button--ghost" onClick={onClose}>Close</button>
            </header>
            {error && <p className="ff-ritual-log__error">{error}</p>}
            <ul className="ff-ritual-log__list">
                {entries.length === 0 && !error && <li className="ff-ritual-log__empty">Nothing recorded yet.</li>}
                {entries.slice().reverse().map((entry) => (
                    <li key={entry.id}>{describe(entry)}</li>
                ))}
            </ul>
        </div>
    )
}
