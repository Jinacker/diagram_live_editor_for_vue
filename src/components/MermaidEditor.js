/**
 * MermaidEditor Component
 * Left panel: Mermaid script textarea with status bar.
 */

Vue.component('mermaid-editor', {
  props: {
    value: { type: String, default: '' },
    error: { type: String, default: '' }
  },
  data: function () {
    return {
      localValue: this.value,
      debounceTimer: null
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
    lineCount: function () {
      return this.localValue ? this.localValue.split('\n').length : 0;
    },
    charCount: function () {
      return this.localValue ? this.localValue.length : 0;
    }
  },
  methods: {
    onInput: function (e) {
      this.localValue = e.target.value;
      var self = this;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(function () {
        self.$emit('input', self.localValue);
      }, 300);
    },
    onKeyDown: function (e) {
      // Tab key support
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
    }
  },
  template: '\
    <div class="panel panel--editor">\
      <div class="panel__header">\
        <span class="panel__title">\
          <span class="panel__title-dot"></span>\
          Script Editor\
        </span>\
      </div>\
      <div class="code-editor">\
        <textarea\
          class="code-editor__textarea"\
          :value="localValue"\
          @input="onInput"\
          @keydown="onKeyDown"\
          placeholder="flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]"\
          spellcheck="false"\
        ></textarea>\
        <div v-if="error" class="code-editor__error">\
          <span>⚠</span> {{ error }}\
        </div>\
        <div class="code-editor__status">\
          <span>Lines: {{ lineCount }} | Chars: {{ charCount }}</span>\
          <span>Mermaid Flowchart</span>\
        </div>\
      </div>\
    </div>\
  '
});
