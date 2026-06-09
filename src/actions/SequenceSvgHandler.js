(function (global) {
  'use strict';

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  var SequenceSvgHandler = {
    attach: function (svgEl, model, ctx) {
      var participantMap = SequencePositionTracker.collectParticipants(svgEl, model);
      var participantTargets = SequencePositionTracker.collectParticipantTargets(svgEl, model);
      var messages = SequencePositionTracker.collectMessages(svgEl, model);
      var notes = SequencePositionTracker.collectNotePositions(svgEl, model);
      participantMap = SequencePositionTracker.refineParticipantLifelines(participantMap, messages);
      var insertSlots = SequencePositionTracker.collectInsertSlots(participantMap, messages, notes, model);

      // 메시지 엣지와 노트가 공유하는 hover 상태 — 한쪽에 호버하면 다른 쪽 버튼이 사라진다
      var sharedInsert = { btns: null, hideTimer: null };
      function sharedInsertCancelHide() {
        if (sharedInsert.hideTimer !== null) { clearTimeout(sharedInsert.hideTimer); sharedInsert.hideTimer = null; }
      }
      function sharedInsertHideNow() {
        sharedInsertCancelHide();
        if (sharedInsert.btns) {
          for (var k = 0; k < sharedInsert.btns.length; k++) sharedInsert.btns[k].remove();
          sharedInsert.btns = null;
        }
        if (svgEl.dataset) delete svgEl.dataset.noteHoverActive;
      }
      // block title 버튼과 상호 억제를 위해 현재 hide 함수를 static으로 노출
      SequenceSvgHandler._currentHideInsertNow = sharedInsertHideNow;
      function sharedInsertScheduleHide() {
        sharedInsertCancelHide();
        sharedInsert.hideTimer = setTimeout(function () { sharedInsertHideNow(); }, 500);
      }

      SequenceMessageDragHandler.initOverlay(svgEl);
      // SequenceMessageDragHandler.attach(svgEl, participantMap, insertSlots, ctx);
      SequenceSvgHandler._attachParticipants(participantTargets, svgEl, ctx);
      SequenceSvgHandler._attachMessages(messages, svgEl, model, participantMap, ctx, sharedInsert, sharedInsertCancelHide, sharedInsertHideNow, sharedInsertScheduleHide);
      SequenceSvgHandler._attachNotes(svgEl, model, ctx, participantMap, sharedInsert, sharedInsertCancelHide, sharedInsertHideNow, sharedInsertScheduleHide);
    },

    _attachParticipants: function (participantTargets, svgEl, ctx) {
      for (var i = 0; i < participantTargets.length; i++) {
        SequenceSvgHandler._attachParticipant(participantTargets[i], svgEl, ctx);
      }
    },

    _attachParticipant: function (data, svgEl, ctx) {
      var el = data.el;
      if (!el) return;
      el.style.cursor = 'pointer';

      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedSequenceParticipantId: data.id,
          selectedSequenceMessageIndex: null,
          selectedSequenceMessageIndices: [],
          selectedSequenceBlockId: null,
          sequenceToolbar: {
            type: 'participant',
            id: data.id,
            kind: data.kind || 'participant',
            x: e.clientX,
            y: e.clientY
          }
        });
        ctx.emit('sequence-participant-selected', data.id);
      });

      el.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        SequenceSvgHandler.startParticipantEdit(data.id, el, ctx);
      });

      ctx.watchSequenceParticipantSelection(data.id, el);
    },

    _attachMessages: function (messages, svgEl, model, participantMap, ctx, shared, sharedCancelHide, sharedHideNow, sharedScheduleHide) {
      var oldOverlay = svgEl.querySelector('#sequence-message-insert-overlay');
      if (oldOverlay) oldOverlay.remove();
      var msgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      msgOverlay.setAttribute('id', 'sequence-message-insert-overlay');
      svgEl.appendChild(msgOverlay);

      for (var i = 0; i < messages.length; i++) {
        SequenceSvgHandler._attachMessage(messages[i], svgEl, model, participantMap, msgOverlay, shared, sharedCancelHide, sharedHideNow, sharedScheduleHide, ctx);
      }
    },

    _attachMessage: function (data, svgEl, model, participantMap, msgOverlay, shared, sharedCancelHide, sharedHideNow, sharedScheduleHide, ctx) {
      if (!data.lineEl && !data.textEl) return;
      var hitEl = SequenceSvgHandler._makeMessageHit(svgEl, data);
      var visualEl = data.lineEl || data.textEl;
      var textEl = data.textEl;

      if (!hitEl) hitEl = visualEl;
      hitEl.style.cursor = 'pointer';

      var onSelect = function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({
          selectedSequenceParticipantId: null,
          selectedSequenceMessageIndex: data.index,
          selectedSequenceMessageIndices: [],
          selectedSequenceBlockId: null,
          sequenceToolbar: {
            type: 'message',
            index: data.index,
            x: e.clientX,
            y: e.clientY
          }
        });
        ctx.emit('sequence-message-selected', data.index);
      };

      hitEl.addEventListener('click', onSelect);
      if (textEl && textEl !== hitEl) textEl.addEventListener('click', onSelect);

      var onEdit = function (e) {
        e.preventDefault();
        e.stopPropagation();
        SequenceSvgHandler.startMessageEdit(data.index, e.clientX, e.clientY, svgEl, ctx);
      };

      hitEl.addEventListener('dblclick', onEdit);
      if (textEl && textEl !== hitEl) textEl.addEventListener('dblclick', onEdit);

      var msgStmtIndex = (function () {
        var stmts = (model && model.statements) || [];
        var count = 0;
        for (var si = 0; si < stmts.length; si++) {
          if (stmts[si] && stmts[si].type === 'message') {
            if (count === data.index) return si;
            count++;
          }
        }
        return stmts.length;
      }());

      var modelMsg = model && model.messages && model.messages[data.index];
      var msgFromId = modelMsg ? modelMsg.from : null;
      var msgToId = modelMsg ? modelMsg.to : null;

      hitEl.addEventListener('mouseenter', function () {
        if (visualEl) visualEl.classList.add('sequence-message-hovered');
        if (textEl) textEl.classList.add('sequence-message-text-hovered');
        if (!data.bbox) return;
        sharedHideNow();
        if (SequenceBlockHandler && SequenceBlockHandler._currentHideBlockNow) SequenceBlockHandler._currentHideBlockNow();
        var bboxCx = data.bbox.x + data.bbox.width / 2;
        var allBtns = [];

        var fromEntry = msgFromId && participantMap && participantMap[msgFromId];
        if (fromEntry) {
          var fromCx = fromEntry.cx + (fromEntry.cx < bboxCx ? 28 : -28);
          allBtns = allBtns.concat(SequenceSvgHandler._createNoteInsertButtons(
            msgOverlay, data.bbox, msgStmtIndex, msgFromId,
            svgEl, model, participantMap, ctx,
            sharedCancelHide, sharedScheduleHide, fromCx
          ));
        }

        var toEntry = msgToId && msgToId !== msgFromId && participantMap && participantMap[msgToId];
        if (toEntry) {
          var toCx = toEntry.cx + (toEntry.cx < bboxCx ? 28 : -28);
          allBtns = allBtns.concat(SequenceSvgHandler._createNoteInsertButtons(
            msgOverlay, data.bbox, msgStmtIndex, msgToId,
            svgEl, model, participantMap, ctx,
            sharedCancelHide, sharedScheduleHide, toCx
          ));
        }

        shared.btns = allBtns;
      });
      hitEl.addEventListener('mouseleave', function () {
        if (visualEl) visualEl.classList.remove('sequence-message-hovered');
        if (textEl) textEl.classList.remove('sequence-message-text-hovered');
        sharedScheduleHide();
      });

      ctx.watchSequenceMessageSelection(data.index, visualEl, textEl);
      if (ctx.watchSequenceMessageHitSelection) {
        ctx.watchSequenceMessageHitSelection(data.index, hitEl);
      }
      if (ctx.watchSequenceMessageMultiSelection) {
        ctx.watchSequenceMessageMultiSelection(data.index, visualEl, textEl, hitEl);
      }
    },

    _makeMessageHit: function (svgEl, data) {
      if (!data || (!data.lineEl && !data.textEl && !data.bbox)) return null;
      var overlay = svgEl.querySelector('#sequence-message-hit-overlay');
      if (!overlay) {
        overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        overlay.setAttribute('id', 'sequence-message-hit-overlay');
        overlay.style.pointerEvents = 'all';
        svgEl.appendChild(overlay);
      }

      try {
        if (data.hitBox && data.hitBox.width && data.hitBox.height) {
          var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('class', 'sequence-hit-rect');
          rect.setAttribute('x', data.hitBox.x);
          rect.setAttribute('y', data.hitBox.y);
          rect.setAttribute('width', data.hitBox.width);
          rect.setAttribute('height', data.hitBox.height);
          rect.setAttribute('rx', '8');
          rect.setAttribute('fill', '#000');
          rect.setAttribute('fill-opacity', '0.003');
          rect.style.pointerEvents = 'all';
          overlay.appendChild(rect);
          return rect;
        }

        var fallback = data.lineEl || data.textEl;
        if (!fallback) return null;
        var ghost = fallback.cloneNode(false);
        ghost.removeAttribute('marker-end');
        ghost.removeAttribute('marker-start');
        ghost.setAttribute('stroke', '#000');
        ghost.setAttribute('stroke-opacity', '0.003');
        ghost.setAttribute('stroke-width', '18');
        ghost.setAttribute('fill', 'none');
        ghost.style.pointerEvents = 'stroke';
        overlay.appendChild(ghost);
        return ghost;
      } catch (e) {
        return null;
      }
    },

    startParticipantEdit: function (participantId, screenPos, topBox, ctx) {
      var participant = ctx.findSequenceParticipant(participantId);
      if (!participant) return;
      var boxW = topBox ? topBox.width : 120;
      var width = Math.max(160, boxW + 28);
      var centerX = screenPos ? screenPos.x : (global.innerWidth || 400) / 2;
      var centerY = screenPos ? screenPos.y : (global.innerHeight || 300) / 2;
      var left = clamp(
        centerX - width / 2,
        12,
        Math.max(12, (global.innerWidth || 0) - width - 12)
      );
      var top = clamp(
        centerY - 18,
        12,
        Math.max(12, (global.innerHeight || 0) - 48)
      );

      ctx.setState({
        sequenceToolbar: null,
        editingSequenceParticipantId: participantId,
        editingSequenceParticipantText: participant.label || participant.id,
        sequenceParticipantEditStyle: {
          position: 'fixed',
          left: left + 'px',
          top: top + 'px',
          zIndex: 1000,
          width: width + 'px'
        }
      });
      ctx.focusSequenceParticipantInput();
    },

    startMessageEdit: function (messageIndex, clientX, clientY, svgEl, ctx) {
      var message = ctx.findSequenceMessage(messageIndex);
      if (!message) return;
      var width = 220;
      var left = clamp(
        clientX - width / 2,
        12,
        Math.max(12, (global.innerWidth || 0) - width - 12)
      );
      var top = clamp(
        clientY - 22,
        12,
        Math.max(12, (global.innerHeight || 0) - 48)
      );
      ctx.setState({
        sequenceToolbar: null,
        editingSequenceMessageIndex: messageIndex,
        editingSequenceMessageText: message.text || '',
        sequenceMessageEditStyle: {
          position: 'fixed',
          left: left + 'px',
          top: top + 'px',
          zIndex: 1000,
          width: width + 'px'
        }
      });
      ctx.focusSequenceMessageInput();
    },

    _attachNotes: function (svgEl, model, ctx, participantMap, shared, sharedCancelHide, sharedHideNow, sharedScheduleHide) {
      var noteRects = Array.prototype.slice.call(svgEl.querySelectorAll('rect.note'));
      var noteStatements = [];
      var statements = (model && model.statements) || [];
      for (var i = 0; i < statements.length; i++) {
        if (statements[i] && statements[i].type === 'note') {
          noteStatements.push({ statementIndex: i, statement: statements[i] });
        }
      }

      var seenGroups = [], noteGroups = [];
      for (var r = 0; r < noteRects.length; r++) {
        var g = noteRects[r].parentNode;
        if (g && seenGroups.indexOf(g) === -1) { seenGroups.push(g); noteGroups.push(g); }
      }

      var oldOverlay = svgEl.querySelector('#sequence-note-insert-overlay');
      if (oldOverlay) oldOverlay.remove();
      var noteOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      noteOverlay.setAttribute('id', 'sequence-note-insert-overlay');
      svgEl.appendChild(noteOverlay);

      for (var j = 0; j < Math.min(noteGroups.length, noteStatements.length); j++) {
        (function (noteGroup, noteInfo) {
          noteGroup.style.cursor = 'pointer';
          noteGroup.style.pointerEvents = 'all';
          noteGroup.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            ctx.setState({
              selectedSequenceNoteStatementIndex: noteInfo.statementIndex,
              selectedSequenceParticipantId: null,
              selectedSequenceMessageIndex: null,
              selectedSequenceMessageIndices: [],
              selectedSequenceBlockId: null,
              sequenceToolbar: {
                type: 'note',
                noteStatementIndex: noteInfo.statementIndex,
                text: noteInfo.statement.text || '',
                x: e.clientX,
                y: e.clientY
              }
            });
          });
          noteGroup.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            e.preventDefault();
            if (ctx.openSequenceNoteEdit) {
              ctx.openSequenceNoteEdit(noteInfo.statementIndex, noteInfo.statement.text || '', e.clientX, e.clientY);
            }
          });

          noteGroup.addEventListener('mouseenter', function () {
            sharedHideNow();
            if (SequenceBlockHandler && SequenceBlockHandler._currentHideBlockNow) SequenceBlockHandler._currentHideBlockNow();
            if (svgEl.dataset) svgEl.dataset.noteHoverActive = '1';
            var bbox;
            try { bbox = noteGroup.getBBox(); } catch (e) { return; }
            var participantId = noteInfo.statement.participants && noteInfo.statement.participants[0];
            shared.btns = SequenceSvgHandler._createNoteInsertButtons(
              noteOverlay, bbox, noteInfo.statementIndex, participantId, svgEl, model, participantMap, ctx,
              sharedCancelHide, sharedScheduleHide, bbox.x + bbox.width / 2
            );
          });
          noteGroup.addEventListener('mouseleave', sharedScheduleHide);

          if (ctx.watchSequenceNoteMultiSelection) {
            ctx.watchSequenceNoteMultiSelection(noteInfo.statementIndex, noteGroup);
          }
        })(noteGroups[j], noteStatements[j]);
      }
    },

    _createNoteInsertButtons: function (overlay, bbox, statementIndex, participantId, svgEl, model, participantMap, ctx, onEnter, onLeave, cxOverride, positionsOverride) {
      var elements = [];
      var cx = (cxOverride !== undefined && cxOverride !== null) ? cxOverride : (bbox.x + bbox.width / 2 + 28);
      var positions = positionsOverride || [
        { y: bbox.y - 12, isBefore: true },
        { y: bbox.y + bbox.height + 12, isBefore: false }
      ];

      var hasDrag = !!(participantMap && Object.keys(participantMap).length && svgEl);

      var findNearestByX = function (svgX) {
        var best = null; var bestDist = Infinity; var SNAP = 80;
        var ids = Object.keys(participantMap);
        for (var i = 0; i < ids.length; i++) {
          var p = participantMap[ids[i]];
          if (!p) continue;
          var dx = Math.abs(svgX - p.cx);
          if (dx < SNAP && dx < bestDist) { bestDist = dx; best = ids[i]; }
        }
        return best;
      };

      for (var i = 0; i < positions.length; i++) {
        (function (pos) {
          // 이 버튼 위치에서의 message insertIndex: isBefore=true이면 statementIndex 이전까지, false면 이후까지
          var insertIndex = 0;
          var stmts = (model && model.statements) || [];
          var limit = pos.isBefore ? statementIndex : statementIndex + 1;
          for (var si = 0; si < limit && si < stmts.length; si++) {
            if (stmts[si] && stmts[si].type === 'message') insertIndex++;
          }

          var hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hit.setAttribute('cx', cx); hit.setAttribute('cy', pos.y); hit.setAttribute('r', '14');
          hit.setAttribute('fill', '#000'); hit.setAttribute('fill-opacity', '0.001');
          hit.style.pointerEvents = 'all';
          hit.style.cursor = hasDrag ? 'ew-resize' : 'pointer';
          overlay.appendChild(hit); elements.push(hit);

          var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', cx); circle.setAttribute('cy', pos.y); circle.setAttribute('r', '10');
          circle.setAttribute('fill', '#388e3c'); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
          circle.style.pointerEvents = 'none';
          overlay.appendChild(circle); elements.push(circle);

          var plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          plus.setAttribute('x', cx); plus.setAttribute('y', pos.y + 1);
          plus.setAttribute('text-anchor', 'middle'); plus.setAttribute('dominant-baseline', 'middle');
          plus.setAttribute('fill', '#fff'); plus.setAttribute('font-size', '16'); plus.setAttribute('font-weight', '700');
          plus.style.pointerEvents = 'none';
          plus.textContent = '+';
          overlay.appendChild(plus); elements.push(plus);

          // 파란 + 버튼과 동일한 패턴: mousedown으로 drag vs click 분기
          hit.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            onEnter();

            var startClient = { x: e.clientX, y: e.clientY };
            var didDrag = false;
            var currentTarget = null;
            var dragLine = SequenceMessageDragHandler._dragLine;
            var targetLine = SequenceMessageDragHandler._targetLine;
            var pointerClientX = e.clientX;
            var pointerClientY = e.clientY;
            var autoPanFrame = null;

            var clearTarget = function () {
              if (currentTarget && participantMap[currentTarget] && participantMap[currentTarget].el) {
                participantMap[currentTarget].el.classList.remove('sequence-participant-drag-target');
              }
              if (targetLine) targetLine.style.display = 'none';
              currentTarget = null;
            };

            var setTarget = function (id) {
              clearTarget();
              currentTarget = id;
              if (id && participantMap[id]) {
                var p = participantMap[id];
                if (p.el) p.el.classList.add('sequence-participant-drag-target');
                if (targetLine) {
                  targetLine.setAttribute('x1', p.cx); targetLine.setAttribute('x2', p.cx);
                  targetLine.setAttribute('y1', p.lifelineTopY); targetLine.setAttribute('y2', p.lifelineBottomY);
                  targetLine.style.display = '';
                }
              }
            };

            var getAutoPanDelta = function (clientX, clientY) {
              var rect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
              if (!rect) return { dx: 0, dy: 0 };
              var threshold = 56, maxStep = 8, dx = 0, dy = 0, progress = 0;
              if (clientX <= rect.left + threshold) {
                progress = Math.min(1, (rect.left + threshold - clientX) / threshold);
                dx = Math.ceil(progress * maxStep);
              } else if (clientX >= rect.right - threshold) {
                progress = Math.min(1, (clientX - (rect.right - threshold)) / threshold);
                dx = -Math.ceil(progress * maxStep);
              }
              if (clientY <= rect.top + threshold) {
                progress = Math.min(1, (rect.top + threshold - clientY) / threshold);
                dy = Math.ceil(progress * maxStep);
              } else if (clientY >= rect.bottom - threshold) {
                progress = Math.min(1, (clientY - (rect.bottom - threshold)) / threshold);
                dy = -Math.ceil(progress * maxStep);
              }
              return { dx: dx, dy: dy };
            };

            var stopAutoPan = function () {
              if (!autoPanFrame) return;
              cancelAnimationFrame(autoPanFrame);
              autoPanFrame = null;
            };

            var updateDragAtClient = function (clientX, clientY) {
              var svgPt = SvgPositionTracker.getSVGPoint(svgEl, clientX, clientY);
              if (dragLine) { dragLine.setAttribute('x2', svgPt.x); dragLine.setAttribute('y2', pos.y); }
              setTarget(findNearestByX(svgPt.x));
            };

            var autoPanTick = function () {
              autoPanFrame = null;
              if (!didDrag) return;
              var delta = getAutoPanDelta(pointerClientX, pointerClientY);
              if (!delta.dx && !delta.dy) return;
              if (ctx.panPreviewBy) {
                ctx.panPreviewBy(delta.dx, delta.dy);
                updateDragAtClient(pointerClientX, pointerClientY);
              }
              autoPanFrame = requestAnimationFrame(autoPanTick);
            };

            var scheduleAutoPan = function () {
              if (autoPanFrame) return;
              var delta = getAutoPanDelta(pointerClientX, pointerClientY);
              if (!delta.dx && !delta.dy) return;
              autoPanFrame = requestAnimationFrame(autoPanTick);
            };

            var onMove = function (me) {
              pointerClientX = me.clientX;
              pointerClientY = me.clientY;
              if (!hasDrag) return;
              var dx = me.clientX - startClient.x, dy = me.clientY - startClient.y;
              if (!didDrag && (dx * dx + dy * dy) > 25) {
                didDrag = true;
                if (dragLine) {
                  dragLine.setAttribute('x1', cx); dragLine.setAttribute('y1', pos.y);
                  dragLine.setAttribute('x2', cx); dragLine.setAttribute('y2', pos.y);
                  dragLine.style.display = '';
                }
              }
              if (!didDrag) return;
              updateDragAtClient(me.clientX, me.clientY);
              scheduleAutoPan();
            };

            var onUp = function (me) {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              stopAutoPan();
              clearTarget();
              if (dragLine) dragLine.style.display = 'none';
              if (targetLine) targetLine.style.display = 'none';

              if (!didDrag) {
                // 클릭 = 파란 + 버튼처럼 toolbar 표시 (Self Loop / Memo)
                ctx.setState({
                  selectedSequenceParticipantId: null,
                  selectedSequenceMessageIndex: null,
                  selectedSequenceMessageIndices: [],
                  selectedSequenceBlockId: null,
                  sequenceToolbar: {
                    type: 'insert',
                    participantId: participantId,
                    insertIndex: insertIndex,
                    stmtInsertAt: pos.isBefore ? statementIndex : statementIndex + 1,
                    x: me.clientX,
                    y: me.clientY
                  }
                });
              } else if (hasDrag) {
                // 드래그 = 메시지 생성: note 바로 위/아래 statement 위치에 삽입
                var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
                var target = findNearestByX(svgPt.x);
                if (target) {
                  ctx.emit('add-sequence-message', {
                    fromId: participantId, toId: target,
                    text: 'new msg', insertIndex: insertIndex,
                    stmtInsertAt: pos.isBefore ? statementIndex : statementIndex + 1
                  });
                }
              }
              onLeave();
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });

          hit.addEventListener('click', function (e) { e.stopPropagation(); });
          hit.addEventListener('mouseenter', function () { onEnter(); circle.setAttribute('fill', '#43a047'); });
          hit.addEventListener('mouseleave', function () { circle.setAttribute('fill', '#388e3c'); onLeave(); });
        })(positions[i]);
      }

      return elements;
    },

    // solid(단일 dash) ↔ dotted(이중 dash) 토글
    toggleMessageLineType: function (message) {
      return SequenceMessageCodec.toggleLineStyle(message.operator || SequenceMessageCodec.DEFAULT_OPERATOR);
    }
  };

  global.SequenceSvgHandler = SequenceSvgHandler;

})(typeof window !== 'undefined' ? window : this);
