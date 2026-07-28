import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Remembers where the panel was left (position + size) across close/reopen —
// module-level (not component state) since the panel fully unmounts every
// time it's dismissed. Resets on a full page reload, which is expected.
let lastGeometry = null

// A floating panel you can drag by its header and resize via the native
// browser resize handle (bottom-right corner) — used to make the mark edit
// menu (ClaimPrompt) repositionable/resizable instead of pinned to center.
// Optionally closes itself when you click/tap anywhere outside it, or via
// its own header close button.
export default function DraggablePanel({ title = '', className = '', children, onClickOutside = null, onClose = null, ...rest }) {
    const panelRef = useRef(null)
    // null = not yet dragged this session, use the default CSS-centered placement.
    const [pos, setPos] = useState(() => (lastGeometry ? { left: lastGeometry.left, top: lastGeometry.top } : null))
    const dragRef = useRef(null)

    // Apply the remembered size before first paint so it doesn't flash at the
    // default size and then jump.
    useLayoutEffect(() => {
        const panel = panelRef.current
        if (panel && lastGeometry?.width && lastGeometry?.height) {
            panel.style.width = `${lastGeometry.width}px`
            panel.style.height = `${lastGeometry.height}px`
        }
    }, [])

    // Native CSS `resize: both` doesn't fire a DOM event — a ResizeObserver
    // is the only way to notice a drag on the corner handle.
    useEffect(() => {
        const panel = panelRef.current
        if (!panel || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return
            const { width, height } = entry.contentRect
            lastGeometry = { ...(lastGeometry || {}), width, height }
        })
        observer.observe(panel)
        return () => observer.disconnect()
    }, [])

    const onHeaderPointerDown = useCallback((e) => {
        if (e.button !== 0) return
        const panel = panelRef.current
        if (!panel) return
        const rect = panel.getBoundingClientRect()
        dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top }
        e.currentTarget.setPointerCapture(e.pointerId)
    }, [])

    const onHeaderPointerMove = useCallback((e) => {
        if (!dragRef.current) return
        const { startX, startY, startLeft, startTop } = dragRef.current
        const panel = panelRef.current
        const width = panel?.offsetWidth || 0
        const height = panel?.offsetHeight || 0
        // Upper bound floored at 0: a panel taller/wider than the viewport
        // (e.g. Advanced with its drawing canvas — DevTools open easily
        // eats enough height to trigger this) would otherwise make
        // `window.innerHeight - height` negative, and Math.min against a
        // negative number drags the panel to a negative top/left — off the
        // top/left edge of the screen instead of pinned at it.
        const nextLeft = Math.min(Math.max(0, startLeft + (e.clientX - startX)), Math.max(0, window.innerWidth - width))
        const nextTop = Math.min(Math.max(0, startTop + (e.clientY - startY)), Math.max(0, window.innerHeight - height))
        setPos({ left: nextLeft, top: nextTop })
        lastGeometry = { ...(lastGeometry || {}), left: nextLeft, top: nextTop }
    }, [])

    const onHeaderPointerUp = useCallback((e) => {
        dragRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }, [])

    useEffect(() => {
        if (!onClickOutside) return undefined
        // pointerdown (not click) so this fires before any drag/press logic
        // elsewhere reacts, and mirrors the header's own pointerdown-based drag.
        const handlePointerDown = (e) => {
            if (!panelRef.current || panelRef.current.contains(e.target)) return
            // A click inside a *different* floating panel (e.g. clicking
            // around in the Advanced window while the main edit window is
            // also open) isn't a click "outside" for dismissal purposes —
            // without this, opening Advanced and clicking anything in it
            // dismissed the main panel, which also unmounts Advanced (its
            // own render condition depends on the main panel staying open).
            if (e.target.closest?.('.ff-draggable')) return
            onClickOutside()
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [onClickOutside])

    const style = pos ? { left: pos.left, top: pos.top, transform: 'none' } : undefined

    return (
        <div ref={panelRef} className={`ff-draggable ${className}`} style={style} {...rest}>
            <div
                className="ff-draggable__header"
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
            >
                <span className="ff-draggable__header-main">
                    <span className="ff-draggable__grip" aria-hidden="true">⠿⠿⠿</span>
                    {title && <span className="ff-draggable__title">{title}</span>}
                </span>
                {onClose && (
                    <button
                        type="button"
                        className="ff-draggable__close"
                        // Without this, the pointerdown bubbles up to the
                        // header's own onPointerDown first (drag start +
                        // setPointerCapture on the header), which swallows
                        // the click before it ever reaches onClose below —
                        // the header must not see this as a drag gesture.
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                    >
                        ✕
                    </button>
                )}
            </div>
            <div className="ff-draggable__body">
                {children}
            </div>
        </div>
    )
}
