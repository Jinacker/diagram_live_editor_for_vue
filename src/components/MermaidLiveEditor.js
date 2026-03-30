/**
 * MermaidLiveEditor Component
 * Main container: manages the split layout and bidirectional sync.
 */

Vue.component('mermaid-live-editor', {
  data: function () {
    return {
      script: 'flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Process A]\n    B -->|No| D[Process B]\n    C --> E[End]\n    D --> E',
      model: { type: 'flowchart', direction: 'TD', nodes: [], edges: [] },
      error: '',
      edgeMode: false,
      selectedNode: '',
      selectedEdge: null,
      syncSource: null,
      nodeCounter: 0,
      resizing: false,
      editorWidth: 38
    };
  },
  mounted: function () {
    this.parseScript();

    // Find highest node counter from existing model
    var self = this;
    this.$nextTick(function () {
      self.updateNodeCounter();
    });
  },
  methods: {
    // ---- Sync: Script → Model ----
    onScriptChange: function (newScript) {
      if (this.syncSource === 'gui') {
        this.syncSource = null;
        return;
      }
      this.script = newScript;
      this.parseScript();
    },

    parseScript: function () {
      try {
        this.model = MermaidParser.parse(this.script);
        this.error = '';
        this.updateNodeCounter();
      } catch (e) {
        this.error = e.message || 'Parse error';
      }
    },

    // ---- Sync: Model → Script ----
    updateScriptFromModel: function () {
      this.syncSource = 'gui';
      this.script = MermaidGenerator.generate(this.model);
      this.error = '';
    },

    updateNodeCounter: function () {
      if (!this.model || !this.model.nodes) return;
      var max = 0;
      for (var i = 0; i < this.model.nodes.length; i++) {
        var id = this.model.nodes[i].id;
        // Extract number from IDs like 'N5', 'Node3'
        var numMatch = id.match(/(\d+)/);
        if (numMatch) {
          var n = parseInt(numMatch[1], 10);
          if (n > max) max = n;
        }
      }
      this.nodeCounter = max;
    },

    // ---- GUI Actions ----
    addNode: function (shape) {
      if (!shape) shape = 'rect';
      this.nodeCounter++;
      var newId = 'N' + this.nodeCounter;
      var newNode = { id: newId, text: 'New Node', shape: shape };

      var nodes = this.model.nodes.slice();
      nodes.push(newNode);
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    toggleEdgeMode: function () {
      this.edgeMode = !this.edgeMode;
    },

    cancelEdgeMode: function () {
      this.edgeMode = false;
    },

    addEdge: function (data) {
      var edges = this.model.edges.slice();
      edges.push({
        from: data.from,
        to: data.to,
        text: '',
        type: '-->'
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.edgeMode = false;
      this.updateScriptFromModel();
    },

    deleteSelected: function (data) {
      if (!data) return;

      if (data.nodeId) {
        // Remove node and all its connected edges
        var nodes = this.model.nodes.filter(function (n) { return n.id !== data.nodeId; });
        var edges = this.model.edges.filter(function (e) {
          return e.from !== data.nodeId && e.to !== data.nodeId;
        });
        this.model = Object.assign({}, this.model, { nodes: nodes, edges: edges });
      } else if (data.edgeIndex !== null && data.edgeIndex !== undefined) {
        var edgesCopy = this.model.edges.slice();
        edgesCopy.splice(data.edgeIndex, 1);
        this.model = Object.assign({}, this.model, { edges: edgesCopy });
      }

      this.selectedNode = '';
      this.selectedEdge = null;
      this.updateScriptFromModel();
    },

    updateNodeText: function (data) {
      var nodes = this.model.nodes.map(function (n) {
        if (n.id === data.nodeId) {
          return Object.assign({}, n, { text: data.text });
        }
        return n;
      });
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    updateNodeShape: function (data) {
      var nodes = this.model.nodes.map(function (n) {
        if (n.id === data.nodeId) {
          return Object.assign({}, n, { shape: data.shape });
        }
        return n;
      });
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    updateEdgeText: function (data) {
      var edges = this.model.edges.map(function (e, idx) {
        if (idx === data.index) {
          return Object.assign({}, e, { text: data.text });
        }
        return e;
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    changeDirection: function (dir) {
      this.model = Object.assign({}, this.model, { direction: dir });
      this.updateScriptFromModel();
    },

    onNodeSelected: function (nodeId) {
      this.selectedNode = nodeId;
      this.selectedEdge = null;
    },

    onEdgeSelected: function (edgeIdx) {
      this.selectedEdge = this.model.edges[edgeIdx] || null;
      this.selectedNode = '';
    },

    fitView: function () {
      if (this.$refs.preview) {
        this.$refs.preview.fitView();
      }
    },

    onToolbarDeleteSelected: function () {
      this.deleteSelected({
        nodeId: this.selectedNode || null,
        edgeIndex: this.selectedEdge ? this.model.edges.indexOf(this.selectedEdge) : null
      });
    },

    // ---- Resize Handle ----
    startResize: function (e) {
      e.preventDefault();
      this.resizing = true;
      var self = this;
      var container = this.$refs.container;

      var onMove = function (me) {
        if (!self.resizing) return;
        var rect = container.getBoundingClientRect();
        var pct = ((me.clientX - rect.left) / rect.width) * 100;
        pct = Math.max(20, Math.min(70, pct));
        self.editorWidth = pct;
      };

      var onUp = function () {
        self.resizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
  },
  template: '\
    <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden;">\
      <div class="app-header">\
        <div class="app-header__logo">\
          <div class="app-header__icon">◈</div>\
          <span class="app-header__title">Mermaid Live Editor</span>\
          <span class="app-header__badge">Vue 2</span>\
        </div>\
      </div>\
      <div class="editor-container" ref="container">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          @input="onScriptChange"\
          :style="{ width: editorWidth + \'%\' }"\
        ></mermaid-editor>\
        <div class="resize-handle"\
          :class="{ active: resizing }"\
          @mousedown="startResize"\
        ></div>\
        <div class="panel panel--preview">\
          <mermaid-toolbar\
            :direction="model.direction"\
            :edge-mode="edgeMode"\
            :selected-node="selectedNode"\
            :selected-edge="selectedEdge"\
            @add-node="addNode"\
            @toggle-edge-mode="toggleEdgeMode"\
            @delete-selected="onToolbarDeleteSelected"\
            @change-direction="changeDirection"\
            @fit-view="fitView"\
          ></mermaid-toolbar>\
          <mermaid-preview\
            ref="preview"\
            :model="model"\
            :edge-mode="edgeMode"\
            @add-edge="addEdge"\
            @delete-selected="deleteSelected"\
            @update-node-text="updateNodeText"\
            @update-node-shape="updateNodeShape"\
            @update-edge-text="updateEdgeText"\
            @node-selected="onNodeSelected"\
            @edge-selected="onEdgeSelected"\
            @cancel-edge-mode="cancelEdgeMode"\
          ></mermaid-preview>\
        </div>\
      </div>\
    </div>\
  '
});
