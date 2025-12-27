/**
 * docstack Application Entry Point
 * 
 * Initializes all modules and sets up event listeners
 */

import * as state from './state.js';
import { initPdfLib, renderPdfPage } from './utils/pdf.js';
import { initViews, addFileCard, toggleFileExpand, switchView, renderFileGrid, syncPagesViewOrder, updatePageIdentity } from './ui/views.js';
import { initModals, showHelpModal, showPageLightbox } from './ui/modals.js';

import { initUploadHandler, handleFiles } from './handlers/upload.js';
import { initMergeHandler, mergePDFs } from './handlers/merge.js';

// ============================================
// Initialization
// ============================================

export async function initApp() {
    console.log('Initializing docstack...');

    // Initialize PDF.js
    const pdfjsLib = await import('../lib/pdf.min.mjs');
    // Construct absolute worker URL relative to this module
    const workerUrl = new URL('../lib/pdf.worker.min.mjs', import.meta.url).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    initPdfLib(pdfjsLib);

    // Initialize pdf-lib (loaded globally)
    initMergeHandler(window.PDFLib);

    // Get DOM references
    const elements = {
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        pdfList: document.getElementById('pdfList'),
        allPagesGrid: document.getElementById('allPagesGrid'),
        allPagesView: document.getElementById('allPagesView'),
        emptyState: document.getElementById('emptyState'),
        mergeSection: document.getElementById('mergeSection'),
        mergeBtn: document.getElementById('mergeBtn'),
        viewToggle: document.getElementById('viewToggle'),
        byFileBtn: document.getElementById('byFileBtn'),
        allPagesBtn: document.getElementById('allPagesBtn'),
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        helpModal: document.getElementById('helpModal'),
        closeHelpModal: document.getElementById('closeHelpModal'),
        pageLightbox: document.getElementById('pageLightbox'),
        closeLightbox: document.getElementById('closeLightbox'),
        lightboxCanvas: document.getElementById('lightboxCanvas'),
        lightboxTitle: document.getElementById('lightboxTitle'),
        prevPageBtn: document.getElementById('prevPageBtn'),
        nextPageBtn: document.getElementById('nextPageBtn'),
    };

    // Initialize modules
    initViews(elements);
    initModals(elements);
    initUploadHandler(elements);

    // ============================================
    // Event Handlers
    // ============================================

    // Shared handlers for file cards and pages
    const handlers = {
        onExpand: (fileId, card) => toggleFileExpand(fileId, card, handlers),
        onDeleteFile: (fileId) => deleteFile(fileId, elements),
        onRulesChange: (fileId, rules) => state.updateFileRules(fileId, rules),
        onHelp: () => showHelpModal(),
        onPreview: (fileId, pageIndex) => {
            const file = state.getFile(fileId);
            if (file) {
                const orderIndex = file.pageOrder.indexOf(pageIndex);
                showPageLightbox(fileId, orderIndex >= 0 ? orderIndex : 0);
            }
        },
        onCrossFileDrag: (evt, fileId) => handleCrossFileDrag(evt, fileId),
        onUpdateUI: () => updateUI(elements),
    };

    // Drop zone events
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files, handlers, () => updateUI(elements));
    });

    // Drag and drop
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('dragover');
    });
    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('dragover');
    });
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files, handlers, () => updateUI(elements));
    });

    // Merge button
    elements.mergeBtn.addEventListener('click', () => {
        mergePDFs(
            (text) => showLoading(text, elements),
            () => hideLoading(elements)
        );
    });

    // View toggle
    elements.byFileBtn.addEventListener('click', () => {
        switchView('byFile', elements, handlers);
    });
    elements.allPagesBtn.addEventListener('click', () => {
        switchView('allPages', elements, handlers);
    });

    // Initialize sortable for file list
    if (window.Sortable) {
        new Sortable(elements.pdfList, {
            animation: 150,
            handle: '.card-header',
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => {
                const newOrder = Array.from(elements.pdfList.querySelectorAll('.pdf-card'))
                    .map(el => el.dataset.fileId);
                state.reorderFiles(newOrder);
                syncPagesViewOrder();
            }
        });
    }

    // Auto-expand cards when Pages view rendering completes
    window.addEventListener('pages:renderComplete', () => {
        const collapsedCards = elements.pdfList.querySelectorAll('.pdf-card');
        collapsedCards.forEach(card => {
            const panel = card.querySelector('.pages-panel');
            if (panel && panel.classList.contains('hidden')) {
                const fileId = card.dataset.fileId;
                toggleFileExpand(fileId, card, handlers);
            }
        });
    });

    console.log('docstack initialized successfully!');
}

// ============================================
// UI Update Functions
// ============================================

function updateUI(elements, skipPagesRender = false) {
    const hasFiles = state.hasFiles();

    if (hasFiles) {
        elements.emptyState.classList.add('hidden');
        elements.mergeSection.classList.remove('hidden');
        elements.viewToggle.classList.remove('hidden');

        if (state.currentView === 'byFile') {
            elements.pdfList.classList.remove('hidden');
        }
    } else {
        elements.emptyState.classList.remove('hidden');
        elements.mergeSection.classList.add('hidden');
        elements.viewToggle.classList.add('hidden');
        elements.pdfList.classList.add('hidden');
        elements.allPagesView.classList.add('hidden');
    }

    // Update merge button
    const totalPages = state.getTotalPageCount();
    elements.mergeBtn.querySelector('span').textContent =
        `Merge & Download${totalPages > 0 ? ` (${totalPages} pages)` : ''}`;
}

function deleteFile(fileId, elements) {
    state.removeFile(fileId);

    // Remove from Files view
    const card = elements.pdfList.querySelector(`[data-file-id="${fileId}"]`);
    if (card) card.remove();

    // Remove from Pages view
    const pageThumbs = elements.allPagesGrid.querySelectorAll(`.page-thumb[data-file-id="${fileId}"]`);
    pageThumbs.forEach(thumb => thumb.remove());

    updateUI(elements);
}

function showLoading(text, elements) {
    elements.loadingText.textContent = text || 'Processing...';
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading(elements) {
    elements.loadingOverlay.classList.add('hidden');
}

function handleCrossFileDrag(evt, sourceFileId) {
    // Handle reordering within the same file OR across files (both affect global order)
    if (evt.from === evt.to) {
        const file = state.getFile(sourceFileId);
        if (file) {
            // Update page order based on new DOM order
            file.pageOrder = Array.from(evt.from.querySelectorAll('.page-thumb')).map(
                el => parseInt(el.dataset.pageIndex)
            );
            // Sync global Pages view to match
            syncPagesViewOrder();

            // Update page count on card (just in case)
            const card = evt.from.closest('.pdf-card');
            if (card) {
                const countEl = card.querySelector('.page-count');
                if (countEl) countEl.textContent = file.pageOrder.length;
            }
        }
        return;
    }

    const sourceCard = evt.from.closest('.pdf-card');
    const targetCard = evt.to.closest('.pdf-card');
    if (!sourceCard || !targetCard) return;

    const targetFileId = targetCard.dataset.fileId;
    const pageIndex = parseInt(evt.item.dataset.pageIndex);

    const sourceFile = state.getFile(sourceFileId);
    const targetFile = state.getFile(targetFileId);
    if (!sourceFile || !targetFile) return;

    // Get rotation data from source
    const rotation = sourceFile.pageRotations[pageIndex] || 0;

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
    targetFile.pageRotations[newPageIndex] = rotation;

    // Update thumb element's data attributes (CRITICAL: update file ID!)
    evt.item.dataset.pageIndex = newPageIndex;
    evt.item.dataset.fileId = targetFileId; // <-- This was missing!
    evt.item.dataset.sourceFileId = sourceFileId;
    evt.item.dataset.sourcePageIndex = pageIndex;

    // Remove from source pageOrder
    sourceFile.pageOrder = sourceFile.pageOrder.filter(idx => idx !== pageIndex);

    // Update target pageOrder based on DOM
    targetFile.pageOrder = Array.from(evt.to.querySelectorAll('.page-thumb')).map(
        el => parseInt(el.dataset.pageIndex)
    );

    // Update page counts on cards
    const sourceCount = sourceCard.querySelector('.page-count');
    if (sourceCount) sourceCount.textContent = sourceFile.pageOrder.length;

    const targetCount = targetCard.querySelector('.page-count');
    if (targetCount) targetCount.textContent = targetFile.pageOrder.length;

    // Update Pages view identity for the moved page
    updatePageIdentity(sourceFileId, pageIndex, targetFileId, newPageIndex);

    // Sync Pages view (order changed)
    syncPagesViewOrder();
}

// ============================================
// Start Application
// ============================================

initApp().catch(console.error);
