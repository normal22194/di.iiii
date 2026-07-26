import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import useAuthSession from '../hooks/useAuthSession.js'
import PlacementPanel from './components/PlacementPanel.jsx'
import ClaimPrompt from './components/ClaimPrompt.jsx'
import PoolHud from './components/PoolHud.jsx'
import RitualLogView from './components/RitualLogView.jsx'
import AdvanceDriftControl from './components/AdvanceDriftControl.jsx'
import {
    FINITE_FOREVER_PROJECT_ID,
    buildMarkEntity,
    claimPermanence,
    deleteMark,
    duplicateMark,
    fetchFiniteForeverDocument,
    moveMark,
    placeMark,
    readPermanencePool,
    recolorMark,
    appendRitualLogEntry,
    advanceDrift
} from './permanence.js'
import './finiteForeverExperience.css'

const LiveProjectScene = lazy(() => import('../components/LiveProjectScene.jsx'))

const MARK_SPAWN_DISTANCE = 2.5

export default function FiniteForeverExperience() {
    const { role, label } = useAuthSession()
    const actorLabel = label || 'a visitor'
    const viewerRef = useRef(null)

    const [doc, setDoc] = useState(null)
    const [version, setVersion] = useState(0)
    const [pendingEntity, setPendingEntity] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)
    const [logOpen, setLogOpen] = useState(false)
    // First-arrival framing: states the concept once, then gets out of the
    // way — dismissed by any interaction, same pattern as the base viewer's
    // own movement hint (LiveProjectScene.jsx's showMoveHint).
    const [showIntro, setShowIntro] = useState(true)
    useEffect(() => {
        const dismiss = () => setShowIntro(false)
        const timer = setTimeout(dismiss, 14000)
        window.addEventListener('pointerdown', dismiss, { once: true })
        window.addEventListener('touchstart', dismiss, { once: true })
        return () => {
            clearTimeout(timer)
            window.removeEventListener('pointerdown', dismiss)
            window.removeEventListener('touchstart', dismiss)
        }
    }, [])

    // Holds the in-flight drag-to-scrub chain (see handleAxisDragChange below)
    // — declared up here so handleOpError can invalidate it on conflict.
    const dragChainRef = useRef(null)

    const reload = useCallback(async () => {
        try {
            const response = await fetchFiniteForeverDocument()
            setDoc(response?.document || null)
            setVersion(Number(response?.version) || 0)
            setError(null)
        } catch (err) {
            setError(err?.data?.error || 'Could not load Finite Forever.')
        }
    }, [])

    useEffect(() => { void reload() }, [reload])

    // Re-fetches the document AND re-syncs whichever entity is currently open
    // in the edit panel, so its shown position/color/status matches reality
    // right after a conflict — otherwise the panel keeps showing a value that
    // never actually got saved. Closes the panel if that mark is gone.
    const resyncAfterConflict = useCallback(async () => {
        try {
            const response = await fetchFiniteForeverDocument()
            const freshDoc = response?.document || null
            setDoc(freshDoc)
            setVersion(Number(response?.version) || 0)
            setPendingEntity((prev) => {
                if (!prev || !freshDoc) return null
                return freshDoc.entities?.find((e) => e.id === prev.id) || null
            })
        } catch {
            // best-effort — leave state as-is if even the resync fails
        }
    }, [])

    // A 409 means someone else (another visitor, or the automatic drift
    // sweep) changed this project between our read and our write — the raw
    // conflict body has no `.error` field, so err.message would otherwise be
    // the entire raw JSON response (a real bug this fixes, not just cosmetic:
    // apiClient.js's createHttpError falls back to the full response text
    // when `.error` is missing). Resync instead of showing that.
    const handleOpError = useCallback((err, fallbackMessage) => {
        if (err?.status === 409) {
            setError('Someone else changed this just now — refreshed to match.')
            dragChainRef.current = null
            void resyncAfterConflict()
            return
        }
        setError(err?.data?.error || fallbackMessage)
    }, [resyncAfterConflict])

    const handlePlace = useCallback(async (type) => {
        if (!doc || busy) return
        setBusy(true)
        try {
            const ground = viewerRef.current?.getPlayerGroundPosition?.() || { x: 0, z: 0, yaw: 0 }
            const position = [
                ground.x + Math.sin(ground.yaw) * MARK_SPAWN_DISTANCE,
                0,
                ground.z + Math.cos(ground.yaw) * MARK_SPAWN_DISTANCE
            ]
            const entity = buildMarkEntity({ type, position, actorLabel })
            const response = await placeMark({ baseVersion: version, entity })
            setDoc(response.document)
            setVersion(response.newVersion)
            await appendRitualLogEntry({ actorLabel, action: 'place', targetLabel: entity.name, detail: { entityId: entity.id } })
            setPendingEntity(entity)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not place that mark.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, handleOpError])

    const handleConfirmClaim = useCallback(async () => {
        if (!doc || !pendingEntity || busy) return
        setBusy(true)
        try {
            const { result } = await claimPermanence({
                document: doc,
                baseVersion: version,
                entity: pendingEntity,
                actorLabel
            })
            setDoc(result.document)
            setVersion(result.newVersion)
            setPendingEntity(null)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not claim permanence.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, pendingEntity, busy, actorLabel, handleOpError])

    const handleDismissClaim = useCallback(() => setPendingEntity(null), [])

    // Double-click an already-placed mark to reopen the same menu for it —
    // not just right after placing. Guarded to Finite Forever's own marks
    // (every entity in this project has a permanence component).
    const handleSelectEntity = useCallback((entity) => {
        if (!entity?.components?.permanence || busy) return
        setPendingEntity(entity)
    }, [busy])

    const handleRecolor = useCallback(async (color) => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const response = await recolorMark({ baseVersion: version, entityId: pendingEntity.id, color })
            setDoc(response.document)
            setVersion(response.newVersion)
            setPendingEntity((current) => current && ({
                ...current,
                components: { ...current.components, appearance: { ...current.components.appearance, color } }
            }))
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not change that color.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError])

    // Shared by the step buttons (relative delta) and the drag-to-scrub value
    // (absolute value) — both just need "here's axis i's new number".
    const commitAxisPosition = useCallback(async (axisIndex, computeNext) => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const currentPosition = pendingEntity.components.transform?.position || [0, 0, 0]
            const position = currentPosition.map((value, i) => (i === axisIndex ? computeNext(Number(value) || 0) : value))
            const response = await moveMark({ baseVersion: version, entityId: pendingEntity.id, position })
            setDoc(response.document)
            setVersion(response.newVersion)
            setPendingEntity((prev) => prev && ({
                ...prev,
                components: { ...prev.components, transform: { ...prev.components.transform, position } }
            }))
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not move that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError])

    const handleNudge = useCallback((axisIndex, delta) => (
        commitAxisPosition(axisIndex, (current) => current + delta)
    ), [commitAxisPosition])

    // Drag-to-scrub needs to move the object live, tick by tick, as fast as
    // the network allows — a plain useCallback re-submitting from React state
    // would race itself (rapid pointermoves outrunning each response, each
    // built on a now-stale baseVersion → 409s). Track the chain in a ref
    // instead (declared near the top of the component): each submit
    // reads/writes the ref's own version/position, never React state, so it
    // can't go stale mid-drag; only the latest pending value is kept, so a
    // burst of pointermoves collapses to one in-flight request plus whatever
    // was most recent when it completes.
    const handleAxisDragChange = useCallback((axisIndex, value) => {
        if (!pendingEntity) return
        let chain = dragChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            chain = {
                entityId: pendingEntity.id,
                version,
                position: [...(pendingEntity.components.transform?.position || [0, 0, 0])],
                latest: null,
                running: false
            }
            dragChainRef.current = chain
        }
        chain.latest = { axisIndex, value }
        if (chain.running) return
        chain.running = true
        setBusy(true)
        ;(async () => {
            while (chain.latest) {
                const { axisIndex: ai, value: v } = chain.latest
                chain.latest = null
                const nextPosition = chain.position.map((p, i) => (i === ai ? v : p))
                try {
                    const response = await moveMark({ baseVersion: chain.version, entityId: chain.entityId, position: nextPosition })
                    chain.version = response.newVersion
                    chain.position = nextPosition
                    setDoc(response.document)
                    setVersion(response.newVersion)
                    setPendingEntity((prev) => (prev && prev.id === chain.entityId) ? ({
                        ...prev,
                        components: { ...prev.components, transform: { ...prev.components.transform, position: nextPosition } }
                    }) : prev)
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not move that mark.')
                    break
                }
            }
            chain.running = false
            setBusy(false)
        })()
    }, [pendingEntity, version, handleOpError])

    const handleDuplicate = useCallback(async () => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const response = await duplicateMark({ baseVersion: version, entity: pendingEntity, actorLabel })
            setDoc(response.document)
            setVersion(response.newVersion)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not duplicate that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, actorLabel, handleOpError])

    const handleDelete = useCallback(async () => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const response = await deleteMark({ baseVersion: version, entityId: pendingEntity.id })
            setDoc(response.document)
            setVersion(response.newVersion)
            setPendingEntity(null)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not delete that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError])

    const handleAdvanceDrift = useCallback(async () => {
        if (busy) return
        setBusy(true)
        try {
            await advanceDrift()
            await reload()
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not advance drift.')
        } finally {
            setBusy(false)
        }
    }, [busy, reload, handleOpError])

    const pool = doc ? readPermanencePool(doc) : { total: 0, claimed: 0 }

    return (
        <div className="ff-experience">
            <Suspense fallback={null}>
                <LiveProjectScene
                    ref={viewerRef}
                    projectId={FINITE_FOREVER_PROJECT_ID}
                    interactive
                    showChrome={false}
                    title="Finite Forever"
                    onEntityDoubleClick={handleSelectEntity}
                />
            </Suspense>

            <div className="ff-overlay">
                <PoolHud pool={pool} />
                <div className="ff-overlay__actions">
                    <button type="button" className="ff-button ff-button--ghost" onClick={() => setLogOpen(true)}>
                        The ritual log
                    </button>
                    <AdvanceDriftControl visible={role === 'admin'} onAdvance={handleAdvanceDrift} busy={busy} />
                </div>
            </div>

            {!pendingEntity && (
                <div className="ff-overlay ff-overlay--bottom">
                    <PlacementPanel onPlace={handlePlace} disabled={busy || !doc} />
                </div>
            )}

            {pendingEntity && (
                <ClaimPrompt
                    entity={pendingEntity}
                    pool={pool}
                    busy={busy}
                    onConfirm={handleConfirmClaim}
                    onDismiss={handleDismissClaim}
                    onRecolor={handleRecolor}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onNudge={handleNudge}
                    onAxisDragChange={handleAxisDragChange}
                />
            )}

            {error && <p className="ff-error" role="alert">{error}</p>}

            {showIntro && (
                <div className="ff-intro" aria-hidden="true">
                    <span className="ff-intro__title">FINITE FOREVER</span>
                    <p className="ff-intro__line">
                        Nothing here is permanent by default. Add a mark — then decide
                        what you want to stay, and what you&rsquo;re willing to let drift.
                    </p>
                </div>
            )}

            <RitualLogView open={logOpen} onClose={() => setLogOpen(false)} />
        </div>
    )
}
