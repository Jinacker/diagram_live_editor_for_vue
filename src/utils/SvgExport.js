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
