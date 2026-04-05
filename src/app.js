/**
 * 앱 진입점
 * Vue 2 애플리케이션을 초기화하고 MermaidLiveEditor를 마운트한다.
 */

(function () {
  'use strict';

  // Mermaid는 startOnLoad를 끄고, 항상 preview 컴포넌트가 수동 render를 호출한다.
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        padding: 15,
        nodeSpacing: 50,
        rankSpacing: 50,
        useMaxWidth: false
      },
      sequence: {
        useMaxWidth: false,
        diagramMarginY: 40,
        actorMargin: 80,
        messageMargin: 48
      },
      themeVariables: {
        darkMode: true,
        background: '#1c1f2e',
        primaryColor: '#6366f1',
        primaryTextColor: '#e4e6f0',
        primaryBorderColor: '#818cf8',
        secondaryColor: '#232738',
        tertiaryColor: '#2a2f45',
        lineColor: '#818cf8',
        textColor: '#e4e6f0',
        mainBkg: '#232738',
        nodeBorder: '#818cf8',
        clusterBkg: '#1c1f2e',
        clusterBorder: '#5c6380',
        titleColor: '#e4e6f0',
        edgeLabelBackground: '#232738',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px'
      }
    });
  }

  // Vue 인스턴스 생성
  new Vue({
    el: '#app',
    template: '<mermaid-live-editor></mermaid-live-editor>'
  });

})();
