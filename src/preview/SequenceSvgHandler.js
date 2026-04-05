(function (global) {
  'use strict';

  function getMessageOperatorBase(operator) {
    var suffix = '';
    if (/[+-]$/.test(operator)) {
      suffix = operator.slice(-1);
      operator = operator.slice(0, -1);
    }
    return { base: operator || '->>', suffix: suffix };
  }

  var SequenceSvgHandler = {
    attach: function (svgEl, model, ctx) {
      var participantMap = SequencePositionTracker.collectParticipants(svgEl, model);
      var participantTargets = SequencePositionTracker.collectParticipantTargets(svgEl, model);
      var messages = SequencePositionTracker.collectMessages(svgEl, model);
      participantMap = SequencePositionTracker.refineParticipantLifelines(participantMap, messages);
      var insertSlots = SequencePositionTracker.collectInsertSlots(participantMap, messages);

      SequenceMessageDragHandler.initOverlay(svgEl);
      SequenceMessageDragHandler.attach(svgEl, participantMap, insertSlots, ctx);
      SequenceSvgHandler._attachParticipants(participantTargets, svgEl, ctx);
      SequenceSvgHandler._attachMessages(messages, svgEl, ctx);
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
          sequenceToolbar: {
            type: 'participant',
            id: data.id,
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

    _attachMessages: function (messages, svgEl, ctx) {
      for (var i = 0; i < messages.length; i++) {
        SequenceSvgHandler._attachMessage(messages[i], svgEl, ctx);
      }
    },

    _attachMessage: function (data, svgEl, ctx) {
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

      hitEl.addEventListener('mouseenter', function () {
        if (visualEl) visualEl.classList.add('sequence-message-hovered');
        if (textEl) textEl.classList.add('sequence-message-text-hovered');
      });
      hitEl.addEventListener('mouseleave', function () {
        if (visualEl) visualEl.classList.remove('sequence-message-hovered');
        if (textEl) textEl.classList.remove('sequence-message-text-hovered');
      });

      ctx.watchSequenceMessageSelection(data.index, visualEl, textEl);
      if (ctx.watchSequenceMessageHitSelection) {
        ctx.watchSequenceMessageHitSelection(data.index, hitEl);
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

    startParticipantEdit: function (participantId, participantEl, ctx) {
      var participant = ctx.findSequenceParticipant(participantId);
      if (!participant) return;
      var rect = participantEl.getBoundingClientRect();

      ctx.setState({
        sequenceToolbar: null,
        editingSequenceParticipantId: participantId,
        editingSequenceParticipantText: participant.label || participant.id,
        sequenceParticipantEditStyle: {
          position: 'fixed',
          left: (rect.left + rect.width / 2 - 90) + 'px',
          top: (rect.top + rect.height / 2 - 18) + 'px',
          zIndex: 1000,
          width: Math.max(160, rect.width + 28) + 'px'
        }
      });
      ctx.focusSequenceParticipantInput();
    },

    startMessageEdit: function (messageIndex, clientX, clientY, svgEl, ctx) {
      var message = ctx.findSequenceMessage(messageIndex);
      if (!message) return;
      ctx.setState({
        sequenceToolbar: null,
        editingSequenceMessageIndex: messageIndex,
        editingSequenceMessageText: message.text || '',
        sequenceMessageEditStyle: {
          position: 'fixed',
          left: (clientX - 110) + 'px',
          top: (clientY - 22) + 'px',
          zIndex: 1000,
          width: '220px'
        }
      });
      ctx.focusSequenceMessageInput();
    },

    toggleMessageLineType: function (message) {
      var parts = getMessageOperatorBase(message.operator || '->>');
      var nextBase = parts.base;
      if (parts.base === '->>') nextBase = '-->>';
      else if (parts.base === '-->>') nextBase = '->>';
      else if (parts.base === '->') nextBase = '-->';
      else if (parts.base === '-->') nextBase = '->';
      return nextBase + parts.suffix;
    }
  };

  global.SequenceSvgHandler = SequenceSvgHandler;

})(typeof window !== 'undefined' ? window : this);
