/**
 * Converts PowerPoint and Word files (and their OpenDocument equivalents) to PDF on this device
 * with ZetaOffice, which is LibreOffice compiled to WebAssembly. The engine is about 50 MB, so it
 * is downloaded only when the first such file is added.
 *
 * Spreadsheets are left out on purpose: a sheet is not page-shaped, so an automatic conversion
 * either cuts columns off or shrinks them until they are unreadable. Excel's own PDF export lets
 * the author choose the print area and scaling.
 */

// The one third-party request docstack makes: the engine is too large to ship in this repository.
const ENGINE_URL = 'https://cdn.zetaoffice.net/zetaoffice_latest/';
const START_TIMEOUT_MS = 180000;
const CONVERT_TIMEOUT_MS = 180000;

const KINDS = [
    { name: 'presentation', extensions: /\.(pptx?|odp)$/i, filter: 'impress_pdf_Export' },
    { name: 'document', extensions: /\.(docx?|odt|rtf)$/i, filter: 'writer_pdf_Export' },
];

let officePromise = null;
let nextId = 0;
const pending = new Map();
let queue = Promise.resolve();

function kindOf(file) {
    return KINDS.find(kind => kind.extensions.test(file.name));
}

export function looksLikeOfficeFile(file) {
    return Boolean(kindOf(file));
}

/** The engine needs SharedArrayBuffer, which browsers only allow on cross-origin isolated pages. */
export function canConvertOfficeFiles() {
    return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Modern Office and OpenDocument files are zip archives, the older .ppt and .doc are OLE
 * compound files, and .rtf is text starting with "{\rtf". LibreOffice opens almost anything as
 * plain text, so a file that only has the right name must be rejected here.
 */
export async function hasOfficeSignature(file) {
    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const startsWith = (...expected) => expected.every((byte, index) => bytes[index] === byte);
    if (/\.rtf$/i.test(file.name)) return startsWith(0x7b, 0x5c, 0x72, 0x74, 0x66);
    if (/\.(ppt|doc)$/i.test(file.name)) return startsWith(0xd0, 0xcf, 0x11, 0xe0);
    return startsWith(0x50, 0x4b, 0x03, 0x04);
}

async function assertEngineReachable() {
    try {
        const response = await fetch(`${ENGINE_URL}soffice.js`, { method: 'HEAD' });
        if (!response.ok) throw new Error(String(response.status));
    } catch {
        throw new Error('The converter could not be downloaded. Check your connection and try again.');
    }
}

async function startOffice(onStatus) {
    await assertEngineReachable();
    const { ZetaHelperMain } = await import('../../lib/zetajs/zetaHelper.js');
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('The converter took too long to load.')), START_TIMEOUT_MS);
        // The engine expects a canvas for its (unused) interface.
        if (!document.getElementById('qtcanvas')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'qtcanvas';
            canvas.hidden = true;
            document.body.appendChild(canvas);
        }
        const helper = new ZetaHelperMain(new URL('../office/thread.js', import.meta.url).href, {
            threadJsType: 'module',
            wasmPkg: `url:${ENGINE_URL}`,
        });
        // Emscripten reports download progress as "Downloading data... (12345/67890)".
        helper.Module.setStatus = text => {
            const match = /\((\d+)\/(\d+)\)/.exec(text || '');
            if (match) onStatus?.({ loaded: Number(match[1]), total: Number(match[2]) });
        };
        helper.start(() => {
            helper.thrPort.onmessage = ({ data }) => {
                if (data.cmd === 'ready') {
                    window.clearTimeout(timer);
                    resolve(helper);
                    return;
                }
                const request = pending.get(data.id);
                if (!request) return;
                pending.delete(data.id);
                if (data.cmd === 'converted') request.resolve();
                else request.reject(new Error(data.message));
            };
        });
    });
}

function ensureOffice(onStatus) {
    if (!officePromise) {
        officePromise = startOffice(onStatus);
        officePromise.catch(() => { officePromise = null; });
    }
    return officePromise;
}

async function convert(file, { onStatus } = {}) {
    const kind = kindOf(file);
    if (!kind || !await hasOfficeSignature(file)) {
        throw new Error(`It is not a valid ${kind?.name || 'Office'} file, or it is password-protected.`);
    }
    const helper = await ensureOffice(onStatus);

    const id = ++nextId;
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const from = `/tmp/input-${id}${extension}`;
    const to = `/tmp/output-${id}.pdf`;
    const FS = helper.FS;
    FS.writeFile(from, new Uint8Array(await file.arrayBuffer()));
    try {
        await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                pending.delete(id);
                reject(new Error('The conversion took too long.'));
            }, CONVERT_TIMEOUT_MS);
            pending.set(id, {
                resolve: () => { window.clearTimeout(timer); resolve(); },
                reject: error => { window.clearTimeout(timer); reject(error); },
            });
            helper.thrPort.postMessage({ cmd: 'convert', id, from, to, filter: kind.filter });
        });
        const bytes = FS.readFile(to);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } finally {
        [from, to].forEach(path => {
            try {
                FS.unlink(path);
            } catch {
                // Never written.
            }
        });
    }
}

/**
 * @param {File} file
 * @param {{onStatus?: (progress: {loaded: number, total: number}) => void}} [options] - loading
 *   progress of the engine, the first time it is needed.
 * @returns {Promise<ArrayBuffer>} the file as a PDF.
 */
export function officeToPdf(file, options) {
    // The engine handles one document at a time.
    const result = queue.then(() => convert(file, options));
    queue = result.catch(() => {});
    return result;
}
