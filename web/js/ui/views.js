/**
 * docstack View Rendering
 * 
 * Handles rendering logic for Files and Pages views
 */

import * as state from '../state.js';
import { createPageThumb, createFileCard } from './components.js';
import { renderPdfPage } from '../utils/pdf.js';

// DOM element references (set during initialization)
let pdfList = null;
let allPagesGrid = null;
let allPagesView = null;
let mergeBtn = null;

// Rendering state for progress tracking
let isRendering = false;
let totalToRender = 0;
let renderedCount = 0;

// Stored handlers for cloned elements
let storedHandlers = null;

/**
 * Perform cross-file page import when page is dropped between pages of another file
 * @param {HTMLElement} thumb - The page thumbnail element
 * @param {string} sourceFileId - Original file ID
 * @param {string} targetFileId - Target file ID to import into
 */
function performCrossFileImport(thumb, sourceFileId, targetFileId) {
    const sourceFile = state.getFile(sourceFileId);
    const targetFile = state.getFile(targetFileId);
    if (!sourceFile || !targetFile) return;

    const pageIndex = parseInt(thumb.dataset.pageIndex);
    const rotation = sourceFile.pageRotations?.[pageIndex] || 0;

    // Create new page index for target file
    const newPageIndex = targetFile.pageCount;
    targetFile.pageCount++;

    // Initialize importedPages array if needed
    if (!targetFile.importedPages) targetFile.importedPages = [];

    // Store reference to source page data
    targetFile.importedPages.push({
        newIndex: newPageIndex,
        sourceFileId: sourceFileId,
        sourcePageIndex: pageIndex
    });

    // Copy rotation to target
    if (!targetFile.pageRotations) targetFile.pageRotations = [];
    targetFile.pageRotations[newPageIndex] = rotation;

    // Update thumb element's data attributes
    const oldPageIndex = pageIndex;
    thumb.dataset.pageIndex = newPageIndex;
    thumb.dataset.fileId = targetFileId;
    thumb.dataset.sourceFileId = sourceFileId;
    thumb.dataset.sourcePageIndex = oldPageIndex;

    // Update label text
    const label = thumb.lastElementChild;
    if (label && label.classList.contains('truncate')) {
        label.textContent = `${targetFile.name} p.${newPageIndex + 1}`;
    }

    // Remove from source pageOrder
    sourceFile.pageOrder = sourceFile.pageOrder.filter(idx => idx !== pageIndex);

    // Add to target pageOrder
    targetFile.pageOrder.push(newPageIndex);

    // Update page counts on cards
    const sourceCard = pdfList.querySelector(`[data-file-id="${sourceFileId}"]`);
    const targetCard = pdfList.querySelector(`[data-file-id="${targetFileId}"]`);

    if (sourceCard) {
        const countEl = sourceCard.querySelector('.page-count');
        if (countEl) countEl.textContent = sourceFile.pageOrder.length;

        // Remove thumb from source card's grid if present
        const sourceGrid = sourceCard.querySelector('.pages-grid');
        if (sourceGrid) {
            const sourceThumb = sourceGrid.querySelector(`[data-page-index="${oldPageIndex}"]`);
            if (sourceThumb) sourceThumb.remove();
        }
    }

    if (targetCard) {
        const countEl = targetCard.querySelector('.page-count');
        if (countEl) countEl.textContent = targetFile.pageOrder.length;

        // Add thumb clone to target card's grid if expanded
        const targetGrid = targetCard.querySelector('.pages-grid');
        if (targetGrid && targetGrid.children.length > 0) {
            // Clone the thumb for Files view
            const clonedThumb = thumb.cloneNode(true);

            // Copy canvas content (cloneNode doesn't copy canvas pixels)
            const originalCanvas = thumb.querySelector('canvas');
            const clonedCanvas = clonedThumb.querySelector('canvas');
            if (originalCanvas && clonedCanvas) {
                const ctx = clonedCanvas.getContext('2d');
                ctx.drawImage(originalCanvas, 0, 0);
            }

            // Re-attach event handlers (cloneNode doesn't copy event listeners)
            const previewBtn = clonedThumb.querySelector('.preview-page-btn');
            const rotateBtn = clonedThumb.querySelector('.rotate-btn');

            if (previewBtn && storedHandlers?.onPreview) {
                previewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    storedHandlers.onPreview(targetFileId, newPageIndex);
                });
            }

            if (rotateBtn) {
                rotateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Update rotation in state
                    if (!targetFile.pageRotations) targetFile.pageRotations = [];
                    targetFile.pageRotations[newPageIndex] = ((targetFile.pageRotations[newPageIndex] || 0) + 90) % 360;
                    const rotation = targetFile.pageRotations[newPageIndex];

                    // Rotate the canvas wrapper
                    const wrapper = clonedThumb.querySelector('.canvas-wrapper');
                    if (wrapper) wrapper.style.transform = `rotate(${rotation}deg)`;

                    // Update rotation label
                    const label = clonedThumb.querySelector('.rotation-label');
                    if (label) label.textContent = rotation > 0 ? rotation + '°' : '';

                    // Sync with Pages view
                    const pagesThumb = document.querySelector(`.page-thumb[data-file-id="${targetFileId}"][data-page-index="${newPageIndex}"]`);
                    if (pagesThumb) {
                        const pagesWrapper = pagesThumb.querySelector('.canvas-wrapper');
                        if (pagesWrapper) pagesWrapper.style.transform = `rotate(${rotation}deg)`;
                    }

                    state.emit('page:rotated', { fileId: targetFileId, pageIndex: newPageIndex, rotation });
                });
            }

            targetGrid.appendChild(clonedThumb);
        }
    }
}

/**
 * Initialize view module with DOM references
 * @param {Object} elements - DOM element references
 */
export function initViews(elements) {
    pdfList = elements.pdfList;
    allPagesGrid = elements.allPagesGrid;
    allPagesView = elements.allPagesView;
    mergeBtn = elements.mergeBtn;
}

/**
 * Update merge button state
 * @param {boolean} isProcessing 
 */
function updateMergeButton(isProcessing) {
    if (!mergeBtn) return;

    if (isProcessing) {
        mergeBtn.disabled = true;
        mergeBtn.innerHTML = `
            <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Processing...</span>
        `;
    } else {
        mergeBtn.disabled = false;
        mergeBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Merge & Download</span>
        `;
    }
}

// ============================================
// Files View Rendering
// ============================================

/**
 * Add a file card to the Files view
 * @param {Object} file - File object
 * @param {Object} handlers - Event handlers
 */
export function addFileCard(file, handlers) {
    const card = createFileCard(file, handlers);

    // Attach event listeners
    card.querySelector('.card-header').addEventListener('click', () => {
        handlers.onExpand?.(file.id, card);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onDeleteFile?.(file.id);
    });

    card.querySelector('.rules-input').addEventListener('change', (e) => {
        handlers.onRulesChange?.(file.id, e.target.value);
    });

    card.querySelector('.help-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onHelp?.();
    });

    pdfList.appendChild(card);
    return card;
}

/**
 * Render expanded file grid with progressive rendering
 * Creates DOM and renders each thumbnail one at a time (same pattern as Pages view)
 * @param {Object} file - File object
 * @param {HTMLElement} grid - Grid container
 * @param {Object} handlers - Event handlers
 */
export function renderFileGrid(file, grid, handlers) {
    let currentIndex = 0;

    function renderNextProgressive() {
        if (currentIndex >= file.pageOrder.length) {
            return; // All done
        }

        const pageIndex = file.pageOrder[currentIndex];

        const thumb = createPageThumb({
            file,
            pageIndex,
            view: 'files',
            onPreview: handlers.onPreview,
            onRotate: (f, pi, el) => {
                f.pageRotations[pi] = (f.pageRotations[pi] + 90) % 360;

                const wrapper = el.querySelector('.canvas-wrapper');
                wrapper.style.transform = `rotate(${f.pageRotations[pi]}deg)`;

                const label = el.querySelector('.rotation-label');
                label.textContent = f.pageRotations[pi] > 0 ? f.pageRotations[pi] + '°' : '';

                // Sync with Pages view
                const pagesThumb = document.querySelector(`.page-thumb[data-file-id="${f.id}"][data-page-index="${pi}"]`);
                if (pagesThumb) {
                    const wrapper = pagesThumb.querySelector('.canvas-wrapper');
                    wrapper.style.transform = `rotate(${f.pageRotations[pi]}deg)`;
                }

                state.emit('page:rotated', { fileId: f.id, pageIndex: pi, rotation: f.pageRotations[pi] });
            }
        });

        grid.appendChild(thumb);

        // Now render the canvas for this thumb
        const canvas = thumb.querySelector('canvas');
        const spinner = thumb.querySelector('.thumbnail-spinner');

        // Check if this is an imported page
        const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

        const doRender = (pdfProxy, pageNum) => {
            renderPdfPage(pdfProxy, pageNum, canvas, 0.25)
                .finally(() => {
                    spinner?.remove();
                    thumb.dataset.rendered = 'true';
                    currentIndex++;

                    // Schedule next render
                    if (window.requestIdleCallback) {
                        requestIdleCallback(renderNextProgressive, { timeout: 100 });
                    } else {
                        setTimeout(renderNextProgressive, 10);
                    }
                });
        };

        if (importedPage) {
            const sourceFile = state.getFile(importedPage.sourceFileId);
            if (sourceFile) {
                doRender(sourceFile.pdfProxy, importedPage.sourcePageIndex + 1);
            } else {
                spinner?.remove();
                thumb.dataset.rendered = 'true';
                currentIndex++;
                requestAnimationFrame(renderNextProgressive);
            }
        } else {
            doRender(file.pdfProxy, pageIndex + 1);
        }
    }

    // Start progressive rendering
    renderNextProgressive();
}




/**
 * Toggle file card expansion
 * @param {string} fileId 
 * @param {HTMLElement} card 
 * @param {Object} handlers 
 */
export function toggleFileExpand(fileId, card, handlers) {
    const file = state.getFile(fileId);
    if (!file) return;

    const panel = card.querySelector('.pages-panel');
    const icon = card.querySelector('.expand-icon');
    const grid = card.querySelector('.pages-grid');

    const isExpanded = !panel.classList.contains('hidden');

    if (isExpanded) {
        panel.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    } else {
        panel.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';

        // Only render pages if not already rendered
        if (grid.children.length === 0) {
            renderFileGrid(file, grid, handlers);
        }

        // Initialize sortable if not already done (separate from rendering)
        if (!grid.dataset.sortableInit && window.Sortable) {
            new Sortable(grid, {
                group: 'shared-pages',
                animation: 150,
                filter: 'button, .preview-page-btn, .rotate-btn, .delete-page-btn',
                preventOnFilter: false,
                delay: 150,
                delayOnTouchOnly: true,
                onEnd: (evt) => {
                    handlers.onCrossFileDrag?.(evt, fileId);
                }
            });
            grid.dataset.sortableInit = 'true';
        }

        // Setup delegated delete handler if not already done
        setupFilesViewDeleteHandler(grid, file, handlers);
    }
}

/**
 * Setup delegated delete handler for a Files view page grid
 * @param {HTMLElement} grid - The pages-grid element
 * @param {Object} file - The file object
 * @param {Object} handlers - Event handlers
 */
function setupFilesViewDeleteHandler(grid, file, handlers) {
    if (grid.dataset.hasDeleteListener) return;

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-page-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const thumb = btn.closest('.page-thumb');
        const pageIndex = parseInt(thumb.dataset.pageIndex);
        const fileId = thumb.dataset.fileId;

        // Get the file (might be different from initial file due to cross-file drag)
        const targetFile = state.getFile(fileId);
        if (!targetFile) return;

        // Remove from DOM
        thumb.remove();

        // Update state
        state.deletePage(fileId, pageIndex);

        // Sync with Pages View
        const pagesThumb = allPagesGrid?.querySelector(`.page-thumb[data-file-id="${fileId}"][data-page-index="${pageIndex}"]`);
        if (pagesThumb) {
            pagesThumb.remove();
        }

        // Update count on card
        const card = grid.closest('.pdf-card');
        if (card) {
            const countEl = card.querySelector('.page-count');
            if (countEl) countEl.textContent = targetFile.pageOrder.length;
        }

        handlers.onUpdateUI?.();
    });

    grid.dataset.hasDeleteListener = 'true';
}

// ============================================
// Pages View Rendering
// ============================================


/**
 * Prepare Pages view DOM and start progressive rendering
 * Creates DOM elements on-demand (not upfront) to eliminate initial delay
 * @param {Object} handlers - Event handlers
 */
export function preparePagesViewDom(handlers) {
    // Store handlers for cross-file import cloning
    storedHandlers = handlers;

    // Get existing file IDs in the grid
    const existingFileIds = new Set(
        Array.from(allPagesGrid.querySelectorAll('.page-thumb'))
            .map(el => el.dataset.fileId)
    );

    // Rebuild global page order with all current files
    state.buildGlobalPageOrder();

    // Find only NEW pages to add (pages from files not yet in grid)
    const newPages = state.globalPageOrder.filter(
        item => !existingFileIds.has(item.fileId)
    );

    if (newPages.length === 0) return; // Nothing new to add

    // Initialize Sortable if not already (before adding elements)
    if (window.Sortable && !allPagesGrid.dataset.sortableInit) {
        new Sortable(allPagesGrid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            filter: 'button, .preview-page-btn, .rotate-btn, .delete-page-btn',
            preventOnFilter: false,
            delay: 150,
            delayOnTouchOnly: true,
            onEnd: (evt) => {
                const thumbs = Array.from(allPagesGrid.querySelectorAll('.page-thumb'));
                const newOrder = thumbs.map(el => ({
                    fileId: el.dataset.fileId,
                    pageIndex: parseInt(el.dataset.pageIndex)
                }));

                // Detect cross-file moves: check if dropped item is now surrounded by different file's pages
                const droppedIndex = evt.newIndex;
                const droppedThumb = thumbs[droppedIndex];
                const droppedFileId = droppedThumb.dataset.fileId;

                // Get neighbors
                const prevThumb = droppedIndex > 0 ? thumbs[droppedIndex - 1] : null;
                const nextThumb = droppedIndex < thumbs.length - 1 ? thumbs[droppedIndex + 1] : null;

                let targetFileId = null;

                // Check if dropped between pages of another file
                if (prevThumb && nextThumb) {
                    const prevFileId = prevThumb.dataset.fileId;
                    const nextFileId = nextThumb.dataset.fileId;
                    if (prevFileId === nextFileId && prevFileId !== droppedFileId) {
                        targetFileId = prevFileId;
                    }
                } else if (prevThumb && prevThumb.dataset.fileId !== droppedFileId) {
                    // Dropped at end, check if should join previous file
                    const prevFileId = prevThumb.dataset.fileId;
                    // Only import if prev page is from different file and there's no next from original file
                    if (!nextThumb) {
                        targetFileId = prevFileId;
                    }
                } else if (nextThumb && nextThumb.dataset.fileId !== droppedFileId) {
                    // Dropped at start, check if should join next file
                    const nextFileId = nextThumb.dataset.fileId;
                    if (!prevThumb) {
                        targetFileId = nextFileId;
                    }
                }

                // Perform cross-file import if needed
                if (targetFileId) {
                    performCrossFileImport(droppedThumb, droppedFileId, targetFileId);
                }

                // Update global order
                const finalOrder = thumbs.map(el => ({
                    fileId: el.dataset.fileId,
                    pageIndex: parseInt(el.dataset.pageIndex)
                }));
                state.setGlobalPageOrder(finalOrder);
                syncFilesViewOrder();
            }
        });
        allPagesGrid.dataset.sortableInit = 'true';
    }
    setupPagesViewDeleteHandler(handlers);
    startProgressiveRendering(newPages, handlers);
}

/**
 * Progressive rendering: creates DOM element and renders thumbnail in one loop
 * Eliminates upfront DOM creation delay
 */
function startProgressiveRendering(pagesToRender, handlers) {
    if (isRendering) {
        totalToRender += pagesToRender.length;
        updateProgressTotal();
        pagesToRender.forEach((item, idx) => {
            const file = state.getFile(item.fileId);
            if (!file) return;
            const thumb = createProgressiveThumb(file, item.pageIndex, handlers, idx);
            allPagesGrid.appendChild(thumb);
        });
        return;
    }

    isRendering = true;
    totalToRender = pagesToRender.length;
    renderedCount = 0;

    // Get progress bar elements
    const progressContainer = document.getElementById('renderProgress');
    const progressText = document.getElementById('renderProgressText');
    const progressPercent = document.getElementById('renderProgressPercent');
    const progressBar = document.getElementById('renderProgressBar');
    const progressHint = document.getElementById('renderProgressHint');

    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressText.textContent = `Preparing pages: 0/${totalToRender}`;
        progressPercent.textContent = '0%';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-green-500');
        progressBar.classList.add('bg-blue-500');

        if (progressHint && totalToRender >= 50) {
            progressHint.classList.remove('hidden');
            progressHint.textContent = '☕ Whoa, big file! Sit tight while we prepare your pages...';
        }
    }

    updateMergeButton(true);

    let currentIndex = 0;

    function updateProgress() {
        if (!progressContainer) return;
        const percent = Math.round((renderedCount / totalToRender) * 100);
        progressText.textContent = `Preparing pages: ${renderedCount}/${totalToRender}`;
        progressPercent.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
    }

    function completeProgress() {
        isRendering = false;
        if (!progressContainer) return;
        progressText.textContent = 'All pages ready!';
        progressPercent.textContent = '100%';
        progressBar.style.width = '100%';
        progressBar.classList.remove('bg-blue-500');
        progressBar.classList.add('bg-green-500');
        if (progressHint) progressHint.classList.add('hidden');

        updateMergeButton(false);

        totalToRender = 0;
        renderedCount = 0;

        // Dispatch event immediately so cards can auto-expand
        window.dispatchEvent(new CustomEvent('pages:renderComplete'));

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressBar.classList.remove('bg-green-500');
            progressBar.classList.add('bg-blue-500');
        }, 2000);
    }

    function renderNextProgressive() {
        if (currentIndex >= pagesToRender.length) {
            const remaining = allPagesGrid.querySelector('.page-thumb:not([data-rendered])');
            if (remaining) {
                renderUnrenderedThumb(remaining);
            } else {
                completeProgress();
            }
            return;
        }

        const { fileId, pageIndex } = pagesToRender[currentIndex];
        const file = state.getFile(fileId);

        if (!file) {
            currentIndex++;
            renderedCount++;
            updateProgress();
            requestAnimationFrame(renderNextProgressive);
            return;
        }

        const thumb = createProgressiveThumb(file, pageIndex, handlers, currentIndex);
        allPagesGrid.appendChild(thumb);

        const canvas = thumb.querySelector('canvas');
        const spinner = thumb.querySelector('.thumbnail-spinner');

        const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

        const doRender = (pdfProxy, pageNum) => {
            renderPdfPage(pdfProxy, pageNum, canvas, 0.25)
                .finally(() => {
                    spinner?.remove();
                    thumb.dataset.rendered = 'true';
                    currentIndex++;
                    renderedCount++;
                    updateProgress();

                    if (window.requestIdleCallback) {
                        requestIdleCallback(renderNextProgressive, { timeout: 100 });
                    } else {
                        setTimeout(renderNextProgressive, 10);
                    }
                });
        };

        if (importedPage) {
            const sourceFile = state.getFile(importedPage.sourceFileId);
            if (sourceFile) {
                doRender(sourceFile.pdfProxy, importedPage.sourcePageIndex + 1);
            } else {
                spinner?.remove();
                thumb.dataset.rendered = 'true';
                currentIndex++;
                renderedCount++;
                updateProgress();
                requestAnimationFrame(renderNextProgressive);
            }
        } else {
            doRender(file.pdfProxy, pageIndex + 1);
        }
    }

    // Helper to continue rendering remaining unrendered thumbs
    function renderUnrenderedThumb(thumb) {
        const pageIndex = parseInt(thumb.dataset.pageIndex);
        const fileId = thumb.dataset.fileId;
        const file = state.getFile(fileId);

        if (!file) {
            thumb.dataset.rendered = 'true';
            renderedCount++;
            totalToRender = Math.max(totalToRender, renderedCount);
            updateProgress();
            const next = allPagesGrid.querySelector('.page-thumb:not([data-rendered])');
            if (next) {
                requestAnimationFrame(() => renderUnrenderedThumb(next));
            } else {
                completeProgress();
            }
            return;
        }

        const canvas = thumb.querySelector('canvas');
        const spinner = thumb.querySelector('.thumbnail-spinner');
        const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

        const finishAndContinue = () => {
            spinner?.remove();
            thumb.dataset.rendered = 'true';
            renderedCount++;
            totalToRender = Math.max(totalToRender, renderedCount);
            updateProgress();

            const next = allPagesGrid.querySelector('.page-thumb:not([data-rendered])');
            if (next) {
                if (window.requestIdleCallback) {
                    requestIdleCallback(() => renderUnrenderedThumb(next), { timeout: 100 });
                } else {
                    setTimeout(() => renderUnrenderedThumb(next), 10);
                }
            } else {
                completeProgress();
            }
        };

        if (importedPage) {
            const sourceFile = state.getFile(importedPage.sourceFileId);
            if (sourceFile) {
                renderPdfPage(sourceFile.pdfProxy, importedPage.sourcePageIndex + 1, canvas, 0.25)
                    .finally(finishAndContinue);
            } else {
                finishAndContinue();
            }
        } else {
            renderPdfPage(file.pdfProxy, pageIndex + 1, canvas, 0.25)
                .finally(finishAndContinue);
        }
    }

    renderNextProgressive();
}

/**
 * Create a page thumb for progressive rendering
 */
function createProgressiveThumb(file, pageIndex, handlers, globalIndex) {
    return createPageThumb({
        file,
        pageIndex,
        view: 'pages',
        globalIndex,
        onPreview: handlers.onPreview,
        onRotate: (f, pi, el) => {
            f.pageRotations[pi] = (f.pageRotations[pi] + 90) % 360;
            el.querySelector('.canvas-wrapper').style.transform = `rotate(${f.pageRotations[pi]}deg)`;

            const filesCard = pdfList.querySelector(`[data-file-id="${f.id}"]`);
            if (filesCard) {
                const filesThumb = filesCard.querySelector(`.page-thumb[data-page-index="${pi}"]`);
                if (filesThumb) {
                    const wrapper = filesThumb.querySelector('.canvas-wrapper');
                    wrapper.style.transform = `rotate(${f.pageRotations[pi]}deg)`;
                    const label = filesThumb.querySelector('.rotation-label');
                    if (label) label.textContent = f.pageRotations[pi] > 0 ? f.pageRotations[pi] + '°' : '';
                }
            }
            state.emit('page:rotated', { fileId: f.id, pageIndex: pi, rotation: f.pageRotations[pi] });
        }
    });
}

/**
 * Update progress bar with new total (when new files added during rendering)
 */
function updateProgressTotal() {
    const progressText = document.getElementById('renderProgressText');
    if (progressText) {
        progressText.textContent = `Preparing pages: ${renderedCount}/${totalToRender}`;
    }
}

/**
 * Show the rendering progress bar immediately (before actual rendering starts)
 * @param {number} pageCount - Total number of pages to render
 */
export function showRenderProgress(pageCount) {
    const progressContainer = document.getElementById('renderProgress');
    const progressText = document.getElementById('renderProgressText');
    const progressPercent = document.getElementById('renderProgressPercent');
    const progressBar = document.getElementById('renderProgressBar');
    const progressHint = document.getElementById('renderProgressHint');

    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressText.textContent = `Preparing pages: 0/${pageCount}`;
        progressPercent.textContent = '0%';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-green-500');
        progressBar.classList.add('bg-blue-500');

        // Show cheeky message for large files
        if (progressHint && pageCount >= 50) {
            progressHint.classList.remove('hidden');
            progressHint.textContent = '☕ Whoa, big file! Sit tight while we prepare your pages...';
        } else if (progressHint) {
            progressHint.classList.add('hidden');
        }
    }

    updateMergeButton(true);
}


/**
 * Setup delegated delete handler for Pages view
 * @param {Object} handlers 
 */
function setupPagesViewDeleteHandler(handlers) {
    if (allPagesGrid.dataset.hasDeleteListener) return;

    allPagesGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-page-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const thumb = btn.closest('.page-thumb');
        const fileId = thumb.dataset.fileId;
        const pageIndex = parseInt(thumb.dataset.pageIndex);

        // Remove from DOM
        thumb.remove();

        // Update state
        state.deletePage(fileId, pageIndex);

        // Sync with Files View
        const filesCard = pdfList.querySelector(`[data-file-id="${fileId}"]`);
        if (filesCard) {
            const filesThumb = filesCard.querySelector(`.pages-grid .page-thumb[data-page-index="${pageIndex}"]`);
            if (filesThumb) {
                filesThumb.remove();
            }
            // Update count
            const file = state.getFile(fileId);
            const countEl = filesCard.querySelector('.page-count');
            if (countEl && file) countEl.textContent = file.pageOrder.length;
        }

        handlers.onUpdateUI?.();
    });

    allPagesGrid.dataset.hasDeleteListener = 'true';
}

/**
 * Switch between views
 * @param {'byFile' | 'allPages'} view 
 * @param {Object} elements - DOM elements for toggle buttons
 * @param {Object} handlers - Event handlers
 */
export function switchView(view, elements, handlers) {
    state.setView(view);

    if (view === 'byFile') {
        elements.byFileBtn.classList.add('bg-white', 'shadow-sm', 'text-gray-900');
        elements.byFileBtn.classList.remove('text-gray-500');
        elements.allPagesBtn.classList.remove('bg-white', 'shadow-sm', 'text-gray-900');
        elements.allPagesBtn.classList.add('text-gray-500');
        pdfList.classList.remove('hidden');
        allPagesView.classList.add('hidden');
    } else {
        elements.allPagesBtn.classList.add('bg-white', 'shadow-sm', 'text-gray-900');
        elements.allPagesBtn.classList.remove('text-gray-500');
        elements.byFileBtn.classList.remove('bg-white', 'shadow-sm', 'text-gray-900');
        elements.byFileBtn.classList.add('text-gray-500');
        pdfList.classList.add('hidden');
        allPagesView.classList.remove('hidden');

        // Mark as rendered if DOM exists (background rendering handles the rest)
        if (allPagesGrid.children.length > 0 && !state.allPagesRendered) {
            state.markPagesViewRendered();
        } else if (!state.allPagesRendered) {
            // Fallback: prepare DOM (background rendering will start automatically)
            preparePagesViewDom(handlers);
        }
    }
}

/**
 * Update a page thumbnail's identity (file ownership) in Pages view
 * Called when a page is moved between files
 */
export function updatePageIdentity(oldFileId, oldIndex, newFileId, newIndex) {
    const thumb = allPagesGrid.querySelector(
        `.page-thumb[data-file-id="${oldFileId}"][data-page-index="${oldIndex}"]`
    );
    if (!thumb) return;

    thumb.dataset.fileId = newFileId;
    thumb.dataset.pageIndex = newIndex;

    // Keep original color (for visual tracking of source)

    // Update text label (last child is the label div)
    const newFile = state.getFile(newFileId);
    if (newFile) {
        const label = thumb.lastElementChild;
        if (label && label.classList.contains('truncate')) {
            label.textContent = `${newFile.name} p.${newIndex + 1}`;
        }
    }
}

/**
 * Sync Pages view DOM order with global state
 * Preserves existing rendered thumbnails, just reorders them
 */
export function syncPagesViewOrder() {
    state.buildGlobalPageOrder();

    // Map existing thumbs
    const existingThumbs = new Map();
    Array.from(allPagesGrid.children).forEach(el => {
        existingThumbs.set(`${el.dataset.fileId}-${el.dataset.pageIndex}`, el);
    });

    const fragment = document.createDocumentFragment();

    // Reorder based on new global order
    state.globalPageOrder.forEach(({ fileId, pageIndex }) => {
        const thumb = existingThumbs.get(`${fileId}-${pageIndex}`);
        if (thumb) {
            fragment.appendChild(thumb);
        }
    });

    // Clear any orphans (items not in global order)
    allPagesGrid.innerHTML = '';

    // Append sorted items
    allPagesGrid.appendChild(fragment);
}

/**
 * Sync Files view page grids with global page order
 * When pages are reordered in Pages view, update the corresponding file cards
 */
export function syncFilesViewOrder() {
    // Group global page order by file
    const orderByFile = new Map();
    state.globalPageOrder.forEach(({ fileId, pageIndex }) => {
        if (!orderByFile.has(fileId)) {
            orderByFile.set(fileId, []);
        }
        orderByFile.get(fileId).push(pageIndex);
    });

    // Update each file's pageOrder in state
    orderByFile.forEach((newPageOrder, fileId) => {
        const file = state.getFile(fileId);
        if (file) {
            file.pageOrder = newPageOrder;
        }
    });

    // Reorder DOM in expanded file cards
    orderByFile.forEach((newPageOrder, fileId) => {
        const card = pdfList.querySelector(`[data-file-id="${fileId}"]`);
        if (!card) return;

        const grid = card.querySelector('.pages-grid');
        if (!grid || grid.children.length === 0) return;

        // Map existing thumbs
        const existingThumbs = new Map();
        Array.from(grid.children).forEach(el => {
            existingThumbs.set(parseInt(el.dataset.pageIndex), el);
        });

        const fragment = document.createDocumentFragment();
        newPageOrder.forEach(pageIndex => {
            const thumb = existingThumbs.get(pageIndex);
            if (thumb) {
                fragment.appendChild(thumb);
            }
        });

        grid.innerHTML = '';
        grid.appendChild(fragment);
    });
}

