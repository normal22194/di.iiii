import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ClaimPrompt from './ClaimPrompt.jsx'

function makeEntity(overrides = {}) {
    return {
        id: 'mark-1',
        type: 'box',
        name: 'Box mark',
        components: {
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            appearance: { color: '#9fd8ff', opacity: 1 },
            permanence: { status: 'drifting', placedAt: Date.now(), placedBy: 'nooo', placedByVisible: true, ...overrides }
        }
    }
}

const noop = () => {}
const baseProps = {
    pool: { total: 5, claimed: 1 },
    permanentMarks: [],
    actorLabel: 'nooo',
    onConfirm: noop, onDismiss: noop, onRecolor: noop, onDuplicate: noop, onDelete: noop, onRename: noop,
    onNudge: noop, onGround: noop, onAxisDragChange: noop, onScaleNudge: noop, onScaleDragChange: noop,
    onRotationNudge: noop, onRotationDragChange: noop, onOpacityChange: noop, onTextChange: noop,
    onOpenAdvanced: noop, isAdmin: false, busy: false
}

describe('ClaimPrompt — name and Advanced button', () => {
    it('shows the object name and who placed it', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} />)
        expect(screen.getByText('Box mark')).toBeInTheDocument()
        expect(screen.getByText('placed by nooo')).toBeInTheDocument()
    })

    it('masks the placer name for non-admins when placedByVisible is false', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity({ placedByVisible: false })} />)
        expect(screen.getByText('placed by an anonymous visitor')).toBeInTheDocument()
    })

    it('renaming the object calls onRename, not any of the transform/appearance handlers', () => {
        const onRename = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} onRename={onRename} />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My favorite box' } })
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
        expect(onRename).toHaveBeenCalledWith('My favorite box')
    })

    it('the Advanced button opens the separate advanced window, not a collapsible section', () => {
        const onOpenAdvanced = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} onOpenAdvanced={onOpenAdvanced} />)
        fireEvent.click(screen.getByRole('button', { name: 'Advanced…' }))
        expect(onOpenAdvanced).toHaveBeenCalledTimes(1)
        // Not a CollapsibleSection: no expandable section body appears from this click.
        expect(screen.queryByText('No advanced settings yet.')).not.toBeInTheDocument()
    })
})

describe('ClaimPrompt — ownership lock', () => {
    it('locks rename/recolor/delete/ground for a non-owner, but leaves Duplicate and claim/dismiss open', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} actorLabel="someone else" />)
        expect(screen.getByText('Only nooo can edit or delete this mark.')).toBeInTheDocument()
        expect(screen.getByLabelText('Color')).toBeDisabled()
        expect(screen.getByRole('button', { name: '✕ Delete this mark' })).toBeDisabled()
        expect(screen.getByRole('button', { name: '⤓ Ground' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Keep this forever' })).toBeEnabled()
    })

    it('does not show the ownership note or disable controls for the owner', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} actorLabel="nooo" />)
        expect(screen.queryByText(/can edit or delete this mark/)).not.toBeInTheDocument()
        expect(screen.getByLabelText('Color')).toBeEnabled()
        expect(screen.getByRole('button', { name: '✕ Delete this mark' })).toBeEnabled()
        expect(screen.getByRole('button', { name: '⤓ Ground' })).toBeEnabled()
    })

    it('clicking Ground calls onGround', () => {
        const onGround = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} onGround={onGround} />)
        fireEvent.click(screen.getByRole('button', { name: '⤓ Ground' }))
        expect(onGround).toHaveBeenCalledTimes(1)
    })

    it('admins bypass the ownership lock regardless of actorLabel', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} actorLabel="someone else" isAdmin />)
        expect(screen.queryByText(/can edit or delete this mark/)).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '✕ Delete this mark' })).toBeEnabled()
    })

    it('a non-owner cannot rename via double-click (editing never activates)', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} actorLabel="someone else" />)
        fireEvent.doubleClick(screen.getByText('Box mark'))
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
})

describe('ClaimPrompt — pool-full revoke choice', () => {
    const permanentMarks = [
        { id: 'held-1', name: 'Old sphere', components: { permanence: { status: 'permanent', claimedBy: 'aya', claimedByVisible: true, claimedAt: 100 } } },
        { id: 'held-2', name: 'Hidden text', components: { permanence: { status: 'permanent', claimedBy: 'theo', claimedByVisible: false, claimedAt: 200 } } }
    ]

    it('clicking "Keep this forever" claims immediately when the pool has room', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 5, claimed: 1 }} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByRole('button', { name: 'Keep this forever' }))
        expect(onConfirm).toHaveBeenCalledWith()
    })

    it('when the pool is full, the claim button explains why and offers a choice instead of claiming immediately', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 1, claimed: 1 }} permanentMarks={permanentMarks} onConfirm={onConfirm} />)
        expect(screen.getByText('permanent slots full (you can delete one permanent thing to free up space)')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Keep this forever/ }))
        expect(onConfirm).not.toHaveBeenCalled()
        expect(screen.getByText('Permanence is full. Choose one to let go of:')).toBeInTheDocument()
        expect(screen.getByText('Old sphere — kept by aya')).toBeInTheDocument()
        // Masked for a non-admin viewer, same convention as the entity's own claimedBy.
        expect(screen.getByText('Hidden text — kept by someone')).toBeInTheDocument()
    })

    it('does not show the "slots full" sub-label when the pool has room', () => {
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 5, claimed: 1 }} />)
        expect(screen.queryByText(/permanent slots full/)).not.toBeInTheDocument()
    })

    it('picking a candidate asks for confirmation instead of calling onConfirm right away', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 1, claimed: 1 }} permanentMarks={permanentMarks} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByRole('button', { name: /Keep this forever/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Old sphere — kept by aya' }))
        expect(onConfirm).not.toHaveBeenCalled()
        expect(screen.getByText('Let go of Old sphere (kept by aya) forever?')).toBeInTheDocument()
    })

    it('Yes on the confirmation calls onConfirm with the chosen mark\'s id', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 1, claimed: 1 }} permanentMarks={permanentMarks} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByRole('button', { name: /Keep this forever/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Old sphere — kept by aya' }))
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
        expect(onConfirm).toHaveBeenCalledWith('held-1')
    })

    it('No on the confirmation returns to the candidate list without confirming anything', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 1, claimed: 1 }} permanentMarks={permanentMarks} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByRole('button', { name: /Keep this forever/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Old sphere — kept by aya' }))
        fireEvent.click(screen.getByRole('button', { name: 'No' }))
        expect(onConfirm).not.toHaveBeenCalled()
        expect(screen.queryByText('Let go of Old sphere (kept by aya) forever?')).not.toBeInTheDocument()
        expect(screen.getByText('Permanence is full. Choose one to let go of:')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Old sphere — kept by aya' })).toBeInTheDocument()
    })

    it('Cancel returns to the plain claim prompt without confirming anything', () => {
        const onConfirm = vi.fn()
        render(<ClaimPrompt {...baseProps} entity={makeEntity()} pool={{ total: 1, claimed: 1 }} permanentMarks={permanentMarks} onConfirm={onConfirm} />)
        fireEvent.click(screen.getByRole('button', { name: /Keep this forever/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByText('Permanence is full. Choose one to let go of:')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Keep this forever/ })).toBeInTheDocument()
        expect(onConfirm).not.toHaveBeenCalled()
    })
})
