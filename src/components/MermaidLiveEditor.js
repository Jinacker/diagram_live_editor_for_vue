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
      parseWarning: '',

      selectedNode: '',
      selectedEdge: null,
      selectedSequenceParticipant: '',
      selectedSequenceMessage: null,
      syncSource:   null,
      nodeCounter:  0,
      participantCounter: 0,

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
      self.updateParticipantCounter();
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

    _schedulePreviewFit: function () {
      if (this.$refs.preview) this.$refs.preview.scheduleFit();
    },

    _normalizeSequenceMessages: function (messages) {
      var result = [];
      var activeCounts = {};

      var splitOperator = function (operator) {
        var suffix = '';
        var base = operator || '->>';
        if (/[+-]$/.test(base)) {
          suffix = base.slice(-1);
          base = base.slice(0, -1);
        }
        return { base: base, suffix: suffix };
      };

      for (var i = 0; i < messages.length; i++) {
        var msg = Object.assign({}, messages[i]);
        var parts = splitOperator(msg.operator);

        // "+": target participant 활성화
        if (parts.suffix === '+') {
          activeCounts[msg.to] = (activeCounts[msg.to] || 0) + 1;
        }

        // "-": source participant가 실제로 active일 때만 유지한다.
        if (parts.suffix === '-') {
          if (activeCounts[msg.from] > 0) {
            activeCounts[msg.from]--;
          } else {
            msg.operator = parts.base;
          }
        }

        result.push(msg);
      }

      return result;
    },

    _updateSequenceModel: function (patch) {
      var nextModel = Object.assign({}, this.model, patch);
      nextModel.explicitParticipants = true;
      if (nextModel.messages) {
        nextModel.messages = this._normalizeSequenceMessages(nextModel.messages);
      }
      this.model = nextModel;
      this.updateScriptFromModel();
    },

    // ── 스냅샷 헬퍼 ───────────────────────────────────────────────
    _snapshot: function () {
      if (this.history) this.history.snapshot(this.model);
    },

    // ── Script → Model ────────────────────────────────────────────
    onScriptChange: function (newScript) {
      // GUI 직후 editor가 같은 값을 다시 emit하는 경우만 무시한다.
      // 값이 실제로 달라졌다면 사용자가 편집한 것이므로 바로 파싱해야 한다.
      if (this.syncSource === 'gui' && newScript === this.script) {
        this.syncSource = null;
        return;
      }
      this.syncSource = null;
      this.script = newScript;
      this._schedulePreviewFit();
      this.parseScript();
    },

    parseScript: function () {
      try {
        var parsed = MermaidParser.parse(this.script);
        this.model = parsed;
        this.error = '';
        this.parseWarning = this._buildReservedIdWarning(parsed);
        this.updateNodeCounter();
        this.updateParticipantCounter();
      } catch (e) {
        this.error = e.message || 'Parse error';
        this.parseWarning = '';
        this.updateNodeCounter();
        this.updateParticipantCounter();
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
      // parser가 일부 문법을 놓쳐도 script 안에 이미 있는 N숫자 ID는 예약된 것으로 본다.
      var max = this._scanReservedCounter('N');
      if (this.model && this.model.nodes) {
        for (var i = 0; i < this.model.nodes.length; i++) {
          var nm = this.model.nodes[i].id.match(/(\d+)$/);
          if (nm) {
            var n = parseInt(nm[1], 10);
            if (n > max) max = n;
          }
        }
      }
      if (max > this.nodeCounter) this.nodeCounter = max;
    },

    updateParticipantCounter: function () {
      // sequence 쪽도 같은 이유로 raw script의 P숫자 ID를 같이 본다.
      var max = this._scanReservedCounter('P');
      var participants = (this.model && this.model.participants) || [];
      for (var i = 0; i < participants.length; i++) {
        var pm = String(participants[i].id || '').match(/(\d+)$/);
        if (!pm) continue;
        var n = parseInt(pm[1], 10);
        if (n > max) max = n;
      }
      if (max > this.participantCounter) this.participantCounter = max;
    },

    _scanReservedCounter: function (prefix) {
      var script = this.script || '';
      var escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var regex = new RegExp('\\b' + escapedPrefix + '(\\d+)\\b', 'g');
      var max = 0;
      var match;
      while ((match = regex.exec(script))) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
      return max;
    },

    _collectReservedIds: function (prefix) {
      var script = this.script || '';
      var escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var regex = new RegExp('\\b' + escapedPrefix + '(\\d+)\\b', 'g');
      var ids = {};
      var match;
      while ((match = regex.exec(script))) {
        ids[prefix + match[1]] = true;
      }
      return ids;
    },

    _collectModelIds: function (items, prefix) {
      var ids = {};
      for (var i = 0; i < items.length; i++) {
        var id = String(items[i] && items[i].id || '');
        if (new RegExp('^' + prefix + '\\d+$').test(id)) {
          ids[id] = true;
        }
      }
      return ids;
    },

    _countMissingIds: function (reserved, parsed) {
      var count = 0;
      var keys = Object.keys(reserved);
      for (var i = 0; i < keys.length; i++) {
        if (!parsed[keys[i]]) count++;
      }
      return count;
    },

    _buildReservedIdWarning: function (parsed) {
      if (!parsed) return '';
      var reservedNodeIds = this._collectReservedIds('N');
      var reservedParticipantIds = this._collectReservedIds('P');
      var parsedNodeIds = this._collectModelIds((parsed.nodes || []), 'N');
      var parsedParticipantIds = this._collectModelIds((parsed.participants || []), 'P');
      var missingNodeCount = this._countMissingIds(reservedNodeIds, parsedNodeIds);
      var missingParticipantCount = this._countMissingIds(reservedParticipantIds, parsedParticipantIds);

      if (!missingNodeCount && !missingParticipantCount) return '';

      var parts = [];
      if (missingNodeCount) parts.push('N ID ' + missingNodeCount + '개');
      if (missingParticipantCount) parts.push('P ID ' + missingParticipantCount + '개');
      return '일부 Mermaid 요소가 GUI parser에 완전히 반영되지 않았을 수 있습니다. 누락 추정: ' + parts.join(', ');
    },

    _scriptContainsId: function (id) {
      if (!id) return false;
      var escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('\\b' + escapedId + '\\b').test(this.script || '');
    },

    _modelContainsNodeId: function (id) {
      var nodes = (this.model && this.model.nodes) || [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return true;
      }
      return false;
    },

    _modelContainsParticipantId: function (id) {
      var participants = (this.model && this.model.participants) || [];
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].id === id) return true;
      }
      return false;
    },

    _nextAvailableNodeId: function () {
      var candidate = '';
      do {
        this.nodeCounter++;
        candidate = 'N' + this.nodeCounter;
        // model 파싱 결과와 raw script 둘 다에 없는 ID가 나올 때까지 올린다.
      } while (this._scriptContainsId(candidate) || this._modelContainsNodeId(candidate));
      return candidate;
    },

    _nextAvailableParticipantId: function () {
      var candidate = '';
      do {
        this.participantCounter++;
        candidate = 'P' + this.participantCounter;
        // unsupported 문법으로 participant 파싱이 빠져도 ID 충돌은 피한다.
      } while (this._scriptContainsId(candidate) || this._modelContainsParticipantId(candidate));
      return candidate;
    },

    // ── GUI 액션 ─────────────────────────────────────────────────

    addNode: function (shape) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodeShape = shape;
      var nodeText = 'Node';
      var nodeFill = '';

      if (shape && typeof shape === 'object') {
        nodeShape = shape.shape;
        nodeText = shape.text || nodeText;
        nodeFill = shape.fill || '';
      }

      if (!nodeShape) nodeShape = 'rect';
      var newId   = this._nextAvailableNodeId();
      var newNode = { id: newId, text: nodeText, shape: nodeShape };
      if (nodeFill) newNode.fill = nodeFill;
      var nodes   = this.model.nodes.slice();
      nodes.push(newNode);
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
      this._schedulePreviewFit();
    },

    addEdge: function (data) {
      if (!this.isFlowchart) return;
      var edges = this.model.edges;
      if (data.from === data.to) {
        for (var i = 0; i < edges.length; i++) {
          if (edges[i].from === data.from && edges[i].to === data.to) return;
        }
      }
      this._snapshot();
      var newEdges = edges.slice();
      newEdges.push({ from: data.from, to: data.to, text: '', type: '-->' });
      this.model = Object.assign({}, this.model, { edges: newEdges });
      this.updateScriptFromModel();
    },

    addSequenceParticipant: function () {
      if (this.isFlowchart) return;
      this._snapshot();
      var id = this._nextAvailableParticipantId();
      var participants = (this.model.participants || []).slice();
      participants.push({ id: id, label: 'Participant ' + this.participantCounter, kind: 'participant' });
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceActor: function () {
      if (this.isFlowchart) return;
      this._snapshot();
      var id = this._nextAvailableParticipantId();
      var participants = (this.model.participants || []).slice();
      participants.push({ id: id, label: 'Actor ' + this.participantCounter, kind: 'actor' });
      this._updateSequenceModel({ participants: participants });
    },

    toggleParticipantKind: function (data) {
      if (this.isFlowchart) return;
      this._snapshot();
      var participants = (this.model.participants || []).map(function (p) {
        if (p.id !== data.participantId) return p;
        return Object.assign({}, p, { kind: p.kind === 'actor' ? 'participant' : 'actor' });
      });
      this._updateSequenceModel({ participants: participants });
    },

    moveSequenceParticipant: function (data) {
      if (this.isFlowchart) return;
      var participants = (this.model.participants || []).slice();
      var idx = -1;
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].id === data.participantId) { idx = i; break; }
      }
      if (idx === -1) return;
      var swapIdx = data.direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= participants.length) return;
      this._snapshot();
      var tmp = participants[idx];
      participants[idx] = participants[swapIdx];
      participants[swapIdx] = tmp;
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceMessage: function (payload) {
      if (this.isFlowchart) return;
      var participants = this.model.participants || [];
      if (!participants.length) return;

      this._snapshot();
      var fromId = participants[0].id;
      var toId = participants[Math.min(1, participants.length - 1)].id;
      var messageText = 'Message';

      if (payload && payload.fromId) fromId = payload.fromId;
      if (payload && payload.toId) toId = payload.toId;
      if (payload && payload.text) messageText = payload.text;

      if (payload && payload.participantId && !payload.fromId) {
        fromId = payload.participantId;
        for (var i = 0; i < participants.length; i++) {
          if (participants[i].id === payload.participantId) {
            toId = participants[(i + 1) % participants.length].id;
            break;
          }
        }
      }

      var messages = (this.model.messages || []).slice();
      var insertAt = messages.length;
      if (payload && payload.insertIndex !== null && payload.insertIndex !== undefined) {
        insertAt = Math.max(0, Math.min(messages.length, payload.insertIndex));
      } else if (payload && payload.afterIndex !== null && payload.afterIndex !== undefined) {
        insertAt = Math.min(messages.length, payload.afterIndex + 1);
      }

      messages.splice(insertAt, 0, {
        from: fromId,
        to: toId,
        operator: '->>',
        text: messageText
      });

      this._updateSequenceModel({ messages: messages });
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
      } else if (!this.isFlowchart && data.sequenceParticipantId) {
        var participants = (this.model.participants || []).filter(function (p) {
          return p.id !== data.sequenceParticipantId;
        });
        var messages = (this.model.messages || []).filter(function (m) {
          return m.from !== data.sequenceParticipantId && m.to !== data.sequenceParticipantId;
        });
        this._updateSequenceModel({
          participants: participants,
          messages: messages
        });
      } else if (!this.isFlowchart && data.sequenceMessageIndex !== null && data.sequenceMessageIndex !== undefined) {
        var mc = (this.model.messages || []).slice();
        mc.splice(data.sequenceMessageIndex, 1);
        this._updateSequenceModel({ messages: mc });
      } else {
        return;
      }

      this.selectedNode = '';
      this.selectedEdge = null;
      this.selectedSequenceParticipant = '';
      this.selectedSequenceMessage = null;
      if (this.isFlowchart) {
        this.updateScriptFromModel();
      }
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

    updateNodeStyle: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodes = this.model.nodes.map(function (n) {
        if (n.id !== data.nodeId) return n;
        return Object.assign({}, n, {
          text: data.text,
          fill: data.fill
        });
      });
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel();
    },

    updateNodeFill: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodes = this.model.nodes.map(function (n) {
        if (n.id !== data.nodeId) return n;
        return Object.assign({}, n, { fill: data.fill });
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

    updateEdgeType: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var edges = this.model.edges.map(function (e, idx) {
        return idx !== data.index ? e : Object.assign({}, e, { type: data.type });
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    updateEdgeStyle: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var edges = this.model.edges.map(function (e, idx) {
        if (idx !== data.index) return e;
        return Object.assign({}, e, {
          text: data.text,
          color: data.color
        });
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    updateEdgeColor: function (data) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var edges = this.model.edges.map(function (e, idx) {
        if (idx !== data.index) return e;
        return Object.assign({}, e, { color: data.color });
      });
      this.model = Object.assign({}, this.model, { edges: edges });
      this.updateScriptFromModel();
    },

    changeDirection: function (dir) {
      if (!this.isFlowchart) return;
      this._snapshot();
      this.model = Object.assign({}, this.model, { direction: dir });
      this.updateScriptFromModel();
      this._schedulePreviewFit();
    },

    updateSequenceParticipantText: function (data) {
      if (this.isFlowchart) return;
      this._snapshot();
      var participants = (this.model.participants || []).map(function (p) {
        return p.id === data.participantId ? Object.assign({}, p, { label: data.text }) : p;
      });
      this._updateSequenceModel({ participants: participants });
    },

    updateSequenceMessageText: function (data) {
      if (this.isFlowchart) return;
      this._snapshot();
      var messages = (this.model.messages || []).map(function (m, idx) {
        return idx === data.index ? Object.assign({}, m, { text: data.text }) : m;
      });
      this._updateSequenceModel({ messages: messages });
    },

    reverseSequenceMessage: function (index) {
      if (this.isFlowchart) return;
      this._snapshot();
      var messages = (this.model.messages || []).map(function (m, idx) {
        if (idx !== index) return m;
        return Object.assign({}, m, { from: m.to, to: m.from });
      });
      this._updateSequenceModel({ messages: messages });
    },

    toggleAutonumber: function () {
      if (this.isFlowchart) return;
      this._snapshot();
      this._updateSequenceModel({ autonumber: !this.model.autonumber });
    },

    toggleSequenceMessageLineType: function (index) {
      if (this.isFlowchart) return;
      this._snapshot();
      var messages = (this.model.messages || []).map(function (m, idx) {
        if (idx !== index) return m;
        return Object.assign({}, m, {
          operator: SequenceSvgHandler.toggleMessageLineType(m)
        });
      });
      this._updateSequenceModel({ messages: messages });
    },

    setSequenceMessageLineType: function (data) {
      if (this.isFlowchart) return;
      this._snapshot();
      var messages = (this.model.messages || []).map(function (m, idx) {
        if (idx !== data.index) return m;
        // activation suffix(+/-) 보존
        var suffix = /[+-]$/.test(m.operator || '') ? m.operator.slice(-1) : '';
        return Object.assign({}, m, { operator: data.operator + suffix });
      });
      this._updateSequenceModel({ messages: messages });
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

    onSequenceParticipantSelected: function (participantId) {
      this.selectedSequenceParticipant = participantId;
      this.selectedSequenceMessage = null;
    },

    onSequenceMessageSelected: function (messageIndex) {
      this.selectedSequenceMessage = (this.model.messages || [])[messageIndex] || null;
      this.selectedSequenceParticipant = '';
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

    _runExport: function (promise, successMsg) {
      var self = this;
      return promise
        .then(function () {
          self.showToast(successMsg, 'success');
        })
        .catch(function () {
          self.showToast('Export failed', 'error');
        });
    },

    getSvgElement: function () {
      var preview = this.$refs.preview;
      if (!preview || !preview.$refs) return null;
      var canvas = preview.$refs.canvas;
      if (!canvas) return null;
      return canvas.querySelector('svg');
    },

    getSvgText: function () {
      var preview = this.$refs.preview;
      if (preview && preview.svgContent) {
        return preview.svgContent;
      }
      var svgEl = this.getSvgElement();
      if (svgEl) {
        return new XMLSerializer().serializeToString(svgEl);
      }
      return '';
    },

    exportSvg: function () {
      var svgStr = this.getSvgText();
      if (!svgStr) return;
      return this._runExport(
        SvgExport.exportSvg(svgStr, { filename: 'diagram.svg' }),
        'SVG exported!'
      );
    },

    exportPng: function () {
      var svgStr = this.getSvgText();
      if (!svgStr) return;
      return this._runExport(
        SvgExport.exportPng(svgStr, { filename: 'diagram.png', scale: 2, padding: 20 }),
        'PNG exported!'
      );
    },

    exportJpg: function () {
      var svgStr = this.getSvgText();
      if (!svgStr) return;
      return this._runExport(
        SvgExport.exportJpg(svgStr, { filename: 'diagram.jpg', scale: 2, padding: 20, quality: 0.92 }),
        'JPG exported!'
      );
    },

    copySvg: function () {
      var svgStr = this.getSvgText();
      if (!svgStr) return;
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
    <div class="live-editor-shell">\
      <div class="app-header">\
        <div class="app-header__left">\
          <div class="app-header__logo">\
            <div class="app-header__icon">S/</div>\
            <span class="app-header__title">SureFlow Editor</span>\
          </div>\
          <nav class="app-header__nav">\
            <span class="app-header__nav-item app-header__nav-item--active">Diagram</span>\
          </nav>\
        </div>\
        <div class="app-header__right">\
          <span class="app-header__badge">Vue 2</span>\
        </div>\
      </div>\
      <div class="editor-container" ref="container">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          :diagram-type="model.type"\
          @input="onScriptChange"\
        ></mermaid-editor>\
        <div class="panel panel--preview">\
          <!-- 상단 toolbar는 preview 네비게이션과 편집 액션을 묶는다. -->\
          <mermaid-toolbar\
            :diagram-type="model.type"\
            :direction="model.direction"\
            :can-undo="canUndo"\
            :can-redo="canRedo"\
            :autonumber="!!model.autonumber"\
            @add-node="addNode"\
            @add-sequence-participant="addSequenceParticipant"\
            @add-sequence-actor="addSequenceActor"\
            @add-sequence-message="addSequenceMessage"\
            @toggle-autonumber="toggleAutonumber"\
            @undo="undo"\
            @redo="redo"\
            @change-direction="changeDirection"\
            @zoom-in="zoomIn"\
            @zoom-out="zoomOut"\
            @fit-view="fitView"\
            @copy-svg="copySvg"\
            @export-png="exportPng"\
            @export-svg="exportSvg"\
            @export-jpg="exportJpg"\
          ></mermaid-toolbar>\
          <mermaid-preview\
            ref="preview"\
            :model="model"\
            @add-node="addNode"\
            @add-edge="addEdge"\
            @add-sequence-message="addSequenceMessage"\
            @delete-selected="deleteSelected"\
            @update-node-text="updateNodeText"\
            @update-node-shape="updateNodeShape"\
            @update-edge-text="updateEdgeText"\
            @update-edge-type="updateEdgeType"\
            @update-node-style="updateNodeStyle"\
            @update-edge-style="updateEdgeStyle"\
            @update-node-fill="updateNodeFill"\
            @update-edge-color="updateEdgeColor"\
            @update-sequence-participant-text="updateSequenceParticipantText"\
            @update-sequence-message-text="updateSequenceMessageText"\
            @reverse-sequence-message="reverseSequenceMessage"\
            @toggle-sequence-message-line-type="toggleSequenceMessageLineType"\
            @set-sequence-message-line-type="setSequenceMessageLineType"\
            @toggle-participant-kind="toggleParticipantKind"\
            @move-sequence-participant="moveSequenceParticipant"\
            @node-selected="onNodeSelected"\
            @edge-selected="onEdgeSelected"\
            @sequence-participant-selected="onSequenceParticipantSelected"\
            @sequence-message-selected="onSequenceMessageSelected"\
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
