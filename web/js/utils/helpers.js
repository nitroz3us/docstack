export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generateId() {
    return crypto.randomUUID();
}

export function sanitizeOutputName(name) {
    return name.trim()
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'merged';
}
