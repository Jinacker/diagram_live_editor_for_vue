/**
 * MermaidEditor component
 * Handles the raw Mermaid script textarea for the left editor pane.
 */

Vue.component('mermaid-editor', {
  props: {
    value: { type: String, default: '' },
    error: { type: String, default: '' },
    diagramType: { type: String, default: 'flowchart' }
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
    }
  },
  template: '\
    <div class="panel panel--editor">\
      <div class="code-editor">\
        <textarea\
          class="code-editor__textarea"\
          :value="localValue"\
          @input="onInput"\
          @keydown="onKeyDown"\
          :placeholder="placeholderText"\
          spellcheck="false"\
        ></textarea>\
        <div v-if="error" class="code-editor__error">\
          <span>!</span><span>{{ error }}</span>\
        </div>\
      </div>\
    </div>\
  '
});
