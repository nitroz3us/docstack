/**
 * docstack Upload Handler
 * 
 * Handles file upload logic
 */

import * as state from '../state.js';
import { generateId } from '../utils/helpers.js';
import { loadPdfDocument, getPageCount } from '../utils/pdf.js';
import { createLoadingCard } from '../ui/components.js';
import { addFileCard, renderFileGrid, preparePagesViewDom, showRenderProgress } from '../ui/views.js';

// DOM element references
let pdfList = null;
let fileInput = null;

/**
 * Initialize upload handler with DOM references
 * @param {Object} elements 
 */
export function initUploadHandler(elements) {
    pdfList = elements.pdfList;
    fileInput = elements.fileInput;
}

/**
 * Handle file uploads
 * @param {FileList} fileList - Files from input or drop
 * @param {Object} handlers - Event handlers for file cards
 * @param {Function} updateUI - UI update callback
 */
export async function handleFiles(fileList, handlers, updateUI) {
    const files = Array.from(fileList).filter(f => f.type === 'application/pdf');
    if (files.length === 0) return;

    for (const file of files) {
        const loadingCard = createLoadingCard(file.name);
        pdfList.appendChild(loadingCard);

        // Scroll to new card
        loadingCard.scrollIntoView({ behavior: 'smooth', block: 'end' });

        try {
            // Small delay to allow UI to update
            await new Promise(r => requestAnimationFrame(r));

            const arrayBuffer = await file.arrayBuffer();

            // Load for rendering (PDF.js) - CACHED PROXY
            const pdfProxy = await loadPdfDocument(arrayBuffer);

            // Get pageCount directly from pdfProxy
            const pageCount = getPageCount(pdfProxy);

            const fileData = {
                id: generateId(),
                name: file.name,
                size: file.size,
                arrayBuffer: arrayBuffer,
                pdfProxy: pdfProxy,
                pageCount: pageCount,
                rules: '',
                pageRotations: Array(pageCount).fill(0),
                pageOrder: Array.from({ length: pageCount }, (_, i) => i)
            };

            // Add to state
            state.addFile(fileData);

            // Show progress bar immediately
            const totalPages = state.uploadedFiles.reduce((sum, f) => sum + f.pageCount, 0);
            showRenderProgress(totalPages);

            // Remove loading card
            loadingCard.remove();

            // Update UI
            updateUI();

            // Add file card
            addFileCard(fileData, handlers);

        } catch (error) {
            console.error('Error loading PDF:', error);
            loadingCard.remove();
            alert(`Failed to load ${file.name}: ${error.message}`);
        }
    }

    // Background render the Pages view after a delay
    setTimeout(() => {
        // Render expanded file grids in background
        state.uploadedFiles.forEach(file => {
            const card = pdfList.querySelector(`[data-file-id="${file.id}"]`);
            if (card) {
                const grid = card.querySelector('.pages-grid');
                if (grid && grid.children.length === 0) {
                    renderFileGrid(file, grid, handlers);
                }
            }
        });

        // Prepare Pages view DOM (background - no actual rendering)
        preparePagesViewDom(handlers);
    }, 1000);

    // Reset file input
    if (fileInput) fileInput.value = '';
}
