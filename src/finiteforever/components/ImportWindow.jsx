import { useCallback, useRef, useState } from 'react'
import DraggablePanel from './DraggablePanel.jsx'
import { MODEL_FORMATS, detectModelFormatFromFile } from '../../utils/modelFormats.js'

const ACCEPT = 'image/*,.glb,.gltf,.obj,.stl'

// Reuses the same format-detection ModelObject.jsx (Studio/Beta/Finite
// Forever's shared model renderer) already relies on, rather than a second,
// separately-maintained extension list — but deliberately narrower than
// every format that utility recognizes: FBX isn't offered here, only what's
// actually been asked for (GLTF/GLB, OBJ, STL).
const ACCEPTED_MODEL_FORMATS = [MODEL_FORMATS.GLTF, MODEL_FORMATS.OBJ, MODEL_FORMATS.STL]

function detectMarkType(file) {
    if (file.type?.startsWith('image/')) return 'image'
    if (ACCEPTED_MODEL_FORMATS.includes(detectModelFormatFromFile(file))) return 'model'
    return null
}

export default function ImportWindow({ open, onClose, onImportFile, busy, error }) {
    const inputRef = useRef(null)
    const [dragOver, setDragOver] = useState(false)
    const [localError, setLocalError] = useState(null)

    const handleFiles = useCallback((files) => {
        const file = files?.[0]
        if (!file) return
        const type = detectMarkType(file)
        if (!type) {
            setLocalError('Unsupported file — use an image (png/jpg/webp/gif) or a 3D model (.glb/.gltf/.obj/.stl).')
            return
        }
        setLocalError(null)
        onImportFile(file, type)
    }, [onImportFile])

    if (!open) return null

    return (
        <DraggablePanel
            className="ff-import"
            title="Import file"
            onClose={onClose}
            onClickOutside={onClose}
            role="dialog"
            aria-modal="true"
        >
            <p className="ff-import__hint">Images and 3D models (.glb / .gltf / .obj / .stl)</p>
            <button
                type="button"
                className={`ff-import__drop${dragOver ? ' ff-import__drop--active' : ''}`}
                disabled={busy}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleFiles(e.dataTransfer.files)
                }}
                onClick={() => inputRef.current?.click()}
            >
                {busy ? 'Uploading…' : 'Drop a file here, or click to browse'}
            </button>
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                disabled={busy}
                style={{ display: 'none' }}
                onChange={(e) => {
                    handleFiles(e.target.files)
                    e.target.value = ''
                }}
            />
            {(localError || error) && <p className="ff-import__error">{localError || error}</p>}
        </DraggablePanel>
    )
}
