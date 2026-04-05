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

  var SequencePositionTracker = {
    collectParticipants: function (svgEl, model) {
      var participants = model.participants || [];
      var candidates = svgEl.querySelectorAll('.actor, .actor-top, g[class*="actor"]');
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
            bbox: bbox
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
          bbox: fb
        };
      }

      return byId;
    },

    collectMessages: function (svgEl, model) {
      var messages = model.messages || [];
      var textEls = svgEl.querySelectorAll('.messageText, text[class*="messageText"]');
      var lineCandidates = svgEl.querySelectorAll(
        '.messageLine0, .messageLine1, .messageLine2,' +
        'path[class*="messageLine"], line[class*="messageLine"]'
      );
      var results = [];
      var usedLineIdx = {};

      for (var i = 0; i < messages.length; i++) {
        var textEl = textEls[i] || null;
        var lineEl = null;
        var bbox = null;

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
          } else if (textEl && textEl.getBBox) {
            bbox = textEl.getBBox();
          } else if (lineEl && lineEl.getBBox) {
            bbox = lineEl.getBBox();
          }
        } catch (e) {
          bbox = null;
        }

        results.push({
          index: i,
          textEl: textEl,
          lineEl: lineEl,
          bbox: bbox
        });
      }

      return results;
    }
  };

  global.SequencePositionTracker = SequencePositionTracker;

})(typeof window !== 'undefined' ? window : this);
