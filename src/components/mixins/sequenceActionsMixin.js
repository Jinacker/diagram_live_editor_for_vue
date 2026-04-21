/**
 * sequenceActionsMixin
 * LiveEditor와 FullEditor가 공유하는 sequence diagram 액션 믹스인.
 * flowchartActionsMixin과 세트로 사용한다.
 *
 * 호출부 요구사항:
 *   - data: model (type, participants, messages, autonumber)
 *   - data: participantIdAllocator (IdAllocator 인스턴스)
 *   - methods: _snapshot, _updateSequenceModel
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, sequence 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.sequenceActionsMixin = {
    methods: {
      addSequenceParticipant: function () {
        if (this.isFlowchart) return;
        this._snapshot();
        var id = this.participantIdAllocator.next(this.script, this.model.participants);
        var participants = (this.model.participants || []).slice();
        participants.push({ id: id, label: 'Participant ' + this.participantIdAllocator.counter, kind: 'participant' });
        this._updateSequenceModel({ participants: participants });
      },

      addSequenceActor: function () {
        if (this.isFlowchart) return;
        this._snapshot();
        var id = this.participantIdAllocator.next(this.script, this.model.participants);
        var participants = (this.model.participants || []).slice();
        participants.push({ id: id, label: 'Actor ' + this.participantIdAllocator.counter, kind: 'actor' });
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

        var newMessage = {
          from: fromId,
          to: toId,
          operator: '->>',
          text: messageText
        };
        messages.splice(insertAt, 0, newMessage);

        this._updateSequenceModel({
          messages: messages,
          statements: SequenceStatementUtils.insertMessageStatement(this.model, insertAt, newMessage)
        });
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
          var suffix = /[+-]$/.test(m.operator || '') ? m.operator.slice(-1) : '';
          return Object.assign({}, m, { operator: data.operator + suffix });
        });
        this._updateSequenceModel({ messages: messages });
      },

      addSequenceBranch: function (data) {
        if (this.isFlowchart || !data || !data.keyword || !data.messageIndices || !data.messageIndices.length) return;
        this._snapshot();
        this._updateSequenceModel({
          statements: SequenceStatementUtils.insertBranchStatement(
            this.model,
            data.messageIndices,
            data.keyword,
            data.text || ''
          )
        });
      },

      wrapSequenceMessagesInBlock: function (data) {
        if (this.isFlowchart || !data || !data.kind) return;
        var messageIndices = data.messageIndices || [];
        if (!messageIndices.length) return;
        this._snapshot();
        this._updateSequenceModel({
          statements: SequenceStatementUtils.wrapMessagesInBlock(
            this.model,
            messageIndices,
            data.kind,
            data.text || ''
          )
        });
      },

      updateSequenceBlockText: function (data) {
        if (this.isFlowchart || !data || !data.blockId) return;
        this._snapshot();
        this._updateSequenceModel({
          statements: SequenceStatementUtils.updateBlockText(this.model, data.blockId, data.text || '')
        });
      },

      updateSequenceBranchText: function (data) {
        if (this.isFlowchart || !data || data.statementIndex === null || data.statementIndex === undefined) return;
        this._snapshot();
        this._updateSequenceModel({
          statements: SequenceStatementUtils.updateBranchText(this.model, data.statementIndex, data.text || '')
        });
      },

      changeSequenceBlockType: function (data) {
        if (this.isFlowchart || !data || !data.blockId || !data.kind) return;
        this._snapshot();
        this._updateSequenceModel({
          statements: SequenceStatementUtils.changeBlockKind(this.model, data.blockId, data.kind)
        });
      },

      // deleteSelected dispatcher가 sequence 분기일 때 호출.
      _deleteSequenceSelection: function (data) {
        if (data.sequenceParticipantId) {
          var removedIndices = [];
          var originalMessages = this.model.messages || [];
          var participants = (this.model.participants || []).filter(function (p) {
            return p.id !== data.sequenceParticipantId;
          });
          var messages = originalMessages.filter(function (m, idx) {
            var keep = m.from !== data.sequenceParticipantId && m.to !== data.sequenceParticipantId;
            if (!keep) removedIndices.push(idx);
            return keep;
          });
          this._updateSequenceModel({
            participants: participants,
            messages: messages,
            statements: SequenceStatementUtils.removeMessageStatements(this.model, removedIndices)
          });
          return true;
        }
        if (data.sequenceBlockId) {
          this._updateSequenceModel({
            statements: SequenceStatementUtils.deleteBlock(this.model, data.sequenceBlockId)
          });
          return true;
        }
        if (data.sequenceMessageIndex !== null && data.sequenceMessageIndex !== undefined) {
          var mc = (this.model.messages || []).slice();
          mc.splice(data.sequenceMessageIndex, 1);
          this._updateSequenceModel({
            messages: mc,
            statements: SequenceStatementUtils.removeMessageStatements(this.model, [data.sequenceMessageIndex])
          });
          return true;
        }
        return false;
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
