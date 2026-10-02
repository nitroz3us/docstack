import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOfficeSignature, looksLikeOfficeFile } from '../web/js/utils/office.js';

const file = (name, bytes) => new File([new Uint8Array(bytes)], name);
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1];
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66];

test('Office files are recognised by extension', () => {
    ['deck.pptx', 'old.PPT', 'slides.odp', 'letter.docx', 'old.doc', 'notes.rtf']
        .forEach(name => assert.equal(looksLikeOfficeFile(file(name, [])), true, name));
    // Spreadsheets are deliberately not converted: a sheet is not page-shaped.
    ['budget.xlsx', 'old.xls', 'sheet.ods', 'deck.key', 'letter.pages', 'scan.pdf', 'photo.jpg', 'archive.zip']
        .forEach(name => assert.equal(looksLikeOfficeFile(file(name, [])), false, name));
});

test('Office files must contain the format their name claims', async () => {
    assert.equal(await hasOfficeSignature(file('deck.pptx', ZIP)), true);
    assert.equal(await hasOfficeSignature(file('letter.docx', ZIP)), true);
    assert.equal(await hasOfficeSignature(file('old.doc', OLE)), true);
    assert.equal(await hasOfficeSignature(file('notes.rtf', RTF)), true);
    // A password-protected .docx is an OLE container, and junk is neither.
    assert.equal(await hasOfficeSignature(file('locked.docx', OLE)), false);
    assert.equal(await hasOfficeSignature(file('old.ppt', ZIP)), false);
    assert.equal(await hasOfficeSignature(file('broken.pptx', [1, 2, 3, 4, 5])), false);
});
