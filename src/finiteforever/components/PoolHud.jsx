export default function PoolHud({ pool }) {
    return (
        <div className="ff-hud" aria-live="polite">
            <span className="ff-hud__label">Kept forever</span>
            <span className="ff-hud__count">{pool.claimed} / {pool.total}</span>
        </div>
    )
}
