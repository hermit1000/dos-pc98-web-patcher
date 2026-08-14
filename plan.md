# DOS/PC-98 Web Patcher 구현 계획

## 1. 목표

GitHub Pages에서 실행되는 정적 웹 패처를 만든다. 사용자가 DOS 또는 PC-98 게임 폴더를 선택하면 브라우저 안에서 여러 대상 파일을 검사하고 VCDIFF/xdelta 패치를 적용한 뒤, 검증된 결과를 ZIP 파일로 내려받을 수 있어야 한다.

게임 원본 파일은 외부 서버로 업로드하지 않는다. 패치에 필요한 `manifest.json`과 `.xdelta` 파일만 GitHub Pages 또는 GitHub Releases에서 내려받는다.

```text
게임 선택
  → 게임 폴더 선택
  → 전체 대상 파일 검사
  → SHA-256 원본 검증
  → 브라우저 내부 VCDIFF 적용
  → 결과 SHA-256 검증
  → 패치된 파일 ZIP 다운로드
```

## 2. 저장소 역할

기존 `distribution_toolkit`과 새 웹 저장소의 책임을 분리한다.

### distribution_toolkit

- 원본 폴더와 수정본 폴더 비교
- xdelta 패치 생성
- `manifest.json` 생성
- Windows CLI 적용기 제공
- 단일 Windows EXE 생성

### dos-pc98-web-patcher

- 게임별 패치 목록 제공
- 사용자 게임 폴더 선택
- 브라우저 내부 SHA-256 검증
- 브라우저 내부 다중 파일 VCDIFF 적용
- 결과 ZIP 생성
- GitHub Pages 배포

두 저장소는 `folder-patch-v1` manifest 형식을 공통 인터페이스로 사용한다.

## 3. 초기 제공 범위

첫 번째 버전에서는 다음 기능을 제공한다.

- 게임별 패치 페이지
- 게임 폴더 선택 및 드래그 앤 드롭
- 하위 디렉터리를 포함한 다중 파일 검색
- 파일 크기와 SHA-256 검사
- 누락 파일, 다른 버전 및 이미 패치된 파일 판별
- 모든 대상의 사전 검증
- Web Worker 기반 VCDIFF 적용
- 패치 결과의 크기와 SHA-256 재검증
- 변경된 파일만 포함한 ZIP 다운로드
- 파일별 상태와 전체 진행률 표시
- GitHub Pages 자동 배포

다음 기능은 초기 버전 이후 검토한다.

- Chrome 및 Edge에서 원본 폴더 직접 패치
- `.folder-patch-backup` 자동 생성
- 수정본에만 존재하는 새 파일 추가
- 수정본에서 제거된 파일 삭제
- 전체 게임 폴더를 결과 ZIP으로 생성
- 여러 원본 버전에 대응하는 패치 선택

## 4. 패치 패키지 형식

현재 `distribution_toolkit`이 생성하는 구조를 사용한다.

```text
game-package/
  manifest.json
  patches/
    GAME.EXE.xdelta
    DATA/
      MESSAGE.DAT.xdelta
```

manifest 예시:

```json
{
  "format": "folder-patch-v1",
  "game": "게임 이름",
  "patchVersion": "1.0.0",
  "createdAt": "2026-08-14T00:00:00.000Z",
  "targets": [
    {
      "path": "GAME.EXE",
      "patch": "patches/GAME.EXE.xdelta",
      "originalSize": 100000,
      "patchedSize": 105000,
      "originalSha256": "...",
      "patchedSha256": "..."
    }
  ]
}
```

웹 패처는 manifest를 신뢰하기 전에 형식, 필수 속성, 상대 경로 및 중복 대상을 검증한다.

## 5. 게임 카탈로그

게임별 HTML이나 PHP를 복제하지 않고 공통 패처와 JSON 설정을 사용한다.

```text
games/
  index.json
  game-001.json
  game-002.json
```

게임 설정 예시:

```json
{
  "id": "game-001",
  "title": "게임 이름",
  "platform": "PC-98",
  "version": "1.0",
  "description": "한국어 패치",
  "package": "./packages/game-001/manifest.json",
  "cover": "./images/game-001.webp"
}
```

공통 패처는 쿼리 매개변수로 게임을 선택한다.

```text
patcher.html?game=game-001
```

## 6. 폴더 입력과 경로 처리

기본 입력은 다음 HTML 기능을 사용한다.

```html
<input type="file" webkitdirectory multiple>
```

각 파일의 상대 경로에서 사용자가 선택한 최상위 폴더 이름을 제거한 뒤 manifest의 `path`와 대조한다.

다음 경로는 반드시 거부한다.

- 절대 경로
- `..`가 포함된 경로
- 빈 경로 구성 요소
- 루트 밖으로 벗어나는 경로
- 같은 대상 경로의 중복 항목
- 패치 패키지 밖을 가리키는 패치 경로

DOS와 PC-98 게임의 파일명 특성을 고려하여 표시 경로는 원래 표기를 유지한다. Windows 대상 폴더 매칭에서는 대소문자 차이를 허용하되, 대소문자만 다른 중복 파일이 발견되면 안전을 위해 중단한다.

## 7. 사전 검증 절차

실제 패치 전에 모든 대상을 검사한다.

1. manifest 형식 검증
2. 필요한 대상 파일 존재 확인
3. 원본 및 결과 파일 크기 정보 검증
4. 대상 파일 SHA-256 계산
5. 원본, 이미 패치됨 또는 불일치 상태 판별
6. 필요한 `.xdelta` 파일 다운로드
7. 모든 대상이 처리 가능한 경우에만 패치 단계 활성화

하나라도 지원하지 않는 원본이 있으면 아무 결과도 생성하지 않는다.

## 8. VCDIFF 적용 엔진

Windows용 `xdelta3.exe`는 브라우저에서 실행할 수 없으므로 JavaScript 또는 WebAssembly 기반 VCDIFF 적용기를 사용한다.

적용 엔진을 결정하기 전에 다음 호환성을 검증한다.

- `distribution_toolkit`이 생성한 `.xdelta` 해석 가능 여부
- VCDIFF 기본 코드 테이블 지원
- source 및 target window 지원
- Adler-32 검증 정보 지원
- secondary compression과 custom code table 사용 여부
- 파일 크기가 변경되는 패치 지원

현재 제작기의 출력과 호환되지 않는 기능이 있으면 제작 단계에서 웹 호환 xdelta 옵션을 사용하도록 제한한다.

패치와 해시 계산은 Web Worker에서 수행하여 긴 작업 중에도 화면과 취소 버튼이 동작하도록 한다. 대상 파일은 한 번에 하나씩 처리하여 전체 게임 폴더를 동시에 메모리에 올리지 않는다.

## 9. 결과 생성

초기 버전은 변경된 파일만 포함한 ZIP을 생성한다.

```text
Game-Korean-Patch-Result.zip
  GAME.EXE
  DATA/
    MESSAGE.DAT
```

각 결과 파일은 ZIP에 추가하기 전에 다음 조건을 만족해야 한다.

- 결과 크기가 `patchedSize`와 일치
- 결과 SHA-256이 `patchedSha256`과 일치
- 안전한 상대 경로 사용

사용자는 결과 ZIP을 게임 폴더에 압축 해제하여 덮어쓴다. 웹 패처는 원본 폴더를 직접 변경하지 않으므로 원본 훼손 위험이 없다.

## 10. 사용자 화면

필수 화면 요소:

- 게임 제목, 플랫폼 및 패치 버전
- 원본 버전과 주의사항
- 게임 폴더 선택 영역
- 대상 파일별 검사 결과
- 전체 검사 및 패치 진행률
- 오류 원인과 해결 안내
- 패치 시작 버튼
- 결과 ZIP 다운로드 버튼

파일 상태는 다음처럼 구분한다.

```text
대기
검사 중
정상 원본
이미 패치됨
파일 누락
지원하지 않는 원본
패치 중
완료
검증 실패
```

## 11. 저장소 구조

```text
dos-pc98-web-patcher/
  index.html
  patcher.html
  src/
    app.js
    catalog.js
    folder-reader.js
    manifest.js
    verifier.js
    vcdiff.js
    patch-worker.js
    zip-output.js
  styles/
    main.css
  games/
    index.json
    example-game.json
  packages/
    example-game/
      manifest.json
      patches/
  images/
  test/
  .github/
    workflows/
      pages.yml
  LICENSE
  README.md
  plan.md
```

패치 데이터가 저장소 크기나 GitHub Pages 배포에 부담을 주면 `.xdelta` 파일만 GitHub Releases로 옮기고 manifest 또는 게임 설정에 절대 다운로드 URL을 기록한다.

## 12. 테스트 계획

단위 테스트:

- manifest 유효성 검사
- 안전한 상대 경로 판별
- Windows 방식 대소문자 경로 매칭
- 파일 누락 판별
- 정상 원본 SHA-256 판별
- 이미 패치된 파일 판별
- 다른 원본 거부
- VCDIFF 결과 검증
- 파일 크기가 달라지는 패치
- 결과 ZIP의 상대 경로 보존

통합 테스트:

- 여러 하위 폴더를 가진 샘플 게임 패치
- `distribution_toolkit`에서 생성한 실제 패키지 적용
- 여러 대상 중 하나가 잘못된 경우 전체 중단
- 이미 패치된 파일과 원본 파일이 섞인 경우
- 대용량 파일 처리와 진행률 표시
- Chrome 및 Edge 폴더 선택
- GitHub Pages 배포본에서 패치 파일 다운로드

## 13. 구현 단계

### 1단계: 기반 구성

- 저장소 초기화
- 정적 페이지와 기본 스타일
- 테스트 및 빌드 도구 설정
- GitHub Pages 배포 워크플로 추가

### 2단계: 데이터 계층

- 게임 카탈로그 로더
- 게임별 설정 로더
- manifest 파서와 검증기
- 안전한 URL 및 경로 처리

### 3단계: 폴더 검사

- 폴더 선택 및 드래그 앤 드롭
- 상대 경로 인덱스 생성
- SHA-256 계산
- 파일별 상태 및 전체 진행률

### 4단계: 패치 엔진

- 브라우저용 VCDIFF 적용기 선정 또는 구현
- Web Worker 연결
- 현재 toolkit의 xdelta 출력과 호환성 검증
- 결과 크기 및 SHA-256 검사

### 5단계: 결과 배포

- 다중 결과 파일 ZIP 생성
- 디렉터리 구조 보존
- 안전한 다운로드 파일명
- 사용자 안내와 오류 처리

### 6단계: 품질 검증

- 자동 테스트 완료
- 실제 DOS 및 PC-98 패치 패키지 시험
- 메모리와 처리 시간 측정
- 브라우저별 동작 확인
- README에 패치 등록 및 배포 절차 문서화

## 14. 완료 기준

다음 조건을 모두 만족하면 첫 버전을 완료한 것으로 본다.

- GitHub Pages에서 별도 서버 없이 실행된다.
- 원본 게임 파일이 네트워크로 업로드되지 않는다.
- 하위 폴더를 포함한 여러 파일을 한 패키지로 처리한다.
- 모든 원본을 검증한 뒤에만 패치를 시작한다.
- 모든 결과를 다시 검증한다.
- 변경된 파일이 원래 상대 경로를 유지한 ZIP으로 생성된다.
- 현재 `distribution_toolkit` 패키지와 호환된다.
- 잘못된 원본이나 위험한 manifest를 안전하게 거부한다.
- 자동 테스트와 실제 브라우저 통합 테스트가 통과한다.

## 15. 구현 원칙

- 원본 파일을 서버로 전송하지 않는다.
- 기본 모드에서는 원본 폴더를 변경하지 않는다.
- 검증되지 않은 결과 파일을 사용자에게 제공하지 않는다.
- 패치 적용보다 전체 사전 검증을 우선한다.
- 게임별 코드를 복제하지 않고 데이터로 관리한다.
- 외부 라이브러리는 라이선스와 유지보수 상태를 확인한 뒤 사용한다.
- 브라우저 호환성보다 데이터 안전성을 우선한다.
