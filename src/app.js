(function () {
  'use strict';

  if (!window.Vue) {
    throw new Error('GUI Editor embed preview requires Vue 2.');
  }

  if (!window.mermaid) {
    throw new Error('GUI Editor embed preview requires Mermaid.');
  }

  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'default'
  });

  new window.Vue({
    el: '#app',
    data: function () {
      return {
        diagram: [
          'flowchart TD',
          '    A[Start] --> B{Decision}',
          '    B -->|Yes| C[Process A]',
          '    B -->|No| D[Process B]',
          '    C --> E[End]',
          '    D --> E'
        ].join('\n')
      };
    },
    template: [
      '<div class="demo-modal">',
      '  <div class="demo-modal__header">',
      '    <span>Flowchart Setting</span>',
      '    <button type="button" class="demo-modal__close" aria-label="Close">&times;</button>',
      '  </div>',
      '  <div class="demo-modal__tabs" aria-hidden="true">',
      '    <button type="button" class="demo-modal__tab">Mermaid Code</button>',
      '    <button type="button" class="demo-modal__tab demo-modal__tab--active">GUI Editor</button>',
      '    <button type="button" class="demo-modal__tab">Source Code</button>',
      '  </div>',
      '  <div class="demo-modal__body">',
      '    <mermaid-full-editor',
      '      :value="diagram"',
      '      @input="diagram = $event"',
      '    ></mermaid-full-editor>',
      '  </div>',
      '</div>'
    ].join('')
  });
})();
