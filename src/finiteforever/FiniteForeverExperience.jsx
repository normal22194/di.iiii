import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useAuthSession from '../hooks/useAuthSession.js'
import PlacementPanel from './components/PlacementPanel.jsx'
import ImportWindow from './components/ImportWindow.jsx'
import ClaimPrompt from './components/ClaimPrompt.jsx'
import AdvancedSettingsPanel from './components/AdvancedSettingsPanel.jsx'
import AdminModeOverlay from './components/AdminModeOverlay.jsx'
import PoolHud from './components/PoolHud.jsx'
import RitualLogView from './components/RitualLogView.jsx'
import AdvanceDriftControl from './components/AdvanceDriftControl.jsx'
import EntryGate from './components/EntryGate.jsx'
import { clearIdentity, readStoredIdentity, storeIdentity } from './identity.js'
import {
    FINITE_FOREVER_PROJECT_ID,
    buildMarkEntity,
    claimPermanence,
    clearPage,
    deleteMark,
    deleteMarks,
    duplicateMark,
    fetchFiniteForeverDocument,
    moveMark,
    placeMark,
    placeMediaMark,
    readPermanencePool,
    recolorMark,
    renameMark,
    rescaleMark,
    rotateMark,
    savePage,
    setMarkOpacity,
    setMarkText,
    uploadMarkAsset,
    uploadPageAsset,
    appendRitualLogEntry,
    advanceDrift
} from './permanence.js'
import './finiteForeverExperience.css'

const LiveProjectScene = lazy(() => import('../components/LiveProjectScene.jsx'))

const MARK_SPAWN_DISTANCE = 2.5
const MAX_UNDO_STEPS = 50

export default function FiniteForeverExperience() {
    const { role } = useAuthSession()
    const isAdmin = role === 'admin'
    const viewerRef = useRef(null)

    // Entry gate: a name is required to do anything here — "hidden" only
    // controls whether *other visitors* see it (admins always do, both by
    // being forced visible=true at entry below and by the server always
    // showing admins the real name regardless of anyone else's choice).
    const [identity, setIdentity] = useState(() => readStoredIdentity())
    const actorLabel = identity?.username || 'a visitor'
    const actorVisible = isAdmin ? true : (identity?.visible ?? true)
    const handleEnter = useCallback((next) => {
        storeIdentity(next)
        setIdentity(next)
    }, [])
    // Deliberate override, not a side effect of a new tab/reload — this device
    // otherwise always resumes as the same identity (see identity.js).
    const handleSwitchIdentity = useCallback(() => {
        clearIdentity()
        setIdentity(null)
        setSelectedEntityId(null)
        setAdvancedEntityId(null)
    }, [])

    const [doc, setDoc] = useState(null)
    const [version, setVersion] = useState(0)
    // The main edit window and the Advanced window each just remember
    // *which* mark they're showing (by id) — the actual entity data is
    // derived from `doc` below, not copied into local state. That's what
    // lets Advanced keep showing its mark after the main window closes
    // (closing the main window only clears selectedEntityId, not
    // advancedEntityId), and it's what makes undo/redo simple: any handler
    // that updates `doc` is automatically reflected everywhere that reads
    // from it, no manual patching required.
    const [selectedEntityId, setSelectedEntityId] = useState(null)
    const pendingEntity = doc?.entities?.find((e) => e.id === selectedEntityId) || null
    const [advancedEntityId, setAdvancedEntityId] = useState(null)
    const advancedEntity = doc?.entities?.find((e) => e.id === advancedEntityId) || null
    // Selecting a genuinely different mark closes Advanced (it's specific to
    // whichever mark you opened it from) — but dismissing the main window
    // for the *same* mark does not; that's the whole point.
    useEffect(() => {
        if (advancedEntityId && selectedEntityId && selectedEntityId !== advancedEntityId) {
            setAdvancedEntityId(null)
        }
    }, [selectedEntityId, advancedEntityId])

    // Admin mode (not tied to any one mark) — Ctrl+Shift+A toggles it,
    // admins only. A mode, not a window: no drag/resize/close-button, just
    // on or off (see AdminModeOverlay). Independent of the mark-editing
    // windows: entering/leaving it doesn't close them and vice versa.
    const [adminWorkspaceOpen, setAdminWorkspaceOpen] = useState(false)
    // Right-click-drag box selection, only live while admin mode is on (see
    // LiveProjectScene's marqueeSelectEnabled/onMarqueeSelect). Cleared when
    // the mode turns off so a stale selection isn't still highlighted/listed
    // next time it's entered.
    const [marqueeSelectedIds, setMarqueeSelectedIds] = useState([])
    useEffect(() => {
        if (!adminWorkspaceOpen) setMarqueeSelectedIds([])
    }, [adminWorkspaceOpen])
    // Memoized so handleBulkDelete's own identity (and the keyboard effect
    // that depends on it) doesn't churn every render — .filter() would
    // otherwise return a fresh array reference each time even when nothing
    // selection-relevant actually changed.
    const marqueeSelectedEntities = useMemo(
        () => doc?.entities?.filter((e) => marqueeSelectedIds.includes(e.id)) || [],
        [doc, marqueeSelectedIds]
    )

    // Text editing is the one field that needs to show a keystroke
    // instantly, before the network round-trip that would otherwise be the
    // only way a derived-from-doc value could update — see handleTextChange.
    const [textOverride, setTextOverride] = useState(null) // { entityId, value } | null
    useEffect(() => {
        setTextOverride(null)
    }, [selectedEntityId])
    const displayEntity = (pendingEntity && textOverride && textOverride.entityId === pendingEntity.id)
        ? {
            ...pendingEntity,
            components: { ...pendingEntity.components, text: { ...pendingEntity.components.text, value: textOverride.value } }
        }
        : pendingEntity

    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(null)
    const [logOpen, setLogOpen] = useState(false)
    const [importOpen, setImportOpen] = useState(false)
    const [importError, setImportError] = useState(null)
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

    // Holds the in-flight drag-to-scrub chains (see handle*DragChange below)
    // — declared up here so handleOpError can invalidate them on conflict.
    const dragChainRef = useRef(null)
    const scaleChainRef = useRef(null)
    const rotationChainRef = useRef(null)
    const opacityChainRef = useRef(null)
    const textChainRef = useRef(null)
    // Device-local "what you last copied" — not shared/synced, same as a
    // real clipboard. Holds just the reusable look-and-feel fields, not
    // placement/permanence state (same reasoning as duplicateMark).
    const clipboardRef = useRef(null)

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

    // Re-fetches the document after a conflict — since every shown entity is
    // derived from `doc`, this alone is enough to bring the open panel(s)
    // back in sync (or close them, if the mark they were showing is gone).
    const resyncAfterConflict = useCallback(async () => {
        try {
            const response = await fetchFiniteForeverDocument()
            setDoc(response?.document || null)
            setVersion(Number(response?.version) || 0)
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
            scaleChainRef.current = null
            rotationChainRef.current = null
            opacityChainRef.current = null
            textChainRef.current = null
            // Otherwise the text field would keep showing what you'd typed
            // locally instead of the just-resynced server value.
            setTextOverride(null)
            void resyncAfterConflict()
            return
        }
        setError(err?.data?.error || fallbackMessage)
    }, [resyncAfterConflict])

    // Where a newly placed mark lands — a couple of meters in front of
    // wherever the participant is currently standing/facing.
    const getSpawnPosition = useCallback(() => {
        const ground = viewerRef.current?.getPlayerGroundPosition?.() || { x: 0, z: 0, yaw: 0 }
        return [
            ground.x + Math.sin(ground.yaw) * MARK_SPAWN_DISTANCE,
            0,
            ground.z + Math.cos(ground.yaw) * MARK_SPAWN_DISTANCE
        ]
    }, [])

    // Undo/redo — refs, not state (pushing an entry shouldn't itself cause a
    // re-render; only the setDoc/setVersion from actually applying one
    // should). Scope: place/import, delete, recolor, rename, move, scale,
    // rotate, opacity. Deliberately NOT covered: typing text (every
    // keystroke would be its own step), claiming/releasing permanence (the
    // shared-pool math makes "undo" ambiguous — does it un-revoke whoever it
    // took from?), Duplicate (use undo on the duplicate itself, i.e.
    // Backspace/Ctrl+Z right after), and page drawings/images (would mean
    // re-uploading a previous asset, not just reverting a field).
    const undoStackRef = useRef([])
    const redoStackRef = useRef([])

    const pushUndo = useCallback((entry) => {
        undoStackRef.current.push(entry)
        if (undoStackRef.current.length > MAX_UNDO_STEPS) undoStackRef.current.shift()
        redoStackRef.current = []
    }, [])

    // Single-field mutations, dispatched by kind — used by undo/redo replay,
    // which (unlike the live UI handlers) has no entity in hand, only a
    // stored kind/entityId/value from whenever the action was recorded.
    const applyFieldValue = useCallback((kind, entityId, value) => {
        switch (kind) {
        case 'position': return moveMark({ baseVersion: version, entityId, position: value })
        case 'scale': return rescaleMark({ baseVersion: version, entityId, scale: value })
        case 'rotation': return rotateMark({ baseVersion: version, entityId, rotation: value })
        case 'opacity': return setMarkOpacity({ baseVersion: version, entityId, opacity: value })
        case 'color': return recolorMark({ baseVersion: version, entityId, color: value })
        case 'name': return renameMark({ baseVersion: version, entityId, name: value })
        default: return Promise.resolve(null)
        }
    }, [version])

    const handleUndo = useCallback(async () => {
        if (busy) return
        const entry = undoStackRef.current.pop()
        if (!entry) return
        setBusy(true)
        try {
            let response = null
            if (entry.kind === 'place') {
                const target = doc?.entities?.find((e) => e.id === entry.entityId)
                if (target) response = await deleteMark({ document: doc, baseVersion: version, entity: target, actorLabel, actorVisible })
            } else if (entry.kind === 'delete') {
                response = await placeMark({ baseVersion: version, entity: entry.entitySnapshot })
            } else {
                response = await applyFieldValue(entry.kind, entry.entityId, entry.before)
            }
            if (response) {
                setDoc(response.document)
                setVersion(response.newVersion)
                redoStackRef.current.push(entry)
                setError(null)
            } else {
                undoStackRef.current.push(entry)
            }
        } catch (err) {
            undoStackRef.current.push(entry)
            handleOpError(err, 'Could not undo that.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, actorVisible, applyFieldValue, handleOpError])

    const handleRedo = useCallback(async () => {
        if (busy) return
        const entry = redoStackRef.current.pop()
        if (!entry) return
        setBusy(true)
        try {
            let response = null
            if (entry.kind === 'place') {
                response = await placeMark({ baseVersion: version, entity: entry.entitySnapshot })
            } else if (entry.kind === 'delete') {
                const target = doc?.entities?.find((e) => e.id === entry.entityId)
                if (target) response = await deleteMark({ document: doc, baseVersion: version, entity: target, actorLabel, actorVisible })
            } else {
                response = await applyFieldValue(entry.kind, entry.entityId, entry.after)
            }
            if (response) {
                setDoc(response.document)
                setVersion(response.newVersion)
                undoStackRef.current.push(entry)
                setError(null)
            } else {
                redoStackRef.current.push(entry)
            }
        } catch (err) {
            redoStackRef.current.push(entry)
            handleOpError(err, 'Could not redo that.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, actorVisible, applyFieldValue, handleOpError])

    const handlePlace = useCallback(async (type) => {
        if (!doc || busy) return
        setBusy(true)
        try {
            const position = getSpawnPosition()
            const entity = buildMarkEntity({ type, position, actorLabel, actorVisible })
            const response = await placeMark({ baseVersion: version, entity })
            setDoc(response.document)
            setVersion(response.newVersion)
            await appendRitualLogEntry({ actorLabel, actorVisible, action: 'place', targetLabel: entity.name, detail: { entityId: entity.id } })
            setSelectedEntityId(entity.id)
            pushUndo({ kind: 'place', entityId: entity.id, entitySnapshot: entity })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not place that mark.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, actorVisible, handleOpError, getSpawnPosition, pushUndo])

    // Import: upload the file, register it as a document asset, then create
    // the entity in one batch (placeMediaMark) — same follow-on flow as a
    // normal placement (log it, open its edit menu) once that succeeds.
    const handleImportFile = useCallback(async (file, type) => {
        if (!doc || busy) return
        setBusy(true)
        setImportError(null)
        try {
            const asset = await uploadMarkAsset(file)
            const position = getSpawnPosition()
            const entity = buildMarkEntity({ type, position, actorLabel, actorVisible, assetId: asset.id })
            const response = await placeMediaMark({ baseVersion: version, entity, asset })
            setDoc(response.document)
            setVersion(response.newVersion)
            await appendRitualLogEntry({ actorLabel, actorVisible, action: 'place', targetLabel: entity.name, detail: { entityId: entity.id } })
            setImportOpen(false)
            setSelectedEntityId(entity.id)
            // Redo re-places via plain createEntity (no re-upload) — the
            // asset stays registered in doc.assets across an undo, since
            // undo only removes the entity, not the asset it references.
            pushUndo({ kind: 'place', entityId: entity.id, entitySnapshot: entity })
            setError(null)
        } catch (err) {
            if (err?.status === 409) {
                handleOpError(err, 'Could not import that file.')
            } else {
                setImportError(err?.data?.error || 'Could not import that file.')
            }
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, actorVisible, handleOpError, getSpawnPosition, pushUndo])

    const handleConfirmClaim = useCallback(async () => {
        if (!doc || !pendingEntity || busy) return
        setBusy(true)
        try {
            const { result } = await claimPermanence({
                document: doc,
                baseVersion: version,
                entity: pendingEntity,
                actorLabel,
                actorVisible
            })
            setDoc(result.document)
            setVersion(result.newVersion)
            setSelectedEntityId(null)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not claim permanence.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, pendingEntity, busy, actorLabel, actorVisible, handleOpError])

    const handleDismissClaim = useCallback(() => setSelectedEntityId(null), [])

    // Double-click an already-placed mark to reopen the same menu for it —
    // not just right after placing. Guarded to Finite Forever's own marks
    // (every entity in this project has a permanence component).
    const handleSelectEntity = useCallback((entity) => {
        if (!entity?.components?.permanence || busy) return
        setSelectedEntityId(entity.id)
    }, [busy])

    const handleRecolor = useCallback(async (color) => {
        if (!pendingEntity || busy) return
        const before = pendingEntity.components.appearance?.color
        setBusy(true)
        try {
            const response = await recolorMark({ baseVersion: version, entityId: pendingEntity.id, color })
            setDoc(response.document)
            setVersion(response.newVersion)
            if (before !== color) pushUndo({ kind: 'color', entityId: pendingEntity.id, before, after: color })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not change that color.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError, pushUndo])

    // Shared by the main edit window (renaming pendingEntity) and Advanced
    // (which may be showing a *different* mark than the main window, or be
    // open with the main window already closed) — the caller always passes
    // the specific entity being renamed rather than this closing over one.
    const handleRename = useCallback(async (entity, name) => {
        if (!entity || busy) return
        const before = entity.name
        setBusy(true)
        try {
            const response = await renameMark({ baseVersion: version, entityId: entity.id, name })
            setDoc(response.document)
            setVersion(response.newVersion)
            if (before !== name) pushUndo({ kind: 'name', entityId: entity.id, before, after: name })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not rename that mark.')
        } finally {
            setBusy(false)
        }
    }, [busy, version, handleOpError, pushUndo])

    // Pages only ever show in the Advanced window, and Advanced can be
    // showing a mark the main window doesn't currently have open (or isn't
    // even open at all) — so these target advancedEntity, not pendingEntity.
    // Not undoable (see the undo/redo scope note above).
    const handleSavePage = useCallback(async (pageIndex, blob) => {
        if (!advancedEntity || busy) return
        setBusy(true)
        try {
            const asset = await uploadPageAsset(blob, `page-${advancedEntity.id}-${pageIndex + 1}.png`)
            const items = advancedEntity.components.pages?.items || []
            const response = await savePage({ baseVersion: version, entityId: advancedEntity.id, pageIndex, items, asset })
            setDoc(response.document)
            setVersion(response.newVersion)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not save that page.')
        } finally {
            setBusy(false)
        }
    }, [advancedEntity, version, busy, handleOpError])

    // Reverts a page straight to blank (assetId: null) — no upload, so the
    // face falls back to the box's plain color instead of showing an
    // uploaded transparent image (which would render solid black on a
    // non-transparent material).
    const handleClearPage = useCallback(async (pageIndex) => {
        if (!advancedEntity || busy) return
        setBusy(true)
        try {
            const items = advancedEntity.components.pages?.items || []
            const response = await clearPage({ baseVersion: version, entityId: advancedEntity.id, pageIndex, items })
            setDoc(response.document)
            setVersion(response.newVersion)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not clear that page.')
        } finally {
            setBusy(false)
        }
    }, [advancedEntity, version, busy, handleOpError])

    // Shared by the step buttons (relative delta) and the drag-to-scrub value
    // (absolute value) — both just need "here's axis i's new number". Each
    // nudge is its own undo step.
    const commitAxisPosition = useCallback(async (axisIndex, computeNext) => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const currentPosition = pendingEntity.components.transform?.position || [0, 0, 0]
            const position = currentPosition.map((value, i) => (i === axisIndex ? computeNext(Number(value) || 0) : value))
            const response = await moveMark({ baseVersion: version, entityId: pendingEntity.id, position })
            setDoc(response.document)
            setVersion(response.newVersion)
            pushUndo({ kind: 'position', entityId: pendingEntity.id, before: currentPosition, after: position })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not move that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError, pushUndo])

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
    // was most recent when it completes. The whole drag collapses to exactly
    // one undo step too — before is captured once, at drag start.
    const handleAxisDragChange = useCallback((axisIndex, value) => {
        if (!pendingEntity) return
        let chain = dragChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            const startPosition = [...(pendingEntity.components.transform?.position || [0, 0, 0])]
            chain = {
                entityId: pendingEntity.id,
                version,
                before: startPosition,
                position: startPosition,
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
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not move that mark.')
                    break
                }
            }
            chain.running = false
            setBusy(false)
            if (chain.position !== chain.before) {
                pushUndo({ kind: 'position', entityId: chain.entityId, before: chain.before, after: chain.position })
            }
        })()
    }, [pendingEntity, version, handleOpError, pushUndo])

    // Scale — mirrors handleNudge/handleAxisDragChange above, but also
    // re-baselines permanence.baseScale (rescaleMark) so the next drift
    // sweep continues shrinking from this new size instead of jumping back
    // to the size the mark was placed at.
    const commitScale = useCallback(async (axisIndex, computeNext) => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const current = pendingEntity.components.transform?.scale || [1, 1, 1]
            const scale = current.map((value, i) => (i === axisIndex ? Math.max(0.1, computeNext(Number(value) || 0)) : value))
            const response = await rescaleMark({ baseVersion: version, entityId: pendingEntity.id, scale })
            setDoc(response.document)
            setVersion(response.newVersion)
            pushUndo({ kind: 'scale', entityId: pendingEntity.id, before: current, after: scale })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not resize that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError, pushUndo])

    const handleScaleNudge = useCallback((axisIndex, delta) => (
        commitScale(axisIndex, (current) => current + delta)
    ), [commitScale])

    const handleScaleDragChange = useCallback((axisIndex, value) => {
        if (!pendingEntity) return
        let chain = scaleChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            const startScale = [...(pendingEntity.components.transform?.scale || [1, 1, 1])]
            chain = {
                entityId: pendingEntity.id,
                version,
                before: startScale,
                scale: startScale,
                latest: null,
                running: false
            }
            scaleChainRef.current = chain
        }
        chain.latest = { axisIndex, value: Math.max(0.1, value) }
        if (chain.running) return
        chain.running = true
        setBusy(true)
        ;(async () => {
            while (chain.latest) {
                const { axisIndex: ai, value: v } = chain.latest
                chain.latest = null
                const nextScale = chain.scale.map((p, i) => (i === ai ? v : p))
                try {
                    const response = await rescaleMark({ baseVersion: chain.version, entityId: chain.entityId, scale: nextScale })
                    chain.version = response.newVersion
                    chain.scale = nextScale
                    setDoc(response.document)
                    setVersion(response.newVersion)
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not resize that mark.')
                    break
                }
            }
            chain.running = false
            setBusy(false)
            if (chain.scale !== chain.before) {
                pushUndo({ kind: 'scale', entityId: chain.entityId, before: chain.before, after: chain.scale })
            }
        })()
    }, [pendingEntity, version, handleOpError, pushUndo])

    // Rotation — same shape as position (no re-baselining needed; drift
    // never touches rotation).
    const commitRotation = useCallback(async (axisIndex, computeNext) => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const current = pendingEntity.components.transform?.rotation || [0, 0, 0]
            const rotation = current.map((value, i) => (i === axisIndex ? computeNext(Number(value) || 0) : value))
            const response = await rotateMark({ baseVersion: version, entityId: pendingEntity.id, rotation })
            setDoc(response.document)
            setVersion(response.newVersion)
            pushUndo({ kind: 'rotation', entityId: pendingEntity.id, before: current, after: rotation })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not rotate that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, handleOpError, pushUndo])

    const handleRotationNudge = useCallback((axisIndex, delta) => (
        commitRotation(axisIndex, (current) => current + delta)
    ), [commitRotation])

    const handleRotationDragChange = useCallback((axisIndex, value) => {
        if (!pendingEntity) return
        let chain = rotationChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            const startRotation = [...(pendingEntity.components.transform?.rotation || [0, 0, 0])]
            chain = {
                entityId: pendingEntity.id,
                version,
                before: startRotation,
                rotation: startRotation,
                latest: null,
                running: false
            }
            rotationChainRef.current = chain
        }
        chain.latest = { axisIndex, value }
        if (chain.running) return
        chain.running = true
        setBusy(true)
        ;(async () => {
            while (chain.latest) {
                const { axisIndex: ai, value: v } = chain.latest
                chain.latest = null
                const nextRotation = chain.rotation.map((p, i) => (i === ai ? v : p))
                try {
                    const response = await rotateMark({ baseVersion: chain.version, entityId: chain.entityId, rotation: nextRotation })
                    chain.version = response.newVersion
                    chain.rotation = nextRotation
                    setDoc(response.document)
                    setVersion(response.newVersion)
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not rotate that mark.')
                    break
                }
            }
            chain.running = false
            setBusy(false)
            if (chain.rotation !== chain.before) {
                pushUndo({ kind: 'rotation', entityId: chain.entityId, before: chain.before, after: chain.rotation })
            }
        })()
    }, [pendingEntity, version, handleOpError, pushUndo])

    // Opacity — a range slider fires onChange continuously while dragging,
    // same race risk as the axis scrubbers, same ref-chain fix. Also
    // re-baselines baseAppearance.opacity for the same reason rescaleMark does.
    const handleOpacityChange = useCallback((value) => {
        if (!pendingEntity) return
        let chain = opacityChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            const startOpacity = typeof pendingEntity.components.appearance?.opacity === 'number' ? pendingEntity.components.appearance.opacity : 1
            chain = { entityId: pendingEntity.id, version, before: startOpacity, latestApplied: startOpacity, latest: null, running: false }
            opacityChainRef.current = chain
        }
        chain.latest = value
        if (chain.running) return
        chain.running = true
        setBusy(true)
        ;(async () => {
            while (chain.latest !== null) {
                const v = chain.latest
                chain.latest = null
                try {
                    const response = await setMarkOpacity({ baseVersion: chain.version, entityId: chain.entityId, opacity: v })
                    chain.version = response.newVersion
                    chain.latestApplied = v
                    setDoc(response.document)
                    setVersion(response.newVersion)
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not change opacity.')
                    break
                }
            }
            chain.running = false
            setBusy(false)
            if (chain.latestApplied !== chain.before) {
                pushUndo({ kind: 'opacity', entityId: chain.entityId, before: chain.before, after: chain.latestApplied })
            }
        })()
    }, [pendingEntity, version, handleOpError, pushUndo])

    // Text — deliberately doesn't touch the shared `busy` flag (see
    // TextControl.jsx): disabling the input mid-keystroke would stop you
    // typing. textOverride shows what you just typed instantly, ahead of
    // the network round-trip that's the only way the doc-derived entity
    // would otherwise reflect it. Not undoable (see undo/redo scope note).
    const handleTextChange = useCallback((value) => {
        if (!pendingEntity) return
        setTextOverride({ entityId: pendingEntity.id, value })
        let chain = textChainRef.current
        if (!chain || chain.entityId !== pendingEntity.id) {
            chain = { entityId: pendingEntity.id, version, latest: null, running: false }
            textChainRef.current = chain
        }
        chain.latest = value
        if (chain.running) return
        chain.running = true
        ;(async () => {
            while (chain.latest !== null) {
                const v = chain.latest
                chain.latest = null
                try {
                    const response = await setMarkText({ baseVersion: chain.version, entityId: chain.entityId, value: v })
                    chain.version = response.newVersion
                    setDoc(response.document)
                    setVersion(response.newVersion)
                    setError(null)
                } catch (err) {
                    handleOpError(err, 'Could not change that text.')
                    break
                }
            }
            chain.running = false
        })()
    }, [pendingEntity, version, handleOpError])

    const handleDuplicate = useCallback(async () => {
        if (!pendingEntity || busy) return
        setBusy(true)
        try {
            const response = await duplicateMark({ baseVersion: version, entity: pendingEntity, actorLabel, actorVisible })
            setDoc(response.document)
            setVersion(response.newVersion)
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not duplicate that mark.')
        } finally {
            setBusy(false)
        }
    }, [pendingEntity, version, busy, actorLabel, actorVisible, handleOpError])

    const handleDelete = useCallback(async () => {
        if (!doc || !pendingEntity || busy) return
        const entitySnapshot = pendingEntity
        // Deleting a permanent mark frees a permanence-pool slot as a side
        // effect (see deleteMark); undo re-creating the entity via a plain
        // placeMark wouldn't also restore that slot, leaving the pool's
        // claimed count out of sync with what's actually still marked
        // permanent. Simplest correct fix: undo isn't offered for these —
        // letting go of something you claimed forever isn't meant to be a
        // casual, undo-able action anyway.
        const wasPermanent = entitySnapshot.components?.permanence?.status === 'permanent'
        setBusy(true)
        try {
            const response = await deleteMark({ document: doc, baseVersion: version, entity: pendingEntity, actorLabel, actorVisible })
            setDoc(response.document)
            setVersion(response.newVersion)
            setSelectedEntityId(null)
            if (!wasPermanent) {
                pushUndo({ kind: 'delete', entityId: entitySnapshot.id, entitySnapshot })
            }
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not delete that mark.')
        } finally {
            setBusy(false)
        }
    }, [doc, pendingEntity, version, busy, actorLabel, actorVisible, handleOpError, pushUndo])

    // Admin mode's box-select, bulk version of handleDelete above — one
    // batched request instead of one per mark (see deleteMarks). Each
    // non-permanent deletion still gets its own undo entry, so Ctrl+Z steps
    // back through them one at a time rather than restoring the whole
    // group at once; permanent marks are excluded from undo for the same
    // pool-slot reason a single delete excludes them.
    const handleBulkDelete = useCallback(async () => {
        if (!doc || busy || marqueeSelectedEntities.length === 0) return
        setBusy(true)
        try {
            const response = await deleteMarks({ document: doc, baseVersion: version, entities: marqueeSelectedEntities, actorLabel, actorVisible })
            setDoc(response.document)
            setVersion(response.newVersion)
            for (const entity of marqueeSelectedEntities) {
                if (entity.components?.permanence?.status !== 'permanent') {
                    pushUndo({ kind: 'delete', entityId: entity.id, entitySnapshot: entity })
                }
            }
            setMarqueeSelectedIds([])
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not delete the selected marks.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, marqueeSelectedEntities, actorLabel, actorVisible, handleOpError, pushUndo])

    // Copy just remembers the reusable look-and-feel fields, device-locally
    // — not the placement/permanence state, same reasoning as duplicateMark.
    const handleCopy = useCallback(() => {
        if (!pendingEntity) return
        clipboardRef.current = {
            type: pendingEntity.type,
            color: pendingEntity.components.appearance?.color,
            opacity: pendingEntity.components.appearance?.opacity,
            scale: pendingEntity.components.transform?.scale,
            text: pendingEntity.components.text ? { ...pendingEntity.components.text } : null,
            mediaAssetId: pendingEntity.components.media?.assetId || null
        }
    }, [pendingEntity])

    // Paste places a brand-new mark (fresh id, fresh permanence — starts
    // drifting like any placement) at the current spawn position, using
    // whatever's on the clipboard. Unlike Duplicate, it doesn't need
    // anything currently selected, and can be repeated to place several
    // copies. Reuses the copied asset id directly (no re-upload) for
    // image/model marks, same as duplicateMark.
    const handlePaste = useCallback(async () => {
        if (!doc || busy || !clipboardRef.current) return
        setBusy(true)
        try {
            const clip = clipboardRef.current
            const position = getSpawnPosition()
            const entity = buildMarkEntity({ type: clip.type, position, actorLabel, actorVisible, assetId: clip.mediaAssetId })
            if (clip.color) entity.components.appearance.color = clip.color
            if (typeof clip.opacity === 'number') entity.components.appearance.opacity = clip.opacity
            if (clip.scale) entity.components.transform.scale = clip.scale
            if (clip.text) entity.components.text = { ...clip.text }
            const response = await placeMark({ baseVersion: version, entity })
            setDoc(response.document)
            setVersion(response.newVersion)
            await appendRitualLogEntry({ actorLabel, actorVisible, action: 'place', targetLabel: entity.name, detail: { entityId: entity.id } })
            setSelectedEntityId(entity.id)
            pushUndo({ kind: 'place', entityId: entity.id, entitySnapshot: entity })
            setError(null)
        } catch (err) {
            handleOpError(err, 'Could not paste that mark.')
        } finally {
            setBusy(false)
        }
    }, [doc, version, busy, actorLabel, actorVisible, handleOpError, getSpawnPosition, pushUndo])

    // Keyboard shortcuts — skipped entirely while typing in any field (name/
    // text/color/etc.), same guard Backspace already used, now shared by
    // all of them. Escape exits admin mode first if it's on, then closes
    // Advanced, then the main window. Backspace deletes the whole box
    // selection at once if one exists, else falls back to deleting whatever
    // single mark is open in the main window (today's behavior). Ctrl/Cmd+Z
    // undo, Ctrl/Cmd+Y or +Shift+Z redo, +C copy, +V paste, +D duplicate,
    // +Shift+A toggles admin mode (admins only — a non-admin pressing it
    // gets nothing).
    useEffect(() => {
        const handleKeyDown = (e) => {
            const target = e.target
            const isEditableTarget = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
            if (isEditableTarget) return

            if (e.key === 'Escape') {
                if (adminWorkspaceOpen) setAdminWorkspaceOpen(false)
                else if (advancedEntityId) setAdvancedEntityId(null)
                else if (selectedEntityId) setSelectedEntityId(null)
                return
            }
            if (e.key === 'Backspace' && marqueeSelectedIds.length > 0) {
                e.preventDefault()
                void handleBulkDelete()
                return
            }
            if (e.key === 'Backspace' && pendingEntity) {
                e.preventDefault()
                void handleDelete()
                return
            }

            const modifier = e.ctrlKey || e.metaKey
            if (!modifier) return
            if ((e.key === 'a' || e.key === 'A') && e.shiftKey && isAdmin) {
                e.preventDefault()
                setAdminWorkspaceOpen((open) => !open)
            } else if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
                e.preventDefault()
                void handleUndo()
            } else if ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
                e.preventDefault()
                void handleRedo()
            } else if ((e.key === 'c' || e.key === 'C') && pendingEntity) {
                e.preventDefault()
                handleCopy()
            } else if (e.key === 'v' || e.key === 'V') {
                e.preventDefault()
                void handlePaste()
            } else if ((e.key === 'd' || e.key === 'D') && pendingEntity) {
                e.preventDefault()
                void handleDuplicate()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [pendingEntity, selectedEntityId, advancedEntityId, adminWorkspaceOpen, isAdmin, marqueeSelectedIds, handleDelete, handleBulkDelete, handleUndo, handleRedo, handleCopy, handlePaste, handleDuplicate])

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

    if (!identity) {
        return <EntryGate onEnter={handleEnter} isAdmin={isAdmin} />
    }

    return (
        <div className={`ff-experience${isAdmin && adminWorkspaceOpen ? ' ff-experience--admin-mode' : ''}`}>
            <Suspense fallback={null}>
                <LiveProjectScene
                    ref={viewerRef}
                    projectId={FINITE_FOREVER_PROJECT_ID}
                    interactive
                    showChrome={false}
                    title="Finite Forever"
                    onEntityDoubleClick={handleSelectEntity}
                    enablePointerLock={false}
                    marqueeSelectEnabled={isAdmin && adminWorkspaceOpen}
                    onMarqueeSelect={setMarqueeSelectedIds}
                    selectedEntityIds={marqueeSelectedIds}
                />
            </Suspense>

            <div className="ff-overlay">
                <div className="ff-overlay__left">
                    <PoolHud pool={pool} />
                    <div className="ff-identity-chip">
                        <span>{actorLabel}{!actorVisible && ' (hidden)'}</span>
                        <button type="button" className="ff-identity-chip__switch" onClick={handleSwitchIdentity}>
                            Not you?
                        </button>
                    </div>
                </div>
                <div className="ff-overlay__actions">
                    <button type="button" className="ff-button ff-button--ghost" onClick={() => setLogOpen(true)}>
                        The ritual log
                    </button>
                    <AdvanceDriftControl visible={isAdmin} onAdvance={handleAdvanceDrift} busy={busy} />
                </div>
            </div>

            {!pendingEntity && (
                <div className="ff-overlay ff-overlay--bottom">
                    <PlacementPanel onPlace={handlePlace} onImportClick={() => setImportOpen(true)} disabled={busy || !doc} />
                </div>
            )}

            <ImportWindow
                open={importOpen}
                onClose={() => setImportOpen(false)}
                onImportFile={handleImportFile}
                busy={busy}
                error={importError}
            />

            {displayEntity && (
                <ClaimPrompt
                    entity={displayEntity}
                    pool={pool}
                    busy={busy}
                    onConfirm={handleConfirmClaim}
                    onDismiss={handleDismissClaim}
                    onRecolor={handleRecolor}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onRename={(name) => handleRename(pendingEntity, name)}
                    onNudge={handleNudge}
                    onAxisDragChange={handleAxisDragChange}
                    onScaleNudge={handleScaleNudge}
                    onScaleDragChange={handleScaleDragChange}
                    onRotationNudge={handleRotationNudge}
                    onRotationDragChange={handleRotationDragChange}
                    onOpacityChange={handleOpacityChange}
                    onTextChange={handleTextChange}
                    onOpenAdvanced={() => setAdvancedEntityId(pendingEntity.id)}
                    isAdmin={isAdmin}
                />
            )}

            {advancedEntity && (
                <AdvancedSettingsPanel
                    entity={advancedEntity}
                    isAdmin={isAdmin}
                    actorLabel={actorLabel}
                    busy={busy}
                    onClose={() => setAdvancedEntityId(null)}
                    onRename={(name) => handleRename(advancedEntity, name)}
                    onSavePage={handleSavePage}
                    onClearPage={handleClearPage}
                />
            )}

            {isAdmin && adminWorkspaceOpen && (
                <AdminModeOverlay selectedEntities={marqueeSelectedEntities} />
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
