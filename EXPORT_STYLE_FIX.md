# Mermaid Export 스타일 보존 수정 기록

## 문서 목적

이 문서는 GUI Editor에서 Mermaid 다이어그램을 SVG, PNG, JPG로 export할 때 프리뷰와 결과물의 색상, 라벨 배경, 줄바꿈이 달라지던 문제를 분석하고 수정한 내용을 기록합니다.

이번 수정은 static profile Mermaid script에서 문제를 확인하면서 시작했지만, parser나 generator가 아니라 공통 export 계층을 수정했습니다. 따라서 특정 profile에만 적용되는 예외 처리가 아니라 SVG, PNG, JPG export 전체에 공통으로 적용됩니다.

주요 수정 파일은 아래와 같습니다.

- `src/utils/SvgExport.js`
  - 실제 export 직렬화와 스타일 보존 로직
- `dist/gui-editor.component.js`
  - `node build.js`로 다시 생성한 배포용 번들

## 문제 증상

에디터 프리뷰에서는 정상으로 보이던 Mermaid 다이어그램이 export 결과물에서는 아래처럼 달라졌습니다.

1. 파란색이어야 하는 함수 목록 라벨이 검은색으로 출력될 수 있었습니다.
2. 엣지 라벨 뒤에 있던 반투명 회색 배경이 사라졌습니다.
3. `sensor_manager`, `g_sensors[type].filtered_value` 같은 문자열이 원본과 다른 위치에서 임의로 줄바꿈되었습니다.
4. 같은 Mermaid script를 사용했는데도 화면 프리뷰와 다운로드 이미지의 시각적 결과가 일치하지 않았습니다.

이 현상은 Mermaid script 자체의 `style` 선언이 사라져서 생긴 문제가 아니었습니다. 브라우저 프리뷰에 사용되는 HTML 기반 라벨을 export용 SVG 라벨로 바꾸는 과정에서 일부 표현 정보가 손실된 것이 원인이었습니다.

## Export 처리 흐름

export 버튼은 `src/components/mixins/exportMixin.js`에서 처리합니다.

```text
exportMixin
  -> 현재 preview의 SVG DOM 조회
  -> SvgExport.exportSvg / exportPng / exportJpg 호출
  -> SvgExport 내부에서 export용 SVG 직렬화
  -> SVG 파일 다운로드 또는 canvas 기반 raster 변환
```

`exportMixin`은 가능하면 문자열만 넘기지 않고 실제 preview SVG DOM을 `sourceElement` 옵션으로 같이 전달합니다.

```js
SvgExport.exportPng(svgSource, {
  filename: 'diagram.png',
  scale: 2,
  padding: 20,
  sourceElement: svgEl
});
```

실제 DOM을 같이 전달하는 이유는 브라우저가 계산한 스타일을 읽기 위해서입니다. 직렬화된 SVG 문자열만으로는 외부 CSS, 상속, Mermaid가 만든 HTML 라벨의 계산 스타일을 온전히 복원하기 어렵습니다.

### SVG export

SVG export는 `serializeForSvg()`를 사용합니다.

```text
원본 SVG 직렬화
  -> export용 SVG DOM 파싱
  -> 편집용 overlay 제거
  -> preview 전용 root 스타일 제거
  -> 계산된 SVG 스타일 inline 처리
  -> foreignObject 라벨을 SVG text로 교체
  -> 최종 SVG 문자열 다운로드
```

### PNG / JPG export

PNG와 JPG export는 `serializeForRaster()`를 사용합니다.

```text
원본 SVG 직렬화
  -> SVG export와 동일한 정리 및 라벨 교체
  -> padding을 포함한 SVG 생성
  -> SVG를 Image로 로드
  -> canvas에 렌더
  -> PNG 또는 JPG Blob 다운로드
```

두 경로 모두 `replaceForeignObjects()`를 호출하므로, 이번 수정은 SVG와 raster export에 모두 적용됩니다.

## 핵심 원인

### 1. Mermaid 라벨은 일반 SVG text가 아닐 수 있음

Mermaid가 생성한 flowchart 라벨 일부는 순수 SVG `<text>`가 아니라 SVG 내부의 `<foreignObject>` 안에 HTML로 들어갑니다.

개념적으로는 아래와 같은 구조입니다.

```html
<foreignObject>
  <div>
    <span class="edgeLabel">g_sensors[type].filtered_value</span>
  </div>
</foreignObject>
```

브라우저 프리뷰에서는 HTML과 CSS를 그대로 렌더링하므로 텍스트 색상, 배경색, 줄바꿈이 자연스럽게 적용됩니다.

반면 export 과정에서는 `replaceForeignObjects()`가 `<foreignObject>`를 SVG `<text>`로 바꿉니다.

```xml
<text>
  <tspan>g_sensors[type].filtered_value</tspan>
</text>
```

이 변환은 export 결과를 SVG 중심 표현으로 정리하는 기존 동작입니다. 다만 HTML 박스를 단순 텍스트로만 바꾸면 HTML 요소가 가지고 있던 표현 정보가 함께 사라질 수 있습니다.

### 2. `!important`가 SVG 색상값에 포함됨

일부 Mermaid 스타일은 아래처럼 `!important` 우선순위를 포함합니다.

```css
color: rgb(0, 0, 255) !important;
```

기존 코드는 스타일 값을 읽을 때 문자열을 거의 그대로 사용했습니다. 이 값을 SVG presentation attribute에 그대로 넣으면 아래와 같은 결과가 생길 수 있습니다.

```xml
<text fill="rgb(0, 0, 255) !important">
```

`fill` attribute에는 CSS 선언의 우선순위 문법인 `!important`를 함께 넣으면 안 됩니다. 브라우저가 유효한 색상으로 해석하지 못하면 기본색이나 상속된 색으로 fallback할 수 있습니다.

즉 파란색 함수 목록이 검은색으로 바뀐 원인은 스타일을 못 찾은 것뿐 아니라, 찾은 값을 SVG에 잘못 전달한 것도 포함합니다.

### 3. 엣지 라벨 배경이 텍스트 교체 과정에서 손실됨

프리뷰의 엣지 라벨은 텍스트 뒤에 반투명 배경을 가질 수 있습니다.

예를 들어 브라우저에서 계산된 배경색은 아래처럼 보일 수 있습니다.

```css
background-color: rgba(232, 232, 232, 0.5);
```

기존 export는 `<foreignObject>`를 `<text>` 하나로 교체했습니다. `<text>`는 HTML 배경 박스를 자동으로 보존하지 않으므로 회색 라벨 배경이 사라졌습니다.

### 4. Export가 원본에 없는 줄바꿈을 새로 계산함

기존 export 로직은 `canvas.measureText()`로 라벨 폭을 다시 측정하고, 긴 문자열을 export 시점에 재배치했습니다.

특히 `_`, `.`, 괄호, 연산자가 들어간 문자열은 코드 형태로 판단하여 문자 단위까지 나눌 수 있었습니다.

```text
sensor_
manager
```

하지만 이 로직은 Mermaid가 실제 프리뷰에서 사용한 줄바꿈 결과와 별개로 동작했습니다. 따라서 원본 프리뷰가 한 줄로 표시한 라벨도 export 결과에서 임의로 꺾일 수 있었습니다.

## 기존 로직과 현재 로직 비교

전체 export 흐름은 유지하고, `foreignObject` 라벨을 SVG 요소로 변환하는 구간을 보강했습니다.

### 기존 로직

```text
원본 preview SVG
  -> export용 SVG 복제
  -> 계산된 SVG 스타일 inline 처리
  -> foreignObject의 텍스트 추출
  -> canvas.measureText()로 export 전용 줄바꿈 재계산
  -> foreignObject를 text 하나로 교체
  -> SVG 다운로드 또는 canvas raster 변환
```

기존 로직의 장점은 export 결과에서 HTML 의존도를 줄이고 SVG 중심 구조로 정리한다는 점입니다. 하지만 `<foreignObject>` 내부 HTML이 가지고 있던 배경과 CSS 표현을 충분히 옮기지 않았고, export 시점에 별도 레이아웃 계산까지 수행했습니다.

### 현재 로직

```text
원본 preview SVG
  -> export용 SVG 복제
  -> 계산된 SVG 스타일 inline 처리
  -> foreignObject의 텍스트와 계산 스타일 추출
  -> CSS 선언용 !important 제거
  -> 원본 DOM의 줄 경계만 유지
  -> 배경이 있으면 g(rect + text), 없으면 text로 교체
  -> SVG 다운로드 또는 canvas raster 변환
```

현재 로직은 기존 구조를 폐기하지 않고 손실되던 표현만 보충합니다. parser, generator, UI 이벤트 흐름, 파일 다운로드 방식은 변경하지 않았습니다.

### 항목별 차이

| 항목 | 기존 로직 | 현재 로직 | 개선 효과 |
| --- | --- | --- | --- |
| 텍스트 색상 | 읽은 스타일 문자열을 거의 그대로 SVG `fill`에 사용 | `cleanStyleValue()`로 `!important` 제거 후 사용 | 유효하지 않은 `fill` 값 방지 |
| CSS 우선순위 | 색상값과 `!important`가 한 문자열에 섞일 수 있음 | 값과 우선순위를 분리하여 `style.setProperty()`에 전달 | SVG attribute와 CSS declaration 역할 분리 |
| 라벨 배경 | `<foreignObject>` 제거 시 함께 손실 | 유효한 배경색이 있으면 `<rect>`로 복원 | 반투명 회색 엣지 라벨 배경 보존 |
| 줄바꿈 | export 시점에 폭을 다시 측정하여 재계산 | 원본 DOM의 줄 경계만 사용 | 프리뷰와 export의 레이아웃 차이 감소 |
| 긴 코드형 문자열 | `_`, `.`, 연산자 기준으로 임의 분리 가능 | export 단계에서 추가 분리하지 않음 | 함수명, 변수명 보존 |
| 코드 복잡도 | canvas 측정 및 토큰 분할 보조 함수 필요 | 관련 보조 함수 제거 | 브라우저별 측정 편차와 유지보수 부담 감소 |
| 영향 범위 | 공통 `replaceForeignObjects()` 경로 | 동일한 공통 경로 안에서 보강 | SVG, PNG, JPG에 일관되게 적용 |

## 적용한 수정

### 1. 스타일 값 정규화

`cleanStyleValue()`를 추가했습니다.

```js
function cleanStyleValue(value) {
  return String(value || '').replace(/!important/gi, '').trim();
}
```

이 함수는 SVG 속성에 넣기 전에 CSS 선언 우선순위인 `!important`를 제거합니다.

아래 함수들이 정규화된 값을 사용하도록 변경했습니다.

- `readInlineStyleValue()`
- `readStyleValue()`
- `isUsableStyleValue()`
- `firstUsableStyleValue()`
- `applyTextPaint()`

`applyTextPaint()`는 정리된 색상값을 `fill`, `color` attribute에 넣고, DOM style API를 사용할 때만 priority 인자로 `important`를 별도로 전달합니다.

```js
el.style.setProperty('fill', color, 'important');
```

즉 색상 문자열과 CSS 우선순위를 분리해서 처리합니다.

### 스타일 fallback 순서

`readForeignObjectTextStyle()`은 가능한 한 원본 Mermaid 스타일을 우선 사용합니다.

```text
명시적인 inline / attribute 스타일
  -> SVG 내부 scope style rule
  -> 브라우저 computed style
  -> 기본값
```

이를 통해 `style nodeId fill:#FFFFFF,stroke:none,color:#0000FF`처럼 Mermaid script에서 명시한 색상이 export에서도 유지됩니다.

### 2. 라벨 배경 보존

`readForeignObjectTextStyle()`이 텍스트 스타일과 함께 `backgroundColor`도 수집하도록 변경했습니다.

```js
backgroundColor: firstUsableStyleValue(
  readStyleValue(target, 'background-color'),
  computed ? computed.backgroundColor : ''
)
```

`replaceForeignObjects()`는 유효한 배경색이 있으면 `<text>`만 넣지 않고 `<g>` 그룹 안에 `<rect>`와 `<text>`를 함께 생성합니다.

```xml
<g>
  <rect x="..." y="..." width="..." height="..." fill="rgba(...)" />
  <text>...</text>
</g>
```

`rect`는 먼저 추가하고 `text`는 나중에 추가하므로 텍스트 뒤에 배경이 배치됩니다.

투명 배경은 `isUsableStyleValue()`에서 제외합니다. 따라서 배경이 없는 일반 노드 라벨에 불필요한 사각형을 추가하지 않습니다.

### 3. 원본 줄바꿈 보존

기존 `wrapTextToLines()` 호출을 제거하고, 원본 DOM에서 읽은 줄을 `normalizeTextLines()`로만 정리하도록 변경했습니다.

변경 전:

```js
var lines = wrapTextToLines(
  getForeignObjectText(fo, sourceFo),
  Math.max(16, fw - 10),
  fontSize,
  fontFamily
);
```

변경 후:

```js
var lines = normalizeTextLines(getForeignObjectText(fo, sourceFo));
```

이제 export는 새로운 줄바꿈을 추측하지 않습니다.

- 원본 DOM의 `innerText` 줄바꿈을 우선 사용합니다.
- `innerText`를 사용할 수 없으면 `<br>`, `<p>`, `<li>`, `<tr>` 구조를 읽습니다.
- 연속 공백은 정리하지만, 원본의 줄 경계는 유지합니다.
- 긴 변수명이나 함수명을 export 단계에서 임의로 쪼개지 않습니다.

더 이상 사용하지 않는 자동 래핑 함수도 제거했습니다.

- `createMeasureContext()`
- `isCodeLikeToken()`
- `getLongTokenBreakAt()`
- `splitLongToken()`
- `wrapLongToken()`
- `wrapLineToWidth()`
- `wrapTextToLines()`

## 개선점

### 프리뷰와 export의 역할을 명확하게 분리

프리뷰의 레이아웃 결과를 export가 다시 해석해서 바꾸지 않도록 했습니다. export는 원본 DOM에 존재하는 줄바꿈과 스타일을 옮기는 역할에 집중합니다.

### 환경에 따른 레이아웃 편차 감소

기존 자동 래핑은 `canvas.measureText()` 결과에 의존했습니다. 글꼴 로딩 시점, 브라우저, 렌더링 환경에 따라 측정값이 미세하게 달라질 수 있습니다.

현재는 export 단계의 재측정을 제거했으므로 같은 preview DOM을 export할 때 결과가 더 결정적입니다.

### 배경이 필요한 라벨만 보강

모든 라벨에 `<rect>`를 추가하지 않습니다.

```text
유효한 backgroundColor가 있음
  AND
라벨 텍스트가 비어 있지 않음
  -> rect 추가
```

`transparent`, `rgba(0, 0, 0, 0)` 같은 값은 제외하므로 일반 노드 라벨의 SVG 구조를 불필요하게 늘리지 않습니다.

### 공통 경로에서 한 번에 수정

SVG와 raster export에 각각 별도 예외를 추가하지 않았습니다. 두 경로가 공통으로 호출하는 `replaceForeignObjects()`를 보강하여 형식별 결과 차이가 생길 가능성을 줄였습니다.

### 복잡한 자동 래핑 코드 제거

사용하지 않게 된 canvas 측정, 토큰 분리, 문자 단위 fallback 로직을 제거했습니다. 코드 양을 줄이는 것뿐 아니라 export 단계가 원본 레이아웃을 덮어쓰는 경로 자체를 없앴습니다.

## 안정성

### 변경 범위를 export 계층으로 제한

이번 수정은 `src/utils/SvgExport.js` 안에서만 이루어졌습니다.

아래 영역은 수정하지 않았습니다.

- Mermaid script parsing
- Mermaid script generation
- GUI 편집 model
- flowchart 엣지 codec
- preview 렌더링
- undo / redo

따라서 다이어그램 편집 의미나 Mermaid script 재생성 결과에는 영향을 주지 않습니다.

### Live DOM을 우선 사용하고 fallback 유지

`exportMixin`은 일반적인 export 버튼 경로에서 실제 preview SVG DOM을 `sourceElement`로 넘깁니다. 이 경우 `window.getComputedStyle()`을 사용하여 브라우저가 실제로 적용한 색상과 배경색을 읽습니다.

`sourceElement`가 없는 경우에도 문자열로 파싱한 SVG DOM을 사용하도록 기존 fallback을 유지합니다. 다만 문자열만 있는 경우 외부 CSS와 상속 결과를 모두 계산할 수 없으므로, live DOM을 전달하는 일반 경로보다 스타일 보존 수준이 낮을 수 있습니다.

### 유효한 스타일만 SVG에 반영

`isUsableStyleValue()`는 아래처럼 SVG 출력에 바로 쓰기 어려운 값을 제외합니다.

- 빈 문자열
- `inherit`
- `initial`
- `unset`
- `revert`
- `transparent`
- 완전 투명 `rgba(...)`
- `currentcolor`
- 해석되지 않은 `var(...)`

그 뒤 `cleanStyleValue()`가 `!important`를 제거합니다. 이 순서를 통해 SVG attribute에 CSS 선언용 문법이 섞이는 문제를 줄였습니다.

### 텍스트 삽입 방식 유지

라벨 문자열은 생성한 `<text>`와 `<tspan>`의 `textContent`로 넣습니다. HTML 문자열을 `innerHTML`로 다시 삽입하지 않습니다.

즉 라벨 배경을 보존하기 위해 `<rect>`를 추가했지만, 텍스트 처리 방식은 기존의 SVG text 변환 방식을 유지합니다.

### 구조 변경을 필요한 경우로 제한

배경색이 없는 라벨:

```text
foreignObject -> text
```

배경색이 있는 라벨:

```text
foreignObject -> g(rect + text)
```

배경이 없는 일반 라벨은 기존과 동일한 단순 구조를 유지합니다.

### 정적 검사와 시각 검증 수행

수정 후 아래 검사를 통과했습니다.

```bash
node --check src/utils/SvgExport.js
node --check dist/gui-editor.component.js
git diff --check
```

또한 대표 static profile을 headless Chrome에서 원본과 export 결과로 나란히 렌더링하여 색상, 배경, 줄바꿈을 직접 비교했습니다.

## 남아 있는 한계와 확인 지점

이번 수정은 현재 확인된 Mermaid DOM 구조를 기준으로 안정성을 높인 것입니다. 아래 항목은 향후 Mermaid 버전이나 export 요구사항이 바뀌면 다시 확인해야 합니다.

### 복잡한 HTML 스타일 전체를 복제하지는 않음

현재 보존 대상은 텍스트 색상, 배경색, 글꼴 크기, 글꼴 두께, 글꼴 스타일, 줄 간격, 원본 줄 경계입니다.

아래와 같은 복잡한 HTML 스타일은 완전히 복제하지 않습니다.

- padding
- border
- border radius
- 복잡한 inline layout
- HTML 요소별 개별 색상
- rich text 조합

필요해지면 `readForeignObjectTextStyle()`과 `replaceForeignObjects()`에서 지원 범위를 명시적으로 확장해야 합니다.

### `foreignObject` 대응은 순서 기반임

`replaceForeignObjects()`는 export용 SVG와 live source SVG의 `foreignObject` 목록을 같은 index로 대응시킵니다.

현재는 원본 SVG를 직렬화해서 다시 파싱하므로 순서가 유지됩니다. 향후 직렬화 전에 DOM을 재배열하는 로직이 추가되면 이 대응 방식도 함께 점검해야 합니다.

### 브라우저 밖 SVG consumer는 별도 확인 필요

브라우저 기반 SVG, PNG, JPG export는 검증했습니다. 디자인 도구나 서버측 SVG 변환기처럼 다른 SVG consumer를 지원해야 한다면 `rgba(...)` fill 처리와 글꼴 fallback을 별도로 확인해야 합니다.

### 자동화된 브라우저 회귀 테스트는 아직 없음

현재는 문법 검사, diff 검사, headless Chrome 시각 비교로 검증했습니다. export 변경이 자주 발생한다면 대표 Mermaid fixture와 screenshot 비교를 자동화하는 것이 다음 안정성 개선 후보입니다.

## 영향 범위

### 수정되는 export

- SVG 다운로드
- PNG 다운로드
- JPG 다운로드

세 형식은 모두 `SvgExport.js`의 공통 라벨 변환 로직을 거칩니다.

### 직접 수정하지 않은 영역

- Mermaid script parser
- Mermaid script generator
- static profile parser / generator
- flowchart GUI 편집 로직
- sequence diagram GUI 편집 로직
- Mermaid script 문자열 자체

이번 문제는 script 생성 문제가 아니라 렌더된 SVG를 파일로 내보내는 과정의 문제였습니다.

### Copy SVG와의 차이

`copySvg()`는 현재 preview의 SVG 문자열을 그대로 clipboard에 넣습니다. `SvgExport.exportSvg()`의 정리 및 `foreignObject` 교체 경로를 거치지 않습니다.

따라서 이번 수정의 직접 대상은 다운로드 export입니다.

## 검증 방법

수정 시에는 대표 static profile Mermaid script를 임시 비교 페이지에서 렌더링하고, 원본 preview SVG와 export용으로 직렬화된 SVG를 나란히 배치하여 시각적으로 비교했습니다.

확인한 항목은 아래와 같습니다.

- 함수 목록 라벨이 원본처럼 파란색으로 출력되는지
- 엣지 라벨의 반투명 회색 배경이 유지되는지
- `sensor_manager`가 임의로 두 줄로 나뉘지 않는지
- `g_sensors[type].filtered_value` 같은 긴 문자열이 원본 DOM의 줄바꿈만 따르는지
- 노드 도형, 엣지 선, 화살표 스타일이 유지되는지

임시 비교 페이지와 로컬 서버는 검증 후 제거했습니다.

## 빌드 및 정적 검사

`src/utils/SvgExport.js`를 변경한 뒤에는 배포 번들을 다시 생성해야 합니다.

```bash
node build.js
```

생성되는 주요 결과물:

```text
dist/gui-editor.component.js
```

이번 수정 후 아래 검사를 실행했습니다.

```bash
node --check src/utils/SvgExport.js
node --check dist/gui-editor.component.js
git diff --check
```

## 회귀 확인 체크리스트

export 관련 로직을 다시 수정할 때는 아래 항목을 확인합니다.

- `style ... color:#0000FF`처럼 명시된 텍스트 색상이 유지되는가
- 엣지 라벨의 배경색과 투명도가 유지되는가
- 배경이 없는 라벨에 불필요한 `<rect>`가 생기지 않는가
- `<br>`로 구분된 여러 줄 라벨이 그대로 유지되는가
- 한 줄 변수명과 함수명이 export 단계에서 임의로 분리되지 않는가
- 한글 노드 ID와 한글 라벨이 정상 출력되는가
- SVG 다운로드 결과가 브라우저에서 정상적으로 열리는가
- PNG와 JPG 결과가 SVG 결과와 같은 시각적 구조를 유지하는가
- 편집용 overlay가 export 결과에 포함되지 않는가

## 유지보수 시 주의점

### `foreignObject`를 다룰 때

`foreignObject` 내부는 HTML 렌더링 영역입니다. 이를 SVG 요소로 바꿀 때는 텍스트 내용만 옮기면 충분하지 않을 수 있습니다.

추가 스타일을 지원해야 한다면 아래 항목을 함께 검토합니다.

- 배경색
- 글자색
- 글꼴 크기
- 글꼴 두께
- 글꼴 스타일
- 줄 간격
- 정렬
- padding
- border
- opacity

현재 수정은 실제로 문제가 확인된 텍스트 색상, 배경색, 원본 줄바꿈 보존에 집중했습니다.

### SVG attribute와 CSS declaration을 구분할 것

아래 두 표현은 같지 않습니다.

```css
fill: rgb(0, 0, 255) !important;
```

```xml
fill="rgb(0, 0, 255)"
```

CSS declaration 문자열을 SVG attribute에 넣을 때는 `!important` 같은 선언용 문법을 제거해야 합니다.

### 원본보다 더 많이 보정하지 않을 것

export는 프리뷰를 최대한 충실하게 복제하는 역할입니다. export 단계에서 줄바꿈, 크기, 색상을 새로 추측하면 Mermaid 렌더 결과와 차이가 커질 수 있습니다.

가능하면 아래 원칙을 유지합니다.

```text
원본 DOM에서 확인할 수 있는 정보는 그대로 사용한다.
원본 DOM에 없는 표현을 export 단계에서 임의로 추가하지 않는다.
```

## 요약

이번 문제의 핵심은 Mermaid script가 아니라 export 직렬화 단계였습니다.

```text
foreignObject HTML 라벨
  -> SVG text 변환
  -> 색상 문자열 정규화
  -> 필요한 경우 rect 배경 보존
  -> 원본 DOM 줄바꿈 유지
```

이 수정으로 프리뷰와 export 결과 사이에서 발생하던 텍스트 색상, 엣지 라벨 배경, 임의 줄바꿈 차이를 줄였습니다.
