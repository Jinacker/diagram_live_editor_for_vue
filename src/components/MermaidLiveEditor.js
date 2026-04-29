/**
 * MermaidLiveEditor 컴포넌트
 * script ↔ model 양방향 동기화와 undo/redo, autosave를 담당하는 최상위 상태 컨테이너
 */

Vue.component('mermaid-live-editor', {
  mixins: [flowchartActionsMixin, sequenceActionsMixin, exportMixin, toastMixin],

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

      // mounted에서 생성되는 IdAllocator 인스턴스 (N* / P* 충돌 없는 ID 할당)
      nodeIdAllocator: null,
      participantIdAllocator: null,

      resizing:    false,
      editorWidth: 38,

      // mounted에서 생성되는 HistoryManager 인스턴스
      history: null,

      // 토스트 상태는 toastMixin에서 제공 (toastMsg / toastVisible / _toastTimer)
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
    this.nodeIdAllocator = new IdAllocator('N');
    this.participantIdAllocator = new IdAllocator('P');

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
      self._seedIdAllocators();
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

    _notifyNewNode: function (nodeId) {
      if (this.$refs.preview) this.$refs.preview.highlightNewNode(nodeId);
    },

    _notifyNewParticipant: function (participantId) {
      if (this.$refs.preview) this.$refs.preview.highlightNewParticipant(participantId);
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
        this.parseWarning = ModelDiagnostics.reservedIdWarning(this.script, parsed);
      } catch (e) {
        this.error = e.message || 'Parse error';
        this.parseWarning = '';
      }
      this._seedIdAllocators();
    },

    // ── Model → Script ────────────────────────────────────────────
    updateScriptFromModel: function () {
      // model 변경은 항상 script까지 다시 직렬화해서 양쪽 상태를 맞춘다.
      this.syncSource = 'gui';
      this.script     = MermaidGenerator.generate(this.model);
      try {
        var parsed = MermaidParser.parse(this.script);
        this.error = '';
        this.parseWarning = ModelDiagnostics.reservedIdWarning(this.script, parsed);
      } catch (e) {
        this.error = e.message || 'Parse error';
        this.parseWarning = '';
      }
    },

    _seedIdAllocators: function () {
      if (this.nodeIdAllocator) {
        this.nodeIdAllocator.seed(this.script, (this.model && this.model.nodes) || []);
      }
      if (this.participantIdAllocator) {
        this.participantIdAllocator.seed(this.script, (this.model && this.model.participants) || []);
      }
    },

    // ── GUI 액션 ─────────────────────────────────────────────────

    // deleteSelected dispatcher — flowchart / sequence 분기를 각 믹스인 헬퍼로 위임
    deleteSelected: function (data) {
      if (!data) return;
      this._snapshot();
      var handled = this.isFlowchart
        ? this._deleteFlowchartSelection(data)
        : this._deleteSequenceSelection(data);
      if (!handled) return;

      this.selectedNode = '';
      this.selectedEdge = null;
      this.selectedSequenceParticipant = '';
      this.selectedSequenceMessage = null;
      if (this.isFlowchart) {
        this.updateScriptFromModel();
      }
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

    // export / copy는 exportMixin에서 제공
    // toast(showToast)는 toastMixin에서 제공

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
          :warning="parseWarning"\
          :highlight-targets="(model.diagnostics && model.diagnostics.rawTargets) || []"\
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
            @add-sequence-branch="addSequenceBranch"\
            @wrap-sequence-messages-in-block="wrapSequenceMessagesInBlock"\
            @update-sequence-block-text="updateSequenceBlockText"\
            @update-sequence-branch-text="updateSequenceBranchText"\
            @change-sequence-block-type="changeSequenceBlockType"\
            @create-sequence-note="addSequenceNote"\
            @update-sequence-note-text="updateSequenceNoteText"\
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
