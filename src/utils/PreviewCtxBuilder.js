/**
 * PreviewCtxBuilder
 * MermaidPreview가 5개 핸들러(SvgNodeHandler, SvgEdgeHandler, SequenceSvgHandler,
 * PortDragHandler, SequenceMessageDragHandler)에 넘기는 ctx 객체를 한 곳에서 만든다.
 *
 * - build(vm, svgEl): postRenderSetup 시점의 full ctx (svgEl 의존 메서드 포함).
 * - buildLite(vm)  : toolbar/액션에서 쓰는 경량 ctx (svgEl 불필요).
 *
 * **시그니처 보존 약속**: ctx 메서드 이름·인자·반환값은 5개 핸들러가 의존하므로
 *   변경 금지. 이 파일은 기존 _buildCtx / _buildCtxLite 코드를 그대로 옮긴 것.
 *
 * StorageManager 스타일의 stateless plain object.
 */
(function (global) {
  'use strict';

  // 공통 ctx 파편 — full / lite 양쪽이 공유.
  function commonCtx(vm) {
    return {
      emit: function (ev, data) { vm.$emit(ev, data); },
      getState: function () { return vm.$data; },
      setState: function (patch) {
        var keys = Object.keys(patch);
        for (var i = 0; i < keys.length; i++) { vm[keys[i]] = patch[keys[i]]; }
      },
      getModel: function () { return vm.model; },
      findNode: function (nodeId) {
        var nodes = vm.model.nodes || [];
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].id === nodeId) return nodes[i];
        }
        return null;
      },
      findSequenceParticipant: function (participantId) {
        var participants = vm.model.participants || [];
        for (var i = 0; i < participants.length; i++) {
          if (participants[i].id === participantId) return participants[i];
        }
        return null;
      },
      findSequenceMessage: function (messageIndex) {
        var messages = vm.model.messages || [];
        return messages[messageIndex] || null;
      },
      focusEditInput: function () {
        vm.$nextTick(function () {
          var el = vm.$refs.editInput;
          if (el) { el.focus(); el.select(); }
        });
      },
      focusEdgeEditInput: function () {
        vm.$nextTick(function () {
          var el = vm.$refs.editEdgeInput;
          if (el) { el.focus(); el.select(); }
        });
      },
      focusSequenceParticipantInput: function () {
        vm.$nextTick(function () {
          var el = vm.$refs.sequenceParticipantInput;
          if (el) { el.focus(); el.select(); }
        });
      },
      focusSequenceMessageInput: function () {
        vm.$nextTick(function () {
          var el = vm.$refs.sequenceMessageInput;
          if (el) { el.focus(); el.select(); }
        });
      },
      openSequenceBranchEdit: function (statementIndex, text, clientX, clientY) {
        vm.sequenceToolbar = null;
        vm.editingSequenceBlockId = null;
        vm.editingSequenceBranchStatementIndex = statementIndex;
        vm.editingSequenceBlockText = text || '';
        vm.sequenceBlockEditStyle = {
          position: 'fixed',
          left: Math.max(12, clientX - 110) + 'px',
          top: Math.max(12, clientY - 22) + 'px',
          zIndex: 1000,
          width: '220px'
        };
        vm.$nextTick(function () {
          var el = vm.$refs.sequenceBlockInput;
          if (el) { el.focus(); el.select(); }
        });
      },
      openSequenceBlockEdit: function (blockId, text, clientX, clientY) {
        vm.sequenceToolbar = null;
        vm.selectedSequenceBlockId = blockId;
        vm.editingSequenceBlockId = blockId;
        vm.editingSequenceBlockText = text || '';
        vm.sequenceBlockEditStyle = {
          position: 'fixed',
          left: Math.max(12, clientX - 110) + 'px',
          top: Math.max(12, clientY - 22) + 'px',
          zIndex: 1000,
          width: '220px'
        };
        vm.$nextTick(function () {
          var el = vm.$refs.sequenceBlockInput;
          if (el) { el.focus(); el.select(); }
        });
      }
    };
  }

  // postRenderSetup용 full ctx — selection watcher와 viewport 의존 메서드 포함.
  // (기존 _buildCtx에 getPreviewRect가 line 706/736 두 번 정의돼 있던 버그 동시 수정.
  //  본문이 동일했으므로 동작 차이 없음.)
  function build(vm, svgEl) {
    var ctx = commonCtx(vm);

    ctx.watchSelection = function (nodeId, nodeEl) {
      vm.$watch('selectedNodeId', function (val) {
        nodeEl.classList.toggle('selected', val === nodeId);
      }, { immediate: true });
    };

    ctx.watchEdgeSelection = function (edgeIndex, edgeEl) {
      vm.$watch('selectedEdgeIndex', function (val) {
        if (edgeEl) {
          var isSelected = val === edgeIndex;
          if (edgeEl.classList) {
            edgeEl.classList.toggle('edge-selected', isSelected);
            edgeEl.classList.toggle('edge-hovered', isSelected);
          }
          var edgePaths = edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
          for (var i = 0; i < edgePaths.length; i++) {
            edgePaths[i].classList.toggle('edge-selected', isSelected);
            edgePaths[i].classList.toggle('edge-hovered', isSelected);
          }
        }
      }, { immediate: true });
    };

    ctx.watchSequenceParticipantSelection = function (participantId, el) {
      vm.$watch('selectedSequenceParticipantId', function (val) {
        el.classList.toggle('sequence-participant-selected', val === participantId);
      }, { immediate: true });
    };

    ctx.watchSequenceMessageSelection = function (messageIndex, lineEl, textEl) {
      vm.$watch('selectedSequenceMessageIndex', function (val) {
        if (lineEl) lineEl.classList.toggle('sequence-message-selected', val === messageIndex);
        if (textEl) textEl.classList.toggle('sequence-message-text-selected', val === messageIndex);
      }, { immediate: true });
    };

    ctx.watchSequenceMessageHitSelection = function (messageIndex, hitEl) {
      vm.$watch('selectedSequenceMessageIndex', function (val) {
        if (hitEl && hitEl.classList) {
          hitEl.classList.toggle('sequence-hit-selected', val === messageIndex);
        }
      }, { immediate: true });
    };

    ctx.watchSequenceMessageMultiSelection = function (messageIndex, lineEl, textEl, hitEl) {
      vm.$watch('selectedSequenceMessageIndices', function (val) {
        var selected = Array.isArray(val) && val.indexOf(messageIndex) !== -1;
        if (lineEl) lineEl.classList.toggle('sequence-message-multi-selected', selected);
        if (textEl) textEl.classList.toggle('sequence-message-text-multi-selected', selected);
        if (hitEl && hitEl.classList) hitEl.classList.toggle('sequence-hit-multi-selected', selected);
      }, { immediate: true, deep: true });
    };

    ctx.watchSequenceBlockSelection = function (blockId, el) {
      vm.$watch('selectedSequenceBlockId', function (val) {
        if (el && el.classList) {
          el.classList.toggle('sequence-block-badge--selected', val === blockId);
        }
      }, { immediate: true });
    };

    ctx.watchSequenceSelectionHighlight = (function () {
      var registered = false;
      return function () {
        if (registered) return;
        registered = true;
        vm.$watch('selectedSequenceMessageIndices', function (val) {
          if (!val || !val.length) SequenceBlockHandler.hideSelectionHighlight();
        }, { deep: true });
      };
    }());

    ctx.getPreviewRect = function () {
      return vm.$refs.canvas && vm.$refs.canvas.getBoundingClientRect
        ? vm.$refs.canvas.getBoundingClientRect()
        : (vm.$el && vm.$el.getBoundingClientRect ? vm.$el.getBoundingClientRect() : null);
    };

    ctx.panPreviewBy = function (dx, dy) {
      if (!vm._svgEl) return;
      if (!dx && !dy) return;
      vm.panX += dx || 0;
      vm.panY += dy || 0;
      vm._applyTransform();
    };

    return ctx;
  }

  // toolbar/액션용 — postRenderSetup 바깥에서 ctx만 필요한 경로.
  function buildLite(vm) {
    return commonCtx(vm);
  }

  global.PreviewCtxBuilder = {
    build: build,
    buildLite: buildLite
  };

})(typeof window !== 'undefined' ? window : this);
