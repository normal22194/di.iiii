import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DrawingCanvas from './DrawingCanvas.jsx'

// jsdom has no real <canvas> 2D implementation — stub just enough of the
// context surface for DrawingCanvas's calls to run without throwing, and
// spy on them to assert what the component actually asked the canvas to do.
function makeFakeContext() {
    return {
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        drawImage: vi.fn()
    }
}

let fakeContext
let originalImage

beforeEach(() => {
    fakeContext = makeFakeContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext)
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 256, height: 256 })
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
    HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['fake'], { type: 'image/png' })))

    // Synchronous fake Image so onload fires immediately instead of relying
    // on jsdom's (nonexistent) real image decoding.
    originalImage = window.Image
    window.Image = class {
        set src(_value) { this.onload?.() }
    }
    window.URL.createObjectURL = vi.fn(() => 'blob:fake')
    window.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
    vi.restoreAllMocks()
    window.Image = originalImage
})

describe('DrawingCanvas', () => {
    it('draws a dot on pointerdown and a stroke on pointermove', () => {
        const { container } = render(<DrawingCanvas onSave={vi.fn()} />)
        const canvas = container.querySelector('.ff-drawing__canvas')

        fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
        expect(fakeContext.arc).toHaveBeenCalled()
        expect(fakeContext.fill).toHaveBeenCalled()

        fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 })
        expect(fakeContext.lineTo).toHaveBeenCalled()
        expect(fakeContext.stroke).toHaveBeenCalled()
    })

    it('does not draw on pointermove before any pointerdown', () => {
        const { container } = render(<DrawingCanvas onSave={vi.fn()} />)
        const canvas = container.querySelector('.ff-drawing__canvas')
        fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 })
        expect(fakeContext.stroke).not.toHaveBeenCalled()
    })

    it('Save now is disabled until something has actually changed', () => {
        const onSave = vi.fn()
        const { container } = render(<DrawingCanvas onSave={onSave} />)
        expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled()

        const canvas = container.querySelector('.ff-drawing__canvas')
        fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
        expect(screen.getByRole('button', { name: 'Save now' })).not.toBeDisabled()

        fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
        expect(onSave).toHaveBeenCalledWith(expect.any(Blob))
    })

    it('Clear fills the canvas white (not just transparent) and calls onClear directly — not onSave, not auto-save', () => {
        const onSave = vi.fn()
        const onClear = vi.fn()
        render(<DrawingCanvas onSave={onSave} onClear={onClear} />)
        fakeContext.fillRect.mockClear()
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

        expect(fakeContext.fillRect).toHaveBeenCalled()
        expect(fakeContext.fillStyle).toBe('#ffffff')
        expect(onClear).toHaveBeenCalledTimes(1)
        expect(onSave).not.toHaveBeenCalled()
        // Nothing pending to save after a clear (it already reverted directly).
        expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled()
    })

    it('Clear cancels a pending auto-save so a stroke right before it does not upload afterward', () => {
        vi.useFakeTimers()
        const onSave = vi.fn()
        const { container } = render(<DrawingCanvas onSave={onSave} onClear={vi.fn()} />)
        const canvas = container.querySelector('.ff-drawing__canvas')

        fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
        fireEvent.pointerUp(canvas, { pointerId: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

        vi.advanceTimersByTime(2000)
        expect(onSave).not.toHaveBeenCalled()
        vi.useRealTimers()
    })

    it('adding an image draws it onto the canvas as the top layer', () => {
        render(<DrawingCanvas onSave={vi.fn()} />)
        const file = new File(['x'], 'photo.png', { type: 'image/png' })
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [file] } })
        expect(fakeContext.drawImage).toHaveBeenCalled()
    })

    it('fills the canvas white on mount, even with nothing drawn yet — a raw clearRect would leave it transparent, which reads as black once uploaded as a texture', () => {
        render(<DrawingCanvas onSave={vi.fn()} />)
        expect(fakeContext.fillRect).toHaveBeenCalledWith(0, 0, 256, 256)
        expect(fakeContext.fillStyle).toBe('#ffffff')
    })

    it('restores a previously saved page from initialImageUrl without marking it dirty', () => {
        render(<DrawingCanvas initialImageUrl="https://example.com/page.png" onSave={vi.fn()} />)
        expect(fakeContext.drawImage).toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled()
    })

    it('disables all controls while busy', () => {
        render(<DrawingCanvas onSave={vi.fn()} busy />)
        expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Save now' })).toBeDisabled()
    })

    describe('auto-save (real-time feel)', () => {
        beforeEach(() => { vi.useFakeTimers() })
        afterEach(() => { vi.useRealTimers() })

        it('auto-saves shortly after a stroke ends, without clicking Save now', () => {
            const onSave = vi.fn()
            const { container } = render(<DrawingCanvas onSave={onSave} />)
            const canvas = container.querySelector('.ff-drawing__canvas')

            fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
            fireEvent.pointerUp(canvas, { pointerId: 1 })
            expect(onSave).not.toHaveBeenCalled()

            vi.advanceTimersByTime(900)
            expect(onSave).toHaveBeenCalledTimes(1)
        })

        it('does not auto-save on a pointerup that never started a stroke', () => {
            const onSave = vi.fn()
            const { container } = render(<DrawingCanvas onSave={onSave} />)
            const canvas = container.querySelector('.ff-drawing__canvas')
            fireEvent.pointerUp(canvas, { pointerId: 1 })
            vi.advanceTimersByTime(2000)
            expect(onSave).not.toHaveBeenCalled()
        })

        it('debounces rapid successive strokes into a single auto-save', () => {
            const onSave = vi.fn()
            const { container } = render(<DrawingCanvas onSave={onSave} />)
            const canvas = container.querySelector('.ff-drawing__canvas')

            fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
            fireEvent.pointerUp(canvas, { pointerId: 1 })
            vi.advanceTimersByTime(500)
            fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 20, pointerId: 1 })
            fireEvent.pointerUp(canvas, { pointerId: 1 })
            vi.advanceTimersByTime(500)
            expect(onSave).not.toHaveBeenCalled()

            vi.advanceTimersByTime(500)
            expect(onSave).toHaveBeenCalledTimes(1)
        })

        it('does not fire the auto-save while a save is already in flight (busy)', () => {
            const onSave = vi.fn()
            const { container, rerender } = render(<DrawingCanvas onSave={onSave} busy={false} />)
            const canvas = container.querySelector('.ff-drawing__canvas')
            fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
            fireEvent.pointerUp(canvas, { pointerId: 1 })

            rerender(<DrawingCanvas onSave={onSave} busy />)
            vi.advanceTimersByTime(900)
            expect(onSave).not.toHaveBeenCalled()
        })

        it('clicking Save now cancels a pending auto-save instead of firing twice', () => {
            const onSave = vi.fn()
            const { container } = render(<DrawingCanvas onSave={onSave} />)
            const canvas = container.querySelector('.ff-drawing__canvas')
            fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10, pointerId: 1 })
            fireEvent.pointerUp(canvas, { pointerId: 1 })

            fireEvent.click(screen.getByRole('button', { name: 'Save now' }))
            expect(onSave).toHaveBeenCalledTimes(1)

            vi.advanceTimersByTime(2000)
            expect(onSave).toHaveBeenCalledTimes(1)
        })
    })
})
