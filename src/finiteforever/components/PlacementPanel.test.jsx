import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlacementPanel from './PlacementPanel.jsx'

describe('PlacementPanel', () => {
    it('shows a shape button per type plus Import', () => {
        render(<PlacementPanel onPlace={vi.fn()} onImportClick={vi.fn()} disabled={false} />)
        expect(screen.getByRole('button', { name: 'Box' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Sphere' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cone' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ring' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '⤒ Import…' })).toBeInTheDocument()
    })

    it('clicking a shape button places it immediately, with no intermediate step', () => {
        const onPlace = vi.fn()
        render(<PlacementPanel onPlace={onPlace} onImportClick={vi.fn()} disabled={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Sphere' }))
        expect(onPlace).toHaveBeenCalledWith('sphere')
    })

    it('Import calls onImportClick directly', () => {
        const onImportClick = vi.fn()
        render(<PlacementPanel onPlace={vi.fn()} onImportClick={onImportClick} disabled={false} />)
        fireEvent.click(screen.getByRole('button', { name: '⤒ Import…' }))
        expect(onImportClick).toHaveBeenCalledTimes(1)
    })

    it('disables every button while disabled', () => {
        render(<PlacementPanel onPlace={vi.fn()} onImportClick={vi.fn()} disabled />)
        expect(screen.getByRole('button', { name: 'Box' })).toBeDisabled()
        expect(screen.getByRole('button', { name: '⤒ Import…' })).toBeDisabled()
    })
})
