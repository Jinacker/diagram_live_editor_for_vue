/**
 * MermaidLiveEditor 컴포넌트
 * script ↔ model 양방향 동기화와 undo/redo, autosave를 담당하는 최상위 상태 컨테이너
 */

Vue.component('mermaid-live-editor', {
  data: function () {
    return {
      // script는 원본 소스, model은 GUI 편집용 정규화 상태다.
      script: 'flowchart TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Process A]\n    B -->|No| D[Process B]\n    C --> E[End]\n    D --> E',
      model:  { type: 'flowchart', direction: 'TD', nodes: [], edges: [] },
      error:  '',

      selectedNode: '',
      selectedEdge: null,
      syncSource:   null,
      nodeCounter:  0,

      resizing:    false,
      editorWidth: 38,

      // mounted에서 생성되는 HistoryManager 인스턴스
      history: null,

      // 토스트 메시지 상태
      toastMsg:     '',
      toastVisible: false,
      _toastTimer:  null,
      _saveTimer:   null
    };
  },

  computed: {
    canUndo: function () { return !!(this.history && this.history.canUndo()); },
    canRedo: function () { return !!(this.history && this.history.canRedo()); },
    isFlowchart: function () {
      return !!this.model && this.model.type !== 'sequenceDiagram';
    }
  },

  mounted: function () {
    this.history = new HistoryManager();

    // localStorage에서 마지막 작업 내용 복원
    var saved = StorageManager.load();
    if (saved && saved.script) {
      this.script = saved.script;
      if (typeof saved.editorWidth === 'number') {
        this.editorWidth = saved.editorWidth;
      }
    }

    this.parseScript();

    var self = this;
    this.$nextTick(function () {
      self.updateNodeCounter();
    });

    // script 변경 시 600ms debounce 후 자동 저장
    this.$watch('script', function () {
      clearTimeout(self._saveTimer);
      self._saveTimer = setTimeout(function () {
        StorageManager.save({
          script:      self.script,
          editorWidth: self.editorWidth
        });
      }, 600);
    });
  },

  methods: {

    // ── 스냅샷 헬퍼 ───────────────────────────────────────────────
    _snapshot: function () {
      if (this.history) this.history.snapshot(this.model);
    },

    // ── Script → Model ────────────────────────────────────────────
    onScriptChange: function (newScript) {
      // GUI 쪽에서 script를 다시 생성한 직후에는 역파싱 루프를 막는다.
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

    // ── Model → Script ────────────────────────────────────────────
    updateScriptFromModel: function () {
      // model 변경은 항상 script까지 다시 직렬화해서 양쪽 상태를 맞춘다.
      this.syncSource = 'gui';
      this.script     = MermaidGenerator.generate(this.model);
      this.error      = '';
    },

    updateNodeCounter: function () {
      if (!this.model || !this.model.nodes) return;
      var max = 0;
      for (var i = 0; i < this.model.nodes.length; i++) {
        var nm = this.model.nodes[i].id.match(/(\d+)$/);
        if (nm) {
          var n = parseInt(nm[1], 10);
          if (n > max) max = n;
        }
      }
      if (max > this.nodeCounter) this.nodeCounter = max;
    },

    // ── GUI 액션 ─────────────────────────────────────────────────

    addNode: function (shape) {
      if (!this.isFlowchart) return;
      this._snapshot();
      if (!shape) shape = 'rect';
      // 새 노드 id는 단순 증가 방식으로 발급한다.
      this.nodeCounter++;
      var newId   = 'N' + this.nodeCounter;
      var newNode = { id: newId, text: 'Node', shape: shape };
      var nodes   = this.model.nodes.slice();
      nodes.push(newNode);
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    addEdge: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var edges = this.model.edges.slice();
      edges.push({ from: data.from, to: data.to, text: '', type: '-->' });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    deleteSelected: function (data) {
      if (!data) return;
      this._snapshot();

      // node 삭제는 연결된 edge까지 같이 정리해야 모델이 깨지지 않는다.
      if (this.isFlowchart && data.nodeId) {
        var nodes = this.model.nodes.filter(function (n) { return n.id !== data.nodeId; });
        var edges = this.model.edges.filter(function (e) {
          return e.from !== data.nodeId && e.to !== data.nodeId;
        });
        this.model = Object.assign({}, this.model, { nodes: nodes, edges: edges });
      } else if (this.isFlowchart && data.edgeIndex !== null && data.edgeIndex !== undefined) {
        var ec = this.model.edges.slice();
        ec.splice(data.edgeIndex, 1);
        this.model = Object.assign({}, this.model, { edges: ec });
      } else {
        return;
      }

      this.selectedNode = '';
      this.selectedEdge = null;
      this.updateScriptFromModel();
    },

    updateNodeText: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodes = this.model.nodes.map(function (n) {
        return n.id === data.nodeId ? Object.assign({}, n, { text: data.text }) : n;
      });
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    updateNodeShape: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodes = this.model.nodes.map(function (n) {
        return n.id === data.nodeId ? Object.assign({}, n, { shape: data.shape }) : n;
      });
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    updateEdgeText: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var edges = this.model.edges.map(function (e, idx) {
        return idx === data.index ? Object.assign({}, e, { text: data.text }) : e;
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    changeDirection: function (dir) {
      if (!this.isFlowchart) return;
      this._snapshot();
      this.model = Object.assign({}, this.model, { direction: dir });
      this.updateScriptFromModel();
    },

    // ── Undo / Redo ──────────────────────────────────────────────

    undo: function () {
      if (!this.history) return;
      var prev = this.history.undo(this.model);
      if (!prev) return;
      this.model      = prev;
      this.syncSource = 'gui';
      this.script     = MermaidGenerator.generate(this.model);
    },

    redo: function () {
      if (!this.history) return;
      var next = this.history.redo(this.model);
      if (!next) return;
      this.model      = next;
      this.syncSource = 'gui';
      this.script     = MermaidGenerator.generate(this.model);
    },

    // ── 선택 상태 추적 ──────────────────────────────────────────

    onNodeSelected: function (nodeId) {
      this.selectedNode = nodeId;
      this.selectedEdge = null;
    },

    onEdgeSelected: function (edgeIdx) {
      this.selectedEdge = this.model.edges[edgeIdx] || null;
      this.selectedNode = '';
    },

    // ── 툴바 액션 연결 ───────────────────────────────────────────

    fitView: function () {
      if (this.$refs.preview) this.$refs.preview.fitView();
    },

    zoomIn: function () {
      if (this.$refs.preview) this.$refs.preview.zoomIn();
    },

    zoomOut: function () {
      if (this.$refs.preview) this.$refs.preview.zoomOut();
    },

    copySvg: function () {
      var preview = this.$refs.preview;
      if (!preview) return;
      var canvas = preview.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var self = this;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(svgStr).then(function () {
          self.showToast('SVG copied to clipboard!', 'success');
        }).catch(function () {
          self._fallbackCopy(svgStr);
        });
      } else {
        this._fallbackCopy(svgStr);
      }
    },

    _fallbackCopy: function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        this.showToast('SVG copied!', 'success');
      } catch (e) {
        this.showToast('Copy failed — try Ctrl+C', 'error');
      }
      document.body.removeChild(ta);
    },

    showToast: function (msg, type) {
      var self = this;
      this.toastMsg     = msg;
      this.toastVisible = true;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () {
        self.toastVisible = false;
      }, 2800);
    },

    // ── 리사이즈 핸들 ───────────────────────────────────────────

    startResize: function (e) {
      e.preventDefault();
      this.resizing = true;
      var self      = this;
      var container = this.$refs.container;

      var onMove = function (me) {
        if (!self.resizing) return;
        var rect = container.getBoundingClientRect();
        var pct  = ((me.clientX - rect.left) / rect.width) * 100;
        pct = Math.max(20, Math.min(70, pct));
        self.editorWidth = pct;
      };

      var onUp = function () {
        self.resizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        StorageManager.save({ script: self.script, editorWidth: self.editorWidth });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
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
          :diagram-type="model.type"\
          @input="onScriptChange"\
          :style="{ width: editorWidth + \'%\' }"\
        ></mermaid-editor>\
        <div\
          class="resize-handle"\
          :class="{ active: resizing }"\
          @mousedown="startResize"\
        ></div>\
        <div class="panel panel--preview">\
          <!-- 상단 toolbar는 preview 네비게이션과 편집 액션을 묶는다. -->\
          <mermaid-toolbar\
            :diagram-type="model.type"\
            :direction="model.direction"\
            :can-undo="canUndo"\
            :can-redo="canRedo"\
            @add-node="addNode"\
            @undo="undo"\
            @redo="redo"\
            @change-direction="changeDirection"\
            @zoom-in="zoomIn"\
            @zoom-out="zoomOut"\
            @fit-view="fitView"\
            @copy-svg="copySvg"\
          ></mermaid-toolbar>\
          <mermaid-preview\
            ref="preview"\
            :model="model"\
            @add-node="addNode"\
            @add-edge="addEdge"\
            @delete-selected="deleteSelected"\
            @update-node-text="updateNodeText"\
            @update-node-shape="updateNodeShape"\
            @update-edge-text="updateEdgeText"\
            @node-selected="onNodeSelected"\
            @edge-selected="onEdgeSelected"\
            @undo="undo"\
            @redo="redo"\
          ></mermaid-preview>\
        </div>\
      </div>\
      <div\
        class="toast"\
        :class="[toastVisible ? \'toast--visible\' : \'\', toastMsg.includes(\'fail\') || toastMsg.includes(\'error\') ? \'toast--error\' : \'toast--success\']"\
      >{{ toastMsg }}</div>\
    </div>\
  '
});
