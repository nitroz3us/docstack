/**
 * Images are wrapped in a one-page PDF, created locally with pdf-lib, so they work everywhere an
 * ordinary page does: thumbnails, preview, rotation, redaction and export.
 */

import { ensurePdfLib } from '../handlers/merge.js';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
// Photos are embedded at full resolution; only the page is scaled down to a document-like size.
const MAX_PAGE_SIDE = 842; // A4 height in points

export function looksLikeImage(file) {
    return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name);
}

async function sniffType(file) {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    return 'other';
}

/** EXIF orientation of a JPEG (1 = upright), so phone photos aren't embedded sideways. */
function jpegOrientation(buffer) {
    const view = new DataView(buffer);
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
        const marker = view.getUint16(offset);
        const length = view.getUint16(offset + 2);
        if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) { // "Exif"
            const tiff = offset + 10;
            const little = view.getUint16(tiff) === 0x4949;
            const ifd = tiff + view.getUint32(tiff + 4, little);
            const entries = view.getUint16(ifd, little);
            for (let index = 0; index < entries; index++) {
                const entry = ifd + 2 + index * 12;
                if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
            }
            return 1;
        }
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
        offset += 2 + length;
    }
    return 1;
}

/** Decode with the browser (which applies EXIF orientation) and re-encode as a JPEG or PNG. */
async function rasterize(file, keepAlpha) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { alpha: keepAlpha });
    if (!keepAlpha) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const type = keepAlpha ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not read this image.')), type, 0.95);
    });
    return { kind: keepAlpha ? 'png' : 'jpeg', data: await blob.arrayBuffer() };
}

async function embeddableImage(file) {
    const kind = await sniffType(file);
    const data = await file.arrayBuffer();
    if (kind === 'png') return { kind, data };
    if (kind === 'jpeg') return jpegOrientation(data) === 1 ? { kind, data } : rasterize(file, false);
    // WebP, GIF, BMP, AVIF… pdf-lib can't embed these directly. Keep transparency where it may exist.
    return rasterize(file, !/jpe?g|bmp/i.test(file.type));
}

/** @returns {Promise<ArrayBuffer>} a one-page PDF showing the image. */
export async function imageToPdf(file) {
    const { PDFDocument } = await ensurePdfLib();
    const { kind, data } = await embeddableImage(file);
    const document = await PDFDocument.create();
    const image = kind === 'png' ? await document.embedPng(data) : await document.embedJpg(data);

    const scale = Math.min(1, MAX_PAGE_SIDE / Math.max(image.width, image.height));
    const width = image.width * scale;
    const height = image.height * scale;
    document.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });

    const bytes = await document.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
