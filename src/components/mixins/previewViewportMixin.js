/**
 * previewViewportMixin
 * MermaidPreview의 viewport, pan, zoom, visibility 보조 메서드를 동작 변경 없이 분리한 mixin.
 */
(function (global) {
  'use strict';

  global.previewViewportMixin = {
    methods: {
    scheduleFit: function () {
      this._fitAfterRender = true;
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
        if (self._shouldLetEditTextScroll(e.target)) return;
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

    _shouldLetEditTextScroll: function (target) {
      if (!this.isStaticDiagram()) return false;
      if (!target || !target.closest) return false;
      var overlay = target.closest('.node-edit-overlay');
      if (!overlay) return false;
      var editor = target.closest('textarea') || (overlay.querySelector && overlay.querySelector('textarea'));
      return !!(editor && editor.scrollHeight > editor.clientHeight);
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

    _allPositionsZero: function (positions) {
      var ids = Object.keys(positions);
      if (!ids.length) return false;
      for (var i = 0; i < ids.length; i++) {
        if (positions[ids[i]].width > 0) return false;
      }
      return true;
    },

    _scheduleRerenderWhenVisible: function () {
      if (this._visibilityObserver) return;
      var self = this;
      var el = this.$el;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      this._visibilityObserver = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          self._visibilityObserver.disconnect();
          self._visibilityObserver = null;
          self.scheduleFit();
          self.renderDiagram();
        }
      }, { threshold: 0 });
      this._visibilityObserver.observe(el);
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
    }
  };

})(typeof window !== 'undefined' ? window : this);
