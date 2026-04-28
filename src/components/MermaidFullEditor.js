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
  mixins: [flowchartActionsMixin, sequenceActionsMixin, exportMixin, toastMixin],

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

      // mounted에서 생성되는 IdAllocator 인스턴스 (N* / P* 충돌 없는 ID 할당)
      nodeIdAllocator: null,
      participantIdAllocator: null,

      history: null,
      fullScreen: false
      // 토스트 상태는 toastMixin에서 제공
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
    },
    fullScreen: function () {
      var self = this;
      this.$nextTick(function () { self.fitView(); });
    }
  },

  mounted: function () {
    this.history = new HistoryManager();
    this.nodeIdAllocator = new IdAllocator('N');
    this.participantIdAllocator = new IdAllocator('P');
    if (this.script) {
      this.parseScript();
    }
    var self = this;
    this.$nextTick(function () {
      self._seedIdAllocators();
    });
    window.addEventListener('popstate', this._onPopState);
  },

  beforeDestroy: function () {
    window.removeEventListener('popstate', this._onPopState);
    if (this.fullScreen) history.back();
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


    _snapshot: function () { if (this.history) this.history.snapshot(this.model); },

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

    updateScriptFromModel: function () {
      this.script = MermaidGenerator.generate(this.model);
      this.error  = '';
    },

    _seedIdAllocators: function () {
      if (this.nodeIdAllocator) {
        this.nodeIdAllocator.seed(this.script, (this.model && this.model.nodes) || []);
      }
      if (this.participantIdAllocator) {
        this.participantIdAllocator.seed(this.script, (this.model && this.model.participants) || []);
      }
    },

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

    undo: function () { if (!this.history) return; var prev = this.history.undo(this.model); if (!prev) return; this.model = prev; this.script = MermaidGenerator.generate(this.model); },
    redo: function () { if (!this.history) return; var next = this.history.redo(this.model); if (!next) return; this.model = next; this.script = MermaidGenerator.generate(this.model); },

    onNodeSelected:                function (id)    { this.selectedNode = id; this.selectedEdge = null; },
    onEdgeSelected:                function (idx)   { this.selectedEdge = this.model.edges[idx] || null; this.selectedNode = ''; },
    onSequenceParticipantSelected: function (id)    { this.selectedSequenceParticipant = id; this.selectedSequenceMessage = null; },
    onSequenceMessageSelected:     function (idx)   { this.selectedSequenceMessage = (this.model.messages || [])[idx] || null; this.selectedSequenceParticipant = ''; },

    fitView:  function () { if (this.$refs.preview) this.$refs.preview.fitView(); },
    zoomIn:   function () { if (this.$refs.preview) this.$refs.preview.zoomIn(); },
    zoomOut:  function () { if (this.$refs.preview) this.$refs.preview.zoomOut(); },

    toggleFullscreen: function () {
      if (!this.fullScreen) {
        this.fullScreen = true;
        history.pushState({ guiEditorFullscreen: true }, '');
      } else {
        this.fullScreen = false;
        history.back();
      }
    },

    _onPopState: function () {
      if (this.fullScreen) this.fullScreen = false;
    }

    // flowchart/sequence 액션, export/copy, toast는 모두 믹스인에서 제공
  },

  template: '\
    <div class="gui-editor-shell" :class="{ \'gui-editor-shell--fullscreen\': fullScreen }">\
      <div v-if="!fullScreen" class="gui-editor-shell__editor-pane">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          :warning="parseWarning"\
          :highlight-targets="(model.diagnostics && model.diagnostics.rawTargets) || []"\
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
          :full-screen="fullScreen"\
          @toggle-fullscreen="toggleFullscreen"\
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
          @svg-rendered="$emit(\'svg-rendered\', $event)"\
        ></mermaid-preview>\
      </div>\
      <div\
        class="gui-editor-toast"\
        :class="[toastVisible ? \'gui-editor-toast--visible\' : \'\']"\
      >{{ toastMsg }}</div>\
    </div>\
  '
});
