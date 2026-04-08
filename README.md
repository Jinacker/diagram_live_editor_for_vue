# Mermaid Live Editor for Vue 2

이 프로젝트는 Mermaid Flowchart를 GUI 기반으로 더 쉽게 편집할 수 있도록 만든 Vue 2 기반 라이브 에디터입니다.  
왼쪽에서는 Mermaid 스크립트를 직접 수정하실 수 있고, 오른쪽에서는 렌더된 다이어그램을 클릭하고 드래그하면서 노드, 엣지, participant, message를 바로 편집하실 수 있습니다.

현재는 아래 두 가지 다이어그램 타입에 대한 대응 기능 구현을 완료했습니다.

- Mermaid `flowchart`
- Mermaid `sequenceDiagram`

또한 번들러나 복잡한 프레임워크 의존성을 최대한 줄이고, 순수 JavaScript 기반 구조로 작성해 유지보수와 이식이 쉽도록 개발했습니다.

## Overview

이 에디터는 텍스트 편집기와 GUI 편집기를 따로 만든 구조가 아니라, 같은 내부 데이터 흐름 위에서 두 입력 방식을 함께 연결한 구조입니다.

주요 기능은 아래와 같습니다.

- Mermaid `flowchart` 편집 지원
- Mermaid `sequenceDiagram` 편집 지원
- 스크립트 입력과 GUI 조작의 양방향 동기화
- 노드, 엣지, participant, message 직접 편집
- undo / redo
- autosave
- SVG 복사, 줌, 팬, fit-to-view

## Core Concept

프로젝트는 내부적으로 아래 세 층을 기준으로 동작합니다.

- `script`
  - 사용자가 직접 작성하거나 수정하는 Mermaid 원문입니다.
- `model`
  - 앱이 편집하기 쉽도록 정리한 구조화 데이터입니다.
- `svg`
  - Mermaid가 실제로 렌더한 화면 결과입니다.

즉, 사용자는 텍스트를 수정하거나 그림을 조작하지만, 내부적으로는 `script`와 `model`이 계속 왕복하면서 상태를 유지합니다.

## How It Works

전체 동작 흐름은 아래와 같습니다.

1. 사용자가 Mermaid 스크립트를 입력하시거나 GUI에서 다이어그램을 조작합니다.
2. 입력 내용은 parser를 통해 내부 `model`로 변환되거나, 반대로 GUI 조작 결과가 `model` 수정으로 반영됩니다.
3. 변경된 `model`은 generator를 통해 다시 Mermaid script로 직렬화됩니다.
4. Mermaid가 그 script를 SVG로 렌더합니다.
5. 렌더된 SVG 위에는 클릭과 드래그를 위한 interaction layer가 추가됩니다.
6. 사용자가 다시 GUI에서 수정하시면 같은 흐름이 반복됩니다.

핵심 흐름만 짧게 정리하면 아래와 같습니다.

`script -> model -> svg -> interaction -> model -> script`

## Editing Flow

### Text to Diagram

왼쪽 에디터에서 스크립트를 수정하시면:

1. 입력 문자열이 파싱됩니다.
2. flowchart 또는 sequence diagram용 `model`이 생성됩니다.
3. preview가 해당 `model`을 기준으로 Mermaid SVG를 다시 렌더합니다.

즉, 텍스트 편집은 문자열을 구조 데이터로 바꾸고, 다시 그림으로 반영하는 흐름입니다.

### GUI to Text

오른쪽 preview에서 노드나 엣지를 수정하시면:

1. SVG 위의 클릭 또는 드래그 이벤트가 interaction layer에서 처리됩니다.
2. 상위 상태 컨테이너가 내부 `model`을 수정합니다.
3. 수정된 `model`을 다시 Mermaid script로 생성합니다.
4. editor와 preview가 함께 갱신됩니다.

즉, GUI 편집은 화면을 직접 수정하는 것처럼 보이지만, 실제로는 `model`을 수정한 뒤 다시 렌더하는 방식입니다.

## Rendering and Interaction

이 프로젝트는 SVG를 직접 새로 그리는 방식이 아니라 Mermaid가 생성한 SVG를 활용합니다.  
대신 그 SVG 위에 상호작용을 위한 보조 레이어를 얹는 방식으로 편집 기능을 구현했습니다.

- edge 위에는 거의 투명한 hit area를 덧씌워 클릭 영역을 넓힙니다.
- node 주변에는 포트 overlay를 띄워 drag-to-connect를 처리합니다.
- sequence message에는 hit box와 `+` 핸들을 추가합니다.
- 인라인 편집 입력창도 SVG 위에 overlay 형태로 표시됩니다.

즉, 화면 위에 떠 있는 것은 `model` 자체가 아니라 `SVG + interaction overlay`입니다.

## Architecture

프로젝트 구조는 크게 세 부분으로 나뉩니다.

### `src/components`

화면 구성과 상위 상태를 담당합니다.

- `MermaidLiveEditor.js`
  - 전체 상태 허브
  - `script`, `model`, 선택 상태, undo/redo, autosave 관리
- `MermaidEditor.js`
  - 텍스트 입력 UI
- `MermaidPreview.js`
  - Mermaid SVG 렌더와 preview 영역 제어
- `MermaidToolbar.js`
  - 툴바 액션 UI

### `src/actions`

렌더된 SVG 위의 상호작용을 담당합니다.

- `SvgPositionTracker.js`
  - flowchart SVG 요소와 model 데이터 매핑
- `SvgNodeHandler.js`
  - 노드 선택, hover, 인라인 편집
- `SvgEdgeHandler.js`
  - 엣지 선택, label 편집, ghost hit area 처리
- `PortDragHandler.js`
  - 노드 포트 드래그로 새 엣지 생성
- `SequencePositionTracker.js`
  - sequence participant/message 위치 추적
- `SequenceMessageDragHandler.js`
  - sequence 메시지 추가 drag UI
- `SequenceSvgHandler.js`
  - sequence 선택, 편집, line type 처리

### `src/services`

편집 편의 기능과 상태 보존을 담당합니다.

- `HistoryManager.js`
  - model 스냅샷 기반 undo / redo
- `StorageManager.js`
  - localStorage 기반 autosave / restore

## Parsing and Generation

이 프로젝트가 안정적으로 동작하는 이유는 문자열을 직접 부분 수정하지 않기 때문입니다.

- flowchart
  - parse: `mermaid-parser.js`
  - generate: `mermaid-generator.js`
- sequence
  - parse: `sequence-parser.js`
  - generate: `sequence-generator.js`

이 구조 덕분에 노드 추가, 엣지 삭제, 메시지 반전 같은 GUI 조작을 문자열 조작이 아니라 구조 데이터 수정으로 처리할 수 있습니다.

## State Management

상태의 중심은 `MermaidLiveEditor`입니다.

- `script`는 사용자에게 보이는 Mermaid 원문입니다.
- `model`은 앱 내부 편집 기준 데이터입니다.
- preview는 항상 현재 `model`을 SVG로 렌더한 결과입니다.
- undo / redo는 `model` 스냅샷 기준으로 동작합니다.
- autosave는 `script`와 editor 레이아웃 상태를 저장합니다.

즉, 이 프로젝트는 현재 다이어그램 상태를 `model` 기준으로 정리하고, 그 결과를 다시 `script`와 `svg`로 연결하는 구조입니다.
