import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EntryGate from './EntryGate.jsx'

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
})
