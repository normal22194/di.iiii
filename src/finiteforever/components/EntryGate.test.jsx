import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EntryGate from './EntryGate.jsx'

afterEach(() => {
    delete window.matchMedia
})

describe('EntryGate', () => {
    it('requires a non-empty, trimmed name before entering', () => {
        const onEnter = vi.fn()
        render(<EntryGate onEnter={onEnter} isAdmin={false} />)

        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
        expect(onEnter).not.toHaveBeenCalled()

        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
        expect(onEnter).not.toHaveBeenCalled()

        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: '  nooo  ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))
        expect(onEnter).toHaveBeenCalledWith({ username: 'nooo', visible: true })
    })

    it('defaults to visible and lets a non-admin opt into hidden', () => {
        const onEnter = vi.fn()
        render(<EntryGate onEnter={onEnter} isAdmin={false} />)

        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'nooo' } })
        fireEvent.click(screen.getByLabelText('Hidden from others'))
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

        expect(onEnter).toHaveBeenCalledWith({ username: 'nooo', visible: false })
        expect(screen.getByText(/an anonymous visitor/)).toBeInTheDocument()
    })

    it('forces visible=true for admins and hides the visibility choice entirely', () => {
        const onEnter = vi.fn()
        render(<EntryGate onEnter={onEnter} isAdmin />)

        expect(screen.queryByLabelText('Hidden from others')).not.toBeInTheDocument()
        expect(screen.getByText(/Signed in as admin/)).toBeInTheDocument()

        fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'nooo' } })
        fireEvent.click(screen.getByRole('button', { name: 'Enter' }))

        expect(onEnter).toHaveBeenCalledWith({ username: 'nooo', visible: true })
    })

    // Auto-focusing on a phone pops the on-screen keyboard immediately,
    // covering half the card before the visitor's read it — skipped there,
    // kept for desktop (mouse/keyboard) visitors landing straight in the field.
    it('does not auto-focus the name field on a touch device', () => {
        window.matchMedia = vi.fn(() => ({ matches: true }))
        render(<EntryGate onEnter={vi.fn()} isAdmin={false} />)
        expect(screen.getByPlaceholderText('Your name')).not.toHaveFocus()
    })

    it('auto-focuses the name field on desktop', () => {
        window.matchMedia = vi.fn(() => ({ matches: false }))
        render(<EntryGate onEnter={vi.fn()} isAdmin={false} />)
        expect(screen.getByPlaceholderText('Your name')).toHaveFocus()
    })
})
