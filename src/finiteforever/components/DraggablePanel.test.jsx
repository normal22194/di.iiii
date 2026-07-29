import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DraggablePanel from './DraggablePanel.jsx'

// jsdom has no window.matchMedia at all (not even returning a default) —
// every other test in this file relies on that absence making isTouch
// default to false (see DraggablePanel.jsx's `window.matchMedia?.(...)`).
// This mocks it just for the touch-specific test below.
const mockPointerType = (matches) => {
    window.matchMedia = vi.fn(() => ({ matches }))
}

afterEach(() => {
    delete window.matchMedia
})

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

    describe('on a touch device', () => {
        // X/Y repositioning makes no sense once CSS pins the panel to the
        // bottom edge (see the `(pointer: coarse)` block in
        // finiteForeverExperience.css) — the header drag is repurposed into
        // a vertical resize instead of being dropped entirely.
        it('opens smaller than the desktop default, with no left/top positioning', () => {
            mockPointerType(true)
            const originalHeight = window.innerHeight
            window.innerHeight = 1000

            const { container } = render(<DraggablePanel title="Edit mark"><p>body</p></DraggablePanel>)
            const panel = container.querySelector('.ff-draggable')

            expect(panel.style.left).toBe('')
            expect(panel.style.top).toBe('')
            expect(panel.style.height).toBe('420px') // 42% of 1000

            window.innerHeight = originalHeight
        })

        it('dragging the header up makes the sheet taller', () => {
            mockPointerType(true)
            const originalHeight = window.innerHeight
            window.innerHeight = 1000

            const { container } = render(<DraggablePanel title="Edit mark"><p>body</p></DraggablePanel>)
            const panel = container.querySelector('.ff-draggable')
            const header = container.querySelector('.ff-draggable__header')
            header.setPointerCapture = vi.fn()
            Object.defineProperty(panel, 'getBoundingClientRect', { value: () => ({ height: 420 }), configurable: true })

            fireEvent.pointerDown(header, { clientY: 500, pointerId: 1 })
            fireEvent.pointerMove(header, { clientY: 400, pointerId: 1 }) // dragged up 100px

            expect(panel.style.height).toBe('520px')

            window.innerHeight = originalHeight
        })

        it('dragging the header down makes the sheet shorter, clamped to a minimum', () => {
            mockPointerType(true)
            const originalHeight = window.innerHeight
            window.innerHeight = 1000

            const { container } = render(<DraggablePanel title="Edit mark"><p>body</p></DraggablePanel>)
            const panel = container.querySelector('.ff-draggable')
            const header = container.querySelector('.ff-draggable__header')
            header.setPointerCapture = vi.fn()
            Object.defineProperty(panel, 'getBoundingClientRect', { value: () => ({ height: 420 }), configurable: true })

            fireEvent.pointerDown(header, { clientY: 500, pointerId: 1 })
            fireEvent.pointerMove(header, { clientY: 5000, pointerId: 1 }) // dragged far down

            expect(panel.style.height).toBe('220px') // clamped at 22% of 1000

            window.innerHeight = originalHeight
        })
    })
})
