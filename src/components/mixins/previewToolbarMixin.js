/**
 * previewToolbarMixin
 * MermaidPreview의 플로우 엣지/시퀀스 툴바 메서드를 동작 변경 없이 분리한 mixin.
 */
(function (global) {
  'use strict';

  global.previewToolbarMixin = {
    methods: {
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
    }
  };

})(typeof window !== 'undefined' ? window : this);
