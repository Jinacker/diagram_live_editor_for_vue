/**
 * gui-editor.component.js
 * Built: 2026-04-29T01:57:32.655Z
 *
 * Concatenation of gui-editor source files (no minification).
 * Requires global Vue 2 and Mermaid loaded separately.
 * Registers the global Vue component <mermaid-full-editor>.
 */

/* ===== runtime: dependency guard ===== */
(function (global) {
  if (!global.Vue || !/^2\./.test(String(global.Vue.version || ''))) {
    throw new Error('gui-editor component bundle requires global Vue 2 to be loaded first.');
  }
})(typeof window !== 'undefined' ? window : this);

/* ===== src/utils/SequenceMessageCodec.js ===== */
/**
 * Sequence 메시지 operator 관련 규칙을 한 곳에서 관리하는 공용 헬퍼
 * - representation/sequence-parser.js  : MESSAGE_RE 사용
 * - representation/sequence-generator.js : DEFAULT_OPERATOR 사용
 * - SequenceSvgHandler.js : parseOperator / toggleLineStyle 사용
 * - MermaidPreview.js     : LINE_TYPE_OPTIONS 사용
 */
(function (global) {
  'use strict';

  var DEFAULT_OPERATOR = '->>';

  // 지원 operator 정규식 (activation suffix +/- 포함)
  var MESSAGE_RE = /^([A-Za-z0-9_\u3131-\uD79D]+)\s*((?:-->>|--x|--\)|-->|->>|-x|-\)|->)[+-]?)\s*([A-Za-z0-9_\u3131-\uD79D]+)\s*:(.*)$/;

  // UI 라벨 목록 (MermaidPreview sequence-toolbar 드롭다운)
  var LINE_TYPE_OPTIONS = [
    { operator: '->>',  label: '───>' },
    { operator: '-->>',  label: '···>' },
    { operator: '->',   label: '───'  },
    { operator: '-->',  label: '···'  },
    { operator: '-x',   label: '───X' },
    { operator: '--x',  label: '···X' },
    { operator: '-)',   label: '───)' },
    { operator: '--)',  label: '···)' }
  ];

  // solid(단일 dash) ↔ dotted(이중 dash) 토글 맵
  var TOGGLE_MAP = {
    '->>':  '-->>',  '-->>': '->>',
    '->':   '-->',   '-->':  '->',
    '-x':   '--x',   '--x':  '-x',
    '-)':   '--)',   '--)':  '-)'
  };

  // operator에서 activation suffix (+/-) 분리
  function parseOperator(operator) {
    var op = operator || DEFAULT_OPERATOR;
    var suffix = '';
    if (/[+-]$/.test(op)) {
      suffix = op.slice(-1);
      op = op.slice(0, -1);
    }
    return { base: op || DEFAULT_OPERATOR, suffix: suffix };
  }

  // solid ↔ dotted 토글 (activation suffix 유지)
  function toggleLineStyle(operator) {
    var parts = parseOperator(operator);
    var nextBase = TOGGLE_MAP.hasOwnProperty(parts.base) ? TOGGLE_MAP[parts.base] : parts.base;
    return nextBase + parts.suffix;
  }

  // activation +/- 균형 재계산
  // GUI에서 메시지를 지운 뒤 남은 -가 inactive participant에 붙어 있으면
  // Mermaid가 "Trying to inactivate an inactive participant"로 렌더 실패한다.
  // 실제로 active가 아닌 from에 붙은 -만 떼어내고, 나머지는 그대로 둔다.
  function normalizeActivations(messages) {
    var result = [];
    var activeCounts = {};
    for (var i = 0; i < messages.length; i++) {
      var msg = Object.assign({}, messages[i]);
      var parts = parseOperator(msg.operator);
      if (parts.suffix === '+') {
        activeCounts[msg.to] = (activeCounts[msg.to] || 0) + 1;
      }
      if (parts.suffix === '-') {
        if (activeCounts[msg.from] > 0) {
          activeCounts[msg.from]--;
        } else {
          msg.operator = parts.base;
        }
      }
      result.push(msg);
    }
    return result;
  }

  global.SequenceMessageCodec = {
    DEFAULT_OPERATOR: DEFAULT_OPERATOR,
    MESSAGE_RE: MESSAGE_RE,
    LINE_TYPE_OPTIONS: LINE_TYPE_OPTIONS,
    parseOperator: parseOperator,
    toggleLineStyle: toggleLineStyle,
    normalizeActivations: normalizeActivations
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/SequenceStatementUtils.js ===== */
(function (global) {
  'use strict';

  function cloneStatement(statement) {
    return Object.assign({}, statement || {});
  }

  function cloneStatements(model) {
    var statements = (model && model.statements) || [];
    if (statements.length) return statements.map(cloneStatement);

    var messages = (model && model.messages) || [];
    var fallback = [];
    for (var i = 0; i < messages.length; i++) {
      fallback.push({ type: 'message', message: Object.assign({}, messages[i]) });
    }
    return fallback;
  }

  function messageIndexToStatementIndex(statements, messageIndex) {
    if (messageIndex === null || messageIndex === undefined || messageIndex < 0) return -1;
    var seen = 0;
    for (var i = 0; i < statements.length; i++) {
      if (statements[i] && statements[i].type === 'message') {
        if (seen === messageIndex) return i;
        seen++;
      }
    }
    return -1;
  }

  function insertMessageStatement(model, insertAt, message) {
    var statements = cloneStatements(model);
    var statement = { type: 'message', message: Object.assign({}, message || {}) };
    var statementIndex = messageIndexToStatementIndex(statements, insertAt);

    if (statementIndex === -1) {
      statements.push(statement);
    } else {
      statements.splice(statementIndex, 0, statement);
    }
    return statements;
  }

  function removeMessageStatements(model, messageIndices) {
    var statements = cloneStatements(model);
    var indices = (messageIndices || []).slice().sort(function (a, b) { return b - a; });

    for (var i = 0; i < indices.length; i++) {
      var statementIndex = messageIndexToStatementIndex(statements, indices[i]);
      if (statementIndex !== -1) statements.splice(statementIndex, 1);
    }

    return pruneEmptyBlocks(statements);
  }

  function removeParticipantStatements(model, participantId, messageIndices) {
    var statements = removeMessageStatements(model, messageIndices);
    if (!participantId) return statements;

    var next = [];
    for (var i = 0; i < statements.length; i++) {
      var statement = statements[i];
      if (
        statement &&
        statement.type === 'note' &&
        statement.participants &&
        statement.participants.indexOf(participantId) !== -1
      ) {
        continue;
      }
      next.push(statement);
    }
    return pruneEmptyBlocks(next);
  }

  function pruneEmptyBlocks(statements) {
    var next = (statements || []).slice();
    var changed = true;

    while (changed) {
      changed = false;
      var removeSet = {};
      var stack = [];

      for (var i = 0; i < next.length; i++) {
        var statement = next[i];
        if (!statement) continue;

        if (/^(loop|alt|opt|par)$/.test(statement.type)) {
          stack.push({
            startIndex: i,
            branchIndices: [],
            hasContent: false
          });
          continue;
        }

        if (/^(else|and)$/.test(statement.type)) {
          if (stack.length) stack[stack.length - 1].branchIndices.push(i);
          continue;
        }

        if (statement.type === 'end') {
          if (!stack.length) continue;
          var block = stack.pop();
          if (!block.hasContent) {
            removeSet[block.startIndex] = true;
            removeSet[i] = true;
            for (var b = 0; b < block.branchIndices.length; b++) {
              removeSet[block.branchIndices[b]] = true;
            }
            changed = true;
          } else if (stack.length) {
            stack[stack.length - 1].hasContent = true;
          }
          continue;
        }

        if (stack.length) stack[stack.length - 1].hasContent = true;
      }

      if (changed) {
        next = next.filter(function (_, idx) { return !removeSet[idx]; });
      }
    }

    return next;
  }

  function listBlocks(statements) {
    var source = (statements || []).map(cloneStatement);
    var blocks = [];
    var stack = [];
    var messageCursor = 0;

    for (var i = 0; i < source.length; i++) {
      var statement = source[i];
      if (!statement) continue;

      if (/^(loop|alt|opt|par)$/.test(statement.type)) {
        stack.push({
          id: 'block-' + i,
          kind: statement.type,
          text: statement.text || '',
          statementIndex: i,
          endIndex: -1,
          branchIndices: [],
          depth: stack.length,
          messageStartIndex: null,
          messageEndIndex: null
        });
        continue;
      }

      if (statement.type === 'message') {
        for (var s = 0; s < stack.length; s++) {
          if (stack[s].messageStartIndex === null) stack[s].messageStartIndex = messageCursor;
          stack[s].messageEndIndex = messageCursor;
        }
        messageCursor++;
        continue;
      }

      if (statement.type === 'else' || statement.type === 'and') {
        var top = stack.length ? stack[stack.length - 1] : null;
        var expected = statement.type === 'else' ? 'alt' : 'par';
        if (top && top.kind === expected) {
          top.branchIndices.push(i);
        }
        continue;
      }

      if (statement.type === 'end') {
        if (!stack.length) continue;
        var block = stack.pop();
        block.endIndex = i;
        blocks.push(block);
      }
    }

    blocks.sort(function (a, b) {
      return a.statementIndex - b.statementIndex;
    });
    return blocks;
  }

  function wrapMessagesInBlock(model, messageIndices, kind, text) {
    var unique = {};
    var ordered = [];
    var statements = cloneStatements(model);

    for (var i = 0; i < (messageIndices || []).length; i++) {
      var idx = messageIndices[i];
      if (idx === null || idx === undefined || unique[idx]) continue;
      unique[idx] = true;
      ordered.push(idx);
    }
    if (!ordered.length) return statements;

    ordered.sort(function (a, b) { return a - b; });
    var startStatementIndex = messageIndexToStatementIndex(statements, ordered[0]);
    var endStatementIndex = messageIndexToStatementIndex(statements, ordered[ordered.length - 1]);
    if (startStatementIndex === -1 || endStatementIndex === -1) return statements;

    statements.splice(startStatementIndex, 0, {
      type: String(kind || 'loop').toLowerCase(),
      text: text || ''
    });
    statements.splice(endStatementIndex + 2, 0, { type: 'end' });
    return statements;
  }

  function findBlockById(blocks, blockId) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].id === blockId) return blocks[i];
    }
    return null;
  }

  function updateBlockText(model, blockId, text) {
    var statements = cloneStatements(model);
    var block = findBlockById(listBlocks(statements), blockId);
    if (!block) return statements;

    statements[block.statementIndex] = Object.assign({}, statements[block.statementIndex], {
      text: text || ''
    });
    return statements;
  }

  function deleteBlock(model, blockId) {
    var statements = cloneStatements(model);
    var block = findBlockById(listBlocks(statements), blockId);
    if (!block) return statements;

    var removeSet = {};
    removeSet[block.statementIndex] = true;
    removeSet[block.endIndex] = true;
    for (var b = 0; b < block.branchIndices.length; b++) {
      removeSet[block.branchIndices[b]] = true;
    }

    var next = [];
    for (var s = 0; s < statements.length; s++) {
      if (!removeSet[s]) next.push(statements[s]);
    }
    return next;
  }

  // alt ↔ else, par ↔ and
  var BRANCH_KEYWORD = { alt: 'else', par: 'and' };

  function changeBlockKind(model, blockId, newKind) {
    var statements = cloneStatements(model);
    var block = findBlockById(listBlocks(statements), blockId);
    if (!block) return statements;

    var newKindStr = String(newKind || 'loop').toLowerCase();
    statements[block.statementIndex] = Object.assign({}, statements[block.statementIndex], {
      type: newKindStr
    });

    var oldBranch = BRANCH_KEYWORD[block.kind];
    var newBranch = BRANCH_KEYWORD[newKindStr];

    if (oldBranch && newBranch && oldBranch !== newBranch) {
      // alt ↔ par: 분기 키워드 변환 (else ↔ and)
      for (var b = 0; b < block.branchIndices.length; b++) {
        var bi = block.branchIndices[b];
        statements[bi] = Object.assign({}, statements[bi], { type: newBranch });
      }
    } else if (oldBranch && !newBranch && block.branchIndices.length) {
      // alt/par → loop/opt: 분기 statement 제거, 메시지는 유지
      var removeSet = {};
      for (var b2 = 0; b2 < block.branchIndices.length; b2++) {
        removeSet[block.branchIndices[b2]] = true;
      }
      statements = statements.filter(function (_, idx) { return !removeSet[idx]; });
    }
    // loop/opt → alt/par: 타입만 교체 (분기 없는 alt/par는 유효한 문법)

    return statements;
  }

  function findEnclosingBranchBlock(model, messageIndices) {
    if (!messageIndices || !messageIndices.length) return null;
    var sorted = messageIndices.slice().sort(function (a, b) { return a - b; });
    var minIdx = sorted[0];
    var maxIdx = sorted[sorted.length - 1];

    var blocks = listBlocks((model && model.statements) || []);
    var best = null;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.kind !== 'alt' && b.kind !== 'par') continue;
      if (b.messageStartIndex === null || b.messageEndIndex === null) continue;
      if (b.messageStartIndex > minIdx || b.messageEndIndex < maxIdx) continue;
      // 가장 안쪽(depth 깊은) 블록 우선
      if (!best || b.depth > best.depth) best = b;
    }
    return best;
  }

  function findBranchInsertPoint(statements, altBlock, targetStmtIndex) {
    if (targetStmtIndex === -1 || altBlock.endIndex === -1) return targetStmtIndex;
    var targetDepth = altBlock.depth + 1;
    var depth = altBlock.depth;
    var directChildStart = -1;
    for (var i = altBlock.statementIndex; i <= altBlock.endIndex; i++) {
      var stmt = statements[i];
      if (!stmt) continue;
      if (i === altBlock.statementIndex) { depth = targetDepth; continue; }
      if (depth === targetDepth) directChildStart = i;
      if (/^(loop|alt|opt|par)$/.test(stmt.type)) { depth++; }
      else if (stmt.type === 'end') { depth--; }
      if (i === targetStmtIndex) return directChildStart !== -1 ? directChildStart : targetStmtIndex;
    }
    return targetStmtIndex;
  }

  function insertBranchStatement(model, messageIndices, keyword, text) {
    var sorted = messageIndices.slice().sort(function (a, b) { return a - b; });
    var statements = cloneStatements(model);
    var firstMsgStmtIndex = messageIndexToStatementIndex(statements, sorted[0]);
    if (firstMsgStmtIndex === -1) return statements;
    var enclosing = findEnclosingBranchBlock(model, sorted);
    var insertAt = enclosing
      ? findBranchInsertPoint(statements, enclosing, firstMsgStmtIndex)
      : firstMsgStmtIndex;
    statements.splice(insertAt, 0, { type: String(keyword), text: text || '' });
    return statements;
  }

  function updateBranchText(model, statementIndex, text) {
    var statements = cloneStatements(model);
    if (statementIndex < 0 || statementIndex >= statements.length) return statements;
    statements[statementIndex] = Object.assign({}, statements[statementIndex], { text: text || '' });
    return statements;
  }

  function deleteBranchStatement(model, statementIndex) {
    var statements = cloneStatements(model);
    if (statementIndex < 0 || statementIndex >= statements.length) return statements;
    if (statements[statementIndex].type !== 'else' && statements[statementIndex].type !== 'and') return statements;
    statements.splice(statementIndex, 1);
    return statements;
  }

  function addNoteStatement(model, participantId, insertAtMessageIndex, text) {
    var statements = cloneStatements(model);
    var note = { type: 'note', participants: [participantId], text: text || 'Note' };
    var statementIndex = (insertAtMessageIndex !== null && insertAtMessageIndex !== undefined)
      ? messageIndexToStatementIndex(statements, insertAtMessageIndex)
      : -1;
    if (statementIndex === -1) {
      statements.push(note);
    } else {
      statements.splice(statementIndex, 0, note);
    }
    return statements;
  }

  function updateNoteText(model, statementIndex, text) {
    var statements = cloneStatements(model);
    if (statementIndex < 0 || statementIndex >= statements.length) return statements;
    statements[statementIndex] = Object.assign({}, statements[statementIndex], { text: text || '' });
    return statements;
  }

  function deleteNoteStatement(model, statementIndex) {
    var statements = cloneStatements(model);
    if (statementIndex < 0 || statementIndex >= statements.length) return statements;
    statements.splice(statementIndex, 1);
    return statements;
  }

  global.SequenceStatementUtils = {
    cloneStatements: cloneStatements,
    listBlocks: listBlocks,
    findEnclosingBranchBlock: findEnclosingBranchBlock,
    insertMessageStatement: insertMessageStatement,
    removeMessageStatements: removeMessageStatements,
    removeParticipantStatements: removeParticipantStatements,
    wrapMessagesInBlock: wrapMessagesInBlock,
    insertBranchStatement: insertBranchStatement,
    updateBlockText: updateBlockText,
    updateBranchText: updateBranchText,
    deleteBranchStatement: deleteBranchStatement,
    deleteBlock: deleteBlock,
    changeBlockKind: changeBlockKind,
    addNoteStatement: addNoteStatement,
    updateNoteText: updateNoteText,
    deleteNoteStatement: deleteNoteStatement
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/IdAllocator.js ===== */
/**
 * IdAllocator
 * GUI에서 새 노드/참가자를 추가할 때 충돌 없는 ID(`N12`, `P3` 등)를 할당한다.
 *
 * - script와 model 양쪽을 모두 살펴 충돌을 피한다 (parser가 누락한 ID도 보호).
 * - counter는 한 번 올라가면 절대 내려가지 않는다 (단조 증가).
 * - prefix별 인스턴스 생성: `new IdAllocator('N')` / `new IdAllocator('P')`.
 */
(function (global) {
  'use strict';

  function IdAllocator(prefix) {
    this.prefix = prefix;
    this.counter = 0;
  }

  // script의 prefix+숫자와 modelItems의 ID 끝 숫자를 모두 훑어 counter를 끌어올린다.
  // 사용자가 수동으로 큰 번호를 쓴 ID를 보존하기 위함.
  IdAllocator.prototype.seed = function (script, items) {
    var max = this._scanScriptMax(script);
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i] && list[i].id || '');
      var nm = id.match(/(\d+)$/);
      if (nm) {
        var n = parseInt(nm[1], 10);
        if (n > max) max = n;
      }
    }
    if (max > this.counter) this.counter = max;
  };

  // 충돌 없는 다음 ID를 반환. counter를 함께 증가시킴.
  IdAllocator.prototype.next = function (script, items) {
    var candidate = '';
    do {
      this.counter++;
      candidate = this.prefix + this.counter;
    } while (this.scriptContainsId(script, candidate) || this.itemsContainId(items, candidate));
    return candidate;
  };

  IdAllocator.prototype.scriptContainsId = function (script, id) {
    if (!id) return false;
    var escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escapedId + '\\b').test(script || '');
  };

  IdAllocator.prototype.itemsContainId = function (items, id) {
    var list = items || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return true;
    }
    return false;
  };

  IdAllocator.prototype._scanScriptMax = function (script) {
    var src = script || '';
    var escapedPrefix = String(this.prefix).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('\\b' + escapedPrefix + '(\\d+)\\b', 'g');
    var max = 0;
    var match;
    while ((match = regex.exec(src))) {
      var n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
    return max;
  };

  global.IdAllocator = IdAllocator;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/ModelDiagnostics.js ===== */
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


/* ===== src/utils/ParserHighlight.js ===== */
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


/* ===== src/representation/sequence-parser.js ===== */
/**
 * Mermaid 시퀀스 다이어그램 파서
 * sequenceDiagram 문법을 내부 모델로 변환한다.
 */

(function (global) {
  'use strict';

  var MESSAGE_RE = SequenceMessageCodec.MESSAGE_RE;
  var BLOCK_OPEN_RE = /^(loop|alt|opt|par)(?:\s+(.+))?$/i;
  var RAW_BLOCK_OPEN_RE = /^(rect|critical|break|box)\b(?:\s+(.+))?$/i;
  var NOTE_OVER_RE = /^note\s+over\s+([A-Za-z0-9_\u3131-\uD79D]+(?:\s*,\s*[A-Za-z0-9_\u3131-\uD79D]+)*)(?:\s*:\s*(.*))?$/i;

  function pushBlock(model, kind, recognized) {
    model._blockStack.push({
      kind: String(kind || '').toLowerCase(),
      recognized: recognized !== false
    });
  }

  function popBlock(model) {
    return model._blockStack.length ? model._blockStack.pop() : null;
  }

  function getBlockTop(model) {
    return model._blockStack.length ? model._blockStack[model._blockStack.length - 1] : null;
  }

  function countSourceOccurrence(model, line) {
    return ParserHighlight.nextOccurrence(model._sourceTextCounts, line);
  }

  function pushRawStatement(model, line, blockRole, lineNumber, sourceInfo) {
    var rawText = sourceInfo ? sourceInfo.text : String(line || '').trim();
    var occurrence = sourceInfo ? sourceInfo.occurrence : 1;
    model.statements.push({
      type: 'raw',
      raw: line,
      blockRole: blockRole || '',
      lineNumber: lineNumber || null,
      rawText: rawText,
      occurrence: occurrence
    });
    model._diagnostics.rawStatementCount++;
    if (lineNumber && !model._diagnostics.rawLineMap[lineNumber]) {
    model._diagnostics.rawLineMap[lineNumber] = true;
      model._diagnostics.rawLineNumbers.push(lineNumber);
    }
    model._diagnostics.rawTargets.push({
      lineNumber: lineNumber || null,
      text: rawText,
      occurrence: occurrence,
      blockRole: blockRole || ''
    });
  }

  function ensureParticipant(model, id, label) {
    if (!id || model._participantMap[id]) return;
    var participant = { id: id, label: label || id, kind: 'participant' };
    model.participants.push(participant);
    model._participantMap[id] = participant;
  }

  function parseParticipantLine(line, model) {
    var match = line.match(/^(participant|actor)\s+([A-Za-z0-9_\u3131-\uD79D]+)(?:\s+as\s+(.+))?$/);
    if (!match) return false;
    model.explicitParticipants = true;
    var id = match[2];
    var label = match[3] ? match[3].trim() : id;
    var kind = match[1]; // 'participant' | 'actor'
    if (!model._participantMap[id]) {
      var p = { id: id, label: label, kind: kind };
      model.participants.push(p);
      model._participantMap[id] = p;
    } else {
      model._participantMap[id].kind = kind;
      if (match[3]) model._participantMap[id].label = label;
    }
    return true;
  }

  function parseMessageLine(line, model) {
    var match = line.match(MESSAGE_RE);
    if (!match) return false;

    ensureParticipant(model, match[1], match[1]);
    ensureParticipant(model, match[3], match[3]);

    var message = {
      from: match[1],
      to: match[3],
      operator: match[2],
      text: (match[4] || '').trim()
    };
    model.messages.push(message);
    model.statements.push({
      type: 'message',
      message: Object.assign({}, message)
    });
    return true;
  }

  function parseNoteLine(line, model) {
    var match = line.match(NOTE_OVER_RE);
    if (!match) return false;
    var participants = match[1].split(',').map(function (p) { return p.trim(); }).filter(Boolean);
    var text = (match[2] || '').trim();
    if (!text) return true;
    for (var i = 0; i < participants.length; i++) {
      ensureParticipant(model, participants[i], participants[i]);
    }
    model.statements.push({ type: 'note', participants: participants, text: text });
    return true;
  }

  function parseActivationLine(line, model) {
    var match = line.match(/^(activate|deactivate)\s+([A-Za-z0-9_\u3131-\uD79D]+)$/i);
    if (!match) return false;
    ensureParticipant(model, match[2], match[2]);
    model.statements.push({
      type: match[1].toLowerCase(),
      participant: match[2]
    });
    return true;
  }

  function parseControlLine(line, model, lineNumber, sourceInfo) {
    var match = line.match(BLOCK_OPEN_RE);
    if (match) {
      pushBlock(model, match[1], true);
      model.statements.push({
        type: match[1].toLowerCase(),
        text: (match[2] || '').trim()
      });
      return true;
    }

    match = line.match(/^(else|and)(?:\s+(.+))?$/i);
    if (match) {
      var branchType = match[1].toLowerCase();
      var top = getBlockTop(model);
      var expected = branchType === 'else' ? 'alt' : 'par';
      if (top && top.recognized && top.kind === expected) {
        model.statements.push({
          type: branchType,
          text: (match[2] || '').trim()
        });
      } else {
        pushRawStatement(model, line, '', lineNumber, sourceInfo);
      }
      return true;
    }

    match = line.match(RAW_BLOCK_OPEN_RE);
    if (match) {
      pushBlock(model, match[1], false);
      pushRawStatement(model, line, 'open', lineNumber, sourceInfo);
      return true;
    }

    if (/^end$/i.test(line)) {
      var ended = popBlock(model);
      if (!ended) {
        pushRawStatement(model, line, 'close', lineNumber, sourceInfo);
        model._diagnostics.orphanEndCount++;
        return true;
      }
      if (ended.recognized) {
        model.statements.push({ type: 'end' });
      } else {
        pushRawStatement(model, line, 'close', lineNumber, sourceInfo);
      }
      return true;
    }

    return false;
  }

  function parseSequence(script) {
    if (!script || typeof script !== 'string') {
      return {
        type: 'sequenceDiagram',
        explicitParticipants: false,
        participants: [],
        messages: [],
        statements: [],
        diagnostics: {
          rawStatementCount: 0,
          orphanEndCount: 0,
          unmatchedBlockCount: 0,
          rawLineNumbers: [],
          rawTargets: []
        },
      nodes: [],
      edges: [],
      _sourceTextCounts: {}
      };
    }

    var lines = script.split('\n');
    var model = {
      type: 'sequenceDiagram',
      explicitParticipants: false,
      participants: [],
      messages: [],
      statements: [],
      diagnostics: {
        rawStatementCount: 0,
        orphanEndCount: 0,
        unmatchedBlockCount: 0,
        rawLineNumbers: [],
        rawTargets: []
      },
      nodes: [],
      edges: [],
      _participantMap: {},
      _blockStack: [],
      _sourceTextCounts: {},
      _diagnostics: {
        rawStatementCount: 0,
        orphanEndCount: 0,
        unmatchedBlockCount: 0,
        rawLineNumbers: [],
        rawLineMap: {},
        rawTargets: []
      }
    };
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (!started) {
        if (line.indexOf('%%') === 0) continue;
        if (/^sequenceDiagram$/i.test(line)) {
          started = true;
        }
        continue;
      }

      if (line.indexOf('%%') === 0) { model.statements.push({ type: 'raw', raw: line }); continue; }
      var sourceInfo = countSourceOccurrence(model, line);
      if (line === 'autonumber') { model.autonumber = true; continue; }
      if (parseParticipantLine(line, model)) continue;
      if (parseMessageLine(line, model)) continue;
      if (parseActivationLine(line, model)) continue;
      if (parseNoteLine(line, model)) continue;
      if (parseControlLine(line, model, i + 1, sourceInfo)) continue;
      pushRawStatement(model, line, '', i + 1, sourceInfo);
    }

    model._diagnostics.unmatchedBlockCount = model._blockStack.length;
    model.diagnostics = {
      rawStatementCount: model._diagnostics.rawStatementCount,
      orphanEndCount: model._diagnostics.orphanEndCount,
      unmatchedBlockCount: model._diagnostics.unmatchedBlockCount,
      rawLineNumbers: model._diagnostics.rawLineNumbers.slice(),
      rawTargets: model._diagnostics.rawTargets.slice()
    };
    delete model._participantMap;
    delete model._blockStack;
    delete model._sourceTextCounts;
    delete model._diagnostics;
    return model;
  }

  global.SequenceParser = {
    parse: parseSequence
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/representation/sequence-generator.js ===== */
/**
 * Mermaid 시퀀스 다이어그램 생성기
 * 내부 모델을 sequenceDiagram 스크립트로 직렬화한다.
 */

(function (global) {
  'use strict';

  function renderIndented(level, text) {
    var indent = '    ';
    for (var i = 0; i < level; i++) indent += '    ';
    return indent + text;
  }

  function renderMessage(message, level) {
    if (!message || !message.from || !message.to) return '';
    return renderIndented(
      level || 0,
      message.from +
      (message.operator || SequenceMessageCodec.DEFAULT_OPERATOR) +
      message.to +
      ': ' +
      (message.text || '')
    );
  }

  function renderStatement(statement, message, level) {
    if (!statement) return '';

    if (statement.type === 'message') {
      return renderMessage(message || statement.message, level);
    }

    if (statement.type === 'activate' || statement.type === 'deactivate') {
      if (!statement.participant) return '';
      return renderIndented(level || 0, statement.type + ' ' + statement.participant);
    }

    if (statement.type === 'end') {
      return renderIndented(level || 0, 'end');
    }

    if (/^(loop|alt|else|opt|par|and)$/.test(statement.type)) {
      return renderIndented(level || 0, statement.type + (statement.text ? ' ' + statement.text : ''));
    }

    if (statement.type === 'note') {
      var parts = (statement.participants || []).join(', ');
      var text = String(statement.text || '').trim();
      if (!parts || !text) return '';
      return renderIndented(level || 0, 'note over ' + parts + ': ' + text);
    }

    if (statement.type === 'raw') {
      return renderIndented(level || 0, statement.raw || '');
    }

    return '';
  }

  function generateSequence(model) {
    if (!model) return '';

    var lines = ['sequenceDiagram'];
    if (model.autonumber) lines.push('    autonumber');
    var participants = model.participants || [];
    var messages = model.messages || [];
    var referenced = {};
    var mustDeclare = !!model.explicitParticipants;

    for (var r = 0; r < messages.length; r++) {
      if (messages[r].from) referenced[messages[r].from] = true;
      if (messages[r].to) referenced[messages[r].to] = true;
    }

    if (!mustDeclare) {
      for (var d = 0; d < participants.length; d++) {
        var candidate = participants[d];
        if (!candidate || !candidate.id) continue;
        if ((candidate.label && candidate.label !== candidate.id) || !referenced[candidate.id]) {
          mustDeclare = true;
          break;
        }
      }
    }

    if (mustDeclare) {
      for (var i = 0; i < participants.length; i++) {
        var participant = participants[i];
        if (!participant || !participant.id) continue;
        var keyword = participant.kind === 'actor' ? 'actor' : 'participant';
        if (participant.label && participant.label !== participant.id) {
          lines.push('    ' + keyword + ' ' + participant.id + ' as ' + participant.label);
        } else {
          lines.push('    ' + keyword + ' ' + participant.id);
        }
      }
    }

    var statements = model.statements || [];
    if (statements.length) {
      var messageCursor = 0;
      var depth = 0;
      for (var j = 0; j < statements.length; j++) {
        var statement = statements[j];
        var line = '';
        var level = depth;
        if (statement && (
          statement.type === 'else' ||
          statement.type === 'and' ||
          statement.type === 'end' ||
          statement.blockRole === 'close'
        )) {
          level = Math.max(0, depth - 1);
        }
        if (statement && statement.type === 'message') {
          line = renderStatement(statement, messages[messageCursor] || statement.message, level);
          messageCursor++;
        } else {
          line = renderStatement(statement, null, level);
        }

        if (statement && (/^(loop|alt|opt|par)$/.test(statement.type) || statement.blockRole === 'open')) {
          depth++;
        } else if (statement && /^(else|and)$/.test(statement.type)) {
          depth = level + 1;
        } else if (statement && (statement.type === 'end' || statement.blockRole === 'close')) {
          depth = level;
        }

        if (line) lines.push(line);
      }

      for (; messageCursor < messages.length; messageCursor++) {
        var trailing = renderMessage(messages[messageCursor], depth);
        if (trailing) lines.push(trailing);
      }
      return lines.join('\n');
    }

    for (var k = 0; k < messages.length; k++) {
      var message = messages[k];
      var messageLine = renderMessage(message);
      if (messageLine) {
        lines.push(messageLine);
      }
    }

    return lines.join('\n');
  }

  global.SequenceGenerator = {
    generate: generateSequence
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/FlowEdgeCodec.js ===== */
(function (global) {
  'use strict';

  var BODY_OPTIONS = [
    { key: 'solid', label: '──' },
    { key: 'dotted', label: '┄┄' },
    { key: 'thick', label: '━━' }
  ];

  var HEAD_OPTIONS = [
    { key: 'none', label: '─' },
    { key: 'x', label: '─x' },
    { key: 'both-x', label: 'x─x' },
    { key: 'arrow', label: '→' },
    { key: 'both-arrow', label: '⟷' },
    { key: 'circle', label: '─●' },
    { key: 'both-circle', label: '●─●' }
  ];

  // Parser는 exact 후보 문자열을 먼저 찾고, semantics는 아래 regex 규칙으로 해석한다.
  var OPERATOR_CANDIDATES = [
    'x===x',
    'o===o',
    'x--x',
    'o--o',
    '<==>',
    'x-.-x',
    'o-.-o',
    '<-.->',
    '<---->',
    '<--->',
    '<-->',
    '===o',
    '===x',
    '----o',
    '---o',
    '--o',
    '--x',
    '-.-o',
    '-.-x',
    '-.->',
    '-...-',
    '-..-',
    '-.-',
    '===>',
    '==>',
    '=====',
    '====',
    '===',
    '-----',
    '----',
    '-->',
    '---'
  ];

  var PARSE_RULES = [
    { regex: /^x===x$/, body: 'thick', head: 'both-x' },
    { regex: /^o===o$/, body: 'thick', head: 'both-circle' },
    { regex: /^x--+x$/, body: 'solid', head: 'both-x' },
    { regex: /^o--+o$/, body: 'solid', head: 'both-circle' },
    { regex: /^<==+>$/, body: 'thick', head: 'both-arrow' },
    { regex: /^x-\.-x$/, body: 'dotted', head: 'both-x' },
    { regex: /^o-\.-o$/, body: 'dotted', head: 'both-circle' },
    { regex: /^<-\.{1,}->$/, body: 'dotted', head: 'both-arrow' },
    { regex: /^<--+>$/, body: 'solid', head: 'both-arrow' },
    { regex: /^===x$/, body: 'thick', head: 'x' },
    { regex: /^===o$/, body: 'thick', head: 'circle' },
    { regex: /^--+x$/, body: 'solid', head: 'x' },
    { regex: /^--+o$/, body: 'solid', head: 'circle' },
    { regex: /^-\.-x$/, body: 'dotted', head: 'x' },
    { regex: /^-\.-o$/, body: 'dotted', head: 'circle' },
    { regex: /^-\.{1,}->$/, body: 'dotted', head: 'arrow' },
    { regex: /^-\.{1,}-$/, body: 'dotted', head: 'none' },
    { regex: /^==+>$/, body: 'thick', head: 'arrow' },
    { regex: /^=+$/, body: 'thick', head: 'none' },
    { regex: /^--+>$/, body: 'solid', head: 'arrow' }
  ];

  var LEGACY_LEFT_HEAD_ALIASES = {
    '<--': '-->',
    'o--': '--o',
    'x--': '--x'
  };

  function parseType(type) {
    var operator = String(type || '---');
    for (var i = 0; i < PARSE_RULES.length; i++) {
      if (PARSE_RULES[i].regex.test(operator)) {
        return {
          body: PARSE_RULES[i].body,
          head: PARSE_RULES[i].head
        };
      }
    }
    return { body: 'solid', head: 'none' };
  }

  function composeType(body, head) {
    body = body || 'solid';
    head = head || 'none';

    if (body === 'dotted') {
      if (head === 'both-x') return 'x-.-x';
      if (head === 'x') return '-.-x';
      if (head === 'both-circle') return 'o-.-o';
      if (head === 'circle') return '-.-o';
      if (head === 'both-arrow') return '<-.->';
      return head === 'arrow' ? '-.->' : '-.-';
    }

    if (body === 'thick') {
      if (head === 'both-x') return 'x===x';
      if (head === 'x') return '===x';
      if (head === 'both-circle') return 'o===o';
      if (head === 'circle') return '===o';
      if (head === 'both-arrow') return '<==>';
      return head === 'arrow' ? '==>' : '===';
    }

    if (head === 'both-arrow') return '<-->';
    if (head === 'arrow') return '-->';
    if (head === 'both-circle') return 'o--o';
    if (head === 'circle') return '--o';
    if (head === 'both-x') return 'x--x';
    if (head === 'x') return '--x';
    return '---';
  }

  function getBodyType(type) {
    return parseType(type).body;
  }

  // 현재 UI는 left-only head를 만들지 않지만, 과거 저장 데이터나 수동 model 수정값은
  // 아직 들어올 수 있어 generator 출력 직전에만 안전한 canonical 형태로 바꿔준다.
  function normalizeEdgeForOutput(edge) {
    var source = edge || {};
    var type = source.type || '-->';
    var alias = LEGACY_LEFT_HEAD_ALIASES[type];
    if (!alias) {
      return {
        from: source.from,
        to: source.to,
        type: type,
        text: source.text || '',
        color: source.color || ''
      };
    }

    return {
      from: source.to,
      to: source.from,
      type: alias,
      text: source.text || '',
      color: source.color || ''
    };
  }

  global.FlowEdgeCodec = {
    BODY_OPTIONS: BODY_OPTIONS,
    HEAD_OPTIONS: HEAD_OPTIONS,
    OPERATOR_CANDIDATES: OPERATOR_CANDIDATES,
    parseType: parseType,
    composeType: composeType,
    getBodyType: getBodyType,
    normalizeEdgeForOutput: normalizeEdgeForOutput
  };
})(typeof window !== 'undefined' ? window : this);


/* ===== src/representation/mermaid-parser.js ===== */
(function (global) {
  'use strict';

  var FlowEdgeCodec = global.FlowEdgeCodec;

  var SHAPE_MAP = [
    { open: '((', close: '))', shape: 'double_circle' },
    { open: '([', close: '])', shape: 'stadium' },
    { open: '[[', close: ']]', shape: 'subroutine' },
    { open: '[(', close: ')]', shape: 'cylinder' },
    { open: '{{', close: '}}', shape: 'hexagon' },
    { open: '{', close: '}', shape: 'rhombus' },
    { open: '[/', close: '/]', shape: 'parallelogram' },
    { open: '[\\', close: '\\]', shape: 'parallelogram_alt' },
    { open: '[/', close: '\\]', shape: 'trapezoid' },
    { open: '[\\', close: '/]', shape: 'trapezoid_alt' },
    { open: '>', close: ']', shape: 'asymmetric' },
    { open: '(', close: ')', shape: 'round' },
    { open: '[', close: ']', shape: 'rect' }
  ];

  var LEGACY_EDGE_PATTERNS = [
    { regex: /^==\s+(.+?)\s*==>/, type: '==>' },
    { regex: /^--\s+(.+?)\s*-->/, type: '-->' },
    { regex: /^--\s+(.+?)\s*-\.->/, type: '-.->' },
    { regex: /^--\s+(.+?)\s*---/, type: '---' },
    { regex: /^--\s+(.+?)\s*-\.-/, type: '-.-' },
    { regex: /^==\s+(.+?)\s*===/, type: '===' }
  ];

  function getShapeCandidates(rest) {
    var candidates = [];
    for (var i = 0; i < SHAPE_MAP.length; i++) {
      if (rest.indexOf(SHAPE_MAP[i].open) === 0) {
        candidates.push({ def: SHAPE_MAP[i], order: i });
      }
    }

    candidates.sort(function (a, b) {
      var openDiff = b.def.open.length - a.def.open.length;
      if (openDiff) return openDiff;
      var closeDiff = b.def.close.length - a.def.close.length;
      if (closeDiff) return closeDiff;
      return a.order - b.order;
    });

    return candidates;
  }

  function getEdgeCandidates(rest) {
    var candidates = [];
    var operatorCandidates = (FlowEdgeCodec && FlowEdgeCodec.OPERATOR_CANDIDATES) || [];
    for (var i = 0; i < operatorCandidates.length; i++) {
      if (rest.indexOf(operatorCandidates[i]) === 0) {
        candidates.push(operatorCandidates[i]);
      }
    }
    candidates.sort(function (a, b) { return b.length - a.length; });
    return candidates;
  }

  function isEscapedChar(text, index) {
    var slashCount = 0;
    for (var i = index - 1; i >= 0 && text.charAt(i) === '\\'; i--) {
      slashCount++;
    }
    return (slashCount % 2) === 1;
  }

  function findQuotedClose(rest, openLen, closeToken) {
    for (var i = openLen + 1; i < rest.length; i++) {
      if (rest.charAt(i) !== '"' || isEscapedChar(rest, i)) continue;
      if (rest.substr(i + 1, closeToken.length) === closeToken) {
        return i;
      }
    }
    return -1;
  }

  function findPipeClose(rest, startIndex) {
    for (var i = startIndex; i < rest.length; i++) {
      if (rest.charAt(i) === '|' && !isEscapedChar(rest, i)) {
        return i;
      }
    }
    return -1;
  }

  function decodeEscapedText(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\\' && i + 1 < text.length) {
        out += text.charAt(i + 1);
        i++;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function parseNodeDef(str) {
    str = str.trim();
    if (!str) return null;

    var idMatch = str.match(/^([a-zA-Z_\u3131-\uD79D][a-zA-Z0-9_\u3131-\uD79D]*)/);
    if (!idMatch) return null;

    var id = idMatch[1];
    var rest = str.substring(id.length);

    if (!rest || /^[\s;]/.test(rest) || /^[-=.]/.test(rest) || rest.charAt(0) === '&') {
      return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
    }

    // Overlapping bracket syntaxes like {{ }} and { } are resolved by
    // checking only matching candidates and preferring the longer tokens first.
    var candidates = getShapeCandidates(rest);
    for (var i = 0; i < candidates.length; i++) {
      var shapeDef = candidates[i].def;
      var openLen = shapeDef.open.length;
      var innerStart = rest.substring(openLen);
      var text;
      var totalLen;
      var closeIdx;

      if (innerStart.charAt(0) === '"') {
        var quoteIdx = findQuotedClose(rest, openLen, shapeDef.close);
        if (quoteIdx !== -1) {
          text = decodeEscapedText(rest.substring(openLen + 1, quoteIdx));
          totalLen = id.length + quoteIdx + 1 + shapeDef.close.length;
          return {
            id: id,
            text: text || id,
            shape: shapeDef.shape,
            endIndex: totalLen,
            raw: str.substring(0, totalLen)
          };
        }
      }

      closeIdx = rest.indexOf(shapeDef.close, openLen);
      if (closeIdx !== -1) {
        text = rest.substring(openLen, closeIdx).trim();
        totalLen = id.length + closeIdx + shapeDef.close.length;
        return {
          id: id,
          text: text || id,
          shape: shapeDef.shape,
          endIndex: totalLen,
          raw: str.substring(0, totalLen)
        };
      }
    }

    return { id: id, text: id, shape: 'rect', endIndex: id.length, raw: id };
  }

  function parsePipeLabelEdge(str) {
    var candidates = getEdgeCandidates(str);
    for (var i = 0; i < candidates.length; i++) {
      var operator = candidates[i];
      var remainder = str.substring(operator.length);
      var leadMatch = remainder.match(/^\s*\|/);
      if (!leadMatch) continue;
      var labelStart = operator.length + leadMatch[0].length;
      var pipeEnd = findPipeClose(str, labelStart);
      if (pipeEnd === -1) continue;
      return {
        type: operator,
        label: decodeEscapedText(str.substring(labelStart, pipeEnd)).trim(),
        endIndex: pipeEnd + 1
      };
    }
    return null;
  }

  function parseLegacyLabelEdge(str) {
    for (var i = 0; i < LEGACY_EDGE_PATTERNS.length; i++) {
      var match = str.match(LEGACY_EDGE_PATTERNS[i].regex);
      if (!match) continue;
      return {
        type: LEGACY_EDGE_PATTERNS[i].type,
        label: match[1].trim(),
        endIndex: match[0].length
      };
    }
    return null;
  }

  function parsePlainEdge(str) {
    var candidates = getEdgeCandidates(str);
    if (!candidates.length) return null;
    return {
      type: candidates[0],
      label: '',
      endIndex: candidates[0].length
    };
  }

  function parseEdge(str) {
    str = str.trim();
    return parsePipeLabelEdge(str) || parseLegacyLabelEdge(str) || parsePlainEdge(str);
  }

  function parseStyleLine(line, model) {
    var match = line.match(/^style\s+([A-Za-z_\u3131-\uD79D][A-Za-z0-9_\u3131-\uD79D]*)\s+(.+)$/);
    if (!match || !model._nodeMap[match[1]]) return;
    var node = model._nodeMap[match[1]];
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'fill') node.fill = value;
    }
  }

  function parseLinkStyleLine(line, model) {
    var match = line.match(/^linkStyle\s+(\d+)\s+(.+)$/);
    if (!match) return;
    var edge = model.edges[parseInt(match[1], 10)];
    if (!edge) return;
    var declarations = match[2].split(',');
    for (var i = 0; i < declarations.length; i++) {
      var parts = declarations[i].split(':');
      if (parts.length < 2) continue;
      var key = parts[0].trim();
      var value = parts.slice(1).join(':').trim();
      if (key === 'stroke') edge.color = value;
    }
  }

  function countSourceOccurrence(model, line) {
    return ParserHighlight.nextOccurrence(model._sourceTextCounts, line);
  }

  function pushRawTarget(model, line, lineNumber, reason, sourceInfo) {
    if (!model._diagnostics) return;
    model._diagnostics.rawStatementCount++;
    model._diagnostics.rawTargets.push({
      lineNumber: lineNumber || null,
      text: sourceInfo ? sourceInfo.text : String(line || '').trim(),
      occurrence: sourceInfo ? sourceInfo.occurrence : 1,
      reason: reason || 'unsupported'
    });
  }

  function pushRawStatement(model, line) {
    model.statements.push({
      type: 'raw',
      raw: line
    });
  }

  function nextEdgeRef(model, from, to) {
    var key = from + '->' + to;
    var occurrence = (model._edgeRefCounts[key] || 0) + 1;
    model._edgeRefCounts[key] = occurrence;
    return {
      from: from,
      to: to,
      occurrence: occurrence
    };
  }

  function parseFlowLine(line, model) {
    line = line.trim();
    if (!line) return true;

    var remaining = line;
    var prevNodeId = null;
    var consumedAny = false;
    var nodeIds = [];
    var edgeRefs = [];

    while (remaining.length > 0) {
      remaining = remaining.trim();
      if (!remaining) {
        return consumedAny ? { type: 'flow', nodeIds: nodeIds, edgeRefs: edgeRefs } : false;
      }

      var node = parseNodeDef(remaining);
      if (!node) return false;

      var restAfterNode = remaining.substring(node.endIndex).trim();
      // Mermaid allows a left-side x/o head to sit right next to the source node.
      if ((node.id.slice(-1) === 'x' || node.id.slice(-1) === 'o') && restAfterNode) {
        var trailingHead = node.id.slice(-1);
        var rescuedEdge = parseEdge(trailingHead + restAfterNode);
        if (rescuedEdge && node.id.length > 1) {
          if (node.text === node.id) node.text = node.id.slice(0, -1);
          node.id = node.id.slice(0, -1);
          restAfterNode = trailingHead + restAfterNode;
        }
      }

      if (!model._nodeMap[node.id]) {
        var nodeObj = { id: node.id, text: node.text, shape: node.shape };
        model.nodes.push(nodeObj);
        model._nodeMap[node.id] = nodeObj;
        consumedAny = true;
      } else if (node.text !== node.id || node.shape !== 'rect') {
        model._nodeMap[node.id].text = node.text;
        model._nodeMap[node.id].shape = node.shape;
        consumedAny = true;
      }
      nodeIds.push(node.id);

      remaining = restAfterNode;

      if (prevNodeId !== null && model._pendingEdge) {
        model.edges.push({
          from: prevNodeId,
          to: node.id,
          text: model._pendingEdge.label,
          type: model._pendingEdge.type
        });
        edgeRefs.push(nextEdgeRef(model, prevNodeId, node.id));
        model._pendingEdge = null;
        consumedAny = true;
      }

      var edge = parseEdge(remaining);
      if (edge) {
        model._pendingEdge = edge;
        prevNodeId = node.id;
        remaining = remaining.substring(edge.endIndex).trim();
        consumedAny = true;
      } else {
        prevNodeId = null;
        model._pendingEdge = null;
        return !remaining ? { type: 'flow', nodeIds: nodeIds, edgeRefs: edgeRefs } : false;
      }
    }

    return consumedAny ? { type: 'flow', nodeIds: nodeIds, edgeRefs: edgeRefs } : false;
  }

  function parseMermaid(script) {
    if (!script || typeof script !== 'string') {
      return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
    }

    var trimmed = script.trim();
    if (/^sequenceDiagram\b/i.test(trimmed) && global.SequenceParser) {
      return global.SequenceParser.parse(script);
    }

    var lines = script.split('\n');
    var model = {
      type: 'flowchart',
      direction: 'TD',
      nodes: [],
      edges: [],
      statements: [],
      _nodeMap: {},
      _pendingEdge: null,
      _edgeRefCounts: {},
      _sourceTextCounts: {},
      diagnostics: {
        rawStatementCount: 0,
        rawTargets: []
      },
      _diagnostics: {
        rawStatementCount: 0,
        rawTargets: []
      }
    };
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var sourceInfo = countSourceOccurrence(model, line);

      if (!line || line.indexOf('%%') === 0) continue;
      if (line.indexOf('classDef') === 0 || line.indexOf('class ') === 0) {
        pushRawTarget(model, line, i + 1, 'class', sourceInfo);
        pushRawStatement(model, line);
        continue;
      }

      if (line.indexOf('style ') === 0) {
        parseStyleLine(line, model);
        continue;
      }

      if (line.indexOf('linkStyle ') === 0) {
        parseLinkStyleLine(line, model);
        continue;
      }

      if (!started) {
        var headerMatch = line.match(/^(?:graph|flowchart)\s+(TD|TB|BT|LR|RL)/i);
        if (headerMatch) {
          model.direction = headerMatch[1].toUpperCase();
          if (model.direction === 'TB') model.direction = 'TD';
          started = true;
          continue;
        }
        if (/^(?:graph|flowchart)\s*$/.test(line)) {
          started = true;
          continue;
        }
      }

      if (!started) continue;
      if (line.indexOf('subgraph') === 0 || line === 'end') {
        pushRawTarget(model, line, i + 1, 'subgraph', sourceInfo);
        pushRawStatement(model, line);
        continue;
      }

      var statement = parseFlowLine(line, model);
      if (!statement) {
        pushRawTarget(model, line, i + 1, 'flow-line', sourceInfo);
        pushRawStatement(model, line);
      } else {
        model.statements.push(statement);
      }
    }

    model.diagnostics = {
      rawStatementCount: model._diagnostics.rawStatementCount,
      rawTargets: model._diagnostics.rawTargets.slice()
    };
    delete model._nodeMap;
    delete model._pendingEdge;
    delete model._edgeRefCounts;
    delete model._sourceTextCounts;
    delete model._diagnostics;

    return model;
  }

  global.MermaidParser = {
    parse: parseMermaid
  };
})(typeof window !== 'undefined' ? window : this);


/* ===== src/representation/mermaid-generator.js ===== */
(function (global) {
  'use strict';

  var FlowEdgeCodec = global.FlowEdgeCodec;

  var SHAPE_BRACKETS = {
    rect: ['[', ']'],
    round: ['(', ')'],
    stadium: ['([', '])'],
    subroutine: ['[[', ']]'],
    cylinder: ['[(', ')]'],
    rhombus: ['{', '}'],
    hexagon: ['{{', '}}'],
    parallelogram: ['[/', '/]'],
    parallelogram_alt: ['[\\', '\\]'],
    trapezoid: ['[/', '\\]'],
    trapezoid_alt: ['[\\', '/]'],
    double_circle: ['((', '))'],
    asymmetric: ['>', ']']
  };

  function escapeLabel(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function escapeEdgeLabel(text) {
    return String(text)
      .replace(/\|/g, '\\|')
      .trim();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHex(color) {
    if (!color) return '';
    var trimmed = String(color).trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return '';
    if (trimmed.length === 4) {
      return '#' + trimmed.charAt(1) + trimmed.charAt(1) +
        trimmed.charAt(2) + trimmed.charAt(2) +
        trimmed.charAt(3) + trimmed.charAt(3);
    }
    return trimmed.toLowerCase();
  }

  function darkenHex(color, amount) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var ratio = clamp(amount, 0, 1);
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    r = Math.round(r * (1 - ratio));
    g = Math.round(g * (1 - ratio));
    b = Math.round(b * (1 - ratio));
    return '#' + [r, g, b].map(function (v) {
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function contrastText(color) {
    var hex = normalizeHex(color);
    if (!hex) return '';
    var r = parseInt(hex.substr(1, 2), 16);
    var g = parseInt(hex.substr(3, 2), 16);
    var b = parseInt(hex.substr(5, 2), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.68 ? '#1b2a4a' : '#ffffff';
  }

  function generateNode(node) {
    var brackets = SHAPE_BRACKETS[node.shape] || SHAPE_BRACKETS.rect;
    var text = node.text || node.id;

    if (text === node.id && node.shape === 'rect') {
      return node.id;
    }

    return node.id + brackets[0] + '"' + escapeLabel(text) + '"' + brackets[1];
  }

  function generateEdgeOperator(edge) {
    var type = edge.type || '-->';
    var text = edge.text || '';

    if (!text || !text.trim()) return type;

    // Flowchart edge labels are serialized as operator|label| so the
    // parser can keep the operator itself in edge.type.
    return type + '|' + escapeEdgeLabel(text) + '|';
  }

  function buildLinkStyle(index, edge) {
    var edgeColor = normalizeHex(edge && edge.color);
    if (!edgeColor) return '';

    var body = FlowEdgeCodec ? FlowEdgeCodec.getBodyType(edge.type || '-->') : 'solid';
    var parts = [
      'stroke:' + edgeColor,
      'color:' + edgeColor
    ];

    if (body === 'thick') {
      parts.push('stroke-width:4px');
    } else if (body === 'dotted') {
      parts.push('stroke-width:2px');
      parts.push('stroke-dasharray:3\\,3');
    } else {
      parts.push('stroke-width:2px');
    }

    return '    linkStyle ' + index + ' ' + parts.join(',');
  }

  function findEdgeByRef(edges, ref) {
    if (!ref || !edges) return { edge: null, index: -1 };
    var occurrence = 0;
    for (var i = 0; i < edges.length; i++) {
      var edge = edges[i];
      if (!edge || edge.from !== ref.from || edge.to !== ref.to) continue;
      occurrence++;
      if (occurrence === ref.occurrence) {
        return { edge: edge, index: i };
      }
    }
    return { edge: null, index: -1 };
  }

  function buildFlowStatementLine(statement, model, usedNodes, usedEdges) {
    if (!statement || statement.type !== 'flow') return '';
    var nodeIds = statement.nodeIds || [];
    var edgeRefs = statement.edgeRefs || [];
    if (!nodeIds.length) return '';

    var firstNode = findNode(model.nodes, nodeIds[0]);
    if (!firstNode) return '';
    var parts = [generateNode(firstNode)];
    usedNodes[firstNode.id] = true;

    for (var i = 0; i < edgeRefs.length; i++) {
      var edgeMatch = findEdgeByRef(model.edges, edgeRefs[i]);
      var edge = edgeMatch.edge;
      var nextNode = findNode(model.nodes, nodeIds[i + 1]);
      if (!edge || !nextNode) return '';
      if (edgeMatch.index >= 0) usedEdges[edgeMatch.index] = true;
      usedNodes[nextNode.id] = true;
      parts.push(generateEdgeOperator(edge));
      parts.push(generateNode(nextNode));
    }

    return parts.join(' ');
  }

  function generateMermaid(model) {
    if (!model) return '';
    if (model.type === 'sequenceDiagram' && global.SequenceGenerator) {
      return global.SequenceGenerator.generate(model);
    }

    var lines = [];
    var direction = model.direction || 'TD';
    lines.push('flowchart ' + direction);

    var statements = model.statements || [];
    if (statements.length) {
      var usedNodes = {};
      var usedEdges = {};

      for (var s = 0; s < statements.length; s++) {
        var statement = statements[s];
        var line = '';
        if (statement.type === 'raw') {
          line = statement.raw || '';
        } else if (statement.type === 'flow') {
          line = buildFlowStatementLine(statement, model, usedNodes, usedEdges);
        }
        if (line) lines.push('    ' + line);
      }

      if (model.nodes && model.nodes.length > 0) {
        for (var rn = 0; rn < model.nodes.length; rn++) {
          if (usedNodes[model.nodes[rn].id]) continue;
          lines.push('    ' + generateNode(model.nodes[rn]));
        }
      }

      if (model.edges && model.edges.length > 0) {
        for (var re = 0; re < model.edges.length; re++) {
          if (usedEdges[re]) continue;
          var remainingEdge = FlowEdgeCodec
            ? FlowEdgeCodec.normalizeEdgeForOutput(model.edges[re])
            : model.edges[re];
          lines.push('    ' + remainingEdge.from + ' ' + generateEdgeOperator(remainingEdge) + ' ' + remainingEdge.to);
        }
      }

      if (model.nodes && model.nodes.length > 0) {
        for (var sn = 0; sn < model.nodes.length; sn++) {
          var styleNode = model.nodes[sn];
          var styleFill = normalizeHex(styleNode.fill);
          if (!styleFill) continue;
          lines.push(
            '    style ' + styleNode.id +
            ' fill:' + styleFill +
            ',stroke:' + darkenHex(styleFill, 0.22) +
            ',color:' + contrastText(styleFill)
          );
        }
      }

      if (model.edges && model.edges.length > 0) {
        for (var se = 0; se < model.edges.length; se++) {
          var styleLine = buildLinkStyle(se, model.edges[se]);
          if (styleLine) lines.push(styleLine);
        }
      }

      return lines.join('\n');
    }

    if (model.nodes && model.nodes.length > 0) {
      for (var i = 0; i < model.nodes.length; i++) {
        lines.push('    ' + generateNode(model.nodes[i]));
      }
    }

    if (model.edges && model.edges.length > 0) {
      for (var j = 0; j < model.edges.length; j++) {
        var edge = FlowEdgeCodec
          ? FlowEdgeCodec.normalizeEdgeForOutput(model.edges[j])
          : model.edges[j];
        lines.push('    ' + edge.from + ' ' + generateEdgeOperator(edge) + ' ' + edge.to);
      }
    }

    if (model.nodes && model.nodes.length > 0) {
      for (var n = 0; n < model.nodes.length; n++) {
        var node = model.nodes[n];
        var fill = normalizeHex(node.fill);
        if (!fill) continue;
        lines.push(
          '    style ' + node.id +
          ' fill:' + fill +
          ',stroke:' + darkenHex(fill, 0.22) +
          ',color:' + contrastText(fill)
        );
      }
    }

    if (model.edges && model.edges.length > 0) {
      for (var e = 0; e < model.edges.length; e++) {
        var linkStyle = buildLinkStyle(e, model.edges[e]);
        if (linkStyle) lines.push(linkStyle);
      }
    }

    return lines.join('\n');
  }

  function findNode(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) return nodes[i];
    }
    return null;
  }

  global.MermaidGenerator = {
    generate: generateMermaid,
    generateNode: generateNode,
    findNode: findNode
  };
})(typeof window !== 'undefined' ? window : this);


/* ===== src/model-editing/flowchartModelEditing.js ===== */
(function (global) {
  'use strict';

  // Flowchart model을 순수하게 편집하는 계층.
  // Vue 상태, emit, snapshot 같은 부수효과는 여기서 다루지 않는다.

  function sameEdge(edge, from, to) {
    return edge && edge.from === from && edge.to === to;
  }

  // 노드 배열만 바꾸는 공통 패턴을 한곳에 모은다.
  // updater가 아무 변경도 하지 않으면 기존 model을 그대로 반환한다.
  function updateNodes(model, updater) {
    var nodes = model.nodes || [];
    var nextNodes = [];
    var changed = false;

    for (var i = 0; i < nodes.length; i++) {
      var nextNode = updater(nodes[i], i);
      nextNodes.push(nextNode);
      if (nextNode !== nodes[i]) changed = true;
    }

    return changed ? Object.assign({}, model, { nodes: nextNodes }) : model;
  }

  // edge 관련 수정도 같은 방식으로 immutable update를 유지한다.
  function updateEdges(model, updater) {
    var edges = model.edges || [];
    var nextEdges = [];
    var changed = false;

    for (var i = 0; i < edges.length; i++) {
      var nextEdge = updater(edges[i], i);
      nextEdges.push(nextEdge);
      if (nextEdge !== edges[i]) changed = true;
    }

    return changed ? Object.assign({}, model, { edges: nextEdges }) : model;
  }

  var flowchartModelEditing = {
    // 새 노드를 model에 추가한다.
    addNode: function (model, data) {
      if (!model || !data || !data.id) return model;

      var nodes = (model.nodes || []).slice();
      var nextNode = {
        id: data.id,
        text: data.text || 'Node',
        shape: data.shape || 'rect'
      };
      if (data.fill) nextNode.fill = data.fill;
      nodes.push(nextNode);
      return Object.assign({}, model, { nodes: nodes });
    },

    // self-loop는 동일 edge 중복 추가를 막는다.
    addEdge: function (model, data) {
      if (!model || !data || !data.from || !data.to) return model;

      var edges = model.edges || [];
      if (data.from === data.to) {
        for (var i = 0; i < edges.length; i++) {
          if (sameEdge(edges[i], data.from, data.to)) return model;
        }
      }

      var nextEdges = edges.slice();
      nextEdges.push({
        from: data.from,
        to: data.to,
        text: data.text || '',
        type: data.type || '-->'
      });
      return Object.assign({}, model, { edges: nextEdges });
    },

    // 아래 update* 계열은 각각 한 가지 field 책임만 가진다.
    updateNodeText: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { text: data.text })
          : node;
      });
    },

    updateNodeShape: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { shape: data.shape })
          : node;
      });
    },

    updateNodeStyle: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        if (node.id !== data.nodeId) return node;
        return Object.assign({}, node, {
          text: data.text,
          fill: data.fill
        });
      });
    },

    updateNodeFill: function (model, data) {
      if (!model || !data || !data.nodeId) return model;
      return updateNodes(model, function (node) {
        return node.id === data.nodeId
          ? Object.assign({}, node, { fill: data.fill })
          : node;
      });
    },

    updateEdgeText: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { text: data.text })
          : edge;
      });
    },

    updateEdgeType: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { type: data.type })
          : edge;
      });
    },

    updateEdgeStyle: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        if (index !== data.index) return edge;
        return Object.assign({}, edge, {
          text: data.text,
          color: data.color
        });
      });
    },

    updateEdgeColor: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateEdges(model, function (edge, index) {
        return index === data.index
          ? Object.assign({}, edge, { color: data.color })
          : edge;
      });
    },

    changeDirection: function (model, dir) {
      if (!model || !dir || model.direction === dir) return model;
      return Object.assign({}, model, { direction: dir });
    },

    // selection payload를 받아 node 또는 edge 삭제를 처리한다.
    // 삭제 대상이 없으면 원본 model을 그대로 돌려준다.
    deleteSelection: function (model, data) {
      if (!model || !data) return model;

      if (data.nodeId) {
        var nodes = (model.nodes || []).filter(function (node) {
          return node.id !== data.nodeId;
        });
        var edges = (model.edges || []).filter(function (edge) {
          return edge.from !== data.nodeId && edge.to !== data.nodeId;
        });
        if (nodes.length === (model.nodes || []).length && edges.length === (model.edges || []).length) {
          return model;
        }
        return Object.assign({}, model, { nodes: nodes, edges: edges });
      }

      if (data.edgeIndex !== null && data.edgeIndex !== undefined) {
        if (!model.edges || data.edgeIndex < 0 || data.edgeIndex >= model.edges.length) return model;
        var nextEdges = model.edges.slice();
        nextEdges.splice(data.edgeIndex, 1);
        return Object.assign({}, model, { edges: nextEdges });
      }

      return model;
    }
  };

  global.flowchartModelEditing = flowchartModelEditing;
})(typeof window !== 'undefined' ? window : this);


/* ===== src/model-editing/sequenceModelEditing.js ===== */
(function (global) {
  'use strict';

  // Sequence model을 순수하게 편집하는 계층.
  // 여기서는 Vue 컴포넌트 상태나 script 갱신을 모르고 nextModel만 계산한다.

  // sequence 쪽은 patch 적용 뒤 activation 정규화와 explicitParticipants 보정이 항상 필요하다.
  function finish(model, patch) {
    var nextModel = Object.assign({}, model, patch);
    nextModel.explicitParticipants = true;
    if (nextModel.messages) {
      nextModel.messages = SequenceMessageCodec.normalizeActivations(nextModel.messages);
    }
    return nextModel;
  }

  // participant 배열만 바뀌는 수정은 이 helper를 통해 immutable update한다.
  function updateParticipants(model, updater) {
    var participants = model.participants || [];
    var nextParticipants = [];
    var changed = false;

    for (var i = 0; i < participants.length; i++) {
      var nextParticipant = updater(participants[i], i);
      nextParticipants.push(nextParticipant);
      if (nextParticipant !== participants[i]) changed = true;
    }

    return changed ? finish(model, { participants: nextParticipants }) : model;
  }

  // message 배열 수정도 같은 패턴으로 공통화한다.
  function updateMessages(model, updater) {
    var messages = model.messages || [];
    var nextMessages = [];
    var changed = false;

    for (var i = 0; i < messages.length; i++) {
      var nextMessage = updater(messages[i], i);
      nextMessages.push(nextMessage);
      if (nextMessage !== messages[i]) changed = true;
    }

    return changed ? finish(model, { messages: nextMessages }) : model;
  }

  var sequenceModelEditing = {
    // participant / actor 추가는 kind만 다르고 같은 규칙을 공유한다.
    addParticipant: function (model, data) {
      if (!model || !data || !data.id) return model;
      var participants = (model.participants || []).slice();
      participants.push({
        id: data.id,
        label: data.label || data.id,
        kind: data.kind || 'participant'
      });
      return finish(model, { participants: participants });
    },

    toggleParticipantKind: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return updateParticipants(model, function (participant) {
        if (participant.id !== data.participantId) return participant;
        return Object.assign({}, participant, {
          kind: participant.kind === 'actor' ? 'participant' : 'actor'
        });
      });
    },

    moveParticipant: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      var participants = (model.participants || []).slice();
      var index = -1;
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].id === data.participantId) {
          index = i;
          break;
        }
      }
      if (index === -1) return model;

      var swapIndex = data.direction === 'left' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= participants.length) return model;

      var temp = participants[index];
      participants[index] = participants[swapIndex];
      participants[swapIndex] = temp;
      return finish(model, { participants: participants });
    },

    // payload 형태에 따라 from/to 기본값과 삽입 위치를 계산해 새 message를 만든다.
    addMessage: function (model, payload) {
      if (!model) return model;
      var participants = model.participants || [];
      if (!participants.length) return model;

      var fromId = participants[0].id;
      var toId = participants[Math.min(1, participants.length - 1)].id;
      var messageText = 'Message';

      if (payload && payload.fromId) fromId = payload.fromId;
      if (payload && payload.toId) toId = payload.toId;
      if (payload && payload.text) messageText = payload.text;

      if (payload && payload.participantId && !payload.fromId) {
        fromId = payload.participantId;
        for (var i = 0; i < participants.length; i++) {
          if (participants[i].id === payload.participantId) {
            toId = participants[(i + 1) % participants.length].id;
            break;
          }
        }
      }

      var messages = (model.messages || []).slice();
      var insertAt = messages.length;
      if (payload && payload.insertIndex !== null && payload.insertIndex !== undefined) {
        insertAt = Math.max(0, Math.min(messages.length, payload.insertIndex));
      } else if (payload && payload.afterIndex !== null && payload.afterIndex !== undefined) {
        insertAt = Math.min(messages.length, payload.afterIndex + 1);
      }

      var newMessage = {
        from: fromId,
        to: toId,
        operator: '->>',
        text: messageText
      };
      messages.splice(insertAt, 0, newMessage);

      return finish(model, {
        messages: messages,
        statements: SequenceStatementUtils.insertMessageStatement(model, insertAt, newMessage)
      });
    },

    updateParticipantText: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return updateParticipants(model, function (participant) {
        return participant.id === data.participantId
          ? Object.assign({}, participant, { label: data.text })
          : participant;
      });
    },

    updateMessageText: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateMessages(model, function (message, index) {
        return index === data.index
          ? Object.assign({}, message, { text: data.text })
          : message;
      });
    },

    reverseMessage: function (model, index) {
      if (!model || index === null || index === undefined) return model;
      return updateMessages(model, function (message, messageIndex) {
        if (messageIndex !== index) return message;
        return Object.assign({}, message, {
          from: message.to,
          to: message.from
        });
      });
    },

    toggleAutonumber: function (model) {
      if (!model) return model;
      return finish(model, { autonumber: !model.autonumber });
    },

    toggleMessageLineType: function (model, index) {
      if (!model || index === null || index === undefined) return model;
      return updateMessages(model, function (message, messageIndex) {
        if (messageIndex !== index) return message;
        return Object.assign({}, message, {
          operator: SequenceMessageCodec.toggleLineStyle(
            message.operator || SequenceMessageCodec.DEFAULT_OPERATOR
          )
        });
      });
    },

    // line type은 operator 본문만 바꾸고 activation suffix(+/-)는 유지한다.
    setMessageLineType: function (model, data) {
      if (!model || !data || data.index === null || data.index === undefined) return model;
      return updateMessages(model, function (message, index) {
        if (index !== data.index) return message;
        var suffix = /[+-]$/.test(message.operator || '') ? message.operator.slice(-1) : '';
        return Object.assign({}, message, { operator: data.operator + suffix });
      });
    },

    // block / branch / note 계열은 statements 트리를 갱신하는 편집이다.
    addBranch: function (model, data) {
      if (!model || !data || !data.keyword || !data.messageIndices || !data.messageIndices.length) return model;
      return finish(model, {
        statements: SequenceStatementUtils.insertBranchStatement(
          model,
          data.messageIndices,
          data.keyword,
          data.text || ''
        )
      });
    },

    wrapMessagesInBlock: function (model, data) {
      var messageIndices = data && data.messageIndices ? data.messageIndices : [];
      if (!model || !data || !data.kind || !messageIndices.length) return model;
      return finish(model, {
        statements: SequenceStatementUtils.wrapMessagesInBlock(
          model,
          messageIndices,
          data.kind,
          data.text || ''
        )
      });
    },

    updateBlockText: function (model, data) {
      if (!model || !data || !data.blockId) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateBlockText(model, data.blockId, nextText)
          : SequenceStatementUtils.deleteBlock(model, data.blockId)
      });
    },

    updateBranchText: function (model, data) {
      if (!model || !data || data.statementIndex === null || data.statementIndex === undefined) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateBranchText(model, data.statementIndex, data.text || '')
          : SequenceStatementUtils.deleteBranchStatement(model, data.statementIndex)
      });
    },

    changeBlockType: function (model, data) {
      if (!model || !data || !data.blockId || !data.kind) return model;
      return finish(model, {
        statements: SequenceStatementUtils.changeBlockKind(model, data.blockId, data.kind)
      });
    },

    addNote: function (model, data) {
      if (!model || !data || !data.participantId) return model;
      return finish(model, {
        statements: SequenceStatementUtils.addNoteStatement(
          model,
          data.participantId,
          data.insertIndex !== undefined ? data.insertIndex : null,
          data.text || 'Note'
        )
      });
    },

    updateNoteText: function (model, data) {
      if (!model || !data || data.statementIndex === null || data.statementIndex === undefined) return model;
      var nextText = String(data.text || '').trim();
      return finish(model, {
        statements: nextText
          ? SequenceStatementUtils.updateNoteText(model, data.statementIndex, nextText)
          : SequenceStatementUtils.deleteNoteStatement(model, data.statementIndex)
      });
    },

    // selection payload를 보고 participant / block / note / message 삭제를 분기한다.
    deleteSelection: function (model, data) {
      if (!model || !data) return model;

      if (data.sequenceParticipantId) {
        var removedIndices = [];
        var originalMessages = model.messages || [];
        var participants = (model.participants || []).filter(function (participant) {
          return participant.id !== data.sequenceParticipantId;
        });
        var messages = originalMessages.filter(function (message, index) {
          var keep = message.from !== data.sequenceParticipantId && message.to !== data.sequenceParticipantId;
          if (!keep) removedIndices.push(index);
          return keep;
        });
        if (participants.length === (model.participants || []).length && messages.length === originalMessages.length) {
          return model;
        }
        return finish(model, {
          participants: participants,
          messages: messages,
          statements: SequenceStatementUtils.removeParticipantStatements(
            model,
            data.sequenceParticipantId,
            removedIndices
          )
        });
      }

      if (data.sequenceBlockId) {
        return finish(model, {
          statements: SequenceStatementUtils.deleteBlock(model, data.sequenceBlockId)
        });
      }

      if (data.sequenceNoteStatementIndex !== null && data.sequenceNoteStatementIndex !== undefined) {
        return finish(model, {
          statements: SequenceStatementUtils.deleteNoteStatement(model, data.sequenceNoteStatementIndex)
        });
      }

      if (data.sequenceMessageIndex !== null && data.sequenceMessageIndex !== undefined) {
        if (!model.messages || data.sequenceMessageIndex < 0 || data.sequenceMessageIndex >= model.messages.length) {
          return model;
        }
        var nextMessages = model.messages.slice();
        nextMessages.splice(data.sequenceMessageIndex, 1);
        return finish(model, {
          messages: nextMessages,
          statements: SequenceStatementUtils.removeMessageStatements(model, [data.sequenceMessageIndex])
        });
      }

      return model;
    }
  };

  global.sequenceModelEditing = sequenceModelEditing;
})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/HistoryManager.js ===== */
(function (global) {
  'use strict';

  var MAX_STACK = 50;

  function HistoryManager() {
    this._past   = [];
    this._future = [];
  }

  // mutation 전에 현재 모델을 저장한다.
  HistoryManager.prototype.snapshot = function (model) {
    this._past.push(JSON.stringify(model));
    if (this._past.length > MAX_STACK) this._past.shift();
    this._future = []; // 새 액션이 생기면 redo 경로는 무효화된다.
  };

  // 이전 모델 반환. undo할 것이 없으면 null.
  HistoryManager.prototype.undo = function (currentModel) {
    if (!this._past.length) return null;
    this._future.push(JSON.stringify(currentModel));
    return JSON.parse(this._past.pop());
  };

  // 다음 모델 반환. redo할 것이 없으면 null.
  HistoryManager.prototype.redo = function (currentModel) {
    if (!this._future.length) return null;
    this._past.push(JSON.stringify(currentModel));
    return JSON.parse(this._future.pop());
  };

  HistoryManager.prototype.canUndo = function () { return this._past.length > 0; };
  HistoryManager.prototype.canRedo = function () { return this._future.length > 0; };

  HistoryManager.prototype.clear = function () {
    this._past   = [];
    this._future = [];
  };

  global.HistoryManager = HistoryManager;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/SvgExport.js ===== */
(function (global) {
  'use strict';

  function getSvgString(svgSource) {
    if (!svgSource) return '';
    if (typeof svgSource === 'string') return svgSource;
    return new XMLSerializer().serializeToString(svgSource);
  }

  function createMeasureContext(fontSize, fontFamily) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = fontSize + 'px ' + fontFamily;
    return ctx;
  }

  function isCodeLikeToken(token) {
    return /[(){}\[\]<>=&|+\-/*_:.,]/.test(String(token || ''));
  }

  function getLongTokenBreakAt(text, index) {
    var pairOps = ['&&', '||', '==', '!=', '>=', '<=', '->', '=>', '+=', '-=', '*=', '/='];
    for (var i = 0; i < pairOps.length; i++) {
      var op = pairOps[i];
      if (text.substr(index, op.length) === op) return op;
    }

    var singleOps = '()[]{}<>+-/*%=!?:,._';
    var ch = text.charAt(index);
    return singleOps.indexOf(ch) !== -1 ? ch : '';
  }

  function splitLongToken(token) {
    var pieces = [];
    var current = '';
    var i = 0;

    while (i < token.length) {
      var breakToken = getLongTokenBreakAt(token, i);
      if (breakToken) {
        current += breakToken;
        pieces.push(current);
        current = '';
        i += breakToken.length;
        continue;
      }

      current += token.charAt(i);
      i += 1;
    }

    if (current) pieces.push(current);
    return pieces.length ? pieces : [token];
  }

  function wrapLongToken(token, maxWidth, ctx) {
    var pieces = splitLongToken(token);
    var lines = [];
    var current = '';

    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      if (ctx.measureText(piece).width > maxWidth) {
        if (current) {
          lines.push(current);
          current = '';
        }

        var charCurrent = '';
        for (var c = 0; c < piece.length; c++) {
          var candidateChar = charCurrent + piece.charAt(c);
          if (!charCurrent || ctx.measureText(candidateChar).width <= maxWidth) {
            charCurrent = candidateChar;
          } else {
            lines.push(charCurrent);
            charCurrent = piece.charAt(c);
          }
        }
        if (charCurrent) lines.push(charCurrent);
        continue;
      }

      var candidate = current + piece;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = piece;
      }
    }

    if (current) lines.push(current);
    return lines.length ? lines : [token];
  }

  function wrapLineToWidth(line, maxWidth, fontSize, fontFamily) {
    var normalized = String(line || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return [''];

    var ctx = createMeasureContext(fontSize, fontFamily);
    if (!ctx) return [normalized];
    var hasSpaces = normalized.indexOf(' ') !== -1;
    var relaxedMaxWidth = hasSpaces ? (maxWidth + Math.max(12, fontSize)) : maxWidth;
    if (ctx.measureText(normalized).width <= relaxedMaxWidth) return [normalized];

    if (!hasSpaces) {
      return isCodeLikeToken(normalized) ? wrapLongToken(normalized, maxWidth, ctx) : [normalized];
    }

    var words = normalized.split(' ');
    var lines = [];
    var current = '';

    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var candidate = current ? (current + ' ' + word) : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        if (ctx.measureText(word).width <= maxWidth || !isCodeLikeToken(word)) {
          current = word;
        } else {
          var wrappedWordLines = wrapLongToken(word, maxWidth, ctx);
          for (var j = 0; j < wrappedWordLines.length - 1; j++) {
            lines.push(wrappedWordLines[j]);
          }
          current = wrappedWordLines[wrappedWordLines.length - 1] || '';
        }
      }
    }

    if (current) lines.push(current);
    return lines.length ? lines : [normalized];
  }

  function wrapTextToLines(text, maxWidth, fontSize, fontFamily) {
    var rawLines = String(text || '')
      .trim()
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });

    if (!rawLines.length) return [''];

    var lines = [];
    for (var i = 0; i < rawLines.length; i++) {
      var wrapped = wrapLineToWidth(rawLines[i], maxWidth, fontSize, fontFamily);
      for (var j = 0; j < wrapped.length; j++) {
        lines.push(wrapped[j]);
      }
    }

    return lines.length ? lines : [''];
  }

  function replaceForeignObjects(doc, svgEl) {
    var fos = svgEl.querySelectorAll('foreignObject');
    for (var i = 0; i < fos.length; i++) {
      var fo = fos[i];
      var fx = parseFloat(fo.getAttribute('x') || 0);
      var fy = parseFloat(fo.getAttribute('y') || 0);
      var fw = parseFloat(fo.getAttribute('width') || 100);
      var fh = parseFloat(fo.getAttribute('height') || 20);
      var fontSize = 14;
      var fontFamily = 'sans-serif';
      var lineHeight = 18;
      var lines = wrapTextToLines(fo.textContent || '', Math.max(16, fw - 10), fontSize, fontFamily);
      if (!lines.length) lines = [''];

      var textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', fx + fw / 2);
      textEl.setAttribute('y', fy + fh / 2);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', String(fontSize));
      textEl.setAttribute('font-family', fontFamily);
      textEl.setAttribute('fill', '#333');

      if (lines.length <= 1) {
        textEl.textContent = lines[0] || '';
      } else {
        var startDy = -(lines.length - 1) / 2 * lineHeight;
        for (var li = 0; li < lines.length; li++) {
          var tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', fx + fw / 2);
          tspan.setAttribute('dy', li === 0 ? startDy : lineHeight);
          tspan.textContent = lines[li];
          textEl.appendChild(tspan);
        }
      }

      if (fo.parentNode) {
        fo.parentNode.replaceChild(textEl, fo);
      }
    }
  }

  function serializeForRaster(svgSource, options) {
    options = options || {};
    var pad = options.padding !== undefined ? options.padding : 20;
    var svgStr = getSvgString(svgSource);
    if (!svgStr) throw new Error('SVG source is empty');

    var parser = new DOMParser();
    var doc = parser.parseFromString(svgStr, 'image/svg+xml');
    var svgEl = doc.querySelector('svg');
    if (!svgEl) throw new Error('SVG element not found');

    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    replaceForeignObjects(doc, svgEl);

    var vb = svgEl.getAttribute('viewBox');
    var w, h;
    if (vb) {
      var parts = vb.trim().split(/[\s,]+/);
      w = parseFloat(parts[2]) || 800;
      h = parseFloat(parts[3]) || 600;
    } else {
      w = parseFloat(svgEl.getAttribute('width')) || 800;
      h = parseFloat(svgEl.getAttribute('height')) || 600;
    }

    w = Math.ceil(w + pad * 2);
    h = Math.ceil(h + pad * 2);
    svgEl.setAttribute('width', w);
    svgEl.setAttribute('height', h);
    svgEl.setAttribute('viewBox', (-pad) + ' ' + (-pad) + ' ' + w + ' ' + h);

    return {
      svg: new XMLSerializer().serializeToString(svgEl),
      width: w,
      height: h
    };
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.download = filename;
    a.href = url;
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function exportSvg(svgSource, options) {
    options = options || {};
    var filename = options.filename || 'diagram.svg';
    var svgStr = getSvgString(svgSource);
    if (!svgStr) return Promise.reject(new Error('SVG source is empty'));
    downloadBlob(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }), filename);
    return Promise.resolve();
  }

  function exportRaster(svgSource, options) {
    options = options || {};
    var format = options.format || 'png';
    var filename = options.filename || ('diagram.' + format);
    var scale = options.scale || 2;
    var bgColor = options.bgColor || '#ffffff';
    var mime = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
    var quality = options.quality != null ? options.quality : 0.92;
    var source = serializeForRaster(svgSource, options);
    var blob = new Blob([source.svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);

    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var cvs = document.createElement('canvas');
        cvs.width = source.width * scale;
        cvs.height = source.height * scale;
        var ctx = cvs.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas 2D context is not available'));
          return;
        }
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        cvs.toBlob(function (rasterBlob) {
          if (!rasterBlob) {
            reject(new Error('Failed to create raster image'));
            return;
          }
          downloadBlob(rasterBlob, filename);
          resolve();
        }, mime, mime === 'image/jpeg' ? quality : undefined);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG as image'));
      };
      img.src = url;
    });
  }

  global.SvgExport = {
    exportSvg: exportSvg,
    exportPng: function (svgSource, options) {
      options = Object.assign({}, options, { format: 'png' });
      if (!options.filename) options.filename = 'diagram.png';
      return exportRaster(svgSource, options);
    },
    exportJpg: function (svgSource, options) {
      options = Object.assign({}, options, { format: 'jpg' });
      if (!options.filename) options.filename = 'diagram.jpg';
      return exportRaster(svgSource, options);
    }
  };
})(typeof window !== 'undefined' ? window : this);


/* ===== src/utils/PreviewCtxBuilder.js ===== */
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
      showUnsupportedHint: function () {
        if (vm.showUnsupportedHint) vm.showUnsupportedHint();
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
      openSequenceNoteEdit: function (statementIndex, text, clientX, clientY) {
        vm.sequenceToolbar = null;
        vm.editingSequenceNoteStatementIndex = statementIndex;
        vm.editingSequenceNoteText = text || '';
        vm.sequenceNoteEditStyle = {
          position: 'fixed',
          left: Math.max(12, clientX - 140) + 'px',
          top: Math.max(12, clientY - 22) + 'px',
          zIndex: 1000,
          width: '280px'
        };
        vm.$nextTick(function () {
          var el = vm.$refs.sequenceNoteInput;
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


/* ===== src/actions/SvgPositionTracker.js ===== */
(function (global) {
  'use strict';

  var SvgPositionTracker = {

    // Mermaid가 렌더한 .node 요소에서 논리적인 노드 id를 추출한다.
    // Mermaid 11은 "[renderPrefix-]flowchart-{nodeId}-{index}" 형태를 사용한다.
    extractNodeId: function (nodeEl) {
      // data-id가 있으면 그 값을 우선 사용한다.
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;

      var id = nodeEl.id || '';
      if (!id) return null;

      // id 안의 "flowchart-" 구간을 찾는다.
      var marker = 'flowchart-';
      var idx = id.indexOf(marker);
      if (idx !== -1) {
        var after = id.slice(idx + marker.length); // 예: "A-0", "My-Node-3"
        // 뒤쪽 "-숫자" 인덱스를 제거
        var m = after.match(/^([\s\S]*)-\d+$/);
        return m ? m[1] : after;
      }

      // 마지막 fallback: 앞뒤 dash segment를 제거해 추정
      var parts = id.split('-');
      if (parts.length >= 3) return parts.slice(1, -1).join('-');
      if (parts.length === 2) return parts[1];
      return id;
    },

    // { nodeId: { cx, cy, width, height, origTx, origTy, bboxX, bboxY } } 생성
    collectNodePositions: function (svgEl) {
      var positions = {};
      var elements  = {};
      var nodes = svgEl.querySelectorAll('.node');

      for (var i = 0; i < nodes.length; i++) {
        var nodeEl = nodes[i];
        var nodeId = SvgPositionTracker.extractNodeId(nodeEl);
        if (!nodeId) continue;

        var transform = nodeEl.getAttribute('transform') || '';
        var m = transform.match(/translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/);
        var tx = m ? parseFloat(m[1]) : 0;
        var ty = m ? parseFloat(m[2]) : 0;

        var bbox;
        try { bbox = nodeEl.getBBox(); }
        catch (e) { bbox = { x: 0, y: 0, width: 60, height: 40 }; }

        positions[nodeId] = {
          cx:     tx + bbox.x + bbox.width  / 2,
          cy:     ty + bbox.y + bbox.height / 2,
          width:  bbox.width,
          height: bbox.height,
          origTx: tx,
          origTy: ty,
          bboxX:  bbox.x,
          bboxY:  bbox.y
        };
        elements[nodeId] = nodeEl;
      }

      return { positions: positions, elements: elements };
    },

    // 지정된 방향 포트의 SVG 좌표 반환
    getPortPosition: function (positions, nodeId, side) {
      var p = positions[nodeId];
      if (!p) return { x: 0, y: 0 };
      switch (side) {
        case 'top':    return { x: p.cx,                         y: p.origTy + p.bboxY };
        case 'bottom': return { x: p.cx,                         y: p.origTy + p.bboxY + p.height };
        case 'left':   return { x: p.origTx + p.bboxX,           y: p.cy };
        case 'right':  return { x: p.origTx + p.bboxX + p.width, y: p.cy };
        default:       return { x: p.cx,                         y: p.cy };
      }
    },

    // 렌더된 엣지 DOM을 모델 엣지 index에 매핑한다.
    // 핵심은 wrapper group보다 실제 stroke path를 우선 보는 것이다.
    // Mermaid 버전/케이스에 따라 이름 없는 엣지가 다른 구조로 렌더링되기 때문이다.
    collectEdgePaths: function (svgEl, modelEdges) {
      var results = [];
      var pathCandidates = svgEl.querySelectorAll(
        '.edgePath path.path,' +
        '.edgePath path:not([class*="arrowhead"]),' +
        '.edgePaths path.path,' +
        '.edgePaths > path,' +
        'path.flowchart-link,' +
        'path[id^="L_"]'
      );
      var seenPathEls = [];
      var expectedEdges = [];
      var pairToExpectedEdges = {};

      // 노드 id 정리 규칙은 extractNodeId와 동일하게 맞춘다.
      var sanitize = function (id) {
        var marker = 'flowchart-';
        var idx = id.indexOf(marker);
        if (idx !== -1) {
          var after = id.slice(idx + marker.length);
          var m = after.match(/^([\s\S]*)-\d+$/);
          return m ? m[1] : after;
        }
        var parts = id.split('-');
        if (parts.length >= 3) return parts.slice(1, -1).join('-');
        if (parts.length === 2) return parts[1];
        return id;
      };

      var edgeOccurrences = {};
      var scanIndex = 0;

      for (var me = 0; me < modelEdges.length; me++) {
        var modelEdge = modelEdges[me];
        if (!modelEdge) continue;

        var pairKey = modelEdge.from + '::' + modelEdge.to;
        var repeatCount = modelEdge.from === modelEdge.to ? 3 : 1;
        if (!pairToExpectedEdges[pairKey]) pairToExpectedEdges[pairKey] = [];

        for (var copy = 0; copy < repeatCount; copy++) {
          var expected = {
            from: modelEdge.from,
            to: modelEdge.to,
            modelIndex: me
          };
          expectedEdges.push(expected);
          pairToExpectedEdges[pairKey].push(expected);
        }
      }

      for (var i = 0; i < pathCandidates.length; i++) {
        var pathEl = pathCandidates[i];
        if (!pathEl || seenPathEls.indexOf(pathEl) !== -1) continue;
        seenPathEls.push(pathEl);

        var edgeEl = pathEl.closest ? pathEl.closest('.edgePath') : null;
        if (!edgeEl) edgeEl = pathEl.parentNode;
        if (!edgeEl) edgeEl = pathEl;

        var cls = edgeEl.getAttribute('class') || '';
        var sm  = cls.match(/LS-([^\s]+)/);
        var em  = cls.match(/LE-([^\s]+)/);

        var fId = sm ? sanitize(sm[1]) : null;
        var tId = em ? sanitize(em[1]) : null;

        // 일부 Mermaid 렌더는 시작/끝점을 wrapper id에 넣어 준다.
        if ((!fId || !tId) && edgeEl.id) {
          var idMatch = edgeEl.id.match(/^L_(.+)_(.+?)_\d+$/);
          if (idMatch) {
            fId = fId || sanitize(idMatch[1]);
            tId = tId || sanitize(idMatch[2]);
          }
        }

        if ((!fId || !tId) && pathEl.id) {
          var pathIdMatch = pathEl.id.match(/^L_(.+)_(.+?)_\d+$/);
          if (pathIdMatch) {
            fId = fId || sanitize(pathIdMatch[1]);
            tId = tId || sanitize(pathIdMatch[2]);
          }
        }

        // DOM에서 시작/끝점을 못 읽으면 마지막 보정으로 모델 순서를 쓴다.
        if ((!fId || !tId) && scanIndex < expectedEdges.length) {
          fId = expectedEdges[scanIndex].from;
          tId = expectedEdges[scanIndex].to;
        }

        // 같은 from/to 쌍이 여러 개 있어도, self-loop는 3슬롯을 같은 model edge로 매핑한다.
        var modelIdx = scanIndex;
        if (fId && tId) {
          var key = fId + '::' + tId;
          var matchingExpected = pairToExpectedEdges[key] || [];
          edgeOccurrences[key] = edgeOccurrences[key] || 0;

          if (matchingExpected.length) {
            var occurrence = Math.min(edgeOccurrences[key], matchingExpected.length - 1);
            modelIdx = matchingExpected[occurrence].modelIndex;
          } else {
            var found = 0;
            for (var m = 0; m < modelEdges.length; m++) {
              if (modelEdges[m].from === fId && modelEdges[m].to === tId) {
                if (found === edgeOccurrences[key]) { modelIdx = m; break; }
                found++;
              }
            }
          }
          edgeOccurrences[key]++;
        } else if (scanIndex < expectedEdges.length) {
          modelIdx = expectedEdges[scanIndex].modelIndex;
        }

        results.push(pathEl ? {
          el:     edgeEl,
          path:   pathEl,
          fromId: fId,
          toId:   tId,
          index:  modelIdx
        } : null);

        scanIndex++;
      }

      return results;
    },

    // 마우스 client 좌표를 SVG 로컬 좌표로 변환
    getSVGPoint: function (svgEl, clientX, clientY) {
      var pt  = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      var ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
    },

    // SVG 좌표를 fixed-position 기준 화면 좌표로 변환
    svgToScreen: function (svgEl, svgX, svgY) {
      var pt  = svgEl.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      var ctm = svgEl.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm) : pt;
    }
  };

  global.SvgPositionTracker = SvgPositionTracker;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SvgNodeHandler.js ===== */
(function (global) {
  'use strict';

  // UI에서 노출하는 shape 목록
  var SHAPES = [
    { key: 'rect',              label: '[ ]',     name: 'Rectangle' },
    { key: 'stadium',           label: '([ ])',   name: 'Stadium' },
    { key: 'subroutine',        label: '[[ ]]',   name: 'Subroutine' },
    { key: 'cylinder',          label: '[( )]',   name: 'Cylinder' },
    { key: 'rhombus',           label: '{ }',     name: 'Diamond' },
    { key: 'hexagon',           label: '{{ }}',   name: 'Hexagon' },
    { key: 'parallelogram',     label: '[/ /]',   name: 'Slant' },
    { key: 'trapezoid',         label: '[/ \\]',  name: 'Trapezoid' },
    { key: 'trapezoid_alt',     label: '[\\ /]',  name: 'Trap. Alt' },
    { key: 'parallelogram_alt', label: '[\\ \\]', name: 'Slant Alt' },
    { key: 'double_circle',     label: '(( ))',   name: 'Circle' },
    { key: 'asymmetric',        label: '>  ]',    name: 'Asymmetric' }
  ];

  var SvgNodeHandler = {
    SHAPES: SHAPES,

    // svgEl 안의 모든 .node에 인터랙션 연결
    // ctx = MermaidPreview._buildCtx()가 만든 bridge 객체
    attach: function (svgEl, positions, elements, ctx) {
      var nodes = svgEl.querySelectorAll('.node');
      for (var i = 0; i < nodes.length; i++) {
        SvgNodeHandler._attachOne(nodes[i], svgEl, positions, elements, ctx);
      }
    },

    _attachOne: function (nodeEl, svgEl, positions, elements, ctx) {
      var nodeId = SvgPositionTracker.extractNodeId(nodeEl);
      if (!nodeId) return;

      nodeEl.style.cursor = 'pointer';

      // model에 없는 노드 = 미지원 문법. 클릭 시 안내만 표시하고 편집 인터랙션은 연결하지 않는다.
      if (!ctx.findNode(nodeId)) {
        nodeEl.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        nodeEl.addEventListener('dblclick', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        nodeEl.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ctx.showUnsupportedHint) ctx.showUnsupportedHint();
        });
        return;
      }

      // hover 중에만 포트를 띄워 canvas를 과하게 복잡하게 만들지 않는다.
      nodeEl.addEventListener('mouseenter', function () {
        ctx.setState({ hoveredNodeId: nodeId });
        nodeEl.classList.add('node-hovered');
        PortDragHandler.showPorts(svgEl, nodeId, positions, ctx);
      });

      nodeEl.addEventListener('mouseleave', function (e) {
        nodeEl.classList.remove('node-hovered');
        var rel = e.relatedTarget;
        // 커서가 포트나 overlay로 이동한 경우 포트를 바로 지우지 않는다.
        if (rel) {
          if (rel.classList && (
                rel.classList.contains('conn-port') ||
                rel.classList.contains('conn-port-glow'))) {
            return;
          }
          if (rel.closest && rel.closest('#conn-port-overlay')) {
            return;
          }
        }
        setTimeout(function () {
          var state = ctx.getState();
          if (state.hoveredNodeId === nodeId && !state.portDragging) {
            PortDragHandler.clearPorts();
            ctx.setState({ hoveredNodeId: null });
          }
        }, 180);
      });

      // 좌클릭은 선택 + 수정 메뉴를 연다.
      nodeEl.addEventListener('click', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          selectedNodeId:    nodeId,
          selectedEdgeIndex: null,
          edgeToolbar:   null,
          contextMenu:   {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          }
        });
        ctx.emit('node-selected', nodeId);
      });

      // 더블클릭 → 인라인 편집
      nodeEl.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctx.setState({ contextMenu: null });
        SvgNodeHandler.startInlineEdit(nodeId, nodeEl, ctx);
      });

      // 우클릭 → 컨텍스트 메뉴
      nodeEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rect = nodeEl.getBoundingClientRect();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        ctx.setState({
          contextMenu: {
            nodeId: nodeId,
            anchorType: 'node',
            x: Math.round((previewRect ? rect.left - previewRect.left : rect.left) + rect.width + 10),
            y: Math.round((previewRect ? rect.top - previewRect.top : rect.top) + Math.min(24, rect.height * 0.5))
          },
          edgeToolbar: null
        });
      });

      // 선택 상태 클래스 동기화
      ctx.watchSelection(nodeId, nodeEl);
    },

    startInlineEdit: function (nodeId, nodeEl, ctx) {
      var node = ctx.findNode(nodeId);
      if (!node) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      var localLeft = previewRect ? rect.left - previewRect.left : rect.left;
      var localTop = previewRect ? rect.top - previewRect.top : rect.top;
      ctx.setState({
        editingNodeId:  nodeId,
        editingText:    node.text || node.id,
        editingNodeColor: node.fill || '#e2e8f0',
        editInputStyle: {
          position: 'absolute',
          left:  (localLeft + rect.width  / 2 - 70) + 'px',
          top:   (localTop  + rect.height / 2 - 16) + 'px',
          zIndex: 1000,
          width: '240px'
        }
      });
      ctx.focusEditInput();
    }
  };

  global.SvgNodeHandler = SvgNodeHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SvgEdgeHandler.js ===== */
(function (global) {
  'use strict';

  var SvgEdgeHandler = {

    initGhostOverlay: function (svgEl) {
      var old = svgEl.querySelector('#edge-ghost-overlay');
      if (old) old.remove();
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', 'edge-ghost-overlay');
      g.style.pointerEvents = 'all';
      svgEl.appendChild(g);
      return g;
    },

    attach: function (svgEl, edgePathEls, positions, ctx) {
      var overlay = svgEl.querySelector('#edge-ghost-overlay') ||
        SvgEdgeHandler.initGhostOverlay(svgEl);

      for (var j = 0; j < edgePathEls.length; j++) {
        if (!edgePathEls[j]) continue;
        SvgEdgeHandler._attachOne(edgePathEls[j], svgEl, overlay, positions, ctx);
      }

      // 엣지 라벨은 클릭 타겟에서 제외하고, hitslop만 선택 가능하게 둔다.
      var labels = svgEl.querySelectorAll('.edgeLabel');
      for (var l = 0; l < labels.length; l++) {
        labels[l].style.pointerEvents = 'none';
        labels[l].style.cursor = 'default';
      }
    },

    _attachOne: function (edgeData, svgEl, overlay, positions, ctx) {
      var pathEl = edgeData.path;
      if (!pathEl) return;
      var idx = edgeData.index;
      var edgeEl = edgeData.el || pathEl;

      ctx.watchEdgeSelection(idx, edgeEl);

      var ghost = SvgEdgeHandler._makeGhost(pathEl, svgEl, overlay);
      if (!ghost) {
        edgeData.hit = pathEl;
        SvgEdgeHandler._bindEdgeEvents(pathEl, pathEl, edgeEl, idx, ctx);
        return;
      }

      edgeData.hit = ghost;
      SvgEdgeHandler._bindEdgeEvents(ghost, pathEl, edgeEl, idx, ctx);
    },

    _makeGhost: function (pathEl, svgEl, overlay) {
      if (typeof pathEl.getTotalLength === 'function') {
        try {
          var len = pathEl.getTotalLength();
          if (len > 1) {
            var pathCTM = pathEl.getScreenCTM();
            var svgCTM  = svgEl.getScreenCTM();
            if (pathCTM && svgCTM) {
              var invSvg  = svgCTM.inverse();
              var samples = Math.max(8, Math.ceil(len / 12));
              var pts = [];
              for (var i = 0; i <= samples; i++) {
                var lp = pathEl.getPointAtLength((i / samples) * len);
                var sp = svgEl.createSVGPoint();
                sp.x = lp.x;
                sp.y = lp.y;
                var root = sp.matrixTransform(pathCTM).matrixTransform(invSvg);
                pts.push(root.x.toFixed(2) + ',' + root.y.toFixed(2));
              }
              if (pts.length) {
                var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                poly.setAttribute('points', pts.join(' '));
                SvgEdgeHandler._styleGhost(poly);
                overlay.appendChild(poly);
                return poly;
              }
            }
          }
        } catch (e) {}
      }

      try {
        var d = pathEl.getAttribute('d');
        if (!d) return null;

        var transforms = [];
        var node = pathEl.parentNode;
        while (node && node !== svgEl) {
          var t = node.getAttribute && node.getAttribute('transform');
          if (t) transforms.unshift(t);
          node = node.parentNode;
        }

        var ghostPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ghostPath.setAttribute('d', d);
        if (transforms.length) {
          ghostPath.setAttribute('transform', transforms.join(' '));
        }
        SvgEdgeHandler._styleGhost(ghostPath);
        overlay.appendChild(ghostPath);
        return ghostPath;
      } catch (e) {
        return null;
      }
    },

    _styleGhost: function (el) {
      el.setAttribute('stroke', '#000');
      el.setAttribute('stroke-opacity', '0.003');
      el.setAttribute('stroke-width', '12');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('fill', 'none');
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'stroke';
    },

    _bindEdgeEvents: function (hitEl, pathEl, edgeEl, idx, ctx) {
      hitEl.addEventListener('mouseenter', function () {
        edgeEl.classList.add('edge-hovered');
        hitEl.setAttribute('stroke-opacity', '0.08');
        hitEl.setAttribute('stroke', '#4f46e5');
      });

      hitEl.addEventListener('mouseleave', function () {
        var selectedEdgeIndex = ctx.getState().selectedEdgeIndex;
        if (selectedEdgeIndex !== idx) {
          edgeEl.classList.remove('edge-hovered');
        }
        hitEl.setAttribute('stroke', '#000');
        hitEl.setAttribute('stroke-opacity', '0.003');
      });

      hitEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
        var localX = Math.round(previewRect ? e.clientX - previewRect.left : e.clientX);
        var localY = Math.round(previewRect ? e.clientY - previewRect.top : e.clientY);
        ctx.setState({
          selectedEdgeIndex: idx,
          selectedNodeId: null,
          contextMenu: null,
          flowEdgeColorPicker: false,
          flowEdgeBodyPicker: false,
          flowEdgeHeadPicker: false,
          edgeToolbar: {
            x: localX,
            y: localY,
            edgeIndex: idx
          }
        });
        ctx.emit('edge-selected', idx);
      });
    },

    startInlineEdit: function (index, clientX, clientY, svgEl, positions, ctx) {
      var edge = ctx.getModel().edges[index];
      if (!edge) return;

      var x = clientX - 70;
      var y = clientY - 24;
      var previewRect = ctx.getPreviewRect ? ctx.getPreviewRect() : null;
      if (previewRect) {
        x = clientX - previewRect.left - 70;
        y = clientY - previewRect.top - 24;
      }

      ctx.setState({
        selectedEdgeIndex: index,
        selectedNodeId: null,
        edgeToolbar: null,
        editingEdgeIndex: index,
        editingEdgeText: edge.text || '',
        editingEdgeColor: edge.color || '#5c7ab0',
        edgeEditInputStyle: {
          position: 'absolute',
          left: x + 'px',
          top: y + 'px',
          zIndex: 1000,
          width: '160px'
        }
      });
      ctx.focusEdgeEditInput();
    }
  };

  global.SvgEdgeHandler = SvgEdgeHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/PortDragHandler.js ===== */
(function (global) {
  'use strict';

  var SIDES = ['top', 'right', 'bottom', 'left'];

  var PortDragHandler = {
    _overlay:   null,
    _dragLine:  null,

    // 매 렌더 후 SVG가 DOM에 붙은 뒤 한 번 호출
    initOverlay: function (svgEl) {
      // 포트는 엣지 보조 클릭선보다 항상 위에서 클릭돼야 하므로 전용 레이어를 둔다.
      var old = svgEl.querySelector('#conn-port-overlay');
      if (old) old.remove();

      var overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      overlay.setAttribute('id', 'conn-port-overlay');
      // 그룹 전체가 이벤트를 먹지 않고, 실제 포트 클릭 타깃만 이벤트를 받게 한다.
      overlay.style.pointerEvents = 'none';
      svgEl.appendChild(overlay);
      this._overlay = overlay;

      var dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      dragLine.setAttribute('class', 'drag-edge-line');
      dragLine.setAttribute('stroke', '#818cf8');
      dragLine.setAttribute('stroke-width', '2.5');
      dragLine.setAttribute('stroke-dasharray', '6,4');
      dragLine.style.display   = 'none';
      dragLine.style.pointerEvents = 'none';
      overlay.appendChild(dragLine);
      this._dragLine = dragLine;
    },

    // 노드 주변에 4방향 포트 표시
    showPorts: function (svgEl, nodeId, positions, ctx) {
      if (!this._overlay) return;
      // hover 중 다른 레이어가 추가돼도 포트가 항상 최상단에 오도록 재부착한다.
      this._bringOverlayToFront(svgEl);
      this.clearPorts();

      var self = this;

      for (var s = 0; s < SIDES.length; s++) {
        (function (side) {
          var pt = SvgPositionTracker.getPortPosition(positions, nodeId, side);

          var setHovered = function (hovered) {
            circle.classList.toggle('port-hovered', hovered);
            glow.classList.toggle('port-hovered', hovered);
          };

          var onPointerDown = function (e) {
            e.preventDefault();
            e.stopPropagation();
            self._startDrag(svgEl, nodeId, pt, positions, ctx);
          };

          var onPointerEnter = function () {
            setHovered(true);
            ctx.setState({ portDragging: ctx.getState().portDragging }); // hover 유지
          };

          var onPointerLeave = function () {
            setHovered(false);
          };

          // 보이는 포트 원은 작게 유지하고,
          // 실제 클릭은 더 큰 보이지 않는 hit 원이 담당한다.
          var hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          hit.setAttribute('class', 'conn-port-hit');
          hit.setAttribute('cx', pt.x);
          hit.setAttribute('cy', pt.y);
          hit.setAttribute('r', '11');
          hit.setAttribute('data-node-id', nodeId);
          hit.setAttribute('data-side', side);
          hit.style.cursor = 'crosshair';
          hit.style.pointerEvents = 'all';
          self._overlay.appendChild(hit);

          // glow 원
          var glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          glow.setAttribute('class', 'conn-port-glow');
          glow.setAttribute('cx', pt.x);
          glow.setAttribute('cy', pt.y);
          glow.setAttribute('r', '10');
          glow.style.pointerEvents = 'none';
          self._overlay.appendChild(glow);

          // 보이는 포트 원
          var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('class', 'conn-port');
          circle.setAttribute('cx', pt.x);
          circle.setAttribute('cy', pt.y);
          circle.setAttribute('r', '5');
          circle.setAttribute('data-node-id', nodeId);
          circle.setAttribute('data-side', side);
          circle.style.cursor = 'crosshair';
          circle.style.pointerEvents = 'none';
          self._overlay.appendChild(circle);

          hit.addEventListener('mousedown', onPointerDown);
          hit.addEventListener('mouseenter', onPointerEnter);
          hit.addEventListener('mouseleave', onPointerLeave);
        })(SIDES[s]);
      }
    },

    _startDrag: function (svgEl, fromNodeId, fromPt, positions, ctx) {
      var self = this;
      // 드래그 시작 직전에도 레이어를 맨 위로 올려 엣지 클릭 영역과 충돌하지 않게 한다.
      self._bringOverlayToFront(svgEl);
      ctx.setState({ portDragging: true });

      self._dragLine.setAttribute('x1', fromPt.x);
      self._dragLine.setAttribute('y1', fromPt.y);
      self._dragLine.setAttribute('x2', fromPt.x);
      self._dragLine.setAttribute('y2', fromPt.y);
      self._dragLine.style.display = '';

      var currentTarget = null;
      var pointerClientX = 0;
      var pointerClientY = 0;
      var autoPanFrame = null;

      var updateDragAtClient = function (clientX, clientY) {
        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, clientX, clientY);
        self._dragLine.setAttribute('x2', svgPt.x);
        self._dragLine.setAttribute('y2', svgPt.y);

        var hit = self._findHitNode(svgPt.x, svgPt.y, fromNodeId, positions);
        if (hit !== currentTarget) {
          if (currentTarget) self._clearTargetHighlight(svgEl, currentTarget);
          currentTarget = hit;
          if (hit) self._highlightTarget(svgEl, hit);
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

      var startScreenPt = SvgPositionTracker.svgToScreen(svgEl, fromPt.x, fromPt.y);
      pointerClientX = startScreenPt.x;
      pointerClientY = startScreenPt.y;

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
        if (currentTarget) self._clearTargetHighlight(svgEl, currentTarget);
        ctx.setState({ portDragging: false });

        var svgPt = SvgPositionTracker.getSVGPoint(svgEl, me.clientX, me.clientY);
        // onUp 시에는 excludeId=null 로 source 노드도 포함해 self-loop를 허용한다.
        var target = self._findHitNode(svgPt.x, svgPt.y, null, positions);
        if (target) {
          ctx.emit('add-edge', { from: fromNodeId, to: target });
        }

        // 여전히 hover 중이면 원래 노드 포트를 다시 표시
        setTimeout(function () {
          if (ctx.getState().hoveredNodeId === fromNodeId) {
            self.showPorts(svgEl, fromNodeId, positions, ctx);
          }
        }, 50);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },

    // 포트 드래그 중에는 target node를 약간 관대하게 판정한다.
    // 정확히 bbox 안이 아니어도 center 근처면 snap 대상으로 본다.
    // excludeId가 null이면 모든 노드를 검색 대상으로 포함한다 (self-loop 판정 시 사용).
    _findHitNode: function (x, y, excludeId, positions) {
      var SNAP = 28;
      var best = null;
      var bestDist = Infinity;

      for (var nodeId in positions) {
        if (excludeId !== null && nodeId === excludeId) continue;
        var p = positions[nodeId];

        // bbox 안이면 즉시 target으로 인정
        if (x >= p.origTx + p.bboxX - 4 &&
            x <= p.origTx + p.bboxX + p.width  + 4 &&
            y >= p.origTy + p.bboxY - 4 &&
            y <= p.origTy + p.bboxY + p.height + 4) {
          return nodeId;
        }

        // 중심 근처면 snap 후보로 인정
        var d = Math.sqrt((x - p.cx) * (x - p.cx) + (y - p.cy) * (y - p.cy));
        if (d < SNAP && d < bestDist) {
          bestDist = d;
          best = nodeId;
        }
      }

      return best;
    },

    _highlightTarget: function (svgEl, nodeId) {
      // Mermaid 11의 prefix 포함 id도 처리하는 extractNodeId를 사용한다.
      var all = svgEl.querySelectorAll('.node');
      for (var j = 0; j < all.length; j++) {
        if (SvgPositionTracker.extractNodeId(all[j]) === nodeId) {
          all[j].classList.add('port-drag-target');
          return;
        }
      }
    },

    _clearTargetHighlight: function (svgEl, nodeId) {
      var targets = svgEl.querySelectorAll('.port-drag-target');
      for (var i = 0; i < targets.length; i++) {
        targets[i].classList.remove('port-drag-target');
      }
    },

    clearPorts: function () {
      if (!this._overlay) return;
      var ports = this._overlay.querySelectorAll('.conn-port, .conn-port-glow, .conn-port-hit');
      for (var i = 0; i < ports.length; i++) ports[i].remove();
    },

    _bringOverlayToFront: function (svgEl) {
      // appendChild를 다시 호출하면 SVG 내에서 가장 마지막 형제로 이동하므로
      // 레이어상 최상단으로 올릴 수 있다.
      if (this._overlay && this._overlay.parentNode === svgEl) {
        svgEl.appendChild(this._overlay);
      }
    }
  };

  global.PortDragHandler = PortDragHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/actions/SequencePositionTracker.js ===== */
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


/* ===== src/actions/SequenceMessageDragHandler.js ===== */
(function (global) {
  'use strict';

  var HANDLE_OFFSET_Y = 8;

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
      var y = slot.y + HANDLE_OFFSET_Y;
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
      plus.setAttribute('y', y + 1.5);
      plus.setAttribute('text-anchor', 'middle');
      plus.setAttribute('dominant-baseline', 'middle');
      plus.setAttribute('fill', '#fff');
      plus.setAttribute('font-size', '20');
      plus.setAttribute('font-weight', '700');
      plus.style.pointerEvents = 'none';
      plus.textContent = '+';
      this._overlay.appendChild(plus);

      hit.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var startX = e.clientX, startY = e.clientY;
        var didDrag = false;

        var onMove = function (me) {
          var dx = me.clientX - startX, dy = me.clientY - startY;
          if (!didDrag && (dx * dx + dy * dy) > 25) {
            didDrag = true;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            self._startDrag(svgEl, participant.id, x, y, slot.insertIndex, participantMap, ctx);
          }
        };

        var onUp = function () {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (!didDrag) {
            var screen = SvgPositionTracker.svgToScreen(svgEl, x, y);
            ctx.setState({
              selectedSequenceParticipantId: null,
              selectedSequenceMessageIndex: null,
              selectedSequenceMessageIndices: [],
              selectedSequenceBlockId: null,
              sequenceToolbar: {
                type: 'insert',
                participantId: participant.id,
                insertIndex: slot.insertIndex,
                x: screen ? screen.x : e.clientX,
                y: screen ? screen.y : e.clientY
              }
            });
          }
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // mouseup 후 발생하는 click 이 document._clickCloseHandler 까지 버블링해서
      // sequenceToolbar 를 즉시 null 로 만드는 문제를 막는다
      hit.addEventListener('click', function (e) {
        e.stopPropagation();
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


/* ===== src/actions/SequenceBlockHandler.js ===== */
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
      var labelTextEls = this._sortTextElementsByPosition(Array.prototype.slice.call(svgEl.querySelectorAll('.labelText')));
      var allLoopTextEls = this._sortTextElementsByPosition(Array.prototype.slice.call(svgEl.querySelectorAll('.loopText')));
      var usedLoopIndices = {};
      var stmts = model && model.statements;
      var blockBindings = [];

      // 1차: 모든 block의 메인 title(loop/alt/opt/par text)을 먼저 예약한다.
      // nested loop title이 outer alt의 branch title로 잘못 소비되지 않도록 한다.
      for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        var labelEl = labelTextEls[i] || null;
        var mainTitleEl = this._findMatchingLoopText(labelEl, allLoopTextEls, usedLoopIndices);
        blockBindings.push({
          block: block,
          labelEl: labelEl,
          mainTitleEl: mainTitleEl
        });
      }

      // 2차: 메인 title을 제외한 나머지 loopText만 branch title에 순서대로 연결한다.
      for (var j = 0; j < blockBindings.length; j++) {
        var binding = blockBindings[j];
        var boundBlock = binding.block;
        var branchTitleEls = [];
        var branchStatements = [];
        for (var b = 0; b < boundBlock.branchIndices.length; b++) {
          branchTitleEls.push(this._findNextUnusedLoopText(allLoopTextEls, usedLoopIndices));
          var si = boundBlock.branchIndices[b];
          branchStatements.push(stmts && stmts[si] ? stmts[si] : {});
        }

        this._attachBlockElementInteractions(
          svgEl,
          boundBlock,
          binding.labelEl,
          binding.mainTitleEl,
          branchTitleEls,
          branchStatements,
          ctx
        );
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

    _sortTextElementsByPosition: function (elements) {
      return (elements || []).slice().sort(function (a, b) {
        var boxA = null;
        var boxB = null;

        try { boxA = a && a.getBBox ? a.getBBox() : null; } catch (e1) {}
        try { boxB = b && b.getBBox ? b.getBBox() : null; } catch (e2) {}

        if (!boxA && !boxB) return 0;
        if (!boxA) return 1;
        if (!boxB) return -1;

        var dy = boxA.y - boxB.y;
        if (Math.abs(dy) > 1) return dy;

        return boxA.x - boxB.x;
      });
    },

    _findMatchingLoopText: function (labelEl, allLoopTextEls, usedLoopIndices) {
      if (!labelEl || !labelEl.getBBox) return this._findNextUnusedLoopText(allLoopTextEls, usedLoopIndices);

      var labelBox;
      try {
        labelBox = labelEl.getBBox();
      } catch (e) {
        return this._findNextUnusedLoopText(allLoopTextEls, usedLoopIndices);
      }

      var bestEl = null;
      var bestIdx = -1;
      var bestDist = Infinity;

      for (var i = 0; i < allLoopTextEls.length; i++) {
        if (usedLoopIndices[i]) continue;
        var loopEl = allLoopTextEls[i];
        if (!loopEl || !loopEl.getBBox) continue;

        var loopBox;
        try {
          loopBox = loopEl.getBBox();
        } catch (e2) {
          continue;
        }

        var dist = Math.abs(loopBox.y - labelBox.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestEl = loopEl;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) usedLoopIndices[bestIdx] = true;
      return bestEl;
    },

    _findNextUnusedLoopText: function (allLoopTextEls, usedLoopIndices) {
      for (var i = 0; i < allLoopTextEls.length; i++) {
        if (usedLoopIndices[i]) continue;
        usedLoopIndices[i] = true;
        return allLoopTextEls[i];
      }
      return null;
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


/* ===== src/actions/SequenceSvgHandler.js ===== */
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
      participantMap = SequencePositionTracker.refineParticipantLifelines(participantMap, messages);
      var insertSlots = SequencePositionTracker.collectInsertSlots(participantMap, messages);

      SequenceMessageDragHandler.initOverlay(svgEl);
      SequenceMessageDragHandler.attach(svgEl, participantMap, insertSlots, ctx);
      SequenceSvgHandler._attachParticipants(participantTargets, svgEl, ctx);
      SequenceSvgHandler._attachMessages(messages, svgEl, ctx);
      SequenceSvgHandler._attachNotes(svgEl, model, ctx);
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

    _attachNotes: function (svgEl, model, ctx) {
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
        })(noteGroups[j], noteStatements[j]);
      }
    },

    // solid(단일 dash) ↔ dotted(이중 dash) 토글
    toggleMessageLineType: function (message) {
      return SequenceMessageCodec.toggleLineStyle(message.operator || SequenceMessageCodec.DEFAULT_OPERATOR);
    }
  };

  global.SequenceSvgHandler = SequenceSvgHandler;

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/mixins/flowchartActionsMixin.js ===== */
/**
 * flowchartActionsMixin
 * Container component가 flowchartModelEditing을 사용할 수 있도록 감싼 얇은 wrapper.
 *
 * 호출부 요구사항:
 *   - data: model (type, nodes, edges, direction)
 *   - data: nodeIdAllocator (IdAllocator 인스턴스)
 *   - data: script
 *   - methods: _snapshot, updateScriptFromModel, _schedulePreviewFit
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, flowchart 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.flowchartActionsMixin = {
    methods: {
      _applyFlowchartEdit: function (nextModel, options) {
        if (!nextModel || nextModel === this.model) return false;
        this._snapshot();
        this.model = nextModel;
        this.updateScriptFromModel();
        if (options && options.fitPreview) this._schedulePreviewFit();
        return true;
      },

      addNode: function (shape) {
        if (!this.isFlowchart) return;

        var nodeShape = shape;
        var nodeText = 'Node';
        var nodeFill = '';

        if (shape && typeof shape === 'object') {
          nodeShape = shape.shape;
          nodeText = shape.text || nodeText;
          nodeFill = shape.fill || '';
        }

        if (!nodeShape) nodeShape = 'rect';

        var newNodeId = this.nodeIdAllocator.next(this.script, this.model.nodes);
        var applied = this._applyFlowchartEdit(
          flowchartModelEditing.addNode(this.model, {
            id: newNodeId,
            text: nodeText,
            shape: nodeShape,
            fill: nodeFill
          }),
          { fitPreview: true }
        );
        if (applied) this._notifyNewNode(newNodeId);
      },

      addEdge: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.addEdge(this.model, data));
      },

      updateNodeText: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeText(this.model, data));
      },

      updateNodeShape: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeShape(this.model, data));
      },

      updateNodeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeStyle(this.model, data));
      },

      updateNodeFill: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateNodeFill(this.model, data));
      },

      updateEdgeText: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeText(this.model, data));
      },

      updateEdgeType: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeType(this.model, data));
      },

      updateEdgeStyle: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeStyle(this.model, data));
      },

      updateEdgeColor: function (data) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(flowchartModelEditing.updateEdgeColor(this.model, data));
      },

      changeDirection: function (dir) {
        if (!this.isFlowchart) return;
        this._applyFlowchartEdit(
          flowchartModelEditing.changeDirection(this.model, dir),
          { fitPreview: true }
        );
      },

      // deleteSelected dispatcher가 flowchart 분기를 여기로 위임. _snapshot은 dispatcher 쪽에 이미 찍혔음.
      _deleteFlowchartSelection: function (data) {
        var nextModel = flowchartModelEditing.deleteSelection(this.model, data);
        if (!nextModel || nextModel === this.model) return false;
        this.model = nextModel;
        return true;
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/mixins/sequenceActionsMixin.js ===== */
/**
 * sequenceActionsMixin
 * Container component가 sequenceModelEditing을 사용할 수 있도록 감싼 얇은 wrapper.
 * flowchartActionsMixin과 세트로 사용한다.
 *
 * 호출부 요구사항:
 *   - data: model (type, participants, messages, autonumber)
 *   - data: participantIdAllocator (IdAllocator 인스턴스)
 *   - data: script
 *   - methods: _snapshot, updateScriptFromModel
 *   - computed: isFlowchart
 *
 * deleteSelected dispatcher는 컴포넌트에 남고, sequence 삭제 분기만 여기서 처리.
 */
(function (global) {
  'use strict';

  global.sequenceActionsMixin = {
    methods: {
      _applySequenceEdit: function (nextModel) {
        if (!nextModel || nextModel === this.model) return false;
        this._snapshot();
        this.model = nextModel;
        this.updateScriptFromModel();
        return true;
      },

      addSequenceParticipant: function () {
        if (this.isFlowchart) return;
        var newId = this.participantIdAllocator.next(this.script, this.model.participants);
        var applied = this._applySequenceEdit(sequenceModelEditing.addParticipant(this.model, {
          id: newId,
          label: 'Participant ' + this.participantIdAllocator.counter,
          kind: 'participant'
        }));
        if (applied) this._notifyNewParticipant(newId);
      },

      addSequenceActor: function () {
        if (this.isFlowchart) return;
        var newId = this.participantIdAllocator.next(this.script, this.model.participants);
        var applied = this._applySequenceEdit(sequenceModelEditing.addParticipant(this.model, {
          id: newId,
          label: 'Actor ' + this.participantIdAllocator.counter,
          kind: 'actor'
        }));
        if (applied) this._notifyNewParticipant(newId);
      },

      toggleParticipantKind: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleParticipantKind(this.model, data));
      },

      moveSequenceParticipant: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.moveParticipant(this.model, data));
      },

      addSequenceMessage: function (payload) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.addMessage(this.model, payload));
      },

      updateSequenceParticipantText: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.updateParticipantText(this.model, data));
      },

      updateSequenceMessageText: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.updateMessageText(this.model, data));
      },

      reverseSequenceMessage: function (index) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.reverseMessage(this.model, index));
      },

      toggleAutonumber: function () {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleAutonumber(this.model));
      },

      toggleSequenceMessageLineType: function (index) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.toggleMessageLineType(this.model, index));
      },

      setSequenceMessageLineType: function (data) {
        if (this.isFlowchart) return;
        this._applySequenceEdit(sequenceModelEditing.setMessageLineType(this.model, data));
      },

      addSequenceBranch: function (data) {
        if (this.isFlowchart || !data || !data.keyword || !data.messageIndices || !data.messageIndices.length) return;
        this._applySequenceEdit(sequenceModelEditing.addBranch(this.model, data));
      },

      wrapSequenceMessagesInBlock: function (data) {
        if (this.isFlowchart || !data || !data.kind) return;
        this._applySequenceEdit(sequenceModelEditing.wrapMessagesInBlock(this.model, data));
      },

      updateSequenceBlockText: function (data) {
        if (this.isFlowchart || !data || !data.blockId) return;
        this._applySequenceEdit(sequenceModelEditing.updateBlockText(this.model, data));
      },

      updateSequenceBranchText: function (data) {
        if (this.isFlowchart || !data || data.statementIndex === null || data.statementIndex === undefined) return;
        this._applySequenceEdit(sequenceModelEditing.updateBranchText(this.model, data));
      },

      changeSequenceBlockType: function (data) {
        if (this.isFlowchart || !data || !data.blockId || !data.kind) return;
        this._applySequenceEdit(sequenceModelEditing.changeBlockType(this.model, data));
      },

      addSequenceNote: function (data) {
        if (this.isFlowchart || !data || !data.participantId) return;
        this._applySequenceEdit(sequenceModelEditing.addNote(this.model, data));
      },

      updateSequenceNoteText: function (data) {
        if (this.isFlowchart || !data || data.statementIndex === null || data.statementIndex === undefined) return;
        this._applySequenceEdit(sequenceModelEditing.updateNoteText(this.model, data));
      },

      // deleteSelected dispatcher가 sequence 분기를 여기로 위임.
      _deleteSequenceSelection: function (data) {
        var nextModel = sequenceModelEditing.deleteSelection(this.model, data);
        if (!nextModel || nextModel === this.model) return false;
        this.model = nextModel;
        this.updateScriptFromModel();
        return true;
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/mixins/exportMixin.js ===== */
/**
 * exportMixin
 * LiveEditor와 FullEditor가 공유하는 export/copy 래퍼.
 * SvgExport 서비스(이미 분리돼 있음)를 감싸고, 토스트 메시지를 연결한다.
 *
 * 호출부 요구사항:
 *   - ref: preview (mermaid-preview 컴포넌트)
 *   - methods: showToast (toastMixin에서 제공)
 */
(function (global) {
  'use strict';

  global.exportMixin = {
    methods: {
      _runExport: function (promise, successMsg) {
        var self = this;
        return promise
          .then(function () {
            self.showToast(successMsg, 'success');
          })
          .catch(function () {
            self.showToast('Export failed', 'error');
          });
      },

      getSvgElement: function () {
        var preview = this.$refs.preview;
        if (!preview) return null;
        // canvas ref는 v-if="svgContent" 조건이라 렌더 완료 전엔 DOM에 없을 수 있음
        var canvas = preview.$refs && preview.$refs.canvas;
        if (canvas) return canvas.querySelector('svg');
        // fallback: svgContent 문자열에서 파싱 (외부에서 getSvgElement를 직접 호출한 경우)
        if (preview.svgContent) {
          var tmp = document.createElement('div');
          tmp.innerHTML = preview.svgContent;
          return tmp.querySelector('svg');
        }
        return null;
      },

      getSvgText: function () {
        var preview = this.$refs.preview;
        if (preview && preview.svgContent) {
          return preview.svgContent;
        }
        var svgEl = this.getSvgElement();
        if (svgEl) {
          return new XMLSerializer().serializeToString(svgEl);
        }
        return '';
      },

      exportSvg: function () {
        var svgStr = this.getSvgText();
        if (!svgStr) return;
        return this._runExport(
          SvgExport.exportSvg(svgStr, { filename: 'diagram.svg' }),
          'SVG exported!'
        );
      },

      exportPng: function () {
        var svgStr = this.getSvgText();
        if (!svgStr) return;
        return this._runExport(
          SvgExport.exportPng(svgStr, { filename: 'diagram.png', scale: 2, padding: 20 }),
          'PNG exported!'
        );
      },

      exportJpg: function () {
        var svgStr = this.getSvgText();
        if (!svgStr) return;
        return this._runExport(
          SvgExport.exportJpg(svgStr, { filename: 'diagram.jpg', scale: 2, padding: 20, quality: 0.92 }),
          'JPG exported!'
        );
      },

      copySvg: function () {
        var svgStr = this.getSvgText();
        if (!svgStr) return;
        var self = this;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(svgStr).then(function () {
            self.showToast('SVG copied to clipboard!', 'success');
          }).catch(function () {
            self._fallbackCopy(svgStr);
          });
        } else {
          this._fallbackCopy(svgStr);
        }
      },

      _fallbackCopy: function (text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          this.showToast('SVG copied!', 'success');
        } catch (e) {
          this.showToast('Copy failed — try Ctrl+C', 'error');
        }
        document.body.removeChild(ta);
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/mixins/toastMixin.js ===== */
/**
 * toastMixin
 * 화면 하단에 나타났다 사라지는 토스트 메시지.
 * LiveEditor와 FullEditor가 공유한다.
 */
(function (global) {
  'use strict';

  global.toastMixin = {
    data: function () {
      return {
        toastMsg: '',
        toastVisible: false,
        _toastTimer: null
      };
    },

    methods: {
      showToast: function (msg, type) {
        var self = this;
        this.toastMsg     = msg;
        this.toastVisible = true;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () {
          self.toastVisible = false;
        }, 2800);
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);


/* ===== src/components/MermaidEditor.js ===== */
/**
 * MermaidEditor component
 * Handles the raw Mermaid script textarea for the left editor pane.
 */

Vue.component('mermaid-editor', {
  props: {
    value: { type: String, default: '' },
    error: { type: String, default: '' },
    warning: { type: String, default: '' },
    highlightTargets: { type: Array, default: function () { return []; } },
    diagramType: { type: String, default: 'flowchart' }
  },
  data: function () {
    return {
      localValue: this.value,
      debounceTimer: null,
      scrollTop: 0,
      scrollLeft: 0
    };
  },
  watch: {
    value: function (newVal) {
      if (newVal !== this.localValue) {
        this.localValue = newVal;
      }
    }
  },
  computed: {
    hasHighlights: function () {
      return !!(this.highlightTargets && this.highlightTargets.length);
    },
    highlightedLineMap: function () {
      return ParserHighlight.buildHighlightLineMap(this.localValue, this.highlightTargets);
    },
    highlightTransformStyle: function () {
      return {
        transform: 'translate(' + (-this.scrollLeft) + 'px, ' + (-this.scrollTop) + 'px)'
      };
    },
    highlightHtml: function () {
      var lines = String(this.localValue || '').split('\n');
      if (!lines.length) lines = [''];
      var html = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var escaped = this._escapeHtml(line || ' ');
        var cls = this.highlightedLineMap[i + 1]
          ? 'code-editor__highlight-line code-editor__highlight-line--active'
          : 'code-editor__highlight-line';
        html.push('<span class="' + cls + '">' + escaped + '</span>');
      }
      return html.join('');
    },
    placeholderText: function () {
      if (this.diagramType === 'sequenceDiagram') {
        return 'sequenceDiagram\n    Alice->>+John: Hello John, how are you?\n    John-->>-Alice: Hi Alice, I can hear you!';
      }
      return 'flowchart TD\n    A[Start] --> B[Process]\n    B --> C[End]';
    }
  },
  methods: {
    onInput: function (e) {
      this.localValue = e.target.value;
      var self = this;
      if (this.diagramType === 'sequenceDiagram') {
        clearTimeout(this.debounceTimer);
        this.$emit('input', this.localValue);
        return;
      }
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(function () {
        self.$emit('input', self.localValue);
      }, 300);
    },
    onKeyDown: function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        var textarea = e.target;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var value = textarea.value;
        textarea.value = value.substring(0, start) + '    ' + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        this.localValue = textarea.value;
        this.$emit('input', this.localValue);
      }
    },
    onScroll: function (e) {
      this.scrollTop = e.target.scrollTop || 0;
      this.scrollLeft = e.target.scrollLeft || 0;
    },
    _escapeHtml: function (text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  },
  template: '\
    <div class="panel panel--editor">\
      <div class="code-editor">\
        <div class="code-editor__stack">\
          <div v-if="hasHighlights" class="code-editor__highlight-layer" aria-hidden="true">\
            <pre class="code-editor__highlight-content" :style="highlightTransformStyle" v-html="highlightHtml"></pre>\
          </div>\
        <textarea\
          ref="textarea"\
          class="code-editor__textarea"\
          :value="localValue"\
          @input="onInput"\
          @keydown="onKeyDown"\
          @scroll="onScroll"\
          :placeholder="placeholderText"\
          spellcheck="false"\
        ></textarea>\
        </div>\
        <div v-if="error" class="code-editor__error">\
          <span>!</span><span>{{ error }}</span>\
        </div>\
        <div v-if="warning" class="code-editor__warning">\
          <span>!</span><span>{{ warning }}</span>\
        </div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidToolbar.js ===== */
/**
 * MermaidToolbar component
 * Keeps the viewport controls separated from edit actions.
 */

Vue.component('mermaid-toolbar', {
  SHAPES: SvgNodeHandler.SHAPES,
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'violet', value: '#a855f7' }
  ],
  props: {
    diagramType: { type: String, default: 'flowchart' },
    direction: { type: String, default: 'TD' },
    canUndo: { type: Boolean, default: false },
    canRedo: { type: Boolean, default: false },
    autonumber: { type: Boolean, default: false },
    fullScreen: { type: Boolean, default: false }
  },
  data: function () {
    return {
      showShapePicker: false,
      pendingNodeText: 'Node',
      pendingNodeColor: '',
      showExportMenu: false
    };
  },
  computed: {
    isFlowchart: function () {
      return this.diagramType !== 'sequenceDiagram';
    }
  },
  methods: {
    toggleShapePicker: function () {
      this.showShapePicker = !this.showShapePicker;
      if (this.showShapePicker) this.showExportMenu = false;
      if (this.showShapePicker) {
        this.pendingNodeText = 'Node';
        this.pendingNodeColor = '';
      }
    },
    toggleExportMenu: function () {
      this.showExportMenu = !this.showExportMenu;
      if (this.showExportMenu) this.showShapePicker = false;
    },
    addNode: function (shape) {
      this.showShapePicker = false;
      this.$emit('add-node', {
        shape: shape,
        text: (this.pendingNodeText || '').trim() || 'Node',
        fill: this.pendingNodeColor || ''
      });
    },
    addSequenceParticipant: function () { this.$emit('add-sequence-participant'); },
    addSequenceActor: function () { this.$emit('add-sequence-actor'); },
    addSequenceMessage: function () { this.$emit('add-sequence-message'); },
    toggleAutonumber: function () { this.$emit('toggle-autonumber'); },
    undo: function () { this.$emit('undo'); },
    redo: function () { this.$emit('redo'); },
    changeDirection: function (e) { this.$emit('change-direction', e.target.value); },
    zoomOut: function () { this.$emit('zoom-out'); },
    zoomIn: function () { this.$emit('zoom-in'); },
    fitView: function () { this.$emit('fit-view'); },
    toggleFullscreen: function () { this.$emit('toggle-fullscreen'); },
    copySvg: function () { this.$emit('copy-svg'); },
    exportAs: function (format) {
      this.showExportMenu = false;
      this.$emit('export-' + format);
    },
    _handleDocumentClick: function (e) {
      if (!this.showShapePicker && !this.showExportMenu) return;
      if (this.$el && this.$el.contains(e.target)) return;
      this.showShapePicker = false;
      this.showExportMenu = false;
    }
  },
  mounted: function () {
    document.addEventListener('mousedown', this._handleDocumentClick, true);
  },
  beforeDestroy: function () {
    document.removeEventListener('mousedown', this._handleDocumentClick, true);
  },
  template: '\
    <div class="toolbar">\
      <div class="toolbar__sub">\
        <div class="toolbar__group">\
          <div v-if="isFlowchart" class="toolbar__add-node-wrap">\
            <button class="toolbar__btn toolbar__btn--active" @click="toggleShapePicker" title="Add Node">\
              <span class="toolbar__btn-icon">+</span> Add Node\
            </button>\
            <div v-if="showShapePicker" class="toolbar__shape-picker" @click.stop>\
              <div class="toolbar__shape-picker-title">Select Shape</div>\
              <input\
                class="toolbar__shape-input"\
                v-model="pendingNodeText"\
                type="text"\
                maxlength="100"\
                placeholder="Node name"\
                @keydown.enter.prevent="addNode(\'rect\')"\
              />\
              <div class="toolbar__shape-picker-title toolbar__shape-picker-title--compact">Color</div>\
              <div class="context-menu__color-row toolbar__shape-color-row">\
                <button\
                  class="context-menu__color-btn context-menu__color-btn--clear"\
                  :class="{ \'context-menu__color-btn--selected\': !pendingNodeColor }"\
                  title="default"\
                  @click="pendingNodeColor = \'\'"\
                >x</button>\
                <button\
                  v-for="color in $options.COLOR_PALETTE"\
                  :key="color.key"\
                  class="context-menu__color-btn"\
                  :class="{ \'context-menu__color-btn--selected\': pendingNodeColor === color.value }"\
                  :style="{ backgroundColor: color.value }"\
                  :title="color.key"\
                  @click="pendingNodeColor = color.value"\
                ></button>\
              </div>\
              <div class="toolbar__shape-picker-grid">\
                <button\
                  v-for="s in $options.SHAPES"\
                  :key="s.key"\
                  class="toolbar__shape-picker-btn"\
                  :title="s.name"\
                  @click="addNode(s.key)"\
                >\
                  <span class="context-menu__shape-icon" :class="\'context-menu__shape-icon--\' + s.key"></span>\
                  <span class="context-menu__shape-text">{{ s.name }}</span>\
                </button>\
              </div>\
            </div>\
          </div>\
          <button v-else class="toolbar__btn toolbar__btn--active" @click="addSequenceParticipant" title="Add participant">\
            <span class="toolbar__btn-icon">+</span> Participant\
          </button>\
          <button v-if="!isFlowchart" class="toolbar__btn" :class="{ \'toolbar__btn--active\': autonumber }" @click="toggleAutonumber" title="Toggle autonumber">\
            AutoNumber\
          </button>\
        </div>\
        <div class="toolbar__group">\
          <button class="toolbar__btn" @click="undo" :disabled="!canUndo" title="Undo (Ctrl+Z)">Undo</button>\
          <button class="toolbar__btn" @click="redo" :disabled="!canRedo" title="Redo (Ctrl+Y)">Redo</button>\
        </div>\
        <div v-if="isFlowchart" class="toolbar__group">\
          <select class="toolbar__select" :value="direction" @change="changeDirection" title="Layout direction">\
            <option value="TD">Top Down</option>\
            <option value="LR">Left Right</option>\
            <option value="BT">Bottom Top</option>\
            <option value="RL">Right Left</option>\
          </select>\
        </div>\
        <div class="toolbar__group toolbar__group--zoom">\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="zoomIn" title="Zoom In" aria-label="Zoom In">\
            <svg class="toolbar__icon-svg" viewBox="0 0 24 24" aria-hidden="true">\
              <circle cx="10" cy="10" r="6.5"></circle>\
              <line x1="14.8" y1="14.8" x2="20" y2="20"></line>\
              <line x1="7" y1="10" x2="13" y2="10"></line>\
              <line x1="10" y1="7" x2="10" y2="13"></line>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="zoomOut" title="Zoom Out" aria-label="Zoom Out">\
            <svg class="toolbar__icon-svg" viewBox="0 0 24 24" aria-hidden="true">\
              <circle cx="10" cy="10" r="6.5"></circle>\
              <line x1="14.8" y1="14.8" x2="20" y2="20"></line>\
              <line x1="7" y1="10" x2="13" y2="10"></line>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating toolbar__icon-btn--fitview" @click="fitView" title="Fit to View" aria-label="Fit to View">\
            <svg class="toolbar__icon-img toolbar__icon-img--fitview" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-zoom-to-fit-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="6" y="6" width="20" height="20">\
                <rect x="6" y="6" width="20" height="20" fill="#D9D9D9"/>\
              </mask>\
              <g mask="url(#icon-zoom-to-fit-mask)">\
                <path d="M10.0625 23L9 21.9375L11.4375 19.5H10V18H14V22H12.5V20.5625L10.0625 23ZM21.9375 23L19.5 20.5625V22H18V18H22V19.5H20.5625L23 21.9375L21.9375 23ZM10 14V12.5H11.4375L9 10.0625L10.0625 9L12.5 11.4375V10H14V14H10ZM18 14V10H19.5V11.4375L21.9375 9L23 10.0625L20.5625 12.5H22V14H18Z" fill="#767676"/>\
              </g>\
            </svg>\
          </button>\
          <button class="toolbar__icon-btn toolbar__icon-btn--floating" @click="toggleFullscreen" :title="fullScreen ? \'Exit Fullscreen\' : \'Fullscreen\'" :aria-label="fullScreen ? \'Exit Fullscreen\' : \'Fullscreen\'">\
            <svg v-if="!fullScreen" class="toolbar__icon-img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-fullscreen-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">\
                <path fill="#D9D9D9" d="M0 0h24v24H0z"/>\
              </mask>\
              <g mask="url(#icon-fullscreen-mask)">\
                <path d="M14 17h5v-5h-2v3h-3v2zm-9-5h2V9h3V7H5v5zm-1 8c-.55 0-1.02-.196-1.413-.587A1.926 1.926 0 0 1 2 18V6c0-.55.196-1.02.587-1.412A1.926 1.926 0 0 1 4 4h16c.55 0 1.02.196 1.413.588.391.391.587.862.587 1.412v12c0 .55-.196 1.02-.587 1.413A1.926 1.926 0 0 1 20 20H4zm0-2h16V6H4v12z" fill="#969696"/>\
              </g>\
            </svg>\
            <svg v-else class="toolbar__icon-img" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\
              <mask id="icon-fullscreen-active-mask" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">\
                <path fill="#0081ea" d="M0 0h24v24H0z"/>\
              </mask>\
              <g mask="url(#icon-fullscreen-active-mask)">\
                <path d="M14 17h5v-5h-2v3h-3v2zm-9-5h2V9h3V7H5v5zm-1 8c-.55 0-1.02-.196-1.413-.587A1.926 1.926 0 0 1 2 18V6c0-.55.196-1.02.587-1.412A1.926 1.926 0 0 1 4 4h16c.55 0 1.02.196 1.413.588.391.391.587.862.587 1.412v12c0 .55-.196 1.02-.587 1.413A1.926 1.926 0 0 1 20 20H4zm0-2h16V6H4v12z" fill="#0081ea"/>\
              </g>\
            </svg>\
          </button>\
          <div class="toolbar__export-wrap">\
            <button class="toolbar__btn" @click="toggleExportMenu" title="Export diagram">Export</button>\
            <div v-if="showExportMenu" class="toolbar__export-menu" @click.stop>\
              <button class="toolbar__export-option" @click="exportAs(\'png\')">PNG</button>\
              <button class="toolbar__export-option" @click="exportAs(\'svg\')">SVG</button>\
              <button class="toolbar__export-option" @click="exportAs(\'jpg\')">JPG</button>\
            </div>\
          </div>\
        </div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidPreview.js ===== */
﻿/**
 * MermaidPreview 컴포넌트
 * - SvgPositionTracker : 좌표 수집
 * - PortDragHandler    : 4방향 포트 drag-to-connect
 * - SvgNodeHandler     : 노드 클릭 / 더블클릭 / 우클릭 / hover
 * - SvgEdgeHandler     : 엣지 클릭 / 라벨 / 편집
 */

var FlowEdgeCodec = window.FlowEdgeCodec;

Vue.component('mermaid-preview', {
  props: {
    model: {
      type: Object,
      default: function () {
        return { type: 'flowchart', direction: 'TD', nodes: [], edges: [] };
      }
    }
  },

  // 템플릿에서 사용하는 전체 shape 목록
  SHAPES: SvgNodeHandler.SHAPES,
  LINE_TYPE_OPTIONS: window.SequenceMessageCodec ? window.SequenceMessageCodec.LINE_TYPE_OPTIONS : [],
  COLOR_PALETTE: [
    { key: 'red',    value: '#ef4444' },
    { key: 'orange', value: '#f97316' },
    { key: 'yellow', value: '#facc15' },
    { key: 'green',  value: '#22c55e' },
    { key: 'blue',   value: '#3b82f6' },
    { key: 'indigo', value: '#4f46e5' },
    { key: 'violet', value: '#a855f7' }
  ],
  FLOW_EDGE_BODY_OPTIONS: FlowEdgeCodec ? FlowEdgeCodec.BODY_OPTIONS : [],
  FLOW_EDGE_HEAD_OPTIONS: FlowEdgeCodec ? FlowEdgeCodec.HEAD_OPTIONS : [],

  data: function () {
    return {
      svgContent:  '',
      renderError: '',
      renderCounter: 0,
      renderToken: 0,

      selectedNodeId:    null,
      selectedEdgeIndex: null,
      selectedSequenceParticipantId: null,
      selectedSequenceMessageIndex: null,
      selectedSequenceMessageIndices: [],
      selectedSequenceBlockId: null,
      selectedSequenceNoteStatementIndex: null,

      // 노드 인라인 편집
      editingNodeId:  null,
      editingText:    '',
      editingNodeColor: '#e2e8f0',
      editInputStyle: {},

      // 엣지 인라인 편집
      editingEdgeIndex:    null,
      editingEdgeText:     '',
      editingEdgeColor:    '#5c7ab0',
      edgeEditInputStyle:  {},

      // 시퀀스 인라인 편집
      editingSequenceParticipantId: null,
      editingSequenceParticipantText: '',
      sequenceParticipantEditStyle: {},
      editingSequenceMessageIndex: null,
      editingSequenceMessageText: '',
      sequenceMessageEditStyle: {},
      editingSequenceBlockId: null,
      editingSequenceBranchStatementIndex: null,
      editingSequenceBlockText: '',
      sequenceBlockEditStyle: {},
      editingSequenceNoteStatementIndex: null,
      editingSequenceNoteText: '',
      sequenceNoteEditStyle: {},

      // 컨텍스트 UI 상태
      contextMenu:  null,   // { nodeId, x, y }
      edgeToolbar:  null,   // { edgeIndex, x, y } - 플로우차트 엣지 액션 바
      flowEdgeColorPicker: false,
      flowEdgeBodyPicker: false,
      flowEdgeHeadPicker: false,
      sequenceToolbar: null, // { type, id|index, x, y }
      lineTypePicker: false,      // sequence message line type 선택 모드

      // 포트 드래그 상태
      portDragging:  false,
      hoveredNodeId: null,

      // 미지원 문법 힌트 오버레이
      unsupportedHint: false,
      _unsupportedHintTimer: null,

      // CSS transform 줌/패닝 상태
      cfgZoom: 1.0,
      panX: 0,
      panY: 0,

      // SVG 내부 좌표/뷰포트 상태
      _positions: {},
      _elements:  {},
      _edgePaths: [],
      _svgEl: null,
      _fitAfterRender: false,
      _panState: null,
      _panMouseUpHandler: null
    };
  },

  watch: {
    model: {
      handler: function () { this.renderDiagram(); },
      deep: true
    },
    selectedEdgeIndex: function () {
      this._syncSelectedEdgeVisuals();
    },
    sequenceToolbar: function (val) {
      if (!val) this.lineTypePicker = false;
    },
  },

  mounted: function () {
    this.renderDiagram();
    var self = this;

    this._windowResizeHandler = function () {
      if (!self._svgEl) return;
      if (self._resizeFrame) cancelAnimationFrame(self._resizeFrame);
      self._resizeFrame = requestAnimationFrame(function () {
        self.fitView();
      });
    };
    window.addEventListener('resize', this._windowResizeHandler);

    // 전역 클릭 시 컨텍스트 메뉴와 엣지 툴바 닫기
    this._clickCloseHandler = function () {
      var hadEdgeToolbar = !!self.edgeToolbar;
      self.contextMenu = null;
      self.edgeToolbar = null;
      self.flowEdgeColorPicker = false;
      self.flowEdgeBodyPicker = false;
      self.flowEdgeHeadPicker = false;
      self.sequenceToolbar = null;
      self.selectedSequenceMessageIndices = [];
      self.selectedSequenceBlockId = null;
      if (hadEdgeToolbar && self.editingEdgeIndex === null) {
        self.selectedEdgeIndex = null;
        self._clearEdgeVisualState();
      }
    };
    document.addEventListener('click', this._clickCloseHandler);

    this._pointerDownCommitHandler = function (e) {
      var target = e.target;
      if (target && target.closest && target.closest('.node-edit-overlay')) return;
      self._confirmActiveEdits();
    };
    document.addEventListener('mousedown', this._pointerDownCommitHandler, true);

    this._suppressClickAfterPanHandler = function (e) {
      if (!self._suppressClickAfterPan) return;
      self._suppressClickAfterPan = false;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('click', this._suppressClickAfterPanHandler, true);

    // 전역 키 입력: Delete, Escape, Ctrl+Z/Y
    this._keydownHandler = function (e) {
      // input / textarea 사용 중에는 전역 단축키를 막는다.
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (self.editingNodeId !== null || self.editingEdgeIndex !== null ||
            self.editingSequenceParticipantId !== null || self.editingSequenceMessageIndex !== null ||
            self.editingSequenceBlockId !== null || self.editingSequenceBranchStatementIndex !== null ||
            self.editingSequenceNoteStatementIndex !== null) return;
        if (self.selectedNodeId || self.selectedEdgeIndex !== null) {
          self.$emit('delete-selected', {
            nodeId:    self.selectedNodeId,
            edgeIndex: self.selectedEdgeIndex
          });
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
        } else if (self.selectedSequenceParticipantId || self.selectedSequenceMessageIndex !== null || self.selectedSequenceBlockId) {
          self.$emit('delete-selected', {
            sequenceParticipantId: self.selectedSequenceParticipantId,
            sequenceMessageIndex: self.selectedSequenceMessageIndex,
            sequenceBlockId: self.selectedSequenceBlockId
          });
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
          self.selectedSequenceMessageIndices = [];
          self.selectedSequenceBlockId = null;
        } else if (self.selectedSequenceNoteStatementIndex !== null) {
          self.$emit('delete-selected', { sequenceNoteStatementIndex: self.selectedSequenceNoteStatementIndex });
          self.selectedSequenceNoteStatementIndex = null;
        }
      }

      if (e.key === 'Escape') {
        self.cancelNodeEdit();
        self.cancelEdgeEdit();
        self.cancelSequenceParticipantEdit();
        self.cancelSequenceMessageEdit();
        self.cancelSequenceBlockEdit();
        self.cancelSequenceNoteEdit();
        self.selectedSequenceNoteStatementIndex = null;
        self.selectedNodeId    = null;
        self.selectedEdgeIndex = null;
        self.selectedSequenceParticipantId = null;
        self.selectedSequenceMessageIndex = null;
        self.selectedSequenceMessageIndices = [];
        self.selectedSequenceBlockId = null;
        self.contextMenu       = null;
        self.edgeToolbar       = null;
        self.flowEdgeColorPicker = false;
        self.flowEdgeBodyPicker = false;
        self.flowEdgeHeadPicker = false;
        self.sequenceToolbar   = null;
        self.portDragging      = false;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        self.$emit('undo');
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        self.$emit('redo');
      }
    };
    document.addEventListener('keydown', this._keydownHandler);
  },

  beforeDestroy: function () {
    if (this._clickCloseHandler) {
      document.removeEventListener('click', this._clickCloseHandler);
      this._clickCloseHandler = null;
    }
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._pointerDownCommitHandler) {
      document.removeEventListener('mousedown', this._pointerDownCommitHandler, true);
      this._pointerDownCommitHandler = null;
    }
    if (this._suppressClickAfterPanHandler) {
      document.removeEventListener('click', this._suppressClickAfterPanHandler, true);
      this._suppressClickAfterPanHandler = null;
    }
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._resizeFrame) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = null;
    }
    if (this._panMouseUpHandler) {
      document.removeEventListener('mouseup', this._panMouseUpHandler);
      this._panMouseUpHandler = null;
    }
  },

  methods: {

    _confirmActiveEdits: function () {
      if (this.editingNodeId) this.confirmNodeEdit();
      if (this.editingEdgeIndex !== null) this.confirmEdgeEdit();
      if (this.editingSequenceParticipantId) this.confirmSequenceParticipantEdit();
      if (this.editingSequenceMessageIndex !== null) this.confirmSequenceMessageEdit();
      if (this.editingSequenceBlockId !== null || this.editingSequenceBranchStatementIndex !== null) this.confirmSequenceBlockEdit();
      if (this.editingSequenceNoteStatementIndex !== null) this.confirmSequenceNoteEdit();
    },

    // 공통 렌더 유틸

    _hasRenderableContent: function (model) {
      if (!model) return false;
      if (model.type === 'sequenceDiagram') {
        return !!((model.participants && model.participants.length) || (model.messages && model.messages.length));
      }
      return !!((model.nodes && model.nodes.length) || (model.edges && model.edges.length));
    },

    _isScriptHeaderOnly: function (script) {
      var trimmed = (script || '').trim();
      return /^flowchart\s+(TD|TB|BT|LR|RL)\s*$/i.test(trimmed) ||
        /^sequenceDiagram\s*$/i.test(trimmed);
    },

    renderDiagram: function () {
      var m = this.model;
      if (!this._hasRenderableContent(m)) {
        this.svgContent  = '';
        this.renderError = '';
        return;
      }

      var script = MermaidGenerator.generate(m);
      if (!script || this._isScriptHeaderOnly(script)) {
        this.svgContent = '';
        this._svgEl = null;
        this.cfgZoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        return;
      }

      var self = this;
      self.renderCounter++;
      self.renderToken++;
      var renderToken = self.renderToken;
      var containerId = 'mermaid-render-' + self.renderCounter;
      self.renderError = '';
      self.svgContent = '';

      try {
        window.mermaid.render(containerId, script).then(function (result) {
          // 가장 최신 render 요청만 반영하고 이전 결과는 버린다.
          if (renderToken !== self.renderToken) return;
          self.svgContent  = result.svg;
          self.renderError = '';
          self.$emit('svg-rendered', result.svg);
          self.$nextTick(function () { self.postRenderSetup(); });
        }).catch(function (err) {
          if (renderToken !== self.renderToken) return;
          self.svgContent = '';
          self.renderError = err.message || 'Render error';
          var errEl = document.getElementById('d' + containerId);
          if (errEl) errEl.remove();
        });
      } catch (e) {
        if (renderToken !== self.renderToken) return;
        self.svgContent = '';
        self.renderError = e.message || 'Render error';
      }
    },

    // 공통 렌더 후 인터랙션 연결 유틸

    postRenderSetup: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var svgEl = canvas.querySelector('svg');
      if (!svgEl) return;

      var fitAfter = this._fitAfterRender;
      this._fitAfterRender = false;

      // overlay와 interaction이 같은 좌표계를 쓰도록 viewBox를 먼저 맞춘다.
      this._setupViewport(svgEl, canvas, fitAfter);

      // 노드 위치와 SVG 요소 수집
      var isFlowchart = this.model && this.model.type !== 'sequenceDiagram';

      if (isFlowchart) {
        var collected    = SvgPositionTracker.collectNodePositions(svgEl);
        this._positions  = collected.positions;
        this._elements   = collected.elements;
        this._edgePaths  = SvgPositionTracker.collectEdgePaths(svgEl, this.model.edges);

        // 하위 핸들러에 넘길 bridge 객체 구성
        var ctx = this._buildCtx(svgEl);

        // 엣지 ghost overlay를 먼저 구성
        SvgEdgeHandler.initGhostOverlay(svgEl);
        SvgEdgeHandler.attach(svgEl, this._edgePaths, this._positions, ctx);

        // 포트 overlay는 ghost보다 위에 올라온다.
        PortDragHandler.initOverlay(svgEl);

        // 노드 인터랙션 연결
        SvgNodeHandler.attach(svgEl, this._positions, this._elements, ctx);

        if (this._pendingContextMenuNodeId) {
          this._openContextMenuForNode(this._pendingContextMenuNodeId);
        }
      } else {
        this._positions = {};
        this._elements = {};
        this._edgePaths = [];
        var sequenceCtx = this._buildCtx(svgEl);
        SequenceSvgHandler.attach(svgEl, this.model, sequenceCtx);
        SequenceBlockHandler.initOverlay(svgEl);
        SequenceBlockHandler.attach(svgEl, this.model, sequenceCtx);

        if (this._pendingHighlightParticipantId) {
          var pendingPid = this._pendingHighlightParticipantId;
          this._pendingHighlightParticipantId = null;
          this._flashParticipant(svgEl, pendingPid);
        }
      }

      // 배경 클릭 시 선택 해제
      var self = this;
      svgEl.addEventListener('click', function (e) {
        if (e.target === svgEl ||
            (e.target.tagName && e.target.tagName.toLowerCase() === 'svg')) {
          self.selectedNodeId    = null;
          self.selectedEdgeIndex = null;
          self.selectedSequenceParticipantId = null;
          self.selectedSequenceMessageIndex = null;
          self.selectedSequenceMessageIndices = [];
          self.selectedSequenceBlockId = null;
        }
      });

      this._refreshFloatingUiPositions();
      this._syncSelectedEdgeVisuals();

      if (this._pendingHighlightNodeId) {
        var pendingId = this._pendingHighlightNodeId;
        this._pendingHighlightNodeId = null;
        this._flashNode(pendingId);
      }

    },

    scheduleFit: function () {
      this._fitAfterRender = true;
    },

    openContextMenuForNode: function (nodeId) {
      this._pendingContextMenuNodeId = nodeId;
      this._openContextMenuForNode(nodeId);
    },

    _openContextMenuForNode: function (nodeId) {
      var nodeEl = this._elements && this._elements[nodeId];
      if (!nodeEl) return;

      var rect = nodeEl.getBoundingClientRect();
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : this.$el.getBoundingClientRect();
      this.selectedNodeId = nodeId;
      this.selectedEdgeIndex = null;
      this.contextMenu = {
        nodeId: nodeId,
        anchorType: 'node',
        x: Math.round(rect.left - previewRect.left + rect.width / 2),
        y: Math.round(rect.top - previewRect.top + Math.max(18, rect.height * 0.35))
      };
      this._pendingContextMenuNodeId = null;
    },

    _refreshFloatingUiPositions: function () {
      var previewRect = this.$refs.canvas && this.$refs.canvas.getBoundingClientRect
        ? this.$refs.canvas.getBoundingClientRect()
        : (this.$el && this.$el.getBoundingClientRect ? this.$el.getBoundingClientRect() : null);
      if (this.contextMenu && this.contextMenu.anchorType === 'node') {
        var nodeEl = this._elements && this._elements[this.contextMenu.nodeId];
        if (nodeEl && previewRect) {
          var nodeRect = nodeEl.getBoundingClientRect();
          this.contextMenu = Object.assign({}, this.contextMenu, {
            x: Math.round(nodeRect.left - previewRect.left + nodeRect.width + 10),
            y: Math.round(nodeRect.top - previewRect.top + Math.min(24, nodeRect.height * 0.5))
          });
        }
      }

      if (this.edgeToolbar && this.edgeToolbar.anchorType === 'edge') {
        return;
      }
    },

    _syncSelectedEdgeVisuals: function () {
      var selectedIndex = this.selectedEdgeIndex;
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var isSelected = edgeData.index === selectedIndex;
        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.toggle('edge-selected', isSelected);
          edgeEl.classList.toggle('edge-hovered', isSelected);
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.toggle('edge-selected', isSelected);
          pathEl.classList.toggle('edge-hovered', isSelected);
          if (isSelected) {
            pathEl.style.setProperty('filter', 'drop-shadow(0 0 8px rgba(21, 101, 192, 0.28))', 'important');
          } else {
            pathEl.style.removeProperty('filter');
          }
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.toggle('edge-selected', isSelected);
          innerPaths[j].classList.toggle('edge-hovered', isSelected);
        }

        if (hitEl && hitEl.setAttribute) {
          if (hitEl.classList) {
            hitEl.classList.toggle('edge-hit-selected', isSelected);
          }
          hitEl.setAttribute('stroke', isSelected ? '#2563eb' : '#000');
          hitEl.setAttribute('stroke-opacity', isSelected ? '0.18' : '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },

    _clearEdgeVisualState: function () {
      var edgePaths = this._edgePaths || [];
      for (var i = 0; i < edgePaths.length; i++) {
        var edgeData = edgePaths[i];
        if (!edgeData) continue;

        var edgeEl = edgeData.el;
        var pathEl = edgeData.path;
        var hitEl = edgeData.hit;

        if (edgeEl && edgeEl.classList) {
          edgeEl.classList.remove('edge-selected');
          edgeEl.classList.remove('edge-hovered');
        }

        if (pathEl && pathEl.classList) {
          pathEl.classList.remove('edge-selected');
          pathEl.classList.remove('edge-hovered');
          pathEl.style.removeProperty('filter');
        }

        var innerPaths = edgeEl && edgeEl.querySelectorAll ? edgeEl.querySelectorAll('path') : [];
        for (var j = 0; j < innerPaths.length; j++) {
          innerPaths[j].classList.remove('edge-selected');
          innerPaths[j].classList.remove('edge-hovered');
          innerPaths[j].style.removeProperty('filter');
        }

        if (hitEl && hitEl.classList) {
          hitEl.classList.remove('edge-hit-selected');
        }
        if (hitEl && hitEl.setAttribute) {
          hitEl.setAttribute('stroke', '#000');
          hitEl.setAttribute('stroke-opacity', '0.003');
          hitEl.setAttribute('stroke-width', '12');
        }
      }
    },

    _applyTransform: function () {
      if (!this._svgEl) return;
      var snappedPanX = Math.round(this.panX);
      var snappedPanY = Math.round(this.panY);
      var snappedZoom = Math.round(this.cfgZoom * 1000) / 1000;
      // SVG width/height를 zoom에 맞게 조절해 벡터 품질을 유지한다.
      // CSS scale() 대신 이 방식을 쓰면 foreignObject 내부 텍스트도 선명하게 렌더된다.
      var intrinsicW = this._intrinsicWidth || 1;
      var intrinsicH = this._intrinsicHeight || 1;
      this._svgEl.style.width  = (intrinsicW * snappedZoom) + 'px';
      this._svgEl.style.height = (intrinsicH * snappedZoom) + 'px';
      this._svgEl.style.transformOrigin = '0 0';
      this._svgEl.style.transform = 'translate(' + snappedPanX + 'px, ' + snappedPanY + 'px)';
      var self = this;
      requestAnimationFrame(function () { self._refreshFloatingUiPositions(); });
    },

    _getContentBounds: function () {
      if (!this._svgEl) return null;

      // viewBox는 Mermaid가 SVG 생성 시 전체 다이어그램 크기로 정확히 설정한다.
      // getBBox()는 foreignObject 레이아웃 전에 호출되면 부분 bounds를 반환할 수 있어
      // fitView 계산이 틀려지므로 viewBox를 우선 사용한다.
      var vb = this._svgEl.viewBox && this._svgEl.viewBox.baseVal;
      if (vb && vb.width && vb.height) {
        return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
      }

      try {
        var box = this._svgEl.getBBox();
        if (box && box.width && box.height) {
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      } catch (e) {}

      return null;
    },

    _setupViewport: function (svgEl, canvas, forcefit) {
      var prevZoom = this.cfgZoom;
      var prevPanX = this.panX;
      var prevPanY = this.panY;
      var hadPrev  = !!this._svgEl;

      this._svgEl = svgEl;
      svgEl.style.overflow = 'visible';
      svgEl.style.display = 'block';
      svgEl.style.position = 'absolute';
      svgEl.style.top = '0';
      svgEl.style.left = '0';
      svgEl.style.maxWidth = 'none';
      svgEl.style.maxHeight = 'none';
      svgEl.style.backfaceVisibility = 'hidden';
      svgEl.style.webkitFontSmoothing = 'antialiased';
      svgEl.setAttribute('text-rendering', 'geometricPrecision');

      var vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      var bounds = this._getContentBounds();
      var intrinsicWidth = (vb && vb.width) || (bounds && bounds.width) || 1;
      var intrinsicHeight = (vb && vb.height) || (bounds && bounds.height) || 1;

      this._intrinsicWidth  = intrinsicWidth;
      this._intrinsicHeight = intrinsicHeight;

      svgEl.style.width = intrinsicWidth + 'px';
      svgEl.style.height = intrinsicHeight + 'px';

      var self = this;

      if (forcefit || !hadPrev) {
        // 브라우저 레이아웃 완료 후 fit 해야 canvas 크기를 정확히 읽을 수 있다.
        requestAnimationFrame(function () { self.fitView(); });
      } else {
        this.cfgZoom = prevZoom;
        this.panX    = prevPanX;
        this.panY    = prevPanY;
        this._applyTransform();
      }

      canvas.onwheel = function (e) {
        e.preventDefault();
        self._zoomAtClient(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
      };

      // 패닝은 배경에서만 시작해서 node/edge interaction과 충돌하지 않게 한다.
      canvas.onmousedown = function (e) {
        if (e.button !== 0) return;
        if (!self._canPreparePan(e.target, svgEl)) return;
        e.preventDefault();
        self._panCandidate = { startX: e.clientX, startY: e.clientY, panX: self.panX, panY: self.panY };
      };

      canvas.onmousemove = function (e) {
        if (!self._panState && self._panCandidate) {
          var dx = e.clientX - self._panCandidate.startX;
          var dy = e.clientY - self._panCandidate.startY;
          if (Math.abs(dx) + Math.abs(dy) >= 4) {
            self._panState = self._panCandidate;
            self._panCandidate = null;
            canvas.classList.add('preview-area__canvas--panning');
          }
        }
        if (!self._panState) return;
        self.panX = self._panState.panX + (e.clientX - self._panState.startX);
        self.panY = self._panState.panY + (e.clientY - self._panState.startY);
        self._applyTransform();
      };

      if (this._panMouseUpHandler) {
        document.removeEventListener('mouseup', this._panMouseUpHandler);
      }
      this._panMouseUpHandler = function () { self._endPan(); };
      document.addEventListener('mouseup', this._panMouseUpHandler);
    },

    _canPreparePan: function (target, svgEl) {
      if (!target || !svgEl) return false;
      if (target.closest && (
        target.closest('.edge-toolbar') ||
        target.closest('.sequence-toolbar') ||
        target.closest('.context-menu') ||
        target.closest('.node-edit-overlay') ||
        target.closest('#conn-port-overlay') ||
        target.closest('#sequence-drag-overlay') ||
        target.closest('#sequence-block-overlay')
      )) {
        return false;
      }
      return true;
    },

    _endPan: function () {
      var canvas = this.$refs.canvas;
      if (this._panState) this._suppressClickAfterPan = true;
      this._panState = null;
      this._panCandidate = null;
      if (canvas) canvas.classList.remove('preview-area__canvas--panning');
    },

    _zoomAtClient: function (factor, clientX, clientY) {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var cx = clientX - rect.left;
      var cy = clientY - rect.top;

      var newZoom = Math.max(0.05, Math.min(5.0, this.cfgZoom * factor));
      var ratio   = newZoom / this.cfgZoom;

      this.panX    = cx - (cx - this.panX) * ratio;
      this.panY    = cy - (cy - this.panY) * ratio;
      this.cfgZoom = newZoom;
      this._applyTransform();
    },

    _buildCtx: function (svgEl) {
      return PreviewCtxBuilder.build(this, svgEl);
    },

    // 공통 노드 편집 유틸

    confirmNodeEdit: function () {
      if (this.editingNodeId && this.editingText.trim()) {
        this.$emit('update-node-text', {
          nodeId: this.editingNodeId,
          text:   this.editingText.trim()
        });
      }
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    cancelNodeEdit: function () {
      this.editingNodeId = null;
      this.editingText   = '';
      this.editingNodeColor = '#e2e8f0';
    },

    onNodeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmNodeEdit(); }
      if (e.key === 'Escape') { this.cancelNodeEdit(); }
    },

    // 공통 엣지 편집 유틸

    confirmEdgeEdit: function () {
      if (this.editingEdgeIndex !== null) {
        this.$emit('update-edge-text', {
          index: this.editingEdgeIndex,
          text:  this.editingEdgeText.trim()
        });
      }
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    cancelEdgeEdit: function () {
      this.editingEdgeIndex = null;
      this.editingEdgeText  = '';
      this.editingEdgeColor = '#5c7ab0';
      this.selectedEdgeIndex = null;
      this._clearEdgeVisualState();
    },

    onEdgeEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmEdgeEdit(); }
      if (e.key === 'Escape') { this.cancelEdgeEdit(); }
    },

    // 공통 시퀀스 편집 유틸

    confirmSequenceParticipantEdit: function () {
      if (this.editingSequenceParticipantId && this.editingSequenceParticipantText.trim()) {
        this.$emit('update-sequence-participant-text', {
          participantId: this.editingSequenceParticipantId,
          text: this.editingSequenceParticipantText.trim()
        });
      }
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    cancelSequenceParticipantEdit: function () {
      this.editingSequenceParticipantId = null;
      this.editingSequenceParticipantText = '';
    },

    onSequenceParticipantEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceParticipantEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceParticipantEdit(); }
    },

    confirmSequenceMessageEdit: function () {
      if (this.editingSequenceMessageIndex !== null) {
        this.$emit('update-sequence-message-text', {
          index: this.editingSequenceMessageIndex,
          text: this.editingSequenceMessageText.trim()
        });
      }
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    cancelSequenceMessageEdit: function () {
      this.editingSequenceMessageIndex = null;
      this.editingSequenceMessageText = '';
    },

    onSequenceMessageEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceMessageEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceMessageEdit(); }
    },

    confirmSequenceBlockEdit: function () {
      if (this.editingSequenceBlockId !== null) {
        this.$emit('update-sequence-block-text', {
          blockId: this.editingSequenceBlockId,
          text: this.editingSequenceBlockText.trim()
        });
      } else if (this.editingSequenceBranchStatementIndex !== null) {
        this.$emit('update-sequence-branch-text', {
          statementIndex: this.editingSequenceBranchStatementIndex,
          text: this.editingSequenceBlockText.trim()
        });
      }
      this.editingSequenceBlockId = null;
      this.editingSequenceBranchStatementIndex = null;
      this.editingSequenceBlockText = '';
    },

    cancelSequenceBlockEdit: function () {
      this.editingSequenceBlockId = null;
      this.editingSequenceBranchStatementIndex = null;
      this.editingSequenceBlockText = '';
    },

    onSequenceBlockEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceBlockEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceBlockEdit(); }
    },

    confirmSequenceNoteEdit: function () {
      if (this.editingSequenceNoteStatementIndex !== null) {
        this.$emit('update-sequence-note-text', {
          statementIndex: this.editingSequenceNoteStatementIndex,
          text: this.editingSequenceNoteText.trim()
        });
      }
      this.editingSequenceNoteStatementIndex = null;
      this.editingSequenceNoteText = '';
    },

    cancelSequenceNoteEdit: function () {
      this.editingSequenceNoteStatementIndex = null;
      this.editingSequenceNoteText = '';
    },

    onSequenceNoteEditKeyDown: function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); this.confirmSequenceNoteEdit(); }
      if (e.key === 'Escape') { this.cancelSequenceNoteEdit(); }
    },

    // 공통 노드 컨텍스트 메뉴 액션 유틸

    contextEditNode: function () {
      if (!this.contextMenu) return;
      var nodeId = this.contextMenu.nodeId;
      var nodeEl = this._elements[nodeId];
      this.contextMenu = null;
      if (!nodeEl) return;
      var canvas = this.$refs.canvas;
      var canvasRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var labelEl = nodeEl.querySelector('foreignObject, .label, text');
      var targetRect = labelEl && labelEl.getBoundingClientRect ? labelEl.getBoundingClientRect() : nodeEl.getBoundingClientRect();
      var node = null;
      var nodes = this.model.nodes || [];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === nodeId) {
          node = nodes[i];
          break;
        }
      }
      var width = 240;
      var left = canvasRect ? (targetRect.left - canvasRect.left + (targetRect.width / 2) - (width / 2)) : 0;
      var top = canvasRect ? (targetRect.top - canvasRect.top + (targetRect.height / 2) - 18) : 0;
      this.editingNodeId = nodeId;
      this.editingText = node ? (node.text || node.id) : '';
      this.editingNodeColor = node && node.fill ? node.fill : '#e2e8f0';
      this.editInputStyle = {
        position: 'absolute',
        left: Math.max(8, left) + 'px',
        top: Math.max(8, top) + 'px',
        zIndex: 1000,
        width: width + 'px'
      };
      this.$nextTick(this._buildCtxLite().focusEditInput);
    },

    contextDeleteNode: function () {
      if (!this.contextMenu) return;
      this.$emit('delete-selected', { nodeId: this.contextMenu.nodeId, edgeIndex: null });
      this.contextMenu   = null;
      this.selectedNodeId = null;
    },

    contextChangeShape: function (shape) {
      if (!this.contextMenu) return;
      this.$emit('update-node-shape', {
        nodeId: this.contextMenu.nodeId,
        shape:  shape
      });
    },

    contextChangeNodeColor: function (fill) {
      if (!this.contextMenu) return;
      this.$emit('update-node-fill', {
        nodeId: this.contextMenu.nodeId,
        fill: fill || ''
      });
      this.contextMenu = null;
    },

    extractNodeId: function (nodeEl) {
      if (!nodeEl) return null;
      var dataId = nodeEl.getAttribute('data-id');
      if (dataId) return dataId;
      var id = nodeEl.getAttribute('id');
      if (!id) return null;

      // Extract the actual base ID.
      // Mermaid v11 generates IDs like: mermaid-render-4_flowchart-Start-1
      // 1. Remove the instance prefix (anything before 'flowchart-')
      var flowchartIdx = id.indexOf('flowchart-');
      var baseId = flowchartIdx !== -1 ? id.substring(flowchartIdx) : id;
      
      // 2. Remove the standard 'flowchart-' prefix
      baseId = baseId.replace(/^flowchart-/, '');
      
      // 3. Remove the suffix counter (e.g. '-1', '-24')
      baseId = baseId.replace(/-\d+$/, '');
      
      return baseId;
    },

    getFlowEdgeParts: function (type) {
      return FlowEdgeCodec ? FlowEdgeCodec.parseType(type) : { body: 'solid', head: 'none' };
    },

    getFlowEdgeType: function () {
      if (!this.edgeToolbar) return '---';
      var edge = (this.model.edges || [])[this.edgeToolbar.edgeIndex];
      return edge && edge.type ? edge.type : '---';
    },

    getFlowEdgeBodyLabel: function () {
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      var options = this.$options.FLOW_EDGE_BODY_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].key === parts.body) return options[i].label;
      }
      return '──';
    },

    getFlowEdgeHeadLabel: function () {
      var head = this.getFlowEdgeParts(this.getFlowEdgeType()).head;
      var options = this.$options.FLOW_EDGE_HEAD_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].key === head) return options[i].label;
      }
      return '─';
    },

    getFlowEdgeColorValue: function () {
      if (!this.edgeToolbar) return '';
      var edge = (this.model.edges || [])[this.edgeToolbar.edgeIndex];
      return edge && edge.color ? edge.color : '';
    },

    getSequenceMessageLineType: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') {
        return SequenceMessageCodec.DEFAULT_OPERATOR;
      }
      var message = (this.model.messages || [])[this.sequenceToolbar.index];
      var parsed = SequenceMessageCodec.parseOperator(message && message.operator);
      return parsed.base || SequenceMessageCodec.DEFAULT_OPERATOR;
    },

    getSequenceMessageLineTypeLabel: function () {
      var current = this.getSequenceMessageLineType();
      var options = this.$options.LINE_TYPE_OPTIONS || [];
      for (var i = 0; i < options.length; i++) {
        if (options[i].operator === current) return options[i].label;
      }
      return '───▶';
    },

    getAvailableFlowEdgeHeadOptions: function () {
      return this.$options.FLOW_EDGE_HEAD_OPTIONS || [];
    },

    composeFlowEdgeType: function (body, head) {
      return FlowEdgeCodec ? FlowEdgeCodec.composeType(body, head) : '---';
    },

    toggleFlowEdgeColorPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeColorPicker = !this.flowEdgeColorPicker;
      if (this.flowEdgeColorPicker) {
        this.flowEdgeBodyPicker = false;
        this.flowEdgeHeadPicker = false;
      }
    },

    toggleFlowEdgeBodyPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeBodyPicker = !this.flowEdgeBodyPicker;
      if (this.flowEdgeBodyPicker) {
        this.flowEdgeColorPicker = false;
        this.flowEdgeHeadPicker = false;
      }
    },

    toggleFlowEdgeHeadPicker: function () {
      if (!this.edgeToolbar) return;
      this.flowEdgeHeadPicker = !this.flowEdgeHeadPicker;
      if (this.flowEdgeHeadPicker) {
        this.flowEdgeColorPicker = false;
        this.flowEdgeBodyPicker = false;
      }
    },

    edgeToolbarSetType: function (type) {
      if (!this.edgeToolbar) return;
      this.$emit('update-edge-type', {
        index: this.edgeToolbar.edgeIndex,
        type: type
      });
    },

    edgeToolbarSelectLineBody: function (body) {
      if (!this.edgeToolbar) return;
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      this.edgeToolbarSetType(this.composeFlowEdgeType(body, parts.head));
      this.flowEdgeBodyPicker = false;
    },

    edgeToolbarSelectLineHead: function (head) {
      if (!this.edgeToolbar) return;
      var parts = this.getFlowEdgeParts(this.getFlowEdgeType());
      this.edgeToolbarSetType(this.composeFlowEdgeType(parts.body, head));
      this.flowEdgeHeadPicker = false;
    },

    // 공통 엣지 툴바 액션 유틸

    edgeToolbarEdit: function () {
      if (!this.edgeToolbar) return;
      var idx = this.edgeToolbar.edgeIndex;
      var clickX = this.edgeToolbar.x;
      var clickY = this.edgeToolbar.y;
      this.edgeToolbar = null;
      var edge = (this.model.edges || [])[idx];
      if (!edge) return;

      this.selectedEdgeIndex = idx;
      this.editingEdgeIndex = idx;
      this.editingEdgeText = edge.text || '';
      this.editingEdgeColor = edge.color || '#5c7ab0';
      this.edgeEditInputStyle = {
        position: 'absolute',
        left: Math.max(8, clickX - 80) + 'px',
        top: Math.max(8, clickY - 18) + 'px',
        zIndex: 1000,
        width: '160px'
      };
      this.flowEdgeColorPicker = false;
      this.flowEdgeBodyPicker = false;
      this.flowEdgeHeadPicker = false;
      this.$nextTick(this._buildCtxLite().focusEdgeEditInput);
    },

    edgeToolbarDelete: function () {
      if (!this.edgeToolbar) return;
      this.$emit('delete-selected', { nodeId: null, edgeIndex: this.edgeToolbar.edgeIndex });
      this.edgeToolbar       = null;
      this.flowEdgeColorPicker = false;
      this.flowEdgeBodyPicker = false;
      this.flowEdgeHeadPicker = false;
      this.selectedEdgeIndex = null;
    },

    edgeToolbarChangeColor: function (color) {
      if (!this.edgeToolbar) return;
      this.$emit('update-edge-color', {
        index: this.edgeToolbar.edgeIndex,
        color: color || ''
      });
      this.flowEdgeColorPicker = false;
    },

    // 공통 시퀀스 툴바 액션 유틸

    sequenceToolbarEdit: function () {
      if (!this.sequenceToolbar) return;
      var toolbar = this.sequenceToolbar;
      var canvas = this.$refs.canvas;
      var svgEl = canvas ? canvas.querySelector('svg') : null;

      if (toolbar.type === 'participant') {
        var participantMap = SequencePositionTracker.collectParticipants(svgEl, this.model);
        var participant = participantMap[toolbar.id];
        if (participant) {
          var topBox = participant.topBox || participant.bbox;
          var screenPos = { x: toolbar.x, y: toolbar.y };
          SequenceSvgHandler.startParticipantEdit(toolbar.id, screenPos, topBox, this._buildCtxLite());
        }
      } else if (toolbar.type === 'message') {
        SequenceSvgHandler.startMessageEdit(toolbar.index, toolbar.x, toolbar.y, svgEl, this._buildCtxLite());
      } else if (toolbar.type === 'block') {
        this._buildCtxLite().openSequenceBlockEdit(toolbar.blockId, toolbar.text || '', toolbar.x, toolbar.y);
      } else if (toolbar.type === 'note') {
        this._buildCtxLite().openSequenceNoteEdit(toolbar.noteStatementIndex, toolbar.text || '', toolbar.x, toolbar.y);
      }
    },

    sequenceToolbarDelete: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('delete-selected', {
          sequenceParticipantId: this.sequenceToolbar.id,
          sequenceMessageIndex: null
        });
        this.selectedSequenceParticipantId = null;
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('delete-selected', {
          sequenceParticipantId: null,
          sequenceMessageIndex: this.sequenceToolbar.index
        });
        this.selectedSequenceMessageIndex = null;
      } else if (this.sequenceToolbar.type === 'block') {
        this.$emit('delete-selected', {
          sequenceParticipantId: null,
          sequenceMessageIndex: null,
          sequenceBlockId: this.sequenceToolbar.blockId
        });
        this.selectedSequenceBlockId = null;
      } else if (this.sequenceToolbar.type === 'note') {
        this.$emit('delete-selected', { sequenceNoteStatementIndex: this.sequenceToolbar.noteStatementIndex });
        this.selectedSequenceNoteStatementIndex = null;
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarAddMessage: function () {
      if (!this.sequenceToolbar) return;
      if (this.sequenceToolbar.type === 'participant') {
        this.$emit('add-sequence-message', { participantId: this.sequenceToolbar.id });
      } else if (this.sequenceToolbar.type === 'message') {
        this.$emit('add-sequence-message', { afterIndex: this.sequenceToolbar.index });
      }
      this.sequenceToolbar = null;
    },

    sequenceToolbarReverse: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('reverse-sequence-message', this.sequenceToolbar.index);
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleLineType: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.lineTypePicker = !this.lineTypePicker;
    },

    sequenceToolbarSelectLineType: function (operator) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'message') return;
      this.$emit('set-sequence-message-line-type', { index: this.sequenceToolbar.index, operator: operator });
      this.lineTypePicker = false;
    },

    sequenceToolbarChangeBlockType: function (kind) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'block') return;
      this.$emit('change-sequence-block-type', {
        blockId: this.sequenceToolbar.blockId,
        kind: kind
      });
      this.sequenceToolbar = null;
    },

    sequenceToolbarInsertSelfLoop: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'insert') return;
      var tb = this.sequenceToolbar;
      this.$emit('add-sequence-message', {
        fromId: tb.participantId,
        toId: tb.participantId,
        insertIndex: tb.insertIndex
      });
      this.sequenceToolbar = null;
    },

    sequenceToolbarInsertMemo: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'insert') return;
      var tb = this.sequenceToolbar;
      this.$emit('create-sequence-note', {
        participantId: tb.participantId,
        insertIndex: tb.insertIndex
      });
      this.sequenceToolbar = null;
    },

    sequenceToolbarAddBranch: function (keyword) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'selection') return;
      this.$emit('add-sequence-branch', {
        keyword: keyword,
        text: keyword === 'else' ? 'case' : 'task',
        messageIndices: (this.sequenceToolbar.messageIndices || []).slice()
      });
      this.selectedSequenceMessageIndices = [];
      this.sequenceToolbar = null;
    },

    sequenceToolbarWrapBlock: function (kind) {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'selection') return;
      this.$emit('wrap-sequence-messages-in-block', {
        kind: kind,
        text: kind + '_title',
        messageIndices: (this.sequenceToolbar.messageIndices || []).slice()
      });
      this.selectedSequenceMessageIndices = [];
      this.sequenceToolbar = null;
    },

    sequenceToolbarToggleKind: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('toggle-participant-kind', { participantId: this.sequenceToolbar.id });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveLeft: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'left' });
      this.sequenceToolbar = null;
    },

    sequenceToolbarMoveRight: function () {
      if (!this.sequenceToolbar || this.sequenceToolbar.type !== 'participant') return;
      this.$emit('move-sequence-participant', { participantId: this.sequenceToolbar.id, direction: 'right' });
      this.sequenceToolbar = null;
    },

    // postRenderSetup 바깥에서도 재사용하는 경량 ctx
    _buildCtxLite: function () {
      return PreviewCtxBuilder.buildLite(this);
    },

    fitView: function () {
      var canvas = this.$refs.canvas;
      if (!canvas || !this._svgEl) return;

      var canvasW = canvas.clientWidth  || canvas.offsetWidth;
      var canvasH = canvas.clientHeight || canvas.offsetHeight;

      if (!canvasW || !canvasH) {
        var self = this;
        requestAnimationFrame(function () { self.fitView(); });
        return;
      }

      var bounds = this._getContentBounds();
      if (!bounds || !bounds.width || !bounds.height) return;

      var pad    = Math.max(24, Math.min(canvasW, canvasH) * 0.06);
      var scaleX = (canvasW - pad * 2) / bounds.width;
      var scaleY = (canvasH - pad * 2) / bounds.height;
      var scale  = Math.min(scaleX, scaleY);
      scale = Math.min(5.0, scale);

      this.cfgZoom = scale;
      this.panX    = (canvasW - bounds.width * scale) / 2 - bounds.x * scale;
      this.panY    = (canvasH - bounds.height * scale) / 2 - bounds.y * scale;
      this._applyTransform();
    },

    zoomIn: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    zoomOut: function () {
      var canvas = this.$refs.canvas;
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      this._zoomAtClient(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },

    highlightNewNode: function (nodeId) {
      this._pendingHighlightNodeId = nodeId;
    },

    _flashNode: function (nodeId) {
      var el = this._elements && this._elements[nodeId];
      if (!el) return;
      el.classList.remove('node-new-flash');
      void el.offsetWidth;
      el.classList.add('node-new-flash');
      setTimeout(function () { el.classList.remove('node-new-flash'); }, 3000);
    },

    highlightNewParticipant: function (participantId) {
      this._pendingHighlightParticipantId = participantId;
    },

    _flashParticipant: function (svgEl, participantId) {
      var targets = SequencePositionTracker.collectParticipantTargets(svgEl, this.model);
      var el = null;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i].id === participantId) { el = targets[i].el; break; }
      }
      if (!el) return;
      el.classList.remove('node-new-flash');
      void el.offsetWidth;
      el.classList.add('node-new-flash');
      setTimeout(function () { el.classList.remove('node-new-flash'); }, 3000);
    },

    showUnsupportedHint: function () {
      var self = this;
      this.unsupportedHint = true;
      clearTimeout(this._unsupportedHintTimer);
      this._unsupportedHintTimer = setTimeout(function () {
        self.unsupportedHint = false;
      }, 1500);
    }
  },

  template: '\
    <div class="preview-area" @click.self="selectedNodeId = null; selectedEdgeIndex = null; selectedSequenceParticipantId = null; selectedSequenceMessageIndex = null; selectedSequenceMessageIndices = []; selectedSequenceBlockId = null;">\
        <div v-if="portDragging" class="edge-mode-overlay" style="background: var(--success);">\
          {{ model.type === &quot;sequence&quot; ? &quot;Release on target participant to insert message&quot; : &quot;Release on target node to connect&quot; }}\
        </div>\
        <div v-if="unsupportedHint" class="edge-mode-overlay" style="background: #f59e0b;">\
          Unsupported element cannot be edited\
        </div>\
      <div v-if="svgContent" :key="renderCounter" ref="canvas" class="preview-area__canvas">\
        <div class="preview-area__svg-host" v-html="svgContent"></div>\
        <div v-if="editingNodeId" class="node-edit-overlay" :style="editInputStyle">\
          <input ref="editInput" class="node-edit-input" v-model="editingText" @keydown="onNodeEditKeyDown" @blur="confirmNodeEdit" />\
        </div>\
        <div v-if="editingEdgeIndex !== null" class="node-edit-overlay" :style="edgeEditInputStyle">\
          <input ref="editEdgeInput" class="node-edit-input" v-model="editingEdgeText" placeholder="Edge label" @keydown="onEdgeEditKeyDown" @blur="confirmEdgeEdit" />\
        </div>\
        <div v-if="editingSequenceParticipantId" class="node-edit-overlay" :style="sequenceParticipantEditStyle">\
          <input ref="sequenceParticipantInput" class="node-edit-input" v-model="editingSequenceParticipantText" @keydown="onSequenceParticipantEditKeyDown" @blur="confirmSequenceParticipantEdit" />\
        </div>\
        <div v-if="editingSequenceMessageIndex !== null" class="node-edit-overlay" :style="sequenceMessageEditStyle">\
          <input ref="sequenceMessageInput" class="node-edit-input" v-model="editingSequenceMessageText" placeholder="Message text" @keydown="onSequenceMessageEditKeyDown" @blur="confirmSequenceMessageEdit" />\
        </div>\
        <div v-if="editingSequenceBlockId !== null || editingSequenceBranchStatementIndex !== null" class="node-edit-overlay" :style="sequenceBlockEditStyle">\
          <input ref="sequenceBlockInput" class="node-edit-input" v-model="editingSequenceBlockText" placeholder="Block text" @keydown="onSequenceBlockEditKeyDown" @blur="confirmSequenceBlockEdit" />\
        </div>\
        <div v-if="editingSequenceNoteStatementIndex !== null" class="node-edit-overlay" :style="sequenceNoteEditStyle">\
          <input ref="sequenceNoteInput" class="node-edit-input" v-model="editingSequenceNoteText" placeholder="Note text" @keydown="onSequenceNoteEditKeyDown" @blur="confirmSequenceNoteEdit" />\
        </div>\
        <div v-if="contextMenu" class="context-menu" :style="{ left: contextMenu.x + &quot;px&quot;, top: contextMenu.y + &quot;px&quot; }" @click.stop>\
          <div class="context-menu__section-title">Change Shape</div>\
          <div class="context-menu__shapes-grid">\
            <button v-for="s in $options.SHAPES" :key="s.key" class="context-menu__shape-btn" :title="s.name" @click="contextChangeShape(s.key)">\
              <span class="context-menu__shape-icon" :class="&quot;context-menu__shape-icon--&quot; + s.key"></span>\
              <span class="context-menu__shape-text">{{ s.name }}</span>\
            </button>\
          </div>\
          <div class="context-menu__section-title">Color</div>\
          <div class="context-menu__color-row">\
            <button class="context-menu__color-btn context-menu__color-btn--clear" aria-label="Clear color" @click="contextChangeNodeColor(&quot;&quot;)"></button>\
            <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :style="{ backgroundColor: color.value }" :title="color.key" @click="contextChangeNodeColor(color.value)"></button>\
          </div>\
          <div class="context-menu__separator"></div>\
          <div class="context-menu__item" @click="contextEditNode"><span class="context-menu__item-icon">T</span> Edit Text</div>\
          <div class="context-menu__item context-menu__item--danger" @click="contextDeleteNode"><span class="context-menu__item-icon">X</span> Delete Node</div>\
        </div>\
        <div v-if="edgeToolbar" class="edge-toolbar" :style="{ left: edgeToolbar.x + &quot;px&quot;, top: edgeToolbar.y + &quot;px&quot; }" @click.stop>\
          <button class="edge-toolbar__btn" @click="edgeToolbarEdit" title="Edit label">Label ✎</button>\
          <div class="edge-toolbar__sep"></div>\
          <div class="edge-toolbar__type-group edge-toolbar__type-group--color">\
            <button class="edge-toolbar__type-trigger edge-toolbar__type-trigger--color" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeColorPicker }" @click="toggleFlowEdgeColorPicker" title="Line color">\
              <span class="edge-toolbar__color-swatch" :class="{ \'edge-toolbar__color-swatch--empty\': !getFlowEdgeColorValue() }" :style="getFlowEdgeColorValue() ? { backgroundColor: getFlowEdgeColorValue() } : {}"></span>\
              <span class="edge-toolbar__type-caret">⌄</span>\
            </button>\
            <div v-if="flowEdgeColorPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--color">\
              <button class="context-menu__color-btn context-menu__color-btn--clear" aria-label="Clear color" @click="edgeToolbarChangeColor(&quot;&quot;)"></button>\
              <button v-for="color in $options.COLOR_PALETTE" :key="color.key" class="context-menu__color-btn" :class="{ \'context-menu__color-btn--selected\': getFlowEdgeColorValue() === color.value }" :style="{ backgroundColor: color.value }" :title="color.key" @click="edgeToolbarChangeColor(color.value)"></button>\
            </div>\
          </div>\
          <div class="edge-toolbar__sep"></div>\
          <div class="edge-toolbar__type-row">\
            <div class="edge-toolbar__type-group">\
              <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeBodyPicker }" @click="toggleFlowEdgeBodyPicker" title="Line body">\
                <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--body">{{ getFlowEdgeBodyLabel() }}</span>\
                <span class="edge-toolbar__type-caret">⌄</span>\
              </button>\
              <div v-if="flowEdgeBodyPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--body">\
                <button\
                  v-for="opt in $options.FLOW_EDGE_BODY_OPTIONS"\
                  :key="opt.key"\
                  class="edge-toolbar__type-option"\
                  :class="{ \'edge-toolbar__type-option--selected\': getFlowEdgeParts(getFlowEdgeType()).body === opt.key }"\
                  @click="edgeToolbarSelectLineBody(opt.key)"\
                >{{ opt.label }}</button>\
              </div>\
            </div>\
            <div class="edge-toolbar__type-group">\
              <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': flowEdgeHeadPicker }" @click="toggleFlowEdgeHeadPicker" title="Arrow head">\
                <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--head">{{ getFlowEdgeHeadLabel() }}</span>\
                <span class="edge-toolbar__type-caret">⌄</span>\
              </button>\
              <div v-if="flowEdgeHeadPicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--head">\
                <button\
                  v-for="opt in getAvailableFlowEdgeHeadOptions()"\
                  :key="opt.key"\
                  class="edge-toolbar__type-option"\
                  :class="{ \'edge-toolbar__type-option--selected\': getFlowEdgeParts(getFlowEdgeType()).head === opt.key }"\
                  @click="edgeToolbarSelectLineHead(opt.key)"\
                >{{ opt.label }}</button>\
              </div>\
            </div>\
          </div>\
          <div class="edge-toolbar__sep"></div>\
          <button class="edge-toolbar__btn edge-toolbar__btn--danger" @click="edgeToolbarDelete" title="Delete edge">Delete</button>\
        </div>\
        <div v-if="sequenceToolbar" class="sequence-toolbar" :style="{ left: sequenceToolbar.x + &quot;px&quot;, top: sequenceToolbar.y + &quot;px&quot; }" @click.stop>\
          <button v-if="sequenceToolbar.type === &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarInsertSelfLoop">↩ Self Loop</button>\
          <button v-if="sequenceToolbar.type === &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarInsertMemo">≡ Memo</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot; &amp;&amp; sequenceToolbar.parentKind === &quot;alt&quot;" class="edge-toolbar__btn edge-toolbar__btn--branch" @click="sequenceToolbarAddBranch(&quot;else&quot;)">+ else</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot; &amp;&amp; sequenceToolbar.parentKind === &quot;par&quot;" class="edge-toolbar__btn edge-toolbar__btn--branch" @click="sequenceToolbarAddBranch(&quot;and&quot;)">+ and</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;loop&quot;)">Loop ↻</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;alt&quot;)">Alt ⎇</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;opt&quot;)">Opt ?</button>\
          <button v-if="sequenceToolbar.type === &quot;selection&quot;" class="edge-toolbar__btn" @click="sequenceToolbarWrapBlock(&quot;par&quot;)">Par∥</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;loop&quot; }" @click="sequenceToolbarChangeBlockType(&quot;loop&quot;)">Loop ↻</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;opt&quot; }" @click="sequenceToolbarChangeBlockType(&quot;opt&quot;)">Opt ?</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;alt&quot; }" @click="sequenceToolbarChangeBlockType(&quot;alt&quot;)">Alt ⎇</button>\
          <button v-if="sequenceToolbar.type === &quot;block&quot;" class="edge-toolbar__btn" :class="{ \'edge-toolbar__btn--active\': sequenceToolbar.kind === &quot;par&quot; }" @click="sequenceToolbarChangeBlockType(&quot;par&quot;)">Par∥</button>\
          <button v-if="sequenceToolbar.type !== &quot;block&quot; &amp;&amp; sequenceToolbar.type !== &quot;selection&quot; &amp;&amp; sequenceToolbar.type !== &quot;insert&quot;" class="edge-toolbar__btn" @click="sequenceToolbarEdit">Text ✎</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveLeft" title="Move left">◀</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarMoveRight" title="Move right">▶</button>\
          <button v-if="sequenceToolbar.type === &quot;participant&quot;" class="edge-toolbar__btn" @click="sequenceToolbarToggleKind">{{ sequenceToolbar.kind === &quot;actor&quot; ? &quot;→ Participant&quot; : &quot;→ Shape&quot; }}</button>\
          <button v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__btn" @click="sequenceToolbarReverse">Reverse</button>\
          <div v-if="sequenceToolbar.type === &quot;message&quot;" class="edge-toolbar__type-group">\
            <button class="edge-toolbar__type-trigger" :class="{ \'edge-toolbar__type-trigger--open\': lineTypePicker }" @click.stop="sequenceToolbarToggleLineType" title="Line type">\
              <span class="edge-toolbar__type-glyph edge-toolbar__type-glyph--body">{{ getSequenceMessageLineTypeLabel() }}</span>\
              <span class="edge-toolbar__type-caret">⌄</span>\
            </button>\
            <div v-if="lineTypePicker" class="edge-toolbar__type-menu edge-toolbar__type-menu--body">\
              <button\
                v-for="opt in $options.LINE_TYPE_OPTIONS"\
                :key="opt.operator"\
                class="edge-toolbar__type-option edge-toolbar__btn--line-opt"\
                :class="{ \'edge-toolbar__type-option--selected\': getSequenceMessageLineType() === opt.operator }"\
                @click="sequenceToolbarSelectLineType(opt.operator)"\
              >{{ opt.label }}</button>\
            </div>\
          </div>\
          <button v-if="sequenceToolbar.type !== &quot;selection&quot; &amp;&amp; sequenceToolbar.type !== &quot;insert&quot;" class="edge-toolbar__btn edge-toolbar__btn--danger" @click="sequenceToolbarDelete">Delete</button>\
        </div>\
      </div>\
      <div v-else class="preview-area__empty">\
        <div class="preview-area__empty-icon">[]</div>\
        <div class="preview-area__empty-text">{{ renderError || &quot;Enter Mermaid script to render a diagram here.&quot; }}</div>\
        <div style="color: var(--text-muted); font-size: 12px; margin-top: 4px;">{{ renderError ? &quot;Rendering failed. Check the Mermaid script.&quot; : &quot;Flowchart and sequence diagrams are supported.&quot; }}</div>\
      </div>\
    </div>\
  '
});


/* ===== src/components/MermaidFullEditor.js ===== */
/**
 * MermaidFullEditor — 임베드용 올인원 컴포넌트
 * MermaidEditor(텍스트) + MermaidToolbar + MermaidPreview를 하나로 묶음.
 * 부모와 v-model(:value + @input)으로 diagram 문자열을 양방향 동기화한다.
 *
 * 사용법:
 *   <mermaid-full-editor :value="myDiagram" @input="myDiagram = $event">
 *   </mermaid-full-editor>
 */

Vue.component('mermaid-full-editor', {
  mixins: [flowchartActionsMixin, sequenceActionsMixin, exportMixin, toastMixin],

  props: {
    value: { type: String, default: '' }
  },

  data: function () {
    return {
      script: this.value || '',
      model:  { type: 'flowchart', direction: 'TD', nodes: [], edges: [] },
      error:  '',
      parseWarning: '',

      selectedNode: '',
      selectedEdge: null,
      selectedSequenceParticipant: '',
      selectedSequenceMessage: null,

      // mounted에서 생성되는 IdAllocator 인스턴스 (N* / P* 충돌 없는 ID 할당)
      nodeIdAllocator: null,
      participantIdAllocator: null,

      history: null,
      fullScreen: false
      // 토스트 상태는 toastMixin에서 제공
    };
  },

  computed: {
    canUndo:     function () { return !!(this.history && this.history.canUndo()); },
    canRedo:     function () { return !!(this.history && this.history.canRedo()); },
    isFlowchart: function () { return !!this.model && this.model.type !== 'sequenceDiagram'; }
  },

  watch: {
    // 부모 → 컴포넌트 동기화
    value: function (newVal) {
      if (newVal !== this.script) {
        this.script = newVal;
        this.parseScript();
      }
    },
    // 컴포넌트 → 부모 동기화
    script: function (newVal) {
      this.$emit('input', newVal);
    },
    fullScreen: function () {
      var self = this;
      this.$nextTick(function () { self.fitView(); });
    }
  },

  mounted: function () {
    this.history = new HistoryManager();
    this.nodeIdAllocator = new IdAllocator('N');
    this.participantIdAllocator = new IdAllocator('P');
    if (this.script) {
      this.parseScript();
    }
    var self = this;
    this.$nextTick(function () {
      self._seedIdAllocators();
    });
    window.addEventListener('popstate', this._onPopState);
  },

  beforeDestroy: function () {
    window.removeEventListener('popstate', this._onPopState);
    if (this.fullScreen) history.back();
  },

  methods: {

    // ── 텍스트 에디터에서 편집 ──────────────────────────────────────
    onScriptChange: function (newScript) {
      this.script = newScript;
      this._schedulePreviewFit();
      this.parseScript();
    },

    _schedulePreviewFit: function () {
      if (this.$refs.preview) this.$refs.preview.scheduleFit();
    },

    _notifyNewNode: function (nodeId) {
      if (this.$refs.preview) this.$refs.preview.highlightNewNode(nodeId);
    },

    _notifyNewParticipant: function (participantId) {
      if (this.$refs.preview) this.$refs.preview.highlightNewParticipant(participantId);
    },


    _snapshot: function () { if (this.history) this.history.snapshot(this.model); },

    parseScript: function () {
      try {
        var parsed = MermaidParser.parse(this.script);
        this.model = parsed;
        this.error = '';
        this.parseWarning = ModelDiagnostics.reservedIdWarning(this.script, parsed);
      } catch (e) {
        this.error = e.message || 'Parse error';
        this.parseWarning = '';
      }
      this._seedIdAllocators();
    },

    updateScriptFromModel: function () {
      this.script = MermaidGenerator.generate(this.model);
      try {
        var parsed = MermaidParser.parse(this.script);
        this.error = '';
        this.parseWarning = ModelDiagnostics.reservedIdWarning(this.script, parsed);
      } catch (e) {
        this.error = e.message || 'Parse error';
        this.parseWarning = '';
      }
    },

    _seedIdAllocators: function () {
      if (this.nodeIdAllocator) {
        this.nodeIdAllocator.seed(this.script, (this.model && this.model.nodes) || []);
      }
      if (this.participantIdAllocator) {
        this.participantIdAllocator.seed(this.script, (this.model && this.model.participants) || []);
      }
    },

    // deleteSelected dispatcher — flowchart / sequence 분기를 각 믹스인 헬퍼로 위임
    deleteSelected: function (data) {
      if (!data) return;
      this._snapshot();
      var handled = this.isFlowchart
        ? this._deleteFlowchartSelection(data)
        : this._deleteSequenceSelection(data);
      if (!handled) return;

      this.selectedNode = '';
      this.selectedEdge = null;
      this.selectedSequenceParticipant = '';
      this.selectedSequenceMessage = null;
      if (this.isFlowchart) {
        this.updateScriptFromModel();
      }
    },

    undo: function () { if (!this.history) return; var prev = this.history.undo(this.model); if (!prev) return; this.model = prev; this.script = MermaidGenerator.generate(this.model); },
    redo: function () { if (!this.history) return; var next = this.history.redo(this.model); if (!next) return; this.model = next; this.script = MermaidGenerator.generate(this.model); },

    onNodeSelected:                function (id)    { this.selectedNode = id; this.selectedEdge = null; },
    onEdgeSelected:                function (idx)   { this.selectedEdge = this.model.edges[idx] || null; this.selectedNode = ''; },
    onSequenceParticipantSelected: function (id)    { this.selectedSequenceParticipant = id; this.selectedSequenceMessage = null; },
    onSequenceMessageSelected:     function (idx)   { this.selectedSequenceMessage = (this.model.messages || [])[idx] || null; this.selectedSequenceParticipant = ''; },

    fitView:  function () { if (this.$refs.preview) this.$refs.preview.fitView(); },
    zoomIn:   function () { if (this.$refs.preview) this.$refs.preview.zoomIn(); },
    zoomOut:  function () { if (this.$refs.preview) this.$refs.preview.zoomOut(); },

    toggleFullscreen: function () {
      if (!this.fullScreen) {
        this.fullScreen = true;
        history.pushState({ guiEditorFullscreen: true }, '');
      } else {
        this.fullScreen = false;
        history.back();
      }
    },

    _onPopState: function () {
      if (this.fullScreen) this.fullScreen = false;
    }

    // flowchart/sequence 액션, export/copy, toast는 모두 믹스인에서 제공
  },

  template: '\
    <div class="gui-editor-shell" :class="{ \'gui-editor-shell--fullscreen\': fullScreen }">\
      <div v-if="!fullScreen" class="gui-editor-shell__editor-pane">\
        <mermaid-editor\
          :value="script"\
          :error="error"\
          :warning="parseWarning"\
          :highlight-targets="(model.diagnostics && model.diagnostics.rawTargets) || []"\
          :diagram-type="model.type"\
          @input="onScriptChange"\
        ></mermaid-editor>\
      </div>\
      <div class="gui-editor-shell__preview-pane">\
        <mermaid-toolbar\
          :diagram-type="model.type"\
          :direction="model.direction"\
          :can-undo="canUndo"\
          :can-redo="canRedo"\
          :autonumber="!!model.autonumber"\
          :full-screen="fullScreen"\
          @toggle-fullscreen="toggleFullscreen"\
          @add-node="addNode"\
          @add-sequence-participant="addSequenceParticipant"\
          @add-sequence-actor="addSequenceActor"\
          @add-sequence-message="addSequenceMessage"\
          @toggle-autonumber="toggleAutonumber"\
          @undo="undo"\
          @redo="redo"\
          @change-direction="changeDirection"\
          @zoom-in="zoomIn"\
          @zoom-out="zoomOut"\
          @fit-view="fitView"\
          @copy-svg="copySvg"\
          @export-png="exportPng"\
          @export-svg="exportSvg"\
          @export-jpg="exportJpg"\
        ></mermaid-toolbar>\
        <mermaid-preview\
          ref="preview"\
          :model="model"\
          @add-node="addNode"\
          @add-edge="addEdge"\
          @add-sequence-message="addSequenceMessage"\
          @delete-selected="deleteSelected"\
          @update-node-text="updateNodeText"\
          @update-node-shape="updateNodeShape"\
          @update-edge-text="updateEdgeText"\
          @update-edge-type="updateEdgeType"\
          @update-node-style="updateNodeStyle"\
          @update-edge-style="updateEdgeStyle"\
          @update-node-fill="updateNodeFill"\
          @update-edge-color="updateEdgeColor"\
          @update-sequence-participant-text="updateSequenceParticipantText"\
          @update-sequence-message-text="updateSequenceMessageText"\
          @reverse-sequence-message="reverseSequenceMessage"\
          @toggle-sequence-message-line-type="toggleSequenceMessageLineType"\
          @set-sequence-message-line-type="setSequenceMessageLineType"\
          @add-sequence-branch="addSequenceBranch"\
          @wrap-sequence-messages-in-block="wrapSequenceMessagesInBlock"\
          @update-sequence-block-text="updateSequenceBlockText"\
          @update-sequence-branch-text="updateSequenceBranchText"\
          @change-sequence-block-type="changeSequenceBlockType"\
          @create-sequence-note="addSequenceNote"\
          @update-sequence-note-text="updateSequenceNoteText"\
          @toggle-participant-kind="toggleParticipantKind"\
          @move-sequence-participant="moveSequenceParticipant"\
          @node-selected="onNodeSelected"\
          @edge-selected="onEdgeSelected"\
          @sequence-participant-selected="onSequenceParticipantSelected"\
          @sequence-message-selected="onSequenceMessageSelected"\
          @undo="undo"\
          @redo="redo"\
          @svg-rendered="$emit(\'svg-rendered\', $event)"\
        ></mermaid-preview>\
      </div>\
      <div\
        class="gui-editor-toast"\
        :class="[toastVisible ? \'gui-editor-toast--visible\' : \'\']"\
      >{{ toastMsg }}</div>\
    </div>\
  '
});
