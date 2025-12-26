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
 * Render expanded file grid with background pre-rendering
 * Pre-renders all thumbnails one at a time
 * @param {Object} file - File object
 * @param {HTMLElement} grid - Grid container
 * @param {Object} handlers - Event handlers
 */
export function renderFileGrid(file, grid, handlers) {
    // Create DOM elements for all pages first
    let currentIndex = 0;
    const batchSize = 100;

    function createBatch() {
        const limit = Math.min(currentIndex + batchSize, file.pageOrder.length);

        for (let i = currentIndex; i < limit; i++) {
            const pageIndex = file.pageOrder[i];

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
        }

        currentIndex += batchSize;
        if (currentIndex < file.pageOrder.length) {
            requestAnimationFrame(createBatch);
        } else {
            // DOM complete, start background rendering
            preRenderFileGridThumbnails(file, grid);
        }
    }

    createBatch();
}

/**
 * Pre-render all thumbnails in a file grid (background, one at a time)
 */
function preRenderFileGridThumbnails(file, grid) {
    const thumbs = grid.querySelectorAll('.page-thumb:not([data-rendered])');
    const toRender = Array.from(thumbs);

    let renderIndex = 0;

    function renderNext() {
        if (renderIndex >= toRender.length) return;

        const thumb = toRender[renderIndex];
        if (thumb.dataset.rendered) {
            renderIndex++;
            requestAnimationFrame(renderNext);
            return;
        }

        const pageIndex = parseInt(thumb.dataset.pageIndex);
        const canvas = thumb.querySelector('canvas');
        const spinner = thumb.querySelector('.thumbnail-spinner');

        // Check if this is an imported page
        const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

        if (importedPage) {
            const sourceFile = state.getFile(importedPage.sourceFileId);
            if (sourceFile) {
                const sourcePageNum = importedPage.sourcePageIndex + 1;
                renderPdfPage(sourceFile.pdfProxy, sourcePageNum, canvas, 0.25)
                    .finally(() => {
                        spinner?.remove();
                        thumb.dataset.rendered = 'true';
                        renderIndex++;
                        if (window.requestIdleCallback) {
                            requestIdleCallback(renderNext, { timeout: 100 });
                        } else {
                            setTimeout(renderNext, 10);
                        }
                    });
            } else {
                spinner?.remove();
                renderIndex++;
                requestAnimationFrame(renderNext);
            }
        } else {
            const pageNum = pageIndex + 1;
            renderPdfPage(file.pdfProxy, pageNum, canvas, 0.25)
                .finally(() => {
                    spinner?.remove();
                    thumb.dataset.rendered = 'true';
                    renderIndex++;
                    if (window.requestIdleCallback) {
                        requestIdleCallback(renderNext, { timeout: 100 });
                    } else {
                        setTimeout(renderNext, 10);
                    }
                });
        }
    }

    // Start rendering
    renderNext();
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
 * Prepare Pages view DOM in background (without rendering)
 * Appends new file's pages without clearing existing ones (additive approach)
 * @param {Object} handlers - Event handlers
 */
export function preparePagesViewDom(handlers) {
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

    // Update global totals
    totalToRender += newPages.length;

    // Create DOM elements for new pages only
    let currentIndex = 0;
    const batchSize = 100;

    function createBatch() {
        const limit = Math.min(currentIndex + batchSize, newPages.length);

        for (let i = currentIndex; i < limit; i++) {
            const { fileId, pageIndex } = newPages[i];
            const file = state.getFile(fileId);
            if (!file) continue;

            const thumb = createPageThumb({
                file,
                pageIndex,
                view: 'pages',
                globalIndex: state.globalPageOrder.findIndex(
                    p => p.fileId === fileId && p.pageIndex === pageIndex
                ),
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

            allPagesGrid.appendChild(thumb);
        }

        currentIndex += batchSize;
        if (currentIndex < newPages.length) {
            requestAnimationFrame(createBatch);
        } else {
            // DOM is ready for new pages, setup Sortable and delete handlers
            if (window.Sortable && !allPagesGrid.dataset.sortableInit) {
                new Sortable(allPagesGrid, {
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    chosenClass: 'sortable-chosen',
                    filter: 'button, .preview-page-btn, .rotate-btn, .delete-page-btn',
                    onEnd: () => {
                        const newOrder = Array.from(allPagesGrid.querySelectorAll('.page-thumb')).map(el => ({
                            fileId: el.dataset.fileId,
                            pageIndex: parseInt(el.dataset.pageIndex)
                        }));
                        state.setGlobalPageOrder(newOrder);
                    }
                });
                allPagesGrid.dataset.sortableInit = 'true';
            }
            setupPagesViewDeleteHandler(handlers);

            // Start rendering if not already in progress, otherwise it will pick up new pages
            if (!isRendering) {
                preRenderPagesViewThumbnails();
            }
            // If already rendering, update progress bar total
            updateProgressTotal();
        }
    }

    createBatch();
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
        progressText.textContent = `Preparing pages... (${pageCount} pages)`;
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
 * Pre-render ALL thumbnails in background (without observer)
 * Renders one at a time with yields to keep browser responsive
 * Uses global state tracking for additive progress (handles new files during rendering)
 */
function preRenderPagesViewThumbnails() {
    if (isRendering) return; // Already rendering, new pages will be picked up

    isRendering = true;

    // Initialize totals from current unrendered thumbs
    const initialThumbs = allPagesGrid.querySelectorAll('.page-thumb:not([data-rendered])');
    totalToRender = initialThumbs.length;
    renderedCount = 0;

    if (totalToRender === 0) {
        isRendering = false;
        return;
    }

    // Get progress bar elements
    const progressContainer = document.getElementById('renderProgress');
    const progressText = document.getElementById('renderProgressText');
    const progressPercent = document.getElementById('renderProgressPercent');
    const progressBar = document.getElementById('renderProgressBar');
    const progressHint = document.getElementById('renderProgressHint');

    // Show progress bar
    if (progressContainer) {
        progressContainer.classList.remove('hidden');
        progressText.textContent = `Preparing pages: 0/${totalToRender}`;
        progressPercent.textContent = '0%';
        progressBar.style.width = '0%';
        progressBar.classList.remove('bg-green-500');
        progressBar.classList.add('bg-blue-500');

        // Show cheeky message for large files
        if (progressHint && totalToRender >= 50) {
            progressHint.classList.remove('hidden');
            progressHint.textContent = '☕ Whoa, big file! Sit tight while we prepare your pages...';
        }
    }

    updateMergeButton(true);

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

        // Reset global state
        totalToRender = 0
            ;
        renderedCount = 0;

        // Hide after a delay
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressBar.classList.remove('bg-green-500');
            progressBar.classList.add('bg-blue-500');
        }, 2000);
    }

    function renderNext() {
        // Dynamically query for next unrendered thumb (picks up new files added during rendering)
        const thumb = allPagesGrid.querySelector('.page-thumb:not([data-rendered])');

        if (!thumb) {
            // All done (including any new files that were added)
            completeProgress();
            return;
        }

        const pageIndex = parseInt(thumb.dataset.pageIndex);
        const fileId = thumb.dataset.fileId;
        const file = state.getFile(fileId);
        if (!file) {
            renderedCount++;
            updateProgress();
            requestAnimationFrame(renderNext);
            return;
        }

        const canvas = thumb.querySelector('canvas');
        const spinner = thumb.querySelector('.thumbnail-spinner');

        const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

        if (importedPage) {
            const sourceFile = state.getFile(importedPage.sourceFileId);
            if (sourceFile) {
                const sourcePageNum = importedPage.sourcePageIndex + 1;
                renderPdfPage(sourceFile.pdfProxy, sourcePageNum, canvas, 0.25)
                    .finally(() => {
                        spinner?.remove();
                        thumb.dataset.rendered = 'true';
                        renderedCount++;
                        updateProgress();
                        if (window.requestIdleCallback) {
                            requestIdleCallback(renderNext, { timeout: 100 });
                        } else {
                            setTimeout(renderNext, 10);
                        }
                    });
            } else {
                spinner?.remove();
                thumb.dataset.rendered = 'true';
                renderedCount++;
                updateProgress();
                requestAnimationFrame(renderNext);
            }
        } else {
            const pageNum = pageIndex + 1;
            renderPdfPage(file.pdfProxy, pageNum, canvas, 0.25)
                .finally(() => {
                    spinner?.remove();
                    thumb.dataset.rendered = 'true';
                    renderedCount++;
                    updateProgress();
                    if (window.requestIdleCallback) {
                        requestIdleCallback(renderNext, { timeout: 100 });
                    } else {
                        setTimeout(renderNext, 10);
                    }
                });
        }
    }

    // Start after a short delay to not compete with Files view
    setTimeout(renderNext, 500);
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
