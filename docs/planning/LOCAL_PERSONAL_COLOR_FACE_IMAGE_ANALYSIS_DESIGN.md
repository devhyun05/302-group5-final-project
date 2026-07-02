# 설문 기반 퍼스널 컬러 및 이미지 타입 체크 설계

작성일: 2026-07-01
대상 앱: `apps/mobile` AURA 모바일 앱
목표: 빠른 배포를 위해 사진 촬영, 이미지 업로드, 백엔드 없이 설문만으로 퍼스널 컬러, 이미지 타입, 어울리는 헤어/체형/패션 방향을 확인하는 모바일 앱 흐름을 구현한다.

## 1. 설계 요약

이 기능은 사용자가 34개의 설문에 답하면 앱 내부 scoring service가 즉시 결과를 만든다.

- 퍼스널 컬러 후보: 봄웜, 여름쿨, 가을웜, 겨울쿨, 뉴트럴
- 세부 방향: 라이트, 브라이트, 뮤트, 딥, 소프트, 클리어
- 이미지 타입: 맑고 러블리, 부드럽고 내추럴, 차분하고 클래식, 시크하고 모던
- 메이크업/헤어/패션 방향: 추천 무드, 팔레트, 추천 헤어, 추천 패션/핏, 피하면 좋은 표현

핵심 원칙은 "사진을 받지 않는다"이다. 카메라, 앨범, 얼굴 인식, 이미지 분석, 백엔드 API 없이 설문 답변만 사용한다.

## 2. 범위와 비범위

### 포함 범위

- 온보딩 첫 화면에서 설문 진입
- 설문 34문항 단일 플로우
- 앱 내부 scoring service
- 결과 저장을 위한 기기 로컬 service
- 최근 결과 5개 저장
- 퍼스널 컬러/이미지 타입/헤어/패션 추천 결과 화면
- 결과 상세 카드
- 추천 메이크업 팁
- 다시 설문하기/처음으로 이동

### 제외 범위

- 사진 촬영, 사진 선택, 이미지 업로드
- 사진 촬영 플로우 연결
- 백엔드 API, 데이터베이스, 클라우드 스토리지
- 실제 AI 서버 호출
- 유명인, 인플루언서, 배우, 실존 인물 닮은꼴 판정
- 이름, SNS 계정, 신원, 나이, 성별, 인종, 민족성 추정
- 의료적 피부 진단 또는 질병 판단
- 팀 합의 없는 새 라이브러리 추가

## 3. 사용자 가치

- 사진을 준비하지 않아도 바로 시작할 수 있다.
- 개인정보 부담이 낮다.
- 네트워크 없이 데모와 배포가 가능하다.
- 설문 결과가 메이크업 추천 방향으로 자연스럽게 이어진다.
- 빠른 배포 이후 실제 분석 기능이 붙어도 service 경계를 유지할 수 있다.

## 4. 핵심 사용자 플로우

```text
Tutorial
-> LocalBeautySurvey
-> LocalBeautySurveyResult
```

재진단 흐름:

```text
LocalBeautySurveyResult
-> LocalBeautySurvey
-> LocalBeautySurveyResult
```

처음으로 돌아가기:

```text
LocalBeautySurveyResult
-> Tutorial
```

## 5. 화면 설계

### 5.1 Tutorial

역할:

- 앱 첫 화면
- 사진 없이 설문만으로 체크한다는 점을 명확히 안내
- `LocalBeautySurvey`로 진입
- 저장된 결과가 있으면 최신 결과로 다시 진입

주요 UI:

- 타이틀: "사진 없이 빠르게 체크해요."
- 설명: "34개의 설문으로 컬러, 이미지, 헤어와 패션 방향을 확인해보세요."
- CTA: "시작하기"
- 보조 CTA: "최근 결과 보기"

### 5.2 LocalBeautySurvey

역할:

- 한 화면에 한 문항씩 보여준다.
- 사용자가 답변을 선택하면 다음으로 이동할 수 있다.
- 마지막 문항에서 결과를 생성하고 `resultId`만 결과 route로 넘긴다.

문항:

1. 피부가 편안해 보이는 톤 반응
2. 잘 맞는 액세서리 금속감
3. 잘 받는 의상 컬러
4. 실패가 적었던 립/치크 톤
5. 얼굴에 잘 맞는 대비감
6. 자주 듣거나 원하는 이미지 분위기
7. 얼굴 분위기의 선
8. 스타일링의 전체 리듬
9. 메이크업 디테일 방향
10. 손목 혈관/피부 바탕 언더톤 힌트
11. 햇빛을 받은 뒤 피부 반응
12. 얼굴이 편안해 보이는 헤어 톤
13. 자연스럽게 맞는 헤어 길이와 실루엣
14. 잘 어울리는 헤어 스타일링 질감
15. 앞머리나 가르마 방향
16. 헤어 볼륨 정도
17. 옷을 입었을 때 안정적인 체형 밸런스
18. 상의 핏
19. 하의 실루엣
20. 허리선 연출
21. 전체 패션 실루엣
22. 옷차림의 패션 무드
23. 패턴이나 장식 크기
24. 레이어링 방식
25. 얻고 싶은 이미지 키워드
26. 잘 맞추고 싶은 상황 스타일
27. 눈동자와 눈썹의 대비감
28. 얼굴에 잘 맞는 색의 채도
29. 옷의 패턴/디테일 무드
30. 얼굴 가까이 오는 액세서리 크기
31. 옷 소재와 메이크업 질감
32. 눈썹 라인 형태
33. 립 경계와 질감 표현
34. 가장 끌리는 전체 스타일 방향

구현 위치:

- `apps/mobile/src/features/local-beauty-analysis/screens/LocalBeautySurveyScreen.tsx`
- `apps/mobile/src/features/local-beauty-analysis/services/localBeautySurveyScoring.ts`
- `apps/mobile/src/features/local-beauty-analysis/services/localBeautySurveyService.ts`

### 5.3 LocalBeautySurveyResult

역할:

- 설문 결과를 보고서처럼 보여준다.
- 결과를 단정하지 않고 참고용 뷰티 방향으로 표현한다.
- 팔레트, 이미지 타입 키워드, 추천 무드, 헤어/패션 추천, 피하면 좋은 표현을 보여준다.

주요 섹션:

- 퍼스널 컬러 결과
- 이미지 분석 결과
- 주요 이미지/보조 이미지/이미지 키워드
- 이미지별 스타일링 가이드
- 추천 헤어
- 추천 패션/핏
- 추천 컬러 팔레트
- 답변 일치도
- 결과 상세 카드
- 추천 무드
- 추천 메이크업 팁
- 피하면 좋은 표현
- 최근 결과
- 공유하기
- 다시 설문하기/처음으로

구현 위치:

- `apps/mobile/src/features/local-beauty-analysis/screens/LocalBeautySurveyResultScreen.tsx`

## 6. 도메인 모델

```ts
export type PersonalColorSeason =
  | 'springWarm'
  | 'summerCool'
  | 'autumnWarm'
  | 'winterCool'
  | 'neutral';

export type PersonalColorDepth =
  | 'light'
  | 'bright'
  | 'mute'
  | 'deep'
  | 'soft'
  | 'clear';

export type FaceImageType =
  | 'clean'
  | 'lovely'
  | 'chic'
  | 'classic'
  | 'natural'
  | 'modern'
  | 'soft';

export type LocalBeautySurveyAnswers = Record<
  LocalBeautySurveyQuestionId,
  LocalBeautySurveyOptionId
>;
```

결과 타입은 다음 정보를 포함한다.

- `personalColor.label`
- `personalColor.season`
- `personalColor.depth`
- `personalColor.confidence`
- `personalColor.palette`
- `faceImage.label`
- `faceImage.primaryType`
- `faceImage.secondaryTypes`
- `faceImage.keywords`
- `faceImage.confidence`
- `hairRecommendation.label`
- `hairRecommendation.color`
- `hairRecommendation.tips`
- `styleRecommendation.label`
- `styleRecommendation.fit`
- `styleRecommendation.silhouette`
- `styleRecommendation.tips`
- `recommendedMood`
- `avoidedMakeupNotes`

## 7. 서비스 경계

화면은 scoring 로직을 직접 갖지 않는다.

```text
features/local-beauty-analysis/
  screens/
    LocalBeautySurveyScreen.tsx
    LocalBeautySurveyResultScreen.tsx
  services/
    localBeautySurveyScoring.ts
    localBeautySurveyScoring.test.ts
    localBeautySurveyService.ts
    localBeautySurveyService.test.ts
    localBeautyResultPresentation.ts
    localBeautyResultPresentation.test.ts
  index.ts
```

역할:

- `localBeautySurveyScoring.ts`: 답변을 퍼스널 컬러/이미지 타입/헤어/패션 추천 결과로 변환
- `localBeautySurveyService.ts`: 백엔드 없이 결과를 기기 로컬과 인메모리에 저장/조회
- `localBeautyResultPresentation.ts`: 결과 상세 카드, 최근 결과 카드, 추천 메이크업 팁 표시 모델 생성
- screen: 질문 표시, 답변 state, 결과 route 이동만 담당

## 8. Scoring 전략

각 선택지는 season, depth, image type, hair, style score를 가진다.

예시:

- 코랄/피치, 밝고 부드러운 대비, 맑고 러블리 분위기: `봄웜 라이트`
- 라벤더/로즈, 실버, 부드러운 쿨 컬러: `여름쿨 라이트`
- 카멜/올리브/브라운, 낮은 대비, 클래식 내추럴: `가을웜 뮤트`
- 블랙/화이트/버건디, 높은 대비, 시크 모던: `겨울쿨 딥`
- 금속감이나 색감이 양쪽 모두 무난하면 `뉴트럴` 후보를 올린다.

결과는 최고 점수 season/depth/image type을 선택한다. confidence는 최고 점수가 전체 점수에서 차지하는 비율로 계산하며, 너무 낮거나 높게 치우치지 않도록 50-96% 범위로 제한한다.

## 9. 결과 카피 기준

좋은 표현:

- "봄웜 라이트"
- "맑고 러블리한 이미지"
- "사진 없이 설문 답변만으로 빠르게 잡은 방향이에요."
- "실제 메이크업에서는 밝기와 채도를 한 단계씩 조절해보세요."

피해야 할 표현:

- "당신은 반드시 봄웜입니다"처럼 단정하는 문장
- "연예인 누구와 닮았어요" 같은 실존 인물 비교
- "어려 보인다", "나이 들어 보인다" 같은 나이 판단
- "여성스럽다", "남성스럽다" 같은 성별 고정 표현
- 피부 질환, 건강 상태를 판단하는 문장

## 10. 개인정보 및 안전 설계

기본 정책:

- 사진을 요청하지 않는다.
- 카메라 권한을 요청하지 않는다.
- 사진 업로드나 사진 분석을 요청하지 않는다.
- 결과 이미지를 사진 앱에 저장할 때만 iOS 사진 추가 권한을 요청한다.
- 서버 업로드가 없다.
- 설문 답변은 앱 세션 안에서만 결과 생성에 사용한다.
- 최근 결과는 기기 로컬에 최대 5개만 저장한다.

사용자 안내:

- "사진 촬영이나 업로드 없이, 선택한 답변만으로 결과를 만들어요."
- "결과는 설문 기반 뷰티 참고 정보예요."

## 11. 내비게이션

active stack route:

```ts
Tutorial: undefined;
LocalBeautySurvey: undefined;
LocalBeautySurveyResult: { resultId: string };
```

`RootNavigator`와 active deep link 목록은 설문 체크 플로우만 등록한다. 촬영/사진 분석 route와 인앱 개인정보 안내 route는 빠른 설문 체크 버전에서 제외한다. 개인정보 처리방침은 App Store Connect에 제출하는 외부 URL과 앱 개인정보 항목으로 관리한다.

## 12. 앱스토어 제출 기준

메타데이터 기준:

- 사진, 카메라, AI 얼굴 분석, AR 필터를 현재 버전의 핵심 기능처럼 설명하지 않는다.
- 권장 설명: "사진 없이 34개 설문으로 퍼스널 컬러, 이미지 타입, 헤어와 패션 방향을 확인하는 뷰티 참고 앱"
- 결과 정확도를 보장하는 표현 대신 "설문 기반", "참고", "답변 경향", "답변 일치도"를 사용한다.

개인정보 기준:

- 카메라 사용: 없음
- 사진 보관함 사용: 없음
- 계정 생성 필수: 없음
- 서버 업로드: 없음
- 결과 공유는 `공유하기` 버튼에서 iOS 기본 공유 기능을 사용자가 선택한 경우에만 진행된다.
- 최근 결과는 기기 안에 저장되며 서버로 전송하지 않는다.

릴리즈 기준:

- App Store/TestFlight 빌드는 Metro 개발 서버나 development client URL에 의존하지 않는다.
- `app.json`, `package.json`, `Podfile.lock`에 카메라/사진 선택 의존성이 남아 있지 않아야 한다.
- 개인정보 처리방침 URL은 위 동작과 동일하게 작성해 App Store Connect에 제출한다.

## 13. 테스트 계획

구현된 테스트:

- `localBeautySurveyScoring.test.ts`
  - 설문 문항 수가 34개인지 확인
  - 봄웜 라이트/맑고 러블리 결과 매핑 확인
  - 가을웜 뮤트/차분하고 클래식 결과 매핑 확인
  - 겨울쿨 딥/시크하고 모던 결과 매핑 확인
  - 헤어/패션 추천 매핑 확인
- `localBeautySurveyService.test.ts`
  - 설문 제출 후 `resultId`로 결과를 조회할 수 있는지 확인
  - 최근 결과 목록에서 최신 결과를 조회할 수 있는지 확인
- `localBeautyResultPresentation.test.ts`
  - 결과 상세 카드, 추천 메이크업 팁, 최근 결과 카드 표시 모델 확인
- `localBeautyResultConfidencePresentation.test.ts`
  - 결과 수치를 `답변 일치도`로 표시하는지 확인

수동 확인:

- 시작 화면에서 "시작하기"를 누르면 설문으로 이동한다.
- 저장된 결과가 있으면 시작 화면의 "최근 결과 보기"로 최신 결과를 열 수 있다.
- 설문은 답변 선택 전 다음 버튼이 비활성화된다.
- 마지막 문항에서 결과 화면으로 이동한다.
- 결과 화면에서 `공유하기`를 누르면 결과지 이미지를 사진 앱에 저장하거나 iOS 공유 시트에 전달할 수 있다.
- 결과 화면에서 다시 설문하기/처음으로 이동이 동작한다.
- 카메라 권한 요청이 발생하지 않는다.
- 결과 이미지 저장을 선택하기 전에는 사진 추가 권한 요청이 발생하지 않는다.

모바일 코드 변경 시 확인:

```text
cd apps/mobile
npm run typecheck
```

## 14. 완료 기준

- 사진 촬영 없이 앱 첫 화면에서 설문을 시작할 수 있다.
- 설문 34문항을 완료하면 결과 화면으로 이동한다.
- 결과 화면에 퍼스널 컬러, 이미지 분석, 추천 헤어, 추천 패션/핏이 주요 결과로 표시된다.
- 이미지 분석은 주요 이미지, 보조 이미지, 키워드, 스타일링 가이드를 포함한다.
- 결과 상세 카드와 추천 메이크업 팁을 제공한다.
- 최근 결과는 최대 5개까지 기기 안에 저장하고 최근 결과 카드로 다시 열 수 있다.
- 백엔드, AI 서버, 카메라 권한이 필요 없다.
- 새 UI 라이브러리나 아이콘 라이브러리를 추가하지 않는다.
- `apps/mobile` 기준 `npm run typecheck`가 통과한다.
