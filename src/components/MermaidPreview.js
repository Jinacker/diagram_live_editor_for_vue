/**
 * MermaidPreview 컴포넌트
 * - SvgPositionTracker : 좌표 수집
 * - PortDragHandler    : 4방향 포트 drag-to-connect
 * - SvgNodeHandler     : 노드 클릭 / 더블클릭 / 우클릭 / hover
 * - SvgEdgeHandler     : 엣지 클릭 / 라벨 / 편집
 */

var FlowEdgeCodec = window.FlowEdgeCodec;

Vue.component('mermaid-preview', {
  mixins: [
    previewInlineEditMixin,
    previewToolbarMixin,
    previewViewportMixin,
    previewSubgraphMixin
  ],

  props: {
    model: {
      type: Object,
      default: function () {
        return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
      }
    }
  },

  // 템플릿에서 사용하는 전체 shape 목록
  SHAPES: SvgNodeHandler.SHAPES,
  LINE_TYPE_OPTIONS: window.SequenceMessageCodec ? window.SequenceMessageCodec.LINE_TYPE_OPTIONS : [],
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'indigo', value: '#4f46e5' },
    { key: 'violet', value: '#a855f7' }
  ],
  FLOW_EDGE_BODY_OPTIONS: FlowEdgeCodec ? FlowEdgeCodec.BODY_OPTIONS : [],
  FLOW_EDGE_HEAD_OPTIONS: FlowEdgeCodec ? FlowEdgeCodec.HEAD_OPTIONS : [],

  data: function () {
    return {
      svgContent:  '',
      renderError: '',
      renderCounter: 0,
      renderToken: 0,

      selectedNodeId:    null,
      selectedEdgeIndex: null,
      selectedSequenceParticipantId: null,
      selectedSequenceMessageIndex: null,
      selectedSequenceMessageIndices: [],
      selectedNoteStatementIndices: [],
      selectedSequenceBlockId: null,
      selectedSequenceNoteStatementIndex: null,

      // 노드 인라인 편집
      editingNodeId:  null,
      editingText:    '',
      editingNodeColor: '#e2e8f0',
      editInputStyle: {},

      // 엣지 인라인 편집
      editingEdgeIndex:    null,
      editingEdgeText:     '',
      editingEdgeColor:    '#5c7ab0',
      edgeEditInputStyle:  {},

      // 시퀀스 인라인 편집
      editingSequenceParticipantId: null,
      editingSequenceParticipantText: '',
      sequenceParticipantEditStyle: {},
      editingSequenceMessageIndex: null,
      editingSequenceMessageText: '',
      sequenceMessageEditStyle: {},
      editingSequenceBlockId: null,
      editingSequenceBranchStatementIndex: null,
      editingSequenceBlockText: '',
      sequenceBlockEditStyle: {},
      editingSequenceNoteStatementIndex: null,
      editingSequenceNoteText: '',
      sequenceNoteEditStyle: {},

      // 컨텍스트 UI 상태
      contextMenu:  null,   // { nodeId, x, y }
      edgeToolbar:  null,   // { edgeIndex, x, y } - 플로우차트 엣지 액션 바
      flowEdgeColorPicker: false,
      flowEdgeBodyPicker: false,
      flowEdgeHeadPicker: false,
      sequenceToolbar: null, // { type, id|index, x, y }
      lineTypePicker: false,      // sequence message line type 선택 모드

      // 포트 드래그 상태
      portDragging:  false,
      hoveredNodeId: null,

      // 힌트 오버레이 (미지원 문법 / 작업 불가 안내)
      hintMsg: '',
      hintVisible: false,
      _hintTimer: null,

      // flowchart 다중선택 (우클릭 드래그 rubber-band)
      _rubberBand: null,          // { startX, startY, curX, curY } (canvas 기준 px)
      rubberBandRect: null,       // { left, top, width, height } — template용
      selectedNodeIds: [],
      subgraphToolbar: null,      // { x, y } — "Wrap in Subgraph" 버튼 위치
      subgraphTitleInput: '',

      // subgraph 타이틀 컨텍스트 툴바 & 인라인 편집
      subgraphTitleToolbar: null,   // { sgId, x, y }
      editingSubgraphId: null,
      editingSubgraphText: '',
      editingSubgraphStyle: {},

      // CSS transform 줌/패닝 상태
      cfgZoom: 1.0,
      panX: 0,
      panY: 0,

      // SVG 내부 좌표/뷰포트 상태
      _positions: {},
      _elements:  {},
      _edgePaths: [],
      _svgEl: null,
      _fitAfterRender: false,
      _panState: null,
      _panMouseUpHandler: null
    };
  },

  watch: {
    model: {
      handler: function () { this.renderDiagram(); },
      deep: true
    },
    selectedEdgeIndex: function () {
      this._syncSelectedEdgeVisuals();
    },
    sequenceToolbar: function (val) {
      if (!val) this.lineTypePicker = false;
    },
  },

  mounted: function () {
    this.renderDiagram();
    var self = this;

    this._windowResizeHandler = function () {
      if (!self._svgEl) return;
      if (self._resizeFrame) cancelAnimationFrame(self._resizeFrame);
      self._resizeFrame = requestAnimationFrame(function () {
        self.fitView();
      });
    };
    window.addEventListener('resize', this._windowResizeHandler);

    // 전역 클릭 시 컨텍스트 메뉴와 엣지 툴바 닫기
    this._clickCloseHandler = function () {
      var hadEdgeToolbar = !!self.edgeToolbar;
      self.contextMenu = null;
      self.edgeToolbar = null;
      self.subgraphTitleToolbar = null;
      self.flowEdgeColorPicker = false;
      self.flowEdgeBodyPicker = false;
      self.flowEdgeHeadPicker = false;
      self.sequenceToolbar = null;
      self.selectedSequenceMessageIndices = [];
      self.selectedNoteStatementIndices = [];
      self.selectedSequenceBlockId = null;
      if (hadEdgeToolbar && self.editingEdgeIndex === null) {
        self.selectedEdgeIndex = null;
        self._clearEdgeVisualState();
      }
    };
    document.addEventListener('click', this._clickCloseHandler);

    this._pointerDownCommitHandler = function (e) {
      var target = e.target;
      if (target && target.closest && target.closest('.node-edit-overlay')) return;
      self._confirmActiveEdits();
    };
    document.addEventListener('mousedown', this._pointerDownCommitHandler, true);

    this._suppressClickAfterPanHandler = function (e) {
      if (!self._suppressClickAfterPan) return;
      self._suppressClickAfterPan = false;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', this._suppressClickAfterPanHandler, true);

    // 전역 키 입력: Delete, Escape, Ctrl+Z/Y
    this._keydownHandler = function (e) {
      // input / textarea 사용 중에는 전역 단축키를 막는다.
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId !== null || self.editingEdgeIndex !== null ||
            self.editingSequenceParticipantId !== null || self.editingSequenceMessageIndex !== null ||
            self.editingSequenceBlockId !== null || self.editingSequenceBranchStatementIndex !== null ||
            self.editingSequenceNoteStatementIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId:    self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        } else if (self.selectedSequenceParticipantId || self.selectedSequenceMessageIndex !== null || self.selectedSequenceBlockId) {
          self.$emit('delete-selected', {
            sequenceParticipantId: self.selectedSequenceParticipantId,
            sequenceMessageIndex: self.selectedSequenceMessageIndex,
            sequenceBlockId: self.selectedSequenceBlockId
          });
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
          self.selectedSequenceMessageIndices = [];
          self.selectedSequenceBlockId = null;
        } else if (self.selectedSequenceNoteStatementIndex !== null) {
          self.$emit('delete-selected', { sequenceNoteStatementIndex: self.selectedSequenceNoteStatementIndex });
          self.selectedSequenceNoteStatementIndex = null;
        }
      }

      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.cancelSequenceParticipantEdit();
        self.cancelSequenceMessageEdit();
        self.cancelSequenceBlockEdit();
        self.cancelSequenceNoteEdit();
        self.selectedSequenceNoteStatementIndex = null;
        self.selectedNodeId    = null;
        self.selectedEdgeIndex = null;
        self.selectedSequenceParticipantId = null;
        self.selectedSequenceMessageIndex = null;
        self.selectedSequenceMessageIndices = [];
        self.selectedSequenceBlockId = null;
        self.contextMenu       = null;
        self.edgeToolbar       = null;
        self.flowEdgeColorPicker = false;
        self.flowEdgeBodyPicker = false;
        self.flowEdgeHeadPicker = false;
        self.sequenceToolbar   = null;
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
    };
    document.addEventListener('keydown', this._keydownHandler);
  },

  beforeDestroy: function () {
    if (this._clickCloseHandler) {
      document.removeEventListener('click', this._clickCloseHandler);
      this._clickCloseHandler = null;
    }
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._pointerDownCommitHandler) {
      document.removeEventListener('mousedown', this._pointerDownCommitHandler, true);
      this._pointerDownCommitHandler = null;
    }
    if (this._suppressClickAfterPanHandler) {
      document.removeEventListener('click', this._suppressClickAfterPanHandler, true);
      this._suppressClickAfterPanHandler = null;
    }
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._resizeFrame) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = null;
    }
    if (this._panMouseUpHandler) {
      document.removeEventListener('mouseup', this._panMouseUpHandler);
      this._panMouseUpHandler = null;
    }
    if (this._visibilityObserver) {
      this._visibilityObserver.disconnect();
      this._visibilityObserver = null;
    }
  },

  methods: {


    // 공통 렌더 유틸

    _hasRenderableContent: function (model) {
      if (!model) return false;
      if (model.type === 'sequenceDiagram') {
        return !!((model.participants && model.participants.length) || (model.messages && model.messages.length));
      }
      return !!((model.nodes && model.nodes.length) || (model.edges && model.edges.length));
    },

    _isScriptHeaderOnly: function (script) {
      var trimmed = (script || '').trim();
      return /^flowchart\s+(TD|TB|BT|LR|RL)\s*$/i.test(trimmed) ||
        /^sequenceDiagram\s*$/i.test(trimmed);
    },

    renderDiagram: function () {
      var m = this.model;
      if (!this._hasRenderableContent(m)) {
        this.svgContent  = '';
        this.renderError = '';
        return;
      }

      var script = MermaidGenerator.generate(m);
      if (!script || this._isScriptHeaderOnly(script)) {
        this.svgContent = '';
        this._svgEl = null;
        this.cfgZoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        return;
      }

      var self = this;
      self.renderCounter++;
      self.renderToken++;
      var renderToken = self.renderToken;
      var containerId = 'mermaid-render-' + self.renderCounter;
      self.renderError = '';
      self.svgContent = '';

      var startRender = function () {
        if (renderToken !== self.renderToken) return;

        try {
          window.mermaid.render(containerId, script).then(function (result) {
            // 가장 최신 render 요청만 반영하고 이전 결과는 버린다.
            if (renderToken !== self.renderToken) return;
            self.svgContent  = result.svg;
            self.renderError = '';
            self.$emit('svg-rendered', result.svg);
            self.$nextTick(function () { self.postRenderSetup(); });
          }).catch(function (err) {
            if (renderToken !== self.renderToken) return;
            self.svgContent = '';
            self.renderError = err.message || 'Render error';
            var errEl = document.getElementById('d' + containerId);
            if (errEl) errEl.remove();
          });
        } catch (e) {
          if (renderToken !== self.renderToken) return;
          self.svgContent = '';
          self.renderError = e.message || 'Render error';
        }
      };

      if (typeof Promise === 'undefined') {
        startRender();
        return;
      }

      var fontReady = null;
      if (typeof document !== 'undefined' && document.fonts) {
        if (document.fonts.status === 'loaded') {
          startRender();
          return;
        }
        if (document.fonts.ready && typeof document.fonts.ready.then === 'function') {
          fontReady = Promise.race([
            document.fonts.ready.then(function () {}, function () {}),
            new Promise(function (resolve) { setTimeout(resolve, 1200); })
          ]);
        }
      }

      if (!fontReady) {
        startRender();
        return;
      }

      fontReady.then(function () {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(startRender);
        } else {
          startRender();
        }
      }, startRender);
    },

    // 공통 렌더 후 인터랙션 연결 유틸

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      var fitAfter = this._fitAfterRender;
      this._fitAfterRender = false;

      // overlay와 interaction이 같은 좌표계를 쓰도록 viewBox를 먼저 맞춘다.
      this._setupViewport(svgEl, canvas, fitAfter);

      // 노드 위치와 SVG 요소 수집
      var isFlowchart = this.model && this.model.type !== 'sequenceDiagram';

      if (isFlowchart) {
        var collected    = SvgPositionTracker.collectNodePositions(svgEl);
        this._positions  = collected.positions;
        this._elements   = collected.elements;
        this._edgePaths  = SvgPositionTracker.collectEdgePaths(svgEl, this.model.edges);

        // display:none 컨테이너 안에서 렌더되면 getBBox()가 0을 반환해
        // 모든 노드의 width가 0이 된다. 이 경우 visible 전환 시 자동 재렌더.
        if (this._allPositionsZero(collected.positions)) {
          this._scheduleRerenderWhenVisible();
        }

        // 하위 핸들러에 넘길 bridge 객체 구성
        var ctx = this._buildCtx(svgEl);

        // 엣지 ghost overlay를 먼저 구성
        SvgEdgeHandler.initGhostOverlay(svgEl);
        SvgEdgeHandler.attach(svgEl, this._edgePaths, this._positions, ctx);

        // 포트 overlay는 ghost보다 위에 올라온다.
        PortDragHandler.initOverlay(svgEl);

        // 노드 인터랙션 연결
        SvgNodeHandler.attach(svgEl, this._positions, this._elements, ctx);

        // flowchart 우클릭 드래그 rubber-band 다중선택
        this._attachFlowchartRubberBand(canvas, svgEl);

        // subgraph 타이틀 클릭 인라인 편집
        this._attachSubgraphInteractions(svgEl);

        if (this._pendingContextMenuNodeId) {
          this._openContextMenuForNode(this._pendingContextMenuNodeId);
        }
      } else {
        this._positions = {};
        this._elements = {};
        this._edgePaths = [];

        // display:none 컨테이너에서 렌더되면 participant getBBox()가 0을 반환해
        // 히트존이 (0,0)에 부착된다. flowchart와 동일하게 visible 전환 시 재렌더.
        var sampleActor = svgEl.querySelector('.actor, .actor-top, g[class*="actor"]');
        if (sampleActor && sampleActor.getBBox) {
          try {
            var sampleBox = sampleActor.getBBox();
            if (!sampleBox.width && !sampleBox.height) {
              this._scheduleRerenderWhenVisible();
              return;
            }
          } catch (e) {
            this._scheduleRerenderWhenVisible();
            return;
          }
        }

        var sequenceCtx = this._buildCtx(svgEl);
        SequenceSvgHandler.attach(svgEl, this.model, sequenceCtx);
        SequenceBlockHandler.initOverlay(svgEl);
        SequenceBlockHandler.attach(svgEl, this.model, sequenceCtx, canvas);

        if (this._pendingHighlightParticipantId) {
          var pendingPid = this._pendingHighlightParticipantId;
          this._pendingHighlightParticipantId = null;
          this._flashParticipant(svgEl, pendingPid);
        }
      }

      // 배경 클릭 시 선택 해제
      var self = this;
      svgEl.addEventListener('click', function (e) {
        if (e.target === svgEl ||
            (e.target.tagName && e.target.tagName.toLowerCase() === 'svg')) {
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
          self.selectedSequenceMessageIndices = [];
          self.selectedSequenceBlockId = null;
        }
      });

      this._refreshFloatingUiPositions();
      this._syncSelectedEdgeVisuals();

      if (this._pendingHighlightNodeId) {
        var pendingId = this._pendingHighlightNodeId;
        this._pendingHighlightNodeId = null;
        this._flashNode(pendingId);
      }

    },


    openContextMenuForNode: function (nodeId) {
      this._pendingContextMenuNodeId = nodeId;
      this._openContextMenuForNode(nodeId);
    },

    _openContextMenuForNode: function (nodeId) {
      var nodeEl = this._elements && this._elements[nodeId];
      if (!nodeEl) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : this.$el.getBoundingClientRect();
      this.selectedNodeId = nodeId;
      this.selectedEdgeIndex = null;
      this.contextMenu = {
        nodeId: nodeId,
        anchorType: 'node',
        x: Math.round(rect.left - previewRect.left + rect.width / 2),
        y: Math.round(rect.top - previewRect.top + Math.max(18, rect.height * 0.35))
      };
      this._pendingContextMenuNodeId = null;
    },

    _refreshFloatingUiPositions: function () {
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : (this.$el && this.$el.getBoundingClientRect ? this.$el.getBoundingClientRect() : null);
      if (this.contextMenu && this.contextMenu.anchorType === 'node') {
        var nodeEl = this._elements && this._elements[this.contextMenu.nodeId];
        if (nodeEl && previewRect) {
          var nodeRect = nodeEl.getBoundingClientRect();
          this.contextMenu = Object.assign({}, this.contextMenu, {
            x: Math.round(nodeRect.left - previewRect.left + nodeRect.width + 10),
            y: Math.round(nodeRect.top - previewRect.top + Math.min(24, nodeRect.height * 0.5))
          });
        }
      }

      if (this.edgeToolbar && this.edgeToolbar.anchorType === 'edge') {
        return;
      }
    },

    _syncSelectedEdgeVisuals: function () {
      var selectedIndex = this.selectedEdgeIndex;
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var isSelected = edgeData.index === selectedIndex;
        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.toggle('edge-selected', isSelected);
          edgeEl.classList.toggle('edge-hovered', isSelected);
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.toggle('edge-selected', isSelected);
          pathEl.classList.toggle('edge-hovered', isSelected);
          if (isSelected) {
            pathEl.style.setProperty('filter', 'drop-shadow(0 0 8px rgba(21, 101, 192, 0.28))', 'important');
          } else {
            pathEl.style.removeProperty('filter');
          }
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.toggle('edge-selected', isSelected);
          innerPaths[j].classList.toggle('edge-hovered', isSelected);
        }

        if (hitEl && hitEl.setAttribute) {
          if (hitEl.classList) {
            hitEl.classList.toggle('edge-hit-selected', isSelected);
          }
          hitEl.setAttribute('stroke', isSelected ? '#2563eb' : '#000');
          hitEl.setAttribute('stroke-opacity', isSelected ? '0.18' : '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },

    _clearEdgeVisualState: function () {
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.remove('edge-selected');
          edgeEl.classList.remove('edge-hovered');
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.remove('edge-selected');
          pathEl.classList.remove('edge-hovered');
          pathEl.style.removeProperty('filter');
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.remove('edge-selected');
          innerPaths[j].classList.remove('edge-hovered');
          innerPaths[j].style.removeProperty('filter');
        }

        if (hitEl && hitEl.classList) {
          hitEl.classList.remove('edge-hit-selected');
        }
        if (hitEl && hitEl.setAttribute) {
          hitEl.setAttribute('stroke', '#000');
          hitEl.setAttribute('stroke-opacity', '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },










    _buildCtx: function (svgEl) {
      return PreviewCtxBuilder.build(this, svgEl);
    },

    // 공통 노드 편집 유틸










    // 공통 엣지 편집 유틸





    // 공통 시퀀스 편집 유틸













    // 공통 노드 컨텍스트 메뉴 액션 유틸

    contextEditNode: function () {
      if (!this.contextMenu) return;
      var nodeId = this.contextMenu.nodeId;
      var nodeEl = this._elements[nodeId];
      this.contextMenu = null;
      if (!nodeEl) return;
      var canvas = this.$refs.canvas;
      var canvasRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var labelEl = nodeEl.querySelector('foreignObject, .label, text');
      var targetRect = labelEl && labelEl.getBoundingClientRect ? labelEl.getBoundingClientRect() : nodeEl.getBoundingClientRect();
      var node = null;
      var nodes = this.model.nodes || [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === nodeId) {
          node = nodes[i];
          break;
        }
      }
      var isStatic = this.isStaticDiagram();
      var editText = SvgNodeHandler.toEditableText(this.model, node ? (node.text || node.id) : '');
      var width = 240;
      var left = canvasRect ? (targetRect.left - canvasRect.left + (targetRect.width / 2) - (width / 2)) : 0;
      var top = canvasRect ? (targetRect.top - canvasRect.top + (targetRect.height / 2) - 18) : 0;
      this.editingNodeId = nodeId;
      this.editingText = editText;
      this.editingNodeColor = node && node.fill ? node.fill : '#e2e8f0';
      this.editInputStyle = isStatic
        ? SvgNodeHandler.buildStaticEditStyle(targetRect, canvasRect, editText)
        : {
          position: 'absolute',
          left: Math.max(8, left) + 'px',
          top: Math.max(8, top) + 'px',
          zIndex: 1000,
          width: width + 'px'
        };
      this.$nextTick(this._buildCtxLite().focusEditInput);
    },

    contextDeleteNode: function () {
      if (!this.contextMenu) return;
      this.$emit('delete-selected', { nodeId: this.contextMenu.nodeId, edgeIndex: null });
      this.contextMenu   = null;
      this.selectedNodeId = null;
    },

    contextChangeShape: function (shape) {
      if (!this.contextMenu) return;
      this.$emit('update-node-shape', {
        nodeId: this.contextMenu.nodeId,
        shape:  shape
      });
    },

    contextChangeNodeColor: function (fill) {
      if (!this.contextMenu) return;
      this.$emit('update-node-fill', {
        nodeId: this.contextMenu.nodeId,
        fill: fill || ''
      });
      this.contextMenu = null;
    },

    extractNodeId: function (nodeEl) {
      if (!nodeEl) return null;
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;
      var id = nodeEl.getAttribute('id');
      if (!id) return null;

      // Extract the actual base ID.
      // Mermaid v11 generates IDs like: mermaid-render-4_flowchart-Start-1
      // 1. Remove the instance prefix (anything before 'flowchart-')
      var flowchartIdx = id.indexOf('flowchart-');
      var baseId = flowchartIdx !== -1 ? id.substring(flowchartIdx) : id;

      // 2. Remove the standard 'flowchart-' prefix
      baseId = baseId.replace(/^flowchart-/, '');

      // 3. Remove the suffix counter (e.g. '-1', '-24')
      baseId = baseId.replace(/-\d+$/, '');

      return baseId;
    },
















    // 공통 엣지 툴바 액션 유틸




    // 공통 시퀀스 툴바 액션 유틸















    // postRenderSetup 바깥에서도 재사용하는 경량 ctx
    _buildCtxLite: function () {
      return PreviewCtxBuilder.buildLite(this);
    },




    highlightNewNode: function (nodeId) {
      this._pendingHighlightNodeId = nodeId;
    },

    _flashNode: function (nodeId) {
      var el = this._elements && this._elements[nodeId];
      if (!el) return;
      el.classList.remove('node-new-flash');
      void el.offsetWidth;
      el.classList.add('node-new-flash');
      setTimeout(function () { el.classList.remove('node-new-flash'); }, 3000);
    },

    highlightNewParticipant: function (participantId) {
      this._pendingHighlightParticipantId = participantId;
    },

    _flashParticipant: function (svgEl, participantId) {
      var targets = SequencePositionTracker.collectParticipantTargets(svgEl, this.model);
      var el = null;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].id === participantId) { el = targets[i].el; break; }
      }
      if (!el) return;
      el.classList.remove('node-new-flash');
      void el.offsetWidth;
      el.classList.add('node-new-flash');
      setTimeout(function () { el.classList.remove('node-new-flash'); }, 3000);
    },

    _showHint: function (msg) {
      var self = this;
      this.hintMsg     = msg || '';
      this.hintVisible = true;
      clearTimeout(this._hintTimer);
      this._hintTimer = setTimeout(function () { self.hintVisible = false; }, 1500);
    },

    showUnsupportedHint: function () {
      this._showHint('Unsupported element cannot be edited');
    },










  },

  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null; selectedSequenceParticipantId = null; selectedSequenceMessageIndex = null; selectedSequenceMessageIndices = []; selectedSequenceBlockId = null;">\
        <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
          {{ model.type === &quot;sequence&quot; ? &quot;Release on target participant to insert message&quot; : &quot;Release on target node to connect&quot; }}\
        </div>\
        <div v-if="hintVisible" class="edge-mode-overlay" style="background: #f59e0b;">\
          {{ hintMsg }}\
        </div>\
      <div v-if="svgContent" :key="renderCounter" ref="canvas" class="preview-area__canvas">\
        <div class="preview-area__svg-host" v-html="svgContent"></div>\
        <div v-if="editingSubgraphId" class="node-edit-overlay" :style="editingSubgraphStyle">\
          <input ref="editSubgraphInput" class="node-edit-input" v-model="editingSubgraphText" @keydown="_onSubgraphEditKeyDown" @blur="confirmSubgraphEdit" />\
        </div>\
        <div v-if="rubberBandRect" class="flowchart-rubber-band" :style="{ left: rubberBandRect.left + \'px\', top: rubberBandRect.top + \'px\', width: rubberBandRect.width + \'px\', height: rubberBandRect.height + \'px\' }"></div>\
        <div v-if="subgraphToolbar" class="subgraph-toolbar" :style="{ left: subgraphToolbar.x + \'px\', top: subgraphToolbar.y + \'px\' }">\
          <span class="subgraph-toolbar__label">{{ selectedNodeIds.length }} nodes selected</span>\
          <button class="subgraph-toolbar__btn subgraph-toolbar__btn--confirm" @mousedown.prevent="confirmWrapSubgraph">Wrap in Subgraph</button>\
          <button class="subgraph-toolbar__btn subgraph-toolbar__btn--cancel" @mousedown.prevent="cancelSubgraphToolbar">✕</button>\
        </div>\
        <div v-if="subgraphTitleToolbar" class="title-context-toolbar" :style="{ left: subgraphTitleToolbar.x + \'px\', top: subgraphTitleToolbar.y + \'px\' }" @click.stop @mousedown.stop>\
          <button class="title-context-toolbar__btn" @mousedown.prevent="subgraphTitleEdit">Edit ✎</button>\
          <button class="title-context-toolbar__btn title-context-toolbar__btn--danger" @mousedown.prevent="subgraphTitleDelete">Delete</button>\
        </div>\
        <div v-if="editingNodeId" class="node-edit-overlay" :style="editInputStyle">\
          <textarea v-if="isStaticNodeEditing()" ref="editInput" class="node-edit-input node-edit-textarea node-edit-textarea--static" v-model="editingText" @keydown="onStaticNodeEditKeyDown" @blur="confirmNodeEdit"></textarea>\
          <input v-else ref="editInput" class="node-edit-input" v-model="editingText" @keydown="onNodeEditKeyDown" @blur="confirmNodeEdit" />\
        </div>\
        <div v-if="editingEdgeIndex !== null" class="node-edit-overlay" :style="edgeEditInputStyle">\
          <textarea v-if="isGraphEdgeEditing()" ref="editEdgeInput" class="node-edit-input node-edit-textarea edge-edit-textarea--graph" v-model="editingEdgeText" placeholder="Edge label" @keydown="onGraphEdgeEditKeyDown" @blur="confirmEdgeEdit"></textarea>\
          <input v-else ref="editEdgeInput" class="node-edit-input" v-model="editingEdgeText" placeholder="Edge label" @keydown="onEdgeEditKeyDown" @blur="confirmEdgeEdit" />\
        </div>\
        <div v-if="editingSequenceParticipantId" class="node-edit-overlay" :style="sequenceParticipantEditStyle">\
          <input ref="sequenceParticipantInput" class="node-edit-input" v-model="editingSequenceParticipantText" @keydown="onSequenceParticipantEditKeyDown" @blur="confirmSequenceParticipantEdit" />\
        </div>\
        <div v-if="editingSequenceMessageIndex !== null" class="node-edit-overlay" :style="sequenceMessageEditStyle">\
          <input ref="sequenceMessageInput" class="node-edit-input" v-model="editingSequenceMessageText" placeholder="Message text" @keydown="onSequenceMessageEditKeyDown" @blur="confirmSequenceMessageEdit" />\
        </div>\
        <div v-if="editingSequenceBlockId !== null || editingSequenceBranchStatementIndex !== null" class="node-edit-overlay" :style="sequenceBlockEditStyle">\
          <input ref="sequenceBlockInput" class="node-edit-input" v-model="editingSequenceBlockText" placeholder="Block text" @keydown="onSequenceBlockEditKeyDown" @blur="confirmSequenceBlockEdit" />\
        </div>\
        <div v-if="editingSequenceNoteStatementIndex !== null" class="node-edit-overlay" :style="sequenceNoteEditStyle">\
          <input ref="sequenceNoteInput" class="node-edit-input" v-model="editingSequenceNoteText" placeholder="Note text" @keydown="onSequenceNoteEditKeyDown" @blur="confirmSequenceNoteEdit" />\
        </div>\
        <div v-if="contextMenu" class="context-menu" :style="{ left: contextMenu.x + &quot;px&quot;, top: contextMenu.y + &quot;px&quot; }" @click.stop>\
          <div class="context-menu__section-title">Change Shape</div>\
          <div class="context-menu__shapes-grid">\
            <button v-for="s in $options.SHAPES" :key="s.key" class="context-menu__shape-btn" :title="s.name" @click="contextChangeShape(s.key)">\
              <span class="context-menu__shape-icon" :class="&quot;context-menu__shape-icon--&quot; + s.key"></span>\
              <span class="context-menu__shape-text">{{ s.name }}</span>\
            </button>\
          </div>\
          <div class="context-menu__section-title">Color</div>\
          <div class="context-menu__color-row">\
            <button class="context-menu__color-btn context-menu__color-btn--clear" aria-label="Clear color" @click="contextChangeNodeColor(&quot;&quot;)"></button>\
            <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :style="{ backgroundColor: color.value }" :title="color.key" @click="contextChangeNodeColor(color.value)"></button>\
          </div>\
          <div class="context-menu__separator"></div>\
          <div class="context-menu__item" @click="contextEditNode"><span class="context-menu__item-icon">T</span> Edit Text</div>\
          <div class="context-menu__item context-menu__item--danger" @click="contextDeleteNode"><span class="context-menu__item-icon">X</span> Delete Node</div>\
        </div>\
        <div v-if="edgeToolbar" class="edge-toolbar" :style="{ left: edgeToolbar.x + &quot;px&quot;, top: edgeToolbar.y + &quot;px&quot; }" @click.stop>\
          <button class="edge-toolbar__btn" @click="edgeToolbarEdit" title="Edit label">Label ✎</button>\
          <div class="edge-toolbar__sep"></div>\
          <div class="edge-toolbar__type-group edge-toolbar__type-group--color">\
            <button class="edge-toolbar__type-trigger edge-toolbar__type-trigger--color" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeColorPicker }" @click="toggleFlowEdgeColorPicker" title="Line color">\
              <span class="edge-toolbar__color-swatch" :class="{ \'edge-toolbar__color-swatch--empty\': !getFlowEdgeColorValue() }" :style="getFlowEdgeColorValue() ? { backgroundColor: getFlowEdgeColorValue() } : {}"></span>\
              <span class="edge-toolbar__type-caret">⌄</span>\
            </button>\
            <div v-if="flowEdgeColorPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--color">\
              <button class="context-menu__color-btn context-menu__color-btn--clear" aria-label="Clear color" @click="edgeToolbarChangeColor(&quot;&quot;)"></button>\
              <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :class="{ \'context-menu__color-btn--selected\': getFlowEdgeColorValue() === color.value }" :style="{ backgroundColor: color.value }" :title="color.key" @click="edgeToolbarChangeColor(color.value)"></button>\
            </div>\
          </div>\
          <div class="edge-toolbar__sep"></div>\
          <div class="edge-toolbar__type-row">\
            <div class="edge-toolbar__type-group">\
              <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeBodyPicker }" @click="toggleFlowEdgeBodyPicker" title="Line body">\
                <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--body">{{ getFlowEdgeBodyLabel() }}</span>\
                <span class="edge-toolbar__type-caret">⌄</span>\
              </button>\
              <div v-if="flowEdgeBodyPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--body">\
                <button\
                  v-for="opt in $options.FLOW_EDGE_BODY_OPTIONS"\
                  :key="opt.key"\
                  class="edge-toolbar__type-option"\
                  :class="{ \'edge-toolbar__type-option--selected\': getFlowEdgeParts(getFlowEdgeType()).body === opt.key }"\
                  @click="edgeToolbarSelectLineBody(opt.key)"\
                >{{ opt.label }}</button>\
              </div>\
            </div>\
            <div class="edge-toolbar__type-group">\
              <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeHeadPicker }" @click="toggleFlowEdgeHeadPicker" title="Arrow head">\
                <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--head">{{ getFlowEdgeHeadLabel() }}</span>\
                <span class="edge-toolbar__type-caret">⌄</span>\
              </button>\
              <div v-if="flowEdgeHeadPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--head">\
                <button\
                  v-for="opt in getAvailableFlowEdgeHeadOptions()"\
                  :key="opt.key"\
                  class="edge-toolbar__type-option"\
                  :class="{ \'edge-toolbar__type-option--selected\': getFlowEdgeParts(getFlowEdgeType()).head === opt.key }"\
                  @click="edgeToolbarSelectLineHead(opt.key)"\
                >{{ opt.label }}</button>\
              </div>\
            </div>\
          </div>\
          <div class="edge-toolbar__sep"></div>\
          <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="edgeToolbarDelete" title="Delete edge">Delete</button>\
        </div>\
        <div v-if="sequenceToolbar" class="sequence-toolbar" :style="{ left: sequenceToolbar.x + &quot;px&quot;, top: sequenceToolbar.y + &quot;px&quot; }" @click.stop>\
          <button v-if="sequenceToolbar.type === &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarInsertSelfLoop">↩ Self Loop</button>\
          <button v-if="sequenceToolbar.type === &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarInsertMemo">≡ Memo</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot; &amp;&amp; sequenceToolbar.parentKind === &quot;alt&quot;" class="edge-toolbar__btn edge-toolbar__btn--branch" @click="sequenceToolbarAddBranch(&quot;else&quot;)">+ else</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot; &amp;&amp; sequenceToolbar.parentKind === &quot;par&quot;" class="edge-toolbar__btn edge-toolbar__btn--branch" @click="sequenceToolbarAddBranch(&quot;and&quot;)">+ and</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;loop&quot;)">Loop ↻</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;alt&quot;)">Alt ⎇</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;opt&quot;)">Opt ?</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;par&quot;)">Par∥</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;loop&quot; }" @click="sequenceToolbarChangeBlockType(&quot;loop&quot;)">Loop ↻</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;opt&quot; }" @click="sequenceToolbarChangeBlockType(&quot;opt&quot;)">Opt ?</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;alt&quot; }" @click="sequenceToolbarChangeBlockType(&quot;alt&quot;)">Alt ⎇</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;par&quot; }" @click="sequenceToolbarChangeBlockType(&quot;par&quot;)">Par∥</button>\
          <button v-if="sequenceToolbar.type === &quot;block-title&quot; || sequenceToolbar.type === &quot;branch-title&quot;" class="edge-toolbar__btn" @click="sequenceToolbarEdit">Edit ✎</button>\
          <button v-if="sequenceToolbar.type !== &quot;block&quot; &amp;&amp; sequenceToolbar.type !== &quot;block-title&quot; &amp;&amp; sequenceToolbar.type !== &quot;branch-title&quot; &amp;&amp; sequenceToolbar.type !== &quot;selection&quot; &amp;&amp; sequenceToolbar.type !== &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarEdit">Text ✎</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveLeft" title="Move left">◀</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveRight" title="Move right">▶</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarToggleKind">{{ sequenceToolbar.kind === &quot;actor&quot; ? &quot;→ Participant&quot; : &quot;→ Shape&quot; }}</button>\
          <button v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__btn" @click="sequenceToolbarReverse">Reverse</button>\
          <div v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__type-group">\
            <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': lineTypePicker }" @click.stop="sequenceToolbarToggleLineType" title="Line type">\
              <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--body">{{ getSequenceMessageLineTypeLabel() }}</span>\
              <span class="edge-toolbar__type-caret">⌄</span>\
            </button>\
            <div v-if="lineTypePicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--body">\
              <button\
                v-for="opt in $options.LINE_TYPE_OPTIONS"\
                :key="opt.operator"\
                class="edge-toolbar__type-option edge-toolbar__btn--line-opt"\
                :class="{ \'edge-toolbar__type-option--selected\': getSequenceMessageLineType() === opt.operator }"\
                @click="sequenceToolbarSelectLineType(opt.operator)"\
              >{{ opt.label }}</button>\
            </div>\
          </div>\
          <button v-if="sequenceToolbar.type !== &quot;selection&quot; &amp;&amp; sequenceToolbar.type !== &quot;insert&quot;" class="edge-toolbar__btn edge-toolbar__btn--danger" @click="sequenceToolbarDelete">Delete</button>\
        </div>\
      </div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">[]</div>\
        <div class="preview-area__empty-text">{{ renderError || &quot;Enter Mermaid script to render a diagram here.&quot; }}</div>\
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">{{ renderError ? &quot;Rendering failed. Check the Mermaid script.&quot; : &quot;Flowchart and sequence diagrams are supported.&quot; }}</div>\
      </div>\
    </div>\
  '
});
