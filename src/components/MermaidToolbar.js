/**
 * MermaidToolbar Component (v2: minimal — Undo/Redo/Direction/Fit/Export)
 */

Vue.component('mermaid-toolbar', {
  props: {
    direction: { type: String,  default: 'TD'    },
    canUndo:   { type: Boolean, default: false   },
    canRedo:   { type: Boolean, default: false   }
  },
  methods: {
    addNode:         function () { this.$emit('add-node'); },
    undo:            function () { this.$emit('undo'); },
    redo:            function () { this.$emit('redo'); },
    changeDirection: function (e) { this.$emit('change-direction', e.target.value); },
    fitView:         function () { this.$emit('fit-view'); },
    copySvg:         function () { this.$emit('copy-svg'); }
  },
  template: '\
    <div class="toolbar">\
      <div class="toolbar__group">\
        <button class="toolbar__btn" @click="addNode" title="Add Node (or double-click canvas)">\
          <span class="toolbar__btn-icon">＋</span> Node\
        </button>\
      </div>\
      <div class="toolbar__separator"></div>\
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
      <div class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <select class="toolbar__select" :value="direction" @change="changeDirection" title="Layout direction">\
          <option value="TD">↓ Top → Down</option>\
          <option value="LR">→ Left → Right</option>\
          <option value="BT">↑ Bottom → Top</option>\
          <option value="RL">← Right → Left</option>\
        </select>\
      </div>\
      <div class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <button class="toolbar__btn" @click="fitView" title="Fit to View">\
          <span class="toolbar__btn-icon">⊞</span> Fit\
        </button>\
        <button class="toolbar__btn" @click="copySvg" title="Copy SVG to clipboard">\
          <span class="toolbar__btn-icon">⊡</span> SVG\
        </button>\
      </div>\
    </div>\
  '
});
