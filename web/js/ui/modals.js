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
let offscreenCanvas = null;
let lightboxTitle = null;
let prevPageBtn = null;
let nextPageBtn = null;

// Password modal references
let passwordModal = null;
let passwordInput = null;
let passwordError = null;
let passwordModalFileName = null;
let passwordResolve = null; // Promise resolver for password modal

// Encryption Warning modal references
let encryptionWarningModal = null;
let warningFileList = null;
let encryptionWarningResolve = null;

// Redaction references
let lightboxContent = null;
let redactionCanvas = null;
let redactionCtx = null;
let redactModeBtn = null;
let clearRedactionsBtn = null;

// Redaction warning modal
let redactionWarningModal = null;
let redactionWarningResolve = null;

// Redaction state
let isRedactMode = false;
let isDrawing = false;
let drawStart = { x: 0, y: 0 };

/**
 * Initialize modals module with DOM references
 * @param {Object} elements - DOM element references
 */
export function initModals(elements) {
    helpModal = elements.helpModal;
    pageLightbox = elements.pageLightbox;
    lightboxCanvas = elements.lightboxCanvas;
    offscreenCanvas = document.createElement('canvas');
    lightboxTitle = elements.lightboxTitle;
    prevPageBtn = elements.prevPageBtn;
    nextPageBtn = elements.nextPageBtn;

    // Password modal references
    passwordModal = elements.passwordModal;
    passwordInput = elements.passwordInput;
    passwordError = elements.passwordError;
    passwordModalFileName = elements.passwordModalFileName;

    // Encryption Warning modal references
    encryptionWarningModal = elements.encryptionWarningModal;
    warningFileList = elements.warningFileList;

    // Redaction references
    lightboxContent = elements.lightboxContent;
    redactionCanvas = elements.redactionCanvas;
    if (redactionCanvas) {
        redactionCtx = redactionCanvas.getContext('2d');
    }
    redactModeBtn = elements.redactModeBtn;
    clearRedactionsBtn = elements.clearRedactionsBtn;

    // Redaction warning modal
    redactionWarningModal = elements.redactionWarningModal;

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

    // Password modal handlers
    elements.closePasswordModal?.addEventListener('click', () => {
        hidePasswordModal(null);
    });

    elements.cancelPasswordBtn?.addEventListener('click', () => {
        hidePasswordModal(null);
    });

    elements.submitPasswordBtn?.addEventListener('click', () => {
        const password = passwordInput?.value;
        if (password) {
            hidePasswordModal(password);
        }
    });

    // Enter key to submit password
    passwordInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const password = passwordInput?.value;
            if (password) {
                hidePasswordModal(password);
            }
        }
        if (e.key === 'Escape') {
            hidePasswordModal(null);
        }
    });

    // Toggle password visibility
    elements.togglePasswordVisibility?.addEventListener('click', () => {
        const eyeIcon = elements.eyeIcon;
        const eyeOffIcon = elements.eyeOffIcon;

        if (passwordInput?.type === 'password') {
            passwordInput.type = 'text';
            eyeIcon?.classList.add('hidden');
            eyeOffIcon?.classList.remove('hidden');
        } else {
            passwordInput.type = 'password';
            eyeIcon?.classList.remove('hidden');
            eyeOffIcon?.classList.add('hidden');
        }
    });

    // Click outside to cancel
    passwordModal?.addEventListener('click', (e) => {
        if (e.target === passwordModal) hidePasswordModal(null);
    });

    // Encryption Warning modal handlers
    elements.cancelWarningBtn?.addEventListener('click', () => {
        hideEncryptionWarningModal(false);
    });

    elements.proceedWarningBtn?.addEventListener('click', () => {
        hideEncryptionWarningModal(true);
    });

    encryptionWarningModal?.addEventListener('click', (e) => {
        if (e.target === encryptionWarningModal) hideEncryptionWarningModal(false);
    });

    // ============================================
    // Redaction Mode Handlers
    // ============================================

    // Toggle redact mode
    redactModeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleRedactMode();
    });

    // Clear redactions for current page
    clearRedactionsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearCurrentPageRedactions();
    });

    // Mouse events for drawing redaction rectangles
    lightboxContent?.addEventListener('mousedown', handleDrawStart);
    lightboxContent?.addEventListener('mousemove', handleDrawMove);
    lightboxContent?.addEventListener('mouseup', handleDrawEnd);
    lightboxContent?.addEventListener('mouseleave', handleDrawEnd);

    // Touch events for mobile
    lightboxContent?.addEventListener('touchstart', handleTouchStart, { passive: false });
    lightboxContent?.addEventListener('touchmove', handleTouchMove, { passive: false });
    lightboxContent?.addEventListener('touchend', handleTouchEnd);

    // Redaction warning modal handlers
    elements.cancelRedactionBtn?.addEventListener('click', () => {
        hideRedactionWarningModal(false);
    });

    elements.proceedRedactionBtn?.addEventListener('click', () => {
        hideRedactionWarningModal(true);
    });

    redactionWarningModal?.addEventListener('click', (e) => {
        if (e.target === redactionWarningModal) hideRedactionWarningModal(false);
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
// Password Modal
// ============================================

/**
 * Show password modal and wait for user input
 * @param {string} fileName - Name of the file requiring password
 * @param {boolean} [showError=false] - Whether to show error message
 * @returns {Promise<string|null>} - Password or null if cancelled
 */
export function showPasswordModal(fileName, showError = false) {
    return new Promise((resolve) => {
        passwordResolve = resolve;

        // Reset state
        if (passwordInput) passwordInput.value = '';
        if (passwordError) {
            if (showError) {
                passwordError.classList.remove('hidden');
            } else {
                passwordError.classList.add('hidden');
            }
        }
        if (passwordModalFileName) {
            passwordModalFileName.textContent = fileName;
        }

        passwordModal?.classList.remove('hidden');
        passwordInput?.focus();
    });
}

/**
 * Hide password modal and resolve with result
 * @param {string|null} password - Password or null if cancelled
 */
function hidePasswordModal(password) {
    passwordModal?.classList.add('hidden');
    if (passwordResolve) {
        passwordResolve(password);
        passwordResolve = null;
    }
}

// ============================================
// Encryption Warning Modal
// ============================================

/**
 * Show encryption warning modal
 * @param {Array} files - List of password-protected files
 * @returns {Promise<boolean>} - True to proceed, false to cancel
 */
export function showEncryptionWarningModal(files) {
    return new Promise((resolve) => {
        encryptionWarningResolve = resolve;

        // Populate file list
        if (warningFileList) {
            warningFileList.innerHTML = files.map(f =>
                `<div class="py-1 border-b border-gray-100 last:border-0 last:pb-0">• ${f.name}</div>`
            ).join('');
        }

        encryptionWarningModal?.classList.remove('hidden');
    });
}

function hideEncryptionWarningModal(proceed) {
    encryptionWarningModal?.classList.add('hidden');
    if (encryptionWarningResolve) {
        encryptionWarningResolve(proceed);
        encryptionWarningResolve = null;
    }
}

// ============================================
// Redaction Warning Modal
// ============================================

/**
 * Show redaction warning modal
 * @returns {Promise<boolean>} - True to proceed, false to cancel
 */
function showRedactionWarningModal() {
    return new Promise((resolve) => {
        redactionWarningResolve = resolve;
        redactionWarningModal?.classList.remove('hidden');
    });
}

function hideRedactionWarningModal(proceed) {
    redactionWarningModal?.classList.add('hidden');
    if (redactionWarningResolve) {
        redactionWarningResolve(proceed);
        redactionWarningResolve = null;
    }
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
 */
async function renderLightboxPage() {
    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const pageIndex = file.pageOrder[orderIndex]; // Real page index (0-based)
    const pageNum = pageIndex + 1;
    const rotation = file.pageRotations[pageIndex];

    lightboxTitle.textContent = `${file.name} - Page ${pageNum}`;

    // Render to offscreen canvas while old page stays visible
    const importedPage = file.importedPages?.find(p => p.newIndex === pageIndex);

    if (importedPage) {
        // Render from source file
        const sourceFile = state.getFile(importedPage.sourceFileId);
        if (sourceFile) {
            await renderPdfPage(sourceFile.pdfProxy, importedPage.sourcePageIndex + 1, offscreenCanvas, 1.5);
        }
    } else {
        // Render at higher resolution for lightbox
        await renderPdfPage(file.pdfProxy, pageNum, offscreenCanvas, 1.5);
    }

    // Atomic swap: copy rendered result to visible canvas in one frame
    lightboxCanvas.width = offscreenCanvas.width;
    lightboxCanvas.height = offscreenCanvas.height;
    lightboxCanvas.getContext('2d').drawImage(offscreenCanvas, 0, 0);

    // Apply rotation via CSS
    lightboxCanvas.style.transform = rotation ? `rotate(${rotation}deg)` : '';

    // Render any existing redactions on overlay
    // Use setTimeout to ensure canvas is laid out
    setTimeout(() => renderRedactionOverlay(), 50);

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

    // Exit redact mode when changing pages
    if (isRedactMode) toggleRedactMode();

    state.setLightboxState(fileId, newIndex);
    await renderLightboxPage();
}

// ============================================
// Redaction Functions
// ============================================

/**
 * Toggle redaction mode on/off
 */
async function toggleRedactMode() {
    if (!isRedactMode) {
        // Show styled warning modal before entering redact mode
        const confirmed = await showRedactionWarningModal();
        if (!confirmed) return;
    }

    isRedactMode = !isRedactMode;

    if (isRedactMode) {
        // Activate redact mode
        redactModeBtn?.classList.add('bg-red-400', 'ring-2', 'ring-white/60');
        redactModeBtn?.classList.remove('bg-red-600/80');
        redactModeBtn.querySelector('span').textContent = 'Drawing...';

        // Show clear button if there are existing redactions
        updateClearButtonVisibility();

        // Change cursor and enable drawing on redaction canvas
        if (redactionCanvas) {
            redactionCanvas.classList.remove('pointer-events-none');
            redactionCanvas.style.cursor = 'crosshair';
        }
        if (lightboxContent) {
            lightboxContent.style.cursor = 'crosshair';
        }
    } else {
        // Deactivate redact mode
        redactModeBtn?.classList.remove('bg-red-400', 'ring-2', 'ring-white/60');
        redactModeBtn?.classList.add('bg-red-600/80');
        redactModeBtn.querySelector('span').textContent = 'Redact';

        // Hide clear button
        clearRedactionsBtn?.classList.add('hidden');

        // Reset cursor
        if (redactionCanvas) {
            redactionCanvas.classList.add('pointer-events-none');
            redactionCanvas.style.cursor = '';
        }
        if (lightboxContent) {
            lightboxContent.style.cursor = '';
        }
    }
}

/**
 * Update clear button visibility based on existing redactions
 */
function updateClearButtonVisibility() {
    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const pageIndex = file.pageOrder[orderIndex];
    const redactions = state.getRedactions(fileId, pageIndex);

    if (redactions.length > 0 && isRedactMode) {
        clearRedactionsBtn?.classList.remove('hidden');
    } else {
        clearRedactionsBtn?.classList.add('hidden');
    }
}

/**
 * Clear redactions for the current page
 */
function clearCurrentPageRedactions() {
    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const pageIndex = file.pageOrder[orderIndex];
    state.clearRedactions(fileId, pageIndex);

    // Redraw (clear) the redaction canvas
    renderRedactionOverlay();
    updateClearButtonVisibility();
}

/**
 * Position and size redaction canvas to match lightbox canvas
 */
function syncRedactionCanvas() {
    if (!redactionCanvas || !lightboxCanvas) return;

    const rect = lightboxCanvas.getBoundingClientRect();
    const contentRect = lightboxContent.getBoundingClientRect();

    // Match the visual size
    redactionCanvas.style.width = rect.width + 'px';
    redactionCanvas.style.height = rect.height + 'px';
    redactionCanvas.style.left = (rect.left - contentRect.left) + 'px';
    redactionCanvas.style.top = (rect.top - contentRect.top) + 'px';

    // Set canvas internal resolution to match
    redactionCanvas.width = rect.width;
    redactionCanvas.height = rect.height;
}

/**
 * Render existing redactions on the overlay canvas
 */
function renderRedactionOverlay() {
    if (!redactionCtx || !lightboxCanvas) return;

    syncRedactionCanvas();

    const { fileId, orderIndex } = state.lightboxState;
    const file = state.getFile(fileId);
    if (!file) return;

    const pageIndex = file.pageOrder[orderIndex];
    const redactions = state.getRedactions(fileId, pageIndex);

    // Clear canvas
    redactionCtx.clearRect(0, 0, redactionCanvas.width, redactionCanvas.height);

    // Draw all existing redactions
    redactionCtx.fillStyle = 'black';
    for (const rect of redactions) {
        redactionCtx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
}

/**
 * Get canvas-relative coordinates from event
 */
function getCanvasCoords(e) {
    if (!lightboxCanvas) return { x: 0, y: 0 };

    const rect = lightboxCanvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

// Mouse event handlers
function handleDrawStart(e) {
    if (!isRedactMode) return;
    // Check if click is on the canvas area
    const rect = lightboxCanvas?.getBoundingClientRect();
    if (!rect) return;

    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) return;

    isDrawing = true;
    drawStart = getCanvasCoords(e);
}

function handleDrawMove(e) {
    if (!isRedactMode || !isDrawing) return;

    const current = getCanvasCoords(e);

    // Re-render existing redactions
    renderRedactionOverlay();

    // Draw preview rectangle
    redactionCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    redactionCtx.strokeStyle = 'red';
    redactionCtx.lineWidth = 2;

    const x = Math.min(drawStart.x, current.x);
    const y = Math.min(drawStart.y, current.y);
    const width = Math.abs(current.x - drawStart.x);
    const height = Math.abs(current.y - drawStart.y);

    redactionCtx.fillRect(x, y, width, height);
    redactionCtx.strokeRect(x, y, width, height);
}

function handleDrawEnd(e) {
    if (!isRedactMode || !isDrawing) return;
    isDrawing = false;

    const current = getCanvasCoords(e);

    const x = Math.min(drawStart.x, current.x);
    const y = Math.min(drawStart.y, current.y);
    const width = Math.abs(current.x - drawStart.x);
    const height = Math.abs(current.y - drawStart.y);

    // Only save if rectangle has meaningful size
    if (width > 5 && height > 5) {
        const { fileId, orderIndex } = state.lightboxState;
        const file = state.getFile(fileId);
        if (file) {
            const pageIndex = file.pageOrder[orderIndex];

            // Store with canvas dimensions for later coordinate conversion
            state.addRedaction(fileId, pageIndex, {
                x, y, width, height,
                canvasWidth: redactionCanvas.width,
                canvasHeight: redactionCanvas.height
            });
        }
    }

    // Render final state
    renderRedactionOverlay();
    updateClearButtonVisibility();
}

// Touch event handlers (wrap mouse handlers)
function handleTouchStart(e) {
    if (!isRedactMode) return;
    e.preventDefault();
    handleDrawStart(e.touches[0]);
}

function handleTouchMove(e) {
    if (!isRedactMode || !isDrawing) return;
    e.preventDefault();
    handleDrawMove(e.touches[0]);
}

function handleTouchEnd(e) {
    if (!isRedactMode) return;
    const touch = e.changedTouches?.[0];
    if (touch) handleDrawEnd(touch);
}
