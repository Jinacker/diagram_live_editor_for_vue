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

    return statements;
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

  function insertBranchStatement(model, messageIndices, keyword, text) {
    var sorted = messageIndices.slice().sort(function (a, b) { return a - b; });
    var statements = cloneStatements(model);
    var insertAt = messageIndexToStatementIndex(statements, sorted[0]);
    if (insertAt === -1) return statements;
    statements.splice(insertAt, 0, { type: String(keyword), text: text || '' });
    return statements;
  }

  function updateBranchText(model, statementIndex, text) {
    var statements = cloneStatements(model);
    if (statementIndex < 0 || statementIndex >= statements.length) return statements;
    statements[statementIndex] = Object.assign({}, statements[statementIndex], { text: text || '' });
    return statements;
  }

  global.SequenceStatementUtils = {
    cloneStatements: cloneStatements,
    listBlocks: listBlocks,
    findEnclosingBranchBlock: findEnclosingBranchBlock,
    insertMessageStatement: insertMessageStatement,
    removeMessageStatements: removeMessageStatements,
    wrapMessagesInBlock: wrapMessagesInBlock,
    insertBranchStatement: insertBranchStatement,
    updateBlockText: updateBlockText,
    updateBranchText: updateBranchText,
    deleteBlock: deleteBlock,
    changeBlockKind: changeBlockKind
  };

})(typeof window !== 'undefined' ? window : this);
