import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DraggablePanel from './DraggablePanel.jsx'

describe('DraggablePanel', () => {
    it('renders a title and its children', () => {
        render(<DraggablePanel title="Edit mark"><p>body content</p></DraggablePanel>)
        expect(screen.getByText('Edit mark')).toBeInTheDocument()
        expect(screen.getByText('body content')).toBeInTheDocument()
    })

    it('calls onClose from the header close button', () => {
        const onClose = vi.fn()
        render(<DraggablePanel title="Edit mark" onClose={onClose}><p>body</p></DraggablePanel>)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    // Regression: the close button lives inside the header, which has its
    // own onPointerDown for dragging the panel. A real click starts with a
    // pointerdown that bubbles up to the header before the click fires — if
    // that pointerdown isn't stopped, the header treats it as a drag start
    // and the click never reaches onClose.
    it('still closes when the click starts as a pointerdown that bubbles through the draggable header', () => {
        const onClose = vi.fn()
        const { container } = render(<DraggablePanel title="Edit mark" onClose={onClose}><p>body</p></DraggablePanel>)
        const closeButton = screen.getByRole('button', { name: 'Close' })
        closeButton.setPointerCapture = vi.fn()
        container.querySelector('.ff-draggable__header').setPointerCapture = vi.fn()

        fireEvent.pointerDown(closeButton, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
        fireEvent.click(closeButton)

        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('omits the close button when onClose is not provided', () => {
        render(<DraggablePanel title="Edit mark"><p>body</p></DraggablePanel>)
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    })

    it('calls onClickOutside when a pointerdown lands outside the panel', () => {
        const onClickOutside = vi.fn()
        render(
            <div>
                <DraggablePanel title="Edit mark" onClickOutside={onClickOutside}><p>body</p></DraggablePanel>
                <button type="button">elsewhere</button>
            </div>
        )
        fireEvent.pointerDown(screen.getByText('elsewhere'))
        expect(onClickOutside).toHaveBeenCalledTimes(1)
    })

    it('does not call onClickOutside for a pointerdown inside the panel', () => {
        const onClickOutside = vi.fn()
        render(<DraggablePanel title="Edit mark" onClickOutside={onClickOutside}><p>body content</p></DraggablePanel>)
        fireEvent.pointerDown(screen.getByText('body content'))
        expect(onClickOutside).not.toHaveBeenCalled()
    })

    // Regression: with two DraggablePanels open at once (the main edit
    // window + its Advanced window), a click inside Advanced is "outside"
    // the main panel's own DOM subtree — without this exemption, clicking
    // anywhere in Advanced dismissed the main panel (and Advanced along
    // with it, since it only renders while the main panel is open).
    it('does not call onClickOutside for a pointerdown inside a different open DraggablePanel', () => {
        const onClickOutsideA = vi.fn()
        const onClickOutsideB = vi.fn()
        render(
            <div>
                <DraggablePanel title="Edit mark" onClickOutside={onClickOutsideA}><p>main content</p></DraggablePanel>
                <DraggablePanel title="Advanced" onClickOutside={onClickOutsideB}><p>advanced content</p></DraggablePanel>
            </div>
        )
        fireEvent.pointerDown(screen.getByText('advanced content'))
        expect(onClickOutsideA).not.toHaveBeenCalled()

        fireEvent.pointerDown(screen.getByText('main content'))
        expect(onClickOutsideB).not.toHaveBeenCalled()
    })

    it('still calls onClickOutside for a genuinely outside click even with another panel open', () => {
        const onClickOutsideA = vi.fn()
        render(
            <div>
                <DraggablePanel title="Edit mark" onClickOutside={onClickOutsideA}><p>main content</p></DraggablePanel>
                <DraggablePanel title="Advanced"><p>advanced content</p></DraggablePanel>
                <button type="button">elsewhere</button>
            </div>
        )
        fireEvent.pointerDown(screen.getByText('elsewhere'))
        expect(onClickOutsideA).toHaveBeenCalledTimes(1)
    })

    // Regression: a panel taller/wider than the viewport (e.g. Advanced with
    // its drawing canvas, especially with DevTools eating screen height)
    // used to compute a negative clamp bound (viewport size minus panel
    // size), dragging the panel to a negative top/left — off the edge of
    // the screen — instead of pinning it at the edge.
    it('clamps the drag position at the edge (0) instead of negative when the panel is bigger than the viewport', () => {
        const originalWidth = window.innerWidth
        const originalHeight = window.innerHeight
        window.innerWidth = 400
        window.innerHeight = 300

        const { container } = render(<DraggablePanel title="Advanced"><p>tall content</p></DraggablePanel>)
        const panel = container.querySelector('.ff-draggable')
        const header = container.querySelector('.ff-draggable__header')
        header.setPointerCapture = vi.fn()
        Object.defineProperty(panel, 'getBoundingClientRect', { value: () => ({ left: 50, top: 50 }), configurable: true })
        Object.defineProperty(panel, 'offsetWidth', { value: 600, configurable: true })
        Object.defineProperty(panel, 'offsetHeight', { value: 500, configurable: true })

        fireEvent.pointerDown(header, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(header, { clientX: 0, clientY: 0, pointerId: 1 })

        expect(panel.style.left).toBe('0px')
        expect(panel.style.top).toBe('0px')

        window.innerWidth = originalWidth
        window.innerHeight = originalHeight
    })
})
