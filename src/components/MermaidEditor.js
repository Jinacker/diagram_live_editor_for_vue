/**
 * MermaidEditor 컴포넌트
 * 왼쪽 패널의 Mermaid 스크립트 textarea와 상태 바를 담당한다.
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
      // 외부(model -> script) 갱신이 들어오면 textarea 로컬 상태도 따라간다.
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
    },
    placeholderText: function () {
      if (this.diagramType === 'sequenceDiagram') {
        return 'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    John-->>-Alice: Hi Alice, I can hear you!';
      }
      return 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]';
    },
    statusText: function () {
      return this.diagramType === 'sequenceDiagram' ? 'Mermaid Sequence Diagram' : 'Mermaid Flowchart';
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
      // 매 타이핑마다 바로 parse하지 않고 짧게 debounce해서 editor 입력감을 유지한다.
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(function () {
        self.$emit('input', self.localValue);
      }, 300);
    },
    onKeyDown: function (e) {
      // Tab 키 입력 시 실제 공백 4칸을 넣는다.
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
          :placeholder="placeholderText"\
          spellcheck="false"\
        ></textarea>\
        <div v-if="error" class="code-editor__error">\
          <span>⚠</span> {{ error }}\
        </div>\
        <div class="code-editor__status">\
          <span>Lines: {{ lineCount }} | Chars: {{ charCount }}</span>\
          <span>{{ statusText }}</span>\
        </div>\
      </div>\
    </div>\
  '
});
