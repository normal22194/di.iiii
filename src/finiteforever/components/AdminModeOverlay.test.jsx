import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminModeOverlay from './AdminModeOverlay.jsx'

describe('AdminModeOverlay', () => {
    it('renders the mode badge and the box-select hint', () => {
        render(<AdminModeOverlay />)
        expect(screen.getByText('Admin mode')).toBeInTheDocument()
        expect(screen.getByText('Right-click and drag to box-select marks.')).toBeInTheDocument()
    })

    it('is not a window: no close button, no dialog role', () => {
        render(<AdminModeOverlay />)
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows "Nothing selected" when the selection is empty', () => {
        render(<AdminModeOverlay selectedEntities={[]} />)
        expect(screen.getByText('Nothing selected.')).toBeInTheDocument()
    })

    it('lists selected entities by name with a count, and hints at bulk-delete', () => {
        const selectedEntities = [
            { id: 'mark-1', name: 'Box mark' },
            { id: 'mark-2', name: 'Sphere mark' }
        ]
        render(<AdminModeOverlay selectedEntities={selectedEntities} />)
        expect(screen.getByText('2 selected')).toBeInTheDocument()
        expect(screen.getByText('Box mark')).toBeInTheDocument()
        expect(screen.getByText('Sphere mark')).toBeInTheDocument()
        expect(screen.queryByText('Nothing selected.')).not.toBeInTheDocument()
        expect(screen.getByText('Backspace deletes all of these at once.')).toBeInTheDocument()
    })

    it('does not show the bulk-delete hint when nothing is selected', () => {
        render(<AdminModeOverlay selectedEntities={[]} />)
        expect(screen.queryByText('Backspace deletes all of these at once.')).not.toBeInTheDocument()
    })

    it('falls back to the entity id when it has no name', () => {
        render(<AdminModeOverlay selectedEntities={[{ id: 'mark-9' }]} />)
        expect(screen.getByText('mark-9')).toBeInTheDocument()
    })

    it('shows a "Make all permanent" button only when something is selected, and calls onMakePermanent', () => {
        const onMakePermanent = vi.fn()
        const { rerender } = render(<AdminModeOverlay selectedEntities={[]} onMakePermanent={onMakePermanent} />)
        expect(screen.queryByRole('button', { name: 'Make all permanent' })).not.toBeInTheDocument()

        rerender(<AdminModeOverlay selectedEntities={[{ id: 'mark-1', name: 'Box mark' }]} onMakePermanent={onMakePermanent} />)
        fireEvent.click(screen.getByRole('button', { name: 'Make all permanent' }))
        expect(onMakePermanent).toHaveBeenCalledTimes(1)
    })

    it('disables the "Make all permanent" button while busy', () => {
        render(<AdminModeOverlay selectedEntities={[{ id: 'mark-1', name: 'Box mark' }]} busy />)
        expect(screen.getByRole('button', { name: 'Make all permanent' })).toBeDisabled()
    })

    it('shows a "Leave" button only when something is selected, and calls onLeave', () => {
        const onLeave = vi.fn()
        const { rerender } = render(<AdminModeOverlay selectedEntities={[]} onLeave={onLeave} />)
        expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument()

        rerender(<AdminModeOverlay selectedEntities={[{ id: 'mark-1', name: 'Box mark' }]} onLeave={onLeave} />)
        fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
        expect(onLeave).toHaveBeenCalledTimes(1)
    })

    it('disables the "Leave" button while busy', () => {
        render(<AdminModeOverlay selectedEntities={[{ id: 'mark-1', name: 'Box mark' }]} busy />)
        expect(screen.getByRole('button', { name: 'Leave' })).toBeDisabled()
    })
})
