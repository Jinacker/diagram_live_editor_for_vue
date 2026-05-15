/**
 * MermaidEditor component
 * Handles the raw Mermaid script textarea for the left editor pane.
 */

Vue.component('mermaid-editor', {
  props: {
    value: { type: String, default: '' },
    error: { type: String, default: '' },
    warning: { type: String, default: '' },
    highlightTargets: { type: Array, default: function () { return []; } },
    diagramType: { type: String, default: 'flowchart' }
  },
  data: function () {
    return {
      localValue: this.value,
      debounceTimer: null,
      scrollTop: 0,
      scrollLeft: 0
    };
  },
  watch: {
    value: function (newVal) {
      if (newVal !== this.localValue) {
        this.localValue = newVal;
      }
    }
  },
  computed: {
    hasHighlights: function () {
      return !!(this.highlightTargets && this.highlightTargets.length);
    },
    highlightedLineMap: function () {
      return ParserHighlight.buildHighlightLineMap(this.localValue, this.highlightTargets);
    },
    highlightTransformStyle: function () {
      return {
        transform: 'translate(' + (-this.scrollLeft) + 'px, ' + (-this.scrollTop) + 'px)'
      };
    },
    highlightHtml: function () {
      var lines = String(this.localValue || '').split('\n');
      if (!lines.length) lines = [''];
      var html = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var escaped = this._escapeHtml(line || ' ');
        var cls = this.highlightedLineMap[i + 1]
          ? 'code-editor__highlight-line code-editor__highlight-line--active'
          : 'code-editor__highlight-line';
        html.push('<span class="' + cls + '">' + escaped + '</span>');
      }
      return html.join('');
    },
    placeholderText: function () {
      if (this.diagramType === 'sequenceDiagram') {
        return 'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    John-->>-Alice: Hi Alice, I can hear you!';
      }
      return 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]';
    }
  },
  methods: {
    onInput: function (e) {
      this.localValue = e.target.value;
      var self = this;
      if (this.diagramType === 'sequenceDiagram') {
        clearTimeout(this.debounceTimer);
        this.$emit('input', this.localValue);
        return;
      }
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(function () {
        self.$emit('input', self.localValue);
      }, 300);
    },
    onKeyDown: function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var textarea = e.target;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var value = textarea.value;
        textarea.value = value.substring(0, start) + '    ' + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        this.localValue = textarea.value;
        this.$emit('input', this.localValue);
      }
    },
    onScroll: function (e) {
      this.scrollTop = e.target.scrollTop || 0;
      this.scrollLeft = e.target.scrollLeft || 0;
    },
    _escapeHtml: function (text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  },
  template: '\
    <div class="panel panel--editor">\
      <div class="code-editor">\
        <div class="code-editor__stack">\
          <div v-if="hasHighlights" class="code-editor__highlight-layer" aria-hidden="true">\
            <pre class="code-editor__highlight-content" :style="highlightTransformStyle" v-html="highlightHtml"></pre>\
          </div>\
        <textarea\
          ref="textarea"\
          class="code-editor__textarea"\
          :value="localValue"\
          @input="onInput"\
          @keydown="onKeyDown"\
          @scroll="onScroll"\
          :placeholder="placeholderText"\
          spellcheck="false"\
        ></textarea>\
        </div>\
        <div v-if="error" class="code-editor__error">\
          <span>!</span><span>{{ error }}</span>\
        </div>\
        <div v-if="warning" class="code-editor__warning">\
          <span>!</span><span>{{ warning }}</span>\
        </div>\
      </div>\
    </div>\
  '
});
