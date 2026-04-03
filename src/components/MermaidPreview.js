/**
 * MermaidPreview Component (v5: Thin shell — delegates to service objects)
 * - SvgPositionTracker : coordinate extraction
 * - PortDragHandler    : 4-direction ports + drag-to-connect
 * - SvgNodeHandler     : node click / dblclick / right-click / hover
 * - SvgEdgeHandler     : edge click / dblclick / right-click / label
 */

Vue.component('mermaid-preview', {
  props: {
    model: {
      type: Object,
      default: function () {
        return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
      }
    }
  },

  // Shapes list exposed for template (full 13-shape grid)
  SHAPES: SvgNodeHandler.SHAPES,

  data: function () {
    return {
      svgContent:  '',
      renderError: '',
      renderCounter: 0,

      selectedNodeId:    null,
      selectedEdgeIndex: null,

      // Node inline edit
      editingNodeId:  null,
      editingText:    '',
      editInputStyle: {},

      // Edge inline edit
      editingEdgeIndex:    null,
      editingEdgeText:     '',
      edgeEditInputStyle:  {},

      // Context menus
      contextMenu:  null,   // { nodeId, x, y }
      edgeToolbar:  null,   // { edgeIndex, x, y }  — floating edge action bar

      // Port drag state
      portDragging:  false,
      hoveredNodeId: null,

      // Internal SVG state (not reactive on purpose — rebuilt each render)
      _positions: {},
      _elements:  {},
      _edgePaths: []
    };
  },

  watch: {
    model: {
      handler: function () { this.renderDiagram(); },
      deep: true
    }
  },

  mounted: function () {
    this.renderDiagram();
    var self = this;

    // Global click: close context menus / edge toolbar
    document.addEventListener('click', function () {
      self.contextMenu = null;
      self.edgeToolbar = null;
    });

    // Global keydown: Delete, Escape, Ctrl+Z/Y
    document.addEventListener('keydown', function (e) {
      // Don't intercept when an input is focused
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId !== null || self.editingEdgeIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId:    self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        }
      }

      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.selectedNodeId    = null;
        self.selectedEdgeIndex = null;
        self.contextMenu       = null;
        self.edgeToolbar       = null;
        self.portDragging      = false;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        self.$emit('undo');
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        self.$emit('redo');
      }
    });
  },

  methods: {

    // ── Rendering ────────────────────────────────────────────────

    renderDiagram: function () {
      var m = this.model;
      if (!m || (!m.nodes.length && !m.edges.length)) {
        this.svgContent  = '';
        this.renderError = '';
        return;
      }

      var script = MermaidGenerator.generate(m);
      if (!script || /^flowchart\s+(TD|LR|BT|RL)\s*$/.test(script.trim())) {
        this.svgContent = '';
        return;
      }

      var self = this;
      self.renderCounter++;
      var containerId = 'mermaid-render-' + self.renderCounter;

      try {
        window.mermaid.render(containerId, script).then(function (result) {
          self.svgContent  = result.svg;
          self.renderError = '';
          self.$nextTick(function () { self.postRenderSetup(); });
        }).catch(function (err) {
          self.renderError = err.message || 'Render error';
          var errEl = document.getElementById('d' + containerId);
          if (errEl) errEl.remove();
        });
      } catch (e) {
        self.renderError = e.message || 'Render error';
      }
    },

    // ── Post-render wiring ────────────────────────────────────────

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      // Extract positions and elements
      var collected    = SvgPositionTracker.collectNodePositions(svgEl);
      this._positions  = collected.positions;
      this._elements   = collected.elements;
      this._edgePaths  = SvgPositionTracker.collectEdgePaths(svgEl, this.model.edges);

      // Build ctx bridge
      var ctx = this._buildCtx(svgEl);

      // Edge ghost overlay FIRST (root-level, not blocked by Mermaid's pointer-events)
      SvgEdgeHandler.initGhostOverlay(svgEl);
      SvgEdgeHandler.attach(svgEl, this._edgePaths, this._positions, ctx);

      // Port overlay on top of edge ghosts
      PortDragHandler.initOverlay(svgEl);

      // Node handlers
      SvgNodeHandler.attach(svgEl, this._positions, this._elements, ctx);

      // Canvas background click → deselect
      var self = this;
      svgEl.addEventListener('click', function (e) {
        if (e.target === svgEl ||
            (e.target.tagName && e.target.tagName.toLowerCase() === 'svg')) {
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        }
      });

      // Canvas double-click on background → add node
      svgEl.addEventListener('dblclick', function (e) {
        var t = e.target;
        var isBackground = t === svgEl ||
          (t.tagName && t.tagName.toLowerCase() === 'svg') ||
          (t.tagName && t.tagName.toLowerCase() === 'rect' && !t.closest('.node'));
        if (isBackground) {
          self.$emit('add-node');
        }
      });
    },

    _buildCtx: function (svgEl) {
      var self = this;
      var ctx = {
        emit: function (ev, data) { self.$emit(ev, data); },
        getState: function () { return self.$data; },
        setState: function (patch) {
          var keys = Object.keys(patch);
          for (var i = 0; i < keys.length; i++) {
            self[keys[i]] = patch[keys[i]];
          }
        },
        getModel: function () { return self.model; },
        findNode: function (nodeId) {
          var nodes = self.model.nodes || [];
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) return nodes[i];
          }
          return null;
        },
        watchSelection: function (nodeId, nodeEl) {
          self.$watch('selectedNodeId', function (val) {
            nodeEl.classList.toggle('selected', val === nodeId);
          }, { immediate: true });
        },
        focusEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusEdgeEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editEdgeInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
      return ctx;
    },

    // ── Node edit (confirm/cancel live in component — uses $emit) ─

    confirmNodeEdit: function () {
      if (this.editingNodeId && this.editingText.trim()) {
        this.$emit('update-node-text', {
          nodeId: this.editingNodeId,
          text:   this.editingText.trim()
        });
      }
      this.editingNodeId = null;
      this.editingText   = '';
    },

    cancelNodeEdit: function () {
      this.editingNodeId = null;
      this.editingText   = '';
    },

    onNodeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmNodeEdit(); }
      if (e.key === 'Escape') { this.cancelNodeEdit(); }
    },

    // ── Edge edit ─────────────────────────────────────────────────

    confirmEdgeEdit: function () {
      if (this.editingEdgeIndex !== null) {
        this.$emit('update-edge-text', {
          index: this.editingEdgeIndex,
          text:  this.editingEdgeText.trim()
        });
      }
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
    },

    cancelEdgeEdit: function () {
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
    },

    onEdgeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmEdgeEdit(); }
      if (e.key === 'Escape') { this.cancelEdgeEdit(); }
    },

    // ── Node context menu actions ─────────────────────────────────

    contextEditNode: function () {
      if (!this.contextMenu) return;
      var nodeId = this.contextMenu.nodeId;
      var nodeEl = this._elements[nodeId];
      this.contextMenu = null;
      if (nodeEl) SvgNodeHandler.startInlineEdit(nodeId, nodeEl, this._buildCtxLite());
    },

    contextDeleteNode: function () {
      if (!this.contextMenu) return;
      this.$emit('delete-selected', { nodeId: this.contextMenu.nodeId, edgeIndex: null });
      this.contextMenu   = null;
      this.selectedNodeId = null;
    },

    contextChangeShape: function (shape) {
      if (!this.contextMenu) return;
      this.$emit('update-node-shape', { nodeId: this.contextMenu.nodeId, shape: shape });
      this.contextMenu = null;
    },

    // ── Edge toolbar actions ──────────────────────────────────────

    edgeToolbarEdit: function () {
      if (!this.edgeToolbar) return;
      var idx = this.edgeToolbar.edgeIndex;
      var x   = this.edgeToolbar.x;
      var y   = this.edgeToolbar.y;
      this.edgeToolbar = null;
      var canvas = this.$refs.canvas;
      var svgEl  = canvas ? canvas.querySelector('svg') : null;
      SvgEdgeHandler.startInlineEdit(idx, x, y, svgEl, this._positions, this._buildCtxLite());
    },

    edgeToolbarDelete: function () {
      if (!this.edgeToolbar) return;
      this.$emit('delete-selected', { nodeId: null, edgeIndex: this.edgeToolbar.edgeIndex });
      this.edgeToolbar       = null;
      this.selectedEdgeIndex = null;
    },

    // Lightweight ctx for use outside postRenderSetup (no svgEl needed)
    _buildCtxLite: function () {
      var self = this;
      return {
        emit: function (ev, data) { self.$emit(ev, data); },
        getState: function () { return self.$data; },
        setState: function (patch) {
          var keys = Object.keys(patch);
          for (var i = 0; i < keys.length; i++) { self[keys[i]] = patch[keys[i]]; }
        },
        getModel: function () { return self.model; },
        findNode: function (nodeId) {
          var nodes = self.model.nodes || [];
          for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].id === nodeId) return nodes[i];
          }
          return null;
        },
        focusEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusEdgeEditInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.editEdgeInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
    },

    fitView: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height   = 'auto';
      }
    }
  },

  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null;">\
      \
      <!-- Port drag hint -->\
      <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
        Release on target node to connect\
      </div>\
      \
      <!-- SVG canvas -->\
      <div v-if="svgContent" ref="canvas" class="preview-area__canvas" v-html="svgContent"></div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">◇</div>\
        <div class="preview-area__empty-text">Add nodes or write Mermaid script</div>\
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">Double-click canvas to add a node</div>\
      </div>\
      \
      <!-- Node inline edit -->\
      <div v-if="editingNodeId" class="node-edit-overlay" :style="editInputStyle">\
        <input\
          ref="editInput"\
          class="node-edit-input"\
          v-model="editingText"\
          @keydown="onNodeEditKeyDown"\
          @blur="confirmNodeEdit"\
        />\
      </div>\
      \
      <!-- Edge inline edit -->\
      <div v-if="editingEdgeIndex !== null" class="node-edit-overlay" :style="edgeEditInputStyle">\
        <input\
          ref="editEdgeInput"\
          class="node-edit-input"\
          v-model="editingEdgeText"\
          placeholder="Edge label"\
          @keydown="onEdgeEditKeyDown"\
          @blur="confirmEdgeEdit"\
        />\
      </div>\
      \
      <!-- Node context menu -->\
      <div\
        v-if="contextMenu"\
        class="context-menu"\
        :style="{ left: contextMenu.x + \'px\', top: contextMenu.y + \'px\' }"\
        @click.stop\
      >\
        <div class="context-menu__section-title">Change Shape</div>\
        <div class="context-menu__shapes-grid">\
          <button\
            v-for="s in $options.SHAPES"\
            :key="s.key"\
            class="context-menu__shape-btn"\
            :title="s.name"\
            @click="contextChangeShape(s.key)"\
          >{{ s.label }}</button>\
        </div>\
        <div class="context-menu__separator"></div>\
        <div class="context-menu__item" @click="contextEditNode">\
          <span class="context-menu__item-icon">✎</span> Edit Text\
        </div>\
        <div class="context-menu__item context-menu__item--danger" @click="contextDeleteNode">\
          <span class="context-menu__item-icon">✕</span> Delete Node\
        </div>\
      </div>\
      \
      <!-- Edge floating toolbar -->\
      <div\
        v-if="edgeToolbar"\
        class="edge-toolbar"\
        :style="{ left: edgeToolbar.x + \'px\', top: edgeToolbar.y + \'px\' }"\
        @click.stop\
      >\
        <button class="edge-toolbar__btn" @click="edgeToolbarEdit" title="Edit label">\
          ✎ Label\
        </button>\
        <div class="edge-toolbar__sep"></div>\
        <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="edgeToolbarDelete" title="Delete edge">\
          ✕ Delete\
        </button>\
      </div>\
    </div>\
  '
});
