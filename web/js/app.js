import * as state from './state.js';
import { sanitizeOutputName } from './utils/helpers.js';
import { handleFiles } from './handlers/upload.js';
import { insertBlankPage } from './handlers/blank.js';
import { ensurePdfLib, mergePDFs } from './handlers/merge.js';
import { ensurePdfJs } from './utils/pdf.js';
import {
    ensureSortable,
    initViews,
    insertionPointAt,
    renderStateOnly,
    setDensity,
    selectOnly,
    showPreviewProgress,
} from './ui/views.js';
import {
    hideExportProgress,
    initModals,
    refreshLightbox,
    showEncryptionWarningModal,
    showExportProgress,
    showPageLightbox,
    updateExportProgress,
} from './ui/modals.js';
import { initMenus, showInfoPopover, showMenu } from './ui/menu.js';
import { initToasts, showToast } from './ui/toast.js';

const elementIds = [
    'workspace', 'dropZone', 'fileInput', 'browseBtn', 'addFilesBtn', 'emptyAddFilesBtn',
    'renderProgress', 'renderProgressText', 'renderProgressBar',
    'pagesPanel',
    'pageGrid', 'pageCount', 'pagesEmptyState', 'selectionToolbar', 'selectionCount', 'selectAllBtn',
    'rotateSelectedBtn', 'deleteSelectedBtn', 'clearSelectionBtn',
    'openSelectedBtn', 'moveSelectedEarlierBtn', 'moveSelectedLaterBtn', 'selectionMarquee',
    'sizeControl', 'exportBar', 'undoBtn', 'redoBtn', 'outputNameInput', 'exportPageCount', 'exportBtn',
    'exportMenuBtn', 'mobileExportBtn', 'mobileExportMenuBtn', 'mobileUndoBtn', 'offlineBadge',
    'insertSelectedBtn', 'extractSelectedBtn', 'dropIndicator', 'dropIndicatorLabel',
    'pageLightbox', 'lightboxCanvas', 'lightboxContent', 'lightboxTitle', 'lightboxPosition', 'lightboxFilmstrip', 'lightboxPage', 'redactionLayer',
    'redactionBanner', 'redactionCount', 'undoLastRedactionBtn', 'finishRedactionBtn',
    'redactModeBtn', 'clearRedactionsBtn', 'closeLightbox', 'prevPageBtn', 'nextPageBtn',
    'passwordModal', 'passwordTitle', 'passwordInput', 'passwordError', 'passwordModalFileName',
    'showPasswordCheckbox', 'closePasswordModal', 'cancelPasswordBtn', 'submitPasswordBtn',
    'encryptionWarningModal', 'encryptionWarningTitle', 'warningFileList', 'cancelWarningBtn', 'proceedWarningBtn',
    'redactionWarningModal', 'redactionWarningTitle', 'cancelRedactionBtn', 'proceedRedactionBtn',
    'zoomInBtn', 'zoomOutBtn', 'zoomFitBtn', 'movePreviewBtn', 'movePageForm', 'movePageInput', 'movePageTotal', 'movePageCurrent', 'movePageError', 'cancelMovePageBtn', 'rotatePreviewBtn', 'deletePreviewBtn', 'lightboxSpinner',
    'toastRegion', 'dropOverlay', 'dropOverlayHint',
    'exportProgressModal', 'exportProgressTitle', 'exportProgressText', 'exportProgressIndicator', 'exportProgressBar', 'cancelExportBtn',
];

const elements = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));
let exportController = null;
let fileDragDepth = 0;
// Where the next picked files go: null appends; a number inserts before that page position.
let pendingInsertAt = null;
let dropInsertAt = null;

// Changes that remove or reshape content get an Undo shortcut; routine moves stay quiet.
const UNDOABLE_LABEL = /^(Removed|Deleted|Rotated|Cleared|Inserted|Moved \d+ pages? to the)/;

function chooseFiles(insertAt = null) {
    pendingInsertAt = Number.isInteger(insertAt) ? insertAt : null;
    elements.fileInput.click();
}

function describePosition(index) {
    const total = state.compositionPages.length;
    if (index >= total) return 'after the last page';
    return `before page ${index + 1}`;
}

function openInsertMenu(anchor, index) {
    showMenu(anchor, [
        { label: 'PDF file…', hint: `Choose files to insert ${describePosition(index)}`, onSelect: () => chooseFiles(index) },
        {
            label: 'Blank page',
            hint: 'Matches the size of the page next to it',
            onSelect: () => insertBlankPage(index).catch(error => {
                console.error('Blank page failed', error);
                showToast('The blank page could not be created.', { tone: 'error' });
            }),
        },
    ], { label: `Insert ${describePosition(index)}`, align: 'start' });
}

async function processFiles(fileList, { insertAt = null } = {}) {
    const hadFiles = state.hasFiles();
    const where = hadFiles && insertAt !== null ? ` ${describePosition(insertAt)}` : '';
    const { added } = await handleFiles(fileList, {
        onBusy: busy => {
            elements.browseBtn.disabled = busy;
            elements.addFilesBtn.disabled = busy;
            elements.dropZone.dataset.state = busy ? 'loading' : 'idle';
        },
        onProgress: (current, total, label, step) => showPreviewProgress(current, total, label, step),
        onError: message => showToast(message, { tone: 'error' }),
    }, { insertAt: insertAt ?? undefined });
    elements.fileInput.value = '';
    // The landing page makes the result obvious; inside the workspace, confirm the addition.
    if (hadFiles && added > 0) {
        showToast(`Added ${added} document${added === 1 ? '' : 's'}${where}`);
    }
}

function undoChange() {
    const label = state.undo();
    if (label) showToast(`Undone: ${label}`, { action: { label: 'Redo', onClick: redoChange } });
}

function redoChange() {
    const label = state.redo();
    if (label) showToast(`Redone: ${label}`, { action: { label: 'Undo', onClick: undoChange } });
}

function announceChange(event) {
    if (event.type !== 'change' || !UNDOABLE_LABEL.test(event.label || '')) return;
    showToast(event.label, { action: { label: 'Undo', onClick: undoChange } });
}

function hasDraggedFiles(event) {
    return [...(event.dataTransfer?.types || [])].includes('Files');
}

function setDropOverlay(visible) {
    // With no pages, the whole window is the drop target; with pages, show exactly where files land.
    const hasPages = state.compositionPages.length > 0;
    elements.dropOverlayHint.textContent = 'PDFs, images, PowerPoint and Word · processed on this device';
    elements.dropOverlay.classList.toggle('hidden', !visible || hasPages);
    if (!state.hasFiles()) elements.dropZone.dataset.state = visible ? 'dragover' : 'idle';
    if (!visible) {
        dropInsertAt = null;
        elements.dropIndicator.classList.add('hidden');
        elements.dropIndicatorLabel.classList.add('hidden');
    }
}

function updateDropIndicator(event) {
    if (!state.compositionPages.length) return;
    const { index, marker } = insertionPointAt(event.clientX, event.clientY);
    dropInsertAt = index;
    if (!marker) return;
    Object.assign(elements.dropIndicator.style, {
        left: `${marker.x - 1.5}px`,
        top: `${marker.top}px`,
        height: `${marker.height}px`,
    });
    elements.dropIndicatorLabel.textContent = `Drop to insert ${describePosition(index)}`;
    Object.assign(elements.dropIndicatorLabel.style, {
        left: `${Math.min(window.innerWidth - 200, Math.max(12, marker.x - 90))}px`,
        top: `${Math.max(12, marker.top - 38)}px`,
    });
    elements.dropIndicator.classList.remove('hidden');
    elements.dropIndicatorLabel.classList.remove('hidden');
}

function setupFileDrop() {
    window.addEventListener('dragenter', event => {
        if (!hasDraggedFiles(event) || document.body.classList.contains('dialog-open')) return;
        event.preventDefault();
        fileDragDepth++;
        setDropOverlay(true);
    });
    window.addEventListener('dragover', event => {
        if (!hasDraggedFiles(event)) return;
        // Always prevent the default so a missed drop never navigates away to the raw PDF.
        event.preventDefault();
        const blocked = document.body.classList.contains('dialog-open');
        event.dataTransfer.dropEffect = blocked ? 'none' : 'copy';
        if (!blocked) updateDropIndicator(event);
    });
    window.addEventListener('dragleave', event => {
        if (!hasDraggedFiles(event)) return;
        fileDragDepth = Math.max(0, fileDragDepth - 1);
        if (fileDragDepth === 0) setDropOverlay(false);
    });
    window.addEventListener('drop', event => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        if (state.compositionPages.length) updateDropIndicator(event);
        const insertAt = dropInsertAt;
        fileDragDepth = 0;
        setDropOverlay(false);
        if (document.body.classList.contains('dialog-open')) return;
        processFiles(event.dataTransfer.files, { insertAt });
    });
}

function isTypingTarget(target) {
    return target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', event => {
        // Dialogs handle their own keys (e.g. Escape closes the preview) and mark the event as used.
        if (event.defaultPrevented || isTypingTarget(event.target)) return;
        const mod = event.metaKey || event.ctrlKey;
        const key = event.key.toLowerCase();
        // Undo stays available with no files open, so "Start over" can be reversed.
        const isHistoryKey = mod && (key === 'z' || key === 'y');
        if (!state.hasFiles() && !isHistoryKey) return;

        if (document.body.classList.contains('dialog-open')) {
            // The page preview is the only dialog where history shortcuts make sense.
            const openDialogs = document.querySelectorAll('.dialog-backdrop:not(.hidden)');
            const previewOnly = openDialogs.length === 1 && openDialogs[0] === elements.pageLightbox;
            if (!previewOnly || !mod || (key !== 'z' && key !== 'y')) return;
        }

        if (mod && key === 'z') {
            event.preventDefault();
            if (event.shiftKey) redoChange();
            else undoChange();
        } else if (mod && key === 'y') {
            event.preventDefault();
            redoChange();
        } else if (mod && key === 'a') {
            event.preventDefault();
            state.setSelectedPageIds(state.compositionPages.map(page => page.id));
        } else if (mod || event.altKey) {
            return;
        } else if (event.key === 'Escape' && state.selectedPageIds.size > 0) {
            state.clearSelection();
        } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedPageIds.size > 0) {
            event.preventDefault();
            state.deletePages([...state.selectedPageIds]);
        } else if (key === 'r' && state.selectedPageIds.size > 0) {
            state.rotatePages([...state.selectedPageIds]);
        }
    });
}

async function exportDocument({ pageIds } = {}) {
    if (exportController) return;
    exportController = new AbortController();
    showExportProgress();
    try {
        const result = await mergePDFs({
            pageIds,
            signal: exportController.signal,
            onProgress: updateExportProgress,
            onRestrictedFiles: showEncryptionWarningModal,
        });
        hideExportProgress();
        if (result?.cancelled) return;
        showToast(`Downloaded ${result.name} (${result.pageCount} page${result.pageCount === 1 ? '' : 's'})`);
    } catch (error) {
        hideExportProgress();
        if (error.name === 'AbortError') {
            showToast('Download cancelled');
        } else {
            console.error('Export failed', error);
            showToast(`Download failed. ${error.message || 'Please try again.'}`, { tone: 'error' });
        }
    } finally {
        exportController = null;
    }
}

function openDownloadMenu(anchor) {
    const total = state.getTotalPageCount();
    const selected = state.compositionPages.filter(page => state.selectedPageIds.has(page.id)).map(page => page.id);
    showMenu(anchor, [
        {
            label: `Download ${state.outputName}.pdf`,
            hint: `All ${total} page${total === 1 ? '' : 's'}`,
            disabled: total === 0,
            onSelect: () => exportDocument(),
        },
        {
            label: 'Download selected pages',
            hint: selected.length ? `${selected.length} page${selected.length === 1 ? '' : 's'} as ${state.outputName}-selected.pdf` : 'Select pages first',
            disabled: selected.length === 0,
            onSelect: () => exportDocument({ pageIds: selected }),
        },
        'separator',
        {
            label: 'Start over',
            hint: 'Clears every page. You can undo this.',
            danger: true,
            onSelect: () => {
                state.clearAll();
                elements.browseBtn.focus();
            },
        },
    ], { label: 'Download options' });
}

/**
 * docstack promises it keeps working with the connection off. The PDF reader, writer and drag
 * library load on demand, so fetch them once the page is idle; after that, nothing needs the network.
 */
function preloadForOffline() {
    const warm = () => Promise.all([ensurePdfJs(), ensurePdfLib(), ensureSortable()])
        .catch(error => console.warn('Could not preload offline libraries', error));
    if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 3000 });
    else window.setTimeout(warm, 1500);
}

function initializeInteractions() {
    initToasts(elements.toastRegion);
    initMenus();

    // The header is part of the desk at rest; once content scrolls under it, it lifts onto white.
    const header = document.querySelector('.app-header');
    const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
    // Closing the preview selects the page you were looking at, so you land where you left off.
    initModals(elements, { onLightboxClose: selectOnly });
    initViews(elements, {
        onMovePagesTo: (pageIds, position) => state.movePagesTo(pageIds, position),
        onDeletePages: (pageIds, label) => state.deletePages(pageIds, label),
        onPreview: showPageLightbox,
        onRotatePage: pageId => state.rotatePages([pageId]),
        onMovePages: (pageIds, delta) => state.movePages(pageIds, delta),
        onDeletePage: state.deletePage,
        onReorderPages: state.setPageOrder,
        onInsertAt: (index, anchor) => openInsertMenu(anchor, index),
        onRenderError: error => {
            console.error('Page preview failed', error);
            showToast(error.message || 'A page preview could not be rendered.', { tone: 'error' });
        },
    });

    state.subscribe(event => {
        renderStateOnly(event.type);
        if (event.type !== 'selection' && event.type !== 'output-name') refreshLightbox();
        announceChange(event);
    });
    setupFileDrop();
    setupKeyboardShortcuts();

    elements.browseBtn.addEventListener('click', () => chooseFiles());
    elements.addFilesBtn.addEventListener('click', () => chooseFiles());
    elements.emptyAddFilesBtn.addEventListener('click', () => chooseFiles());
    elements.fileInput.addEventListener('change', event => {
        const insertAt = pendingInsertAt;
        pendingInsertAt = null;
        processFiles(event.target.files, { insertAt });
    });
    elements.extractSelectedBtn.addEventListener('click', () => {
        const pageIds = state.compositionPages.filter(page => state.selectedPageIds.has(page.id)).map(page => page.id);
        if (pageIds.length) exportDocument({ pageIds });
    });
    elements.insertSelectedBtn.addEventListener('click', () => {
        // Insert after the last selected page.
        const positions = state.compositionPages
            .map((page, index) => (state.selectedPageIds.has(page.id) ? index : -1))
            .filter(index => index >= 0);
        const index = positions.length ? Math.max(...positions) + 1 : state.compositionPages.length;
        openInsertMenu(elements.insertSelectedBtn, index);
    });

    // Page size is a per-person preference, so remember it on this device.
    const SIZE_KEY = 'docstack:page-size';
    const readSize = () => { try { return localStorage.getItem(SIZE_KEY); } catch { return null; } };
    const saveSize = value => { try { localStorage.setItem(SIZE_KEY, value); } catch { /* storage unavailable */ } };
    setDensity(readSize());
    elements.sizeControl.addEventListener('click', event => {
        const button = event.target.closest('[data-density]');
        if (button) saveSize(setDensity(button.dataset.density));
    });
    elements.sizeControl.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...elements.sizeControl.querySelectorAll('[data-density]')];
        const current = buttons.findIndex(button => button.getAttribute('aria-checked') === 'true');
        const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const next = buttons[Math.max(0, Math.min(buttons.length - 1, current + step))];
        saveSize(setDensity(next.dataset.density));
        next.focus();
    });

    elements.selectAllBtn.addEventListener('click', () => {
        if (state.selectedPageIds.size === state.compositionPages.length) state.clearSelection();
        else state.setSelectedPageIds(state.compositionPages.map(page => page.id));
    });
    elements.clearSelectionBtn.addEventListener('click', state.clearSelection);
    elements.openSelectedBtn.addEventListener('click', () => {
        const [pageId] = state.selectedPageIds;
        if (pageId) showPageLightbox(pageId, elements.openSelectedBtn);
    });
    elements.moveSelectedEarlierBtn.addEventListener('click', () => state.movePages([...state.selectedPageIds], -1));
    elements.moveSelectedLaterBtn.addEventListener('click', () => state.movePages([...state.selectedPageIds], 1));
    elements.rotateSelectedBtn.addEventListener('click', () => state.rotatePages([...state.selectedPageIds]));
    elements.deleteSelectedBtn.addEventListener('click', () => {
        const ids = [...state.selectedPageIds];
        state.deletePages(ids);
    });
    elements.undoBtn.addEventListener('click', undoChange);
    elements.mobileUndoBtn.addEventListener('click', undoChange);
    elements.redoBtn.addEventListener('click', redoChange);
    elements.outputNameInput.addEventListener('input', event => state.setOutputName(event.target.value));
    elements.outputNameInput.addEventListener('blur', event => {
        const safeName = sanitizeOutputName(event.target.value);
        event.target.value = safeName;
        state.setOutputName(safeName);
    });
    elements.exportBtn.addEventListener('click', () => exportDocument());
    elements.mobileExportBtn.addEventListener('click', () => exportDocument());
    elements.exportMenuBtn.addEventListener('click', () => openDownloadMenu(elements.exportMenuBtn));
    elements.mobileExportMenuBtn.addEventListener('click', () => openDownloadMenu(elements.mobileExportMenuBtn));
    elements.offlineBadge.addEventListener('click', () => showInfoPopover(elements.offlineBadge, {
        title: 'Your files never leave this device',
        paragraphs: [
            'docstack reads, arranges and merges PDFs inside this browser tab. No file is uploaded and no page is sent anywhere.',
            'To check, turn off Wi‑Fi once the page has loaded and keep working. Everything still works.',
            'One exception: the first time you add a PowerPoint or Word file, docstack downloads the tool that converts it (about 50 MB) from ZetaOffice. The file itself is still converted on this device.',
        ],
    }));
    // Size the file name field to its text so the title reads like a document name, not a form.
    const fitTitle = () => { elements.outputNameInput.size = Math.max(4, elements.outputNameInput.value.length); };
    elements.outputNameInput.addEventListener('input', fitTitle);
    elements.outputNameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') elements.outputNameInput.blur();
    });
    state.subscribe(fitTitle);
    fitTitle();
    elements.cancelExportBtn.addEventListener('click', () => {
        elements.exportProgressText.textContent = 'Cancelling after the current page…';
        exportController?.abort();
    });

    window.addEventListener('beforeunload', event => {
        if (!state.hasFiles()) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

initializeInteractions();
preloadForOffline();
