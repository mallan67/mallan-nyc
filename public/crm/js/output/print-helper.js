/**
 * print-helper.js — CSP-safe print/preview window helper
 *
 * Replaces document.write() with Blob URL approach.
 * Blob URLs don't inherit the parent page's CSP, so inline styles
 * and event handlers work freely in the new window.
 */

function openPrintableWindow(html, options) {
    options = options || {};
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var features = options.features || '';
    var w = window.open(url, '_blank', features);
    if (!w) {
        URL.revokeObjectURL(url);
        showToast('Pop-up blocked! Please allow pop-ups for this site.', 'error');
        return null;
    }
    if (options.noOpener) {
        w.opener = null;
    }
    w.addEventListener('load', function() {
        URL.revokeObjectURL(url);
        if (options.autoPrint) {
            var delay = options.printDelay || 500;
            setTimeout(function() { try { w.print(); } catch(e) { console.warn('Print failed:', e); } }, delay);
        }
    });
    return w;
}
