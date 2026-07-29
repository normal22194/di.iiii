import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RitualLogView from './RitualLogView.jsx'
import { fetchRitualLog } from '../permanence.js'

vi.mock('../permanence.js', () => ({
    fetchRitualLog: vi.fn()
}))

afterEach(() => {
    vi.clearAllMocks()
})

describe('RitualLogView', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<RitualLogView open={false} onClose={vi.fn()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('shows entries once loaded', async () => {
        fetchRitualLog.mockResolvedValue([{ id: '1', action: 'place', actorLabel: 'nooo', targetLabel: 'Box mark', createdAt: 1 }])
        render(<RitualLogView open onClose={vi.fn()} />)
        expect(await screen.findByText('nooo placed Box mark')).toBeInTheDocument()
    })

    it('clicking outside the panel closes it', async () => {
        fetchRitualLog.mockResolvedValue([])
        const onClose = vi.fn()
        render(<RitualLogView open onClose={onClose} />)
        await screen.findByText('Nothing recorded yet.')
        fireEvent.pointerDown(document.body)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('clicking inside the panel does not close it', async () => {
        fetchRitualLog.mockResolvedValue([])
        const onClose = vi.fn()
        render(<RitualLogView open onClose={onClose} />)
        fireEvent.pointerDown(await screen.findByText('The ritual remembers'))
        expect(onClose).not.toHaveBeenCalled()
    })

    it('the Close button also closes it', async () => {
        fetchRitualLog.mockResolvedValue([])
        const onClose = vi.fn()
        render(<RitualLogView open onClose={onClose} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
