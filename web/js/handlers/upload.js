import * as state from '../state.js';
import { generateId } from '../utils/helpers.js';
import { getPageCount, hasPdfSignature, loadPdfDocument } from '../utils/pdf.js';
import { imageToPdf, looksLikeImage } from '../utils/image.js';
import { canConvertOfficeFiles, looksLikeOfficeFile, officeToPdf } from '../utils/office.js';
import { showPasswordModal } from '../ui/modals.js';

function looksLikePdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

// For files that can't be converted here (spreadsheets, Keynote and Pages, or any Office file
// when the converter is unavailable): the app that made them can export a PDF.
const EXPORT_HINTS = [
    [/\.(pptx?|key|odp)$/i, 'PowerPoint, Keynote or Google Slides'],
    [/\.(docx?|pages|odt|rtf)$/i, 'Word, Pages or Google Docs'],
    [/\.(xlsx?|numbers|ods)$/i, 'Excel, Numbers or Google Sheets'],
];

function exportHint(file) {
    return EXPORT_HINTS.find(([pattern]) => pattern.test(file.name))?.[1];
}

function describeIgnored(ignoredFiles) {
    const hinted = ignoredFiles.filter(exportHint);
    if (hinted.length === 1 && ignoredFiles.length === 1) {
        const [file] = hinted;
        return `${file.name} can't be opened here. Export it as a PDF from ${exportHint(file)}, then add the PDF.`;
    }
    const count = ignoredFiles.length;
    const summary = `${count} unsupported file${count === 1 ? ' was' : 's were'} ignored. Add PDFs, images, PowerPoint or Word files.`;
    return hinted.length > 0
        ? `${summary} Export Office documents as PDF from the app that made them first.`
        : summary;
}

/**
 * @param {FileList|File[]} fileList
 * @param {Object} [callbacks]
 * @param {{insertAt?: number}} [options] - insert the files at this page position, in order,
 *   instead of adding them after the current pages.
 */
export async function handleFiles(fileList, callbacks = {}, { insertAt } = {}) {
    const candidates = Array.from(fileList);
    const isSupported = file => looksLikePdf(file) || looksLikeImage(file)
        || (looksLikeOfficeFile(file) && canConvertOfficeFiles());
    const files = candidates.filter(isSupported);
    const ignoredFiles = candidates.filter(file => !isSupported(file));
    const ignored = ignoredFiles.length;

    if (ignored > 0) callbacks.onError?.(describeIgnored(ignoredFiles));
    if (files.length === 0) return { added: 0, ignored };

    callbacks.onBusy?.(true);
    let added = 0;
    let position = insertAt;

    try {
        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            // Office files have several slow steps ahead, so their bar starts near the beginning.
            callbacks.onProgress?.(index, files.length, `Opening ${file.name}`, looksLikeOfficeFile(file) ? { fraction: 0.02 } : undefined);

            try {
                let arrayBuffer;
                if (await hasPdfSignature(file)) {
                    arrayBuffer = await file.arrayBuffer();
                } else if (looksLikeImage(file)) {
                    arrayBuffer = await imageToPdf(file);
                } else if (looksLikeOfficeFile(file)) {
                    // Each stage owns a slice of the bar. Only the data download reports real progress;
                    // the others creep towards the end of their slice so the bar never stands still.
                    // The engine itself downloads first with no progress events.
                    const stages = {
                        download: ({ loaded, total }) => [
                            `Loading the conversion tool (about 50 MB the first time) · ${Math.round((loaded / total) * 100)}%`,
                            { fraction: 0.3 + 0.3 * (loaded / total) },
                        ],
                        start: () => ['Starting the conversion tool, this takes a few seconds', { fraction: 0.6, creepTo: 0.85, creepSeconds: 10 }],
                        convert: () => [`Converting ${file.name}`, { fraction: 0.85, creepTo: 0.97, creepSeconds: 10 }],
                    };
                    callbacks.onProgress?.(index, files.length, 'Loading the conversion tool (about 50 MB the first time)', {
                        fraction: 0.02, creepTo: 0.3, creepSeconds: 25,
                    });
                    arrayBuffer = await officeToPdf(file, {
                        onStatus: status => callbacks.onProgress?.(index, files.length, ...stages[status.stage](status)),
                    });
                } else {
                    callbacks.onError?.(`${file.name} does not contain valid PDF data.`);
                    continue;
                }

                let pdfProxy = null;
                let password = null;
                let showError = false;

                while (!pdfProxy) {
                    try {
                        pdfProxy = await loadPdfDocument(arrayBuffer, password);
                    } catch (error) {
                        if (error.name !== 'PasswordException') throw error;
                        password = await showPasswordModal(file.name, showError);
                        if (password === null) break;
                        showError = true;
                    }
                }
                if (!pdfProxy) continue;

                const pageCount = getPageCount(pdfProxy);
                state.addFile({
                    id: generateId(),
                    name: file.name,
                    size: file.size,
                    arrayBuffer,
                    pdfProxy,
                    pageCount,
                    password,
                }, { insertAt: position });
                if (position !== undefined) position += pageCount;
                added++;
                callbacks.onFileAdded?.(file.name);
            } catch (error) {
                console.error(`Could not open ${file.name}`, error);
                callbacks.onError?.(`Could not open ${file.name}. ${error.message || 'The file may be damaged.'}`);
            }
        }
    } finally {
        callbacks.onProgress?.(files.length, files.length, 'Documents ready', { added });
        callbacks.onBusy?.(false);
    }

    return { added, ignored };
}
