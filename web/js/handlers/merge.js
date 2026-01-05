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
 * Merge PDFs and trigger download
 * @param {Function} showLoading - Show loading overlay
 * @param {Function} hideLoading - Hide loading overlay
 */
export async function mergePDFs(showLoading, hideLoading) {
    if (state.uploadedFiles.length === 0) return;

    showLoading('Merging PDFs...');

    try {
        const mergedPdf = await PDFDocument.create();

        // If in "All Pages" mode and globalPageOrder is set, use that order
        if (state.currentView === 'allPages' && state.globalPageOrder.length > 0) {
            // Cache loaded documents to avoid reloading
            const docCache = {};

            for (const { fileId, pageIndex } of state.globalPageOrder) {
                const file = state.getFile(fileId);
                if (!file) continue;

                // WRAPPER LOGIC START: Check for imported page
                const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);
                let srcDoc;
                let actualPageIndex; // 0-based index for pdf-lib

                if (importedPage) {
                    const sourceFile = state.getFile(importedPage.sourceFileId);
                    if (!sourceFile) continue;

                    if (!docCache[importedPage.sourceFileId]) {
                        docCache[importedPage.sourceFileId] = await PDFDocument.load(sourceFile.arrayBuffer, { ignoreEncryption: true });
                    }
                    srcDoc = docCache[importedPage.sourceFileId];
                    actualPageIndex = importedPage.sourcePageIndex;
                } else {
                    // Native page
                    if (!docCache[fileId]) {
                        docCache[fileId] = await PDFDocument.load(file.arrayBuffer, { ignoreEncryption: true });
                    }

                    srcDoc = docCache[fileId];
                    actualPageIndex = pageIndex;
                }
                // WRAPPER LOGIC END

                const [copiedPage] = await mergedPdf.copyPages(srcDoc, [actualPageIndex]);

                // Apply rotation
                const rotation = file.pageRotations[pageIndex] || 0;
                if (rotation !== 0) {
                    const currentRotation = copiedPage.getRotation().angle;
                    copiedPage.setRotation(degrees(currentRotation + rotation));
                }

                mergedPdf.addPage(copiedPage);
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

                    let srcDoc;
                    let actualPageIndex;

                    if (importedPage) {
                        // Load from source file
                        const sourceFile = state.getFile(importedPage.sourceFileId);
                        if (!sourceFile) continue;

                        if (!docCache[importedPage.sourceFileId]) {
                            docCache[importedPage.sourceFileId] = await PDFDocument.load(sourceFile.arrayBuffer, { ignoreEncryption: true });
                        }
                        srcDoc = docCache[importedPage.sourceFileId];
                        actualPageIndex = importedPage.sourcePageIndex;
                    } else {
                        // Load from current file
                        if (!docCache[file.id]) {
                            docCache[file.id] = await PDFDocument.load(file.arrayBuffer, { ignoreEncryption: true });
                        }
                        srcDoc = docCache[file.id];
                        actualPageIndex = rule.page;
                    }

                    const [copiedPage] = await mergedPdf.copyPages(srcDoc, [actualPageIndex]);

                    // Combine text-based rotation with visual rotation
                    const visualRotation = file.pageRotations[rule.page] || 0;
                    const totalRotation = rule.rotation + visualRotation;
                    if (totalRotation !== 0) {
                        const currentRotation = copiedPage.getRotation().angle;
                        copiedPage.setRotation(degrees(currentRotation + totalRotation));
                    }

                    mergedPdf.addPage(copiedPage);
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
