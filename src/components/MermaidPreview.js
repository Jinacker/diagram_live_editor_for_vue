/**
 * MermaidPreview 컴포넌트
 * - SvgPositionTracker : 좌표 추출
 * - PortDragHandler    : 4방향 포트와 drag-to-connect
 * - SvgNodeHandler     : 노드 클릭 / 더블클릭 / 우클릭 / hover
 * - SvgEdgeHandler     : 엣지 클릭 / 레이블 / 편집
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

  // 템플릿에서 사용하는 전체 shape 목록
  SHAPES: SvgNodeHandler.SHAPES,

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

      // 노드 인라인 편집
      editingNodeId:  null,
      editingText:    '',
      editInputStyle: {},

      // 엣지 인라인 편집
      editingEdgeIndex:    null,
      editingEdgeText:     '',
      edgeEditInputStyle:  {},

      // 시퀀스 인라인 편집
      editingSequenceParticipantId: null,
      editingSequenceParticipantText: '',
      sequenceParticipantEditStyle: {},
      editingSequenceMessageIndex: null,
      editingSequenceMessageText: '',
      sequenceMessageEditStyle: {},

      // 컨텍스트 UI 상태
      contextMenu:  null,   // { nodeId, x, y }
      edgeToolbar:  null,   // { edgeIndex, x, y } - 플로팅 엣지 액션 바
      sequenceToolbar: null, // { type, id|index, x, y }

      // 포트 드래그 상태
      portDragging:  false,
      hoveredNodeId: null,

      // CSS transform 줌/팬 상태
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
    }
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
    document.addEventListener('click', function () {
      self.contextMenu = null;
      self.edgeToolbar = null;
      self.sequenceToolbar = null;
    });

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
    document.addEventListener('keydown', function (e) {
      // input / textarea 포커스 중에는 가로채지 않는다.
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId !== null || self.editingEdgeIndex !== null ||
            self.editingSequenceParticipantId !== null || self.editingSequenceMessageIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId:    self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        } else if (self.selectedSequenceParticipantId || self.selectedSequenceMessageIndex !== null) {
          self.$emit('delete-selected', {
            sequenceParticipantId: self.selectedSequenceParticipantId,
            sequenceMessageIndex: self.selectedSequenceMessageIndex
          });
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
        }
      }

      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.cancelSequenceParticipantEdit();
        self.cancelSequenceMessageEdit();
        self.selectedNodeId    = null;
        self.selectedEdgeIndex = null;
        self.selectedSequenceParticipantId = null;
        self.selectedSequenceMessageIndex = null;
        self.contextMenu       = null;
        self.edgeToolbar       = null;
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
    });
  },

  beforeDestroy: function () {
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
  },

  methods: {

    _confirmActiveEdits: function () {
      if (this.editingNodeId) this.confirmNodeEdit();
      if (this.editingEdgeIndex !== null) this.confirmEdgeEdit();
      if (this.editingSequenceParticipantId) this.confirmSequenceParticipantEdit();
      if (this.editingSequenceMessageIndex !== null) this.confirmSequenceMessageEdit();
    },

    // ── 렌더링 ───────────────────────────────────────────────────

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
          // 더 최신 render 요청이 이미 있으면 늦게 도착한 이전 결과는 버린다.
          if (renderToken !== self.renderToken) return;
          self.svgContent  = result.svg;
          self.renderError = '';
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

    // ── 렌더 후 인터랙션 연결 ────────────────────────────────────

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      var fitAfter = this._fitAfterRender;
      this._fitAfterRender = false;

      // overlay와 interaction이 모두 같은 좌표계를 쓰도록 viewBox를 먼저 맞춘다.
      this._setupViewport(svgEl, canvas, fitAfter);

      // 노드 위치와 SVG 요소 수집
      var isFlowchart = this.model && this.model.type !== 'sequenceDiagram';

      if (isFlowchart) {
        var collected    = SvgPositionTracker.collectNodePositions(svgEl);
        this._positions  = collected.positions;
        this._elements   = collected.elements;
        this._edgePaths  = SvgPositionTracker.collectEdgePaths(svgEl, this.model.edges);

        // 하위 핸들러에 넘길 bridge 객체 구성
        var ctx = this._buildCtx(svgEl);

        // 엣지 ghost overlay를 먼저 구성
        SvgEdgeHandler.initGhostOverlay(svgEl);
        SvgEdgeHandler.attach(svgEl, this._edgePaths, this._positions, ctx);

        // 포트 overlay는 ghost보다 위에 올라온다.
        PortDragHandler.initOverlay(svgEl);

        // 노드 인터랙션 연결
        SvgNodeHandler.attach(svgEl, this._positions, this._elements, ctx);
      } else {
        this._positions = {};
        this._elements = {};
        this._edgePaths = [];
        SequenceSvgHandler.attach(svgEl, this.model, this._buildCtx(svgEl));
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
        }
      });

    },

    scheduleFit: function () {
      this._fitAfterRender = true;
    },

    _applyTransform: function () {
      if (!this._svgEl) return;
      var snappedPanX = Math.round(this.panX);
      var snappedPanY = Math.round(this.panY);
      var snappedZoom = Math.round(this.cfgZoom * 1000) / 1000;
      this._svgEl.style.transformOrigin = '0 0';
      this._svgEl.style.transform =
        'translate(' + snappedPanX + 'px, ' + snappedPanY + 'px) scale(' + snappedZoom + ')';
    },

    _getContentBounds: function () {
      if (!this._svgEl) return null;

      var vb = this._svgEl.viewBox && this._svgEl.viewBox.baseVal;
      var fallback = {
        x: 0,
        y: 0,
        width: (vb && vb.width) || 0,
        height: (vb && vb.height) || 0
      };

      try {
        var box = this._svgEl.getBBox();
        if (box && box.width && box.height) {
          return {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          };
        }
      } catch (e) {}

      return (fallback.width && fallback.height) ? fallback : null;
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

      svgEl.style.width = intrinsicWidth + 'px';
      svgEl.style.height = intrinsicHeight + 'px';

      var self = this;

      if (forcefit || !hadPrev) {
        // 브라우저 레이아웃이 완성된 후 fit 해야 canvas 크기를 정확히 읽을 수 있다.
        requestAnimationFrame(function () { self.fitView(); });
      } else {
        this.cfgZoom = prevZoom;
        this.panX    = prevPanX;
        this.panY    = prevPanY;
        this._applyTransform();
      }

      canvas.onwheel = function (e) {
        e.preventDefault();
        self._zoomAtClient(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
      };

      // 팬은 배경에서만 시작해서 node/edge interaction과 충돌하지 않게 한다.
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

    _canPreparePan: function (target, svgEl) {
      if (!target || !svgEl) return false;
      if (target.closest && (
        target.closest('.edge-toolbar') ||
        target.closest('.sequence-toolbar') ||
        target.closest('.context-menu') ||
        target.closest('.node-edit-overlay') ||
        target.closest('#conn-port-overlay') ||
        target.closest('#sequence-drag-overlay')
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

      var newZoom = Math.max(0.2, Math.min(5.0, this.cfgZoom * factor));
      var ratio   = newZoom / this.cfgZoom;

      this.panX    = cx - (cx - this.panX) * ratio;
      this.panY    = cy - (cy - this.panY) * ratio;
      this.cfgZoom = newZoom;
      this._applyTransform();
    },

    _buildCtx: function (svgEl) {
      var self = this;
      var ctx = {
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
        findSequenceParticipant: function (participantId) {
          var participants = self.model.participants || [];
          for (var i = 0; i < participants.length; i++) {
            if (participants[i].id === participantId) return participants[i];
          }
          return null;
        },
        findSequenceMessage: function (messageIndex) {
          return (self.model.messages || [])[messageIndex] || null;
        },
        watchSelection: function (nodeId, nodeEl) {
          self.$watch('selectedNodeId', function (val) {
            nodeEl.classList.toggle('selected', val === nodeId);
          }, { immediate: true });
        },
        watchSequenceParticipantSelection: function (participantId, el) {
          self.$watch('selectedSequenceParticipantId', function (val) {
            el.classList.toggle('sequence-participant-selected', val === participantId);
          }, { immediate: true });
        },
        watchSequenceMessageSelection: function (messageIndex, lineEl, textEl) {
          self.$watch('selectedSequenceMessageIndex', function (val) {
            if (lineEl) lineEl.classList.toggle('sequence-message-selected', val === messageIndex);
            if (textEl) textEl.classList.toggle('sequence-message-text-selected', val === messageIndex);
          }, { immediate: true });
        },
        watchSequenceMessageHitSelection: function (messageIndex, hitEl) {
          self.$watch('selectedSequenceMessageIndex', function (val) {
            if (hitEl && hitEl.classList) {
              hitEl.classList.toggle('sequence-hit-selected', val === messageIndex);
            }
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
        },
        focusSequenceParticipantInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceParticipantInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceMessageInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceMessageInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
      return ctx;
    },

    // ── 노드 편집 ────────────────────────────────────────────────

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

    // ── 엣지 편집 ────────────────────────────────────────────────

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

    // ── 시퀀스 편집 ──────────────────────────────────────────────

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

    // ── 노드 컨텍스트 메뉴 액션 ─────────────────────────────────

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
      this.$emit('update-node-shape', {
        nodeId: this.contextMenu.nodeId,
        shape:  shape
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

    // ── 엣지 툴바 액션 ───────────────────────────────────────────

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

    // ── 시퀀스 툴바 액션 ────────────────────────────────────────

    sequenceToolbarEdit: function () {
      if (!this.sequenceToolbar) return;
      var toolbar = this.sequenceToolbar;
      var canvas = this.$refs.canvas;
      var svgEl = canvas ? canvas.querySelector('svg') : null;

      if (toolbar.type === 'participant') {
        var participantMap = SequencePositionTracker.collectParticipants(svgEl, this.model);
        var participant = participantMap[toolbar.id];
        if (participant && participant.el) {
          SequenceSvgHandler.startParticipantEdit(toolbar.id, participant.el, this._buildCtxLite());
        }
      } else if (toolbar.type === 'message') {
        SequenceSvgHandler.startMessageEdit(toolbar.index, toolbar.x, toolbar.y, svgEl, this._buildCtxLite());
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
      this.$emit('toggle-sequence-message-line-type', this.sequenceToolbar.index);
      this.sequenceToolbar = null;
    },

    // postRenderSetup 바깥에서도 쓸 수 있는 경량 ctx
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
        findSequenceParticipant: function (participantId) {
          var participants = self.model.participants || [];
          for (var i = 0; i < participants.length; i++) {
            if (participants[i].id === participantId) return participants[i];
          }
          return null;
        },
        findSequenceMessage: function (messageIndex) {
          var messages = self.model.messages || [];
          return messages[messageIndex] || null;
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
        },
        focusSequenceParticipantInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceParticipantInput;
            if (el) { el.focus(); el.select(); }
          });
        },
        focusSequenceMessageInput: function () {
          self.$nextTick(function () {
            var el = self.$refs.sequenceMessageInput;
            if (el) { el.focus(); el.select(); }
          });
        }
      };
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
      scale = Math.max(0.1, Math.min(5.0, scale));

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
    }
  },

  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null; selectedSequenceParticipantId = null; selectedSequenceMessageIndex = null;">\
      \
      <!-- Port drag hint -->\
      <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
        Release on target node to connect\
      </div>\
      \
      <!-- SVG canvas -->\
      <div v-if="svgContent" :key="renderCounter" ref="canvas" class="preview-area__canvas" v-html="svgContent"></div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">◇</div>\
        <div class="preview-area__empty-text">{{ renderError || "Mermaid 스크립트를 입력하면 여기에 렌더링됩니다" }}</div>\
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">{{ renderError ? "렌더링 실패로 이전 SVG를 비웠습니다" : "플로우차트와 시퀀스 다이어그램을 지원합니다" }}</div>\
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
      <!-- Sequence participant inline edit -->\
      <div v-if="editingSequenceParticipantId" class="node-edit-overlay" :style="sequenceParticipantEditStyle">\
        <input\
          ref="sequenceParticipantInput"\
          class="node-edit-input"\
          v-model="editingSequenceParticipantText"\
          @keydown="onSequenceParticipantEditKeyDown"\
          @blur="confirmSequenceParticipantEdit"\
        />\
      </div>\
      \
      <!-- Sequence message inline edit -->\
      <div v-if="editingSequenceMessageIndex !== null" class="node-edit-overlay" :style="sequenceMessageEditStyle">\
        <input\
          ref="sequenceMessageInput"\
          class="node-edit-input"\
          v-model="editingSequenceMessageText"\
          placeholder="Message text"\
          @keydown="onSequenceMessageEditKeyDown"\
          @blur="confirmSequenceMessageEdit"\
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
          >\
            <span class="context-menu__shape-icon" :class="\'context-menu__shape-icon--\' + s.key"></span>\
            <span class="context-menu__shape-text">{{ s.name }}</span>\
          </button>\
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
      \
      <!-- Sequence floating toolbar -->\
      <div\
        v-if="sequenceToolbar"\
        class="sequence-toolbar"\
        :style="{ left: sequenceToolbar.x + \'px\', top: sequenceToolbar.y + \'px\' }"\
        @click.stop\
      >\
        <button class="edge-toolbar__btn" @click="sequenceToolbarEdit">✎ Edit</button>\
        <button v-if="sequenceToolbar.type === \'message\'" class="edge-toolbar__btn" @click="sequenceToolbarReverse">↔ Reverse</button>\
        <button v-if="sequenceToolbar.type === \'message\'" class="edge-toolbar__btn" @click="sequenceToolbarToggleLineType">⋯ Line</button>\
        <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="sequenceToolbarDelete">✕ Delete</button>\
      </div>\
    </div>\
  '
});
