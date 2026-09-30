/** Shared page thumbnails for the page grid and the preview's filmstrip. */

import { renderPdfPage } from '../utils/pdf.js';

const cache = new Map();
const THUMBNAIL_SCALE = 0.34 * Math.min(2, window.devicePixelRatio || 1);

function copyInto(canvas, source) {
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d', { alpha: false }).drawImage(source, 0, 0);
}

function cacheKey(page) {
    return `${page.sourceFileId}:${page.sourcePageIndex}:${page.rotation}`;
}

/**
 * Draw an already-rendered thumbnail into `canvas` right away. Used when the grid is rebuilt,
 * so pages keep their pictures instead of blinking to a placeholder. Returns whether it drew.
 */
export function paintCachedThumbnail(canvas, page) {
    const cached = cache.get(cacheKey(page));
    if (!cached) return false;
    copyInto(canvas, cached);
    canvas.dataset.rendered = 'true';
    return true;
}

/**
 * Draw a page thumbnail into `canvas`, rendering it once per source page and rotation.
 * Resolves when drawn; rejects if the page cannot be rendered.
 */
export async function drawPageThumbnail(canvas, page, file) {
    if (canvas.dataset.rendered === 'true' || canvas.dataset.rendering === 'true') return;
    canvas.dataset.rendering = 'true';
    const key = cacheKey(page);
    try {
        const cached = cache.get(key);
        if (cached) {
            copyInto(canvas, cached);
        } else {
            await renderPdfPage(file.pdfProxy, page.sourcePageIndex + 1, canvas, {
                scale: THUMBNAIL_SCALE,
                rotation: page.rotation,
            });
            const snapshot = document.createElement('canvas');
            copyInto(snapshot, canvas);
            cache.set(key, snapshot);
        }
        canvas.dataset.rendered = 'true';
    } finally {
        delete canvas.dataset.rendering;
    }
}

/** Forget thumbnails for documents that are no longer open. */
export function pruneThumbnails(activeFileIds) {
    cache.forEach((_, key) => {
        if (!activeFileIds.has(key.split(':')[0])) cache.delete(key);
    });
}
