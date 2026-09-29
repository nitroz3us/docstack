/**
 * Blank pages are backed by a real one-page PDF, created locally with pdf-lib, so they work
 * everywhere an ordinary page does: thumbnails, preview, rotation, redaction and export.
 */

import * as state from '../state.js';
import { generateId } from '../utils/helpers.js';
import { loadPdfDocument } from '../utils/pdf.js';
import { ensurePdfLib } from './merge.js';

const LETTER = { width: 612, height: 792 };
const blankFiles = new Map();

/** Match the page the blank lands next to, as it currently appears (rotation included). */
async function neighbourSize(insertAt) {
    const page = state.compositionPages[insertAt - 1] || state.compositionPages[insertAt];
    const file = page && state.getFile(page.sourceFileId);
    if (!page || !file) return LETTER;
    try {
        const pdfPage = await file.pdfProxy.getPage(page.sourcePageIndex + 1);
        const viewport = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
        return { width: Math.round(viewport.width), height: Math.round(viewport.height) };
    } catch {
        return LETTER;
    }
}

function blankFileFor(size) {
    const key = `${size.width}x${size.height}`;
    if (!blankFiles.has(key)) {
        const created = (async () => {
            const { PDFDocument } = await ensurePdfLib();
            const document = await PDFDocument.create();
            document.addPage([size.width, size.height]);
            const bytes = await document.save();
            const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            return {
                id: generateId(),
                name: 'Blank page',
                size: bytes.byteLength,
                arrayBuffer,
                pdfProxy: await loadPdfDocument(arrayBuffer),
                pageCount: 1,
                password: null,
                isBlank: true,
            };
        })();
        created.catch(() => blankFiles.delete(key));
        blankFiles.set(key, created);
    }
    return blankFiles.get(key);
}

export async function insertBlankPage(insertAt) {
    const file = await blankFileFor(await neighbourSize(insertAt));
    const label = 'Inserted a blank page';
    // One source file per page size is reused; it may have been removed by undo or "Start over".
    if (state.getFile(file.id)) state.insertSourcePages(file.id, [0], insertAt, label);
    else state.addFile(file, { insertAt, label });
}
