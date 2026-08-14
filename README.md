# DOS/PC-98 Web Patcher

PC-98과 IBM PC용 한국어 패치를 브라우저에서 적용하는 GitHub Pages 프로젝트다. 원본 파일은 서버로 전송하지 않으며, 파일 검사와 VCDIFF 적용 및 결과 검증은 모두 사용자 브라우저 안에서 처리한다.

사이트는 다음 두 화면으로 구성된다.

- `index.html`: 작품 목록, 검색, 플랫폼 필터와 정렬
- `patcher.html?game=<게임 ID>`: 작품 정보, 수정 이력과 실제 패치 화면

## 패치 사용법

1. 목록에서 작품을 선택한다.
2. 수정하지 않은 지원 원본 폴더 전체를 선택한다.
3. 대상 파일의 크기와 SHA-256 검사가 완료될 때까지 기다린다.
4. 패치 버튼을 눌러 검증된 결과 ZIP을 내려받는다.
5. 원본을 별도로 백업하고 ZIP의 파일을 원본 폴더에 덮어쓴다.
6. `_emulator-font`에 포함된 BMP는 게임 파일이 아니라 에뮬레이터의 한글 폰트 설정에 사용한다.

웹 패처는 원본 폴더를 직접 수정하지 않는다. 파일이 누락됐거나 지원 버전과 해시가 다르면 패치를 시작하지 않는다.

## 로컬 실행

Node.js 18 이상이 설치된 PowerShell에서 실행한다.

```powershell
cd C:\work_han\dos-pc98-web-patcher
npm start
```

브라우저에서 `http://127.0.0.1:8080/`을 연다. JSON을 `fetch`로 불러오므로 HTML 파일을 직접 더블클릭하지 말고 정적 서버를 사용해야 한다.

자동 테스트는 다음 명령으로 실행한다.

```powershell
npm test
```

## 패치 이용 조건

패치 자료의 이용 조건은 [PATCH-POLICY.md](PATCH-POLICY.md)를 따른다. 핵심 조건은 다음과 같다.

> 본 한글 패치와 이를 적용한 결과물의 판매, 유료 배포 및 영리 목적 이용을 금지한다.

## 저장소 구조

```text
games/
  catalog.json
  <게임 ID>/
    game.json
    images/
      cover.jpg
      screen-01.png
packages/
  <게임 ID>/
    manifest.json
    patches/
      <대상 파일>.xdelta
assets/
  fonts/source/
    ThinDungGeunMo.bmp
    BISCO.bmp
src/
  app.js
  patch-worker.js
  vcdiff.js
  zip.js
```

- `games/catalog.json`: 목록 화면에 필요한 제목, 플랫폼, 출시일과 정렬 정보
- 게임별 `game.json`: 소개, 제작사, 다국어 제목, 이미지, 제작진과 수정 이력
- 게임별 `manifest.json`: 대상 경로, 원본·결과 크기, SHA-256, VCDIFF 및 공용 에셋 정보
- `patches/`: `distribution_toolkit`으로 만든 브라우저 호환 VCDIFF 파일

작품마다 HTML을 복제하지 않는다. 모든 작품은 공통 `patcher.html`을 사용하고 게임별 JSON만 다르게 불러온다.

## 새 패치 등록

### 1. 패치 패키지 생성

`distribution_toolkit`에서 전체 원본 폴더와 변경 파일만 담긴 한글판 폴더를 비교한다.

```powershell
cd C:\work_han\distribution_toolkit
node .\bin\build.js `
  C:\work_han\workspace\jpn-pc98 `
  C:\work_han\workspace\kor-pc98 `
  C:\work_han\dos-pc98-web-patcher\packages\<게임 ID> `
  --game "작품명" `
  --version "YYYY.MM.DD" `
  --xdelta .\bin\xdelta3.exe
```

제작기는 xdelta3 보조 압축을 끈 `folder-patch-v1` 패키지를 생성한다. 수정본에만 존재하는 새 파일과 원본 파일 삭제는 현재 지원하지 않는다.

### 2. 작품 정보 추가

`games/<게임 ID>/game.json`과 이미지 폴더를 만들고 `games/catalog.json`에 목록 항목을 추가한다. 게임 ID에는 영문 소문자, 숫자와 하이픈을 사용한다.

날짜 필드는 의미를 구분한다.

- `release`: 원작 출시일 (`YYYY-MM-DD`)
- `year`: 원작 출시 연도
- `date`: 한글 패치 최신 배포일 (`YYYY.MM.DD`), 기본 배포순 정렬 기준
- `version`: 사용자에게 표시할 패치 버전

이전 게시물은 별도 배포처가 아니라 참고 기록으로 저장한다.

```json
"references": [
  { "type": "legacy-post", "url": "https://example.com/post" }
]
```

### 3. 공용 폰트 연결

필요한 에뮬레이터용 BMP를 manifest의 `sharedAssets`에 등록한다. `source`, 파일 크기와 SHA-256은 저장소의 실제 파일과 정확히 일치해야 한다. 결과 ZIP에서는 `_emulator-font/` 아래에 배치된다.

### 4. 검증

배포 전 다음 사항을 확인한다.

- 모든 JSON이 정상적으로 파싱되는지
- catalog의 모든 항목에 `game.json`과 실제 패키지가 존재하는지
- 모든 원본 SHA-256이 준비한 원본과 일치하는지
- 브라우저 VCDIFF 디코더 결과가 한글판 파일과 바이트 단위로 일치하는지
- 공용 에셋의 크기와 SHA-256이 manifest와 일치하는지
- 로컬 정적 서버에서 JSON, 이미지, manifest와 `.xdelta`가 HTTP 200으로 제공되는지
- `npm test`가 통과하는지

## 안전 원칙

- 원본 파일을 네트워크로 업로드하지 않는다.
- 모든 대상 원본을 검증한 뒤에만 패치를 시작한다.
- 결과 파일의 크기와 SHA-256을 다시 검증한다.
- 절대 경로, `..`, 빈 경로 요소와 중복 대상을 거부한다.
- 결과 ZIP에는 변경된 파일과 manifest에 등록된 공용 에셋만 포함한다.
- 사용자가 원본을 별도로 백업하도록 안내한다.

패치 데이터가 GitHub Pages 저장소 크기에 부담을 줄 경우 `.xdelta`만 GitHub Releases로 옮기고 manifest에 다운로드 URL을 지정하는 방식을 검토한다.
