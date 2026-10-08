/* js/forms/listing-published.js: the "Listing Published" panel of an Add / Edit listing form.
 *
 * Shown when a listing goes Active and the server answers with its addresses (the status route answers publicUrl and realPlusUrl):
 *
 *   MallanListingPublished.show({ prefix: 'rental', listingId: 'RL-1', publicUrl: '...', realPlusUrl: '...', toast: showToast,
 *                                 dashboardUrl: '/crm/dashboard#/ops/listings' })
 *
 * The panel is <prefix>PublishUrlPanel, its two address boxes are <prefix>PublicUrlInput and <prefix>RealPlusUrlInput. Shown again, it is rebuilt, not added to.
 *
 * Built with DOM calls: the listing id and the two addresses come back from the server and are text and attribute values here, never markup. The View Listing link is made only for a web address
 * (http, https, or from this site's own root); the Copy buttons copy through the browser's clipboard and, where it has none (a page that is not secure), select the address and say so.
 */
(function (global) {
  'use strict';

  function webAddress(value) { return (typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(value.trim())) ? value.trim() : ''; }

  function element(tag, className, text) {
    var el = global.document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function button(className, label, onClick) {
    var b = element('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function show(options) {
    var prefix = options.prefix;
    var toast = options.toast || function () {};
    var navigate = options.navigate || function (url) { global.location.href = url; };
    var id = prefix + 'PublishUrlPanel';
    var panel = global.document.getElementById(id);
    if (!panel) {
      panel = element('div', 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]');
      panel.id = id;
      global.document.body.appendChild(panel);
    }
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    function copy(input, label) {
      var failed = function () { input.focus(); input.select(); toast('Could not copy by itself: the address is selected, press Ctrl+C', 'warning'); };
      try {
        var clipboard = global.navigator && global.navigator.clipboard;
        if (clipboard && clipboard.writeText) clipboard.writeText(input.value).then(function () { toast(label + ' copied', 'success'); }, failed);
        else failed();
      } catch (e) { failed(); }
    }

    function addressRow(label, inputId, address, buttonClass, copied, spacing) {
      var block = element('div', spacing);
      block.appendChild(element('label', 'text-xs font-semibold text-gray-500 block mb-1', label));
      var line = element('div', 'flex items-center gap-2');
      var input = element('input', 'flex-1 text-sm border rounded px-3 py-2 bg-gray-50 text-gray-800 font-mono');
      input.id = inputId; input.type = 'text'; input.readOnly = true; input.value = String(address || '');
      line.appendChild(input);
      var copyButton = button(buttonClass, '', function () { copy(input, copied); });
      copyButton.appendChild(element('i', 'fas fa-copy mr-1'));
      copyButton.appendChild(global.document.createTextNode('Copy'));
      line.appendChild(copyButton);
      block.appendChild(line);
      return block;
    }

    var card = element('div', 'bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4');
    var heading = element('h3', 'text-lg font-bold text-green-700 mb-3');
    heading.appendChild(element('i', 'fas fa-check-circle mr-2'));
    heading.appendChild(global.document.createTextNode('Listing Published'));
    card.appendChild(heading);
    var intro = element('p', 'text-sm text-gray-600 mb-4');
    intro.appendChild(global.document.createTextNode('Listing '));
    intro.appendChild(element('strong', '', String(options.listingId)));
    intro.appendChild(global.document.createTextNode(' is now Active on mallan.nyc.'));
    card.appendChild(intro);
    card.appendChild(addressRow('Public URL', prefix + 'PublicUrlInput', options.publicUrl, 'px-3 py-2 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700', 'Public URL', 'mb-3'));
    card.appendChild(addressRow('RealPlus URL', prefix + 'RealPlusUrlInput', options.realPlusUrl, 'px-3 py-2 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700', 'RealPlus URL', 'mb-4'));
    var actions = element('div', 'flex justify-end gap-2');
    actions.appendChild(button('px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300', 'Close', function () { panel.remove(); }));
    if (options.dashboardUrl) {
      actions.appendChild(button('px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300', 'Go to Dashboard', function () { panel.remove(); navigate(options.dashboardUrl); }));
    }
    var viewAddress = webAddress(options.publicUrl);
    if (viewAddress) {
      var view = element('a', 'px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 inline-flex items-center');
      view.href = viewAddress; view.target = '_blank'; view.rel = 'noopener noreferrer';
      view.appendChild(element('i', 'fas fa-external-link-alt mr-1'));
      view.appendChild(global.document.createTextNode('View Listing'));
      actions.appendChild(view);
    }
    card.appendChild(actions);
    panel.appendChild(card);
    panel.style.display = 'flex';
    return panel;
  }

  global.MallanListingPublished = { show: show, webAddress: webAddress };
})(typeof window !== 'undefined' ? window : this);
