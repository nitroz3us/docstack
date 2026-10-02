import * as state from '../state.js';
import { createPageRun, createPageTile } from './components.js';
import { showMenu } from './menu.js';
import { drawPageThumbnail, paintCachedThumbnail, pruneThumbnails } from './thumbnails.js';

let elements = null;
let handlers = null;
let pageObserver = null;
let sortableInstances = [];
let sortablePromise = null;
let sortableGeneration = 0;
let selectionAnchorId = null;
let focusedPageId = null;
let pointer = null;
const LONG_PRESS_MS = 430;
// Mouse users can grab anywhere on a tile; touch keeps an explicit handle so the grid still scrolls.
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

export function ensureSortable() {
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

async function renderPageThumbnail(tile) {
    const canvas = tile.querySelector('.page-canvas');
    const page = state.getPage(tile.dataset.pageId);
    const file = page && state.getFile(page.sourceFileId);
    if (!canvas || !page || !file) return;
    try {
        await drawPageThumbnail(canvas, page, file);
        tile.querySelector('.thumbnail-spinner')?.remove();
    } catch (error) {
        tile.classList.add('page-tile--error');
        const spinner = tile.querySelector('.thumbnail-spinner');
        if (spinner) spinner.textContent = '!';
        handlers?.onRenderError?.(error);
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

function tileOrder() {
    return [...elements.pageGrid.querySelectorAll('.page-tile')].map(tile => tile.dataset.pageId);
}

/**
 * Sortable moves only the tile under the pointer. When that tile is part of a larger
 * selection, gather the rest of the selection around it in their original order.
 */
function orderAfterDrop(draggedId) {
    const domOrder = tileOrder();
    const selected = state.selectedPageIds;
    if (!selected.has(draggedId) || selected.size < 2) return domOrder;
    const group = state.compositionPages.filter(page => selected.has(page.id)).map(page => page.id);
    return domOrder
        .filter(id => id === draggedId || !selected.has(id))
        .flatMap(id => (id === draggedId ? group : [id]));
}

/**
 * Sortable's floating copy is a plain DOM clone, which drops canvas pixels. Once it exists,
 * paint the thumbnail into it and label it with how many pages are being moved.
 */
function decorateDragCopy(item, groupSize, attempt = 0) {
    const copy = document.querySelector('body > .page-tile--dragging');
    if (!copy) {
        if (attempt < 20) requestAnimationFrame(() => decorateDragCopy(item, groupSize, attempt + 1));
        return;
    }
    const source = item.querySelector('.page-canvas');
    const target = copy.querySelector('.page-canvas');
    if (source && target && source.dataset.rendered === 'true') {
        target.width = source.width;
        target.height = source.height;
        target.getContext('2d', { alpha: false }).drawImage(source, 0, 0);
    }
    if (groupSize > 1) copy.dataset.dragCount = String(groupSize);
}

async function setupSortable() {
    const generation = ++sortableGeneration;
    sortableInstances.forEach(instance => instance.destroy?.());
    sortableInstances = [];
    if (state.compositionPages.length < 2) return;

    try {
        const Sortable = await ensureSortable();
        if (generation !== sortableGeneration) return;
        const options = {
            animation: 160,
            // One shared group lets a page be dragged from one file's run into another.
            group: 'pages',
            ...(finePointer.matches
                ? { filter: '.page-tile__actions, .page-tile__insert', preventOnFilter: false }
                : { handle: '.page-drag-handle' }),
            draggable: '.page-tile',
            forceFallback: true,
            fallbackTolerance: 4,
            fallbackClass: 'page-tile--dragging',
            fallbackOnBody: true,
            ghostClass: 'page-tile--ghost',
            chosenClass: 'page-tile--chosen',
            delay: 120,
            delayOnTouchOnly: true,
            onStart: ({ item }) => {
                cancelPointer();
                document.body.classList.add('is-dragging-pages');
                const selected = state.selectedPageIds;
                const groupSize = selected.has(item.dataset.pageId) ? selected.size : 1;
                decorateDragCopy(item, groupSize);
                if (groupSize < 2) return;
                elements.pageGrid.querySelectorAll('.page-tile--selected').forEach(tile => {
                    if (tile !== item) tile.classList.add('page-tile--lifting');
                });
            },
            onEnd: ({ item }) => {
                document.body.classList.remove('is-dragging-pages');
                const next = orderAfterDrop(item.dataset.pageId);
                const unchanged = next.every((id, index) => id === state.compositionPages[index]?.id);
                if (unchanged) {
                    elements.pageGrid.querySelectorAll('.page-tile--lifting').forEach(tile => tile.classList.remove('page-tile--lifting'));
                    return;
                }
                handlers.onReorderPages?.(next);
            },
        };
        sortableInstances = [...elements.pageGrid.querySelectorAll('.page-run__pages')]
            .map(container => new Sortable(container, options));
    } catch (error) {
        handlers?.onRenderError?.(error);
    }
}

/** Consecutive pages from the same file, in download order. */
function pageRuns() {
    const runs = [];
    state.compositionPages.forEach((page, index) => {
        const file = state.getFile(page.sourceFileId);
        if (!file) return;
        const last = runs.at(-1);
        if (last && last.file.id === file.id) last.pages.push(page);
        else runs.push({ file, pages: [page], startIndex: index });
    });
    return runs;
}

function filesInComposition() {
    const ids = new Set(state.compositionPages.map(page => page.sourceFileId));
    return [...ids].filter(id => !state.getFile(id)?.isBlank).length;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const MAX_ANIMATED_TILES = 300;

function captureLayout() {
    const layout = new Map();
    elements.pageGrid.querySelectorAll('.page-tile').forEach(tile => {
        layout.set(tile.dataset.pageId, {
            rect: tile.getBoundingClientRect(),
            rotation: Number(tile.dataset.rotation),
        });
    });
    return layout;
}

/** Glide moved pages to their new spots, turn rotated pages, and fade in new ones. */
function animateLayoutChange(before) {
    const tiles = [...elements.pageGrid.querySelectorAll('.page-tile')];
    if (reducedMotion.matches || before.size === 0 || tiles.length > MAX_ANIMATED_TILES) return;
    tiles.forEach(tile => {
        const previous = before.get(tile.dataset.pageId);
        if (!previous) {
            tile.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
            return;
        }
        const now = tile.getBoundingClientRect();
        const dx = previous.rect.left - now.left;
        const dy = previous.rect.top - now.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2, .7, .2, 1)' });
        }
        const turn = (Number(tile.dataset.rotation) - previous.rotation + 360) % 360;
        if (turn) {
            const from = turn === 270 ? 90 : -turn;
            tile.querySelector('.page-thumb').animate([{ transform: `rotate(${from}deg)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)' });
        }
    });
}

function renderPages() {
    const hadFocus = elements.pageGrid.contains(document.activeElement);
    const before = captureLayout();
    elements.pageGrid.replaceChildren();
    const fragment = document.createDocumentFragment();
    pageRuns().forEach(({ file, pages, startIndex }) => {
        const run = createPageRun(file, pages.map(page => page.sourcePageIndex + 1), startIndex);
        const container = run.querySelector('.page-run__pages');
        pages.forEach((page, offset) => {
            const tile = createPageTile(page, file, startIndex + offset, state.selectedPageIds.has(page.id), {
                isLastInRun: offset === pages.length - 1,
            });
            if (paintCachedThumbnail(tile.querySelector('.page-canvas'), page)) {
                tile.querySelector('.thumbnail-spinner')?.remove();
            }
            container.appendChild(tile);
        });
        fragment.appendChild(run);
    });
    elements.pageGrid.appendChild(fragment);
    const pageTotal = state.compositionPages.length;
    const fileTotal = filesInComposition();
    elements.pageCount.textContent = `${pageTotal} page${pageTotal === 1 ? '' : 's'}${pageTotal ? ` from ${fileTotal} file${fileTotal === 1 ? '' : 's'}` : ''}`;
    elements.pagesEmptyState.classList.toggle('hidden', state.compositionPages.length > 0);
    elements.pageGrid.classList.toggle('hidden', state.compositionPages.length === 0);

    if (!state.getPage(focusedPageId)) focusedPageId = state.compositionPages[0]?.id ?? null;
    if (selectionAnchorId && !state.getPage(selectionAnchorId)) selectionAnchorId = null;
    const focusTarget = tileFor(focusedPageId);
    if (focusTarget) {
        focusTarget.tabIndex = 0;
        if (hadFocus) focusTarget.focus({ preventScroll: true });
    }
    animateLayoutChange(before);
    observePageTiles();
    setupSortable();
}

function renderVisibility() {
    const hasFiles = state.hasFiles();
    elements.workspace.toggleAttribute('data-multi-file', filesInComposition() > 1);
    // With no files, the pages panel shows the drop zone; the header and toolbar controls appear with pages.
    document.body.classList.toggle('has-files', hasFiles);
    elements.dropZone.classList.toggle('hidden', hasFiles);
    elements.pageGrid.classList.toggle('hidden', !hasFiles);
    elements.exportBar.classList.toggle('hidden', !hasFiles);
    document.body.classList.toggle('has-export-bar', hasFiles);
}

export function refreshSelection() {
    const selected = state.selectedPageIds;
    elements.pageGrid.querySelectorAll('.page-tile').forEach(tile => {
        const isSelected = selected.has(tile.dataset.pageId);
        tile.classList.toggle('page-tile--selected', isSelected);
        tile.setAttribute('aria-selected', String(isSelected));
    });

    const count = selected.size;
    elements.selectionToolbar.classList.toggle('hidden', count === 0);
    document.body.classList.toggle('has-selection', count > 0);
    elements.selectionCount.textContent = `${count} selected`;
    elements.openSelectedBtn.classList.toggle('hidden', count !== 1);
    const ordered = state.compositionPages.map(page => page.id);
    elements.moveSelectedEarlierBtn.disabled = count === 0 || ordered.slice(0, count).every(id => selected.has(id));
    elements.moveSelectedLaterBtn.disabled = count === 0 || ordered.slice(-count).every(id => selected.has(id));
    elements.selectAllBtn.textContent = count === state.compositionPages.length && count > 0 ? 'Clear selection' : 'Select all';
}

function renderExportState() {
    const count = state.getTotalPageCount();
    elements.exportPageCount.textContent = `${count} page${count === 1 ? '' : 's'}`;
    [elements.exportBtn, elements.exportMenuBtn, elements.mobileExportBtn, elements.mobileExportMenuBtn]
        .forEach(button => { button.disabled = count === 0; });
    // The menu still offers "Start over" when every page has been deleted.
    elements.exportMenuBtn.disabled = elements.mobileExportMenuBtn.disabled = !state.hasFiles();
    elements.undoBtn.disabled = elements.mobileUndoBtn.disabled = !state.canUndo();
    elements.redoBtn.disabled = !state.canRedo();
    if (document.activeElement !== elements.outputNameInput) {
        elements.outputNameInput.value = state.outputName;
    }
}

export function renderAll() {
    pruneThumbnails(new Set(state.uploadedFiles.map(file => file.id)));
    renderVisibility();
    if (state.hasFiles()) {
        renderPages();
    } else {
        elements.pageGrid.replaceChildren();
        elements.pagesEmptyState.classList.add('hidden');
    }
    refreshSelection();
    renderExportState();
}

export function renderStateOnly(eventType) {
    if (eventType === 'selection') refreshSelection();
    else if (eventType === 'output-name') renderExportState();
    else renderAll();
}

const DENSITIES = ['compact', 'comfortable', 'large'];

export function setDensity(density) {
    const value = DENSITIES.includes(density) ? density : 'comfortable';
    elements.pageGrid.dataset.density = value;
    elements.sizeControl.querySelectorAll('[data-density]').forEach(button => {
        const checked = button.dataset.density === value;
        button.setAttribute('aria-checked', String(checked));
        button.tabIndex = checked ? 0 : -1;
    });
    return value;
}

let progressHideTimer = 0;
let progressCreepTimer = 0;

/**
 * A slim bar under the header while files open; it overlays the page so nothing shifts.
 *
 * @param {number} current - index of the file being opened
 * @param {number} total - number of files
 * @param {string} [label]
 * @param {{fraction?: number, creepTo?: number, creepSeconds?: number, added?: number}} [step] - how
 *   far through the current file the work is (0 to 1). For a step of unknown length, `creepTo`
 *   keeps the bar moving slowly towards that fraction over `creepSeconds` instead of standing
 *   still. With the final call, `added` is how many of the files actually opened.
 */
export function showPreviewProgress(current, total, label = 'Opening documents', { fraction = 0.5, creepTo, creepSeconds = 8, added = total } = {}) {
    const done = current >= total;
    if (done && added === 0) {
        // Nothing opened, and an error message says why; don't end on a green "ready".
        window.clearTimeout(progressHideTimer);
        window.clearTimeout(progressCreepTimer);
        elements.renderProgress.classList.add('hidden');
        return;
    }
    const percentAt = part => (total > 0 ? Math.round((Math.min(current + (done ? 0 : part), total) / total) * 1000) / 10 : 0);
    const percent = percentAt(fraction);
    const bar = elements.renderProgressBar;
    const panel = elements.renderProgress;
    // A new run starts from empty; within a run the bar only ever moves forward.
    const fresh = panel.classList.contains('hidden') || panel.classList.contains('progress-panel--done');
    window.clearTimeout(progressHideTimer);
    window.clearTimeout(progressCreepTimer);
    elements.renderProgress.classList.remove('hidden', 'progress-panel--done');
    elements.renderProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
    elements.renderProgressText.textContent = done
        ? (added < total ? `${added} of ${total} documents ready` : `${total === 1 ? 'Document' : `${total} documents`} ready`)
        : `${label}${total > 1 ? ` · ${current + 1} of ${total}` : ''}`;
    const trackWidth = bar.parentElement.getBoundingClientRect().width;
    const shown = fresh || !trackWidth ? 0 : (bar.getBoundingClientRect().width / trackWidth) * 100;
    const from = done ? percent : Math.max(percent, shown);
    // Pin the bar where it is drawn (stopping any slow drift in progress), then move to this step.
    bar.style.transition = 'none';
    bar.style.width = `${shown}%`;
    void bar.offsetWidth;
    bar.style.transition = '';
    bar.style.width = `${from}%`;
    if (!done && creepTo !== undefined && percentAt(creepTo) > from) {
        // Once the bar has reached this step's start, drift slowly towards its end.
        progressCreepTimer = window.setTimeout(() => {
            bar.style.transition = `width ${creepSeconds}s cubic-bezier(.1, .6, .3, 1)`;
            bar.style.width = `${percentAt(creepTo)}%`;
        }, 200);
    }
    if (done) {
        elements.renderProgress.classList.add('progress-panel--done');
        progressHideTimer = window.setTimeout(() => elements.renderProgress.classList.add('hidden'), 900);
    }
}

/**
 * Where dropped files would land: before or after the page nearest the pointer. Outside the grid,
 * files go after the last page. Returns the insertion index and where to draw the marker.
 */
export function insertionPointAt(clientX, clientY) {
    const tiles = [...elements.pageGrid.querySelectorAll('.page-tile')];
    const total = state.compositionPages.length;
    const gridRect = elements.pageGrid.getBoundingClientRect();
    const insideGrid = clientX >= gridRect.left && clientX <= gridRect.right && clientY >= gridRect.top && clientY <= gridRect.bottom;
    if (!tiles.length) return { index: total, marker: null };

    let best = null;
    if (insideGrid) {
        tiles.forEach((tile, index) => {
            const rect = tile.querySelector('.page-thumb').getBoundingClientRect();
            const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
            const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
            const distance = Math.hypot(dx, dy * 1.5);
            if (!best || distance < best.distance) best = { distance, index, rect };
        });
    }
    if (!best) {
        const rect = tiles.at(-1).querySelector('.page-thumb').getBoundingClientRect();
        return { index: total, marker: { x: rect.right + 10, top: rect.top, height: rect.height } };
    }
    const after = clientX > best.rect.left + best.rect.width / 2;
    return {
        index: best.index + (after ? 1 : 0),
        marker: { x: after ? best.rect.right + 10 : best.rect.left - 10, top: best.rect.top, height: best.rect.height },
    };
}

/* ---------- Selection: click, modifier-click, range, box and keyboard ---------- */

function tileFor(pageId) {
    return pageId ? elements.pageGrid.querySelector(`.page-tile[data-page-id="${CSS.escape(pageId)}"]`) : null;
}

export function focusPage(pageId, { scroll = true } = {}) {
    const tile = tileFor(pageId);
    if (!tile) return;
    elements.pageGrid.querySelectorAll('.page-tile[tabindex="0"]').forEach(other => { other.tabIndex = -1; });
    tile.tabIndex = 0;
    focusedPageId = pageId;
    tile.focus({ preventScroll: true });
    if (scroll) tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rangeIds(fromId, toId) {
    const ids = state.compositionPages.map(page => page.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return [toId];
    return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

function selectFromClick(pageId, { shiftKey, metaKey, ctrlKey }) {
    if (shiftKey && selectionAnchorId) {
        const base = metaKey || ctrlKey ? [...state.selectedPageIds] : [];
        state.setSelectedPageIds([...base, ...rangeIds(selectionAnchorId, pageId)]);
    } else if (metaKey || ctrlKey) {
        state.togglePageSelection(pageId);
        selectionAnchorId = pageId;
    } else {
        state.setSelectedPageIds([pageId]);
        selectionAnchorId = pageId;
    }
    focusPage(pageId, { scroll: false });
}

function toggleFromTouch(pageId) {
    state.togglePageSelection(pageId);
    selectionAnchorId = pageId;
}

export function selectOnly(pageId) {
    if (!state.getPage(pageId)) return;
    state.setSelectedPageIds([pageId]);
    selectionAnchorId = pageId;
    focusPage(pageId);
}

function cancelPointer() {
    if (!pointer) return;
    window.clearTimeout(pointer.longPressTimer);
    elements.selectionMarquee.classList.add('hidden');
    pointer = null;
}

function updateMarquee(event) {
    const left = Math.min(pointer.x, event.clientX);
    const top = Math.min(pointer.y, event.clientY);
    const right = Math.max(pointer.x, event.clientX);
    const bottom = Math.max(pointer.y, event.clientY);
    Object.assign(elements.selectionMarquee.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
    });
    elements.selectionMarquee.classList.remove('hidden');

    const next = new Set(pointer.baseSelection);
    elements.pageGrid.querySelectorAll('.page-tile').forEach(tile => {
        const rect = tile.querySelector('.page-thumb').getBoundingClientRect();
        if (rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom) {
            next.add(tile.dataset.pageId);
        }
    });
    const current = state.selectedPageIds;
    if (next.size !== current.size || [...next].some(id => !current.has(id))) {
        state.setSelectedPageIds([...next]);
    }
}

function handlePointerDown(event) {
    if (event.button !== 0) return;
    const tile = event.target.closest('.page-tile');
    if (event.target.closest('button')) return;

    if (tile) {
        pointer = {
            kind: 'tile',
            pageId: tile.dataset.pageId,
            x: event.clientX,
            y: event.clientY,
            type: event.pointerType,
            moved: false,
            longPressed: false,
        };
        if (event.pointerType !== 'mouse' && !event.target.closest('.page-drag-handle')) {
            pointer.longPressTimer = window.setTimeout(() => {
                if (!pointer || pointer.moved) return;
                pointer.longPressed = true;
                toggleFromTouch(pointer.pageId);
                navigator.vibrate?.(8);
            }, LONG_PRESS_MS);
        }
        return;
    }

    // Dragging across empty grid space draws a selection box (mouse only; touch scrolls).
    if (event.pointerType === 'mouse') {
        event.preventDefault();
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        pointer = {
            kind: 'marquee',
            x: event.clientX,
            y: event.clientY,
            moved: false,
            baseSelection: additive ? new Set(state.selectedPageIds) : new Set(),
        };
    }
}

function handlePointerMove(event) {
    if (!pointer) return;
    const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    if (pointer.kind === 'tile') {
        if (distance > (pointer.type === 'mouse' ? 4 : 8)) {
            pointer.moved = true;
            window.clearTimeout(pointer.longPressTimer);
        }
        return;
    }
    if (distance > 4) pointer.moved = true;
    if (pointer.moved) updateMarquee(event);
}

function handlePointerUp(event) {
    if (!pointer) return;
    const current = pointer;
    cancelPointer();

    if (current.kind === 'marquee') {
        if (!current.moved && state.selectedPageIds.size) state.clearSelection();
        return;
    }
    if (current.moved || current.longPressed) return;
    if (current.type === 'mouse') {
        selectFromClick(current.pageId, event);
    } else if (state.selectedPageIds.size > 0) {
        toggleFromTouch(current.pageId);
    } else {
        handlers.onPreview?.(current.pageId, tileFor(current.pageId));
    }
}

function nextTileInDirection(fromTile, key) {
    const tiles = [...elements.pageGrid.querySelectorAll('.page-tile')];
    const index = tiles.indexOf(fromTile);
    if (key === 'ArrowLeft') return tiles[index - 1];
    if (key === 'ArrowRight') return tiles[index + 1];
    if (key === 'Home') return tiles[0];
    if (key === 'End') return tiles.at(-1);

    const origin = fromTile.getBoundingClientRect();
    const centerX = origin.left + origin.width / 2;
    const down = key === 'ArrowDown';
    const candidates = tiles
        .map(tile => ({ tile, rect: tile.getBoundingClientRect() }))
        .filter(({ rect }) => (down ? rect.top > origin.bottom - 4 : rect.bottom < origin.top + 4));
    if (!candidates.length) return null;
    const rowTop = down
        ? Math.min(...candidates.map(({ rect }) => rect.top))
        : Math.max(...candidates.map(({ rect }) => rect.top));
    return candidates
        .filter(({ rect }) => Math.abs(rect.top - rowTop) < 8)
        .sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - centerX) - Math.abs(b.rect.left + b.rect.width / 2 - centerX))[0]
        ?.tile;
}

function handleGridKeydown(event) {
    const tile = event.target.closest('.page-tile');
    if (!tile) return;
    const pageId = tile.dataset.pageId;

    if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        handlers.onPreview?.(pageId, tile);
        return;
    }

    const isArrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key);
    if (!isArrow || event.metaKey || event.ctrlKey) return;
    event.preventDefault();

    if (event.altKey) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const ids = state.selectedPageIds.size ? [...state.selectedPageIds] : [pageId];
        if (!state.selectedPageIds.size) state.setSelectedPageIds(ids);
        handlers.onMovePages?.(ids, event.key === 'ArrowLeft' ? -1 : 1);
        requestAnimationFrame(() => focusPage(pageId));
        return;
    }

    const target = nextTileInDirection(tile, event.key);
    if (!target) return;
    const targetId = target.dataset.pageId;
    if (event.shiftKey) {
        if (!selectionAnchorId) selectionAnchorId = pageId;
        state.setSelectedPageIds(rangeIds(selectionAnchorId, targetId));
    } else {
        state.setSelectedPageIds([targetId]);
        selectionAnchorId = targetId;
    }
    focusPage(targetId);
}

function openRunMenu(button) {
    const run = button.closest('.page-run');
    const start = Number(run.dataset.startIndex);
    const count = Number(run.dataset.count);
    const ids = state.compositionPages.slice(start, start + count).map(page => page.id);
    const file = state.getFile(run.dataset.sourceFileId);
    if (!file || ids.length === 0) return;
    const allFromFile = state.compositionPages.filter(page => page.sourceFileId === file.id).map(page => page.id);
    const pageWord = count === 1 ? 'this page' : `these ${count} pages`;
    const splitAcrossRuns = allFromFile.length > ids.length;

    showMenu(button, [
        {
            label: `Select ${pageWord}`,
            onSelect: () => {
                state.setSelectedPageIds(ids);
                selectionAnchorId = ids[0];
                focusPage(ids[0]);
            },
        },
        ...(splitAcrossRuns ? [{
            label: `Select all ${allFromFile.length} pages from ${file.name}`,
            onSelect: () => {
                state.setSelectedPageIds(allFromFile);
                selectionAnchorId = allFromFile[0];
            },
        }] : []),
        { label: 'Move to start', disabled: start === 0, onSelect: () => handlers.onMovePagesTo?.(ids, 'start') },
        { label: 'Move to end', disabled: start + count === state.compositionPages.length, onSelect: () => handlers.onMovePagesTo?.(ids, 'end') },
        'separator',
        {
            label: count === 1 ? 'Remove this page' : `Remove ${count} pages`,
            danger: true,
            onSelect: () => handlers.onDeletePages?.(ids, splitAcrossRuns
                ? `Removed ${count} page${count === 1 ? '' : 's'} of ${file.name}`
                : `Removed ${file.name}`),
        },
    ], { label: `Actions for ${file.name}` });
}

export function initViews(domElements, viewHandlers) {
    elements = domElements;
    handlers = viewHandlers;
    finePointer.addEventListener?.('change', () => setupSortable());

    elements.pageGrid.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', cancelPointer);
    elements.pageGrid.addEventListener('keydown', handleGridKeydown);
    elements.pageGrid.addEventListener('focusin', event => {
        const tile = event.target.closest('.page-tile');
        if (!tile) return;
        elements.pageGrid.querySelectorAll('.page-tile[tabindex="0"]').forEach(other => {
            if (other !== tile) other.tabIndex = -1;
        });
        tile.tabIndex = 0;
        focusedPageId = tile.dataset.pageId;
    });

    elements.pageGrid.addEventListener('dblclick', event => {
        const tile = event.target.closest('.page-tile');
        if (tile && !event.target.closest('button')) handlers.onPreview?.(tile.dataset.pageId, tile);
    });

    elements.pageGrid.addEventListener('click', event => {
        const insertButton = event.target.closest('.page-tile__insert');
        if (insertButton) {
            handlers.onInsertAt?.(Number(insertButton.dataset.insertAt), insertButton);
            return;
        }
        const runMenuButton = event.target.closest('.page-run__menu');
        if (runMenuButton) {
            openRunMenu(runMenuButton);
            return;
        }
        const actionElement = event.target.closest('button[data-action]');
        const tile = event.target.closest('.page-tile');
        if (!actionElement || !tile) return;
        const pageId = tile.dataset.pageId;
        const actions = {
            preview: () => handlers.onPreview?.(pageId, tile),
            'rotate-page': () => handlers.onRotatePage?.(pageId),
            'delete-page': () => handlers.onDeletePage?.(pageId),
        };
        actions[actionElement.dataset.action]?.();
    });

    renderAll();
}
