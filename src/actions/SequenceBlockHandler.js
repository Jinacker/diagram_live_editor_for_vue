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

    _getSelectionBBox: function (selectedIndices, messages, selectedNoteStatementIndices, notes) {
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
      for (var j = 0; j < (notes || []).length; j++) {
        if ((selectedNoteStatementIndices || []).indexOf(notes[j].statementIndex) === -1) continue;
        var nbox = notes[j].bbox;
        if (!nbox) continue;
        left   = Math.min(left,   nbox.x);
        top    = Math.min(top,    nbox.y);
        right  = Math.max(right,  nbox.x + nbox.width);
        bottom = Math.max(bottom, nbox.y + nbox.height);
      }
      if (!isFinite(left)) return null;
      return { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
    },

    attach: function (svgEl, model, ctx, canvas) {
      if (!this._overlay) this.initOverlay(svgEl);
      this._bringOverlayToFront(svgEl);

      var participantMap = SequencePositionTracker.collectParticipants(svgEl, model);
      var messages = SequencePositionTracker.collectMessages(svgEl, model);
      var notes    = SequencePositionTracker.collectNotePositions(svgEl, model);
      this._renderBlockBadges(svgEl, model, participantMap, ctx, messages, notes);
      this._attachSelection(svgEl, messages, notes, ctx, canvas);

      if (ctx.watchSequenceSelectionHighlight) {
        ctx.watchSequenceSelectionHighlight();
      }
    },

    _attachSelection: function (svgEl, messages, notes, ctx, canvas) {
      var self = this;

      // contextmenu는 svgEl과 canvas 모두 차단
      var suppressCtx = function (e) {
        if (e.target && e.target.closest && e.target.closest('#sequence-block-overlay .sequence-block-badge-hit')) return;
        e.preventDefault();
      };
      svgEl.addEventListener('contextmenu', suppressCtx);
      if (canvas) canvas.addEventListener('contextmenu', suppressCtx, true);

      // mousedown 리스너는 canvas(여백 포함)와 svgEl 양쪽에 붙인다.
      // canvas가 없으면 svgEl에만 붙임.
      var dragTarget = canvas || svgEl;
      dragTarget.addEventListener('mousedown', function (e) {
        if (e.button !== 2) return;
        if (e.target && e.target.closest && e.target.closest('.sequence-block-badge-hit')) return;
        // badge 영역의 우클릭은 배지 자체 핸들러로 위임
        e.preventDefault();
        e.stopPropagation();

        var start = SvgPositionTracker.getSVGPoint(svgEl, e.clientX, e.clientY);
        var currentSelection = [];
        var currentNoteSelection = [];

        self._selectionRect.style.display = '';
        self._updateSelectionRect(start, start);

        var onMove = function (me) {
          var current = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
          self._updateSelectionRect(start, current);
          currentSelection = self._collectSelectedMessages(start, current, messages);
          currentNoteSelection = self._collectSelectedNotes(start, current, notes);
          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceBlockId: null,
            selectedSequenceMessageIndices: currentSelection.slice(),
            selectedNoteStatementIndices: currentNoteSelection.slice(),
            sequenceToolbar: null
          });
        };

        var onUp = function () {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          self._selectionRect.style.display = 'none';

          if (!currentSelection.length && !currentNoteSelection.length) {
            self.hideSelectionHighlight();
            ctx.setState({
              selectedSequenceMessageIndices: [],
              selectedNoteStatementIndices: [],
              selectedSequenceBlockId: null
            });
            return;
          }

          var selBBox = self._getSelectionBBox(currentSelection, messages, currentNoteSelection, notes);
          self._showSelectionHighlight(selBBox);

          var toolbarPos = { x: 0, y: 0 };
          if (selBBox) {
            var center = SvgPositionTracker.svgToScreen(svgEl, selBBox.x + selBBox.width / 2, selBBox.y);
            toolbarPos.x = center.x;
            toolbarPos.y = center.y;
          }

          var enclosing = SequenceStatementUtils.findEnclosingBranchBlock(
            ctx.getModel ? ctx.getModel() : null,
            currentSelection,
            currentNoteSelection
          );

          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceBlockId: null,
            selectedSequenceMessageIndices: currentSelection.slice(),
            selectedNoteStatementIndices: currentNoteSelection.slice(),
            sequenceToolbar: {
              type: 'selection',
              messageIndices: currentSelection.slice(),
              noteStatementIndices: currentNoteSelection.slice(),
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

    _collectSelectedNotes: function (start, current, notes) {
      var left = Math.min(start.x, current.x);
      var right = Math.max(start.x, current.x);
      var top = Math.min(start.y, current.y);
      var bottom = Math.max(start.y, current.y);
      var selected = [];

      for (var i = 0; i < (notes || []).length; i++) {
        var box = notes[i].bbox;
        if (!box) continue;
        var intersects = !(
          box.x + box.width < left ||
          box.x > right ||
          box.y + box.height < top ||
          box.y > bottom
        );
        if (intersects) selected.push(notes[i].statementIndex);
      }
      return selected;
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

    _renderBlockBadges: function (svgEl, model, participantMap, ctx, messages, notes) {
      var blocks = SequenceStatementUtils.listBlocks(model && model.statements);
      var labelTextEls = this._sortTextElementsByPosition(Array.prototype.slice.call(svgEl.querySelectorAll('.labelText')), svgEl);
      var allLoopTextEls = this._sortTextElementsByPosition(Array.prototype.slice.call(svgEl.querySelectorAll('.loopText')), svgEl);
      var usedLoopIndices = {};
      var stmts = model && model.statements;
      var stmtYByIndex = this._collectStatementYByIndex(model, messages, notes);
      var blockBindings = [];

      // block title + 버튼용 overlay 및 공유 hover 상태
      var oldBtnOverlay = svgEl.querySelector('#sequence-block-insert-overlay');
      if (oldBtnOverlay) oldBtnOverlay.remove();
      var btnOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      btnOverlay.setAttribute('id', 'sequence-block-insert-overlay');
      svgEl.appendChild(btnOverlay);

      var shared = { btns: null, hideTimer: null };
      function sharedCancelHide() {
        if (shared.hideTimer !== null) { clearTimeout(shared.hideTimer); shared.hideTimer = null; }
      }
      function sharedHideNow() {
        sharedCancelHide();
        if (shared.btns) {
          for (var k = 0; k < shared.btns.length; k++) shared.btns[k].remove();
          shared.btns = null;
        }
        if (svgEl.dataset) delete svgEl.dataset.blockBtnActive;
      }
      // message/note 버튼과 상호 억제를 위해 현재 hide 함수를 static으로 노출
      SequenceBlockHandler._currentHideBlockNow = sharedHideNow;
      function sharedScheduleHide() {
        sharedCancelHide();
        shared.hideTimer = setTimeout(function () { sharedHideNow(); }, 500);
      }

      // 1차: 모든 block의 메인 title(loop/alt/opt/par text)을 먼저 예약한다.
      // nested loop title이 outer alt의 branch title로 잘못 소비되지 않도록 한다.
      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var labelEl = labelTextEls[i] || null;
        var mainTitleEl = this._findMatchingLoopText(svgEl, labelEl, allLoopTextEls, usedLoopIndices);
        blockBindings.push({
          block: block,
          labelEl: labelEl,
          mainTitleEl: mainTitleEl
        });
      }

      // 2차: 모든 블록의 branch를 statementIndex 순서로 모아 Y순 loopText와 1:1 매칭한다.
      // depth-first 처리는 순차 배치된 블록(loop 안 alt, opt 안 alt 등)에서 loopText를
      // 잘못 소비하는 문제가 있으므로, SVG 렌더 순서(= statementIndex 순서)로 통합 처리한다.

      // 분기 클릭 라우팅용 데이터 수집
      var allBranchClickRanges = [];
      var branchElRefs = [];
      var allBranchItems = [];

      // 모든 블록의 branch를 statementIndex 순서로 수집
      var allBranchAssignments = [];
      for (var j = 0; j < blockBindings.length; j++) {
        var bb = blockBindings[j].block;
        for (var b = 0; b < bb.branchIndices.length; b++) {
          allBranchAssignments.push({ bindingIdx: j, branchIdx: b, si: bb.branchIndices[b] });
        }
      }
      allBranchAssignments.sort(function (a, c) { return a.si - c.si; });

      // statementIndex 순서로 loopText 할당 → SVG Y순서와 일치
      var branchElByStmt = {};
      for (var ai = 0; ai < allBranchAssignments.length; ai++) {
        var assign = allBranchAssignments[ai];
        var btelEl = this._findNextUnusedLoopText(allLoopTextEls, usedLoopIndices);
        branchElByStmt[assign.si] = btelEl;

        var bBlock = blockBindings[assign.bindingIdx].block;
        var fallbackBranchY = this._estimateBranchSeparatorY(bBlock, assign.branchIdx, stmtYByIndex);
        var fallbackTitleBox = this._getElementBBoxInSvg(svgEl, blockBindings[assign.bindingIdx].mainTitleEl);
        var fallbackTitleCx = fallbackTitleBox ? (fallbackTitleBox.x + fallbackTitleBox.width / 2) : null;
        var bInfo = {
          blockId: bBlock.id,
          statementIndex: assign.si,
          text: (stmts && stmts[assign.si] ? stmts[assign.si].text : '') || ''
        };
        allBranchItems.push(bInfo);

        if (btelEl) {
          branchElRefs.push({ el: btelEl, info: bInfo });
          if (btelEl.getBBox) {
            try {
              var bbb = this._getElementBBoxInSvg(svgEl, btelEl);
              if (!bbb) continue;
              var rangeY = fallbackBranchY !== null && fallbackBranchY !== undefined
                ? fallbackBranchY
                : (bbb.y + Math.max(bbb.height, 16) / 2);
              var rangeCx = fallbackTitleCx !== null ? fallbackTitleCx : (bbb.x + bbb.width / 2);
              var rangeHalfWidth = Math.max(90, (bbb.width + 48) / 2);
              allBranchClickRanges.push(Object.assign({
                el: btelEl,
                xMin: rangeCx - rangeHalfWidth,
                xMax: rangeCx + rangeHalfWidth,
                yMin: rangeY - 16,
                yMax: rangeY + 16
              }, bInfo));
            } catch (eBBox) {}
          }
        } else if (fallbackBranchY !== null && fallbackBranchY !== undefined) {
          var fallbackHalfWidth = fallbackTitleBox ? Math.max(90, (fallbackTitleBox.width + 48) / 2) : 90;
          allBranchClickRanges.push(Object.assign({
            xMin: fallbackTitleCx !== null ? fallbackTitleCx - fallbackHalfWidth : undefined,
            xMax: fallbackTitleCx !== null ? fallbackTitleCx + fallbackHalfWidth : undefined,
            yMin: fallbackBranchY - 16,
            yMax: fallbackBranchY + 16
          }, bInfo));
        }
      }

      // 안전 필터: Mermaid가 else/and loopText를 block label과 같은 SVG 그룹에
      // 넣는 경우가 있어, 부모가 아니라 실제 main title element만 제거한다.
      var mainTitleEls = [];
      for (var mpi = 0; mpi < blockBindings.length; mpi++) {
        if (blockBindings[mpi].mainTitleEl) mainTitleEls.push(blockBindings[mpi].mainTitleEl);
      }
      if (mainTitleEls.length) {
        branchElRefs = branchElRefs.filter(function (ref) {
          return mainTitleEls.indexOf(ref.el) === -1;
        });
        allBranchClickRanges = allBranchClickRanges.filter(function (range) {
          return !range.el || mainTitleEls.indexOf(range.el) === -1;
        });
      }

      // 각 블록에 이벤트 부착 (block-level 처리 순서는 statementIndex 기준)
      var sortedBindings = blockBindings.slice().sort(function (a, b) {
        return a.block.statementIndex - b.block.statementIndex;
      });

      for (var j = 0; j < sortedBindings.length; j++) {
        var binding = sortedBindings[j];
        var boundBlock = binding.block;
        var branchTitleEls = [];
        var branchStatements = [];
        for (var b = 0; b < boundBlock.branchIndices.length; b++) {
          var si = boundBlock.branchIndices[b];
          branchTitleEls.push(branchElByStmt[si] || null);
          branchStatements.push(stmts && stmts[si] ? stmts[si] : {});
        }

        this._attachBlockElementInteractions(
          svgEl,
          boundBlock,
          binding.labelEl,
          binding.mainTitleEl,
          branchTitleEls,
          branchStatements,
          ctx,
          model,
          participantMap,
          stmtYByIndex,
          btnOverlay,
          shared,
          sharedCancelHide,
          sharedHideNow,
          sharedScheduleHide
        );
      }

      // participant hover zone 등 overlay가 else/and 텍스트를 가릴 수 있으므로
      // svgEl에 capture 단계 리스너를 달아 어떤 element보다 먼저 분기 클릭을 잡는다.
      // 전략1(Y범위) → 전략2(element identity) → 전략3(텍스트 매칭) 순서로 시도
      if (allBranchItems.length) {
        var branchMouseDownHandled = false;
        var findBranchRangeMatch = function (e, requireX) {
          if (!allBranchClickRanges.length) return null;
          var svgPt = SvgPositionTracker.getSVGPoint(svgEl, e.clientX, e.clientY);
          if (!svgPt) return null;

          var bestRange = null, bestRangeDist = Infinity;
          for (var ri = 0; ri < allBranchClickRanges.length; ri++) {
            var range = allBranchClickRanges[ri];
            if (svgPt.y < range.yMin || svgPt.y > range.yMax) continue;
            if (requireX) {
              if (range.xMin === undefined || range.xMax === undefined) continue;
              if (svgPt.x < range.xMin || svgPt.x > range.xMax) continue;
            }

            var midY = (range.yMin + range.yMax) / 2;
            var midX = (range.xMin !== undefined && range.xMax !== undefined) ? (range.xMin + range.xMax) / 2 : svgPt.x;
            var dist = Math.abs(svgPt.y - midY) + Math.abs(svgPt.x - midX) * 0.2;
            if (dist < bestRangeDist) { bestRangeDist = dist; bestRange = range; }
          }
          return bestRange;
        };
        var openMatchedBranchToolbar = function (e, matched, preventDefault) {
          if (preventDefault) e.preventDefault();
          e.stopPropagation();
          ctx.setState({
            selectedSequenceParticipantId: null,
            selectedSequenceMessageIndex: null,
            selectedSequenceMessageIndices: [],
            selectedSequenceBlockId: matched.blockId,
            sequenceToolbar: {
              type: 'branch-title',
              blockId: matched.blockId,
              statementIndex: matched.statementIndex,
              text: matched.text,
              x: e.clientX,
              y: e.clientY
            }
          });
        };
        var suppressNextDocumentClick = function () {
          var suppressClick = function (clickEvent) {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            document.removeEventListener('click', suppressClick, true);
          };
          document.addEventListener('click', suppressClick, true);
        };

        svgEl.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          var downMatched = findBranchRangeMatch(e, true);
          if (!downMatched) return;
          branchMouseDownHandled = true;
          openMatchedBranchToolbar(e, downMatched, true);
          suppressNextDocumentClick();
        }, true);

        svgEl.addEventListener('click', function (e) {
          try {
            if (branchMouseDownHandled) {
              branchMouseDownHandled = false;
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            var matched = null;

            // 전략1: element identity — 클릭 위치의 element가 branch loopText 본체인지 직접 확인
            if (!matched && branchElRefs.length && document.elementsFromPoint) {
              var pointEls = document.elementsFromPoint(e.clientX, e.clientY);
              outer: for (var pi = 0; pi < pointEls.length; pi++) {
                for (var bi = 0; bi < branchElRefs.length; bi++) {
                  if (pointEls[pi] === branchElRefs[bi].el) {
                    matched = branchElRefs[bi].info; break outer;
                  }
                }
              }
            }

            // 전략2: pre-computed Y 범위 (element identity 실패 시 fallback)
            if (!matched && allBranchClickRanges.length) {
              matched = findBranchRangeMatch(e, true);
            }

            // 전략3: 텍스트 내용 매칭 (loopText 클래스 한정), 중복 텍스트는 Y위치로 가장 가까운 것 선택
            if (!matched && allBranchItems.length && document.elementsFromPoint) {
              var pointEls3 = document.elementsFromPoint(e.clientX, e.clientY);
              outer3: for (var pi3 = 0; pi3 < pointEls3.length; pi3++) {
                var pel = pointEls3[pi3];
                if (!pel || !pel.classList || !pel.classList.contains('loopText')) continue;
                var pelText = pel.textContent ? pel.textContent.trim().replace(/^\[|\]$/g, '') : '';
                var pelY = null;
                try {
                  var pelBox = SequenceBlockHandler._getElementBBoxInSvg(svgEl, pel);
                  pelY = pelBox ? pelBox.y : null;
                } catch (eY) {}

                var textMatches = [];
                for (var bi3 = 0; bi3 < allBranchItems.length; bi3++) {
                  if (allBranchItems[bi3].text && pelText === allBranchItems[bi3].text) {
                    textMatches.push(allBranchItems[bi3]);
                  }
                }
                if (textMatches.length === 1) {
                  matched = textMatches[0]; break outer3;
                } else if (textMatches.length > 1 && pelY !== null) {
                  // 중복 텍스트: allBranchClickRanges Y 중심과 pelY 거리 기준으로 가장 가까운 것 선택
                  var bestMatch = null, bestDist3 = Infinity;
                  for (var ti = 0; ti < textMatches.length; ti++) {
                    for (var ri3 = 0; ri3 < allBranchClickRanges.length; ri3++) {
                      if (allBranchClickRanges[ri3].statementIndex === textMatches[ti].statementIndex) {
                        var midY3 = (allBranchClickRanges[ri3].yMin + allBranchClickRanges[ri3].yMax) / 2;
                        var d3 = Math.abs(pelY - midY3);
                        if (d3 < bestDist3) { bestDist3 = d3; bestMatch = textMatches[ti]; }
                        break;
                      }
                    }
                  }
                  if (bestMatch) { matched = bestMatch; break outer3; }
                }
              }
            }

            if (matched) {
              openMatchedBranchToolbar(e, matched, false);
            }
          } catch (eCapture) {}
        }, true); // capture 단계 — overlay보다 먼저 실행
      }

      // 3차: recognized 블록이 소비하지 못한 나머지 labelText = critical/break/box 등
      // 미지원 문법. 클릭 시 안내 alert만 표시한다.
      for (var k = blocks.length; k < labelTextEls.length; k++) {
        var unusedEl = labelTextEls[k];
        var unusedGroup = unusedEl && (unusedEl.closest ? unusedEl.closest('g') : unusedEl.parentNode);
        if (!unusedGroup) continue;
        unusedGroup.style.cursor = 'pointer';
        unusedGroup.style.pointerEvents = 'all';
        unusedGroup.addEventListener('click', function (e) {
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
      }
    },

    _collectStatementYByIndex: function (model, messages, notes) {
      var stmts = (model && model.statements) || [];
      var byIndex = {};
      var msgCursor = 0;

      for (var i = 0; i < stmts.length; i++) {
        var stmt = stmts[i];
        if (!stmt) continue;
        if (stmt.type === 'message') {
          var msg = messages && messages[msgCursor];
          if (msg && msg.rowY !== null && msg.rowY !== undefined) byIndex[i] = msg.rowY;
          msgCursor++;
        }
      }

      for (var n = 0; n < (notes || []).length; n++) {
        var note = notes[n];
        if (!note || note.statementIndex === undefined || !note.bbox) continue;
        byIndex[note.statementIndex] = note.bbox.y + note.bbox.height / 2;
      }

      return byIndex;
    },

    _estimateBranchSeparatorY: function (block, branchIdx, stmtYByIndex) {
      if (!block || !block.branchIndices || branchIdx < 0 || branchIdx >= block.branchIndices.length) return null;
      var branchStmtIndex = block.branchIndices[branchIdx];
      var prevY = null;
      var nextY = null;
      var start = block.statementIndex + 1;
      var end = block.endIndex !== -1 ? block.endIndex : branchStmtIndex + 1;

      for (var i = start; i < branchStmtIndex; i++) {
        if (stmtYByIndex[i] !== undefined && stmtYByIndex[i] !== null) prevY = stmtYByIndex[i];
      }

      for (var j = branchStmtIndex + 1; j < end; j++) {
        if (stmtYByIndex[j] !== undefined && stmtYByIndex[j] !== null) {
          nextY = stmtYByIndex[j];
          break;
        }
      }

      if (prevY !== null && nextY !== null) return (prevY + nextY) / 2;
      return null;
    },

    _getElementBBoxInSvg: function (svgEl, el) {
      if (!el || !el.getBBox) return null;

      var box;
      try { box = el.getBBox(); } catch (e) { return null; }
      if (!box) return null;

      if (!svgEl || !svgEl.createSVGPoint || !el.getScreenCTM || !svgEl.getScreenCTM) return box;

      var elMatrix = null;
      var svgMatrix = null;
      try {
        elMatrix = el.getScreenCTM();
        svgMatrix = svgEl.getScreenCTM();
      } catch (e2) {
        return box;
      }
      if (!elMatrix || !svgMatrix) return box;

      var invSvg;
      try { invSvg = svgMatrix.inverse(); } catch (e3) { return box; }

      var pt = svgEl.createSVGPoint();
      var corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height]
      ];
      var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

      for (var i = 0; i < corners.length; i++) {
        pt.x = corners[i][0];
        pt.y = corners[i][1];
        var rootPt = pt.matrixTransform(elMatrix).matrixTransform(invSvg);
        left = Math.min(left, rootPt.x);
        top = Math.min(top, rootPt.y);
        right = Math.max(right, rootPt.x);
        bottom = Math.max(bottom, rootPt.y);
      }

      if (!isFinite(left)) return box;
      return { x: left, y: top, width: right - left, height: bottom - top };
    },

    _sortTextElementsByPosition: function (elements, svgEl) {
      var self = this;
      return (elements || []).slice().sort(function (a, b) {
        var boxA = null;
        var boxB = null;

        try { boxA = self._getElementBBoxInSvg(svgEl, a); } catch (e1) {}
        try { boxB = self._getElementBBoxInSvg(svgEl, b); } catch (e2) {}

        if (!boxA && !boxB) return 0;
        if (!boxA) return 1;
        if (!boxB) return -1;

        var dy = boxA.y - boxB.y;
        if (Math.abs(dy) > 1) return dy;

        return boxA.x - boxB.x;
      });
    },

    _findMatchingLoopText: function (svgEl, labelEl, allLoopTextEls, usedLoopIndices) {
      if (!labelEl) return null;

      // 전략1: labelEl과 동일한 부모 g를 공유하는 loopText → Mermaid SVG에서
      // block header의 labelText와 loopText(조건 텍스트)는 항상 같은 g 안에 있다.
      var labelParent = labelEl.parentNode;
      if (labelParent) {
        for (var i = 0; i < allLoopTextEls.length; i++) {
          if (usedLoopIndices[i]) continue;
          if (allLoopTextEls[i] && allLoopTextEls[i].parentNode === labelParent) {
            usedLoopIndices[i] = true;
            return allLoopTextEls[i];
          }
        }
      }

      // 전략2: Y 근접 fallback (임계값 40 이내만 허용)
      // else/and separator loopText가 다음 block header보다 Y가 근접할 수 있으므로
      // _findNextUnusedLoopText 호출(무조건 소비)은 하지 않는다.
      var labelBox = this._getElementBBoxInSvg(svgEl, labelEl);
      if (!labelBox) return null;

      var bestEl = null;
      var bestIdx = -1;
      var bestDist = 40; // SVG 단위 최대 허용 거리

      for (var j = 0; j < allLoopTextEls.length; j++) {
        if (usedLoopIndices[j]) continue;
        var loopEl = allLoopTextEls[j];
        if (!loopEl || !loopEl.getBBox) continue;
        var loopBox = this._getElementBBoxInSvg(svgEl, loopEl);
        if (!loopBox) continue;
        var dist = Math.abs(loopBox.y - labelBox.y);
        if (dist < bestDist) { bestDist = dist; bestEl = loopEl; bestIdx = j; }
      }

      if (bestIdx !== -1) { usedLoopIndices[bestIdx] = true; return bestEl; }
      return null;
    },

    _findNextUnusedLoopText: function (allLoopTextEls, usedLoopIndices) {
      for (var i = 0; i < allLoopTextEls.length; i++) {
        if (usedLoopIndices[i]) continue;
        usedLoopIndices[i] = true;
        return allLoopTextEls[i];
      }
      return null;
    },

    _attachBlockElementInteractions: function (svgEl, block, labelEl, titleEl, branchTitleEls, branchStatements, ctx, model, participantMap, stmtYByIndex, btnOverlay, shared, sharedCancelHide, sharedHideNow, sharedScheduleHide) {
      // 분기 title Y 범위를 미리 계산 — labelGroup 클릭 핸들러 안에서 Y 라우팅에 사용
      var branchYRanges = [];
      var titleBoxForBranch = this._getElementBBoxInSvg(svgEl, titleEl);
      var titleCenterX = titleBoxForBranch ? (titleBoxForBranch.x + titleBoxForBranch.width / 2) : null;
      for (var pre = 0; pre < branchTitleEls.length; pre++) {
        var bel = branchTitleEls[pre];
        var fallbackBranchY = this._estimateBranchSeparatorY(block, pre, stmtYByIndex || {});
        try {
          var bbb = bel && bel.getBBox ? this._getElementBBoxInSvg(svgEl, bel) : null;
          var rangeY = fallbackBranchY !== null && fallbackBranchY !== undefined
            ? fallbackBranchY
            : (bbb ? bbb.y + Math.max(bbb.height, 16) / 2 : null);
          if (rangeY === null || rangeY === undefined) continue;
          var rangeCx = titleCenterX !== null
            ? titleCenterX
            : (bbb ? bbb.x + bbb.width / 2 : null);
          var rangeHalfWidth = bbb
            ? Math.max(90, (bbb.width + 48) / 2)
            : (titleBoxForBranch ? Math.max(90, (titleBoxForBranch.width + 48) / 2) : 90);
          branchYRanges.push({
            xMin: rangeCx !== null ? rangeCx - rangeHalfWidth : undefined,
            xMax: rangeCx !== null ? rangeCx + rangeHalfWidth : undefined,
            yMin: rangeY - 16,
            yMax: rangeY + 16,
            statementIndex: block.branchIndices[pre],
            branchStmt: branchStatements[pre] || {}
          });
        } catch (e0) {}
      }

      // labelText의 부모 그룹(labelBox rect 포함)을 클릭 → Y 위치 기반 라우팅
      // labelGroup의 배경 rect가 else/and 행도 덮으므로, 클릭 Y로 분기 여부 판단한다.
      var openBranchToolbar = function (statementIndex, branchStmt, clientX, clientY) {
        ctx.setState({
          selectedSequenceParticipantId: null,
          selectedSequenceMessageIndex: null,
          selectedSequenceMessageIndices: [],
          selectedSequenceBlockId: block.id,
          sequenceToolbar: {
            type: 'branch-title',
            blockId: block.id,
            statementIndex: statementIndex,
            text: (branchStmt && branchStmt.text) || '',
            x: clientX,
            y: clientY
          }
        });
      };

      var labelGroup = labelEl && (labelEl.closest ? labelEl.closest('g') : labelEl.parentNode);
      if (labelGroup) {
        labelGroup.style.cursor = 'pointer';
        labelGroup.style.pointerEvents = 'all';
        labelGroup.addEventListener('click', function (e) {
          e.stopPropagation();
          // else/and 분기 행 클릭인지 Y 좌표로 판단
          if (branchYRanges.length) {
            try {
              var svgPt = SvgPositionTracker.getSVGPoint(svgEl, e.clientX, e.clientY);
              if (svgPt) {
                for (var bi = 0; bi < branchYRanges.length; bi++) {
                  var range = branchYRanges[bi];
                  var inBranchX = range.xMin !== undefined && range.xMax !== undefined &&
                    svgPt.x >= range.xMin && svgPt.x <= range.xMax;
                  if (inBranchX && svgPt.y >= range.yMin && svgPt.y <= range.yMax) {
                    openBranchToolbar(range.statementIndex, range.branchStmt, e.clientX, e.clientY);
                    return;
                  }
                }
              }
            } catch (eRoute) {}
          }
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

      // 메인 title(loopText) 클릭 → 컨텍스트 툴바 (Edit / Delete) + hover → + 버튼
      if (titleEl) {
        titleEl.style.cursor = 'pointer';
        titleEl.style.pointerEvents = 'all';

        var onTitleClick = function (e) {
          e.stopPropagation();
          if (ctx.setState) {
            ctx.setState({
              selectedSequenceParticipantId: null,
              selectedSequenceMessageIndex: null,
              selectedSequenceMessageIndices: [],
              selectedSequenceBlockId: block.id,
              sequenceToolbar: {
                type: 'block-title',
                blockId: block.id,
                kind: block.kind,
                text: block.text || '',
                x: e.clientX,
                y: e.clientY
              }
            });
          }
        };
        titleEl.addEventListener('click', onTitleClick);

        if (btnOverlay && participantMap && SequenceSvgHandler) {
          var onTitleEnter = function () {
            var bbox;
            try { bbox = titleEl.getBBox ? titleEl.getBBox() : null; } catch (e2) {}
            if (!bbox || !bbox.width) return;
            sharedHideNow();
            if (SequenceSvgHandler && SequenceSvgHandler._currentHideInsertNow) SequenceSvgHandler._currentHideInsertNow();
            if (svgEl.dataset) svgEl.dataset.blockBtnActive = '1';

            // participant마다 + 버튼 하나씩, 각자의 lifeline cx에 배치
            var allBtns = [];
            var positions = [{ y: bbox.y + bbox.height + 12, isBefore: false }];
            var ids = Object.keys(participantMap);
            for (var pi = 0; pi < ids.length; pi++) {
              var p = participantMap[ids[pi]];
              if (!p) continue;
              var btns = SequenceSvgHandler._createNoteInsertButtons(
                btnOverlay, bbox, block.statementIndex, ids[pi],
                svgEl, model, participantMap, ctx,
                sharedCancelHide, sharedScheduleHide, p.cx, positions
              );
              for (var bi = 0; bi < btns.length; bi++) allBtns.push(btns[bi]);
            }
            shared.btns = allBtns;
          };
          titleEl.addEventListener('mouseenter', onTitleEnter);
          titleEl.addEventListener('mouseleave', sharedScheduleHide);
        }
      }

      // 분기 title cursor 표시 (클릭은 labelGroup Y 라우팅이 처리)
      for (var b = 0; b < branchTitleEls.length; b++) {
        var bCursorEl = branchTitleEls[b];
        if (bCursorEl) {
          bCursorEl.style.cursor = 'pointer';
          bCursorEl.style.pointerEvents = 'all';
        }
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
