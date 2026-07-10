import * as state from '../state.js';
import { renderPdfPage } from '../utils/pdf.js';
import { createDocumentItem, createPageTile } from './components.js';

let elements = null;
let handlers = null;
let pageObserver = null;
let sortableInstance = null;
let sortablePromise = null;
let sortableGeneration = 0;
let mobileView = 'pages';
const thumbnailCache = new Map();

function ensureSortable() {
    if (window.Sortable) return Promise.resolve(window.Sortable);
    if (sortablePromise) return sortablePromise;
    sortablePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'lib/sortable.min.js';
        script.onload = () => resolve(window.Sortable);
        script.onerror = () => reject(new Error('Page reordering could not be loaded.'));
        document.head.appendChild(script);
    });
    return sortablePromise;
}

function copyCachedThumbnail(canvas, cached) {
    canvas.width = cached.width;
    canvas.height = cached.height;
    canvas.getContext('2d', { alpha: false }).drawImage(cached, 0, 0);
}

async function renderPageThumbnail(tile) {
    const canvas = tile.querySelector('.page-canvas');
    if (!canvas || canvas.dataset.rendered === 'true' || canvas.dataset.rendering === 'true') return;
    const page = state.getPage(tile.dataset.pageId);
    const file = page && state.getFile(page.sourceFileId);
    if (!page || !file) return;

    canvas.dataset.rendering = 'true';
    const cacheKey = `${page.sourceFileId}:${page.sourcePageIndex}:${page.rotation}`;
    try {
        const cached = thumbnailCache.get(cacheKey);
        if (cached) {
            copyCachedThumbnail(canvas, cached);
        } else {
            await renderPdfPage(file.pdfProxy, page.sourcePageIndex + 1, canvas, {
                scale: 0.28,
                rotation: page.rotation,
            });
            const snapshot = document.createElement('canvas');
            snapshot.width = canvas.width;
            snapshot.height = canvas.height;
            snapshot.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0);
            thumbnailCache.set(cacheKey, snapshot);
        }
        canvas.dataset.rendered = 'true';
        tile.querySelector('.thumbnail-spinner')?.remove();
    } catch (error) {
        tile.classList.add('page-tile--error');
        const spinner = tile.querySelector('.thumbnail-spinner');
        if (spinner) spinner.textContent = '!';
        handlers?.onRenderError?.(error);
    } finally {
        delete canvas.dataset.rendering;
    }
}

function observePageTiles() {
    pageObserver?.disconnect();
    pageObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            pageObserver.unobserve(entry.target);
            renderPageThumbnail(entry.target);
        });
    }, { rootMargin: '500px 0px' });
    elements.pageGrid.querySelectorAll('.page-tile').forEach(tile => pageObserver.observe(tile));
}

async function setupSortable() {
    const generation = ++sortableGeneration;
    sortableInstance?.destroy?.();
    sortableInstance = null;
    if (state.compositionPages.length < 2) return;

    try {
        const Sortable = await ensureSortable();
        if (generation !== sortableGeneration) return;
        sortableInstance = new Sortable(elements.pageGrid, {
            animation: 160,
            handle: '.page-drag-handle',
            draggable: '.page-tile',
            ghostClass: 'page-tile--ghost',
            chosenClass: 'page-tile--chosen',
            delay: 120,
            delayOnTouchOnly: true,
            onEnd: () => {
                const pageIds = [...elements.pageGrid.querySelectorAll('.page-tile')]
                    .map(tile => tile.dataset.pageId);
                handlers.onReorderPages?.(pageIds);
            },
        });
    } catch (error) {
        handlers?.onRenderError?.(error);
    }
}

async function renderDocumentPreview(item, file) {
    const canvas = item.querySelector('.document-preview__canvas');
    try {
        await renderPdfPage(file.pdfProxy, 1, canvas, { scale: 0.22 });
        item.querySelector('.thumbnail-spinner')?.remove();
    } catch {
        item.querySelector('.thumbnail-spinner')?.remove();
    }
}

function renderDocuments() {
    elements.documentList.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.uploadedFiles.forEach((file, index) => {
        const item = createDocumentItem(file, index, state.uploadedFiles.length);
        fragment.appendChild(item);
        queueMicrotask(() => renderDocumentPreview(item, file));
    });
    elements.documentList.appendChild(fragment);
    elements.documentCount.textContent = `${state.uploadedFiles.length} file${state.uploadedFiles.length === 1 ? '' : 's'}`;
}

function renderPages() {
    elements.pageGrid.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.compositionPages.forEach((page, index) => {
        const file = state.getFile(page.sourceFileId);
        if (!file) return;
        fragment.appendChild(createPageTile(
            page,
            file,
            index,
            state.compositionPages.length,
            state.selectedPageIds.has(page.id)
        ));
    });
    elements.pageGrid.appendChild(fragment);
    elements.pageCount.textContent = `${state.compositionPages.length} page${state.compositionPages.length === 1 ? '' : 's'}`;
    elements.pagesEmptyState.classList.toggle('hidden', state.compositionPages.length > 0);
    elements.pageGrid.classList.toggle('hidden', state.compositionPages.length === 0);
    observePageTiles();
    setupSortable();
}

function renderVisibility() {
    const hasFiles = state.hasFiles();
    elements.landingView.classList.toggle('hidden', hasFiles);
    elements.workspace.classList.toggle('hidden', !hasFiles);
    elements.exportBar.classList.toggle('hidden', !hasFiles);
    document.body.classList.toggle('has-export-bar', hasFiles);
}

export function refreshSelection() {
    const selected = state.selectedPageIds;
    elements.pageGrid.querySelectorAll('.page-tile').forEach(tile => {
        const isSelected = selected.has(tile.dataset.pageId);
        tile.classList.toggle('page-tile--selected', isSelected);
        const checkbox = tile.querySelector('[data-action="select-page"]');
        if (checkbox) checkbox.checked = isSelected;
    });

    const count = selected.size;
    elements.selectionToolbar.classList.toggle('hidden', count === 0);
    elements.selectionCount.textContent = `${count} selected`;
    elements.selectAllBtn.textContent = count === state.compositionPages.length && count > 0 ? 'Clear all' : 'Select all';
}

function renderExportState() {
    const count = state.getTotalPageCount();
    elements.exportPageCount.textContent = `${count} page${count === 1 ? '' : 's'}`;
    elements.exportBtn.disabled = count === 0;
    elements.undoBtn.disabled = !state.canUndo();
    elements.redoBtn.disabled = !state.canRedo();
    if (document.activeElement !== elements.outputNameInput) {
        elements.outputNameInput.value = state.outputName;
    }
}

export function renderAll() {
    const activeFileIds = new Set(state.uploadedFiles.map(file => file.id));
    thumbnailCache.forEach((value, key) => {
        if (!activeFileIds.has(key.split(':')[0])) thumbnailCache.delete(key);
    });
    renderVisibility();
    if (state.hasFiles()) {
        renderDocuments();
        renderPages();
    }
    refreshSelection();
    renderExportState();
    setMobileView(mobileView);
}

export function renderStateOnly(eventType) {
    if (eventType === 'selection') refreshSelection();
    else if (eventType === 'output-name') renderExportState();
    else renderAll();
}

export function setMobileView(view) {
    mobileView = view === 'documents' ? 'documents' : 'pages';
    elements.documentsPanel.classList.toggle('mobile-panel-hidden', mobileView !== 'documents');
    elements.pagesPanel.classList.toggle('mobile-panel-hidden', mobileView !== 'pages');
    elements.showDocumentsBtn.setAttribute('aria-pressed', String(mobileView === 'documents'));
    elements.showPagesBtn.setAttribute('aria-pressed', String(mobileView === 'pages'));
}

export function setDensity(density) {
    elements.pageGrid.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}

export function showPreviewProgress(current, total, label = 'Preparing documents') {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    elements.renderProgress.classList.remove('hidden');
    elements.renderProgress.setAttribute('aria-valuenow', String(percent));
    elements.renderProgressText.textContent = `${label}: ${current}/${total}`;
    elements.renderProgressPercent.textContent = `${percent}%`;
    elements.renderProgressBar.style.width = `${percent}%`;
    if (current >= total) {
        window.setTimeout(() => elements.renderProgress.classList.add('hidden'), 600);
    }
}

export function initViews(domElements, viewHandlers) {
    elements = domElements;
    handlers = viewHandlers;

    elements.documentList.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        const item = event.target.closest('.document-item');
        if (!button || !item) return;
        const fileId = item.dataset.fileId;
        const actions = {
            'move-file-up': () => handlers.onMoveFile?.(fileId, -1),
            'move-file-down': () => handlers.onMoveFile?.(fileId, 1),
            'delete-file': () => handlers.onDeleteFile?.(fileId),
        };
        actions[button.dataset.action]?.();
    });

    elements.pageGrid.addEventListener('change', event => {
        if (event.target.dataset.action === 'select-page') {
            handlers.onToggleSelection?.(event.target.closest('.page-tile').dataset.pageId);
        }
    });

    elements.pageGrid.addEventListener('click', event => {
        const actionElement = event.target.closest('[data-action]');
        const tile = event.target.closest('.page-tile');
        if (!actionElement || !tile || actionElement.dataset.action === 'select-page') return;
        const pageId = tile.dataset.pageId;
        const actions = {
            preview: () => handlers.onPreview?.(pageId, actionElement),
            'rotate-page': () => handlers.onRotatePage?.(pageId),
            'move-page-left': () => handlers.onMovePage?.(pageId, -1),
            'move-page-right': () => handlers.onMovePage?.(pageId, 1),
            'delete-page': () => handlers.onDeletePage?.(pageId),
        };
        actions[actionElement.dataset.action]?.();
    });

    renderAll();
}
