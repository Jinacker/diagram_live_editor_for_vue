(function (global) {
  'use strict';

  function getSvgString(svgSource) {
    if (!svgSource) return '';
    if (typeof svgSource === 'string') return svgSource;
    return new XMLSerializer().serializeToString(svgSource);
  }

  function getSourceSvgElement(svgSource, options) {
    options = options || {};
    if (options.sourceElement && options.sourceElement.querySelectorAll) {
      return options.sourceElement;
    }
    if (svgSource && typeof svgSource !== 'string' && svgSource.querySelectorAll) {
      return svgSource;
    }
    return null;
  }

  function normalizeTextLines(textOrLines) {
    var raw = Array.isArray(textOrLines)
      ? textOrLines
      : String(textOrLines || '').split(/\r\n|\r|\n/);
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var line = String(raw[i] || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .trim();
      if (line || (lines.length && i < raw.length - 1)) lines.push(line);
    }
    while (lines.length > 1 && !lines[0]) lines.shift();
    while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
    return lines.length ? lines : [''];
  }

  function extractDomTextLines(root) {
    var lines = [''];

    function appendText(text) {
      var parts = String(text || '').replace(/\u00a0/g, ' ').split(/\r\n|\r|\n/);
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) lines.push('');
        var chunk = parts[i].replace(/[ \t\f\v]+/g, ' ');
        if (!chunk) continue;
        lines[lines.length - 1] += chunk;
      }
    }

    function newline() {
      lines.push('');
    }

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        appendText(node.nodeValue || '');
        return;
      }
      if (node.nodeType !== 1) return;

      var tag = String(node.tagName || '').toLowerCase();
      if (tag === 'br') {
        newline();
        return;
      }

      var children = node.childNodes || [];
      for (var i = 0; i < children.length; i++) {
        walk(children[i]);
      }

      if (tag === 'p' || tag === 'li' || tag === 'tr') {
        newline();
      }
    }

    walk(root);
    return normalizeTextLines(lines);
  }

  function getForeignObjectText(fo, sourceFo) {
    var source = sourceFo || fo;
    if (source && typeof source.innerText === 'string' && source.innerText.trim()) {
      return normalizeTextLines(source.innerText).join('\n');
    }
    var label = source && source.querySelector
      ? (source.querySelector('.nodeLabel, span.edgeLabel, .edgeLabel, p, span, div') || source)
      : source;
    return extractDomTextLines(label || fo).join('\n');
  }

  function readInlineStyleValue(el, name) {
    if (!el || !el.getAttribute) return '';
    var raw = el.getAttribute('style') || '';
    var parts = raw.split(';');
    name = String(name || '').toLowerCase();
    for (var i = 0; i < parts.length; i++) {
      var colon = parts[i].indexOf(':');
      if (colon === -1) continue;
      var key = parts[i].slice(0, colon).trim().toLowerCase();
      if (key === name) return cleanStyleValue(parts[i].slice(colon + 1));
    }
    return '';
  }

  function readStyleValue(el, name) {
    if (!el || !el.getAttribute) return '';
    var value = readInlineStyleValue(el, name);
    if (value) return value;
    value = el.getAttribute(name);
    return value ? cleanStyleValue(value) : '';
  }

  function cleanStyleValue(value) {
    return String(value || '').replace(/!important/gi, '').trim();
  }

  function isUsableStyleValue(value) {
    value = cleanStyleValue(value);
    if (!value) return false;
    var lowered = value.toLowerCase();
    return lowered !== 'inherit' &&
      lowered !== 'initial' &&
      lowered !== 'unset' &&
      lowered !== 'revert' &&
      lowered !== 'transparent' &&
      lowered !== 'rgba(0, 0, 0, 0)' &&
      lowered !== 'rgba(0,0,0,0)' &&
      lowered !== 'currentcolor' &&
      lowered.indexOf('var(') === -1;
  }

  function firstUsableStyleValue() {
    for (var i = 0; i < arguments.length; i++) {
      if (isUsableStyleValue(arguments[i])) return cleanStyleValue(arguments[i]);
    }
    return '';
  }

  function hasClassToken(el, token) {
    if (!el || !el.getAttribute) return false;
    var cls = ' ' + String(el.getAttribute('class') || '') + ' ';
    return cls.indexOf(' ' + token + ' ') !== -1;
  }

  function findStyleScope(el) {
    var node = el;
    while (node && node.getAttribute) {
      if (hasClassToken(node, 'node') ||
          hasClassToken(node, 'cluster') ||
          hasClassToken(node, 'edgeLabel')) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function findExplicitStyleValue(el, name) {
    var node = el;
    while (node && node.getAttribute) {
      var direct = readStyleValue(node, name);
      if (direct) return direct;
      node = node.parentNode;
    }

    var scope = findStyleScope(el);
    if (!scope || !scope.querySelectorAll) return '';

    var candidates = scope.querySelectorAll('[style], [' + name + ']');
    for (var i = 0; i < candidates.length; i++) {
      var scoped = readStyleValue(candidates[i], name);
      if (scoped) return scoped;
    }
    return '';
  }

  function findOwnerSvg(el) {
    var node = el;
    while (node && node.getAttribute) {
      if (String(node.tagName || '').toLowerCase() === 'svg') return node;
      node = node.parentNode;
    }
    return null;
  }

  function readDeclarationValue(raw, name) {
    raw = String(raw || '');
    var parts = raw.split(';');
    name = String(name || '').toLowerCase();
    for (var i = 0; i < parts.length; i++) {
      var colon = parts[i].indexOf(':');
      if (colon === -1) continue;
      var key = parts[i].slice(0, colon).trim().toLowerCase();
      if (key === name) return parts[i].slice(colon + 1).replace(/!important/gi, '').trim();
    }
    return '';
  }

  function findScopedStyleRuleValue(el, name) {
    var scope = findStyleScope(el);
    if (!scope || !scope.getAttribute) return '';

    var scopeId = scope.getAttribute('id') || '';
    if (!scopeId) return '';

    var svg = findOwnerSvg(scope);
    if (!svg || !svg.querySelectorAll) return '';

    var styles = svg.querySelectorAll('style');
    var value = '';
    for (var i = 0; i < styles.length; i++) {
      var css = styles[i].textContent || '';
      var re = /([^{}]+)\{([^{}]+)\}/g;
      var match;
      while ((match = re.exec(css))) {
        var selector = match[1] || '';
        if (selector.indexOf(scopeId) === -1) continue;
        var found = readDeclarationValue(match[2], name);
        if (isUsableStyleValue(found)) value = found;
      }
    }
    return value;
  }

  function readForeignObjectTextStyle(sourceFo) {
    var target = sourceFo && sourceFo.querySelector
      ? (sourceFo.querySelector('.nodeLabel, span.edgeLabel, .edgeLabel, p, span, div') || sourceFo)
      : sourceFo;
    var computed = null;
    if (target && typeof window !== 'undefined' && window.getComputedStyle) {
      try { computed = window.getComputedStyle(target); } catch (e) {}
    }

    var fontSize = computed ? parseFloat(computed.fontSize) : 0;
    if (!fontSize) fontSize = parseFloat(readInlineStyleValue(target, 'font-size')) || 14;

    var lineHeight = computed ? parseFloat(computed.lineHeight) : 0;
    if (!lineHeight) lineHeight = parseFloat(readInlineStyleValue(target, 'line-height')) || Math.round(fontSize * 1.35);

    var explicitColor = firstUsableStyleValue(
      findExplicitStyleValue(target, 'color'),
      findExplicitStyleValue(sourceFo, 'color'),
      findScopedStyleRuleValue(target, 'color'),
      findScopedStyleRuleValue(sourceFo, 'color')
    );
    var fill = firstUsableStyleValue(
      explicitColor,
      computed ? computed.color : '',
      readStyleValue(target, 'color'),
      readStyleValue(sourceFo, 'color')
    ) || '#333';

    return {
      fontSize: fontSize,
      fontFamily: (computed && computed.fontFamily) || readInlineStyleValue(target, 'font-family') || 'sans-serif',
      fontWeight: (computed && computed.fontWeight) || readInlineStyleValue(target, 'font-weight') || '',
      fontStyle: (computed && computed.fontStyle) || readInlineStyleValue(target, 'font-style') || '',
      lineHeight: lineHeight,
      fill: fill,
      backgroundColor: firstUsableStyleValue(
        readStyleValue(target, 'background-color'),
        computed ? computed.backgroundColor : ''
      )
    };
  }

  function isInteractiveExportArtifact(el) {
    if (!el || !el.getAttribute) return false;
    var id = el.getAttribute('id') || '';
    var cls = el.getAttribute('class') || '';
    return id === 'edge-ghost-overlay' ||
      id === 'conn-port-overlay' ||
      id === 'sequence-drag-overlay' ||
      id === 'sequence-message-hit-overlay' ||
      id === 'sequence-note-insert-overlay' ||
      id === 'sequence-block-overlay' ||
      id === 'sequence-block-insert-overlay' ||
      id === 'flowchart-sel-highlight' ||
      /\b(edge-label-hit|subgraph-title-hit|sequence-hit-rect|sequence-lifeline-hit|sequence-plus-hit|flowchart-sel-highlight)\b/.test(cls);
  }

  function isInsideInteractiveExportArtifact(el, rootEl) {
    var node = el;
    while (node && node !== rootEl) {
      if (isInteractiveExportArtifact(node)) return true;
      node = node.parentNode;
    }
    return false;
  }

  function collectRenderableSourceElements(sourceSvgEl) {
    var out = [];
    if (!sourceSvgEl || !sourceSvgEl.querySelectorAll) return out;
    var all = sourceSvgEl.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (isInsideInteractiveExportArtifact(all[i], sourceSvgEl)) continue;
      out.push(all[i]);
    }
    return out;
  }

  function removeInteractiveExportArtifacts(svgEl) {
    if (!svgEl || !svgEl.querySelectorAll) return;
    var all = svgEl.querySelectorAll('*');
    for (var i = all.length - 1; i >= 0; i--) {
      if (isInteractiveExportArtifact(all[i]) && all[i].parentNode) {
        all[i].parentNode.removeChild(all[i]);
      }
    }
  }

  function stripRootPreviewStyles(svgEl) {
    if (!svgEl || !svgEl.style) return;
    var props = [
      'position',
      'top',
      'left',
      'max-width',
      'max-height',
      'transform',
      'transform-origin',
      'backface-visibility',
      '-webkit-font-smoothing',
      'display',
      'overflow'
    ];
    for (var i = 0; i < props.length; i++) {
      svgEl.style.removeProperty(props[i]);
    }
    if (!svgEl.getAttribute('style')) {
      svgEl.removeAttribute('style');
    }
  }

  function isRenderableSvgTag(tag) {
    return /^(path|rect|circle|ellipse|line|polyline|polygon|text|tspan|marker|use)$/i.test(tag);
  }

  function copyComputedStyleValue(sourceEl, targetEl, computed, name, attrName) {
    if (!sourceEl || !targetEl || !computed) return;
    var value = computed.getPropertyValue(name);
    if (!value) return;
    value = value.trim();
    if (!value || value === 'auto' || value === 'normal') return;
    targetEl.setAttribute(attrName || name, value);
  }

  function inlineComputedStyles(docSvgEl, sourceSvgEl) {
    if (!docSvgEl || !sourceSvgEl || typeof window === 'undefined' || !window.getComputedStyle) return;

    var sourceEls = collectRenderableSourceElements(sourceSvgEl);
    var targetEls = docSvgEl.querySelectorAll('*');
    var count = Math.min(sourceEls.length, targetEls.length);

    for (var i = 0; i < count; i++) {
      var sourceEl = sourceEls[i];
      var targetEl = targetEls[i];
      if (!sourceEl || !targetEl || isInteractiveExportArtifact(sourceEl)) continue;

      var tag = String(targetEl.tagName || '').toLowerCase();
      if (!isRenderableSvgTag(tag)) continue;

      var computed = null;
      try { computed = window.getComputedStyle(sourceEl); } catch (e) {}
      if (!computed) continue;

      copyComputedStyleValue(sourceEl, targetEl, computed, 'fill');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke-width');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke-dasharray');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke-linecap');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke-linejoin');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'fill-opacity');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'stroke-opacity');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'opacity');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'font-size');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'font-family');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'font-weight');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'font-style');
      copyComputedStyleValue(sourceEl, targetEl, computed, 'color');
    }
  }

  function applyTextPaint(el, color) {
    color = cleanStyleValue(firstUsableStyleValue(color) || '#333');
    el.setAttribute('fill', color);
    el.setAttribute('color', color);
    if (el.style && el.style.setProperty) {
      el.style.setProperty('fill', color, 'important');
      el.style.setProperty('color', color, 'important');
    } else {
      el.setAttribute('style', 'fill:' + color + ' !important;color:' + color + ' !important;');
    }
  }

  function replaceForeignObjects(doc, svgEl, sourceSvgEl) {
    var fos = svgEl.querySelectorAll('foreignObject');
    var sourceFos = sourceSvgEl && sourceSvgEl.querySelectorAll
      ? sourceSvgEl.querySelectorAll('foreignObject')
      : [];
    for (var i = 0; i < fos.length; i++) {
      var fo = fos[i];
      var sourceFo = sourceFos[i] || null;
      var fx = parseFloat(fo.getAttribute('x') || 0);
      var fy = parseFloat(fo.getAttribute('y') || 0);
      var fw = parseFloat(fo.getAttribute('width') || 100);
      var fh = parseFloat(fo.getAttribute('height') || 20);
      var textStyle = readForeignObjectTextStyle(sourceFo || fo);
      var fontSize = textStyle.fontSize;
      var fontFamily = textStyle.fontFamily;
      var lineHeight = textStyle.lineHeight;
      var lines = normalizeTextLines(getForeignObjectText(fo, sourceFo));
      if (!lines.length) lines = [''];

      var textEl = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', fx + fw / 2);
      textEl.setAttribute('y', fy + fh / 2);
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', String(fontSize));
      textEl.setAttribute('font-family', fontFamily);
      applyTextPaint(textEl, textStyle.fill);
      if (textStyle.fontWeight && textStyle.fontWeight !== '400' && textStyle.fontWeight !== 'normal') {
        textEl.setAttribute('font-weight', textStyle.fontWeight);
      }
      if (textStyle.fontStyle && textStyle.fontStyle !== 'normal') {
        textEl.setAttribute('font-style', textStyle.fontStyle);
      }

      if (lines.length <= 1) {
        textEl.textContent = lines[0] || '';
      } else {
        var startDy = -(lines.length - 1) / 2 * lineHeight;
        for (var li = 0; li < lines.length; li++) {
          var tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', fx + fw / 2);
          tspan.setAttribute('dy', li === 0 ? startDy : lineHeight);
          applyTextPaint(tspan, textStyle.fill);
          tspan.textContent = lines[li];
          textEl.appendChild(tspan);
        }
      }

      if (fo.parentNode) {
        if (textStyle.backgroundColor && lines.join('').trim()) {
          var groupEl = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
          var backgroundEl = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
          backgroundEl.setAttribute('x', fx);
          backgroundEl.setAttribute('y', fy);
          backgroundEl.setAttribute('width', fw);
          backgroundEl.setAttribute('height', fh);
          backgroundEl.setAttribute('fill', textStyle.backgroundColor);
          groupEl.appendChild(backgroundEl);
          groupEl.appendChild(textEl);
          fo.parentNode.replaceChild(groupEl, fo);
        } else {
          fo.parentNode.replaceChild(textEl, fo);
        }
      }
    }
  }

  function serializeForRaster(svgSource, options) {
    options = options || {};
    var pad = options.padding !== undefined ? options.padding : 20;
    var svgStr = getSvgString(svgSource);
    if (!svgStr) throw new Error('SVG source is empty');
    var sourceSvgEl = getSourceSvgElement(svgSource, options);

    var parser = new DOMParser();
    var doc = parser.parseFromString(svgStr, 'image/svg+xml');
    var svgEl = doc.querySelector('svg');
    if (!svgEl) throw new Error('SVG element not found');

    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    removeInteractiveExportArtifacts(svgEl);
    stripRootPreviewStyles(svgEl);
    inlineComputedStyles(svgEl, sourceSvgEl);
    replaceForeignObjects(doc, svgEl, sourceSvgEl);

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

  function serializeForSvg(svgSource, options) {
    options = options || {};
    var svgStr = getSvgString(svgSource);
    if (!svgStr) throw new Error('SVG source is empty');
    var sourceSvgEl = getSourceSvgElement(svgSource, options);

    var parser = new DOMParser();
    var doc = parser.parseFromString(svgStr, 'image/svg+xml');
    var svgEl = doc.querySelector('svg');
    if (!svgEl) throw new Error('SVG element not found');

    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    removeInteractiveExportArtifacts(svgEl);
    stripRootPreviewStyles(svgEl);
    inlineComputedStyles(svgEl, sourceSvgEl);
    replaceForeignObjects(doc, svgEl, sourceSvgEl);

    return new XMLSerializer().serializeToString(svgEl);
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
    var svgStr = '';
    try {
      svgStr = serializeForSvg(svgSource, options);
    } catch (e) {
      return Promise.reject(e);
    }
    if (!svgStr) return Promise.reject(new Error('SVG source is empty'));
    downloadBlob(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }), filename);
    return Promise.resolve();
  }

  // SVG 소스를 래스터화해 Blob으로 resolve한다. 파일 다운로드 없이 Blob을
  // 직접 사용해야 하는 경우(서버 업로드 등)를 위한 export PNG의 핵심 경로.
  function rasterizeToBlob(svgSource, options) {
    options = options || {};
    var format = options.format || 'png';
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
          resolve(rasterBlob);
        }, mime, mime === 'image/jpeg' ? quality : undefined);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG as image'));
      };
      img.src = url;
    });
  }

  function exportRaster(svgSource, options) {
    options = options || {};
    var format = options.format || 'png';
    var filename = options.filename || ('diagram.' + format);
    return rasterizeToBlob(svgSource, options).then(function (rasterBlob) {
      downloadBlob(rasterBlob, filename);
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
    },
    toPngBlob: function (svgSource, options) {
      options = Object.assign({}, options, { format: 'png' });
      return rasterizeToBlob(svgSource, options);
    },
    toJpgBlob: function (svgSource, options) {
      options = Object.assign({}, options, { format: 'jpg' });
      return rasterizeToBlob(svgSource, options);
    }
  };
})(typeof window !== 'undefined' ? window : this);
