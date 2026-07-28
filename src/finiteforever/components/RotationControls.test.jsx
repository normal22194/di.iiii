import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RotationControls from './RotationControls.jsx'

describe('RotationControls', () => {
    it('displays stored radians as rounded degrees', () => {
        render(<RotationControls rotation={[Math.PI / 2, 0, 0]} onNudge={vi.fn()} onDragChange={vi.fn()} />)
        expect(screen.getByText('90°')).toBeInTheDocument()
    })

    it('defaults to zero rotation when none is given', () => {
        render(<RotationControls rotation={null} onNudge={vi.fn()} onDragChange={vi.fn()} />)
        const axes = screen.getAllByText('0°')
        expect(axes).toHaveLength(3)
    })

    it('converts a 15-degree nudge step back to radians before calling onNudge', () => {
        const onNudge = vi.fn()
        render(<RotationControls rotation={[0, 0, 0]} onNudge={onNudge} onDragChange={vi.fn()} />)
        const yAxis = screen.getByText('Y').closest('.ff-move__axis')
        fireEvent.click(within(yAxis).getByText('+'))
        expect(onNudge).toHaveBeenCalledWith(1, expect.closeTo(15 * (Math.PI / 180), 10))
    })

    it('converts a drag value in degrees back to radians before calling onDragChange', () => {
        const onDragChange = vi.fn()
        render(<RotationControls rotation={[0, 0, 0]} onNudge={vi.fn()} onDragChange={onDragChange} />)
        const xAxis = screen.getByText('X').closest('.ff-move__axis')
        const dragHandle = xAxis.querySelector('.ff-move__value--drag')
        dragHandle.setPointerCapture = vi.fn()

        fireEvent.pointerDown(dragHandle, { button: 0, clientX: 0, pointerId: 1 })
        fireEvent.pointerMove(dragHandle, { clientX: 360, pointerId: 1 })
        // dragSensitivity 0.5 * 360px = 180 degrees -> pi radians
        expect(onDragChange).toHaveBeenLastCalledWith(0, expect.closeTo(Math.PI, 5))
    })
})
