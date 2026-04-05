/**
 * Mermaid 시퀀스 다이어그램 생성기
 * 내부 모델을 sequenceDiagram 스크립트로 직렬화한다.
 */

(function (global) {
  'use strict';

  function generateSequence(model) {
    if (!model) return '';

    var lines = ['sequenceDiagram'];
    var participants = model.participants || [];
    var messages = model.messages || [];

    for (var i = 0; i < participants.length; i++) {
      var participant = participants[i];
      if (!participant || !participant.id) continue;
      if (participant.label && participant.label !== participant.id) {
        lines.push('    participant ' + participant.id + ' as ' + participant.label);
      } else {
        lines.push('    participant ' + participant.id);
      }
    }

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (!message || !message.from || !message.to) continue;
      lines.push(
        '    ' +
        message.from +
        (message.operator || '->>') +
        message.to +
        ': ' +
        (message.text || '')
      );
    }

    return lines.join('\n');
  }

  global.SequenceGenerator = {
    generate: generateSequence
  };

})(typeof window !== 'undefined' ? window : this);
