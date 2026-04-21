# SureFlow - GUI Editor

Vue 2 기반 화면에서 Mermaid 다이어그램을 GUI 방식으로 편집할 수 있도록 만든 에디터입니다.

지원 다이어그램:

- `flowchart`
- `sequenceDiagram`

호스트는 Mermaid 문자열 하나만 관리하면 되고, 이 프로젝트는 그 문자열을 텍스트 편집기와 SVG 기반 GUI 편집기로 동시에 다룰 수 있게 해줍니다.

## 빠른 요약

- 공개 배포 진입점은 `<mermaid-full-editor>` 하나입니다.
- 내부적으로는 `script -> model -> svg -> interaction -> model -> script` 흐름으로 동작합니다.
- 2026-04-21 책임 분리 리팩터 이후 공통 액션은 mixin, 순수 규칙은 utils 레이어로 정리되었습니다.

## 공개 컴포넌트와 내부 컴포넌트

### 공개 컴포넌트

- `mermaid-full-editor`
  - `dist/gui-editor.component.js`가 전역 등록하는 유일한 공개 컴포넌트입니다.
  - 호스트와는 `:value` / `@input`으로 Mermaid 문자열을 주고받습니다.

### 내부 컴포넌트

- `mermaid-live-editor`
  - 로컬 개발/실험용 전체 편집기입니다.
  - autosave, editor pane resize 같은 내부 편의 기능을 포함합니다.
  - 현재 `build.js` 배포 번들에는 포함되지 않습니다.

## 데이터 흐름

핵심 흐름은 아래 한 줄입니다.

```text
script -> model -> svg -> interaction -> model -> script
```

각 단계의 의미:

- `script`
  - 최종적으로 저장되거나 호스트로 전달되는 Mermaid 문자열
- `model`
  - GUI 편집을 위해 파싱된 내부 구조 데이터
- `svg`
  - Mermaid가 렌더한 결과
- `interaction`
  - 클릭, 더블클릭, 드래그, 인라인 편집 같은 사용자 조작

즉 텍스트 편집과 GUI 편집은 별개 시스템이 아니라, 같은 `model`을 공유하는 두 가지 편집 방식입니다.

## 현재 소스 구조

```text
gui-editor/
├─ src/
│  ├─ components/
│  │  ├─ MermaidEditor.js
│  │  ├─ MermaidToolbar.js
│  │  ├─ MermaidPreview.js
│  │  ├─ MermaidLiveEditor.js
│  │  ├─ MermaidFullEditor.js
│  │  └─ mixins/
│  │     ├─ flowchartActionsMixin.js
│  │     ├─ sequenceActionsMixin.js
│  │     ├─ exportMixin.js
│  │     └─ toastMixin.js
│  ├─ actions/
│  │  ├─ SvgPositionTracker.js
│  │  ├─ SvgNodeHandler.js
│  │  ├─ SvgEdgeHandler.js
│  │  ├─ PortDragHandler.js
│  │  ├─ SequencePositionTracker.js
│  │  ├─ SequenceMessageDragHandler.js
│  │  └─ SequenceSvgHandler.js
│  ├─ utils/
│  │  ├─ SequenceMessageCodec.js
│  │  ├─ FlowEdgeCodec.js
│  │  ├─ HistoryManager.js
│  │  ├─ StorageManager.js
│  │  ├─ SvgExport.js
│  │  ├─ IdAllocator.js
│  │  ├─ ModelDiagnostics.js
│  │  └─ PreviewCtxBuilder.js
│  ├─ mermaid-parser.js
│  ├─ mermaid-generator.js
│  ├─ sequence-parser.js
│  └─ sequence-generator.js
├─ dist/
├─ docs/
├─ build.js
├─ index.html
├─ GuiEditor.css
└─ style.css
```

## 레이어별 책임

### `src/components`

화면 구성과 상위 상태 연결을 담당합니다.

- `MermaidEditor.js`
  - 텍스트 편집 UI
- `MermaidToolbar.js`
  - 다이어그램 타입별 액션 버튼 UI
- `MermaidPreview.js`
  - Mermaid SVG 렌더링, zoom/pan, selection, inline 편집 브리지
- `MermaidFullEditor.js`
  - 임베드용 올인원 컨테이너
- `MermaidLiveEditor.js`
  - 내부 개발용 상태 컨테이너

### `src/components/mixins`

LiveEditor와 FullEditor가 공유하는 행동을 담당합니다.

- `flowchartActionsMixin.js`
  - flowchart 편집 액션 공통화
- `sequenceActionsMixin.js`
  - sequence 편집 액션 공통화
- `exportMixin.js`
  - SVG/PNG/JPG export, copy SVG wrapper
- `toastMixin.js`
  - export 결과 알림 토스트 상태

### `src/actions`

렌더된 SVG 위의 상호작용을 담당합니다.

- `SvgPositionTracker.js`
  - flowchart SVG 좌표 추적
- `SvgNodeHandler.js`
  - flowchart 노드 선택/편집/context menu
- `SvgEdgeHandler.js`
  - flowchart 엣지 선택/편집/hit area
- `PortDragHandler.js`
  - flowchart 포트 드래그로 새 엣지 생성
- `SequencePositionTracker.js`
  - sequence participant/message 위치 추적
- `SequenceMessageDragHandler.js`
  - sequence lifeline drag insert
- `SequenceSvgHandler.js`
  - sequence 선택/편집/line type 처리

### `src/utils`

순수 규칙, 공통 유틸, 상태 보조 기능을 담당합니다.

- `SequenceMessageCodec.js`
  - sequence 메시지 표현식 처리
  - activation 균형 정규화 포함
- `FlowEdgeCodec.js`
  - flowchart 엣지 타입/라인 표현 공통 처리
- `HistoryManager.js`
  - `model` 스냅샷 기반 undo/redo
- `StorageManager.js`
  - localStorage 기반 autosave/restore
- `SvgExport.js`
  - SVG/PNG/JPG 내보내기 구현
- `IdAllocator.js`
  - node / participant ID 충돌 없는 생성
- `ModelDiagnostics.js`
  - reserved ID 경고 계산
- `PreviewCtxBuilder.js`
  - preview handler가 사용하는 ctx 구성

### parser / generator

문자열과 내부 모델을 서로 변환합니다.

- flowchart
  - parse: `mermaid-parser.js`
  - generate: `mermaid-generator.js`
- sequence
  - parse: `sequence-parser.js`
  - generate: `sequence-generator.js`

## 리팩터 이후 구조 포인트

2026-04-21 책임 분리 리팩터에서 아래가 바뀌었습니다.

- sequence activation 정규화가 `SequenceMessageCodec`로 이동
- ID 생성 로직이 `IdAllocator`로 이동
- reserved ID 경고 계산이 `ModelDiagnostics`로 이동
- preview 내부 ctx 조립이 `PreviewCtxBuilder`로 이동
- LiveEditor / FullEditor 공통 액션과 export/toast가 mixin으로 통합

이 리팩터로 공통 액션은 mixin, 순수 규칙은 service 중심으로 재배치됐다.

## 왜 `model` 중심 구조를 쓰는가

문자열을 직접 부분 치환하는 대신 내부 `model`을 편집하면 아래 작업을 안정적으로 처리할 수 있습니다.

- 노드 추가/삭제
- 엣지 연결과 라벨 변경
- participant/message 조작
- sequence message reverse
- line type 변경
- undo/redo

즉 GUI 조작은 항상 문자열 편집이 아니라 구조 데이터 수정으로 처리되고, 마지막에 generator가 Mermaid 문자열을 다시 만듭니다.

## 빌드

```bash
node build.js
```

출력:

- `dist/gui-editor.component.js`
- `dist/GuiEditor.css`

`build.js`는 의존 순서를 보장하기 위해 아래 순서로 번들을 조립합니다.

1. utils
2. parser / generator
3. actions
4. mixins
5. components

최종 번들은 `<mermaid-full-editor>`를 전역 등록합니다.

## 임베드 방법

이 프로젝트는 Vue 2 전역 컴포넌트 방식으로 임베드합니다.

### 준비 사항

- `Vue 2`
- `Mermaid`
- `dist/gui-editor.component.js`
- `dist/GuiEditor.css`

권장 로드 순서:

1. `Vue 2`
2. `Mermaid`
3. `GuiEditor.css`
4. `gui-editor.component.js`
5. 호스트 Vue 코드

예시:

```html
<link rel="stylesheet" href="/path/to/GuiEditor.css">

<script src="/path/to/vue.min.js"></script>
<script src="/path/to/mermaid.min.js"></script>
<script>
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose'
  });
</script>
<script src="/path/to/gui-editor.component.js"></script>
```

### 가장 기본적인 사용

```html
<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
></mermaid-full-editor>
```

예시:

```html
<div id="app">
  <div style="height: 700px;">
    <mermaid-full-editor
      :value="diagram"
      @input="diagram = $event"
    ></mermaid-full-editor>
  </div>
</div>

<script>
  new Vue({
    el: '#app',
    data: {
      diagram: [
        'flowchart TD',
        '    A[Start] --> B{Decision}',
        '    B -->|Yes| C[Process A]',
        '    B -->|No| D[Process B]',
        '    C --> E[End]',
        '    D --> E'
      ].join('\n')
    }
  });
</script>
```

### 기존 textarea와 함께 사용

```html
<textarea v-model="diagram"></textarea>

<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
></mermaid-full-editor>
```

### 기존 preview/save 로직이 있는 경우

호스트가 기존 preview DOM에서 SVG를 읽고 있다면, GUI editor가 렌더한 SVG를 호스트 DOM에도 동기화하면 됩니다.

```html
<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
  @svg-rendered="$refs.preview.innerHTML = $event"
></mermaid-full-editor>
```

## 개발 메모

- `index.html`은 로컬 확인용 예제 페이지입니다.
- `MermaidLiveEditor`는 내부 개발용이며 배포 진입점이 아닙니다.
- 현재 가장 큰 파일은 여전히 `MermaidPreview.js`이며, 다음 단계 책임 분리 후보입니다.

## 관련 문서

- [docs/sequence-diagram-notes.md](docs/sequence-diagram-notes.md)
- [docs/2026-04-15-flowedge-sequence-codec-refactor.md](docs/2026-04-15-flowedge-sequence-codec-refactor.md)
