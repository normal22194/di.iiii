import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConceptView from './ConceptView.jsx'

describe('ConceptView', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<ConceptView open={false} onClose={vi.fn()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('shows written text when open', () => {
        render(<ConceptView open onClose={vi.fn()} />)
        expect(screen.getByText('The concept')).toBeInTheDocument()
        expect(screen.getByText(/Finite Forever is a shared space/)).toBeInTheDocument()
    })

    it('clicking outside the panel closes it', () => {
        const onClose = vi.fn()
        render(<ConceptView open onClose={onClose} />)
        fireEvent.pointerDown(document.body)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('clicking inside the panel does not close it', () => {
        const onClose = vi.fn()
        render(<ConceptView open onClose={onClose} />)
        fireEvent.pointerDown(screen.getByText('The concept'))
        expect(onClose).not.toHaveBeenCalled()
    })

    it('the Close button also closes it', () => {
        const onClose = vi.fn()
        render(<ConceptView open onClose={onClose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    describe('opening fade', () => {
        beforeEach(() => { vi.useFakeTimers() })
        afterEach(() => { vi.useRealTimers() })

        it('mounts with an entering class so it starts transparent instead of appearing instantly', () => {
            const { container } = render(<ConceptView open onClose={vi.fn()} />)
            expect(container.querySelector('.ff-concept--entering')).not.toBeNull()
        })

        it('drops the entering class shortly after mounting, letting the fade-in play', () => {
            const { container } = render(<ConceptView open onClose={vi.fn()} />)
            act(() => { vi.advanceTimersByTime(20) })
            expect(container.querySelector('.ff-concept--entering')).toBeNull()
        })

        it('reopening after a close fades back in from transparent again', () => {
            const { container, rerender } = render(<ConceptView open onClose={vi.fn()} />)
            act(() => { vi.advanceTimersByTime(20) })
            rerender(<ConceptView open={false} onClose={vi.fn()} />)
            act(() => { vi.advanceTimersByTime(300) })
            rerender(<ConceptView open onClose={vi.fn()} />)

            expect(container.querySelector('.ff-concept--entering')).not.toBeNull()
        })
    })

    describe('closing fade', () => {
        beforeEach(() => { vi.useFakeTimers() })
        afterEach(() => { vi.useRealTimers() })

        it('stays mounted with a closing class for a brief fade after `open` goes false, instead of unmounting instantly', () => {
            const { rerender, container } = render(<ConceptView open onClose={vi.fn()} />)
            rerender(<ConceptView open={false} onClose={vi.fn()} />)

            expect(screen.getByText('The concept')).toBeInTheDocument()
            expect(container.querySelector('.ff-concept--closing')).not.toBeNull()
        })

        it('actually unmounts once the fade duration elapses', () => {
            const { rerender } = render(<ConceptView open onClose={vi.fn()} />)
            rerender(<ConceptView open={false} onClose={vi.fn()} />)

            act(() => { vi.advanceTimersByTime(300) })
            expect(screen.queryByText('The concept')).not.toBeInTheDocument()
        })

        it('reopening mid-fade cancels the pending unmount and drops the closing class', () => {
            const { rerender, container } = render(<ConceptView open onClose={vi.fn()} />)
            rerender(<ConceptView open={false} onClose={vi.fn()} />)
            rerender(<ConceptView open onClose={vi.fn()} />)

            expect(container.querySelector('.ff-concept--closing')).toBeNull()
            act(() => { vi.advanceTimersByTime(300) })
            expect(screen.getByText('The concept')).toBeInTheDocument()
        })
    })
})
