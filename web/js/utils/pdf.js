/** PDF.js loading and rendering helpers. */

let pdfJsPromise = null;

export async function ensurePdfJs() {
    if (!pdfJsPromise) {
        pdfJsPromise = import('../../lib/pdf.min.mjs').then(pdfjs => {
            // The page is cross-origin isolated, so the browser blocks a worker script that was
            // served without the isolation headers. Copies cached before those headers existed
            // stay that way ("304 Not Modified" does not add them), so the query string gives the
            // worker a new address and forces a fresh download. Bump it if the headers change.
            const workerUrl = new URL('../../lib/pdf.worker.min.mjs?v=2', import.meta.url);
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;
            // Start one shared worker now, so its code is already loaded if the connection drops later.
            try {
                const worker = new Worker(workerUrl, { type: 'module' });
                // A worker that failed to load never answers; let pdf.js start its own instead.
                worker.addEventListener('error', () => {
                    if (pdfjs.GlobalWorkerOptions.workerPort === worker) pdfjs.GlobalWorkerOptions.workerPort = null;
                });
                pdfjs.GlobalWorkerOptions.workerPort = worker;
            } catch {
                // Fall back to pdf.js starting its own worker from workerSrc when a document opens.
            }
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
