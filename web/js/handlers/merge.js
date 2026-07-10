/**
 * Merge the canonical composition into a downloadable PDF.
 */

import * as state from '../state.js';

let pdfLibPromise = null;

function ensurePdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (pdfLibPromise) return pdfLibPromise;

    pdfLibPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'lib/pdf-lib.min.js';
        script.onload = () => window.PDFLib
            ? resolve(window.PDFLib)
            : reject(new Error('The local PDF merge library did not initialize.'));
        script.onerror = () => reject(new Error('The local PDF merge library could not be loaded.'));
        document.head.appendChild(script);
    });
    return pdfLibPromise;
}

function throwIfAborted(signal) {
    if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError');
}

async function renderPageAsImage(pageEntity, sourceFile) {
    const page = await sourceFile.pdfProxy.getPage(pageEntity.sourcePageIndex + 1);
    const viewport = page.getViewport({ scale: 2, rotation: pageEntity.rotation });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    if (pageEntity.redactions.length > 0) {
        context.fillStyle = '#000000';
        pageEntity.redactions.forEach(rect => {
            context.fillRect(
                rect.x * canvas.width,
                rect.y * canvas.height,
                rect.width * canvas.width,
                rect.height * canvas.height
            );
        });
    }

    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not rasterize a PDF page.')), 'image/jpeg', 0.95);
    });

    return {
        data: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
    };
}

async function addImagePage(mergedPdf, imageData) {
    const image = await mergedPdf.embedJpg(imageData.data);
    const page = mergedPdf.addPage([imageData.width / 2, imageData.height / 2]);
    page.drawImage(image, {
        x: 0,
        y: 0,
        width: imageData.width / 2,
        height: imageData.height / 2,
    });
}

async function loadSourceDocument(PDFDocument, sourceFile) {
    if (sourceFile.password) return null;
    try {
        return await PDFDocument.load(sourceFile.arrayBuffer);
    } catch (error) {
        if (error.message?.toLowerCase().includes('encrypted')) return null;
        throw error;
    }
}

async function findRestrictedFiles(PDFDocument, pages, signal) {
    const restricted = [];
    const checked = new Set();

    for (const page of pages) {
        throwIfAborted(signal);
        const file = page.sourceFile;
        if (!file || checked.has(file.id)) continue;
        checked.add(file.id);

        if (file.password) {
            restricted.push(file);
            continue;
        }

        try {
            await PDFDocument.load(file.arrayBuffer);
        } catch (error) {
            if (error.message?.toLowerCase().includes('encrypted')) restricted.push(file);
        }
    }
    return restricted;
}

function triggerDownload(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {Object} options
 * @param {(progress: {stage: string, current: number, total: number}) => void} [options.onProgress]
 * @param {(files: Array<Object>) => Promise<boolean>} [options.onRestrictedFiles]
 * @param {AbortSignal} [options.signal]
 */
export async function mergePDFs({ onProgress, onRestrictedFiles, signal } = {}) {
    const plan = state.getMergePlan();
    if (plan.pages.length === 0) throw new Error('Add at least one page before exporting.');
    if (plan.errors.length > 0) throw new Error(plan.errors.join(' '));

    onProgress?.({ stage: 'Loading export tools', current: 0, total: plan.pages.length });
    const { PDFDocument, degrees } = await ensurePdfLib();
    throwIfAborted(signal);

    onProgress?.({ stage: 'Checking document permissions', current: 0, total: plan.pages.length });
    const restrictedFiles = await findRestrictedFiles(PDFDocument, plan.pages, signal);
    if (restrictedFiles.length > 0 && onRestrictedFiles) {
        const proceed = await onRestrictedFiles(restrictedFiles);
        if (!proceed) return { cancelled: true };
    }

    const mergedPdf = await PDFDocument.create();
    const documentCache = new Map();

    for (let index = 0; index < plan.pages.length; index++) {
        throwIfAborted(signal);
        const pageEntity = plan.pages[index];
        const sourceFile = pageEntity.sourceFile;
        onProgress?.({
            stage: `Preparing page ${index + 1} of ${plan.pages.length}`,
            current: index,
            total: plan.pages.length,
        });

        const mustRasterize = sourceFile.password || pageEntity.redactions.length > 0;
        if (mustRasterize) {
            await addImagePage(mergedPdf, await renderPageAsImage(pageEntity, sourceFile));
            continue;
        }

        if (!documentCache.has(sourceFile.id)) {
            documentCache.set(sourceFile.id, await loadSourceDocument(PDFDocument, sourceFile));
        }
        const sourceDocument = documentCache.get(sourceFile.id);

        if (!sourceDocument) {
            await addImagePage(mergedPdf, await renderPageAsImage(pageEntity, sourceFile));
            continue;
        }

        const [copiedPage] = await mergedPdf.copyPages(sourceDocument, [pageEntity.sourcePageIndex]);
        if (pageEntity.rotation !== 0) {
            copiedPage.setRotation(degrees(copiedPage.getRotation().angle + pageEntity.rotation));
        }
        mergedPdf.addPage(copiedPage);
    }

    throwIfAborted(signal);
    onProgress?.({ stage: 'Finalizing download', current: plan.pages.length, total: plan.pages.length });
    const bytes = await mergedPdf.save();
    throwIfAborted(signal);
    triggerDownload(bytes, plan.name);

    return {
        cancelled: false,
        name: plan.name,
        pageCount: plan.pages.length,
        byteLength: bytes.byteLength,
    };
}
