import * as state from '../state.js';
import { renderPdfPage } from '../utils/pdf.js';

let elements = null;
const dialogStack = [];
let passwordResolve = null;
let encryptionResolve = null;
let redactionResolve = null;
let currentPageId = null;
let isRedactMode = false;
let isDrawing = false;
let drawStart = null;
let redactionWarningAcknowledged = false;

const focusableSelector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getAppSurfaces() {
    return [document.querySelector('.app-header'), document.querySelector('main'), elements.exportBar]
        .filter(Boolean);
}

function openDialog(dialog, trigger, options = {}) {
    const previous = dialogStack.at(-1);
    if (previous) previous.dialog.inert = true;
    else getAppSurfaces().forEach(surface => { surface.inert = true; });

    const entry = { dialog, trigger: trigger || document.activeElement, escape: options.escape };
    dialogStack.push(entry);
    dialog.classList.remove('hidden');
    document.body.classList.add('dialog-open');
    window.requestAnimationFrame(() => {
        const initial = options.initialFocus || dialog.querySelector(focusableSelector);
        initial?.focus();
    });
}

function closeDialog(dialog, { restoreFocus = true } = {}) {
    const index = dialogStack.findIndex(entry => entry.dialog === dialog);
    if (index < 0) return;
    const [entry] = dialogStack.splice(index, 1);
    dialog.classList.add('hidden');
    dialog.inert = false;

    const previous = dialogStack.at(-1);
    if (previous) previous.dialog.inert = false;
    else {
        getAppSurfaces().forEach(surface => { surface.inert = false; });
        document.body.classList.remove('dialog-open');
    }
    if (restoreFocus) entry.trigger?.focus?.();
}

function handleDialogKeydown(event) {
    const active = dialogStack.at(-1);
    if (!active) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        active.escape?.();
        return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [...active.dialog.querySelectorAll(focusableSelector)]
        .filter(element => !element.hidden && element.getClientRects().length > 0);
    if (focusable.length === 0) {
        event.preventDefault();
        return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function setupBackdropCancel(dialog, cancel) {
    dialog.addEventListener('mousedown', event => {
        if (event.target === dialog) cancel();
    });
}

export function showPasswordModal(fileName, showError = false) {
    return new Promise(resolve => {
        passwordResolve = resolve;
        elements.passwordModalFileName.textContent = fileName;
        elements.passwordInput.value = '';
        elements.passwordInput.type = 'password';
        elements.showPasswordCheckbox.checked = false;
        elements.passwordError.classList.toggle('hidden', !showError);
        openDialog(elements.passwordModal, document.activeElement, {
            initialFocus: elements.passwordInput,
            escape: () => hidePasswordModal(null),
        });
    });
}

function hidePasswordModal(value) {
    closeDialog(elements.passwordModal);
    passwordResolve?.(value);
    passwordResolve = null;
}

export function showEncryptionWarningModal(files) {
    return new Promise(resolve => {
        encryptionResolve = resolve;
        const fragment = document.createDocumentFragment();
        files.forEach(file => {
            const item = document.createElement('li');
            item.textContent = file.name;
            fragment.appendChild(item);
        });
        elements.warningFileList.replaceChildren(fragment);
        openDialog(elements.encryptionWarningModal, document.activeElement, {
            initialFocus: elements.cancelWarningBtn,
            escape: () => hideEncryptionWarningModal(false),
        });
    });
}

function hideEncryptionWarningModal(proceed) {
    closeDialog(elements.encryptionWarningModal);
    encryptionResolve?.(proceed);
    encryptionResolve = null;
}

function showRedactionWarningModal() {
    if (redactionWarningAcknowledged) return Promise.resolve(true);
    return new Promise(resolve => {
        redactionResolve = resolve;
        openDialog(elements.redactionWarningModal, elements.redactModeBtn, {
            initialFocus: elements.cancelRedactionBtn,
            escape: () => hideRedactionWarningModal(false),
        });
    });
}

function hideRedactionWarningModal(proceed) {
    if (proceed) redactionWarningAcknowledged = true;
    closeDialog(elements.redactionWarningModal);
    redactionResolve?.(proceed);
    redactionResolve = null;
}

function syncRedactionCanvas() {
    const canvasRect = elements.lightboxCanvas.getBoundingClientRect();
    const contentRect = elements.lightboxContent.getBoundingClientRect();
    const overlay = elements.redactionCanvas;
    overlay.style.left = `${canvasRect.left - contentRect.left}px`;
    overlay.style.top = `${canvasRect.top - contentRect.top}px`;
    overlay.style.width = `${canvasRect.width}px`;
    overlay.style.height = `${canvasRect.height}px`;
    overlay.width = Math.max(1, Math.round(canvasRect.width));
    overlay.height = Math.max(1, Math.round(canvasRect.height));
}

function renderRedactionOverlay(previewRect = null) {
    syncRedactionCanvas();
    const page = state.getPage(currentPageId);
    const overlay = elements.redactionCanvas;
    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);
    context.fillStyle = '#000000';
    page?.redactions.forEach(rect => {
        context.fillRect(rect.x * overlay.width, rect.y * overlay.height, rect.width * overlay.width, rect.height * overlay.height);
    });
    if (previewRect) {
        context.fillStyle = 'rgba(0, 0, 0, 0.55)';
        context.strokeStyle = '#ef4444';
        context.lineWidth = 2;
        context.fillRect(previewRect.x, previewRect.y, previewRect.width, previewRect.height);
        context.strokeRect(previewRect.x, previewRect.y, previewRect.width, previewRect.height);
    }
    elements.clearRedactionsBtn.classList.toggle('hidden', !page?.redactions.length);
}

async function renderLightboxPage() {
    const page = state.getPage(currentPageId);
    const file = page && state.getFile(page.sourceFileId);
    if (!page || !file) return;
    const position = state.compositionPages.findIndex(item => item.id === page.id);
    elements.lightboxTitle.textContent = file.name;
    elements.lightboxPosition.textContent = `Page ${position + 1} of ${state.compositionPages.length} · source page ${page.sourcePageIndex + 1}`;
    await renderPdfPage(file.pdfProxy, page.sourcePageIndex + 1, elements.lightboxCanvas, {
        scale: 1.5,
        rotation: page.rotation,
    });
    elements.prevPageBtn.disabled = position <= 0;
    elements.nextPageBtn.disabled = position >= state.compositionPages.length - 1;
    window.requestAnimationFrame(() => renderRedactionOverlay());
}

export async function showPageLightbox(pageId, trigger) {
    if (!state.getPage(pageId)) return;
    currentPageId = pageId;
    openDialog(elements.pageLightbox, trigger, {
        initialFocus: elements.closeLightbox,
        escape: hideLightbox,
    });
    await renderLightboxPage();
}

export function hideLightbox() {
    setRedactMode(false);
    closeDialog(elements.pageLightbox);
    currentPageId = null;
}

async function changeLightboxPage(delta) {
    const index = state.compositionPages.findIndex(page => page.id === currentPageId);
    const next = state.compositionPages[index + delta];
    if (!next) return;
    setRedactMode(false);
    currentPageId = next.id;
    await renderLightboxPage();
}

function setRedactMode(active) {
    isRedactMode = active;
    elements.redactModeBtn.setAttribute('aria-pressed', String(active));
    elements.redactModeBtn.setAttribute('aria-label', active ? 'Finish redacting' : 'Enter redaction mode');
    elements.redactModeBtn.textContent = active ? 'Done' : 'Redact';
    elements.redactionCanvas.classList.toggle('redaction-canvas--active', active);
}

async function toggleRedactMode() {
    if (!isRedactMode && !await showRedactionWarningModal()) return;
    setRedactMode(!isRedactMode);
}

function pointerPosition(event) {
    const rect = elements.redactionCanvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        width: rect.width,
        height: rect.height,
    };
}

function startRedaction(event) {
    if (!isRedactMode) return;
    event.preventDefault();
    isDrawing = true;
    drawStart = pointerPosition(event);
    elements.redactionCanvas.setPointerCapture?.(event.pointerId);
}

function moveRedaction(event) {
    if (!isDrawing) return;
    const current = pointerPosition(event);
    renderRedactionOverlay({
        x: Math.min(drawStart.x, current.x),
        y: Math.min(drawStart.y, current.y),
        width: Math.abs(current.x - drawStart.x),
        height: Math.abs(current.y - drawStart.y),
    });
}

function endRedaction(event) {
    if (!isDrawing) return;
    isDrawing = false;
    const current = pointerPosition(event);
    const rect = {
        x: Math.min(drawStart.x, current.x),
        y: Math.min(drawStart.y, current.y),
        width: Math.abs(current.x - drawStart.x),
        height: Math.abs(current.y - drawStart.y),
    };
    if (rect.width >= 6 && rect.height >= 6) {
        state.addRedaction(currentPageId, {
            x: rect.x / current.width,
            y: rect.y / current.height,
            width: rect.width / current.width,
            height: rect.height / current.height,
        });
    }
    renderRedactionOverlay();
}

export function showExportProgress() {
    elements.exportProgressBar.style.width = '0%';
    elements.exportProgressIndicator.setAttribute('aria-valuenow', '0');
    elements.exportProgressText.textContent = 'Starting export…';
    openDialog(elements.exportProgressModal, document.activeElement, {
        initialFocus: elements.cancelExportBtn,
        escape: () => elements.cancelExportBtn.click(),
    });
}

export function updateExportProgress({ stage, current, total }) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    elements.exportProgressText.textContent = stage;
    elements.exportProgressBar.style.width = `${percent}%`;
    elements.exportProgressIndicator.setAttribute('aria-valuenow', String(percent));
}

export function hideExportProgress() {
    closeDialog(elements.exportProgressModal);
}

export function initModals(domElements) {
    elements = domElements;
    document.addEventListener('keydown', handleDialogKeydown, true);
    window.addEventListener('resize', () => {
        if (currentPageId) window.requestAnimationFrame(() => renderRedactionOverlay());
    });

    elements.closePasswordModal.addEventListener('click', () => hidePasswordModal(null));
    elements.cancelPasswordBtn.addEventListener('click', () => hidePasswordModal(null));
    elements.submitPasswordBtn.addEventListener('click', () => {
        if (elements.passwordInput.value) hidePasswordModal(elements.passwordInput.value);
    });
    elements.passwordInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && elements.passwordInput.value) hidePasswordModal(elements.passwordInput.value);
    });
    elements.showPasswordCheckbox.addEventListener('change', () => {
        elements.passwordInput.type = elements.showPasswordCheckbox.checked ? 'text' : 'password';
    });
    setupBackdropCancel(elements.passwordModal, () => hidePasswordModal(null));

    elements.cancelWarningBtn.addEventListener('click', () => hideEncryptionWarningModal(false));
    elements.proceedWarningBtn.addEventListener('click', () => hideEncryptionWarningModal(true));
    setupBackdropCancel(elements.encryptionWarningModal, () => hideEncryptionWarningModal(false));

    elements.cancelRedactionBtn.addEventListener('click', () => hideRedactionWarningModal(false));
    elements.proceedRedactionBtn.addEventListener('click', () => hideRedactionWarningModal(true));
    setupBackdropCancel(elements.redactionWarningModal, () => hideRedactionWarningModal(false));

    elements.closeLightbox.addEventListener('click', hideLightbox);
    elements.prevPageBtn.addEventListener('click', () => changeLightboxPage(-1));
    elements.nextPageBtn.addEventListener('click', () => changeLightboxPage(1));
    elements.redactModeBtn.addEventListener('click', toggleRedactMode);
    elements.clearRedactionsBtn.addEventListener('click', () => {
        state.clearRedactions(currentPageId);
        renderRedactionOverlay();
    });
    elements.redactionCanvas.addEventListener('pointerdown', startRedaction);
    elements.redactionCanvas.addEventListener('pointermove', moveRedaction);
    elements.redactionCanvas.addEventListener('pointerup', endRedaction);
    elements.redactionCanvas.addEventListener('pointercancel', endRedaction);
    elements.pageLightbox.addEventListener('keydown', event => {
        if (dialogStack.at(-1)?.dialog !== elements.pageLightbox) return;
        if (event.key === 'ArrowLeft') changeLightboxPage(-1);
        if (event.key === 'ArrowRight') changeLightboxPage(1);
    });
}
