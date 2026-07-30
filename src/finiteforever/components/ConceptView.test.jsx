import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
})
