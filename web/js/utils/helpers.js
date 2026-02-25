/**
 * docstack Helper Utilities
 */

/**
 * Format file size to human readable string
 * @param {number} bytes 
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Parse page selection rules (e.g., "1..3, 5, -1>")
 * @param {string} rulesStr - Rules string
 * @param {number} pageCount - Total page count
 * @returns {Array<{page: number, rotation: number}>}
 */
export function parseRules(rulesStr, pageCount) {
    if (!rulesStr.trim()) {
        // Default: all pages, no rotation
        return Array.from({ length: pageCount }, (_, i) => ({ page: i, rotation: 0 }));
    }

    const results = [];
    const parts = rulesStr.replace(/\s/g, '').split(',');

    for (const part of parts) {
        // Match: optional start, optional .., optional end, optional rotation
        const match = part.match(/^(-?\d+)?(\.\.)?(-?\d+)?([>V<])?$/);
        if (!match) continue;

        let [, startStr, hasRange, endStr, rotation] = match;
        const rotationDegrees = { '>': 90, 'V': 180, '<': 270 }[rotation] || 0;

        // Convert to 0-indexed
        let start = startStr ? parseInt(startStr) : 1;
        let end = endStr ? parseInt(endStr) : (hasRange ? pageCount : start);

        // Handle negative indices
        if (start < 0) start = pageCount + start + 1;
        if (end < 0) end = pageCount + end + 1;

        // Clamp to valid range
        start = Math.max(1, Math.min(pageCount, start));
        end = Math.max(1, Math.min(pageCount, end));

        // Generate page range
        const step = start <= end ? 1 : -1;
        for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
            results.push({ page: p - 1, rotation: rotationDegrees }); // Convert to 0-indexed
        }
    }

    return results;
}

/**
 * Generate a unique ID
 * @returns {string}
 */
export function generateId() {
    return crypto.randomUUID();
}

/**
 * Calculate HSL hue for file color coding
 * Uses golden angle approximation for good distribution
 * @param {number} index - File index
 * @returns {number} - Hue value (0-360)
 */
export function getFileHue(index) {
    // Start at Blue (210deg), use golden angle approx (137.5 deg) for distribution
    return ((index * 137.508) + 210) % 360;
}
