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
        var svgEl = this.getSvgElement();
        var svgSource = svgEl || this.getSvgText();
        if (!svgSource) return;
        return this._runExport(
          SvgExport.exportSvg(svgSource, { filename: 'diagram.svg', sourceElement: svgEl }),
          'SVG exported!'
        );
      },

      exportPng: function () {
        var svgEl = this.getSvgElement();
        var svgSource = svgEl || this.getSvgText();
        if (!svgSource) return;
        return this._runExport(
          SvgExport.exportPng(svgSource, { filename: 'diagram.png', scale: 2, padding: 20, sourceElement: svgEl }),
          'PNG exported!'
        );
      },

      exportJpg: function () {
        var svgEl = this.getSvgElement();
        var svgSource = svgEl || this.getSvgText();
        if (!svgSource) return;
        return this._runExport(
          SvgExport.exportJpg(svgSource, { filename: 'diagram.jpg', scale: 2, padding: 20, quality: 0.92, sourceElement: svgEl }),
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
