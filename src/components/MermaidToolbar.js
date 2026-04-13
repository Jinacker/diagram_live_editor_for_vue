/**
 * MermaidToolbar component
 * Keeps the viewport controls separated from edit actions.
 */

Vue.component('mermaid-toolbar', {
  SHAPES: SvgNodeHandler.SHAPES,
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'violet', value: '#a855f7' }
  ],
  props: {
    diagramType:  { type: String,  default: 'flowchart' },
    direction:    { type: String,  default: 'TD' },
    canUndo:      { type: Boolean, default: false },
    canRedo:      { type: Boolean, default: false },
    autonumber:   { type: Boolean, default: false }
  },
  data: function () {
    return {
      showShapePicker: false,
      pendingNodeText: 'Node',
      pendingNodeColor: ''
    };
  },
  computed: {
    isFlowchart: function () {
      return this.diagramType !== 'sequenceDiagram';
    },
    titleText: function () {
      return this.isFlowchart ? 'Mermaid Preview' : 'Sequence Preview';
    }
  },
  methods: {
    toggleShapePicker: function () {
      this.showShapePicker = !this.showShapePicker;
      if (this.showShapePicker) {
        this.pendingNodeText = 'Node';
        this.pendingNodeColor = '';
      }
    },
    addNode: function (shape) {
      this.showShapePicker = false;
      this.$emit('add-node', {
        shape: shape,
        text: (this.pendingNodeText || '').trim() || 'Node',
        fill: this.pendingNodeColor || ''
      });
    },
    addSequenceParticipant: function () { this.$emit('add-sequence-participant'); },
    addSequenceActor: function () { this.$emit('add-sequence-actor'); },
    addSequenceMessage: function () { this.$emit('add-sequence-message'); },
    toggleAutonumber: function () { this.$emit('toggle-autonumber'); },
    undo: function () { this.$emit('undo'); },
    redo: function () { this.$emit('redo'); },
    changeDirection: function (e) { this.$emit('change-direction', e.target.value); },
    zoomOut: function () { this.$emit('zoom-out'); },
    zoomIn: function () { this.$emit('zoom-in'); },
    fitView: function () { this.$emit('fit-view'); },
    copySvg: function () { this.$emit('copy-svg'); },
    _handleDocumentClick: function (e) {
      if (!this.showShapePicker) return;
      if (this.$el && this.$el.contains(e.target)) return;
      this.showShapePicker = false;
    }
  },
  mounted: function () {
    document.addEventListener('mousedown', this._handleDocumentClick, true);
  },
  beforeDestroy: function () {
    document.removeEventListener('mousedown', this._handleDocumentClick, true);
  },
  template: '\
    <div class="toolbar">\
      <div class="toolbar__main">\
        <div class="toolbar__title-block">\
          <div class="toolbar__eyebrow">Viewport</div>\
          <div class="toolbar__title">{{ titleText }}</div>\
        </div>\
      </div>\
      <div class="toolbar__sub">\
        <div class="toolbar__group">\
          <div v-if="isFlowchart" class="toolbar__add-node-wrap">\
            <button class="toolbar__btn toolbar__btn--active" @click="toggleShapePicker" title="Add Node">\
              <span class="toolbar__btn-icon">+</span> Add Node\
            </button>\
            <div v-if="showShapePicker" class="toolbar__shape-picker" @click.stop>\
              <div class="toolbar__shape-picker-title">Select Shape</div>\
              <input\
                class="toolbar__shape-input"\
                v-model="pendingNodeText"\
                type="text"\
                maxlength="100"\
                placeholder="Node name"\
                @keydown.enter.prevent="addNode(\'rect\')"\
              />\
              <div class="toolbar__shape-picker-title toolbar__shape-picker-title--compact">Color</div>\
              <div class="context-menu__color-row toolbar__shape-color-row">\
                <button\
                  class="context-menu__color-btn context-menu__color-btn--clear"\
                  :class="{ \'context-menu__color-btn--selected\': !pendingNodeColor }"\
                  title="default"\
                  @click="pendingNodeColor = \'\'"\
                >x</button>\
                <button\
                  v-for="color in $options.COLOR_PALETTE"\
                  :key="color.key"\
                  class="context-menu__color-btn"\
                  :class="{ \'context-menu__color-btn--selected\': pendingNodeColor === color.value }"\
                  :style="{ backgroundColor: color.value }"\
                  :title="color.key"\
                  @click="pendingNodeColor = color.value"\
                ></button>\
              </div>\
              <div class="toolbar__shape-picker-grid">\
                <button\
                  v-for="s in $options.SHAPES"\
                  :key="s.key"\
                  class="toolbar__shape-picker-btn"\
                  :title="s.name"\
                  @click="addNode(s.key)"\
                >\
                  <span class="context-menu__shape-icon" :class="\'context-menu__shape-icon--\' + s.key"></span>\
                  <span class="context-menu__shape-text">{{ s.name }}</span>\
                </button>\
              </div>\
            </div>\
          </div>\
          <button v-else class="toolbar__btn toolbar__btn--active" @click="addSequenceParticipant" title="Add participant">\
            <span class="toolbar__btn-icon">+</span> Participant\
          </button>\
          <button v-if="!isFlowchart" class="toolbar__btn" :class="{ \'toolbar__btn--active\': autonumber }" @click="toggleAutonumber" title="Toggle autonumber">\
            AutoNumber\
          </button>\
        </div>\
        <div class="toolbar__group">\
          <button class="toolbar__btn" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">Undo</button>\
          <button class="toolbar__btn" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">Redo</button>\
        </div>\
        <div class="toolbar__group toolbar__group--zoom">\
          <button class="toolbar__icon-btn" @click="zoomOut" title="Zoom Out">-</button>\
          <button class="toolbar__icon-btn" @click="zoomIn" title="Zoom In">+</button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--wide" @click="fitView" title="Fit to View">Fit</button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--wide" @click="copySvg" title="Copy SVG">Copy</button>\
        </div>\
        <div v-if="isFlowchart" class="toolbar__group">\
          <select class="toolbar__select" :value="direction" @change="changeDirection" title="Layout direction">\
            <option value="TD">↓ Top Down</option>\
            <option value="LR">→ Left Right</option>\
            <option value="BT">↑ Bottom Top</option>\
            <option value="RL">← Right Left</option>\
          </select>\
        </div>\
      </div>\
    </div>\
  '
});
