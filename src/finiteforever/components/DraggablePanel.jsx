import { useCallback, useEffect, useRef, useState } from 'react'

// A floating panel you can drag by its header and resize via the native
// browser resize handle (bottom-right corner) — used to make the mark edit
// menu (ClaimPrompt) repositionable/resizable instead of pinned to center.
// Optionally closes itself when you click/tap anywhere outside it.
export default function DraggablePanel({ title = '', className = '', children, onClickOutside = null, ...rest }) {
    const panelRef = useRef(null)
    // null = not yet dragged, use the default CSS-centered placement.
    const [pos, setPos] = useState(null)
    const dragRef = useRef(null)

    useEffect(() => {
        if (!onClickOutside) return undefined
        // pointerdown (not click) so this fires before any drag/press logic
        // elsewhere reacts, and mirrors the header's own pointerdown-based drag.
        const handlePointerDown = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                onClickOutside()
            }
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [onClickOutside])

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
        const nextLeft = Math.min(Math.max(0, startLeft + (e.clientX - startX)), window.innerWidth - width)
        const nextTop = Math.min(Math.max(0, startTop + (e.clientY - startY)), window.innerHeight - height)
        setPos({ left: nextLeft, top: nextTop })
    }, [])

    const onHeaderPointerUp = useCallback((e) => {
        dragRef.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }, [])

    const style = pos ? { left: pos.left, top: pos.top, transform: 'none' } : undefined

    return (
        <div ref={panelRef} className={`ff-draggable ${className}`} style={style} {...rest}>
            <div
                className="ff-draggable__header"
                onPointerDown={onHeaderPointerDown}
                onPointerMove={onHeaderPointerMove}
                onPointerUp={onHeaderPointerUp}
            >
                <span className="ff-draggable__grip" aria-hidden="true">⠿⠿⠿</span>
                {title && <span className="ff-draggable__title">{title}</span>}
            </div>
            <div className="ff-draggable__body">
                {children}
            </div>
        </div>
    )
}
