/**
 * docstack PDF Utilities
 * 
 * Handles PDF.js rendering and related operations
 */

// PDF.js library reference (set during initialization)
let pdfjsLib = null;

/**
 * Initialize PDF.js library
 * @param {Object} pdfjs - PDF.js library object
 */
export function initPdfLib(pdfjs) {
    pdfjsLib = pdfjs;
}

/**
 * Render a PDF page to a canvas
 * @param {Object} pdfDoc - PDF.js document proxy
 * @param {number} pageNum - Page number (1-indexed)
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {number} scale - Render scale (default 0.5)
 * @returns {Promise<boolean>} - Success status
 */
export async function renderPdfPage(pdfDoc, pageNum, canvas, scale = 0.5) {
    try {
        // PDF.js pages are 1-indexed
        const page = await pdfDoc.getPage(pageNum);

        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        return true;
    } catch (error) {
        console.error('Error rendering PDF:', error);
        return false;
    }
}

/**
 * Load a PDF document from ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer - PDF file data
 * @returns {Promise<Object>} - PDF.js document proxy
 */
export async function loadPdfDocument(arrayBuffer) {
    if (!pdfjsLib) {
        throw new Error('PDF.js library not initialized');
    }

    // Create a copy of the buffer to avoid detached buffer issues
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    return loadingTask.promise;
}

/**
 * Get page count from a PDF proxy
 * @param {Object} pdfProxy 
 * @returns {number}
 */
export function getPageCount(pdfProxy) {
    return pdfProxy.numPages;
}
