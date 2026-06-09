/**
 * previewInlineEditMixin
 * MermaidPreview의 인라인 편집 메서드를 동작 변경 없이 분리한 mixin.
 */
(function (global) {
  'use strict';

  global.previewInlineEditMixin = {
    methods: {
    _confirmActiveEdits: function () {
      if (this.editingNodeId) this.confirmNodeEdit();
      if (this.editingEdgeIndex !== null) this.confirmEdgeEdit();
      if (this.editingSequenceParticipantId) this.confirmSequenceParticipantEdit();
      if (this.editingSequenceMessageIndex !== null) this.confirmSequenceMessageEdit();
      if (this.editingSequenceBlockId !== null || this.editingSequenceBranchStatementIndex !== null) this.confirmSequenceBlockEdit();
      if (this.editingSequenceNoteStatementIndex !== null) this.confirmSequenceNoteEdit();
    },

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
    }
  };

})(typeof window !== 'undefined' ? window : this);
