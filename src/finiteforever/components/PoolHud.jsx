export default function PoolHud({ pool }) {
    const remaining = Math.max(0, pool.total - pool.claimed)
    return (
        <div className="ff-hud" aria-live="polite">
            <span className="ff-hud__label">Permanence remaining</span>
            <span className="ff-hud__count">{remaining} / {pool.total}</span>
        </div>
    )
}
