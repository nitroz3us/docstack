/**
 * docstack Merge Handler
 * 
 * Handles PDF merging logic
 */

import * as state from '../state.js';
import { parseRules } from '../utils/helpers.js';

// pdf-lib reference (set during initialization)
let PDFDocument = null;
let degrees = null;

/**
 * Initialize merge handler with pdf-lib reference
 * @param {Object} pdfLib - pdf-lib module
 */
export function initMergeHandler(pdfLib) {
    PDFDocument = pdfLib.PDFDocument;
    degrees = pdfLib.degrees;
}

/**
 * Check if a file is password-protected (has a stored password)
 * @param {Object} file 
 * @returns {boolean}
 */
function isPasswordProtected(file) {
    return !!file.password;
}

/**
 * Render a page using PDF.js and return as image data
 * @param {Object} pdfProxy - PDF.js document proxy
 * @param {number} pageNum - 1-indexed page number
 * @param {number} rotation - Rotation in degrees
 * @returns {Promise<{data: Uint8Array, width: number, height: number}>}
 */
async function renderPageAsImage(pdfProxy, pageNum, rotation = 0) {
    const page = await pdfProxy.getPage(pageNum);

    // Use higher scale for better quality
    const scale = 2.0;
    const viewport = page.getViewport({ scale, rotation });

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render the page
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Get image data as JPEG (smaller than PNG)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    const arrayBuffer = await blob.arrayBuffer();

    return {
        data: new Uint8Array(arrayBuffer),
        width: viewport.width,
        height: viewport.height
    };
}

/**
 * Add a rendered page image to the merged PDF
 * @param {Object} mergedPdf - pdf-lib PDFDocument
 * @param {Uint8Array} imageData - JPEG image data
 * @param {number} width - Image width
 * @param {number} height - Image height
 */
async function addImagePage(mergedPdf, imageData, width, height) {
    const image = await mergedPdf.embedJpg(imageData);

    // Create page with image dimensions (scaled down from render resolution)
    const pageWidth = width / 2; // Divide by scale factor
    const pageHeight = height / 2;

    const page = mergedPdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
    });
}

/**
 * Load a PDF for merging, handling encryption properly
 * @param {ArrayBuffer} arrayBuffer - PDF data
 * @param {string|null} password - Optional password
 * @returns {Promise<Object|null>} - pdf-lib document or null if password-protected
 */
async function loadPdfForMerge(arrayBuffer, password) {
    // If PDF has a password, pdf-lib cannot decrypt it
    // We'll return null to signal that we need to use the image-based fallback
    if (password) {
        console.log('PDF has password, will use image-based merge');
        return null;
    }

    // Try loading without any options first (unencrypted PDFs)
    try {
        return await PDFDocument.load(arrayBuffer);
    } catch (error) {
        // If it fails due to encryption, try with ignoreEncryption
        // This handles owner-password-only PDFs (print/copy restrictions)
        if (error.message?.includes('encrypted')) {
            console.log('PDF has owner restrictions, using ignoreEncryption');
            return PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        }
        throw error;
    }
}

/**
 * Merge PDFs and trigger download
 * @param {Function} showLoading - Show loading overlay
 * @param {Function} hideLoading - Hide loading overlay
 */
export async function mergePDFs(showLoading, hideLoading) {
    if (state.uploadedFiles.length === 0) return;

    showLoading('Merging PDFs...');

    try {
        const mergedPdf = await PDFDocument.create();

        // Check if any files are password-protected
        const hasPasswordProtected = state.uploadedFiles.some(f => isPasswordProtected(f));
        if (hasPasswordProtected) {
            console.log('Some files are password-protected, will use image fallback for those');
        }

        // If in "All Pages" mode and globalPageOrder is set, use that order
        if (state.currentView === 'allPages' && state.globalPageOrder.length > 0) {
            // Cache loaded documents to avoid reloading
            const docCache = {};

            for (const { fileId, pageIndex } of state.globalPageOrder) {
                const file = state.getFile(fileId);
                if (!file) continue;

                // WRAPPER LOGIC START: Check for imported page
                const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);
                let srcFile;
                let actualPageIndex;

                if (importedPage) {
                    srcFile = state.getFile(importedPage.sourceFileId);
                    if (!srcFile) continue;
                    actualPageIndex = importedPage.sourcePageIndex;
                } else {
                    srcFile = file;
                    actualPageIndex = pageIndex;
                }

                const rotation = file.pageRotations[pageIndex] || 0;

                // Check if source file is password-protected
                if (isPasswordProtected(srcFile)) {
                    // Use image-based rendering via PDF.js (which can decrypt)
                    const imageData = await renderPageAsImage(srcFile.pdfProxy, actualPageIndex + 1, rotation);
                    await addImagePage(mergedPdf, imageData.data, imageData.width, imageData.height);
                } else {
                    // Use normal pdf-lib copy
                    if (!docCache[srcFile.id]) {
                        docCache[srcFile.id] = await loadPdfForMerge(srcFile.arrayBuffer, srcFile.password);
                    }
                    const srcDoc = docCache[srcFile.id];

                    if (srcDoc) {
                        const [copiedPage] = await mergedPdf.copyPages(srcDoc, [actualPageIndex]);
                        if (rotation !== 0) {
                            const currentRotation = copiedPage.getRotation().angle;
                            copiedPage.setRotation(degrees(currentRotation + rotation));
                        }
                        mergedPdf.addPage(copiedPage);
                    } else {
                        // Fallback to image if pdf-lib loading failed
                        const imageData = await renderPageAsImage(srcFile.pdfProxy, actualPageIndex + 1, rotation);
                        await addImagePage(mergedPdf, imageData.data, imageData.width, imageData.height);
                    }
                }
            }
        } else {
            // Original "Files" mode logic (with cross-file drag support)
            const docCache = {};

            for (const file of state.uploadedFiles) {
                // Use text rules if provided, otherwise use pageOrder (drag-and-drop order)
                let pagesToProcess;
                if (file.rules.trim()) {
                    pagesToProcess = parseRules(file.rules, file.pageCount);
                } else {
                    // Use custom pageOrder from drag-and-drop
                    pagesToProcess = file.pageOrder.map(pageIndex => ({
                        page: pageIndex,
                        rotation: 0
                    }));
                }

                for (const rule of pagesToProcess) {
                    // Check if this is an imported page from another file
                    const importedPage = file.importedPages?.find(p => p.newIndex === rule.page);

                    let srcFile;
                    let actualPageIndex;

                    if (importedPage) {
                        srcFile = state.getFile(importedPage.sourceFileId);
                        if (!srcFile) continue;
                        actualPageIndex = importedPage.sourcePageIndex;
                    } else {
                        srcFile = file;
                        actualPageIndex = rule.page;
                    }

                    const visualRotation = file.pageRotations[rule.page] || 0;
                    const totalRotation = rule.rotation + visualRotation;

                    // Check if source file is password-protected
                    if (isPasswordProtected(srcFile)) {
                        // Use image-based rendering via PDF.js (which can decrypt)
                        const imageData = await renderPageAsImage(srcFile.pdfProxy, actualPageIndex + 1, totalRotation);
                        await addImagePage(mergedPdf, imageData.data, imageData.width, imageData.height);
                    } else {
                        // Use normal pdf-lib copy
                        if (!docCache[srcFile.id]) {
                            docCache[srcFile.id] = await loadPdfForMerge(srcFile.arrayBuffer, srcFile.password);
                        }
                        const srcDoc = docCache[srcFile.id];

                        if (srcDoc) {
                            const [copiedPage] = await mergedPdf.copyPages(srcDoc, [actualPageIndex]);
                            if (totalRotation !== 0) {
                                const currentRotation = copiedPage.getRotation().angle;
                                copiedPage.setRotation(degrees(currentRotation + totalRotation));
                            }
                            mergedPdf.addPage(copiedPage);
                        } else {
                            // Fallback to image if pdf-lib loading failed
                            const imageData = await renderPageAsImage(srcFile.pdfProxy, actualPageIndex + 1, totalRotation);
                            await addImagePage(mergedPdf, imageData.data, imageData.width, imageData.height);
                        }
                    }
                }
            }
        }

        // Save and download
        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        a.click();

        URL.revokeObjectURL(url);
        hideLoading();

    } catch (error) {
        console.error('Error merging PDFs:', error);
        hideLoading();
        alert('Failed to merge PDFs: ' + error.message);
    }
}
