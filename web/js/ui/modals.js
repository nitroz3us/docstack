import * as state from '../state.js';
import { renderPdfPage } from '../utils/pdf.js';
import { showToast } from './toast.js';
import { drawPageThumbnail, paintCachedThumbnail } from './thumbnails.js';
import { renderThumbnailRedactions } from './components.js';
import { ensureSortable } from './views.js';

let elements = null;
const dialogStack = [];
let passwordResolve = null;
let encryptionResolve = null;
let redactionResolve = null;
let currentPageId = null;
let isRedactMode = false;
let drawing = null;
let selectedRedaction = null;
let filmstripKey = null;
let filmstripObserver = null;
let filmstripSortable = null;
// After a drop, keep the strip where the page landed instead of scrolling back to the open page.
let keepFilmstripScroll = false;
let filmstripDragEndedAt = 0;
let swipe = null;
let shownPageId = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let redactionWarningAcknowledged = false;
let renderToken = 0;
let lightboxCloseHandler = null;
let renderedKey = null;
const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 3];
let zoomIndex = 0;

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

/* ---------- Redaction boxes ---------- */

function describeBoxCount(count) {
    if (count === 0) return 'No boxes yet';
    return `${count} box${count === 1 ? '' : 'es'}`;
}

/** Boxes are elements over the page, stored as fractions of the page, so they scale with zoom. */
function renderRedactionBoxes() {
    const page = state.getPage(currentPageId);
    const layer = elements.redactionLayer;
    const redactions = page?.redactions || [];
    if (selectedRedaction !== null && selectedRedaction >= redactions.length) selectedRedaction = null;

    const fragment = document.createDocumentFragment();
    redactions.forEach((rect, index) => {
        const box = document.createElement('div');
        box.className = `redaction-box${index === selectedRedaction ? ' redaction-box--selected' : ''}`;
        box.dataset.index = String(index);
        Object.assign(box.style, {
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
        });
        if (isRedactMode) {
            box.tabIndex = 0;
            box.setAttribute('role', 'button');
            box.setAttribute('aria-pressed', String(index === selectedRedaction));
            box.setAttribute('aria-label', `Redaction ${index + 1} of ${redactions.length}`);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'redaction-box__remove';
            remove.dataset.removeRedaction = String(index);
            remove.setAttribute('aria-label', `Remove redaction ${index + 1}`);
            remove.title = 'Remove (Delete)';
            remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
            box.appendChild(remove);
        }
        fragment.appendChild(box);
    });
    layer.replaceChildren(fragment);

    elements.redactionCount.textContent = describeBoxCount(redactions.length);
    elements.undoLastRedactionBtn.disabled = redactions.length === 0;
    elements.clearRedactionsBtn.disabled = redactions.length === 0;
}

function selectRedaction(index, { focus = false } = {}) {
    selectedRedaction = index;
    renderRedactionBoxes();
    if (focus && index !== null) elements.redactionLayer.querySelector(`[data-index="${index}"]`)?.focus();
}

function removeRedactionAt(index) {
    const count = state.getPage(currentPageId)?.redactions.length ?? 0;
    if (index === null || index >= count) return;
    selectedRedaction = null;
    state.removeRedaction(currentPageId, index);
    // State changes re-render synchronously, so the layer is current here. Keep keyboard users
    // in the layer by selecting the box that took this one's place.
    const next = Math.min(index, count - 2);
    if (next >= 0) selectRedaction(next, { focus: true });
    else elements.redactModeBtn.focus();
}

function layerPosition(event) {
    const rect = elements.redactionLayer.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        pixelWidth: rect.width,
        pixelHeight: rect.height,
    };
}

function boxBetween(start, end) {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function startRedaction(event) {
    if (!isRedactMode || event.button !== 0) return;
    if (event.target.closest('.redaction-box__remove')) return;
    const box = event.target.closest('.redaction-box');
    event.preventDefault();
    if (box) {
        selectRedaction(Number(box.dataset.index), { focus: true });
        return;
    }
    if (selectedRedaction !== null) selectRedaction(null);
    const start = layerPosition(event);
    const preview = document.createElement('div');
    preview.className = 'redaction-box redaction-box--drawing';
    elements.redactionLayer.appendChild(preview);
    drawing = { start, preview };
    elements.redactionLayer.setPointerCapture?.(event.pointerId);
}

function moveRedaction(event) {
    if (!drawing) return;
    const rect = boxBetween(drawing.start, layerPosition(event));
    Object.assign(drawing.preview.style, {
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.width * 100}%`,
        height: `${rect.height * 100}%`,
    });
}

function endRedaction(event) {
    if (!drawing) return;
    const end = layerPosition(event);
    const rect = boxBetween(drawing.start, end);
    drawing.preview.remove();
    drawing = null;
    // Ignore accidental clicks: a box must be at least a few pixels in each direction.
    if (rect.width * end.pixelWidth >= 6 && rect.height * end.pixelHeight >= 6) {
        state.addRedaction(currentPageId, rect);
    }
}

function setRedactMode(active) {
    filmstripSortable?.option('disabled', active);
    if (active) closeMovePopover();
    elements.movePreviewBtn.disabled = active;
    isRedactMode = active;
    selectedRedaction = null;
    drawing?.preview.remove();
    drawing = null;
    elements.redactModeBtn.setAttribute('aria-pressed', String(active));
    elements.redactionLayer.classList.toggle('redaction-layer--active', active);
    elements.redactionBanner.classList.toggle('hidden', !active);
    elements.pageLightbox.classList.toggle('viewer--redacting', active);
    renderRedactionBoxes();
    // The banner changes the stage height, so refit the page (reading layout forces the reflow).
    applyZoom();
}

async function toggleRedactMode() {
    if (!isRedactMode && !await showRedactionWarningModal()) return;
    setRedactMode(!isRedactMode);
}

/* ---------- Filmstrip ---------- */

function renderFilmstrip() {
    const pages = state.compositionPages;
    // Rebuild only when pages are added, removed, reordered or rotated; redaction marks update in place.
    const key = pages.map(page => `${page.id}:${page.rotation}`).join('|');
    if (key !== filmstripKey) {
        filmstripKey = key;
        // Rebuilding replaces the buttons, so carry keyboard focus over to the same page.
        const focusedPageId = elements.lightboxFilmstrip.contains(document.activeElement)
            ? document.activeElement.closest('.filmstrip__item')?.dataset.pageId
            : null;
        filmstripObserver?.disconnect();
        filmstripObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                filmstripObserver.unobserve(entry.target);
                const page = state.getPage(entry.target.dataset.pageId);
                const file = page && state.getFile(page.sourceFileId);
                if (page && file) drawPageThumbnail(entry.target.querySelector('canvas'), page, file).catch(() => {});
            });
        }, { root: elements.lightboxFilmstrip, rootMargin: '300px' });

        const fragment = document.createDocumentFragment();
        pages.forEach((page, index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'filmstrip__item';
            item.dataset.pageId = page.id;
            const thumb = document.createElement('span');
            thumb.className = 'filmstrip__thumb';
            const canvas = document.createElement('canvas');
            const sideways = page.rotation % 180 !== 0;
            canvas.width = sideways ? 22 : 17;
            canvas.height = sideways ? 17 : 22;
            canvas.dataset.rendered = 'false';
            paintCachedThumbnail(canvas, page);
            // The paper wrapper hugs the canvas so redaction boxes line up with the page.
            const paper = document.createElement('span');
            paper.className = 'filmstrip__paper';
            paper.appendChild(canvas);
            thumb.appendChild(paper);
            const number = document.createElement('span');
            number.className = 'filmstrip__number';
            number.textContent = String(index + 1);
            item.append(thumb, number);
            fragment.appendChild(item);
            filmstripObserver.observe(item);
        });
        elements.lightboxFilmstrip.replaceChildren(fragment);
        if (focusedPageId) {
            elements.lightboxFilmstrip.querySelector(`[data-page-id="${focusedPageId}"]`)?.focus({ preventScroll: true });
        }
    }

    elements.lightboxFilmstrip.querySelectorAll('.filmstrip__item').forEach((item, index) => {
        const redactions = state.getPage(item.dataset.pageId)?.redactions || [];
        const redacted = redactions.length > 0;
        renderThumbnailRedactions(item.querySelector('.filmstrip__paper'), redactions);
        item.setAttribute('aria-label', `Page ${index + 1}${redacted ? ', redacted' : ''}`);
        if (item.dataset.pageId === currentPageId) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    if (keepFilmstripScroll) keepFilmstripScroll = false;
    else elements.lightboxFilmstrip.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Sortable's floating copy is a plain DOM clone, which drops canvas pixels. Once it exists,
 * paint the thumbnail into it.
 */
function paintFilmstripDragCopy(item, attempt = 0) {
    const copy = document.querySelector('body > .filmstrip__item--dragging');
    if (!copy) {
        if (attempt < 20) requestAnimationFrame(() => paintFilmstripDragCopy(item, attempt + 1));
        return;
    }
    const source = item.querySelector('canvas');
    const target = copy.querySelector('canvas');
    if (source?.dataset.rendered !== 'true' || !target) return;
    target.width = source.width;
    target.height = source.height;
    target.dataset.rendered = 'true';
    target.getContext('2d', { alpha: false }).drawImage(source, 0, 0);
}

/** Drag pages in the preview's strip to reorder the document, like in the page grid. */
async function setupFilmstripSorting() {
    if (filmstripSortable) return;
    try {
        const Sortable = await ensureSortable();
        if (filmstripSortable) return;
        filmstripSortable = new Sortable(elements.lightboxFilmstrip, {
            animation: 160,
            draggable: '.filmstrip__item',
            forceFallback: true,
            fallbackTolerance: 4,
            fallbackOnBody: true,
            fallbackClass: 'filmstrip__item--dragging',
            ghostClass: 'filmstrip__item--ghost',
            // On touch screens, press and hold to lift a page so the strip still scrolls.
            delay: 150,
            delayOnTouchOnly: true,
            disabled: isRedactMode,
            onStart: ({ item }) => paintFilmstripDragCopy(item),
            onEnd: ({ item }) => {
                filmstripDragEndedAt = performance.now();
                const order = [...elements.lightboxFilmstrip.querySelectorAll('.filmstrip__item')].map(entry => entry.dataset.pageId);
                if (!order.every((id, index) => id === state.compositionPages[index]?.id)) {
                    keepFilmstripScroll = true;
                    if (!state.setPageOrder(order)) {
                        keepFilmstripScroll = false;
                        filmstripKey = null;
                        renderFilmstrip();
                    }
                }
                // Moving the pressed button during the drag drops its focus; give it back so shortcuts keep working.
                elements.lightboxFilmstrip.querySelector(`[data-page-id="${item.dataset.pageId}"]`)?.focus({ preventScroll: true });
            },
        });
    } catch (error) {
        showToast(error.message || 'Page reordering could not be loaded.', { tone: 'error' });
    }
}

function isMovePopoverOpen() {
    return !elements.movePageForm.classList.contains('hidden');
}

function closeMovePopover({ restoreFocus = false } = {}) {
    if (!isMovePopoverOpen()) return;
    elements.movePageForm.classList.add('hidden');
    elements.movePreviewBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) elements.movePreviewBtn.focus();
}

/** "Move to page…": type a position for the open page, for moves too long to drag. */
function openMovePopover() {
    const total = state.compositionPages.length;
    if (isRedactMode || total < 2) return;
    if (isMovePopoverOpen()) {
        closeMovePopover({ restoreFocus: true });
        return;
    }
    const position = state.compositionPages.findIndex(page => page.id === currentPageId) + 1;
    elements.movePageInput.value = String(position);
    elements.movePageTotal.textContent = `of ${total}`;
    elements.movePageCurrent.textContent = `Currently page ${position}`;
    elements.movePageError.classList.add('hidden');
    elements.movePageInput.removeAttribute('aria-invalid');
    elements.movePageForm.classList.remove('hidden');
    elements.movePreviewBtn.setAttribute('aria-expanded', 'true');

    // Sit under the Move button, kept inside the preview.
    const dialog = elements.movePageForm.offsetParent.getBoundingClientRect();
    const anchor = elements.movePreviewBtn.getBoundingClientRect();
    const width = elements.movePageForm.offsetWidth;
    const left = Math.max(12, Math.min(anchor.right - dialog.left - width, dialog.width - width - 12));
    elements.movePageForm.style.left = `${left}px`;
    elements.movePageForm.style.top = `${anchor.bottom - dialog.top + 6}px`;
    elements.movePageInput.focus();
    elements.movePageInput.select();
}

function submitMovePopover(event) {
    event.preventDefault();
    const total = state.compositionPages.length;
    const value = elements.movePageInput.value.trim();
    const target = /^\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isInteger(target) || target < 1 || target > total) {
        elements.movePageError.textContent = `Enter a page from 1 to ${total}.`;
        elements.movePageError.classList.remove('hidden');
        elements.movePageInput.setAttribute('aria-invalid', 'true');
        elements.movePageInput.select();
        return;
    }
    closeMovePopover({ restoreFocus: true });
    const order = state.compositionPages.map(page => page.id).filter(id => id !== currentPageId);
    order.splice(target - 1, 0, currentPageId);
    if (order.some((id, index) => id !== state.compositionPages[index].id)) state.setPageOrder(order);
}

/** Move the open page one place earlier or later, keeping it open. */
function moveCurrentPage(delta) {
    if (isRedactMode) return;
    state.movePage(currentPageId, delta);
}

function isLightboxOpen() {
    return Boolean(currentPageId) && !elements.pageLightbox.classList.contains('hidden');
}

/** Size the rendered canvas: fit inside the stage, or a multiple of that fit when zoomed. */
function applyZoom() {
    const canvas = elements.lightboxCanvas;
    const zoom = ZOOM_LEVELS[zoomIndex];
    const zoomed = zoomIndex > 0;
    elements.lightboxContent.classList.toggle('preview-canvas-wrap--zoomed', zoomed);
    elements.zoomFitBtn.textContent = zoomed ? `${Math.round(zoom * 100)}%` : 'Fit';
    elements.zoomOutBtn.disabled = !zoomed;
    elements.zoomInBtn.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
    if (!canvas.width || !canvas.height) return;
    const content = elements.lightboxContent;
    const styles = getComputedStyle(content);
    const availableWidth = content.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const availableHeight = content.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    const fitRatio = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    canvas.style.width = `${Math.max(80, Math.floor(canvas.width * fitRatio * zoom))}px`;
}

async function renderLightboxPage() {
    const page = state.getPage(currentPageId);
    const file = page && state.getFile(page.sourceFileId);
    if (!page || !file) return;
    const position = state.compositionPages.findIndex(item => item.id === page.id);
    elements.lightboxTitle.textContent = file.name;
    elements.lightboxPosition.textContent = `Page ${position + 1} of ${state.compositionPages.length} · source page ${page.sourcePageIndex + 1}`;
    elements.prevPageBtn.disabled = position <= 0;
    elements.nextPageBtn.disabled = position >= state.compositionPages.length - 1;
    elements.movePreviewBtn.disabled = isRedactMode || state.compositionPages.length < 2;
    renderFilmstrip();

    const renderScale = Math.min(4, 1.5 * ZOOM_LEVELS[zoomIndex]) * Math.min(2, window.devicePixelRatio || 1);
    const key = `${page.id}:${page.rotation}:${renderScale}`;
    if (key === renderedKey) {
        applyZoom();
        renderRedactionBoxes();
        return;
    }

    // Render off-screen so the previous page stays visible until the new one is ready.
    const token = ++renderToken;
    const spinnerTimer = window.setTimeout(() => elements.lightboxSpinner.classList.remove('hidden'), 120);
    const buffer = document.createElement('canvas');
    try {
        await renderPdfPage(file.pdfProxy, page.sourcePageIndex + 1, buffer, {
            scale: renderScale,
            rotation: page.rotation,
        });
    } catch (error) {
        if (token === renderToken) showToast('This page could not be displayed.', { tone: 'error' });
        return;
    } finally {
        window.clearTimeout(spinnerTimer);
        if (token === renderToken) elements.lightboxSpinner.classList.add('hidden');
    }
    if (token !== renderToken || !isLightboxOpen()) return;

    const canvas = elements.lightboxCanvas;
    canvas.width = buffer.width;
    canvas.height = buffer.height;
    canvas.getContext('2d', { alpha: false }).drawImage(buffer, 0, 0);
    canvas.classList.remove('preview-canvas--empty');
    renderedKey = key;
    applyZoom();
    renderRedactionBoxes();
    // A short fade marks a change of page (not a zoom or rotation of the same page).
    if (shownPageId && shownPageId !== page.id && !reducedMotion.matches) {
        elements.lightboxPage.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 170, easing: 'ease-out' });
    }
    shownPageId = page.id;
}

export async function showPageLightbox(pageId, trigger) {
    if (!state.getPage(pageId)) return;
    currentPageId = pageId;
    zoomIndex = 0;
    renderedKey = null;
    elements.lightboxCanvas.classList.add('preview-canvas--empty');
    filmstripKey = null;
    openDialog(elements.pageLightbox, trigger, {
        initialFocus: elements.closeLightbox,
        // Escape steps back one level: close the move box, deselect a box, leave redaction, then close.
        escape: () => {
            if (isMovePopoverOpen()) closeMovePopover({ restoreFocus: true });
            else if (isRedactMode && selectedRedaction !== null) selectRedaction(null);
            else if (isRedactMode) setRedactMode(false);
            else hideLightbox();
        },
    });
    setupFilmstripSorting();
    await renderLightboxPage();
}

export function hideLightbox() {
    const closedPageId = currentPageId;
    closeMovePopover();
    setRedactMode(false);
    closeDialog(elements.pageLightbox, { restoreFocus: !lightboxCloseHandler });
    currentPageId = null;
    lightboxCloseHandler?.(closedPageId);
    renderedKey = null;
    renderToken++;
    filmstripObserver?.disconnect();
    filmstripKey = null;
    shownPageId = null;
}

/** Keep the open preview in sync after any state change (rotate, delete, undo, redo). */
export function refreshLightbox() {
    if (!isLightboxOpen()) return;
    if (!state.getPage(currentPageId)) {
        hideLightbox();
        return;
    }
    renderLightboxPage();
}

async function changeLightboxPage(delta) {
    const index = state.compositionPages.findIndex(page => page.id === currentPageId);
    const next = state.compositionPages[index + delta];
    if (!next) return;
    setRedactMode(false);
    currentPageId = next.id;
    elements.lightboxContent.scrollTo(0, 0);
    await renderLightboxPage();
}

function setZoom(nextIndex) {
    const clamped = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, nextIndex));
    if (clamped === zoomIndex) return;
    zoomIndex = clamped;
    renderLightboxPage();
}

function rotatePreviewPage() {
    state.rotatePages([currentPageId]);
}

function deletePreviewPage() {
    const index = state.compositionPages.findIndex(page => page.id === currentPageId);
    const neighbor = state.compositionPages[index + 1] || state.compositionPages[index - 1];
    const deletedId = currentPageId;
    setRedactMode(false);
    // Move to the neighbour first so the state-change refresh shows it instead of closing.
    if (neighbor) currentPageId = neighbor.id;
    state.deletePage(deletedId);
    if (!neighbor) hideLightbox();
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

export function initModals(domElements, { onLightboxClose } = {}) {
    elements = domElements;
    lightboxCloseHandler = onLightboxClose || null;
    document.addEventListener('keydown', handleDialogKeydown, true);
    window.addEventListener('resize', () => {
        if (currentPageId) applyZoom();
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
    setupBackdropCancel(elements.pageLightbox, hideLightbox);
    elements.zoomInBtn.addEventListener('click', () => setZoom(zoomIndex + 1));
    elements.zoomOutBtn.addEventListener('click', () => setZoom(zoomIndex - 1));
    elements.zoomFitBtn.addEventListener('click', () => setZoom(0));
    elements.rotatePreviewBtn.addEventListener('click', rotatePreviewPage);
    elements.deletePreviewBtn.addEventListener('click', deletePreviewPage);
    elements.prevPageBtn.addEventListener('click', () => changeLightboxPage(-1));
    elements.nextPageBtn.addEventListener('click', () => changeLightboxPage(1));
    elements.redactModeBtn.addEventListener('click', toggleRedactMode);
    elements.movePreviewBtn.addEventListener('click', openMovePopover);
    elements.movePageForm.addEventListener('submit', submitMovePopover);
    elements.cancelMovePageBtn.addEventListener('click', () => closeMovePopover({ restoreFocus: true }));
    elements.pageLightbox.addEventListener('pointerdown', event => {
        if (!isMovePopoverOpen()) return;
        if (elements.movePageForm.contains(event.target) || elements.movePreviewBtn.contains(event.target)) return;
        closeMovePopover();
    });
    elements.finishRedactionBtn.addEventListener('click', () => setRedactMode(false));
    elements.clearRedactionsBtn.addEventListener('click', () => {
        selectedRedaction = null;
        state.clearRedactions(currentPageId);
    });
    elements.undoLastRedactionBtn.addEventListener('click', () => {
        const count = state.getPage(currentPageId)?.redactions.length ?? 0;
        if (!count) return;
        selectedRedaction = null;
        state.removeRedaction(currentPageId, count - 1);
    });
    elements.redactionLayer.addEventListener('pointerdown', startRedaction);
    elements.redactionLayer.addEventListener('pointermove', moveRedaction);
    elements.redactionLayer.addEventListener('pointerup', endRedaction);
    elements.redactionLayer.addEventListener('pointercancel', endRedaction);
    elements.redactionLayer.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-redaction]');
        if (remove) removeRedactionAt(Number(remove.dataset.removeRedaction));
    });
    elements.redactionLayer.addEventListener('focusin', event => {
        const box = event.target.closest('.redaction-box');
        if (!box || event.target.closest('.redaction-box__remove')) return;
        if (Number(box.dataset.index) !== selectedRedaction) selectRedaction(Number(box.dataset.index), { focus: true });
    });

    elements.lightboxFilmstrip.addEventListener('click', event => {
        const item = event.target.closest('.filmstrip__item');
        // Dropping a dragged page shouldn't also open it.
        if (performance.now() - filmstripDragEndedAt < 300) return;
        if (!item || item.dataset.pageId === currentPageId) return;
        setRedactMode(false);
        currentPageId = item.dataset.pageId;
        elements.lightboxContent.scrollTo(0, 0);
        renderLightboxPage();
    });

    // Swipe between pages on touch screens while the page fits the screen.
    elements.lightboxContent.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || isRedactMode || zoomIndex > 0) return;
        swipe = { x: event.clientX, y: event.clientY, time: performance.now() };
    });
    elements.lightboxContent.addEventListener('pointerup', event => {
        if (!swipe) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        const quick = performance.now() - swipe.time < 600;
        swipe = null;
        if (quick && Math.abs(dx) > 60 && Math.abs(dy) < 60) changeLightboxPage(dx < 0 ? 1 : -1);
    });
    elements.lightboxContent.addEventListener('pointercancel', () => { swipe = null; });

    // Listen on the document: clicking the page itself leaves focus on <body>, outside the dialog.
    document.addEventListener('keydown', event => {
        if (dialogStack.at(-1)?.dialog !== elements.pageLightbox) return;
        // Typing in the "Move to page" box must not zoom, rotate or delete.
        if (event.target.closest?.('input, textarea')) return;
        // Alt with an arrow moves the open page, like Alt with an arrow in the page grid.
        const moves = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
        if (event.altKey && !event.metaKey && !event.ctrlKey && moves[event.key]) {
            event.preventDefault();
            moveCurrentPage(moves[event.key]);
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const onBox = event.target.closest?.('.redaction-box');
        if (onBox && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            selectRedaction(Number(onBox.dataset.index), { focus: true });
            return;
        }
        // While redacting, Delete only ever removes a box (the selected or focused one), never the page.
        const removeBoxOrPage = () => {
            if (!isRedactMode) {
                deletePreviewPage();
                return;
            }
            const index = selectedRedaction ?? (onBox ? Number(onBox.dataset.index) : null);
            if (index !== null) removeRedactionAt(index);
        };
        const shortcuts = {
            ArrowLeft: () => changeLightboxPage(-1),
            ArrowRight: () => changeLightboxPage(1),
            r: rotatePreviewPage,
            R: rotatePreviewPage,
            m: openMovePopover,
            M: openMovePopover,
            Delete: removeBoxOrPage,
            Backspace: removeBoxOrPage,
            '+': () => setZoom(zoomIndex + 1),
            '=': () => setZoom(zoomIndex + 1),
            '-': () => setZoom(zoomIndex - 1),
            '0': () => setZoom(0),
        };
        const run = shortcuts[event.key];
        if (!run) return;
        event.preventDefault();
        run();
    });
}
