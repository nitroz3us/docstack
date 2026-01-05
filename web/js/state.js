/**
 * docstack State Management
 * 
 * Centralized state store with event-based synchronization.
 * All state mutations should go through exported functions to ensure
 * proper event dispatching for cross-view synchronization.
 */

// Event emitter for state changes
export const events = new EventTarget();

// Emit a state change event
export function emit(type, detail = {}) {
    events.dispatchEvent(new CustomEvent(type, { detail }));
}

// Subscribe to state changes
export function on(type, handler) {
    events.addEventListener(type, handler);
    return () => events.removeEventListener(type, handler);
}

// ============================================
// Application State
// ============================================

/**
 * Uploaded files array - Source of Truth
 * @type {Array<{
 *   id: string,
 *   name: string,
 *   size: number,
 *   arrayBuffer: ArrayBuffer,
 *   pdfProxy: Object,
 *   pageCount: number,
 *   rules: string,
 *   pageRotations: number[],
 *   pageOrder: number[],
 *   password?: string,
 *   importedPages?: Array<{newIndex: number, sourceFileId: string, sourcePageIndex: number}>
 * }>}
 */
export let uploadedFiles = [];

/**
 * Global page order for "Pages" view
 * @type {Array<{fileId: string, pageIndex: number}>}
 */
export let globalPageOrder = [];

/**
 * Current view mode
 * @type {'byFile' | 'allPages'}
 */
export let currentView = 'byFile';

/**
 * Whether the "Pages" view has been rendered
 * @type {boolean}
 */
export let allPagesRendered = false;

/**
 * Lightbox state
 * @type {{fileId: string | null, orderIndex: number}}
 */
export let lightboxState = { fileId: null, orderIndex: 0 };

// ============================================
// State Mutation Functions
// ============================================

/**
 * Add a new file to the state
 * @param {Object} fileData 
 */
export function addFile(fileData) {
    uploadedFiles.push(fileData);
    // Invalidate pages view cache
    allPagesRendered = false;
    globalPageOrder = [];
    emit('file:added', { file: fileData });
}

/**
 * Remove a file from the state
 * @param {string} fileId 
 */
export function removeFile(fileId) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    globalPageOrder = globalPageOrder.filter(item => item.fileId !== fileId);
    emit('file:removed', { fileId });
}

/**
 * Reorder uploaded files
 * @param {string[]} newFileIds - Array of file IDs in new order
 */
export function reorderFiles(newFileIds) {
    const fileMap = new Map(uploadedFiles.map(f => [f.id, f]));
    uploadedFiles = newFileIds.map(id => fileMap.get(id)).filter(f => f);
    // Invalidate/Rebuild cache
    allPagesRendered = false;
    globalPageOrder = [];
    emit('files:reordered', { order: newFileIds });
}

/**
 * Get a file by ID
 * @param {string} fileId 
 * @returns {Object | undefined}
 */
export function getFile(fileId) {
    return uploadedFiles.find(f => f.id === fileId);
}

/**
 * Delete a page from a file
 * @param {string} fileId 
 * @param {number} pageIndex 
 */
export function deletePage(fileId, pageIndex) {
    const file = getFile(fileId);
    if (!file) return;

    file.pageOrder = file.pageOrder.filter(idx => idx !== pageIndex);
    globalPageOrder = globalPageOrder.filter(
        item => !(item.fileId === fileId && item.pageIndex === pageIndex)
    );

    emit('page:deleted', { fileId, pageIndex });
}

/**
 * Rotate a page
 * @param {string} fileId 
 * @param {number} pageIndex 
 * @param {number} degrees - Rotation amount (usually 90)
 */
export function rotatePage(fileId, pageIndex, degrees = 90) {
    const file = getFile(fileId);
    if (!file) return;

    file.pageRotations[pageIndex] = (file.pageRotations[pageIndex] + degrees) % 360;
    emit('page:rotated', { fileId, pageIndex, rotation: file.pageRotations[pageIndex] });
}

/**
 * Update file rules
 * @param {string} fileId 
 * @param {string} rules 
 */
export function updateFileRules(fileId, rules) {
    const file = getFile(fileId);
    if (file) {
        file.rules = rules;
        emit('file:rulesUpdated', { fileId, rules });
    }
}

/**
 * Set the current view
 * @param {'byFile' | 'allPages'} view 
 */
export function setView(view) {
    currentView = view;
    emit('view:changed', { view });
}

/**
 * Mark pages view as rendered
 */
export function markPagesViewRendered() {
    allPagesRendered = true;
}

/**
 * Invalidate pages view cache
 */
export function invalidatePagesView() {
    allPagesRendered = false;
    globalPageOrder = [];
}

/**
 * Reset pages view state for rebuilding (used on subsequent uploads)
 */
export function resetPagesViewState() {
    allPagesRendered = false;
}

/**
 * Build global page order from uploaded files
 */
export function buildGlobalPageOrder() {
    globalPageOrder = [];
    for (const file of uploadedFiles) {
        for (const pageIndex of file.pageOrder) {
            globalPageOrder.push({ fileId: file.id, pageIndex });
        }
    }
}

/**
 * Update global page order (after drag-and-drop)
 * @param {Array<{fileId: string, pageIndex: number}>} newOrder 
 */
export function setGlobalPageOrder(newOrder) {
    globalPageOrder = newOrder;
}

/**
 * Set lightbox state
 * @param {string} fileId 
 * @param {number} orderIndex 
 */
export function setLightboxState(fileId, orderIndex) {
    lightboxState = { fileId, orderIndex };
}

/**
 * Check if there are any files
 * @returns {boolean}
 */
export function hasFiles() {
    return uploadedFiles.length > 0;
}

/**
 * Get file count
 * @returns {number}
 */
export function getFileCount() {
    return uploadedFiles.length;
}

/**
 * Get total page count across all files
 * @returns {number}
 */
export function getTotalPageCount() {
    return uploadedFiles.reduce((sum, f) => sum + f.pageOrder.length, 0);
}
