import { useState } from 'react'
import DrawingCanvas from './DrawingCanvas.jsx'
import { FINITE_FOREVER_PROJECT_ID, buildProjectAssetUrl } from '../permanence.js'

// Page tabs, one per real face of the box (see BoxObject's per-face
// materials) — every page is live on its own face at once, there's no
// separate "activate" step. Selecting a tab only changes what *this
// viewer* is looking at in this panel; the owner's drawing tool for
// whichever page is selected either has its own read-only preview for
// everyone else. The caller mounts this with `key={entity.id}` so
// switching marks resets selectedIndex back to page 1 for the new mark.
export default function PagesPanel({ entity, isOwner, busy, onSavePage, onClearPage }) {
    const pages = entity.components?.pages
    const [selectedIndex, setSelectedIndex] = useState(0)

    if (!pages) return null

    const item = pages.items[selectedIndex]
    const assetId = item?.assetId || null
    const imageUrl = assetId ? buildProjectAssetUrl(FINITE_FOREVER_PROJECT_ID, assetId) : null

    return (
        <div className="ff-pages">
            <div className="ff-pages__tabs">
                {pages.items.map((_, index) => (
                    <button
                        key={index}
                        type="button"
                        className={`ff-pages__tab${index === selectedIndex ? ' ff-pages__tab--selected' : ''}`}
                        onClick={() => setSelectedIndex(index)}
                        aria-current={index === selectedIndex}
                        title={`Page ${index + 1}`}
                    >
                        {index + 1}
                    </button>
                ))}
            </div>

            {isOwner ? (
                <DrawingCanvas
                    key={selectedIndex}
                    initialImageUrl={imageUrl}
                    busy={busy}
                    onSave={(blob) => onSavePage(selectedIndex, blob)}
                    onClear={() => onClearPage(selectedIndex)}
                />
            ) : (
                <div className="ff-pages__preview">
                    {imageUrl
                        ? <img src={imageUrl} alt={`Page ${selectedIndex + 1}`} className="ff-pages__preview-image" />
                        : <p className="ff-pages__note">Blank page.</p>}
                    <p className="ff-pages__note">Only the person who placed this can draw here.</p>
                </div>
            )}
        </div>
    )
}
