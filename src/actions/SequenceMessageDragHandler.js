(function (global) {
  'use strict';

  var SequenceMessageDragHandler = {
    _overlay: null,
    _dragLine: null,
    _targetLine: null,
    _handles: [],
    _hoverTargets: [],
    _dragging: false,

    initOverlay: function (svgEl) {
      var old = svgEl.querySelector('#sequence-drag-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'sequence-drag-overlay');
      overlay.style.pointerEvents = 'none';
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('class', 'sequence-drag-line');
      dragLine.setAttribute('stroke', '#4f46e5');
      dragLine.setAttribute('stroke-width', '3');
      dragLine.setAttribute('stroke-dasharray', '6,4');
      dragLine.style.display = 'none';
      dragLine.style.pointerEvents = 'none';
      overlay.appendChild(dragLine);
      this._dragLine = dragLine;

      var targetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      targetLine.setAttribute('class', 'sequence-target-line');
      targetLine.style.display = 'none';
      targetLine.style.pointerEvents = 'none';
      overlay.appendChild(targetLine);
      this._targetLine = targetLine;

      this._handles = [];
      this._hoverTargets = [];
      this._dragging = false;
    },

    attach: function (svgEl, participantMap, insertSlots, ctx) {
      if (!this._overlay) this.initOverlay(svgEl);
      this.clearHandles();
      this._clearHoverTargets();
      this._bringOverlayToFront(svgEl);

      var ids = Object.keys(participantMap);
      var rows = (insertSlots && insertSlots.length) ? insertSlots : [];

      // 참가자가 1명뿐인 경우에는 hover 없이 기본 self-message 슬롯을 바로 보여 준다.
      if (ids.length === 1) {
        var onlyParticipant = participantMap[ids[0]];
        if (onlyParticipant) {
          var gapMidY = (onlyParticipant.lifelineTopY + onlyParticipant.lifelineBottomY) / 2;
          if (onlyParticipant.topBox && onlyParticipant.bottomBox) {
            gapMidY = (onlyParticipant.topBox.y + onlyParticipant.topBox.height + onlyParticipant.bottomBox.y) / 2;
          }
          var singleSlot = {
            y: gapMidY,
            insertIndex: 0
          };
          this._addHandle(svgEl, onlyParticipant, singleSlot, participantMap, ctx);
        }
        return;
      }

      for (var i = 0; i < ids.length; i++) {
        this._attachHoverZone(svgEl, participantMap[ids[i]], rows, participantMap, ctx);
      }
    },

    _attachHoverZone: function (svgEl, participant, slots, participantMap, ctx) {
      if (!participant || !participant.bbox) return;
      var self = this;
      var zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      zone.setAttribute('class', 'sequence-lifeline-hit');
      zone.setAttribute('x', participant.cx - 16);
      zone.setAttribute('y', participant.lifelineTopY);
      zone.setAttribute('width', '32');
      zone.setAttribute('height', Math.max(40, participant.lifelineBottomY - participant.lifelineTopY));
      zone.setAttribute('fill', '#000');
      zone.setAttribute('fill-opacity', '0.001');
      zone.setAttribute('stroke', 'none');
      zone.style.pointerEvents = 'all';
      zone.style.cursor = 'crosshair';
      this._overlay.appendChild(zone);

      zone.addEventListener('mouseenter', function () {
        if (self._dragging) return;
        self.clearHandles();
        for (var i = 0; i < slots.length; i++) {
          self._addHandle(svgEl, participant, slots[i], participantMap, ctx);
        }
      });

      zone.addEventListener('mouseleave', function (e) {
        var rel = e.relatedTarget;
        if (rel && rel.closest && rel.closest('#sequence-drag-overlay')) return;
        self.clearHandles();
      });

      this._hoverTargets.push(zone);
    },

    _addHandle: function (svgEl, participant, slot, participantMap, ctx) {
      var x = participant.cx;
      var y = slot.y;
      var self = this;

      var hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hit.setAttribute('class', 'sequence-plus-hit');
      hit.setAttribute('cx', x);
      hit.setAttribute('cy', y);
      hit.setAttribute('r', '18');
      hit.setAttribute('fill', '#000');
      hit.setAttribute('fill-opacity', '0.001');
      hit.setAttribute('stroke', 'none');
      hit.style.pointerEvents = 'all';
      hit.style.cursor = 'crosshair';
      this._overlay.appendChild(hit);

      var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'sequence-plus-btn');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '12');
      circle.setAttribute('fill', '#1565c0');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      circle.style.pointerEvents = 'none';
      this._overlay.appendChild(circle);

      var plus = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      plus.setAttribute('class', 'sequence-plus-label');
      plus.setAttribute('x', x);
      plus.setAttribute('y', y + 4);
      plus.setAttribute('text-anchor', 'middle');
      plus.setAttribute('fill', '#fff');
      plus.setAttribute('font-size', '16');
      plus.setAttribute('font-weight', '700');
      plus.style.pointerEvents = 'none';
      plus.textContent = '+';
      this._overlay.appendChild(plus);

      hit.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._startDrag(svgEl, participant.id, x, y, slot.insertIndex, participantMap, ctx);
      });

      this._handles.push(hit, circle, plus);
    },

    _startDrag: function (svgEl, fromId, startX, startY, insertIndex, participantMap, ctx) {
      var self = this;
      this._bringOverlayToFront(svgEl);
      this._dragging = true;
      ctx.setState({ portDragging: true });
      this.clearHandles();

      this._dragLine.setAttribute('x1', startX);
      this._dragLine.setAttribute('y1', startY);
      this._dragLine.setAttribute('x2', startX);
      this._dragLine.setAttribute('y2', startY);
      this._dragLine.style.display = '';

      var currentTarget = null;
      var pointerClientX = 0;
      var pointerClientY = 0;
      var autoPanFrame = null;

      var updateDragAtClient = function (clientX, clientY) {
        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, clientX, clientY);
        self._dragLine.setAttribute('x2', svgPt.x);
        self._dragLine.setAttribute('y2', startY);

        var target = self._findTarget(svgPt.x, svgPt.y, fromId, startY, participantMap);
        if (target !== currentTarget) {
          if (currentTarget) self._clearTargetHighlight(participantMap[currentTarget]);
          currentTarget = target;
          if (currentTarget) self._highlightTarget(participantMap[currentTarget]);
        }
      };

      var getAutoPanDelta = function (clientX, clientY) {
        var rect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        var threshold = 56;
        var maxStep = 8;
        var dx = 0;
        var dy = 0;
        var progress = 0;

        if (!rect) return { dx: 0, dy: 0 };

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

      var autoPanTick = function () {
        autoPanFrame = null;
        if (!ctx.getState().portDragging) return;

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
        updateDragAtClient(pointerClientX, pointerClientY);
        scheduleAutoPan();
      };

      var onUp = function (me) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        stopAutoPan();
        self._dragLine.style.display = 'none';
        self._targetLine.style.display = 'none';
        self._dragging = false;
        ctx.setState({ portDragging: false });

        if (currentTarget) self._clearTargetHighlight(participantMap[currentTarget]);

        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        var target = self._findTarget(svgPt.x, svgPt.y, fromId, startY, participantMap);
        if (target) {
          ctx.emit('add-sequence-message', {
            fromId: fromId,
            toId: target,
            text: 'new msg',
            insertIndex: insertIndex
          });
        }
      };

      var startScreenPt = SvgPositionTracker.svgToScreen(svgEl, startX, startY);
      pointerClientX = startScreenPt.x;
      pointerClientY = startScreenPt.y;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    _findTarget: function (x, y, fromId, rowY, participantMap) {
      var best = null;
      var bestDist = Infinity;
      var SNAP_X = 56;
      var SNAP_Y = 22;
      var ids = Object.keys(participantMap);

      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var p = participantMap[id];
        if (!p || !p.bbox) continue;

        var cx = p.cx;
        var dx = Math.abs(x - cx);
        var dy = Math.abs(y - rowY);
        if (dy < SNAP_Y && dx < SNAP_X && dx < bestDist) {
          bestDist = dx;
          best = id;
        }
      }

      return best;
    },

    _highlightTarget: function (el) {
      if (!el) return;
      if (el.el) {
        el.el.classList.add('sequence-participant-drag-target');
        this._targetLine.setAttribute('x1', el.cx);
        this._targetLine.setAttribute('x2', el.cx);
        this._targetLine.setAttribute('y1', el.lifelineTopY);
        this._targetLine.setAttribute('y2', el.lifelineBottomY);
        this._targetLine.style.display = '';
        return;
      }
      el.classList.add('sequence-participant-drag-target');
    },

    _clearTargetHighlight: function (el) {
      if (!el) return;
      if (el.el) {
        el.el.classList.remove('sequence-participant-drag-target');
        return;
      }
      el.classList.remove('sequence-participant-drag-target');
    },

    clearHandles: function () {
      for (var i = 0; i < this._handles.length; i++) this._handles[i].remove();
      this._handles = [];
    },

    _clearHoverTargets: function () {
      for (var i = 0; i < this._hoverTargets.length; i++) this._hoverTargets[i].remove();
      this._hoverTargets = [];
    },

    _bringOverlayToFront: function (svgEl) {
      if (this._overlay && this._overlay.parentNode === svgEl) {
        svgEl.appendChild(this._overlay);
      }
    }
  };

  global.SequenceMessageDragHandler = SequenceMessageDragHandler;

})(typeof window !== 'undefined' ? window : this);
