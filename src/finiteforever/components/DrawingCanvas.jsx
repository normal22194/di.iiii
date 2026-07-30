import { useCallback, useEffect, useRef, useState } from 'react'

const CANVAS_SIZE = 256
const DEFAULT_COLOR = '#e8ecf1'
const DEFAULT_BRUSH = 6
// How long to wait after the last stroke/change before auto-saving — long
// enough that a single continuous stroke doesn't trigger a save mid-draw,
// short enough that it reads as "live" to the person drawing and to anyone
// else watching the object.
const AUTO_SAVE_DELAY_MS = 900

// A flat raster canvas, not true z-ordered layers: "add image" draws the
// picture directly onto whatever's already there (so it visually sits on
// top of existing strokes, as requested), but drawing again afterward then
// draws over the image in turn, same as any single-canvas paint tool.
// Keeping it flat is what lets a page collapse to one uploaded PNG (see
// permanence.js's savePage) instead of needing real multi-layer compositing
// in the 3D renderer.
export default function DrawingCanvas({ initialImageUrl, onSave, onClear, busy }) {
    const canvasRef = useRef(null)
    const drawingRef = useRef(null)
    const [color, setColor] = useState(DEFAULT_COLOR)
    const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH)
    const [dirty, setDirty] = useState(false)

    const getContext = useCallback(() => canvasRef.current?.getContext('2d') || null, [])

    // The canvas must always be fully opaque, never transparent — the 3D
    // material this gets uploaded as a texture onto isn't alpha-blended
    // (see permanence.js's clearPage/saveShapeTexture comments), so any
    // pixel left transparent reads as solid black on the mesh instead of
    // showing through. Filling white first (instead of clearRect, which
    // leaves fully transparent pixels) means even a single drawn dot
    // exports as a true white-background PNG, not a black-background one.
    const fillWhite = useCallback((ctx) => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    }, [])

    // A save already in flight (busy) blocks a *new* one from firing when
    // the debounce timer lands — read via ref since the timeout callback
    // runs outside React's render cycle and would otherwise close over a
    // stale busy value from whenever scheduleAutoSave was called.
    const busyRef = useRef(busy)
    useEffect(() => { busyRef.current = busy }, [busy])

    const saveNow = useCallback(() => {
        canvasRef.current?.toBlob((blob) => {
            if (blob) onSave(blob)
        }, 'image/png')
    }, [onSave])

    const autoSaveTimerRef = useRef(null)
    const scheduleAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null
            if (!busyRef.current) saveNow()
        }, AUTO_SAVE_DELAY_MS)
    }, [saveNow])

    useEffect(() => () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }, [])

    // Restores whatever was last saved for this page (a flattened composite,
    // per the note above) so reopening a page continues from it instead of
    // starting blank every time.
    useEffect(() => {
        const ctx = getContext()
        if (!ctx) return
        fillWhite(ctx)
        setDirty(false)
        if (!initialImageUrl) return
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
        img.src = initialImageUrl
    }, [initialImageUrl, getContext, fillWhite])

    const pointFromEvent = (e) => {
        const rect = canvasRef.current.getBoundingClientRect()
        return [
            ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
            ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE
        ]
    }

    const startStroke = (e) => {
        if (busy || e.button !== 0) return
        const ctx = getContext()
        if (!ctx) return
        try { canvasRef.current.setPointerCapture(e.pointerId) } catch { /* not supported, drawing still works */ }
        const [x, y] = pointFromEvent(e)
        drawingRef.current = { x, y }
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
        ctx.fill()
        setDirty(true)
    }

    const continueStroke = (e) => {
        if (!drawingRef.current) return
        const ctx = getContext()
        if (!ctx) return
        const [x, y] = pointFromEvent(e)
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(drawingRef.current.x, drawingRef.current.y)
        ctx.lineTo(x, y)
        ctx.stroke()
        drawingRef.current = { x, y }
    }

    // Only schedule if an actual stroke happened — pointerup/pointerleave
    // fire on every release, including ones that never started a stroke.
    const endStroke = () => {
        if (drawingRef.current) scheduleAutoSave()
        drawingRef.current = null
    }

    // A direct "go back to blank" action, not a stroke — goes straight to
    // onClear (permanence.js's clearPage: assetId → null, no upload) rather
    // than through the draw/auto-save pipeline. An uploaded transparent PNG
    // would still be a real texture, rendering as solid black on the box's
    // non-transparent material instead of falling back to its plain color.
    const handleClear = () => {
        const ctx = getContext()
        if (!ctx) return
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current)
            autoSaveTimerRef.current = null
        }
        fillWhite(ctx)
        setDirty(false)
        onClear()
    }

    const handleAddImage = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        const ctx = getContext()
        if (!ctx) return
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
            ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
            URL.revokeObjectURL(url)
            setDirty(true)
            scheduleAutoSave()
        }
        img.src = url
    }

    // Explicit "save right now" — also cancels any pending auto-save so it
    // doesn't redundantly fire again a moment later.
    const handleSaveClick = () => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current)
            autoSaveTimerRef.current = null
        }
        saveNow()
    }

    return (
        <div className="ff-drawing">
            <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="ff-drawing__canvas"
                onPointerDown={startStroke}
                onPointerMove={continueStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
            />
            <div className="ff-drawing__tools">
                <label className="ff-drawing__color">
                    <span>Color</span>
                    <input type="color" value={color} disabled={busy} onChange={(e) => setColor(e.target.value)} />
                </label>
                <label className="ff-drawing__brush">
                    <span>Brush</span>
                    <input
                        type="range"
                        min={1}
                        max={24}
                        value={brushSize}
                        disabled={busy}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                    />
                </label>
                <label className="ff-button ff-button--ghost ff-drawing__add-image">
                    Add image
                    <input type="file" accept="image/*" disabled={busy} onChange={handleAddImage} hidden />
                </label>
                <button type="button" className="ff-button ff-button--ghost" disabled={busy} onClick={handleClear}>
                    Clear
                </button>
                <button type="button" className="ff-button ff-button--primary" disabled={busy || !dirty} onClick={handleSaveClick}>
                    Save now
                </button>
            </div>
            <p className="ff-drawing__hint">Saves automatically shortly after you stop drawing.</p>
        </div>
    )
}
