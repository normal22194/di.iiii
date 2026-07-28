import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CollapsibleSection from './CollapsibleSection.jsx'

describe('CollapsibleSection', () => {
    it('is collapsed by default and hides its children', () => {
        render(<CollapsibleSection title="Move"><span>child content</span></CollapsibleSection>)
        expect(screen.getByRole('button', { name: /Move/ })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('child content')).not.toBeInTheDocument()
    })

    it('honors defaultOpen', () => {
        render(<CollapsibleSection title="Scale" defaultOpen><span>child content</span></CollapsibleSection>)
        expect(screen.getByText('child content')).toBeInTheDocument()
    })

    it('toggles open/closed on click', () => {
        render(<CollapsibleSection title="Rotate"><span>child content</span></CollapsibleSection>)
        const toggle = screen.getByRole('button', { name: /Rotate/ })

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('child content')).toBeInTheDocument()

        fireEvent.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('child content')).not.toBeInTheDocument()
    })
})
