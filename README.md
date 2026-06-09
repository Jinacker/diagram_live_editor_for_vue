# SureFlow - GUI Editor

이 프로젝트는 Vue 2 기반 화면에서 Mermaid 다이어그램을 GUI 방식으로 편집할 수 있도록 만든 에디터입니다.

현재 아래 두 가지 다이어그램을 지원합니다.

- `flowchart`
- `sequenceDiagram`

호스트 프로젝트는 Mermaid 문자열 하나만 관리하시면 되고, 이 에디터는 그 문자열을 시각적으로 편집하는 UI로 동작합니다.

## 폴더 구조

```text
gui-editor/
├─ src/
│  ├─ components/      # 에디터, 툴바, 프리뷰 컴포넌트
│  │  └─ mixins/       # 공통 액션 wrapper와 Preview 세부 책임 mixin
│  ├─ actions/         # SVG 상호작용 처리 로직
│  ├─ representation/  # Mermaid script <-> model 변환
│  ├─ model-editing/   # 순수 model 수정 로직
│  ├─ utils/           # codec, export, history, diagnostics, ctx builder
│  └─ assets/          # 정적 SVG 아이콘 (zoom-to-fit, fullscreen 등)
├─ dist/               # 배포용 번들 결과물
├─ docs/               # 설계/임베드/기능 문서
├─ build.js            # 번들 빌드 스크립트
├─ index.html          # 로컬 확인용 예제 페이지
└─ GuiEditor.css       # 에디터 스타일
```

<details>
  <summary><strong>원리 및 구조</strong></summary>

## 원리 및 구조

이 프로젝트는 텍스트 편집기와 GUI 편집기를 서로 다른 시스템으로 분리하지 않고, 같은 Mermaid 문자열을 여러 방식으로 편집하는 구조로 설계했습니다.

즉 사용자는 텍스트를 직접 수정하실 수도 있고, SVG preview 위에서 노드나 엣지, 메시지를 시각적으로 수정하실 수도 있습니다. 하지만 내부적으로는 항상 같은 데이터 흐름 위에서 동작합니다.

## 핵심 데이터 흐름

핵심 흐름은 아래 한 줄로 요약할 수 있습니다.

```text
script -> model -> svg -> interaction -> model -> script
```

각 단계의 의미는 아래와 같습니다.

- `script`
  - 사용자가 최종적으로 저장하거나 외부 시스템에 전달하는 Mermaid 문자열입니다.
- `model`
  - GUI 편집을 위해 문자열을 구조화한 내부 데이터입니다.
- `svg`
  - Mermaid가 실제로 렌더링한 결과물입니다.
- `interaction`
  - SVG 위에서 발생하는 클릭, 드래그, 더블클릭, 인라인 편집 같은 사용자 조작입니다.

이 구조 덕분에 텍스트 편집과 GUI 편집이 서로 따로 노는 것이 아니라, 하나의 상태를 공유하는 두 가지 편집 방식으로 동작합니다.

## 실제 동작 순서

실제 편집 흐름은 아래 순서로 이어집니다.

1. 호스트가 Mermaid 문자열을 `value`로 내려줍니다.
2. `mermaid-full-editor`가 그 문자열을 내부 `script` 상태로 받습니다.
3. parser가 `script`를 내부 `model`로 변환합니다.
4. preview가 `model`을 기준으로 Mermaid SVG를 렌더링합니다.
5. 사용자가 SVG 위에서 노드, 엣지, participant, message 등을 수정합니다.
6. 수정 결과는 다시 `model`에 반영됩니다.
7. generator가 최신 `model`을 다시 Mermaid 문자열로 직렬화합니다.
8. 그 문자열을 `@input` 이벤트로 호스트에 돌려줍니다.

즉 텍스트에서 시작해도 결국 `model`을 거치고, GUI에서 시작해도 결국 다시 `script`로 돌아옵니다.

## 텍스트 편집에서 프리뷰까지의 흐름

사용자가 텍스트 편집기에서 Mermaid 코드를 수정하시면 아래 순서로 동작합니다.

1. `MermaidEditor`가 변경된 문자열을 상위로 전달합니다.
2. 상위 컨테이너가 `script`를 갱신합니다.
3. parser가 `script`를 읽어 `model`을 새로 만듭니다.
4. `MermaidPreview`가 `model` 변경을 감지합니다.
5. `window.mermaid.render(...)`를 호출해서 SVG를 다시 생성합니다.
6. 렌더가 끝나면 SVG 위에 필요한 interaction layer를 다시 붙입니다.

이 경로는 "텍스트를 바꾸면 그림이 바뀌는" 가장 기본적인 흐름입니다.

## GUI 편집에서 문자열까지의 흐름

사용자가 프리뷰 위에서 직접 조작하시면 반대 방향의 흐름이 동작합니다.

1. 사용자가 노드 클릭, 엣지 더블클릭, 포트 드래그, 메시지 추가 같은 액션을 수행합니다.
2. 각 액션 핸들러가 해당 조작을 `model` 변경 이벤트로 변환합니다.
3. 상위 컨테이너가 `model`을 갱신합니다.
4. generator가 최신 `model`을 Mermaid 문자열로 다시 생성합니다.
5. 문자열이 갱신되면 editor와 preview도 함께 최신 상태로 맞춰집니다.

즉 프리뷰를 직접 편집하더라도 최종 결과는 항상 Mermaid 문자열로 다시 정리됩니다.

## 왜 `model`이 중요한가

이 프로젝트가 안정적으로 동작하는 이유는 문자열을 직접 덕지덕지 수정하지 않고, 내부적으로는 `model`을 중심으로 편집하기 때문입니다.

예를 들어:

- flowchart에서는 노드와 엣지를 `nodes`, `edges` 배열로 관리합니다.
- sequence diagram에서는 `participants`, `messages`, `statements` 구조로 관리합니다.

이렇게 구조화된 상태를 기준으로 작업하면:

- 노드 추가/삭제
- 엣지 연결
- 라벨 편집
- participant/message 조작
- block / branch / note 편집
- undo/redo

같은 기능을 문자열 치환보다 훨씬 안정적으로 처리할 수 있습니다.

## 현재 구조가 이렇게 나뉜 이유

이번 구조는 단순히 파일을 보기 좋게 나눈 것이 아니라, 편집 책임을 서로 다른 계층으로 분리하기 위해 정리된 결과입니다.

- 순수 규칙과 공통 보조 로직은 `src/utils`로 분리
- script / model 변환은 `src/representation`으로 분리
- 순수 model 수정은 `src/model-editing`으로 분리
- LiveEditor / FullEditor 공통 액션 wrapper는 `src/components/mixins`로 유지
- preview handler가 쓰는 ctx 조립은 `PreviewCtxBuilder`로 분리
- 공개 임베드용 컴포넌트와 내부 개발용 컴포넌트의 역할을 분리

즉 지금 구조는 "컴포넌트 안에 다 넣는 방식"에서 한 단계 더 나아가, 각 책임을 밖으로 빼서 유지보수 부담을 줄이도록 정리된 상태입니다.

## 폴더별 책임

### `src/components`

화면 구성과 상위 상태 연결을 담당합니다.

- `MermaidFullEditor.js`
  - 호스트가 직접 임베드하는 메인 컴포넌트입니다.
  - `:value` / `@input` 계약의 중심입니다.
  - 현재 공개 배포 진입점도 이 컴포넌트입니다.
- `MermaidLiveEditor.js`
  - 내부 개발용 편집기입니다.
  - autosave, editor pane resize 같은 편의 기능을 포함합니다.
- `MermaidEditor.js`
  - 텍스트 편집 영역을 담당합니다.
- `MermaidPreview.js`
  - Mermaid SVG 렌더와 렌더 후 interaction handler 연결을 조율합니다.
  - 인라인 편집, 툴바, viewport, subgraph/rubber-band 세부 로직은 preview mixin으로 분리되어 있습니다.
- `MermaidToolbar.js`
  - 노드 추가, 메시지 추가, 방향 전환 같은 액션 UI를 담당합니다.
- `src/components/mixins`
  - LiveEditor / FullEditor가 공유하는 액션과 export, toast 로직을 담당합니다.
  - MermaidPreview의 세부 책임을 나눈 preview mixin도 이 위치에 있습니다.
  - 여기서 flowchart/sequence mixin은 실제 model 수정 로직을 직접 들고 있기보다, `model-editing` 계층을 호출하는 adapter 역할에 가깝습니다.

### `src/components/mixins`

이 폴더는 editor 두 개가 공통으로 써야 하는 행동을 따로 분리한 위치입니다.

- `flowchartActionsMixin.js`
  - flowchart 편집 액션 wrapper를 담당합니다.
- `sequenceActionsMixin.js`
  - sequence 편집 액션 wrapper를 담당합니다.
- `exportMixin.js`
  - export / copy 관련 wrapper를 담당합니다.
- `toastMixin.js`
  - toast 상태와 표시를 담당합니다.
- `previewInlineEditMixin.js`
  - node, edge, sequence participant/message/block/note, subgraph title 인라인 편집을 담당합니다.
- `previewToolbarMixin.js`
  - flowchart edge toolbar와 sequence toolbar 액션을 담당합니다.
- `previewViewportMixin.js`
  - fit view, zoom, pan, transform, visibility 재렌더 보조를 담당합니다.
- `previewSubgraphMixin.js`
  - subgraph title toolbar와 rubber-band 다중 선택을 담당합니다.

이 구조 덕분에 `MermaidLiveEditor.js`와 `MermaidFullEditor.js`가 같은 액션 코드를 따로 들고 있을 필요가 없어졌습니다.
또한 `MermaidPreview.js`는 렌더링과 post-render 조율 중심으로 남고, 실제 편집 UI 세부 동작은 mixin 단위로 찾아볼 수 있습니다.

### `src/actions`

SVG 위 상호작용을 세부 동작 단위로 분리한 계층입니다.

- `SvgNodeHandler.js`
  - flowchart 노드 클릭, 더블클릭, context menu를 담당합니다.
- `SvgEdgeHandler.js`
  - flowchart 엣지 선택, 라벨 편집, ghost hit area를 담당합니다.
- `PortDragHandler.js`
  - 포트 드래그로 새 엣지를 연결하는 동작을 담당합니다.
- `SvgPositionTracker.js`
  - Mermaid가 렌더한 SVG에서 노드와 엣지의 실제 위치를 추적합니다.
- `SequenceSvgHandler.js`
  - sequence diagram의 participant/message 상호작용을 담당합니다.
- `SequencePositionTracker.js`
  - sequence diagram SVG의 참여자, 메시지 위치를 추적합니다.
- `SequenceMessageDragHandler.js`
  - lifeline 기반 메시지 추가 드래그 UI를 담당합니다.
- `SequenceBlockHandler.js`
  - block / branch badge와 selection interaction을 담당합니다.

즉 `src/actions`는 "실제 SVG를 어떻게 만지고 반응할 것인가"를 분리한 층입니다.

### `src/representation`

Mermaid 문자열과 내부 model 사이의 변환을 담당합니다.

- `mermaid-parser.js`
  - flowchart / 공통 Mermaid 문자열을 `model`로 변환합니다.
- `mermaid-generator.js`
  - flowchart 중심 Mermaid 문자열 생성기를 담당합니다.
- `sequence-parser.js`
  - sequenceDiagram 문자열을 `model`로 변환합니다.
- `sequence-generator.js`
  - sequenceDiagram용 Mermaid 문자열 생성기를 담당합니다.

즉 `src/representation`은 `script <-> model` 변환 계층입니다.

### `src/model-editing`

순수 model 수정 로직을 담당합니다.

- `flowchartModelEditing.js`
  - flowchart model add / update / delete를 담당합니다.
- `sequenceModelEditing.js`
  - sequence model add / update / delete / reverse / wrap 등을 담당합니다.

이 계층은:

- Vue를 모르고
- snapshot을 모르고
- emit을 모르고
- 문자열 재생성도 하지 않고

오직 `model`을 받아 `nextModel`을 반환하는 역할만 담당합니다.

### `src/utils`

에디터 전반에서 공통으로 쓰는 기능과 순수 규칙을 담당합니다.

- `HistoryManager.js`
  - `model` 스냅샷 기반 undo/redo를 담당합니다.
- `StorageManager.js`
  - localStorage 기반 autosave/restore를 담당합니다.
- `SvgExport.js`
  - SVG/PNG/JPG 다운로드 export와 PNG/JPG Blob 생성을 담당합니다.
- `FlowEdgeCodec.js`
  - flowchart edge type 인코딩/디코딩을 담당합니다.
- `SequenceMessageCodec.js`
  - sequence message line type과 activation 정규화를 담당합니다.
- `IdAllocator.js`
  - node / participant ID 충돌 없는 생성 규칙을 담당합니다.
- `ModelDiagnostics.js`
  - reserved ID 경고 계산을 담당합니다.
- `PreviewCtxBuilder.js`
  - preview interaction handler가 쓰는 ctx 객체 조립을 담당합니다.

즉 `src/utils`는 예전의 단순 service 레이어라기보다, 컴포넌트 밖으로 뺀 공통 정책과 보조 로직을 담는 계층입니다.

### `src/assets`

JS 번들에 포함되지 않는 정적 SVG 아이콘 파일을 모아두는 위치입니다.

- `icon-dv-zoom-to-fit.svg`
  - zoom-to-fit 버튼용 아이콘 (32×32)입니다.
- `trace-fullscreen.svg`
  - 전체화면 진입 버튼 아이콘 (24×24, 기본 상태)입니다.
- `trace-fullscreen-active.svg`
  - 전체화면 진입 버튼 아이콘 (24×24, 활성 상태 — 파란색 강조)입니다.

이 파일들은 빌드 번들에 포함되지 않으며, `<img src>` 또는 인라인 SVG로 직접 참조합니다.

## Architecture

프로젝트 구조는 크게 여섯 부분으로 나뉩니다.

### 1. `src/components`

화면 구성과 상위 상태를 담당합니다.

- `MermaidFullEditor.js`
  - 호스트와 연결되는 공개용 editor
- `MermaidLiveEditor.js`
  - 내부 개발/실험용 editor
- `MermaidEditor.js`
  - 텍스트 입력 UI
- `MermaidPreview.js`
  - preview 렌더와 사용자 상호작용 제어
- `MermaidToolbar.js`
  - 툴바 액션 UI

### 2. `src/components/mixins`

editor 두 개가 공통으로 쓰는 액션과 부가 기능, 그리고 Preview의 세부 책임 분리를 담당합니다.

- flowchart 액션 wrapper
- sequence 액션 wrapper
- export / copy
- toast
- preview inline edit
- preview toolbar
- preview viewport
- preview subgraph/rubber-band

### 3. `src/actions`

렌더된 SVG 위의 상호작용을 담당합니다.

- flowchart node/edge interaction
- port drag
- sequence selection/edit
- SVG position tracking

### 4. `src/representation`

Mermaid 문자열과 내부 model 사이의 변환을 담당합니다.

- parse
- generate

### 5. `src/model-editing`

순수 model 수정만 담당합니다.

- flowchart model editing
- sequence model editing

### 6. `src/utils`

편집 편의 기능과 도메인 규칙을 담당합니다.

- history
- storage
- export
- codec
- diagnostics
- id allocation
- preview ctx builder

즉 지금 구조는 `component -> action -> representation / model-editing / util`이 역할별로 읽히도록 정리된 상태에 가깝습니다.

## Parsing and Generation

이 프로젝트가 안정적으로 동작하는 이유는 문자열을 직접 부분 수정하지 않기 때문입니다.

### flowchart

- parse: `src/representation/mermaid-parser.js`
- generate: `src/representation/mermaid-generator.js`

### sequence

- parse: `src/representation/sequence-parser.js`
- generate: `src/representation/sequence-generator.js`

그리고 GUI 편집 시 실제 model 수정은 아래 계층이 담당합니다.

- `src/model-editing/flowchartModelEditing.js`
- `src/model-editing/sequenceModelEditing.js`

이 구조 덕분에 노드 추가, 엣지 삭제, 메시지 반전 같은 GUI 조작을 문자열 조작이 아니라 구조 데이터 수정으로 처리할 수 있습니다.

## 렌더와 상호작용이 분리된 이유

이 프로젝트는 SVG를 직접 그리는 방식이 아니라 Mermaid가 만든 SVG를 활용합니다.

즉:

1. Mermaid가 SVG를 렌더합니다.
2. 그 위에 interaction layer를 추가합니다.
3. 사용자 조작은 실제 SVG 좌표와 내부 `model`을 다시 연결하는 방식으로 처리합니다.

이 구조의 장점은 아래와 같습니다.

- Mermaid 자체 렌더링 품질을 그대로 활용할 수 있습니다.
- 에디터 로직과 렌더러 로직을 분리할 수 있습니다.
- flowchart와 sequenceDiagram을 같은 프레임 안에서 다룰 수 있습니다.

## 다이어그램 타입 분기

현재 프로젝트는 `flowchart`와 `sequenceDiagram`을 모두 지원합니다.

공통 프레임은 유지하되, parser/generator/action/model-editing 계층에서 타입별로 분기합니다.

### flowchart

- `src/representation/mermaid-parser.js`
- `src/representation/mermaid-generator.js`
- `src/model-editing/flowchartModelEditing.js`
- `SvgNodeHandler.js`
- `SvgEdgeHandler.js`
- `PortDragHandler.js`

### sequenceDiagram

- `src/representation/sequence-parser.js`
- `src/representation/sequence-generator.js`
- `src/model-editing/sequenceModelEditing.js`
- `SequenceSvgHandler.js`
- `SequencePositionTracker.js`
- `SequenceMessageDragHandler.js`
- `SequenceBlockHandler.js`

즉 겉으로는 같은 에디터처럼 보이지만, 내부적으로는 다이어그램 타입에 따라 적절한 파서, 제너레이터, model 수정 계층, 인터랙션 로직이 연결됩니다.

## 호스트 프로젝트 입장에서 이해하실 점

호스트 프로젝트가 내부 구조를 모두 이해하실 필요는 없습니다.
실제로는 아래 두 가지만 기억하셔도 충분합니다.

1. 이 에디터는 Mermaid 문자열 하나를 중심으로 동작합니다.
2. 호스트는 `mermaid-full-editor`에 `value`를 주고 `input`을 받으면 됩니다.

즉 내부 아키텍처는 꽤 깊지만, 호스트가 붙일 때의 계약은 단순하게 유지한 것이 이 프로젝트 구조의 중요한 장점입니다.

</details>

<details>
  <summary><strong>임베드 방법</strong></summary>

## 임베드 방법

이 프로젝트는 Vue 2 전역 컴포넌트 방식으로 임베드하실 수 있습니다.

## 1. 준비 사항

호스트 프로젝트에서 아래 항목이 필요합니다.

- `Vue 2`
- `Mermaid`
- `dist/gui-editor.component.js`
- `dist/GuiEditor.css`

권장 로드 순서는 아래와 같습니다.

1. `Vue 2`
2. `Mermaid`
3. `GuiEditor.css`
4. `gui-editor.component.js`
5. 호스트 Vue 코드

예시는 아래와 같습니다.

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

## 2. 가장 기본적인 임베드

가장 기본적인 사용 방법은 아래와 같습니다.

```html
<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
></mermaid-full-editor>
```

이 방식에서:

- `diagram`은 호스트가 관리하는 Mermaid 문자열입니다.
- `:value="diagram"`은 현재 문자열을 에디터에 내려주는 역할입니다.
- `@input="diagram = $event"`는 GUI 편집 결과를 다시 호스트 상태에 반영하는 역할입니다.

예시 전체 코드는 아래와 같습니다.

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

## 3. 기존 textarea는 유지하고 GUI만 붙이는 방법

호스트 프로젝트에 이미 Mermaid용 textarea, Monaco, CodeMirror 같은 텍스트 입력 UI가 있다면 그 입력 UI는 그대로 두고, GUI editor는 시각 편집 영역만 붙이는 방식을 권장합니다.

이때 핵심은 `diagram` 문자열 하나를 호스트가 계속 소유하는 것입니다.

```html
<div id="app">
  <!-- 기존 프로젝트의 Mermaid 입력 UI -->
  <textarea
    v-model="diagram"
    style="width: 100%; height: 200px;"
  ></textarea>

  <!-- GUI 편집 영역만 임베드 -->
  <div style="height: 600px;">
    <mermaid-full-editor
      ref="guiEditor"
      :value="diagram"
      :hide-editor="true"
      @input="diagram = $event"
    ></mermaid-full-editor>
  </div>
</div>
```

이 구성에서:

- textarea에서 코드를 수정하면 `diagram`이 바뀌고 GUI가 다시 렌더됩니다.
- GUI에서 노드/엣지/메시지를 편집하면 `@input`으로 새 Mermaid 문자열이 올라오고 textarea가 같이 갱신됩니다.
- `:hide-editor="true"` 때문에 GUI editor 내부의 텍스트 패널은 표시되지 않습니다.
- `ref="guiEditor"`를 달아두면 아래의 외부 호출 메서드/API를 호스트 코드에서 바로 사용할 수 있습니다.

즉 기존 프로젝트 입장에서는 textarea와 저장 로직을 크게 바꾸지 않고, GUI 편집 패널만 옆에 붙이는 형태가 됩니다.

## 4. 기존 preview/save 로직이 있는 경우

호스트 화면이 이미 preview DOM과 저장 로직을 가지고 있다면, 그 구조를 유지한 채 임베드하시는 편이 안전합니다.

예를 들어 호스트 저장 로직이 아래처럼 기존 preview DOM의 SVG를 읽고 있다면:

```js
const svgElement = this.$refs.preview.querySelector('svg');
```

preview DOM은 삭제하지 않으시고, GUI editor가 렌더한 최신 SVG를 그 DOM에도 동기화해주시면 됩니다.

```html
<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
  @svg-rendered="$refs.preview.innerHTML = $event"
></mermaid-full-editor>
```

이 `@svg-rendered`는 내부 preview가 렌더한 최신 SVG 문자열을 호스트에 전달해줍니다.

이 방식은 아래 경우에 특히 유용합니다.

- 기존 저장 로직을 크게 바꾸고 싶지 않을 때
- 기존 preview DOM을 그대로 재사용하고 싶을 때
- PNG export나 save 흐름이 이미 호스트 쪽에 있을 때

## 5. 모달 안에 넣을 때 주의할 점

모달 안에 임베드하실 때는 아래 항목을 같이 확인해주시면 좋습니다.

- 에디터 부모 컨테이너에 높이를 지정해주셔야 합니다.
- 모달을 닫을 때 탭 상태를 초기화하시는 편이 안전합니다.
- 기존 preview DOM이 저장 기준이라면 제거하지 말고 숨기기만 하시는 편이 좋습니다.
- 최초 오픈 시 Mermaid 문자열이 이미 있다면 초기에 한 번 렌더를 보장해주시는 것이 좋습니다.

## 6. 체크리스트

임베드 전에 아래 항목을 확인하시면 됩니다.

1. 호스트가 Mermaid 문자열 상태를 갖고 있는지 확인합니다.
2. Vue 2와 Mermaid가 먼저 로드되는지 확인합니다.
3. `GuiEditor.css`, `gui-editor.component.js`를 정적으로 서비스하는지 확인합니다.
4. `<mermaid-full-editor :value="diagram" @input="diagram = $event">`를 연결합니다.
5. 기존 preview/save 경로가 있으면 `@svg-rendered`가 필요한지 확인합니다.
6. 컨테이너 높이를 지정합니다.
7. 텍스트 에디터 없이 GUI만 보여줄 경우 `:hide-editor="true"`를 추가합니다.
8. 기존 textarea를 그대로 쓸 경우 `mermaid-full-editor`에는 `:hide-editor="true"`를 주고 같은 `diagram` 상태를 공유합니다.
9. 다운로드 없이 PNG/JPG만 필요하면 아래 `외부에서 호출 가능한 메서드/API` 토글의 `window.SvgExport.toPngBlob()` 또는 `toJpgBlob()` 예시를 참고합니다.

</details>

<details>
  <summary><strong>외부에서 호출 가능한 메서드/API</strong></summary>

## 외부에서 호출 가능한 메서드/API

호스트 코드에서 GUI editor를 제어하거나 렌더된 결과물을 가져오려면 컴포넌트에 `ref`를 달아두면 됩니다.

```html
<mermaid-full-editor
  ref="guiEditor"
  :value="diagram"
  @input="diagram = $event"
></mermaid-full-editor>
```

```js
const editor = this.$refs.guiEditor;
```

## 1. `mermaid-full-editor` ref 메서드

아래 메서드는 호스트에서 바로 호출하기 좋은 외부 연동 지점입니다.

| 메서드 | 설명 |
|---|---|
| `getSvgElement()` | 현재 preview에 렌더된 `svg` DOM을 반환합니다. 아직 렌더 전이면 `null`일 수 있습니다. |
| `getSvgText()` | 현재 SVG 문자열을 반환합니다. 아직 렌더 전이면 빈 문자열일 수 있습니다. |
| `exportSvg()` | 현재 다이어그램을 SVG 파일로 다운로드합니다. |
| `exportPng()` | 현재 다이어그램을 PNG 파일로 다운로드합니다. |
| `exportJpg()` | 현재 다이어그램을 JPG 파일로 다운로드합니다. |
| `copySvg()` | 현재 SVG 문자열을 클립보드에 복사합니다. |
| `fitView()` | preview를 현재 컨테이너에 맞게 다시 맞춥니다. 모달 오픈 직후나 resize 후에 유용합니다. |
| `zoomIn()` | preview를 확대합니다. |
| `zoomOut()` | preview를 축소합니다. |
| `undo()` | GUI 편집 히스토리를 한 단계 되돌립니다. |
| `redo()` | GUI 편집 히스토리를 한 단계 다시 적용합니다. |
| `toggleFullscreen()` | GUI editor의 fullscreen 상태를 토글합니다. |

예시:

```js
this.$refs.guiEditor.fitView();
this.$refs.guiEditor.undo();
await this.$refs.guiEditor.exportPng();
```

노드 추가, 엣지 수정, sequence message 수정 같은 세부 편집 메서드도 내부적으로는 존재하지만 payload 구조가 다이어그램 타입과 내부 model에 강하게 묶여 있습니다. 호스트 연동 API로는 위 표의 메서드와 `value` / `input` 계약을 우선 사용하시는 편이 안전합니다.

## 2. 버튼 없이 PNG Blob 만들기

툴바의 Export 버튼을 누르지 않고, 호스트 코드에서 현재 다이어그램을 PNG `Blob`으로 만들 수 있습니다. 서버 업로드, 커스텀 저장, 썸네일 생성처럼 다운로드가 목적이 아닌 경우에는 `window.SvgExport.toPngBlob()`을 사용합니다.

```js
async function createPngBlob() {
  const editor = this.$refs.guiEditor;
  const svgEl = editor && editor.getSvgElement && editor.getSvgElement();
  if (!svgEl) {
    throw new Error('아직 렌더된 SVG가 없습니다.');
  }

  return await window.SvgExport.toPngBlob(svgEl, {
    scale: 2,
    padding: 20,
    bgColor: '#ffffff'
  });
}
```

`svgEl`을 직접 넘기면 실제 DOM의 computed style을 읽어 export 결과에 반영할 수 있습니다. 그래서 문자열 SVG만 넘기는 방식보다 화면에 보이는 결과와 더 가깝습니다.

## 3. 서버 업로드 예시

```js
async function uploadDiagramPng() {
  const editor = this.$refs.guiEditor;
  const svgEl = editor && editor.getSvgElement && editor.getSvgElement();
  if (!svgEl) return;

  const pngBlob = await window.SvgExport.toPngBlob(svgEl, {
    scale: 2,
    padding: 20,
    bgColor: '#ffffff'
  });

  const form = new FormData();
  form.append('file', pngBlob, 'diagram.png');

  await fetch('/api/diagram-image', {
    method: 'POST',
    body: form
  });
}
```

## 4. JPG Blob 만들기

```js
const jpgBlob = await window.SvgExport.toJpgBlob(svgEl, {
  scale: 2,
  padding: 20,
  bgColor: '#ffffff',
  quality: 0.92
});
```

## 5. SVG 문자열이나 SVG Blob이 필요할 때

`mermaid-full-editor` 인스턴스에는 `getSvgText()`도 있습니다.

```js
const svgText = this.$refs.guiEditor.getSvgText();
const svgBlob = new Blob([svgText], {
  type: 'image/svg+xml;charset=utf-8'
});
```

이 방식은 다운로드를 실행하지 않고 SVG 데이터를 호스트 코드에서 직접 다룰 때 사용합니다.

## 6. `window.SvgExport` API

| 목적 | API | 결과 |
|---|---|---|
| SVG 파일 다운로드 | `window.SvgExport.exportSvg(svgSource, options)` | 다운로드 실행 |
| PNG 파일 다운로드 | `window.SvgExport.exportPng(svgSource, options)` | 다운로드 실행 |
| JPG 파일 다운로드 | `window.SvgExport.exportJpg(svgSource, options)` | 다운로드 실행 |
| PNG Blob 생성 | `window.SvgExport.toPngBlob(svgSource, options)` | `Promise<Blob>` |
| JPG Blob 생성 | `window.SvgExport.toJpgBlob(svgSource, options)` | `Promise<Blob>` |

`toPngBlob()`과 `toJpgBlob()`은 파일 다운로드를 실행하지 않습니다.

주요 옵션:

| 옵션 | 기본값 | 설명 |
|---|---:|---|
| `scale` | `2` | canvas 확대 배율 |
| `padding` | `20` | SVG 주변 여백 |
| `bgColor` | `'#ffffff'` | 래스터 이미지 배경색 |
| `quality` | `0.92` | JPG 품질 |
| `sourceElement` | 없음 | 문자열 SVG를 넘길 때 computed style을 읽을 원본 SVG DOM |

문자열 SVG를 넘기면서 화면의 computed style도 반영하고 싶다면 `sourceElement`를 같이 넘기면 됩니다.

```js
const svgText = this.$refs.guiEditor.getSvgText();
const svgEl = this.$refs.guiEditor.getSvgElement();

const pngBlob = await window.SvgExport.toPngBlob(svgText, {
  sourceElement: svgEl,
  scale: 2,
  padding: 20
});
```


</details>
