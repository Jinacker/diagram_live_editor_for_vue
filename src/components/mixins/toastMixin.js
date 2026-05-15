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
