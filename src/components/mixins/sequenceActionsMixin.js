/**
 * sequenceActionsMixin
 * Container component가 sequenceModelEditing을 사용할 수 있도록 감싼 얇은 wrapper.
 * flowchartActionsMixin과 세트로 사용한다.
 *
 * 호출부 요구사항:
 *   - data: model (type, participants, messages, autonumber)
 *   - data: participantIdAllocator (IdAllocator 인스턴스)
 *   - data: script
 *   - methods: _snapshot, updateScriptFromModel
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, sequence 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.sequenceActionsMixin = {
    methods: {
      _applySequenceEdit: function (nextModel) {
        if (!nextModel || nextModel === this.model) return false;
        this._snapshot();
        this.model = nextModel;
        this.updateScriptFromModel();
        return true;
      },

      addSequenceParticipant: function () {
        if (this.isFlowchart) return;
        var newId = this.participantIdAllocator.next(this.script, this.model.participants);
        var applied = this._applySequenceEdit(sequenceModelEditing.addParticipant(this.model, {
          id: newId,
          label: 'Participant ' + this.participantIdAllocator.counter,
          kind: 'participant'
        }));
        if (applied) this._notifyNewParticipant(newId);
      },

      addSequenceActor: function () {
        if (this.isFlowchart) return;
        var newId = this.participantIdAllocator.next(this.script, this.model.participants);
        var applied = this._applySequenceEdit(sequenceModelEditing.addParticipant(this.model, {
          id: newId,
          label: 'Actor ' + this.participantIdAllocator.counter,
          kind: 'actor'
        }));
        if (applied) this._notifyNewParticipant(newId);
      },

      toggleParticipantKind: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleParticipantKind(this.model, data));
      },

      moveSequenceParticipant: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.moveParticipant(this.model, data));
      },

      addSequenceMessage: function (payload) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.addMessage(this.model, payload));
      },

      updateSequenceParticipantText: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.updateParticipantText(this.model, data));
      },

      updateSequenceMessageText: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.updateMessageText(this.model, data));
      },

      reverseSequenceMessage: function (index) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.reverseMessage(this.model, index));
      },

      toggleAutonumber: function () {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleAutonumber(this.model));
      },

      toggleSequenceMessageLineType: function (index) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleMessageLineType(this.model, index));
      },

      setSequenceMessageLineType: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.setMessageLineType(this.model, data));
      },

      addSequenceBranch: function (data) {
        if (this.isFlowchart || !data || !data.keyword) return;
        var hasMessages = data.messageIndices && data.messageIndices.length;
        var hasNotes = data.noteStatementIndices && data.noteStatementIndices.length;
        if (!hasMessages && !hasNotes) return;
        this._applySequenceEdit(sequenceModelEditing.addBranch(this.model, data));
      },

      wrapSequenceMessagesInBlock: function (data) {
        if (this.isFlowchart || !data || !data.kind) return;
        this._applySequenceEdit(sequenceModelEditing.wrapMessagesInBlock(this.model, data));
      },

      updateSequenceBlockText: function (data) {
        if (this.isFlowchart || !data || !data.blockId) return;
        this._applySequenceEdit(sequenceModelEditing.updateBlockText(this.model, data));
      },

      updateSequenceBranchText: function (data) {
        if (this.isFlowchart || !data || data.statementIndex === null || data.statementIndex === undefined) return;
        this._applySequenceEdit(sequenceModelEditing.updateBranchText(this.model, data));
      },

      changeSequenceBlockType: function (data) {
        if (this.isFlowchart || !data || !data.blockId || !data.kind) return;
        this._applySequenceEdit(sequenceModelEditing.changeBlockType(this.model, data));
      },

      addSequenceNote: function (data) {
        if (this.isFlowchart || !data || !data.participantId) return;
        this._applySequenceEdit(sequenceModelEditing.addNote(this.model, data));
      },

      insertSequenceNoteAt: function (data) {
        if (this.isFlowchart || !data || !data.participantId) return;
        this._applySequenceEdit(sequenceModelEditing.insertNoteAtStatementIndex(this.model, data));
      },

      updateSequenceNoteText: function (data) {
        if (this.isFlowchart || !data || data.statementIndex === null || data.statementIndex === undefined) return;
        this._applySequenceEdit(sequenceModelEditing.updateNoteText(this.model, data));
      },

      // deleteSelected dispatcher가 sequence 분기를 여기로 위임.
      _deleteSequenceSelection: function (data) {
        var nextModel = sequenceModelEditing.deleteSelection(this.model, data);
        if (!nextModel || nextModel === this.model) return false;
        this.model = nextModel;
        this.updateScriptFromModel();
        return true;
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
