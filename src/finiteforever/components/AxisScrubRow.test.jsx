import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AxisScrubRow from './AxisScrubRow.jsx'

describe('AxisScrubRow', () => {
    it('nudges the right axis by +/- step via the buttons', () => {
        const onNudge = vi.fn()
        render(<AxisScrubRow label="Move" values={[1, 2, 3]} step={0.5} onNudge={onNudge} onDragChange={vi.fn()} />)

        const yAxis = screen.getByText('Y').closest('.ff-move__axis')
        fireEvent.click(within(yAxis).getByText('+'))
        expect(onNudge).toHaveBeenCalledWith(1, 0.5)

        fireEvent.click(within(yAxis).getByText('−'))
        expect(onNudge).toHaveBeenCalledWith(1, -0.5)
    })

    it('does not nudge while busy', () => {
        const onNudge = vi.fn()
        render(<AxisScrubRow label="Move" values={[1, 2, 3]} onNudge={onNudge} onDragChange={vi.fn()} busy />)
        const xAxis = screen.getByText('X').closest('.ff-move__axis')
        expect(within(xAxis).getByText('+')).toBeDisabled()
    })

    it('reports a live value while dragging, clamped to min/max', () => {
        const onDragChange = vi.fn()
        render(
            <AxisScrubRow
                label="Scale"
                values={[1, 1, 1]}
                dragSensitivity={0.01}
                min={0.1}
                max={10}
                formatValue={(v) => v.toFixed(2)}
                onNudge={vi.fn()}
                onDragChange={onDragChange}
            />
        )
        const xAxis = screen.getByText('X').closest('.ff-move__axis')
        const dragHandle = xAxis.querySelector('.ff-move__value--drag')
        dragHandle.setPointerCapture = vi.fn()

        fireEvent.pointerDown(dragHandle, { button: 0, clientX: 0, pointerId: 1 })
        // dragSensitivity 0.01 * -2000px = -20, clamped to min 0.1
        fireEvent.pointerMove(dragHandle, { clientX: -2000, pointerId: 1 })
        expect(onDragChange).toHaveBeenLastCalledWith(0, 0.1)

        fireEvent.pointerMove(dragHandle, { clientX: 50, pointerId: 1 })
        expect(onDragChange).toHaveBeenLastCalledWith(0, 1.5)

        fireEvent.pointerUp(dragHandle, { pointerId: 1 })
        expect(onDragChange).toHaveBeenLastCalledWith(0, 1.5)
    })

    it('ignores drag moves when nothing is currently being dragged', () => {
        const onDragChange = vi.fn()
        render(<AxisScrubRow label="Move" values={[1, 2, 3]} onNudge={vi.fn()} onDragChange={onDragChange} />)
        const xAxis = screen.getByText('X').closest('.ff-move__axis')
        const dragHandle = xAxis.querySelector('.ff-move__value--drag')
        fireEvent.pointerMove(dragHandle, { clientX: 100, pointerId: 1 })
        expect(onDragChange).not.toHaveBeenCalled()
    })
})
