/**
 * Mermaid 시퀀스 다이어그램 파서
 * sequenceDiagram 문법을 내부 모델로 변환한다.
 */

(function (global) {
  'use strict';

  var MESSAGE_RE = SequenceMessageCodec.MESSAGE_RE;
  var BLOCK_OPEN_RE = /^(loop|alt|opt|par)(?:\s+(.+))?$/i;
  var RAW_BLOCK_OPEN_RE = /^(rect|critical|break|box)\b(?:\s+(.+))?$/i;

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
