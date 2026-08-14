# DOS/PC-98 Web Patcher

DOS와 PC-98 게임의 다중 파일 한국어 패치를 브라우저에서 적용하기 위한 GitHub Pages 프로젝트다.

현재 단계에서는 다음 두 화면의 UI 프로토타입을 제공한다.

- `index.html`: 전체 게임 목록, 검색 및 플랫폼 필터
- `patcher.html?game=게임ID`: 게임 정보와 패치 UI 상세 화면

게임 이미지는 `images/games/<게임ID>/` 아래에 저장한다. 자세한 파일명과 형식은 `images/README.md`를 참고한다.

실제 SHA-256 검사, VCDIFF 적용 및 ZIP 생성 기능은 아직 연결하지 않았다.

## 로컬에서 보기

정적 파일 서버를 실행한다.

```powershell
npx serve .
```

또는 VS Code Live Server와 같은 정적 서버를 사용할 수 있다.
