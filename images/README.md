# 게임 이미지 저장 규칙

게임 이미지는 게임 ID별 디렉터리에 저장한다.

```text
images/
  games/
    silver-chronicle/
      cover.webp
      hero.webp
      screenshots/
        01.png
        02.png
        03.png
```

## 파일 용도

- `cover.webp`: 게임 목록 카드 이미지
- `hero.webp`: 게임 상세 페이지 상단 이미지
- `screenshots/01.png`: 게임 화면 스크린샷

파일명과 게임 ID에는 영문 소문자, 숫자와 하이픈만 사용한다. 게임 데이터의 `id`와 이미지 디렉터리 이름을 동일하게 유지한다.

## 권장 형식

- 표지와 일러스트: WebP
- 픽셀 그래픽 스크린샷: PNG 또는 lossless WebP
- 목록 표지 비율: 4:3
- 상세 상단 이미지: 최소 1200×900
- 스크린샷 비율: 원본 게임 화면 비율 유지

원본 게임 이미지와 스크린샷을 사용할 때는 공개 및 재배포 가능 여부를 확인한다. GitHub Pages에서 직접 제공할 이미지는 일반 Git 파일로 저장하고 Git LFS 포인터 파일은 사용하지 않는다.
