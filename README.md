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
│  │  └─ mixins/       # LiveEditor / FullEditor 공통 액션 wrapper
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
  - Mermaid SVG 렌더, zoom/pan, 인라인 편집, 이벤트 브리지를 담당합니다.
  - 여전히 가장 많은 상호작용 로직이 모여 있는 파일이지만, 최근 구조 정리 이후 순수 model 수정 책임은 밖으로 분리되었습니다.
- `MermaidToolbar.js`
  - 노드 추가, 메시지 추가, 방향 전환 같은 액션 UI를 담당합니다.
- `src/components/mixins`
  - LiveEditor / FullEditor가 공유하는 액션과 export, toast 로직을 담당합니다.
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

이 구조 덕분에 `MermaidLiveEditor.js`와 `MermaidFullEditor.js`가 같은 액션 코드를 따로 들고 있을 필요가 없어졌습니다.

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
  - SVG/PNG/JPG export를 담당합니다.
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

editor 두 개가 공통으로 쓰는 액션과 부가 기능을 담당합니다.

- flowchart 액션 wrapper
- sequence 액션 wrapper
- export / copy
- toast

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

## 3. 기존 textarea와 함께 쓰는 방법

호스트에 기존 Mermaid textarea가 있다면 같은 상태를 공유하시면 됩니다.

```html
<textarea v-model="diagram"></textarea>

<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
></mermaid-full-editor>
```

이렇게 구성하시면 textarea와 GUI editor가 같은 Mermaid 문자열을 함께 편집하게 됩니다.

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

## 6. 텍스트 에디터 없이 GUI만 임베드하기

텍스트 입력 영역 없이 GUI 프리뷰 패널만 표시하고 싶을 때는 `:hide-editor="true"` 프롭을 사용하시면 됩니다.

```html
<mermaid-full-editor
  :value="diagram"
  @input="diagram = $event"
  :hide-editor="true"
  style="height: 600px;"
></mermaid-full-editor>
```

이 방식에서:

- 텍스트 에디터 패널이 완전히 숨겨지고 GUI 편집 영역(툴바 + 프리뷰)만 표시됩니다.
- `diagram` 문자열은 여전히 호스트가 관리하며, GUI 조작 결과는 `@input`으로 호스트에 전달됩니다.
- 전체화면(fullscreen) 버튼, undo/redo, 노드 추가, export 등 GUI 기능은 그대로 동작합니다.

호스트에 별도 텍스트 에디터가 있거나, 다이어그램을 코드 없이 GUI로만 조작하는 환경에 적합합니다.

```html
<div id="app">
  <!-- 호스트 텍스트 에디터 (별도 운영) -->
  <textarea v-model="diagram" style="width: 100%; height: 200px;"></textarea>

  <!-- GUI 에디터 단독 임베드 -->
  <div style="height: 600px;">
    <mermaid-full-editor
      :value="diagram"
      @input="diagram = $event"
      :hide-editor="true"
    ></mermaid-full-editor>
  </div>
</div>
```

## 7. 체크리스트

임베드 전에 아래 항목을 확인하시면 됩니다.

1. 호스트가 Mermaid 문자열 상태를 갖고 있는지 확인합니다.
2. Vue 2와 Mermaid가 먼저 로드되는지 확인합니다.
3. `GuiEditor.css`, `gui-editor.component.js`를 정적으로 서비스하는지 확인합니다.
4. `<mermaid-full-editor :value="diagram" @input="diagram = $event">`를 연결합니다.
5. 기존 preview/save 경로가 있으면 `@svg-rendered`가 필요한지 확인합니다.
6. 컨테이너 높이를 지정합니다.
7. 텍스트 에디터 없이 GUI만 보여줄 경우 `:hide-editor="true"`를 추가합니다.

</details>
