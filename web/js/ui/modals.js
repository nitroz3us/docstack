/**
 * docstack Modal Handlers
 * 
 * Handles Help Modal and Page Lightbox functionality
 */

import * as state from '../state.js';
import { renderPdfPage } from '../utils/pdf.js';

// DOM element references
let helpModal = null;
let pageLightbox = null;
let lightboxCanvas = null;
let lightboxTitle = null;
let prevPageBtn = null;
let nextPageBtn = null;

/**
 * Initialize modals module with DOM references
 * @param {Object} elements - DOM element references
 */
export function initModals(elements) {
    helpModal = elements.helpModal;
    pageLightbox = elements.pageLightbox;
    lightboxCanvas = elements.lightboxCanvas;
    lightboxTitle = elements.lightboxTitle;
    prevPageBtn = elements.prevPageBtn;
    nextPageBtn = elements.nextPageBtn;

    // Setup close handlers
    elements.closeHelpModal?.addEventListener('click', () => hideHelpModal());
    elements.closeLightbox?.addEventListener('click', () => hideLightbox());

    helpModal?.addEventListener('click', (e) => {
        if (e.target === helpModal) hideHelpModal();
    });

    pageLightbox?.addEventListener('click', (e) => {
        if (e.target === pageLightbox) hideLightbox();
    });

    // Navigation handlers
    prevPageBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        changeLightboxPage(-1);
    });

    nextPageBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        changeLightboxPage(1);
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (pageLightbox?.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft') changeLightboxPage(-1);
        if (e.key === 'ArrowRight') changeLightboxPage(1);
        if (e.key === 'Escape') hideLightbox();
    });
}

// ============================================
// Help Modal
// ============================================

export function showHelpModal() {
    helpModal?.classList.remove('hidden');
}

export function hideHelpModal() {
    helpModal?.classList.add('hidden');
}

// ============================================
// Page Lightbox
// ============================================

/**
 * Show page in lightbox
 * @param {string} fileId 
 * @param {number} orderIndex - Index in file's pageOrder
 */
export async function showPageLightbox(fileId, orderIndex) {
    state.setLightboxState(fileId, orderIndex);
    // Render BEFORE showing modal to prevent flicker
    await renderLightboxPage();
    pageLightbox?.classList.remove('hidden');
}

export function hideLightbox() {
    pageLightbox?.classList.add('hidden');
}

/**
 * Render current lightbox page
 * @param {boolean} animate - Whether to animate transition
 */
async function renderLightboxPage(animate = false) {
    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const pageIndex = file.pageOrder[orderIndex]; // Real page index (0-based)
    const pageNum = pageIndex + 1;
    const rotation = file.pageRotations[pageIndex];

    lightboxTitle.textContent = `${file.name} - Page ${pageNum}`;

    // Fade out before rendering (for navigation transitions)
    if (animate) {
        lightboxCanvas.style.opacity = '0';
        await new Promise(r => setTimeout(r, 100));
    }

    // Render at higher resolution for lightbox
    await renderPdfPage(file.pdfProxy, pageNum, lightboxCanvas, 1.5);

    // Apply rotation via CSS
    lightboxCanvas.style.transform = rotation ? `rotate(${rotation}deg)` : '';

    // Fade back in
    if (animate) {
        lightboxCanvas.style.opacity = '1';
    }

    // Update Navigation Buttons
    if (orderIndex > 0) {
        prevPageBtn?.classList.remove('hidden');
    } else {
        prevPageBtn?.classList.add('hidden');
    }

    if (orderIndex < file.pageOrder.length - 1) {
        nextPageBtn?.classList.remove('hidden');
    } else {
        nextPageBtn?.classList.add('hidden');
    }
}

/**
 * Change lightbox page
 * @param {number} delta - Direction (-1 for prev, 1 for next)
 */
async function changeLightboxPage(delta) {
    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const newIndex = orderIndex + delta;
    if (newIndex < 0 || newIndex >= file.pageOrder.length) return;

    state.setLightboxState(fileId, newIndex);
    await renderLightboxPage(true);
}
