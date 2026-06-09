/**
 * ModelDiagnostics
 * raw script와 parsed model을 비교해 사용자가 인지해야 할 경고 문구를 만든다.
 *
 * 현재는 두 종류의 보호 신호를 합쳐서 보여준다:
 *   - script에는 N12 / P3 같은 예약 ID가 있는데 parser가 model에 반영하지 못한 경우
 *   - sequence parser가 일부 줄을 raw fallback으로 보존했거나 block 균형 이상을 감지한 경우
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

  function buildSequenceFallbackParts(parsed) {
    var diagnostics = parsed && parsed.type === 'sequenceDiagram' ? (parsed.diagnostics || {}) : null;
    var parts = [];
    if (!diagnostics) return parts;

    if (diagnostics.rawStatementCount) {
      parts.push('지원하지 않는 sequence 구문 ' + diagnostics.rawStatementCount + '줄 raw 보존');
    }
    if (diagnostics.orphanEndCount) {
      parts.push('짝 없는 end ' + diagnostics.orphanEndCount + '건 raw 보존');
    }
    if (diagnostics.unmatchedBlockCount) {
      parts.push('닫히지 않은 block ' + diagnostics.unmatchedBlockCount + '건 감지');
    }

    return parts;
  }

  function buildFlowchartFallbackParts(parsed) {
    var diagnostics = parsed && parsed.type === 'flowchart' ? (parsed.diagnostics || {}) : null;
    var parts = [];
    if (!diagnostics) return parts;

    if (diagnostics.rawStatementCount) {
      parts.push('지원하지 않는 flowchart 구문 ' + diagnostics.rawStatementCount + '줄 raw 보존');
    }

    return parts;
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
    var parts = buildSequenceFallbackParts(parsed).concat(buildFlowchartFallbackParts(parsed));

    if (missingNodeCount) parts.push('N ID ' + missingNodeCount + '개 누락 추정');
    if (missingParticipantCount) parts.push('P ID ' + missingParticipantCount + '개 누락 추정');
    if (!parts.length) return '';

    return parts.join(', ') + ' 중';
  }

  global.ModelDiagnostics = {
    reservedIdWarning: reservedIdWarning
  };

})(typeof window !== 'undefined' ? window : this);
