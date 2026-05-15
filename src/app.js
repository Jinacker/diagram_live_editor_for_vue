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

  var DEFAULT_DIAGRAM = [
    'flowchart TD',
    '    A[Start] --> B{Decision}',
    '    B -->|Yes| C[Process A]',
    '    B -->|No| D[Process B]',
    '    C --> E[End]',
    '    D --> E'
  ].join('\n');

  // hash가 #/embed 이면 GUI 전용 모드
  var isEmbedMode = window.location.hash === '#/embed';

  new window.Vue({
    el: '#app',
    data: function () {
      return {
        diagram: DEFAULT_DIAGRAM,
        embedMode: isEmbedMode
      };
    },
    template: isEmbedMode
      ? [
          '<div class="demo-modal">',
          '  <div class="demo-modal__header">',
          '    <span>Flowchart Setting <small style="font-weight:400;color:#888;margin-left:8px;">GUI only · <a href="./" style="color:#888;">← 기본 모드</a></small></span>',
          '    <button type="button" class="demo-modal__close" aria-label="Close">&times;</button>',
          '  </div>',
          '  <div class="demo-modal__body">',
          '    <mermaid-full-editor',
          '      :value="diagram"',
          '      @input="diagram = $event"',
          '      :hide-editor="true"',
          '    ></mermaid-full-editor>',
          '  </div>',
          '</div>'
        ].join('')
      : [
          '<div class="demo-modal">',
          '  <div class="demo-modal__header">',
          '    <span>Flowchart Setting <small style="font-weight:400;color:#888;margin-left:8px;"><a href="#/embed" style="color:#888;">GUI only 모드 →</a></small></span>',
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
