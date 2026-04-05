/**
 * MermaidToolbar 컴포넌트
 * Undo/Redo, 방향 변경, 줌, 전체 맞춤, SVG 복사를 제공한다.
 */

Vue.component('mermaid-toolbar', {
  props: {
    diagramType: { type: String,  default: 'flowchart' },
    direction: { type: String,  default: 'TD'    },
    canUndo:   { type: Boolean, default: false   },
    canRedo:   { type: Boolean, default: false   }
  },
  computed: {
    isFlowchart: function () {
      return this.diagramType !== 'sequenceDiagram';
    }
  },
  methods: {
    addNode:         function () { this.$emit('add-node'); },
    undo:            function () { this.$emit('undo'); },
    redo:            function () { this.$emit('redo'); },
    changeDirection: function (e) { this.$emit('change-direction', e.target.value); },
    zoomOut:         function () { this.$emit('zoom-out'); },
    zoomIn:          function () { this.$emit('zoom-in'); },
    fitView:         function () { this.$emit('fit-view'); },
    copySvg:         function () { this.$emit('copy-svg'); }
  },
  template: '\
    <div class="toolbar">\
      <!-- 좌측은 구조 편집, 우측은 뷰포트 조작 성격으로 묶는다. -->\
      <div class="toolbar__group">\
        <button v-if="isFlowchart" class="toolbar__btn" @click="addNode" title="Add Node (or double-click canvas)">\
          <span class="toolbar__btn-icon">＋</span> Node\
        </button>\
      </div>\
      <div v-if="isFlowchart" class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <button\
          class="toolbar__btn"\
          @click="undo"\
          :disabled="!canUndo"\
          title="Undo (Ctrl+Z)"\
        >\
          ← Undo\
        </button>\
        <button\
          class="toolbar__btn"\
          @click="redo"\
          :disabled="!canRedo"\
          title="Redo (Ctrl+Y)"\
        >\
          Redo →\
        </button>\
      </div>\
      <div v-if="isFlowchart" class="toolbar__separator"></div>\
      <div v-if="isFlowchart" class="toolbar__group">\
        <select class="toolbar__select" :value="direction" @change="changeDirection" title="Layout direction">\
          <option value="TD">↓ Top → Down</option>\
          <option value="LR">→ Left → Right</option>\
          <option value="BT">↑ Bottom → Top</option>\
          <option value="RL">← Right → Left</option>\
        </select>\
      </div>\
      <div class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <button class="toolbar__btn" @click="zoomOut" title="Zoom Out">\
          <span class="toolbar__btn-icon">－</span>\
        </button>\
        <button class="toolbar__btn" @click="zoomIn" title="Zoom In">\
          <span class="toolbar__btn-icon">＋</span>\
        </button>\
        <button class="toolbar__btn" @click="fitView" title="Fit to View">\
          <span class="toolbar__btn-icon">⊞</span> 전체 맞춤\
        </button>\
        <button class="toolbar__btn" @click="copySvg" title="Copy SVG to clipboard">\
          <span class="toolbar__btn-icon">⊡</span> SVG\
        </button>\
      </div>\
    </div>\
  '
});
