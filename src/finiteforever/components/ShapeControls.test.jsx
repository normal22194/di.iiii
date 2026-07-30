import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ShapeControls from './ShapeControls.jsx'

function makeEntity(type, components = {}) {
    return { id: 'mark-1', type, components }
}

const noop = vi.fn()

describe('ShapeControls', () => {
    it('renders nothing for box/image/model — no per-shape geometry to expose', () => {
        for (const type of ['box', 'image', 'model']) {
            const { container } = render(
                <ShapeControls entity={makeEntity(type)} isOwner busy={false} onGeometryNudge={noop} onGeometryDragChange={noop} onTextSizeNudge={noop} onTextSizeDragChange={noop} onTextStyleChange={noop} />
            )
            expect(container).toBeEmptyDOMElement()
        }
    })

    it('sphere exposes a single Radius axis and nudges via ["radius"]', () => {
        const onGeometryNudge = vi.fn()
        render(
            <ShapeControls
                entity={makeEntity('sphere', { primitive: { radius: 0.6 } })}
                isOwner
                busy={false}
                onGeometryNudge={onGeometryNudge}
                onGeometryDragChange={noop}
                onTextSizeNudge={noop}
                onTextSizeDragChange={noop}
                onTextStyleChange={noop}
            />
        )
        const axis = screen.getByText('Radius').closest('.ff-move__axis')
        fireEvent.click(within(axis).getByText('+'))
        expect(onGeometryNudge).toHaveBeenCalledWith(['radius'], 0, 0.1)
    })

    it('cone exposes Radius and Height axes, in that order', () => {
        const onGeometryNudge = vi.fn()
        render(
            <ShapeControls
                entity={makeEntity('cone', { primitive: { radius: 0.55, height: 1.4 } })}
                isOwner
                busy={false}
                onGeometryNudge={onGeometryNudge}
                onGeometryDragChange={noop}
                onTextSizeNudge={noop}
                onTextSizeDragChange={noop}
                onTextStyleChange={noop}
            />
        )
        const heightAxis = screen.getByText('Height').closest('.ff-move__axis')
        fireEvent.click(within(heightAxis).getByText('+'))
        expect(onGeometryNudge).toHaveBeenCalledWith(['radius', 'height'], 1, 0.1)
    })

    it('torus (ring) exposes Radius and Tube axes', () => {
        const onGeometryNudge = vi.fn()
        render(
            <ShapeControls
                entity={makeEntity('torus', { primitive: { radius: 0.5, tube: 0.18 } })}
                isOwner
                busy={false}
                onGeometryNudge={onGeometryNudge}
                onGeometryDragChange={noop}
                onTextSizeNudge={noop}
                onTextSizeDragChange={noop}
                onTextStyleChange={noop}
            />
        )
        const tubeAxis = screen.getByText('Tube').closest('.ff-move__axis')
        fireEvent.click(within(tubeAxis).getByText('+'))
        expect(onGeometryNudge).toHaveBeenCalledWith(['radius', 'tube'], 1, 0.1)
    })

    it('text exposes Size/Depth axes plus a font select and bevel checkbox', () => {
        const onTextSizeNudge = vi.fn()
        const onTextStyleChange = vi.fn()
        render(
            <ShapeControls
                entity={makeEntity('text', { text: { fontSize3D: 0.45, depth3D: 0.08, font3D: 'optimer_regular', bevelEnabled3D: true } })}
                isOwner
                busy={false}
                onGeometryNudge={noop}
                onGeometryDragChange={noop}
                onTextSizeNudge={onTextSizeNudge}
                onTextSizeDragChange={noop}
                onTextStyleChange={onTextStyleChange}
            />
        )
        const sizeAxis = screen.getByText('Size').closest('.ff-move__axis')
        fireEvent.click(within(sizeAxis).getByText('+'))
        expect(onTextSizeNudge).toHaveBeenCalledWith(['fontSize3D', 'depth3D'], 0, 0.02)

        expect(screen.getByRole('combobox')).toHaveValue('optimer_regular')
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'gentilis_regular' } })
        expect(onTextStyleChange).toHaveBeenCalledWith({ font3D: 'gentilis_regular' })

        const bevelCheckbox = screen.getByRole('checkbox')
        expect(bevelCheckbox).toBeChecked()
        fireEvent.click(bevelCheckbox)
        expect(onTextStyleChange).toHaveBeenCalledWith({ bevelEnabled3D: false })
    })

    it('disables all controls when not the owner, even though busy is false', () => {
        render(
            <ShapeControls
                entity={makeEntity('sphere', { primitive: { radius: 0.6 } })}
                isOwner={false}
                busy={false}
                onGeometryNudge={noop}
                onGeometryDragChange={noop}
                onTextSizeNudge={noop}
                onTextSizeDragChange={noop}
                onTextStyleChange={noop}
            />
        )
        const axis = screen.getByText('Radius').closest('.ff-move__axis')
        expect(within(axis).getByText('+')).toBeDisabled()
    })
})
