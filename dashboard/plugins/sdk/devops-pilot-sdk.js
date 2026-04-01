/**
 * DevOps Pilot -- Plugin SDK
 * Include this in plugin iframes: <script src="/plugins/sdk/devops-pilot-sdk.js"></script>
 * Provides: DevOpsPilot.getContext(), .switchTab(), .askAi(), .toast(), .api(), .on()
 */
(function () {
  'use strict';
  const pending = new Map();
  let reqId = 0;

  // Listen for messages from the host app
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || !msg.__devopsPilot) return;

    // Handle context response
    if (msg.type === 'contextResponse' && pending.has(msg.requestId)) {
      pending.get(msg.requestId)(msg.data);
      pending.delete(msg.requestId);
    }

    // Dispatch as custom events plugins can listen to
    var eventTypes = ['repoChanged', 'tabActivated', 'configChanged', 'iterationChanged'];
    if (eventTypes.indexOf(msg.type) !== -1) {
      window.dispatchEvent(new CustomEvent('devops-pilot:' + msg.type, { detail: msg.data }));
    }
  });

  function postToHost(msg) {
    msg.__devopsPilot = true;
    window.parent.postMessage(msg, '*');
  }

  // Auto-inject CSS theme variables from the parent window
  try {
    var parentDoc = window.parent.document.documentElement;
    var computed = window.parent.getComputedStyle(parentDoc);
    var vars = [
      '--crust', '--mantle', '--base', '--surface0', '--surface1', '--surface2',
      '--overlay0', '--overlay1', '--subtext0', '--subtext1', '--text',
      '--blue', '--sapphire', '--green', '--yellow', '--peach', '--red', '--mauve', '--teal',
      '--accent', '--font-ui', '--font-mono', '--radius', '--radius-lg'
    ];
    var css = vars.map(function (v) {
      return v + ': ' + computed.getPropertyValue(v);
    }).join('; ');
    var style = document.createElement('style');
    var baseCss = ':root { ' + css + ' } body { font-family: var(--font-ui); color: var(--text); background: var(--base); margin: 0; }';

    // Plugin tint: read from the iframe's data-tint attribute
    // Applies a subtle colored overlay to all background colors
    var tintCss = '';
    try {
      var iframes = window.parent.document.querySelectorAll('iframe[data-plugin-id]');
      for (var i = 0; i < iframes.length; i++) {
        if (iframes[i].contentWindow === window && iframes[i].dataset.tint) {
          var rgb = iframes[i].dataset.tint;
          var t = 'rgb(' + rgb + ')';
          tintCss = ':root { --plugin-tint: ' + rgb + '; }'
            + ' body { background: color-mix(in srgb, var(--base) 98%, ' + t + ' 2%); }'
            + ' .toolbar, .filter-bar, .sidebar, .sidebar-hdr, .conn-bar, .back-bar, .detail-toolbar, .editor-toolbar, .top-bar, .hdr {'
            + '   background: color-mix(in srgb, var(--mantle) 97%, ' + t + ' 3%); }'
            + ' .board-col { background: color-mix(in srgb, var(--crust) 97%, ' + t + ' 3%); }'
            + ' .board-card, .stat, .action-card, .detail-actions, .comment, .schema-box, .picker-modal, .setup {'
            + '   background: color-mix(in srgb, var(--surface0) 97%, ' + t + ' 3%); }'
            + ' .board-card:hover, .action-card:hover, .task-row:hover, .list-row:hover, .picker-item:hover, .tree-item:hover {'
            + '   background: color-mix(in srgb, var(--surface0) 95%, ' + t + ' 5%); }'
            + ' .fbtn.active, .dbtn.primary, .btn.primary {'
            + '   background: color-mix(in srgb, var(--accent) 88%, ' + t + ' 12%); }';
          break;
        }
      }
    } catch (_) {}

    style.textContent = baseCss + tintCss;
    document.head.appendChild(style);
  } catch (_) {
    // Silently fail if cross-origin
  }

  window.DevOpsPilot = {
    // Get current app context (async)
    getContext: function () {
      return new Promise(function (resolve) {
        var id = ++reqId;
        pending.set(id, resolve);
        postToHost({ type: 'getContext', requestId: id });
        setTimeout(function () {
          if (pending.has(id)) { pending.delete(id); resolve(null); }
        }, 3000);
      });
    },

    // Navigation
    switchTab: function (tab) { postToHost({ type: 'switchTab', tab: tab }); },
    viewWorkItem: function (id) { postToHost({ type: 'viewWorkItem', id: id }); },

    // AI
    askAi: function (prompt) { postToHost({ type: 'askAi', prompt: prompt }); },

    // Notifications
    toast: function (message, level) { postToHost({ type: 'toast', message: message, level: level || 'info' }); },

    // REST API helper
    api: function (apiPath, options) {
      options = options || {};
      return fetch('http://127.0.0.1:3800' + apiPath, {
        method: options.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
        body: options.body ? JSON.stringify(options.body) : undefined,
      }).then(function (r) { return r.json(); });
    },

    // Event listeners
    on: function (event, callback) {
      window.addEventListener('devops-pilot:' + event, function (e) { callback(e.detail); });
    },
  };
})();
