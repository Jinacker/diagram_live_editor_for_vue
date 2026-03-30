/**
 * MermaidToolbar Component
 * Toolbar for diagram manipulation actions.
 */

Vue.component('mermaid-toolbar', {
  props: {
    direction: { type: String, default: 'TD' },
    edgeMode: { type: Boolean, default: false },
    selectedNode: { type: String, default: '' },
    selectedEdge: { type: Object, default: null }
  },
  methods: {
    addNode: function (e) {
      if (!e.target.value) return;
      this.$emit('add-node', e.target.value);
      e.target.value = '';
    },
    toggleEdgeMode: function () {
      this.$emit('toggle-edge-mode');
    },
    deleteSelected: function () {
      this.$emit('delete-selected');
    },
    changeDirection: function (e) {
      this.$emit('change-direction', e.target.value);
    },
    fitView: function () {
      this.$emit('fit-view');
    }
  },
  template: '\
    <div class="toolbar">\
      <div class="toolbar__group">\
        <select class="toolbar__select" @change="addNode" title="Add Node shape" style="font-weight: 500;">\
          <option value="" disabled selected>＋ Add Node</option>\
          <option value="rect">Rectangle [ ]</option>\
          <option value="round">Round ( )</option>\
          <option value="diamond">Diamond { }</option>\
          <option value="double_circle">Circle (( ))</option>\
        </select>\
      </div>\
      <div class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <button\
          class="toolbar__btn toolbar__btn--danger"\
          @click="deleteSelected"\
          :disabled="!selectedNode && !selectedEdge"\
          title="Delete Selected (Del)"\
        >\
          <span class="toolbar__btn-icon">✕</span> Delete\
        </button>\
      </div>\
      <div class="toolbar__separator"></div>\
      <div class="toolbar__group">\
        <select class="toolbar__select" :value="direction" @change="changeDirection" title="Direction">\
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
      </div>\
    </div>\
  '
});
