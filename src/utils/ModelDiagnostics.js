/**
 * ModelDiagnostics
 * raw script와 parsed model을 비교해 사용자가 인지해야 할 경고 문구를 만든다.
 *
 * 현재는 "예약 ID 누락 경고" 한 종류만 제공한다:
 *   - script에는 N12 / P3 같은 예약 ID가 있는데 parser가 model에 반영하지 못한 경우
 *   - unsupported 문법 때문에 GUI 동기화가 끊겼을 가능성을 사용자에게 알려준다.
 *
 * StorageManager 스타일의 stateless plain object.
 */
(function (global) {
  'use strict';

  function collectReservedIds(script, prefix) {
    var src = script || '';
    var escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('\\b' + escapedPrefix + '(\\d+)\\b', 'g');
    var ids = {};
    var match;
    while ((match = regex.exec(src))) {
      ids[prefix + match[1]] = true;
    }
    return ids;
  }

  function collectModelIds(items, prefix) {
    var ids = {};
    var list = items || [];
    var idPattern = new RegExp('^' + prefix + '\\d+$');
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] && list[i].id || '');
      if (idPattern.test(id)) {
        ids[id] = true;
      }
    }
    return ids;
  }

  function countMissingIds(reserved, parsed) {
    var count = 0;
    var keys = Object.keys(reserved);
    for (var i = 0; i < keys.length; i++) {
      if (!parsed[keys[i]]) count++;
    }
    return count;
  }

  // script ↔ parsed model 비교 후 경고 문자열 반환 (없으면 빈 문자열).
  function reservedIdWarning(script, parsed) {
    if (!parsed) return '';
    var reservedNodeIds = collectReservedIds(script, 'N');
    var reservedParticipantIds = collectReservedIds(script, 'P');
    var parsedNodeIds = collectModelIds(parsed.nodes || [], 'N');
    var parsedParticipantIds = collectModelIds(parsed.participants || [], 'P');
    var missingNodeCount = countMissingIds(reservedNodeIds, parsedNodeIds);
    var missingParticipantCount = countMissingIds(reservedParticipantIds, parsedParticipantIds);

    if (!missingNodeCount && !missingParticipantCount) return '';

    var parts = [];
    if (missingNodeCount) parts.push('N ID ' + missingNodeCount + '개');
    if (missingParticipantCount) parts.push('P ID ' + missingParticipantCount + '개');
    return '일부 Mermaid 요소가 GUI parser에 완전히 반영되지 않았을 수 있습니다. 누락 추정: ' + parts.join(', ');
  }

  global.ModelDiagnostics = {
    reservedIdWarning: reservedIdWarning
  };

})(typeof window !== 'undefined' ? window : this);
