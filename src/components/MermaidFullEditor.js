/**
 * MermaidFullEditor — 임베드용 올인원 컴포넌트
 * MermaidEditor(텍스트) + MermaidToolbar + MermaidPreview를 하나로 묶음.
 * 부모와 v-model(:value + @input)으로 diagram 문자열을 양방향 동기화한다.
 *
 * 사용법:
 *   <mermaid-full-editor :value="myDiagram" @input="myDiagram = $event">
 *   </mermaid-full-editor>
 */

Vue.component('mermaid-full-editor', {
  props: {
    value: { type: String, default: '' }
  },

  data: function () {
    return {
      script: this.value || '',
      model:  { type: 'flowchart', direction: 'TD', nodes: [], edges: [] },
      error:  '',
      parseWarning: '',

      selectedNode: '',
      selectedEdge: null,
      selectedSequenceParticipant: '',
      selectedSequenceMessage: null,
      nodeCounter:  0,
      participantCounter: 0,

      history: null,

      toastMsg:     '',
      toastVisible: false,
      _toastTimer:  null
    };
  },

  computed: {
    canUndo:     function () { return !!(this.history && this.history.canUndo()); },
    canRedo:     function () { return !!(this.history && this.history.canRedo()); },
    isFlowchart: function () { return !!this.model && this.model.type !== 'sequenceDiagram'; }
  },

  watch: {
    // 부모 → 컴포넌트 동기화
    value: function (newVal) {
      if (newVal !== this.script) {
        this.script = newVal;
        this.parseScript();
      }
    },
    // 컴포넌트 → 부모 동기화
    script: function (newVal) {
      this.$emit('input', newVal);
    }
  },

  mounted: function () {
    this.history = new HistoryManager();
    if (this.script) {
      this.parseScript();
    }
    var self = this;
    this.$nextTick(function () {
      self.updateNodeCounter();
      self.updateParticipantCounter();
    });
  },

  methods: {

    // ── 텍스트 에디터에서 편집 ──────────────────────────────────────
    onScriptChange: function (newScript) {
      this.script = newScript;
      this._schedulePreviewFit();
      this.parseScript();
    },

    _schedulePreviewFit: function () {
      if (this.$refs.preview) this.$refs.preview.scheduleFit();
    },

    _normalizeSequenceMessages: function (messages) {
      var result = [];
      var activeCounts = {};
      var splitOperator = function (operator) {
        var suffix = '', base = operator || '->>';
        if (/[+-]$/.test(base)) { suffix = base.slice(-1); base = base.slice(0, -1); }
        return { base: base, suffix: suffix };
      };
      for (var i = 0; i < messages.length; i++) {
        var msg = Object.assign({}, messages[i]);
        var parts = splitOperator(msg.operator);
        if (parts.suffix === '+') { activeCounts[msg.to] = (activeCounts[msg.to] || 0) + 1; }
        if (parts.suffix === '-') {
          if (activeCounts[msg.from] > 0) { activeCounts[msg.from]--; }
          else { msg.operator = parts.base; }
        }
        result.push(msg);
      }
      return result;
    },

    _updateSequenceModel: function (patch) {
      var nextModel = Object.assign({}, this.model, patch);
      nextModel.explicitParticipants = true;
      if (nextModel.messages) { nextModel.messages = this._normalizeSequenceMessages(nextModel.messages); }
      this.model = nextModel;
      this.updateScriptFromModel();
    },

    _snapshot: function () { if (this.history) this.history.snapshot(this.model); },

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

    updateScriptFromModel: function () {
      this.script = MermaidGenerator.generate(this.model);
      this.error  = '';
    },

    updateNodeCounter: function () {
      // parser가 일부 문법을 놓쳐도 script 안에 이미 있는 N숫자 ID는 예약된 것으로 본다.
      var max = this._scanReservedCounter('N');
      if (this.model && this.model.nodes) {
        for (var i = 0; i < this.model.nodes.length; i++) {
          var nm = this.model.nodes[i].id.match(/(\d+)$/);
          if (nm) { var n = parseInt(nm[1], 10); if (n > max) max = n; }
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

    addNode: function (shape) {
      if (!this.isFlowchart) return;
      this._snapshot();
      var nodeShape = shape, nodeText = 'Node', nodeFill = '';
      if (shape && typeof shape === 'object') { nodeShape = shape.shape; nodeText = shape.text || nodeText; nodeFill = shape.fill || ''; }
      if (!nodeShape) nodeShape = 'rect';
      var newNode = { id: this._nextAvailableNodeId(), text: nodeText, shape: nodeShape };
      if (nodeFill) newNode.fill = nodeFill;
      var nodes = this.model.nodes.slice(); nodes.push(newNode);
      this.model = Object.assign({}, this.model, { nodes: nodes });
      this.updateScriptFromModel(); this._schedulePreviewFit();
    },

    addEdge: function (data) {
      if (!this.isFlowchart) return;
      var edges = this.model.edges;
      if (data.from === data.to) {
        for (var i = 0; i < edges.length; i++) { if (edges[i].from === data.from && edges[i].to === data.to) return; }
      }
      this._snapshot();
      var newEdges = edges.slice(); newEdges.push({ from: data.from, to: data.to, text: '', type: '-->' });
      this.model = Object.assign({}, this.model, { edges: newEdges }); this.updateScriptFromModel();
    },

    addSequenceParticipant: function () {
      if (this.isFlowchart) return; this._snapshot();
      var participants = (this.model.participants || []).slice();
      var participantId = this._nextAvailableParticipantId();
      participants.push({ id: participantId, label: 'Participant ' + this.participantCounter, kind: 'participant' });
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceActor: function () {
      if (this.isFlowchart) return; this._snapshot();
      var participants = (this.model.participants || []).slice();
      var actorId = this._nextAvailableParticipantId();
      participants.push({ id: actorId, label: 'Actor ' + this.participantCounter, kind: 'actor' });
      this._updateSequenceModel({ participants: participants });
    },

    toggleParticipantKind: function (data) {
      if (this.isFlowchart) return; this._snapshot();
      var participants = (this.model.participants || []).map(function (p) {
        return p.id !== data.participantId ? p : Object.assign({}, p, { kind: p.kind === 'actor' ? 'participant' : 'actor' });
      });
      this._updateSequenceModel({ participants: participants });
    },

    moveSequenceParticipant: function (data) {
      if (this.isFlowchart) return;
      var participants = (this.model.participants || []).slice(), idx = -1;
      for (var i = 0; i < participants.length; i++) { if (participants[i].id === data.participantId) { idx = i; break; } }
      if (idx === -1) return;
      var swapIdx = data.direction === 'left' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= participants.length) return;
      this._snapshot();
      var tmp = participants[idx]; participants[idx] = participants[swapIdx]; participants[swapIdx] = tmp;
      this._updateSequenceModel({ participants: participants });
    },

    addSequenceMessage: function (payload) {
      if (this.isFlowchart) return;
      var participants = this.model.participants || []; if (!participants.length) return;
      this._snapshot();
      var fromId = participants[0].id, toId = participants[Math.min(1, participants.length - 1)].id, messageText = 'Message';
      if (payload && payload.fromId) fromId = payload.fromId;
      if (payload && payload.toId)   toId   = payload.toId;
      if (payload && payload.text)   messageText = payload.text;
      if (payload && payload.participantId && !payload.fromId) {
        fromId = payload.participantId;
        for (var i = 0; i < participants.length; i++) {
          if (participants[i].id === payload.participantId) { toId = participants[(i + 1) % participants.length].id; break; }
        }
      }
      var messages = (this.model.messages || []).slice();
      var insertAt = messages.length;
      if (payload && payload.insertIndex != null) insertAt = Math.max(0, Math.min(messages.length, payload.insertIndex));
      else if (payload && payload.afterIndex != null) insertAt = Math.min(messages.length, payload.afterIndex + 1);
      messages.splice(insertAt, 0, { from: fromId, to: toId, operator: '->>', text: messageText });
      this._updateSequenceModel({ messages: messages });
    },

    deleteSelected: function (data) {
      if (!data) return; this._snapshot();
      if (this.isFlowchart && data.nodeId) {
        var nodes = this.model.nodes.filter(function (n) { return n.id !== data.nodeId; });
        var edges = this.model.edges.filter(function (e) { return e.from !== data.nodeId && e.to !== data.nodeId; });
        this.model = Object.assign({}, this.model, { nodes: nodes, edges: edges });
      } else if (this.isFlowchart && data.edgeIndex != null) {
        var ec = this.model.edges.slice(); ec.splice(data.edgeIndex, 1);
        this.model = Object.assign({}, this.model, { edges: ec });
      } else if (!this.isFlowchart && data.sequenceParticipantId) {
        var pts  = (this.model.participants || []).filter(function (p) { return p.id !== data.sequenceParticipantId; });
        var msgs = (this.model.messages   || []).filter(function (m) { return m.from !== data.sequenceParticipantId && m.to !== data.sequenceParticipantId; });
        this._updateSequenceModel({ participants: pts, messages: msgs }); return;
      } else if (!this.isFlowchart && data.sequenceMessageIndex != null) {
        var mc = (this.model.messages || []).slice(); mc.splice(data.sequenceMessageIndex, 1);
        this._updateSequenceModel({ messages: mc }); return;
      } else { return; }
      this.selectedNode = ''; this.selectedEdge = null;
      this.selectedSequenceParticipant = ''; this.selectedSequenceMessage = null;
      if (this.isFlowchart) this.updateScriptFromModel();
    },

    updateNodeText:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id === data.nodeId ? Object.assign({}, n, { text: data.text }) : n; }) }); this.updateScriptFromModel(); },
    updateNodeShape: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id === data.nodeId ? Object.assign({}, n, { shape: data.shape }) : n; }) }); this.updateScriptFromModel(); },
    updateNodeStyle: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id !== data.nodeId ? n : Object.assign({}, n, { text: data.text, fill: data.fill }); }) }); this.updateScriptFromModel(); },
    updateNodeFill:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { nodes: this.model.nodes.map(function (n) { return n.id !== data.nodeId ? n : Object.assign({}, n, { fill: data.fill }); }) }); this.updateScriptFromModel(); },
    updateEdgeText:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i === data.index ? Object.assign({}, e, { text: data.text }) : e; }) }); this.updateScriptFromModel(); },
    updateEdgeType:  function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i !== data.index ? e : Object.assign({}, e, { type: data.type }); }) }); this.updateScriptFromModel(); },
    updateEdgeStyle: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i !== data.index ? e : Object.assign({}, e, { text: data.text, color: data.color }); }) }); this.updateScriptFromModel(); },
    updateEdgeColor: function (data) { if (!this.isFlowchart) return; this._snapshot(); this.model = Object.assign({}, this.model, { edges: this.model.edges.map(function (e, i) { return i !== data.index ? e : Object.assign({}, e, { color: data.color }); }) }); this.updateScriptFromModel(); },

    changeDirection: function (dir) {
      if (!this.isFlowchart) return; this._snapshot();
      this.model = Object.assign({}, this.model, { direction: dir });
      this.updateScriptFromModel(); this._schedulePreviewFit();
    },

    updateSequenceParticipantText: function (data) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ participants: (this.model.participants || []).map(function (p) { return p.id === data.participantId ? Object.assign({}, p, { label: data.text }) : p; }) }); },
    updateSequenceMessageText:     function (data) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i === data.index ? Object.assign({}, m, { text: data.text }) : m; }) }); },
    reverseSequenceMessage:        function (index) { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i !== index ? m : Object.assign({}, m, { from: m.to, to: m.from }); }) }); },
    toggleAutonumber:              function ()      { if (this.isFlowchart) return; this._snapshot(); this._updateSequenceModel({ autonumber: !this.model.autonumber }); },

    toggleSequenceMessageLineType: function (index) {
      if (this.isFlowchart) return; this._snapshot();
      this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) { return i !== index ? m : Object.assign({}, m, { operator: SequenceSvgHandler.toggleMessageLineType(m) }); }) });
    },
    setSequenceMessageLineType: function (data) {
      if (this.isFlowchart) return; this._snapshot();
      this._updateSequenceModel({ messages: (this.model.messages || []).map(function (m, i) {
        if (i !== data.index) return m;
        var suffix = /[+-]$/.test(m.operator || '') ? m.operator.slice(-1) : '';
        return Object.assign({}, m, { operator: data.operator + suffix });
      }) });
    },

    undo: function () { if (!this.history) return; var prev = this.history.undo(this.model); if (!prev) return; this.model = prev; this.script = MermaidGenerator.generate(this.model); },
    redo: function () { if (!this.history) return; var next = this.history.redo(this.model); if (!next) return; this.model = next; this.script = MermaidGenerator.generate(this.model); },

    onNodeSelected:                function (id)    { this.selectedNode = id; this.selectedEdge = null; },
    onEdgeSelected:                function (idx)   { this.selectedEdge = this.model.edges[idx] || null; this.selectedNode = ''; },
    onSequenceParticipantSelected: function (id)    { this.selectedSequenceParticipant = id; this.selectedSequenceMessage = null; },
    onSequenceMessageSelected:     function (idx)   { this.selectedSequenceMessage = (this.model.messages || [])[idx] || null; this.selectedSequenceParticipant = ''; },

    fitView:  function () { if (this.$refs.preview) this.$refs.preview.fitView(); },
    zoomIn:   function () { if (this.$refs.preview) this.$refs.preview.zoomIn(); },
    zoomOut:  function () { if (this.$refs.preview) this.$refs.preview.zoomOut(); },

    _runExport: function (promise, successMsg) {
      var self = this;
      return promise
        .then(function () {
          self.showToast(successMsg);
        })
        .catch(function () {
          self.showToast('Export failed');
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
      var svgStr=this.getSvgText(), self=this;
      if(!svgStr) return;
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(svgStr).then(function(){self.showToast('SVG copied!');}).catch(function(){self._fallbackCopy(svgStr);});}else{this._fallbackCopy(svgStr);}
    },
    _fallbackCopy: function (text) {
      var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.top='-9999px';document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');this.showToast('SVG copied!');}catch(e){this.showToast('Copy failed');}
      document.body.removeChild(ta);
    },

    showToast: function (msg) {
      var self=this; this.toastMsg=msg; this.toastVisible=true;
      clearTimeout(this._toastTimer);
      this._toastTimer=setTimeout(function(){self.toastVisible=false;},2800);
    }
  },

  template: '\
    <div class="gui-editor-shell">\
      <div class="gui-editor-shell__editor-pane">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          :warning="parseWarning"\
          :diagram-type="model.type"\
          @input="onScriptChange"\
        ></mermaid-editor>\
      </div>\
      <div class="gui-editor-shell__preview-pane">\
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
      <div\
        class="gui-editor-toast"\
        :class="[toastVisible ? \'gui-editor-toast--visible\' : \'\']"\
      >{{ toastMsg }}</div>\
    </div>\
  '
});
