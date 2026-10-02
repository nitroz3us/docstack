/**
 * Runs inside ZetaOffice's office thread (a web worker): opens a file from the in-memory file
 * system with LibreOffice and saves it as a PDF.
 */

import { ZetaHelperThread } from '../../lib/zetajs/zetaHelper.js';

const helper = new ZetaHelperThread();
const { zetajs, css } = helper;

const hidden = new css.beans.PropertyValue({ Name: 'Hidden', Value: true });
const overwrite = new css.beans.PropertyValue({ Name: 'Overwrite', Value: true });

helper.thrPort.onmessage = ({ data }) => {
    if (data.cmd !== 'convert') return;
    let model;
    try {
        model = helper.desktop.loadComponentFromURL(`file://${data.from}`, '_blank', 0, [hidden]);
        if (!model) throw new Error('The file could not be opened.');
        const filter = new css.beans.PropertyValue({ Name: 'FilterName', Value: data.filter });
        model.storeToURL(`file://${data.to}`, [overwrite, filter]);
        zetajs.mainPort.postMessage({ cmd: 'converted', id: data.id });
    } catch (error) {
        let message = error?.message;
        try {
            message = zetajs.catchUnoException(error).Message || message;
        } catch {
            // Not a UNO exception; keep the plain message.
        }
        zetajs.mainPort.postMessage({ cmd: 'failed', id: data.id, message: message || 'The file could not be converted.' });
    } finally {
        try {
            model?.close(false);
        } catch {
            // Already closed, or never opened.
        }
    }
};

helper.thrPort.postMessage({ cmd: 'ready' });
