/**
 * Canonical application state.
 *
 * The composition is the only source of truth for exported page order. Views
 * may group or filter these entities, but never maintain their own merge order.
 */

export let uploadedFiles = [];
export let compositionPages = [];
export let selectedPageIds = new Set();
export let outputName = 'merged';

const listeners = new Set();
const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 50;

function createId() {
    return crypto.randomUUID();
}

function cloneRedaction(rect) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function clonePage(page) {
    return {
        ...page,
        redactions: (page.redactions || []).map(cloneRedaction),
    };
}

function snapshot() {
    return {
        uploadedFiles: [...uploadedFiles],
        compositionPages: compositionPages.map(clonePage),
        outputName,
    };
}

function restore(next) {
    uploadedFiles = [...next.uploadedFiles];
    compositionPages = next.compositionPages.map(clonePage);
    outputName = next.outputName;
    selectedPageIds = new Set(
        [...selectedPageIds].filter(id => compositionPages.some(page => page.id === id))
    );
}

function emit(detail = {}) {
    const event = { ...detail, state: getSnapshot() };
    listeners.forEach(listener => listener(event));
}

function commit(label, mutate) {
    const before = snapshot();
    mutate();
    undoStack.push({ label, state: before });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0;
    selectedPageIds = new Set(
        [...selectedPageIds].filter(id => compositionPages.some(page => page.id === id))
    );
    emit({ type: 'change', label });
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSnapshot() {
    return {
        uploadedFiles,
        compositionPages,
        selectedPageIds,
        outputName,
        canUndo: canUndo(),
        canRedo: canRedo(),
    };
}

export function resetState() {
    uploadedFiles = [];
    compositionPages = [];
    selectedPageIds = new Set();
    outputName = 'merged';
    undoStack.length = 0;
    redoStack.length = 0;
    emit({ type: 'reset' });
}

export function addFile(fileData) {
    const pages = Array.from({ length: fileData.pageCount }, (_, sourcePageIndex) => ({
        id: createId(),
        sourceFileId: fileData.id,
        sourcePageIndex,
        rotation: 0,
        redactions: [],
    }));

    commit(`Added ${fileData.name}`, () => {
        uploadedFiles = [...uploadedFiles, fileData];
        compositionPages = [...compositionPages, ...pages];
    });

    return pages;
}

export function getFile(fileId) {
    return uploadedFiles.find(file => file.id === fileId);
}

export function getPage(pageId) {
    return compositionPages.find(page => page.id === pageId);
}

export function getPagesForFile(fileId) {
    return compositionPages.filter(page => page.sourceFileId === fileId);
}

export function removeFile(fileId) {
    const file = getFile(fileId);
    if (!file) return false;

    commit(`Removed ${file.name}`, () => {
        uploadedFiles = uploadedFiles.filter(item => item.id !== fileId);
        compositionPages = compositionPages.filter(page => page.sourceFileId !== fileId);
    });
    return true;
}

/**
 * Move every page from a source document as one block. This is the explicit
 * whole-document alternative to dragging individual pages.
 */
export function moveFile(fileId, delta) {
    const fromIndex = uploadedFiles.findIndex(file => file.id === fileId);
    const toIndex = Math.max(0, Math.min(uploadedFiles.length - 1, fromIndex + delta));
    if (fromIndex < 0 || fromIndex === toIndex) return false;

    commit('Moved document', () => {
        const nextFiles = [...uploadedFiles];
        const [movedFile] = nextFiles.splice(fromIndex, 1);
        nextFiles.splice(toIndex, 0, movedFile);
        uploadedFiles = nextFiles;

        const pagesByFile = new Map(nextFiles.map(file => [file.id, []]));
        compositionPages.forEach(page => pagesByFile.get(page.sourceFileId)?.push(page));
        compositionPages = nextFiles.flatMap(file => pagesByFile.get(file.id) || []);
    });
    return true;
}

export function deletePage(pageId) {
    const page = getPage(pageId);
    if (!page) return false;
    commit('Deleted page', () => {
        compositionPages = compositionPages.filter(item => item.id !== pageId);
    });
    return true;
}

export function deletePages(pageIds) {
    const ids = new Set(pageIds);
    if (!compositionPages.some(page => ids.has(page.id))) return false;
    commit(`Deleted ${ids.size} page${ids.size === 1 ? '' : 's'}`, () => {
        compositionPages = compositionPages.filter(page => !ids.has(page.id));
    });
    return true;
}

export function rotatePages(pageIds, delta = 90) {
    const ids = new Set(pageIds);
    if (!compositionPages.some(page => ids.has(page.id))) return false;
    commit(`Rotated ${ids.size} page${ids.size === 1 ? '' : 's'}`, () => {
        compositionPages = compositionPages.map(page => ids.has(page.id)
            ? { ...page, rotation: (page.rotation + delta + 360) % 360 }
            : page
        );
    });
    return true;
}

export function movePage(pageId, delta) {
    const fromIndex = compositionPages.findIndex(page => page.id === pageId);
    const toIndex = Math.max(0, Math.min(compositionPages.length - 1, fromIndex + delta));
    if (fromIndex < 0 || fromIndex === toIndex) return false;

    commit('Moved page', () => {
        const next = [...compositionPages];
        const [page] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, page);
        compositionPages = next;
    });
    return true;
}

export function setPageOrder(pageIds) {
    if (pageIds.length !== compositionPages.length) return false;
    const pagesById = new Map(compositionPages.map(page => [page.id, page]));
    if (new Set(pageIds).size !== compositionPages.length || pageIds.some(id => !pagesById.has(id))) {
        return false;
    }

    commit('Reordered pages', () => {
        compositionPages = pageIds.map(id => pagesById.get(id));
    });
    return true;
}

export function addRedaction(pageId, normalizedRect) {
    const page = getPage(pageId);
    if (!page) return false;
    const x = Math.max(0, Math.min(1, normalizedRect.x));
    const y = Math.max(0, Math.min(1, normalizedRect.y));
    const rect = {
        x,
        y,
        width: Math.max(0, Math.min(1 - x, normalizedRect.width)),
        height: Math.max(0, Math.min(1 - y, normalizedRect.height)),
    };
    if (rect.width <= 0 || rect.height <= 0) return false;

    commit('Added redaction', () => {
        compositionPages = compositionPages.map(item => item.id === pageId
            ? { ...item, redactions: [...item.redactions, rect] }
            : item
        );
    });
    return true;
}

export function clearRedactions(pageId) {
    const page = getPage(pageId);
    if (!page || page.redactions.length === 0) return false;
    commit('Cleared redactions', () => {
        compositionPages = compositionPages.map(item => item.id === pageId
            ? { ...item, redactions: [] }
            : item
        );
    });
    return true;
}

export function setSelectedPageIds(pageIds) {
    const validIds = new Set(compositionPages.map(page => page.id));
    selectedPageIds = new Set([...pageIds].filter(id => validIds.has(id)));
    emit({ type: 'selection' });
}

export function togglePageSelection(pageId) {
    if (!getPage(pageId)) return;
    const next = new Set(selectedPageIds);
    if (next.has(pageId)) next.delete(pageId);
    else next.add(pageId);
    selectedPageIds = next;
    emit({ type: 'selection' });
}

export function clearSelection() {
    if (selectedPageIds.size === 0) return;
    selectedPageIds = new Set();
    emit({ type: 'selection' });
}

export function setOutputName(name) {
    outputName = name.trim().replace(/\.pdf$/i, '') || 'merged';
    emit({ type: 'output-name' });
}

export function canUndo() {
    return undoStack.length > 0;
}

export function canRedo() {
    return redoStack.length > 0;
}

export function undo() {
    const entry = undoStack.pop();
    if (!entry) return null;
    redoStack.push({ label: entry.label, state: snapshot() });
    restore(entry.state);
    emit({ type: 'history', direction: 'undo', label: entry.label });
    return entry.label;
}

export function redo() {
    const entry = redoStack.pop();
    if (!entry) return null;
    undoStack.push({ label: entry.label, state: snapshot() });
    restore(entry.state);
    emit({ type: 'history', direction: 'redo', label: entry.label });
    return entry.label;
}

export function hasFiles() {
    return uploadedFiles.length > 0;
}

export function getTotalPageCount() {
    return compositionPages.length;
}

export function getMergePlan() {
    const errors = [];
    const pages = compositionPages.map((page, index) => {
        const sourceFile = getFile(page.sourceFileId);
        if (!sourceFile) {
            errors.push(`Page ${index + 1} no longer has a source document.`);
        } else if (page.sourcePageIndex < 0 || page.sourcePageIndex >= sourceFile.pageCount) {
            errors.push(`Page ${index + 1} points to an invalid source page.`);
        }
        return { ...clonePage(page), sourceFile };
    });

    return {
        name: `${outputName || 'merged'}.pdf`,
        pages,
        errors,
    };
}
