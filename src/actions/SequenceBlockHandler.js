(function (global) {
  'use strict';

  var SequenceBlockHandler = {
    _overlay: null,
    _selectionRect: null,
    _selectionHighlight: null,

    initOverlay: function (svgEl) {
      var old = svgEl.querySelector('#sequence-block-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'sequence-block-overlay');
      overlay.style.pointerEvents = 'none';
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var selectionRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionRect.setAttribute('class', 'sequence-block-selection-rect');
      selectionRect.style.display = 'none';
      selectionRect.style.pointerEvents = 'none';
      overlay.appendChild(selectionRect);
      this._selectionRect = selectionRect;

      var selectionHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionHighlight.setAttribute('class', 'sequence-block-selection-highlight');
      selectionHighlight.style.display = 'none';
      selectionHighlight.style.pointerEvents = 'none';
      overlay.appendChild(selectionHighlight);
      this._selectionHighlight = selectionHighlight;
    },

    hideSelectionHighlight: function () {
      if (this._selectionHighlight) this._selectionHighlight.style.display = 'none';
    },

    _showSelectionHighlight: function (bbox) {
      if (!this._selectionHighlight || !bbox) return;
      this._selectionHighlight.setAttribute('x', bbox.x);
      this._selectionHighlight.setAttribute('y', bbox.y);
      this._selectionHighlight.setAttribute('width', bbox.width);
      this._selectionHighlight.setAttribute('height', bbox.height);
      this._selectionHighlight.style.display = '';
    },

    _getSelectionBBox: function (selectedIndices, messages) {
      var pad = 12;
      var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (var i = 0; i < messages.length; i++) {
        if (selectedIndices.indexOf(messages[i].index) === -1) continue;
        var box = messages[i].hitBox || messages[i].bbox;
        if (!box) continue;
        left   = Math.min(left,   box.x);
        top    = Math.min(top,    box.y);
        right  = Math.max(right,  box.x + box.width);
        bottom = Math.max(bottom, box.y + box.height);
      }
      if (!isFinite(left)) return null;
      return { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
    },

    attach: function (svgEl, model, ctx) {
      if (!this._overlay) this.initOverlay(svgEl);
      this._bringOverlayToFront(svgEl);

      var messages = SequencePositionTracker.collectMessages(svgEl, model);
      this._renderBlockBadges(svgEl, model, ctx);
      this._attachSelection(svgEl, messages, ctx);

      if (ctx.watchSequenceSelectionHighlight) {
        ctx.watchSequenceSelectionHighlight();
      }
    },

    _attachSelection: function (svgEl, messages, ctx) {
      var self = this;

      svgEl.addEventListener('contextmenu', function (e) {
        if (e.target && e.target.closest && e.target.closest('#sequence-block-overlay .sequence-block-badge-hit')) return;
        e.preventDefault();
      });

      svgEl.addEventListener('mousedown', function (e) {
        if (e.button !== 2) return;
        if (e.target && e.target.closest && e.target.closest('.sequence-block-badge-hit')) return;
        e.preventDefault();
        e.stopPropagation();

        var start = SvgPositionTracker.getSVGPoint(svgEl, e.clientX, e.clientY);
        var currentSelection = [];

        self._selectionRect.style.display = '';
        self._updateSelectionRect(start, start);

        var onMove = function (me) {
          var current = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
          self._updateSelectionRect(start, current);
          currentSelection = self._collectSelectedMessages(start, current, messages);
          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceBlockId: null,
            selectedSequenceMessageIndices: currentSelection.slice(),
            sequenceToolbar: null
          });
        };

        var onUp = function () {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          self._selectionRect.style.display = 'none';

          if (!currentSelection.length) {
            self.hideSelectionHighlight();
            ctx.setState({
              selectedSequenceMessageIndices: [],
              selectedSequenceBlockId: null
            });
            return;
          }

          var selBBox = self._getSelectionBBox(currentSelection, messages);
          self._showSelectionHighlight(selBBox);

          var toolbarPos = { x: 0, y: 0 };
          if (selBBox) {
            var center = SvgPositionTracker.svgToScreen(svgEl, selBBox.x + selBBox.width / 2, selBBox.y);
            toolbarPos.x = center.x;
            toolbarPos.y = center.y;
          }

          var enclosing = SequenceStatementUtils.findEnclosingBranchBlock(
            ctx.getModel ? ctx.getModel() : null,
            currentSelection
          );

          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceBlockId: null,
            selectedSequenceMessageIndices: currentSelection.slice(),
            sequenceToolbar: {
              type: 'selection',
              messageIndices: currentSelection.slice(),
              parentKind: enclosing ? enclosing.kind : null,
              x: toolbarPos.x,
              y: toolbarPos.y
            }
          });
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    },

    _collectSelectedMessages: function (start, current, messages) {
      var left = Math.min(start.x, current.x);
      var right = Math.max(start.x, current.x);
      var top = Math.min(start.y, current.y);
      var bottom = Math.max(start.y, current.y);
      var selected = [];

      for (var i = 0; i < messages.length; i++) {
        var box = messages[i].hitBox || messages[i].bbox;
        if (!box) continue;
        var intersects = !(
          box.x + box.width < left ||
          box.x > right ||
          box.y + box.height < top ||
          box.y > bottom
        );
        if (intersects) selected.push(messages[i].index);
      }

      return selected;
    },

    _updateSelectionRect: function (start, current) {
      var left = Math.min(start.x, current.x);
      var top = Math.min(start.y, current.y);
      var width = Math.abs(current.x - start.x);
      var height = Math.abs(current.y - start.y);
      this._selectionRect.setAttribute('x', left);
      this._selectionRect.setAttribute('y', top);
      this._selectionRect.setAttribute('width', width);
      this._selectionRect.setAttribute('height', height);
    },

    _renderBlockBadges: function (svgEl, model, ctx) {
      var blocks = SequenceStatementUtils.listBlocks(model && model.statements);
      var labelTextEls = Array.prototype.slice.call(svgEl.querySelectorAll('.labelText'));
      var allLoopTextEls = Array.prototype.slice.call(svgEl.querySelectorAll('.loopText'));
      var loopCursor = 0;
      var stmts = model && model.statements;

      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var labelEl = labelTextEls[i] || null;
        // loopText가 statements보다 적을 수 있으므로 범위 체크
        var mainTitleEl = loopCursor < allLoopTextEls.length ? allLoopTextEls[loopCursor++] : null;

        var branchTitleEls = [];
        var branchStatements = [];
        for (var b = 0; b < block.branchIndices.length; b++) {
          branchTitleEls.push(loopCursor < allLoopTextEls.length ? allLoopTextEls[loopCursor++] : null);
          var si = block.branchIndices[b];
          branchStatements.push(stmts && stmts[si] ? stmts[si] : {});
        }

        this._attachBlockElementInteractions(svgEl, block, labelEl, mainTitleEl, branchTitleEls, branchStatements, ctx);
      }
    },

    _attachBlockElementInteractions: function (svgEl, block, labelEl, titleEl, branchTitleEls, branchStatements, ctx) {
      // labelText의 부모 그룹(labelBox rect 포함)을 클릭 → toolbar
      var labelGroup = labelEl && (labelEl.closest ? labelEl.closest('g') : labelEl.parentNode);
      if (labelGroup) {
        labelGroup.style.cursor = 'pointer';
        labelGroup.style.pointerEvents = 'all';
        labelGroup.addEventListener('click', function (e) {
          e.stopPropagation();
          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceMessageIndices: [],
            selectedSequenceBlockId: block.id,
            sequenceToolbar: {
              type: 'block',
              blockId: block.id,
              kind: block.kind,
              text: block.text || '',
              hasBranches: block.branchIndices.length > 0,
              x: e.clientX,
              y: e.clientY
            }
          });
        });
        if (ctx.watchSequenceBlockSelection) {
          ctx.watchSequenceBlockSelection(block.id, labelGroup);
        }
      }

      // 메인 title(loopText) 클릭 → 블록 텍스트 inline edit
      if (titleEl) {
        titleEl.style.cursor = 'text';
        titleEl.style.pointerEvents = 'all';
        titleEl.addEventListener('click', function (e) {
          e.stopPropagation();
          if (ctx.openSequenceBlockEdit) {
            ctx.openSequenceBlockEdit(block.id, block.text || '', e.clientX, e.clientY);
          }
        });
      }

      // 분기 title(loopText) 클릭 → 분기 텍스트 inline edit
      for (var b = 0; b < branchTitleEls.length; b++) {
        (function (branchEl, statementIndex, branchStmt) {
          if (!branchEl) return;
          branchEl.style.cursor = 'text';
          branchEl.style.pointerEvents = 'all';
          branchEl.addEventListener('click', function (e) {
            e.stopPropagation();
            if (ctx.openSequenceBranchEdit) {
              ctx.openSequenceBranchEdit(statementIndex, branchStmt.text || '', e.clientX, e.clientY);
            }
          });
        }(branchTitleEls[b], block.branchIndices[b], branchStatements[b] || {}));
      }
    },

    _bringOverlayToFront: function (svgEl) {
      if (this._overlay && this._overlay.parentNode === svgEl) {
        svgEl.appendChild(this._overlay);
      }
    }
  };

  global.SequenceBlockHandler = SequenceBlockHandler;

})(typeof window !== 'undefined' ? window : this);
