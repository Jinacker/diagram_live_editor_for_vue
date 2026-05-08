(function (global) {
  'use strict';

  // Sequence model을 순수하게 편집하는 계층.
  // 여기서는 Vue 컴포넌트 상태나 script 갱신을 모르고 nextModel만 계산한다.

  // sequence 쪽은 patch 적용 뒤 activation 정규화와 explicitParticipants 보정이 항상 필요하다.
  function finish(model, patch) {
    var nextModel = Object.assign({}, model, patch);
    nextModel.explicitParticipants = true;
    if (nextModel.messages) {
      nextModel.messages = SequenceMessageCodec.normalizeActivations(nextModel.messages);
    }
    return nextModel;
  }

  // participant 배열만 바뀌는 수정은 이 helper를 통해 immutable update한다.
  function updateParticipants(model, updater) {
    var participants = model.participants || [];
    var nextParticipants = [];
    var changed = false;

    for (var i = 0; i < participants.length; i++) {
      var nextParticipant = updater(participants[i], i);
      nextParticipants.push(nextParticipant);
      if (nextParticipant !== participants[i]) changed = true;
    }

    return changed ? finish(model, { participants: nextParticipants }) : model;
  }

  // message 배열 수정도 같은 패턴으로 공통화한다.
  function updateMessages(model, updater) {
    var messages = model.messages || [];
    var nextMessages = [];
    var changed = false;

    for (var i = 0; i < messages.length; i++) {
      var nextMessage = updater(messages[i], i);
      nextMessages.push(nextMessage);
      if (nextMessage !== messages[i]) changed = true;
    }

    return changed ? finish(model, { messages: nextMessages }) : model;
  }

  var sequenceModelEditing = {
    // participant / actor 추가는 kind만 다르고 같은 규칙을 공유한다.
    addParticipant: function (model, data) {
      if (!model || !data || !data.id) return model;
      var participants = (model.participants || []).slice();
      participants.push({
        id: data.id,
        label: data.label || data.id,
        kind: data.kind || 'participant'
      });
      return finish(model, { participants: participants });
    },

    toggleParticipantKind: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return updateParticipants(model, function (participant) {
        if (participant.id !== data.participantId) return participant;
        return Object.assign({}, participant, {
          kind: participant.kind === 'actor' ? 'participant' : 'actor'
        });
      });
    },

    moveParticipant: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      var participants = (model.participants || []).slice();
      var index = -1;
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].id === data.participantId) {
          index = i;
          break;
        }
      }
      if (index === -1) return model;

      var swapIndex = data.direction === 'left' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= participants.length) return model;

      var temp = participants[index];
      participants[index] = participants[swapIndex];
      participants[swapIndex] = temp;
      return finish(model, { participants: participants });
    },

    // payload 형태에 따라 from/to 기본값과 삽입 위치를 계산해 새 message를 만든다.
    addMessage: function (model, payload) {
      if (!model) return model;
      var participants = model.participants || [];
      if (!participants.length) return model;

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

      var messages = (model.messages || []).slice();
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

      var stmtInsertAt = payload && payload.stmtInsertAt !== undefined && payload.stmtInsertAt !== null
        ? payload.stmtInsertAt : null;

      return finish(model, {
        messages: messages,
        statements: stmtInsertAt !== null
          ? SequenceStatementUtils.insertMessageAtStatementIndex(model, stmtInsertAt, newMessage)
          : SequenceStatementUtils.insertMessageStatement(model, insertAt, newMessage)
      });
    },

    updateParticipantText: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return updateParticipants(model, function (participant) {
        return participant.id === data.participantId
          ? Object.assign({}, participant, { label: data.text })
          : participant;
      });
    },

    updateMessageText: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateMessages(model, function (message, index) {
        return index === data.index
          ? Object.assign({}, message, { text: data.text })
          : message;
      });
    },

    reverseMessage: function (model, index) {
      if (!model || index === null || index === undefined) return model;
      return updateMessages(model, function (message, messageIndex) {
        if (messageIndex !== index) return message;
        return Object.assign({}, message, {
          from: message.to,
          to: message.from
        });
      });
    },

    toggleAutonumber: function (model) {
      if (!model) return model;
      return finish(model, { autonumber: !model.autonumber });
    },

    toggleMessageLineType: function (model, index) {
      if (!model || index === null || index === undefined) return model;
      return updateMessages(model, function (message, messageIndex) {
        if (messageIndex !== index) return message;
        return Object.assign({}, message, {
          operator: SequenceMessageCodec.toggleLineStyle(
            message.operator || SequenceMessageCodec.DEFAULT_OPERATOR
          )
        });
      });
    },

    // line type은 operator 본문만 바꾸고 activation suffix(+/-)는 유지한다.
    setMessageLineType: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateMessages(model, function (message, index) {
        if (index !== data.index) return message;
        var suffix = /[+-]$/.test(message.operator || '') ? message.operator.slice(-1) : '';
        return Object.assign({}, message, { operator: data.operator + suffix });
      });
    },

    // block / branch / note 계열은 statements 트리를 갱신하는 편집이다.
    addBranch: function (model, data) {
      if (!model || !data || !data.keyword) return model;
      var messageIndices = data.messageIndices || [];
      var noteStatementIndices = data.noteStatementIndices || [];
      if (!messageIndices.length && !noteStatementIndices.length) return model;
      return finish(model, {
        statements: SequenceStatementUtils.insertBranchStatement(
          model,
          messageIndices,
          data.keyword,
          data.text || '',
          noteStatementIndices
        )
      });
    },

    wrapMessagesInBlock: function (model, data) {
      var messageIndices = data && data.messageIndices ? data.messageIndices : [];
      var noteStatementIndices = data && data.noteStatementIndices ? data.noteStatementIndices : [];
      if (!model || !data || !data.kind || (!messageIndices.length && !noteStatementIndices.length)) return model;
      return finish(model, {
        statements: SequenceStatementUtils.wrapMessagesInBlock(
          model,
          messageIndices,
          data.kind,
          data.text || '',
          noteStatementIndices
        )
      });
    },

    updateBlockText: function (model, data) {
      if (!model || !data || !data.blockId) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateBlockText(model, data.blockId, nextText)
          : SequenceStatementUtils.deleteBlock(model, data.blockId)
      });
    },

    updateBranchText: function (model, data) {
      if (!model || !data || data.statementIndex === null || data.statementIndex === undefined) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateBranchText(model, data.statementIndex, data.text || '')
          : SequenceStatementUtils.deleteBranchStatement(model, data.statementIndex)
      });
    },

    changeBlockType: function (model, data) {
      if (!model || !data || !data.blockId || !data.kind) return model;
      return finish(model, {
        statements: SequenceStatementUtils.changeBlockKind(model, data.blockId, data.kind)
      });
    },

    addNote: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return finish(model, {
        statements: SequenceStatementUtils.addNoteStatement(
          model,
          data.participantId,
          data.insertIndex !== undefined ? data.insertIndex : null,
          data.text || 'Note'
        )
      });
    },

    insertNoteAtStatementIndex: function (model, data) {
      if (!model || !data || !data.participantId || data.statementIndex === undefined) return model;
      var insertAt = data.isBefore !== false ? data.statementIndex : data.statementIndex + 1;
      return finish(model, {
        statements: SequenceStatementUtils.insertNoteAtStatementIndex(
          model, insertAt, data.participantId, data.text || 'Note'
        )
      });
    },

    updateNoteText: function (model, data) {
      if (!model || !data || data.statementIndex === null || data.statementIndex === undefined) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateNoteText(model, data.statementIndex, nextText)
          : SequenceStatementUtils.deleteNoteStatement(model, data.statementIndex)
      });
    },

    // selection payload를 보고 participant / block / note / message 삭제를 분기한다.
    deleteSelection: function (model, data) {
      if (!model || !data) return model;

      if (data.sequenceParticipantId) {
        var removedIndices = [];
        var originalMessages = model.messages || [];
        var participants = (model.participants || []).filter(function (participant) {
          return participant.id !== data.sequenceParticipantId;
        });
        var messages = originalMessages.filter(function (message, index) {
          var keep = message.from !== data.sequenceParticipantId && message.to !== data.sequenceParticipantId;
          if (!keep) removedIndices.push(index);
          return keep;
        });
        if (participants.length === (model.participants || []).length && messages.length === originalMessages.length) {
          return model;
        }
        return finish(model, {
          participants: participants,
          messages: messages,
          statements: SequenceStatementUtils.removeParticipantStatements(
            model,
            data.sequenceParticipantId,
            removedIndices
          )
        });
      }

      if (data.sequenceBlockId) {
        return finish(model, {
          statements: SequenceStatementUtils.deleteBlock(model, data.sequenceBlockId)
        });
      }

      if (data.sequenceNoteStatementIndex !== null && data.sequenceNoteStatementIndex !== undefined) {
        return finish(model, {
          statements: SequenceStatementUtils.deleteNoteStatement(model, data.sequenceNoteStatementIndex)
        });
      }

      if (data.sequenceMessageIndex !== null && data.sequenceMessageIndex !== undefined) {
        if (!model.messages || data.sequenceMessageIndex < 0 || data.sequenceMessageIndex >= model.messages.length) {
          return model;
        }
        var nextMessages = model.messages.slice();
        nextMessages.splice(data.sequenceMessageIndex, 1);
        return finish(model, {
          messages: nextMessages,
          statements: SequenceStatementUtils.removeMessageStatements(model, [data.sequenceMessageIndex])
        });
      }

      return model;
    }
  };

  global.sequenceModelEditing = sequenceModelEditing;
})(typeof window !== 'undefined' ? window : this);
