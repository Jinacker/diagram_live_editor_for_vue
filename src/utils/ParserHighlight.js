/**
 * ParserHighlight
 * parser가 수집한 raw highlight target을 textarea 줄에 다시 매핑하는 공통 유틸.
 *
 * 역할:
 * - source 전체에서 같은 text가 몇 번째 등장인지 계산
 * - highlight target 목록을 현재 script 기준 line map으로 변환
 */
(function (global) {
  'use strict';

  function normalizeLineText(line) {
    return String(line || '').trim();
  }

  function nextOccurrence(counterMap, line) {
    var key = normalizeLineText(line) || '__empty__';
    var next = (counterMap[key] || 0) + 1;
    counterMap[key] = next;
    return {
      text: normalizeLineText(line),
      occurrence: next
    };
  }

  function buildHighlightLineMap(script, targets) {
    var map = {};
    var list = targets || [];
    if (!list.length) return map;

    var targetCounts = {};
    for (var i = 0; i < list.length; i++) {
      var target = list[i] || {};
      var key = normalizeLineText(target.text) || '__empty__';
      var occ = target.occurrence || 1;
      if (!targetCounts[key]) targetCounts[key] = {};
      targetCounts[key][occ] = true;
    }

    var lines = String(script || '').split('\n');
    var seenCounts = {};
    for (var j = 0; j < lines.length; j++) {
      var lineKey = normalizeLineText(lines[j]) || '__empty__';
      var lineOccurrence = (seenCounts[lineKey] || 0) + 1;
      seenCounts[lineKey] = lineOccurrence;
      if (targetCounts[lineKey] && targetCounts[lineKey][lineOccurrence]) {
        map[j + 1] = true;
      }
    }
    return map;
  }

  global.ParserHighlight = {
    normalizeLineText: normalizeLineText,
    nextOccurrence: nextOccurrence,
    buildHighlightLineMap: buildHighlightLineMap
  };

})(typeof window !== 'undefined' ? window : this);
