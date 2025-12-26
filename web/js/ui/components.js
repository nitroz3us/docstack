/**
 * docstack UI Components
 * 
 * Reusable component builders for consistent UI across views
 */

import { getFileHue, formatFileSize } from '../utils/helpers.js';
import { renderPdfPage } from '../utils/pdf.js';
import * as state from '../state.js';

/**
 * Create a loading skeleton card for file uploads
 * @param {string} fileName 
 * @returns {HTMLElement}
 */
export function createLoadingCard(fileName) {
    const card = document.createElement('div');
    card.className = 'pdf-card bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4 animate-pulse';
    card.innerHTML = `
        <div class="w-16 h-20 bg-gray-200 rounded-lg flex-shrink-0"></div>
        <div class="flex-1 min-w-0">
            <p class="h-4 bg-gray-200 rounded w-3/4 mb-2"></p>
            <p class="h-3 bg-gray-200 rounded w-1/2"></p>
        </div>
        <div class="w-5 h-5 bg-gray-200 rounded-full"></div>
    `;
    return card;
}

/**
 * Create a page thumbnail element
 * @param {Object} options
 * @param {Object} options.file - File object
 * @param {number} options.pageIndex - Page index (0-based)
 * @param {string} options.view - View type ('files' or 'pages')
 * @param {number} [options.globalIndex] - Global index for pages view
 * @param {Function} [options.onPreview] - Preview click handler
 * @param {Function} [options.onRotate] - Rotate click handler
 * @param {Function} [options.onDelete] - Delete click handler
 * @returns {HTMLElement}
 */
export function createPageThumb({ file, pageIndex, view, globalIndex, onPreview, onRotate, onDelete }) {
    const pageNum = pageIndex + 1;
    const thumb = document.createElement('div');
    thumb.className = 'page-thumb relative bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm group cursor-move';
    thumb.dataset.pageIndex = pageIndex;

    if (view === 'pages') {
        thumb.dataset.fileId = file.id;
        thumb.dataset.globalIndex = globalIndex;

        // Color coding for pages view
        const fileIndex = state.uploadedFiles.findIndex(f => f.id === file.id);
        const hue = getFileHue(fileIndex);
        const colorStyle = `border-left-color: hsl(${hue}, 70%, 50%);`;

        thumb.innerHTML = `
            <div class="canvas-wrapper aspect-[3/4] bg-gray-100 border-l-4 relative" style="${colorStyle} transform: rotate(${file.pageRotations[pageIndex]}deg)">
                <canvas class="w-full h-full"></canvas>
                <div class="thumbnail-spinner absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                    <div class="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>
                </div>
            </div>
            <div class="absolute top-1 right-1 flex gap-1">
                <button class="preview-page-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-blue-50 hover:shadow" title="Preview">
                    <svg class="w-4 h-4 text-gray-500 hover:text-blue-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
                <button class="rotate-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 hover:shadow" title="Rotate 90°">
                    <svg class="w-4 h-4 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
                <button class="delete-page-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 hover:shadow" title="Delete page">
                    <svg class="w-4 h-4 text-gray-500 hover:text-red-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="flex items-center justify-between text-[10px] text-gray-500 py-1 px-1.5 bg-white border-t border-gray-50">
                <span class="font-medium truncate max-w-[80px]" title="${file.name}">${file.name}</span>
                <span>p.${pageNum}</span>
            </div>
        `;
    } else {
        // Files view - also needs file ID for deletion sync
        thumb.dataset.fileId = file.id;

        thumb.innerHTML = `
            <div class="canvas-wrapper aspect-[3/4] bg-gray-100" style="transform: rotate(${file.pageRotations[pageIndex]}deg)">
                <canvas class="w-full h-full"></canvas>
                <div class="thumbnail-spinner absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                    <div class="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>
                </div>
            </div>
            <div class="absolute top-1 right-1 flex gap-1">
                <button class="preview-page-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-blue-50 hover:shadow" title="Preview">
                    <svg class="w-4 h-4 text-gray-500 hover:text-blue-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
                <button class="rotate-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100 hover:shadow" title="Rotate 90°">
                    <svg class="w-4 h-4 text-gray-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
                <button class="delete-page-btn w-7 h-7 bg-white/95 rounded-full flex items-center justify-center shadow-sm hover:bg-red-50 hover:shadow" title="Delete page">
                    <svg class="w-4 h-4 text-gray-500 hover:text-red-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="flex items-center justify-between text-[10px] text-gray-500 py-1 px-1.5 bg-white">
                <span class="page-num">${pageNum}</span>
                <span class="rotation-label text-gray-400">${file.pageRotations[pageIndex] > 0 ? file.pageRotations[pageIndex] + '°' : ''}</span>
            </div>
        `;
    }

    // Attach event handlers
    if (onPreview) {
        thumb.querySelector('.preview-page-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onPreview(file.id, pageIndex);
        });
    }

    if (onRotate) {
        thumb.querySelector('.rotate-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onRotate(file, pageIndex, thumb);
        });
    }

    // Delete is handled via event delegation, not per-element

    return thumb;
}

/**
 * Create a file card for the Files view
 * @param {Object} file - File object
 * @param {Object} handlers - Event handlers
 * @returns {HTMLElement}
 */
export function createFileCard(file, handlers = {}) {
    const card = document.createElement('div');
    card.className = 'pdf-card bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all';
    card.dataset.fileId = file.id;

    card.innerHTML = `
        <!-- Card Header (always visible) -->
        <div class="card-header flex items-center gap-4 p-4 cursor-pointer">
            <div class="relative w-16 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                <canvas class="pdf-preview w-full h-full object-cover"></canvas>
                <div class="thumbnail-spinner absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                    <div class="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin"></div>
                </div>
                <div class="page-count absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full z-20">
                    ${file.pageCount}
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate" title="${file.name}">${file.name}</p>
                <p class="text-xs text-gray-400 mt-0.5">${file.pageCount} page${file.pageCount > 1 ? 's' : ''} • ${formatFileSize(file.size)}</p>
                <div class="flex items-center gap-2 mt-2">
                    <input 
                        type="text" 
                        placeholder="Pages (e.g. 1..3, 5)"
                        class="rules-input flex-1 text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                        data-file-id="${file.id}"
                        onclick="event.stopPropagation()"
                    >
                    <button type="button" class="help-btn text-gray-400 hover:text-gray-600 p-1" onclick="event.stopPropagation()">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <svg class="expand-icon w-5 h-5 text-gray-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                <button class="delete-btn text-gray-400 hover:text-red-500 p-1" data-file-id="${file.id}" onclick="event.stopPropagation()">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
        
        <!-- Expanded Pages (hidden by default) -->
        <div class="pages-panel hidden border-t border-gray-100 bg-gray-50 p-4">
            <p class="text-xs text-gray-400 mb-3 text-center">Drag to reorder • Click icons to preview, rotate, or delete</p>
            <div class="pages-grid grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                <!-- Page thumbnails will be inserted here -->
            </div>
        </div>
    `;

    // Render first page preview
    const canvas = card.querySelector('.pdf-preview');
    const spinner = card.querySelector('.thumbnail-spinner');
    renderPdfPage(file.pdfProxy, 1, canvas, 0.4).finally(() => spinner?.remove());

    return card;
}
