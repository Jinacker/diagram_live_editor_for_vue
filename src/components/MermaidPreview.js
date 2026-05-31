/**
 * MermaidPreview 컴포넌트
 * - SvgPositionTracker : 좌표 수집
 * - PortDragHandler    : 4방향 포트 drag-to-connect
 * - SvgNodeHandler     : 노드 클릭 / 더블클릭 / 우클릭 / hover
 * - SvgEdgeHandler     : 엣지 클릭 / 라벨 / 편집
 */

var FlowEdgeCodec = window.FlowEdgeCodec;

Vue.component('mermaid-preview', {
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

    _confirmActiveEdits: function () {
      if (this.editingNodeId) this.confirmNodeEdit();
      if (this.editingEdgeIndex !== null) this.confirmEdgeEdit();
      if (this.editingSequenceParticipantId) this.confirmSequenceParticipantEdit();
      if (this.editingSequenceMessageIndex !== null) this.confirmSequenceMessageEdit();
      if (this.editingSequenceBlockId !== null || this.editingSequenceBranchStatementIndex !== null) this.confirmSequenceBlockEdit();
      if (this.editingSequenceNoteStatementIndex !== null) this.confirmSequenceNoteEdit();
    },

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

    scheduleFit: function () {
      this._fitAfterRender = true;
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

    _applyTransform: function () {
      if (!this._svgEl) return;
      var snappedPanX = Math.round(this.panX);
      var snappedPanY = Math.round(this.panY);
      var snappedZoom = Math.round(this.cfgZoom * 1000) / 1000;
      // SVG width/height를 zoom에 맞게 조절해 벡터 품질을 유지한다.
      // CSS scale() 대신 이 방식을 쓰면 foreignObject 내부 텍스트도 선명하게 렌더된다.
      var intrinsicW = this._intrinsicWidth || 1;
      var intrinsicH = this._intrinsicHeight || 1;
      this._svgEl.style.width  = (intrinsicW * snappedZoom) + 'px';
      this._svgEl.style.height = (intrinsicH * snappedZoom) + 'px';
      this._svgEl.style.transformOrigin = '0 0';
      this._svgEl.style.transform = 'translate(' + snappedPanX + 'px, ' + snappedPanY + 'px)';
      var self = this;
      requestAnimationFrame(function () { self._refreshFloatingUiPositions(); });
    },

    _getContentBounds: function () {
      if (!this._svgEl) return null;

      // viewBox는 Mermaid가 SVG 생성 시 전체 다이어그램 크기로 정확히 설정한다.
      // getBBox()는 foreignObject 레이아웃 전에 호출되면 부분 bounds를 반환할 수 있어
      // fitView 계산이 틀려지므로 viewBox를 우선 사용한다.
      var vb = this._svgEl.viewBox && this._svgEl.viewBox.baseVal;
      if (vb && vb.width && vb.height) {
        return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
      }

      try {
        var box = this._svgEl.getBBox();
        if (box && box.width && box.height) {
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      } catch (e) {}

      return null;
    },

    _setupViewport: function (svgEl, canvas, forcefit) {
      var prevZoom = this.cfgZoom;
      var prevPanX = this.panX;
      var prevPanY = this.panY;
      var hadPrev  = !!this._svgEl;

      this._svgEl = svgEl;
      svgEl.style.overflow = 'visible';
      svgEl.style.display = 'block';
      svgEl.style.position = 'absolute';
      svgEl.style.top = '0';
      svgEl.style.left = '0';
      svgEl.style.maxWidth = 'none';
      svgEl.style.maxHeight = 'none';
      svgEl.style.backfaceVisibility = 'hidden';
      svgEl.style.webkitFontSmoothing = 'antialiased';
      svgEl.setAttribute('text-rendering', 'geometricPrecision');

      var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      var bounds = this._getContentBounds();
      var intrinsicWidth = (vb && vb.width) || (bounds && bounds.width) || 1;
      var intrinsicHeight = (vb && vb.height) || (bounds && bounds.height) || 1;

      this._intrinsicWidth  = intrinsicWidth;
      this._intrinsicHeight = intrinsicHeight;

      svgEl.style.width = intrinsicWidth + 'px';
      svgEl.style.height = intrinsicHeight + 'px';

      var self = this;

      if (forcefit || !hadPrev) {
        // 브라우저 레이아웃 완료 후 fit 해야 canvas 크기를 정확히 읽을 수 있다.
        requestAnimationFrame(function () { self.fitView(); });
      } else {
        this.cfgZoom = prevZoom;
        this.panX    = prevPanX;
        this.panY    = prevPanY;
        this._applyTransform();
      }

      canvas.onwheel = function (e) {
        if (self._shouldLetEditTextScroll(e.target)) return;
        e.preventDefault();
        self._zoomAtClient(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
      };

      // 패닝은 배경에서만 시작해서 node/edge interaction과 충돌하지 않게 한다.
      canvas.onmousedown = function (e) {
        if (e.button !== 0) return;
        if (!self._canPreparePan(e.target, svgEl)) return;
        e.preventDefault();
        self._panCandidate = { startX: e.clientX, startY: e.clientY, panX: self.panX, panY: self.panY };
      };

      canvas.onmousemove = function (e) {
        if (!self._panState && self._panCandidate) {
          var dx = e.clientX - self._panCandidate.startX;
          var dy = e.clientY - self._panCandidate.startY;
          if (Math.abs(dx) + Math.abs(dy) >= 4) {
            self._panState = self._panCandidate;
            self._panCandidate = null;
            canvas.classList.add('preview-area__canvas--panning');
          }
        }
        if (!self._panState) return;
        self.panX = self._panState.panX + (e.clientX - self._panState.startX);
        self.panY = self._panState.panY + (e.clientY - self._panState.startY);
        self._applyTransform();
      };

      if (this._panMouseUpHandler) {
        document.removeEventListener('mouseup', this._panMouseUpHandler);
      }
      this._panMouseUpHandler = function () { self._endPan(); };
      document.addEventListener('mouseup', this._panMouseUpHandler);
    },

    _shouldLetEditTextScroll: function (target) {
      if (!this.isStaticDiagram()) return false;
      if (!target || !target.closest) return false;
      var overlay = target.closest('.node-edit-overlay');
      if (!overlay) return false;
      var editor = target.closest('textarea') || (overlay.querySelector && overlay.querySelector('textarea'));
      return !!(editor && editor.scrollHeight > editor.clientHeight);
    },

    _canPreparePan: function (target, svgEl) {
      if (!target || !svgEl) return false;
      if (target.closest && (
        target.closest('.edge-toolbar') ||
        target.closest('.sequence-toolbar') ||
        target.closest('.context-menu') ||
        target.closest('.node-edit-overlay') ||
        target.closest('#conn-port-overlay') ||
        target.closest('#sequence-drag-overlay') ||
        target.closest('#sequence-block-overlay')
      )) {
        return false;
      }
      return true;
    },

    _endPan: function () {
      var canvas = this.$refs.canvas;
      if (this._panState) this._suppressClickAfterPan = true;
      this._panState = null;
      this._panCandidate = null;
      if (canvas) canvas.classList.remove('preview-area__canvas--panning');
    },

    _zoomAtClient: function (factor, clientX, clientY) {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var cx = clientX - rect.left;
      var cy = clientY - rect.top;

      var newZoom = Math.max(0.05, Math.min(5.0, this.cfgZoom * factor));
      var ratio   = newZoom / this.cfgZoom;

      this.panX    = cx - (cx - this.panX) * ratio;
      this.panY    = cy - (cy - this.panY) * ratio;
      this.cfgZoom = newZoom;
      this._applyTransform();
    },

    _allPositionsZero: function (positions) {
      var ids = Object.keys(positions);
      if (!ids.length) return false;
      for (var i = 0; i < ids.length; i++) {
        if (positions[ids[i]].width > 0) return false;
      }
      return true;
    },

    _scheduleRerenderWhenVisible: function () {
      if (this._visibilityObserver) return;
      var self = this;
      var el = this.$el;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      this._visibilityObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          self._visibilityObserver.disconnect();
          self._visibilityObserver = null;
          self.scheduleFit();
          self.renderDiagram();
        }
      }, { threshold: 0 });
      this._visibilityObserver.observe(el);
    },

    _buildCtx: function (svgEl) {
      return PreviewCtxBuilder.build(this, svgEl);
    },

    // 공통 노드 편집 유틸

    isStaticDiagram: function () {
      return !!(this.model && this.model.profile === 'static');
    },

    isGraphProfile: function () {
      return !!(this.model && (this.model.headerKeyword === 'graph' || this.model.profile === 'graph'));
    },

    isStaticNodeEditing: function () {
      return !!(this.editingNodeId && this.isStaticDiagram());
    },

    isGraphEdgeEditing: function () {
      return this.editingEdgeIndex !== null && this.isGraphProfile();
    },

    getGraphEdgeEditBoxSize: function (text) {
      var lines = String(text || '').split(/\r\n|\r|\n/).length;
      if (lines <= 1) {
        return { width: 260, height: 56 };
      }
      return {
        width: lines >= 4 ? 320 : 300,
        height: Math.min(130, Math.max(76, lines * 20 + 30))
      };
    },

    confirmNodeEdit: function () {
      if (this.editingNodeId && this.editingText.trim()) {
        this.$emit('update-node-text', {
          nodeId: this.editingNodeId,
          text:   SvgNodeHandler.toModelText(this.model, this.editingText.trim())
        });
      }
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    cancelNodeEdit: function () {
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    onNodeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmNodeEdit(); }
      if (e.key === 'Escape') { this.cancelNodeEdit(); }
    },

    onStaticNodeEditKeyDown: function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.confirmNodeEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelNodeEdit();
      }
    },

    // 공통 엣지 편집 유틸

    confirmEdgeEdit: function () {
      if (this.editingEdgeIndex !== null) {
        this.$emit('update-edge-text', {
          index: this.editingEdgeIndex,
          text:  this.isGraphProfile()
            ? SvgNodeHandler.toModelText(this.model, this.editingEdgeText.trim())
            : this.editingEdgeText.trim()
        });
      }
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    cancelEdgeEdit: function () {
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    onEdgeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmEdgeEdit(); }
      if (e.key === 'Escape') { this.cancelEdgeEdit(); }
    },

    onGraphEdgeEditKeyDown: function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.confirmEdgeEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelEdgeEdit();
      }
    },

    // 공통 시퀀스 편집 유틸

    confirmSequenceParticipantEdit: function () {
      if (this.editingSequenceParticipantId && this.editingSequenceParticipantText.trim()) {
        this.$emit('update-sequence-participant-text', {
          participantId: this.editingSequenceParticipantId,
          text: this.editingSequenceParticipantText.trim()
        });
      }
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    cancelSequenceParticipantEdit: function () {
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    onSequenceParticipantEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceParticipantEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceParticipantEdit(); }
    },

    confirmSequenceMessageEdit: function () {
      if (this.editingSequenceMessageIndex !== null) {
        this.$emit('update-sequence-message-text', {
          index: this.editingSequenceMessageIndex,
          text: this.editingSequenceMessageText.trim()
        });
      }
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    cancelSequenceMessageEdit: function () {
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    onSequenceMessageEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceMessageEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceMessageEdit(); }
    },

    confirmSequenceBlockEdit: function () {
      if (this.editingSequenceBlockId !== null) {
        this.$emit('update-sequence-block-text', {
          blockId: this.editingSequenceBlockId,
          text: this.editingSequenceBlockText.trim()
        });
      } else if (this.editingSequenceBranchStatementIndex !== null) {
        this.$emit('update-sequence-branch-text', {
          statementIndex: this.editingSequenceBranchStatementIndex,
          text: this.editingSequenceBlockText.trim()
        });
      }
      this.editingSequenceBlockId = null;
      this.editingSequenceBranchStatementIndex = null;
      this.editingSequenceBlockText = '';
    },

    cancelSequenceBlockEdit: function () {
      this.editingSequenceBlockId = null;
      this.editingSequenceBranchStatementIndex = null;
      this.editingSequenceBlockText = '';
    },

    onSequenceBlockEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceBlockEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceBlockEdit(); }
    },

    confirmSequenceNoteEdit: function () {
      if (this.editingSequenceNoteStatementIndex !== null) {
        this.$emit('update-sequence-note-text', {
          statementIndex: this.editingSequenceNoteStatementIndex,
          text: this.editingSequenceNoteText.trim()
        });
      }
      this.editingSequenceNoteStatementIndex = null;
      this.editingSequenceNoteText = '';
    },

    cancelSequenceNoteEdit: function () {
      this.editingSequenceNoteStatementIndex = null;
      this.editingSequenceNoteText = '';
    },

    onSequenceNoteEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceNoteEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceNoteEdit(); }
    },

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

    getFlowEdgeParts: function (type) {
      return FlowEdgeCodec ? FlowEdgeCodec.parseType(type) : { body: 'solid', head: 'none' };
    },

    getFlowEdgeType: function () {
      if (!this.edgeToolbar) return '---';
      var edge = (this.model.edges || [])[this.edgeToolbar.edgeIndex];
      return edge && edge.type ? edge.type : '---';
    },

    getFlowEdgeBodyLabel: function () {
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      var options = this.$options.FLOW_EDGE_BODY_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].key === parts.body) return options[i].label;
      }
      return '──';
    },

    getFlowEdgeHeadLabel: function () {
      var head = this.getFlowEdgeParts(this.getFlowEdgeType()).head;
      var options = this.$options.FLOW_EDGE_HEAD_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].key === head) return options[i].label;
      }
      return '─';
    },

    getFlowEdgeColorValue: function () {
      if (!this.edgeToolbar) return '';
      var edge = (this.model.edges || [])[this.edgeToolbar.edgeIndex];
      return edge && edge.color ? edge.color : '';
    },

    getSequenceMessageLineType: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') {
        return SequenceMessageCodec.DEFAULT_OPERATOR;
      }
      var message = (this.model.messages || [])[this.sequenceToolbar.index];
      var parsed = SequenceMessageCodec.parseOperator(message && message.operator);
      return parsed.base || SequenceMessageCodec.DEFAULT_OPERATOR;
    },

    getSequenceMessageLineTypeLabel: function () {
      var current = this.getSequenceMessageLineType();
      var options = this.$options.LINE_TYPE_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].operator === current) return options[i].label;
      }
      return '───▶';
    },

    getAvailableFlowEdgeHeadOptions: function () {
      return this.$options.FLOW_EDGE_HEAD_OPTIONS || [];
    },

    composeFlowEdgeType: function (body, head) {
      return FlowEdgeCodec ? FlowEdgeCodec.composeType(body, head) : '---';
    },

    toggleFlowEdgeColorPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeColorPicker = !this.flowEdgeColorPicker;
      if (this.flowEdgeColorPicker) {
        this.flowEdgeBodyPicker = false;
        this.flowEdgeHeadPicker = false;
      }
    },

    toggleFlowEdgeBodyPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeBodyPicker = !this.flowEdgeBodyPicker;
      if (this.flowEdgeBodyPicker) {
        this.flowEdgeColorPicker = false;
        this.flowEdgeHeadPicker = false;
      }
    },

    toggleFlowEdgeHeadPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeHeadPicker = !this.flowEdgeHeadPicker;
      if (this.flowEdgeHeadPicker) {
        this.flowEdgeColorPicker = false;
        this.flowEdgeBodyPicker = false;
      }
    },

    edgeToolbarSetType: function (type) {
      if (!this.edgeToolbar) return;
      this.$emit('update-edge-type', {
        index: this.edgeToolbar.edgeIndex,
        type: type
      });
    },

    edgeToolbarSelectLineBody: function (body) {
      if (!this.edgeToolbar) return;
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      this.edgeToolbarSetType(this.composeFlowEdgeType(body, parts.head));
      this.flowEdgeBodyPicker = false;
    },

    edgeToolbarSelectLineHead: function (head) {
      if (!this.edgeToolbar) return;
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      this.edgeToolbarSetType(this.composeFlowEdgeType(parts.body, head));
      this.flowEdgeHeadPicker = false;
    },

    // 공통 엣지 툴바 액션 유틸

    edgeToolbarEdit: function () {
      if (!this.edgeToolbar) return;
      var idx = this.edgeToolbar.edgeIndex;
      var clickX = this.edgeToolbar.x;
      var clickY = this.edgeToolbar.y;
      this.edgeToolbar = null;
      var edge = (this.model.edges || [])[idx];
      if (!edge) return;

      var graphMode = this.isGraphProfile();
      var editText = graphMode ? SvgNodeHandler.toEditableText(this.model, edge.text || '') : (edge.text || '');
      var editBox = graphMode ? this.getGraphEdgeEditBoxSize(editText) : { width: 160, height: 0 };
      this.selectedEdgeIndex = idx;
      this.editingEdgeIndex = idx;
      this.editingEdgeText = editText;
      this.editingEdgeColor = edge.color || '#5c7ab0';
      this.edgeEditInputStyle = {
        position: 'absolute',
        left: Math.max(8, clickX - (graphMode ? Math.round(editBox.width / 2) : 80)) + 'px',
        top: Math.max(8, clickY - 18) + 'px',
        zIndex: 1000,
        width: graphMode ? editBox.width + 'px' : '160px',
        height: graphMode ? editBox.height + 'px' : undefined
      };
      this.flowEdgeColorPicker = false;
      this.flowEdgeBodyPicker = false;
      this.flowEdgeHeadPicker = false;
      this.$nextTick(this._buildCtxLite().focusEdgeEditInput);
    },

    edgeToolbarDelete: function () {
      if (!this.edgeToolbar) return;
      this.$emit('delete-selected', { nodeId: null, edgeIndex: this.edgeToolbar.edgeIndex });
      this.edgeToolbar       = null;
      this.flowEdgeColorPicker = false;
      this.flowEdgeBodyPicker = false;
      this.flowEdgeHeadPicker = false;
      this.selectedEdgeIndex = null;
    },

    edgeToolbarChangeColor: function (color) {
      if (!this.edgeToolbar) return;
      this.$emit('update-edge-color', {
        index: this.edgeToolbar.edgeIndex,
        color: color || ''
      });
      this.flowEdgeColorPicker = false;
    },

    // 공통 시퀀스 툴바 액션 유틸

    sequenceToolbarEdit: function () {
      if (!this.sequenceToolbar) return;
      var toolbar = this.sequenceToolbar;
      var canvas = this.$refs.canvas;
      var svgEl = canvas ? canvas.querySelector('svg') : null;

      if (toolbar.type === 'participant') {
        var participantMap = SequencePositionTracker.collectParticipants(svgEl, this.model);
        var participant = participantMap[toolbar.id];
        if (participant) {
          var topBox = participant.topBox || participant.bbox;
          var screenPos = { x: toolbar.x, y: toolbar.y };
          SequenceSvgHandler.startParticipantEdit(toolbar.id, screenPos, topBox, this._buildCtxLite());
        }
      } else if (toolbar.type === 'message') {
        SequenceSvgHandler.startMessageEdit(toolbar.index, toolbar.x, toolbar.y, svgEl, this._buildCtxLite());
      } else if (toolbar.type === 'block' || toolbar.type === 'block-title') {
        this._buildCtxLite().openSequenceBlockEdit(toolbar.blockId, toolbar.text || '', toolbar.x, toolbar.y);
      } else if (toolbar.type === 'branch-title') {
        this._buildCtxLite().openSequenceBranchEdit(toolbar.statementIndex, toolbar.text || '', toolbar.x, toolbar.y);
      } else if (toolbar.type === 'note') {
        this._buildCtxLite().openSequenceNoteEdit(toolbar.noteStatementIndex, toolbar.text || '', toolbar.x, toolbar.y);
      }
    },

    sequenceToolbarDelete: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('delete-selected', {
          sequenceParticipantId: this.sequenceToolbar.id,
          sequenceMessageIndex: null
        });
        this.selectedSequenceParticipantId = null;
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('delete-selected', {
          sequenceParticipantId: null,
          sequenceMessageIndex: this.sequenceToolbar.index
        });
        this.selectedSequenceMessageIndex = null;
      } else if (this.sequenceToolbar.type === 'block' || this.sequenceToolbar.type === 'block-title') {
        this.$emit('delete-selected', {
          sequenceParticipantId: null,
          sequenceMessageIndex: null,
          sequenceBlockId: this.sequenceToolbar.blockId
        });
        this.selectedSequenceBlockId = null;
      } else if (this.sequenceToolbar.type === 'branch-title') {
        this.$emit('update-sequence-branch-text', {
          statementIndex: this.sequenceToolbar.statementIndex,
          text: ''
        });
      } else if (this.sequenceToolbar.type === 'note') {
        this.$emit('delete-selected', { sequenceNoteStatementIndex: this.sequenceToolbar.noteStatementIndex });
        this.selectedSequenceNoteStatementIndex = null;
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarAddMessage: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('add-sequence-message', { participantId: this.sequenceToolbar.id });
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('add-sequence-message', { afterIndex: this.sequenceToolbar.index });
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarReverse: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('reverse-sequence-message', this.sequenceToolbar.index);
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleLineType: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.lineTypePicker = !this.lineTypePicker;
    },

    sequenceToolbarSelectLineType: function (operator) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('set-sequence-message-line-type', { index: this.sequenceToolbar.index, operator: operator });
      this.lineTypePicker = false;
    },

    sequenceToolbarChangeBlockType: function (kind) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'block') return;
      this.$emit('change-sequence-block-type', {
        blockId: this.sequenceToolbar.blockId,
        kind: kind
      });
      this.sequenceToolbar = null;
    },

    sequenceToolbarInsertSelfLoop: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'insert') return;
      var tb = this.sequenceToolbar;
      var payload = { fromId: tb.participantId, toId: tb.participantId, insertIndex: tb.insertIndex };
      if (tb.stmtInsertAt !== undefined && tb.stmtInsertAt !== null) {
        payload.stmtInsertAt = tb.stmtInsertAt;
      }
      this.$emit('add-sequence-message', payload);
      this.sequenceToolbar = null;
    },

    sequenceToolbarInsertMemo: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'insert') return;
      var tb = this.sequenceToolbar;
      if (tb.stmtInsertAt !== undefined && tb.stmtInsertAt !== null) {
        this.$emit('insert-sequence-note-at', {
          statementIndex: tb.stmtInsertAt,
          participantId: tb.participantId,
          isBefore: true
        });
      } else {
        this.$emit('create-sequence-note', {
          participantId: tb.participantId,
          insertIndex: tb.insertIndex
        });
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarAddBranch: function (keyword) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'selection') return;
      this.$emit('add-sequence-branch', {
        keyword: keyword,
        text: keyword === 'else' ? 'else title' : 'and title',
        messageIndices: (this.sequenceToolbar.messageIndices || []).slice(),
        noteStatementIndices: (this.sequenceToolbar.noteStatementIndices || []).slice()
      });
      this.selectedSequenceMessageIndices = [];
      this.selectedNoteStatementIndices = [];
      this.sequenceToolbar = null;
    },

    sequenceToolbarWrapBlock: function (kind) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'selection') return;
      this.$emit('wrap-sequence-messages-in-block', {
        kind: kind,
        text: kind + '_title',
        messageIndices: (this.sequenceToolbar.messageIndices || []).slice(),
        noteStatementIndices: (this.sequenceToolbar.noteStatementIndices || []).slice()
      });
      this.selectedSequenceMessageIndices = [];
      this.selectedNoteStatementIndices = [];
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleKind: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('toggle-participant-kind', { participantId: this.sequenceToolbar.id });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveLeft: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'left' });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveRight: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'right' });
      this.sequenceToolbar = null;
    },

    // postRenderSetup 바깥에서도 재사용하는 경량 ctx
    _buildCtxLite: function () {
      return PreviewCtxBuilder.buildLite(this);
    },

    fitView: function () {
      var canvas = this.$refs.canvas;
      if (!canvas || !this._svgEl) return;

      var canvasW = canvas.clientWidth  || canvas.offsetWidth;
      var canvasH = canvas.clientHeight || canvas.offsetHeight;

      if (!canvasW || !canvasH) {
        var self = this;
        requestAnimationFrame(function () { self.fitView(); });
        return;
      }

      var bounds = this._getContentBounds();
      if (!bounds || !bounds.width || !bounds.height) return;

      var pad    = Math.max(24, Math.min(canvasW, canvasH) * 0.06);
      var scaleX = (canvasW - pad * 2) / bounds.width;
      var scaleY = (canvasH - pad * 2) / bounds.height;
      var scale  = Math.min(scaleX, scaleY);
      scale = Math.min(5.0, scale);

      this.cfgZoom = scale;
      this.panX    = (canvasW - bounds.width * scale) / 2 - bounds.x * scale;
      this.panY    = (canvasH - bounds.height * scale) / 2 - bounds.y * scale;
      this._applyTransform();
    },

    zoomIn: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    zoomOut: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
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

    _attachSubgraphInteractions: function (svgEl) {
      var self = this;
      var subgraphs = (this.model && this.model.subgraphs) || [];
      if (!subgraphs.length) return;

      // id → subgraph 빠른 탐색용 맵
      var sgById = {};
      for (var k = 0; k < subgraphs.length; k++) sgById[subgraphs[k].id] = subgraphs[k];

      function normalizeClusterId(rawId) {
        rawId = String(rawId || '');
        if (!rawId) return '';
        if (sgById[rawId]) return rawId;

        var candidates = [
          rawId.replace(/^cluster_/, ''),
          rawId.replace(/^subGraph/i, ''),
          rawId.replace(/^.*flowchart-/, '').replace(/-\d+$/, '')
        ];
        for (var c = 0; c < candidates.length; c++) {
          if (sgById[candidates[c]]) return candidates[c];
        }
        return '';
      }

      function getSubgraphIdFromDom(clusterEl) {
        var rawIds = [
          clusterEl.getAttribute('data-id'),
          clusterEl.getAttribute('data-node'),
          clusterEl.id
        ];
        for (var r = 0; r < rawIds.length; r++) {
          var normalized = normalizeClusterId(rawIds[r]);
          if (normalized) return normalized;
        }
        return '';
      }

      function usableRect(el) {
        if (!el || !el.getBoundingClientRect) return null;
        var rect = el.getBoundingClientRect();
        return rect && rect.width > 0 && rect.height > 0 ? rect : null;
      }

      function getLabelText(labelEl) {
        if (!labelEl) return '';
        var text = labelEl.textContent || '';
        return String(text).replace(/\u00a0/g, ' ').trim();
      }

      function getSubgraphIdFromLabel(labelEl) {
        var labelText = getLabelText(labelEl);
        if (!labelText) return '';
        for (var s = 0; s < subgraphs.length; s++) {
          var title = String(subgraphs[s].title || subgraphs[s].id || '').trim();
          if (title && title === labelText) return subgraphs[s].id;
        }
        return '';
      }

      function sameNodeSet(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        var seen = {};
        for (var i = 0; i < a.length; i++) seen[a[i]] = true;
        for (var j = 0; j < b.length; j++) {
          if (!seen[b[j]]) return false;
        }
        return true;
      }

      function getSubgraphIdFromContainedNodes(nodeIdsInCluster) {
        if (!nodeIdsInCluster || !nodeIdsInCluster.length) return '';

        for (var exact = 0; exact < subgraphs.length; exact++) {
          if (sameNodeSet(subgraphs[exact].nodeIds || [], nodeIdsInCluster)) {
            return subgraphs[exact].id;
          }
        }

        var bestId = '';
        var bestScore = 0;
        var tied = false;
        for (var j = 0; j < subgraphs.length; j++) {
          var nodeIds = subgraphs[j].nodeIds || [];
          var score = 0;
          for (var m = 0; m < nodeIdsInCluster.length; m++) {
            if (nodeIds.indexOf(nodeIdsInCluster[m]) !== -1) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestId = subgraphs[j].id;
            tied = false;
          } else if (score > 0 && score === bestScore) {
            tied = true;
          }
        }

        return tied ? '' : bestId;
      }

      function openSubgraphToolbar(e, sgId, clusterEl, labelEl) {
        e.preventDefault();
        e.stopPropagation();
        var canvas = self.$refs.canvas;
        var cr = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        var labelRect = usableRect(labelEl);
        var clusterRect = usableRect(clusterEl);
        var anchorX = e.clientX;
        var anchorY = e.clientY;

        if (labelRect) {
          anchorX = labelRect.left + labelRect.width / 2;
          anchorY = labelRect.top + labelRect.height / 2;
        } else if (clusterRect) {
          anchorX = clusterRect.left + clusterRect.width / 2;
          anchorY = clusterRect.top + 12;
        }

        self.subgraphTitleToolbar = {
          sgId: sgId,
          x: Math.round(anchorX - cr.left),
          y: Math.round(anchorY - cr.top)
        };
      }

      function attachTitleHit(clusterEl, labelEl, sgId) {
        var rectEl = clusterEl.querySelector('rect');
        if (!rectEl || !rectEl.parentNode || rectEl.parentNode !== clusterEl) return;

        var x = parseFloat(rectEl.getAttribute('x') || '0');
        var y = parseFloat(rectEl.getAttribute('y') || '0');
        var width = parseFloat(rectEl.getAttribute('width') || '0');
        if (!width) return;

        var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('class', 'subgraph-title-hit');
        hit.setAttribute('x', x);
        hit.setAttribute('y', y);
        hit.setAttribute('width', width);
        hit.setAttribute('height', '28');
        hit.setAttribute('fill', '#000');
        hit.setAttribute('fill-opacity', '0.003');
        hit.setAttribute('stroke', 'none');
        // Mermaid의 `.cluster rect` 규칙이 presentation attribute보다 우선하므로
        // 제목 클릭용 hit rect는 inline priority로 다시 투명하게 고정한다.
        hit.style.setProperty('fill', '#000', 'important');
        hit.style.setProperty('fill-opacity', '0.003', 'important');
        hit.style.setProperty('stroke', 'none', 'important');
        hit.style.cursor = 'pointer';
        hit.style.pointerEvents = 'all';
        hit.addEventListener('click', function (e) {
          openSubgraphToolbar(e, sgId, clusterEl, labelEl);
        });
        clusterEl.appendChild(hit);
      }

      var clusters = svgEl.querySelectorAll('.cluster');
      for (var i = 0; i < clusters.length; i++) {
        (function (clusterEl) {
          var labelEl = clusterEl.querySelector('.cluster-label');
          var sgId = getSubgraphIdFromDom(clusterEl) || getSubgraphIdFromLabel(labelEl);

          if (!sgId) {
            // Mermaid SVG에서 .node는 .cluster의 DOM 자식이 아닌 형제다.
            // DOM id가 없는 구버전/특수 렌더만 화면 좌표 기준 포함 여부로 fallback 매핑.
            var clusterRect = clusterEl.getBoundingClientRect();
            var nodeIdsInCluster = [];
            var elements = self._elements || {};
            for (var nodeId in elements) {
              var nodeEl = elements[nodeId];
              if (!nodeEl) continue;
              var nr = nodeEl.getBoundingClientRect();
              var nCx = nr.left + nr.width  / 2;
              var nCy = nr.top  + nr.height / 2;
              if (nCx >= clusterRect.left && nCx <= clusterRect.right &&
                  nCy >= clusterRect.top  && nCy <= clusterRect.bottom) {
                nodeIdsInCluster.push(nodeId);
              }
            }
            if (nodeIdsInCluster.length > 0) {
              sgId = getSubgraphIdFromContainedNodes(nodeIdsInCluster);
            }
          }

          if (!sgId) return;

          if (labelEl) {
            labelEl.style.cursor = 'pointer';
            labelEl.addEventListener('click', function (e) {
              openSubgraphToolbar(e, sgId, clusterEl, labelEl);
            });
          }
          attachTitleHit(clusterEl, labelEl, sgId);
        })(clusters[i]);
      }
    },

    subgraphTitleEdit: function () {
      var tb = this.subgraphTitleToolbar;
      if (!tb) return;
      this.subgraphTitleToolbar = null;
      var currentSg = ((this.model && this.model.subgraphs) || []).filter(function (s) { return s.id === tb.sgId; })[0];
      var canvas = this.$refs.canvas;
      var cr = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      this.editingSubgraphId   = tb.sgId;
      this.editingSubgraphText = currentSg ? currentSg.title : tb.sgId;
      this.editingSubgraphStyle = {
        position: 'absolute',
        left:   tb.x + 'px',
        top:    tb.y + 'px',
        width:  '140px',
        zIndex: 1000
      };
      var self = this;
      this.$nextTick(function () {
        var el = self.$refs.editSubgraphInput;
        if (el) { el.focus(); el.select(); }
        var onOutsideDown = function (me) {
          var inputEl = self.$refs.editSubgraphInput;
          if (inputEl && inputEl.contains(me.target)) return;
          document.removeEventListener('mousedown', onOutsideDown, true);
          self.confirmSubgraphEdit();
        };
        document.addEventListener('mousedown', onOutsideDown, true);
      });
    },

    subgraphTitleDelete: function () {
      var tb = this.subgraphTitleToolbar;
      if (!tb) return;
      this.subgraphTitleToolbar = null;
      this.$emit('remove-subgraph', tb.sgId);
    },

    confirmSubgraphEdit: function () {
      var id   = this.editingSubgraphId;
      var text = (this.editingSubgraphText || '').trim();
      this.editingSubgraphId   = null;
      this.editingSubgraphText = '';
      if (!id) return;
      if (!text) {
        this.$emit('remove-subgraph', id);
      } else {
        this.$emit('update-subgraph-title', { subgraphId: id, title: text });
      }
    },

    cancelSubgraphEdit: function () {
      this.editingSubgraphId   = null;
      this.editingSubgraphText = '';
    },

    _onSubgraphEditKeyDown: function (e) {
      if (e.key === 'Enter') { e.preventDefault(); this.confirmSubgraphEdit(); }
      if (e.key === 'Escape') { this.cancelSubgraphEdit(); }
    },

    _attachFlowchartRubberBand: function (canvas, svgEl) {
      var self = this;
      var suppressContextMenu = false;

      // 캡처 단계에서 contextmenu를 가로채 브라우저 메뉴와 노드 GUI 메뉴 모두 차단
      canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();                    // 브라우저 기본 메뉴 항상 차단
        if (suppressContextMenu) {
          e.stopPropagation();                 // 드래그 후엔 노드 GUI 메뉴도 차단
          suppressContextMenu = false;
        }
      }, true); // capture phase

      canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 2) return;
        // 노드 위에서 시작하면 rubber-band 대신 노드 contextmenu로 위임
        if (e.target && e.target.closest && e.target.closest('.node')) return;

        e.preventDefault();
        var cr = canvas.getBoundingClientRect();
        var startX = e.clientX - cr.left;
        var startY = e.clientY - cr.top;
        var didDrag = false;

        self._rubberBand = { startX: startX, startY: startY };
        self.rubberBandRect = null;
        self.subgraphToolbar = null;
        self.selectedNodeIds = [];

        var onMove = function (me) {
          var cr2 = canvas.getBoundingClientRect();
          var curX = me.clientX - cr2.left;
          var curY = me.clientY - cr2.top;
          var w = Math.abs(curX - startX);
          var h = Math.abs(curY - startY);
          if (w > 4 || h > 4) {
            didDrag = true;
            self.rubberBandRect = {
              left:   Math.min(startX, curX),
              top:    Math.min(startY, curY),
              width:  w,
              height: h
            };
          }
        };

        var onUp = function (ue) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);

          var rb = self.rubberBandRect;
          self.rubberBandRect = null;
          self._rubberBand = null;

          if (!didDrag) {
            // 단순 우클릭 → contextmenu 이벤트 허용 (노드 GUI 메뉴용)
            suppressContextMenu = false;
            return;
          }

          // 드래그였으면 뒤따라오는 contextmenu를 억제
          suppressContextMenu = true;

          if (!rb || rb.width < 5 || rb.height < 5) return;

          var cr3 = canvas.getBoundingClientRect();
          var rLeft   = cr3.left + rb.left;
          var rTop    = cr3.top  + rb.top;
          var rRight  = rLeft + rb.width;
          var rBottom = rTop  + rb.height;

          var selectedIds = [];
          var nodeEls = svgEl.querySelectorAll('.node');
          for (var i = 0; i < nodeEls.length; i++) {
            var nodeId = SvgPositionTracker.extractNodeId(nodeEls[i]);
            if (!nodeId) continue;
            var nr = nodeEls[i].getBoundingClientRect();
            var cx = nr.left + nr.width  / 2;
            var cy = nr.top  + nr.height / 2;
            if (cx >= rLeft && cx <= rRight && cy >= rTop && cy <= rBottom) {
              selectedIds.push(nodeId);
            }
          }

          if (!selectedIds.length) return;

          self.selectedNodeIds = selectedIds;
          self._showFlowchartSelectionHighlight(selectedIds);
          var cr4 = canvas.getBoundingClientRect();
          self.subgraphToolbar = {
            x: ue.clientX - cr4.left,
            y: ue.clientY - cr4.top
          };
          self.subgraphTitleInput = '';

          // 다음 mousedown(새 드래그/클릭) 시 툴바 닫기
          var onNextMouseDown = function () {
            self._showFlowchartSelectionHighlight([]);
            self.subgraphToolbar = null;
            self.selectedNodeIds = [];
            document.removeEventListener('mousedown', onNextMouseDown);
          };
          document.addEventListener('mousedown', onNextMouseDown);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    _showFlowchartSelectionHighlight: function (selectedIds) {
      var svgEl = this._svgEl;
      if (!svgEl) return;
      var old = svgEl.querySelector('#flowchart-sel-highlight');
      if (old) old.remove();
      if (!selectedIds || !selectedIds.length) return;

      var pad = 12;
      var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (var i = 0; i < selectedIds.length; i++) {
        var pos = this._positions[selectedIds[i]];
        if (!pos) continue;
        var x = pos.origTx + pos.bboxX;
        var y = pos.origTy + pos.bboxY;
        left   = Math.min(left,   x);
        top    = Math.min(top,    y);
        right  = Math.max(right,  x + pos.width);
        bottom = Math.max(bottom, y + pos.height);
      }
      if (!isFinite(left)) return;

      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('id', 'flowchart-sel-highlight');
      rect.setAttribute('x', left - pad);
      rect.setAttribute('y', top - pad);
      rect.setAttribute('width',  right - left + pad * 2);
      rect.setAttribute('height', bottom - top + pad * 2);
      rect.setAttribute('rx', '6');
      rect.setAttribute('class', 'flowchart-sel-highlight');
      rect.style.pointerEvents = 'none';
      svgEl.appendChild(rect);
    },

    confirmWrapSubgraph: function () {
      if (!this.selectedNodeIds.length) return;

      // 선택된 노드 중 이미 subgraph에 속한 게 있으면 생성 차단
      var subgraphs = (this.model && this.model.subgraphs) || [];
      for (var i = 0; i < subgraphs.length; i++) {
        var sg = subgraphs[i];
        for (var j = 0; j < sg.nodeIds.length; j++) {
          if (this.selectedNodeIds.indexOf(sg.nodeIds[j]) !== -1) {
            this._showHint('Selected nodes are already in a subgraph');
            this._showFlowchartSelectionHighlight([]);
            this.subgraphToolbar = null;
            this.selectedNodeIds = [];
            return;
          }
        }
      }

      this._showFlowchartSelectionHighlight([]);
      this.$emit('wrap-nodes-in-subgraph', {
        nodeIds: this.selectedNodeIds.slice(),
        title: this.subgraphTitleInput || 'Group'
      });
      this.subgraphToolbar = null;
      this.selectedNodeIds = [];
      this.subgraphTitleInput = '';
    },

    cancelSubgraphToolbar: function () {
      this._showFlowchartSelectionHighlight([]);
      this.subgraphToolbar = null;
      this.selectedNodeIds = [];
      this.subgraphTitleInput = '';
    }
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
