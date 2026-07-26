// Drift now runs on its own (a server timer recomputes every unclaimed mark
// from real elapsed time, see finiteForeverRoutes.js) — this just forces an
// immediate recompute instead of waiting for the next automatic sweep, handy
// for testing/demos. Admin-only visibility here is just UX; real enforcement
// is the server's requireAdminWrite gate on POST .../finite-forever/advance-drift.
export default function AdvanceDriftControl({ visible, onAdvance, busy }) {
    if (!visible) return null
    return (
        <button type="button" className="ff-button ff-button--admin" disabled={busy} onClick={onAdvance}>
            {busy ? 'Checking…' : 'Force drift check'}
        </button>
    )
}
