/**
 * docstack State Management
 * 
 * Centralized state store.
 * All state mutations should go through exported functions.
 */

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
 *   pageRedactions?: Object<number, Array<{x: number, y: number, width: number, height: number}>>,
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
}

/**
 * Remove a file from the state
 * @param {string} fileId 
 */
export function removeFile(fileId) {
    uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
    globalPageOrder = globalPageOrder.filter(item => item.fileId !== fileId);
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
}

// ============================================
// Redaction Functions
// ============================================

/**
 * Add a redaction rectangle to a page
 * @param {string} fileId 
 * @param {number} pageIndex 
 * @param {{x: number, y: number, width: number, height: number}} rect - Rectangle in canvas coordinates
 */
export function addRedaction(fileId, pageIndex, rect) {
    const file = getFile(fileId);
    if (!file) return;

    if (!file.pageRedactions) file.pageRedactions = {};
    if (!file.pageRedactions[pageIndex]) file.pageRedactions[pageIndex] = [];

    file.pageRedactions[pageIndex].push(rect);
}

/**
 * Get redactions for a specific page
 * @param {string} fileId 
 * @param {number} pageIndex 
 * @returns {Array<{x: number, y: number, width: number, height: number}>}
 */
export function getRedactions(fileId, pageIndex) {
    const file = getFile(fileId);
    if (!file || !file.pageRedactions) return [];
    return file.pageRedactions[pageIndex] || [];
}

/**
 * Clear all redactions for a specific page
 * @param {string} fileId 
 * @param {number} pageIndex 
 */
export function clearRedactions(fileId, pageIndex) {
    const file = getFile(fileId);
    if (!file || !file.pageRedactions) return;

    delete file.pageRedactions[pageIndex];
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
    }
}

/**
 * Set the current view
 * @param {'byFile' | 'allPages'} view 
 */
export function setView(view) {
    currentView = view;
}

/**
 * Mark pages view as rendered
 */
export function markPagesViewRendered() {
    allPagesRendered = true;
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
 * Get total page count across all files
 * @returns {number}
 */
export function getTotalPageCount() {
    return uploadedFiles.reduce((sum, f) => sum + f.pageOrder.length, 0);
}
