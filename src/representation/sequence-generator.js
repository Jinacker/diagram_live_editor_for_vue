/**
 * Mermaid 시퀀스 다이어그램 생성기
 * 내부 모델을 sequenceDiagram 스크립트로 직렬화한다.
 */

(function (global) {
  'use strict';

  function renderIndented(level, text) {
    var indent = '    ';
    for (var i = 0; i < level; i++) indent += '    ';
    return indent + text;
  }

  function renderMessage(message, level) {
    if (!message || !message.from || !message.to) return '';
    return renderIndented(
      level || 0,
      message.from +
      (message.operator || SequenceMessageCodec.DEFAULT_OPERATOR) +
      message.to +
      ': ' +
      (message.text || '')
    );
  }

  function renderStatement(statement, message, level) {
    if (!statement) return '';

    if (statement.type === 'message') {
      return renderMessage(message || statement.message, level);
    }

    if (statement.type === 'activate' || statement.type === 'deactivate') {
      if (!statement.participant) return '';
      return renderIndented(level || 0, statement.type + ' ' + statement.participant);
    }

    if (statement.type === 'end') {
      return renderIndented(level || 0, 'end');
    }

    if (/^(loop|alt|else|opt|par|and)$/.test(statement.type)) {
      return renderIndented(level || 0, statement.type + (statement.text ? ' ' + statement.text : ''));
    }

    if (statement.type === 'note') {
      var parts = (statement.participants || []).join(', ');
      var text = String(statement.text || '').trim();
      if (!parts || !text) return '';
      return renderIndented(level || 0, 'note over ' + parts + ': ' + text);
    }

    if (statement.type === 'raw') {
      return renderIndented(level || 0, statement.raw || '');
    }

    return '';
  }

  function generateSequence(model) {
    if (!model) return '';

    var lines = ['sequenceDiagram'];
    if (model.autonumber) lines.push('    autonumber');
    var participants = model.participants || [];
    var messages = model.messages || [];
    var referenced = {};
    var mustDeclare = !!model.explicitParticipants;

    for (var r = 0; r < messages.length; r++) {
      if (messages[r].from) referenced[messages[r].from] = true;
      if (messages[r].to) referenced[messages[r].to] = true;
    }

    if (!mustDeclare) {
      for (var d = 0; d < participants.length; d++) {
        var candidate = participants[d];
        if (!candidate || !candidate.id) continue;
        if ((candidate.label && candidate.label !== candidate.id) || !referenced[candidate.id]) {
          mustDeclare = true;
          break;
        }
      }
    }

    if (mustDeclare) {
      for (var i = 0; i < participants.length; i++) {
        var participant = participants[i];
        if (!participant || !participant.id) continue;
        var keyword = participant.kind === 'actor' ? 'actor' : 'participant';
        if (participant.label && participant.label !== participant.id) {
          lines.push('    ' + keyword + ' ' + participant.id + ' as ' + participant.label);
        } else {
          lines.push('    ' + keyword + ' ' + participant.id);
        }
      }
    }

    var statements = model.statements || [];
    if (statements.length) {
      var messageCursor = 0;
      var depth = 0;
      for (var j = 0; j < statements.length; j++) {
        var statement = statements[j];
        var line = '';
        var level = depth;
        if (statement && (
          statement.type === 'else' ||
          statement.type === 'and' ||
          statement.type === 'end' ||
          statement.blockRole === 'close'
        )) {
          level = Math.max(0, depth - 1);
        }
        if (statement && statement.type === 'message') {
          line = renderStatement(statement, messages[messageCursor] || statement.message, level);
          messageCursor++;
        } else if (statement && (statement.type === 'activate' || statement.type === 'deactivate') &&
                   statement.participant && !referenced[statement.participant]) {
          // activate/deactivate on a participant with no messages causes Mermaid to crash
          // (no lifeline y-extent), so skip these orphan statements.
          line = '';
        } else {
          line = renderStatement(statement, null, level);
        }

        if (statement && (/^(loop|alt|opt|par)$/.test(statement.type) || statement.blockRole === 'open')) {
          depth++;
        } else if (statement && /^(else|and)$/.test(statement.type)) {
          depth = level + 1;
        } else if (statement && (statement.type === 'end' || statement.blockRole === 'close')) {
          depth = level;
        }

        if (line) lines.push(line);
      }

      for (; messageCursor < messages.length; messageCursor++) {
        var trailing = renderMessage(messages[messageCursor], depth);
        if (trailing) lines.push(trailing);
      }
      return lines.join('\n');
    }

    for (var k = 0; k < messages.length; k++) {
      var message = messages[k];
      var messageLine = renderMessage(message);
      if (messageLine) {
        lines.push(messageLine);
      }
    }

    return lines.join('\n');
  }

  global.SequenceGenerator = {
    generate: generateSequence
  };

})(typeof window !== 'undefined' ? window : this);
