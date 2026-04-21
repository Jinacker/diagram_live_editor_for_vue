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
