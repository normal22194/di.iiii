import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ImportWindow from './ImportWindow.jsx'

function fileOf(name, type) {
    return new File(['x'], name, { type })
}

describe('ImportWindow', () => {
    it('renders nothing when closed', () => {
        const { container } = render(<ImportWindow open={false} onClose={vi.fn()} onImportFile={vi.fn()} />)
        expect(container).toBeEmptyDOMElement()
    })

    it('accepts an image file and forwards its detected type', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('photo.png', 'image/png')] } })
        expect(onImportFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'photo.png' }), 'image')
    })

    it('accepts a .glb model by extension even without a matching mime type', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('statue.glb', '')] } })
        expect(onImportFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'statue.glb' }), 'model')
    })

    it('accepts a .obj model by extension even without a matching mime type', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('statue.obj', '')] } })
        expect(onImportFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'statue.obj' }), 'model')
    })

    it('accepts a .stl model by extension even without a matching mime type', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('statue.stl', '')] } })
        expect(onImportFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'statue.stl' }), 'model')
    })

    it('rejects an .fbx model — supported by the shared renderer, but not offered here', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('statue.fbx', '')] } })
        expect(onImportFile).not.toHaveBeenCalled()
        expect(screen.getByText(/Unsupported file/)).toBeInTheDocument()
    })

    it('rejects an unsupported file type with an inline error, without calling onImportFile', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const input = document.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [fileOf('notes.txt', 'text/plain')] } })
        expect(onImportFile).not.toHaveBeenCalled()
        expect(screen.getByText(/Unsupported file/)).toBeInTheDocument()
    })

    it('also accepts a dropped file via drag-and-drop', () => {
        const onImportFile = vi.fn()
        render(<ImportWindow open onClose={vi.fn()} onImportFile={onImportFile} />)
        const dropZone = screen.getByText(/Drop a file here/)
        fireEvent.drop(dropZone, { dataTransfer: { files: [fileOf('photo.jpg', 'image/jpeg')] } })
        expect(onImportFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'photo.jpg' }), 'image')
    })

    it('disables the drop zone and shows an uploading state while busy', () => {
        render(<ImportWindow open onClose={vi.fn()} onImportFile={vi.fn()} busy />)
        expect(screen.getByText('Uploading…')).toBeDisabled()
    })

    it('surfaces an external error alongside any local validation error', () => {
        render(<ImportWindow open onClose={vi.fn()} onImportFile={vi.fn()} error="Upload failed." />)
        expect(screen.getByText('Upload failed.')).toBeInTheDocument()
    })
})
