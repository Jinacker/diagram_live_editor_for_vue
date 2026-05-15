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
    diagramType: { type: String, default: 'flowchart' },
    direction: { type: String, default: 'TD' },
    canUndo: { type: Boolean, default: false },
    canRedo: { type: Boolean, default: false },
    autonumber: { type: Boolean, default: false },
    fullScreen: { type: Boolean, default: false },
    directionLocked: { type: Boolean, default: false }
  },
  data: function () {
    return {
      showShapePicker: false,
      pendingNodeText: 'Node',
      pendingNodeColor: '',
      showExportMenu: false
    };
  },
  computed: {
    isFlowchart: function () {
      return this.diagramType !== 'sequenceDiagram';
    }
  },
  methods: {
    toggleShapePicker: function () {
      this.showShapePicker = !this.showShapePicker;
      if (this.showShapePicker) this.showExportMenu = false;
      if (this.showShapePicker) {
        this.pendingNodeText = 'Node';
        this.pendingNodeColor = '';
      }
    },
    toggleExportMenu: function () {
      this.showExportMenu = !this.showExportMenu;
      if (this.showExportMenu) this.showShapePicker = false;
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
    toggleFullscreen: function () { this.$emit('toggle-fullscreen'); },
    copySvg: function () { this.$emit('copy-svg'); },
    exportAs: function (format) {
      this.showExportMenu = false;
      this.$emit('export-' + format);
    },
    _handleDocumentClick: function (e) {
      if (!this.showShapePicker && !this.showExportMenu) return;
      if (this.$el && this.$el.contains(e.target)) return;
      this.showShapePicker = false;
      this.showExportMenu = false;
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
        <div v-if="isFlowchart" class="toolbar__group">\
          <select class="toolbar__select" :value="direction" @change="changeDirection" :disabled="directionLocked" :title="directionLocked ? \'Direction change not supported for graph diagrams\' : \'Layout direction\'">\
            <option value="TD">Top Down</option>\
            <option value="LR">Left Right</option>\
            <option value="BT">Bottom Top</option>\
            <option value="RL">Right Left</option>\
          </select>\
        </div>\
        <div class="toolbar__group toolbar__group--zoom">\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="zoomIn" title="Zoom In" aria-label="Zoom In">\
            <svg class="toolbar__icon-svg" viewBox="0 0 24 24" aria-hidden="true">\
              <circle cx="10" cy="10" r="6.5"></circle>\
              <line x1="14.8" y1="14.8" x2="20" y2="20"></line>\
              <line x1="7" y1="10" x2="13" y2="10"></line>\
              <line x1="10" y1="7" x2="10" y2="13"></line>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="zoomOut" title="Zoom Out" aria-label="Zoom Out">\
            <svg class="toolbar__icon-svg" viewBox="0 0 24 24" aria-hidden="true">\
              <circle cx="10" cy="10" r="6.5"></circle>\
              <line x1="14.8" y1="14.8" x2="20" y2="20"></line>\
              <line x1="7" y1="10" x2="13" y2="10"></line>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating toolbar__icon-btn--fitview" @click="fitView" title="Fit to View" aria-label="Fit to View">\
            <svg class="toolbar__icon-img toolbar__icon-img--fitview" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-zoom-to-fit-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="6" y="6" width="20" height="20">\
                <rect x="6" y="6" width="20" height="20" fill="#D9D9D9"/>\
              </mask>\
              <g mask="url(#icon-zoom-to-fit-mask)">\
                <path d="M10.0625 23L9 21.9375L11.4375 19.5H10V18H14V22H12.5V20.5625L10.0625 23ZM21.9375 23L19.5 20.5625V22H18V18H22V19.5H20.5625L23 21.9375L21.9375 23ZM10 14V12.5H11.4375L9 10.0625L10.0625 9L12.5 11.4375V10H14V14H10ZM18 14V10H19.5V11.4375L21.9375 9L23 10.0625L20.5625 12.5H22V14H18Z" fill="#767676"/>\
              </g>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="toggleFullscreen" :title="fullScreen ? \'Exit Fullscreen\' : \'Fullscreen\'" :aria-label="fullScreen ? \'Exit Fullscreen\' : \'Fullscreen\'">\
            <svg v-if="!fullScreen" class="toolbar__icon-img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-fullscreen-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">\
                <path fill="#D9D9D9" d="M0 0h24v24H0z"/>\
              </mask>\
              <g mask="url(#icon-fullscreen-mask)">\
                <path d="M14 17h5v-5h-2v3h-3v2zm-9-5h2V9h3V7H5v5zm-1 8c-.55 0-1.02-.196-1.413-.587A1.926 1.926 0 0 1 2 18V6c0-.55.196-1.02.587-1.412A1.926 1.926 0 0 1 4 4h16c.55 0 1.02.196 1.413.588.391.391.587.862.587 1.412v12c0 .55-.196 1.02-.587 1.413A1.926 1.926 0 0 1 20 20H4zm0-2h16V6H4v12z" fill="#969696"/>\
              </g>\
            </svg>\
            <svg v-else class="toolbar__icon-img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-fullscreen-active-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">\
                <path fill="#0081ea" d="M0 0h24v24H0z"/>\
              </mask>\
              <g mask="url(#icon-fullscreen-active-mask)">\
                <path d="M14 17h5v-5h-2v3h-3v2zm-9-5h2V9h3V7H5v5zm-1 8c-.55 0-1.02-.196-1.413-.587A1.926 1.926 0 0 1 2 18V6c0-.55.196-1.02.587-1.412A1.926 1.926 0 0 1 4 4h16c.55 0 1.02.196 1.413.588.391.391.587.862.587 1.412v12c0 .55-.196 1.02-.587 1.413A1.926 1.926 0 0 1 20 20H4zm0-2h16V6H4v12z" fill="#0081ea"/>\
              </g>\
            </svg>\
          </button>\
          <div class="toolbar__export-wrap">\
            <button class="toolbar__btn" @click="toggleExportMenu" title="Export diagram">Export</button>\
            <div v-if="showExportMenu" class="toolbar__export-menu" @click.stop>\
              <button class="toolbar__export-option" @click="exportAs(\'png\')">PNG</button>\
              <button class="toolbar__export-option" @click="exportAs(\'svg\')">SVG</button>\
              <button class="toolbar__export-option" @click="exportAs(\'jpg\')">JPG</button>\
            </div>\
          </div>\
        </div>\
      </div>\
    </div>\
  '
});
