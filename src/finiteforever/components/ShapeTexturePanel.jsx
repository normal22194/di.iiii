import DrawingCanvas from './DrawingCanvas.jsx'
import { FINITE_FOREVER_PROJECT_ID, buildProjectAssetUrl } from '../permanence.js'

// The sphere/cone/torus equivalent of PagesPanel — one drawable/uploadable
// surface instead of 6 page tabs, since these shapes render as a single
// continuous UV-wrapped material (see TEXTURABLE_SHAPE_TYPES in
// permanence.js), so there's no per-face picker needed here.
export default function ShapeTexturePanel({ entity, isOwner, busy, onSaveTexture, onClearTexture }) {
    const textureAssetId = entity.components?.appearance?.textureAssetId || null
    const imageUrl = textureAssetId ? buildProjectAssetUrl(FINITE_FOREVER_PROJECT_ID, textureAssetId) : null

    return (
        <div className="ff-shape-texture">
            {isOwner ? (
                <DrawingCanvas
                    key={entity.id}
                    initialImageUrl={imageUrl}
                    busy={busy}
                    onSave={onSaveTexture}
                    onClear={onClearTexture}
                />
            ) : (
                <div className="ff-pages__preview">
                    {imageUrl
                        ? <img src={imageUrl} alt="Surface" className="ff-pages__preview-image" />
                        : <p className="ff-pages__note">Blank surface.</p>}
                    <p className="ff-pages__note">Only the person who placed this can draw here.</p>
                </div>
            )}
        </div>
    )
}
