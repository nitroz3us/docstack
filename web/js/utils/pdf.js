/** PDF.js loading and rendering helpers. */

let pdfJsPromise = null;

export async function ensurePdfJs() {
    if (!pdfJsPromise) {
        pdfJsPromise = import('../../lib/pdf.min.mjs').then(pdfjs => {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../lib/pdf.worker.min.mjs', import.meta.url).href;
            return pdfjs;
        });
    }
    return pdfJsPromise;
}

export async function renderPdfPage(pdfDocument, pageNumber, canvas, options = {}) {
    const { scale = 0.5, rotation = 0 } = typeof options === 'number'
        ? { scale: options, rotation: 0 }
        : options;
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return viewport;
}

export async function loadPdfDocument(arrayBuffer, password = null) {
    const pdfjs = await ensurePdfJs();
    const params = { data: arrayBuffer.slice(0) };
    if (password) params.password = password;
    return pdfjs.getDocument(params).promise;
}

export function getPageCount(pdfProxy) {
    return pdfProxy.numPages;
}

export async function hasPdfSignature(file) {
    const prefix = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...prefix) === '%PDF-';
}
