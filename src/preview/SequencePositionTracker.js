(function (global) {
  'use strict';

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function readLabel(el) {
    if (!el) return '';
    var textEl = el.querySelector ? el.querySelector('text, tspan') : null;
    if (!textEl && el.tagName && /^(text|tspan)$/i.test(el.tagName)) textEl = el;
    return normalizeText(textEl ? textEl.textContent : el.textContent);
  }

  function bboxCenterY(el) {
    if (!el || !el.getBBox) return null;
    try {
      var box = el.getBBox();
      return box.y + box.height / 2;
    } catch (e) {
      return null;
    }
  }

  function collectUniqueMessageTextEls(svgEl) {
    var raw = svgEl.querySelectorAll('.messageText, text[class*="messageText"]');
    var results = [];
    var seenTextNodes = [];

    for (var i = 0; i < raw.length; i++) {
      var candidate = raw[i];
      var textEl = null;

      if (candidate.tagName && /^(text|tspan)$/i.test(candidate.tagName)) {
        textEl = candidate;
      } else if (candidate.querySelector) {
        textEl = candidate.querySelector('text, tspan');
      }

      if (!textEl || seenTextNodes.indexOf(textEl) !== -1) continue;
      seenTextNodes.push(textEl);
      results.push(textEl);
    }

    return results;
  }

  function collectParticipantCandidateEls(svgEl) {
    var raw = svgEl.querySelectorAll('.actor, .actor-top, .actor-bottom, g[class*="actor"]');
    var results = [];
    var seen = [];

    for (var i = 0; i < raw.length; i++) {
      if (seen.indexOf(raw[i]) !== -1) continue;
      seen.push(raw[i]);
      results.push(raw[i]);
    }

    return results;
  }

  var SequencePositionTracker = {
    collectParticipants: function (svgEl, model) {
      var participants = model.participants || [];
      var candidates = collectParticipantCandidateEls(svgEl);
      var byId = {};
      var used = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (!el.getBBox) continue;
        var label = readLabel(el);
        var bbox;
        try { bbox = el.getBBox(); } catch (e) { continue; }
        if (!bbox || !bbox.width || !bbox.height) continue;

        for (var p = 0; p < participants.length; p++) {
          var participant = participants[p];
          if (used.indexOf(p) !== -1) continue;
          if (label !== normalizeText(participant.label || participant.id)) continue;
          byId[participant.id] = {
            id: participant.id,
            label: participant.label || participant.id,
            el: el,
            bbox: bbox,
            topBox: bbox,
            bottomBox: null,
            cx: bbox.x + bbox.width / 2,
            handleY: bbox.y + bbox.height + 22,
            lifelineTopY: bbox.y + bbox.height,
            lifelineBottomY: bbox.y + bbox.height + 260
          };
          used.push(p);
          break;
        }
      }

      // DOM 레이블 매칭이 실패한 경우 마지막 보정으로 순서 기반 대응을 시도한다.
      var fallbackCandidates = [];
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].classList && candidates[j].classList.contains('actor-bottom')) continue;
        fallbackCandidates.push(candidates[j]);
      }

      for (var k = 0; k < participants.length; k++) {
        var current = participants[k];
        if (byId[current.id]) continue;
        var fallback = fallbackCandidates[k];
        if (!fallback || !fallback.getBBox) continue;
        var fb;
        try { fb = fallback.getBBox(); } catch (e2) { continue; }
        byId[current.id] = {
          id: current.id,
          label: current.label || current.id,
          el: fallback,
          bbox: fb,
          topBox: fb,
          bottomBox: null,
          cx: fb.x + fb.width / 2,
          handleY: fb.y + fb.height + 22,
          lifelineTopY: fb.y + fb.height,
          lifelineBottomY: fb.y + fb.height + 260
        };
      }

      // Mermaid 테마/버전에 따라 actor-bottom 클래스가 없을 수 있으므로
      // 같은 라벨의 박스들 중 가장 위/아래를 직접 찾아 top/bottom box로 확정한다.
      for (var id in byId) {
        var matchedBoxes = [];
        for (var c = 0; c < candidates.length; c++) {
          var candidateEl = candidates[c];
          if (normalizeText(readLabel(candidateEl)) !== normalizeText(byId[id].label)) continue;
          try {
            matchedBoxes.push(candidateEl.getBBox());
          } catch (e3) {}
        }

        if (!matchedBoxes.length) continue;
        matchedBoxes.sort(function (a, b) { return a.y - b.y; });
        byId[id].topBox = matchedBoxes[0];
        byId[id].bottomBox = matchedBoxes[matchedBoxes.length - 1];
        byId[id].lifelineTopY = byId[id].topBox.y + byId[id].topBox.height;
        byId[id].lifelineBottomY = byId[id].bottomBox.y;
      }

      return byId;
    },

    collectParticipantTargets: function (svgEl, model) {
      var participants = model.participants || [];
      var candidates = collectParticipantCandidateEls(svgEl);
      var targets = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var label = readLabel(el);
        if (!label) continue;

        for (var p = 0; p < participants.length; p++) {
          var participant = participants[p];
          if (normalizeText(participant.label || participant.id) !== label) continue;
          targets.push({
            id: participant.id,
            label: participant.label || participant.id,
            el: el
          });
          break;
        }
      }

      return targets;
    },

    collectMessages: function (svgEl, model) {
      var messages = model.messages || [];
      var textEls = collectUniqueMessageTextEls(svgEl);
      var lineCandidates = svgEl.querySelectorAll(
        '.messageLine0, .messageLine1, .messageLine2,' +
        'path[class*="messageLine"], line[class*="messageLine"]'
      );
      var results = [];
      var usedLineIdx = {};
      var textOccurrences = {};

      for (var i = 0; i < messages.length; i++) {
        var messageText = normalizeText(messages[i].text);
        var occurrence = textOccurrences[messageText] || 0;
        var textEl = null;
        var lineEl = null;
        var bbox = null;
        var hitBox = null;

        for (var t = 0, seen = 0; t < textEls.length; t++) {
          if (normalizeText(textEls[t].textContent) !== messageText) continue;
          if (seen === occurrence) {
            textEl = textEls[t];
            break;
          }
          seen++;
        }

        if (!textEl) {
          textEl = textEls[i] || null;
        }
        textOccurrences[messageText] = occurrence + 1;

        // Mermaid sequence SVG는 텍스트 순서는 비교적 안정적이지만,
        // 선(path/line) 순서는 activation 등과 섞여 흔들릴 수 있다.
        // 그래서 텍스트를 기준으로 같은 높이의 선을 찾아 매칭한다.
        if (textEl) {
          var textY = bboxCenterY(textEl);
          var bestIdx = -1;
          var bestDist = Infinity;

          for (var j = 0; j < lineCandidates.length; j++) {
            if (usedLineIdx[j]) continue;
            var candidateY = bboxCenterY(lineCandidates[j]);
            if (candidateY === null || textY === null) continue;
            var dist = Math.abs(candidateY - textY);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = j;
            }
          }

          if (bestIdx !== -1) {
            lineEl = lineCandidates[bestIdx];
            usedLineIdx[bestIdx] = true;
          }
        }

        if (!lineEl) {
          lineEl = lineCandidates[i] || null;
        }

        try {
          if (textEl && textEl.getBBox && lineEl && lineEl.getBBox) {
            var tb = textEl.getBBox();
            var lb = lineEl.getBBox();
            var minX = Math.min(tb.x, lb.x);
            var minY = Math.min(tb.y, lb.y);
            var maxX = Math.max(tb.x + tb.width, lb.x + lb.width);
            var maxY = Math.max(tb.y + tb.height, lb.y + lb.height);
            bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
            hitBox = {
              x: minX - 8,
              y: (tb.y + tb.height / 2) - 12,
              width: (maxX - minX) + 16,
              height: 24
            };
          } else if (textEl && textEl.getBBox) {
            bbox = textEl.getBBox();
            hitBox = {
              x: bbox.x - 8,
              y: (bbox.y + bbox.height / 2) - 12,
              width: bbox.width + 16,
              height: 24
            };
          } else if (lineEl && lineEl.getBBox) {
            bbox = lineEl.getBBox();
            hitBox = {
              x: bbox.x - 8,
              y: (bbox.y + bbox.height / 2) - 12,
              width: bbox.width + 16,
              height: 24
            };
          }
        } catch (e) {
          bbox = null;
          hitBox = null;
        }

        results.push({
          index: i,
          textEl: textEl,
          lineEl: lineEl,
          bbox: bbox,
          hitBox: hitBox,
          rowY: hitBox ? (hitBox.y + hitBox.height / 2) : (bbox ? (bbox.y + bbox.height / 2) : null)
        });
      }

      return results;
    },

    collectInsertSlots: function (participantMap, messages) {
      var rows = [];
      for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].rowY !== null && messages[i].rowY !== undefined) {
          rows.push(messages[i].rowY);
        }
      }

      rows.sort(function (a, b) { return a - b; });

      var ids = Object.keys(participantMap);
      if (!ids.length) return [];

      var sample = participantMap[ids[0]];
      if (!sample) return [];

      var slots = [];
      var topY = sample.lifelineTopY + 18;
      var bottomY = sample.lifelineBottomY - 18;

      var MIN_SLOT_GAP = 34;

      if (!rows.length) {
        slots.push({
          y: (topY + bottomY) / 2,
          insertIndex: 0
        });
        return slots;
      }

      slots.push({
        y: Math.max(topY + 12, rows[0] - 48),
        insertIndex: 0
      });

      for (var r = 0; r < rows.length - 1; r++) {
        var midY = (rows[r] + rows[r + 1]) / 2;
        slots.push({
          y: midY,
          insertIndex: r + 1
        });
      }

      // 맨 아래보다는 중간 삽입을 우선하지만, 마지막 뒤에 추가할 슬롯도 유지한다.
      slots.push({
        y: Math.min(bottomY - 12, rows[rows.length - 1] + 48),
        insertIndex: rows.length
      });

      // 맨 위/맨 아래 슬롯은 항상 유지하고,
      // 중간 슬롯끼리만 합쳐 + 버튼 겹침을 줄인다.
      if (slots.length <= 2) return slots;

      var deduped = [slots[0]];
      for (var s = 1; s < slots.length - 1; s++) {
        var current = slots[s];
        var prev = deduped[deduped.length - 1];
        if (prev !== slots[0] && Math.abs(current.y - prev.y) < MIN_SLOT_GAP) {
          prev.y = (prev.y + current.y) / 2;
          prev.insertIndex = Math.max(prev.insertIndex, current.insertIndex);
        } else {
          deduped.push(current);
        }
      }
      deduped.push(slots[slots.length - 1]);

      // 끝 슬롯은 항상 남기되, 바로 옆 슬롯과 최소 간격을 강제로 확보한다.
      if (deduped.length >= 2) {
        var first = deduped[0];
        var second = deduped[1];
        if (Math.abs(second.y - first.y) < MIN_SLOT_GAP) {
          first.y = Math.max(topY + 8, second.y - MIN_SLOT_GAP);
        }
      }

      if (deduped.length >= 2) {
        var last = deduped[deduped.length - 1];
        var beforeLast = deduped[deduped.length - 2];
        if (Math.abs(last.y - beforeLast.y) < MIN_SLOT_GAP) {
          last.y = Math.min(bottomY - 8, beforeLast.y + MIN_SLOT_GAP);
        }
      }

      return deduped;
    },

    refineParticipantLifelines: function (participantMap, messages) {
      var rows = [];
      for (var i = 0; i < messages.length; i++) {
        if (messages[i] && messages[i].rowY !== null && messages[i].rowY !== undefined) {
          rows.push(messages[i].rowY);
        }
      }

      if (!rows.length) return participantMap;

      rows.sort(function (a, b) { return a - b; });
      var topY = rows[0] - 26;
      var bottomY = rows[rows.length - 1] + 26;

      var ids = Object.keys(participantMap);
      for (var j = 0; j < ids.length; j++) {
        var participant = participantMap[ids[j]];
        if (!participant) continue;
        // 실제 보이는 lifeline 범위는 유지하되,
        // 메시지 구간이 그 안에 포함되도록만 보정한다.
        participant.lifelineTopY = Math.min(participant.lifelineTopY, topY);
        participant.lifelineBottomY = Math.max(participant.lifelineBottomY, bottomY);
      }

      return participantMap;
    }
  };

  global.SequencePositionTracker = SequencePositionTracker;

})(typeof window !== 'undefined' ? window : this);
