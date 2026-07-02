# 로컬 뷰티 설문 질문/선택지/분석 로직

## 목적

사진 촬영이나 백엔드 없이 설문만으로 퍼스널 컬러, 이미지 타입, 메이크업, 헤어, 체형/패션/스타일링 방향을 빠르게 제안한다.

현재 구현은 `apps/mobile/src/features/local-beauty-analysis/services/localBeautySurveyScoring.ts`가 단일 소스다. 화면은 이 질문 목록을 그대로 사용하고, 결과 저장 서비스는 답변 원본과 `모르겠음`으로 답한 문항을 함께 저장한다.

## 현재 문항 수

- 기본 문항: 34개
- 세부 문항 seed: 33개
- 세부 문항 반복 생성: seed 1개당 3개
- 최종 문항 수: 133개
- 모든 문항에는 공통으로 `모르겠음` 선택지가 추가된다.

세부 문항은 `R1`, `R2`, `R3` suffix로 생성된다.

- `R1`: 원래 질문
- `R2`: 평소 버전
- `R3`: 최근 사진 기준 버전

## 공통 `모르겠음` 처리

모든 문항의 마지막 선택지는 다음 값이다.

| id | label | 의미 |
| --- | --- | --- |
| `unknown` | 모르겠음 | 지금 판단하기 어려운 답변. 결과 계산에는 점수를 더하지 않고, 결과에 `unknownQuestionIds`로 저장한다. |

각 질문에는 `unknownGuide`가 있으며, 사용자가 애매할 때 확인할 방법을 설명한다. 가이드는 질문 텍스트를 기준으로 헤어, 패션/체형, 메이크업, 컬러, 이미지 계열로 자동 분류된다.

## 분석 점수 축

각 선택지는 필요에 따라 아래 점수 축에 가중치를 더한다.

| 축 | 결과 |
| --- | --- |
| `season` | 퍼스널 컬러 시즌: `springWarm`, `summerCool`, `autumnWarm`, `winterCool`, `neutral` |
| `depth` | 컬러 깊이: `light`, `bright`, `mute`, `deep`, `soft`, `clear` |
| `faceImage` | 이미지 타입: `clean`, `lovely`, `chic`, `classic`, `natural`, `modern`, `soft` |
| `hair` | 헤어 추천 타입: `classicCcurveMedium`, `naturalLayeredMedium`, `shortTexturedPoint`, `sleekStraightLong`, `softLayeredBob` |
| `style` | 패션/스타일 추천 타입: `classicTailoredFit`, `cleanMinimal`, `lightRomantic`, `softCasual`, `urbanStatementFit` |

분석은 모든 답변을 순회하며 선택지의 점수를 누적한다. 각 축에서 가장 높은 점수의 key가 최종 결과가 된다. 점수가 없거나 모두 `모르겠음`인 축은 기본 fallback을 사용한다.

## 결과 저장 필드

`LocalBeautySurveyResult`에는 기존 분석 결과 외에 아래 필드가 포함된다.

| 필드 | 의미 |
| --- | --- |
| `surveyAnswers` | 전체 질문 id별 선택지 id. 이후 답변 수정과 재분석에 사용한다. |
| `unknownQuestionIds` | `unknown`으로 답한 질문 id 목록. 최근 결과에서 이 문항만 다시 답할 때 사용한다. |

## 기본 문항

| id | 영역 | 질문 | 선택지 |
| --- | --- | --- | --- |
| `skinReaction` | 톤 반응 | 피부가 가장 편안해 보이는 순간은 언제인가요? | `brightPeach` 피치빛이 돌 때 / `pinkCool` 핑크빛이 돌 때 / `calmBeige` 베이지빛이 돌 때 / `clearContrast` 대비가 또렷할 때 |
| `jewelryTone` | 금속감 | 액세서리는 어떤 톤이 더 자연스럽나요? | `gold` 골드 / `silver` 실버 / `both` 둘 다 무난함 |
| `bestColors` | 의상 컬러 | 옷을 입었을 때 칭찬을 많이 듣는 색은? | `clearWarm` 아이보리, 피치, 코랄 / `powderCool` 라벤더, 로즈, 소프트 블루 / `mutedEarth` 카멜, 올리브, 브라운 / `vividMono` 블랙, 화이트, 버건디 |
| `makeupTone` | 메이크업 | 가장 실패가 적었던 립/치크 톤은? | `coralPeach` 코랄, 피치 / `rosePink` 로즈, 핑크 / `roseBrown` 로즈 브라운, 누드 / `berryRed` 베리, 레드 |
| `contrast` | 대비감 | 얼굴에 가장 잘 맞는 선명도는? | `softLight` 밝고 부드러움 / `lowSoft` 낮고 차분함 / `highClear` 높고 선명함 / `mediumNatural` 중간 정도 |
| `impression` | 이미지 타입 | 가장 자주 듣거나 원하는 분위기는? | `cleanLovely` 맑고 러블리 / `softNatural` 부드럽고 내추럴 / `classicNatural` 차분하고 클래식 / `chicModern` 시크하고 모던 |
| `imageLine` | 이미지 선 | 얼굴 분위기를 선으로 표현하면 어디에 가까운가요? | `roundedSoft` 둥글고 부드러운 선 / `balancedClean` 깔끔하고 균형 잡힌 선 / `definedSharp` 또렷하고 선명한 선 / `calmStraight` 차분하고 곧은 선 |
| `imagePace` | 이미지 리듬 | 스타일링의 전체 리듬은 어느 쪽이 자연스럽나요? | `airyFresh` 가볍고 산뜻함 / `relaxedNatural` 편안하고 자연스러움 / `refinedClassic` 정돈되고 클래식함 / `boldMinimal` 간결하고 강한 포인트 |
| `imageDetail` | 이미지 디테일 | 메이크업 디테일은 어떤 쪽이 잘 맞나요? | `glossyLight` 얇고 윤기 있게 / `softBlur` 부드럽게 흐리기 / `structuredMatte` 단정하게 정리하기 / `sharpPoint` 선명한 한 포인트 |
| `undertoneClue` | 언더톤 힌트 | 손목 혈관이나 피부 바탕은 어디에 가까운가요? | `warmVein` 초록빛이 도는 편 / `coolVein` 푸른빛이 도는 편 / `neutralVein` 초록/푸른빛이 섞임 / `unclearVein` 잘 모르겠음 |
| `sunReaction` | 햇빛 반응 | 햇빛을 받은 뒤 피부는 보통 어떻게 변하나요? | `goldenTan` 노릇하게 생기가 돎 / `redEasily` 쉽게 붉어짐 / `oliveTan` 차분하게 그을림 / `staysEven` 큰 변화가 적음 |
| `hairTone` | 헤어 톤 | 가장 얼굴이 편안해 보였던 헤어 컬러는? | `warmBrown` 따뜻한 브라운 / `ashBrown` 애쉬 브라운 / `deepBlack` 딥 블랙 / `softBlack` 소프트 블랙 |
| `hairLength` | 헤어 실루엣 | 어떤 헤어 길이와 실루엣이 가장 자연스럽나요? | `softBob` 가벼운 보브/단발 / `mediumLayer` 미디엄 레이어 / `sleekLong` 차분한 롱 헤어 / `shortPoint` 짧은 포인트 컷 |
| `hairStyling` | 헤어 질감 | 헤어 스타일링은 어떤 질감이 잘 맞나요? | `lightWave` 가볍고 부드러운 웨이브 / `naturalAir` 내추럴한 공기감 / `cCurveVolume` 정돈된 C컬 볼륨 / `straightGloss` 매끈한 스트레이트 |
| `hairParting` | 앞머리/가르마 | 앞머리나 가르마는 어떤 쪽이 가장 편안한가요? | `airyBangs` 가벼운 시스루 앞머리 / `curtainBangs` 자연스러운 커튼뱅 / `noBangsSleek` 앞머리 없이 깔끔하게 / `sidePartVolume` 사이드 가르마 볼륨 |
| `hairVolume` | 헤어 볼륨 | 헤어 볼륨은 어느 정도가 가장 자연스럽나요? | `crownSoftVolume` 정수리의 자연스러운 볼륨 / `sideLightVolume` 옆선의 가벼운 볼륨 / `lowCalmVolume` 낮고 차분한 볼륨 / `flatSleekLine` 납작하고 매끈한 라인 |
| `bodyFitBalance` | 체형 밸런스 | 옷을 입었을 때 가장 안정적인 비율은? | `upperLightBalance` 상체를 가볍게 / `waistDefinedBalance` 허리선을 살짝 잡기 / `straightRelaxedBalance` 일자로 편안하게 / `shoulderStructuredBalance` 어깨선을 선명하게 |
| `topFit` | 상의 핏 | 상의는 어떤 핏이 가장 잘 어울렸나요? | `fittedRibTop` 가볍게 붙는 니트/티 / `relaxedShirtTop` 여유 있는 셔츠 / `croppedJacketTop` 짧고 깔끔한 재킷 / `structuredBlazerTop` 구조감 있는 블레이저 |
| `bottomFit` | 하의 핏 | 하의는 어떤 실루엣이 가장 안정적인가요? | `straightDenimBottom` 스트레이트 데님 / `wideSlacksBottom` 여유 있는 와이드 슬랙스 / `aLineBottom` A라인 스커트/팬츠 / `longColumnBottom` 긴 I라인 하의 |
| `waistStyling` | 허리선 | 허리선 연출은 어느 쪽이 더 자연스럽나요? | `highWaistLine` 하이웨이스트로 올리기 / `lowRiseRelaxedLine` 낮고 편안하게 두기 / `tuckedCleanLine` 넣어 입어 정리하기 / `untuckedLayerLine` 빼서 레이어드하기 |
| `fashionSilhouette` | 패션 실루엣 | 전체 옷 실루엣은 어디에 가까울 때 좋나요? | `softCompactSilhouette` 작고 부드러운 균형 / `naturalLooseSilhouette` 자연스러운 루즈핏 / `classicIlineSilhouette` 단정한 I라인 / `modernSharpSilhouette` 선명한 모던 실루엣 |
| `fashionMood` | 패션 무드 | 옷차림의 분위기는 어느 쪽이 가장 끌리나요? | `romanticFreshMood` 산뜻하고 로맨틱 / `minimalCleanMood` 깨끗하고 미니멀 / `elegantQuietMood` 차분하고 우아함 / `urbanStatementMood` 도시적이고 강한 포인트 |
| `patternScale` | 패턴 크기 | 패턴이나 장식 크기는 어느 정도가 편안한가요? | `smallPrintPattern` 작고 밝은 패턴 / `plainTexturePattern` 무지와 소재감 / `stripeCheckPattern` 스트라이프/체크 / `boldGraphicPattern` 큰 그래픽 포인트 |
| `layeringStyle` | 레이어링 | 레이어링은 어떤 방식이 가장 안정적인가요? | `oneToneSetLayer` 원톤 세트처럼 정리 / `lightLayering` 가벼운 한 겹 더하기 / `tailoredLayering` 재킷 중심으로 단정하게 / `contrastLayering` 대비 있는 레이어 |
| `imageKeyword` | 이미지 키워드 | 가장 얻고 싶은 스타일 키워드는 무엇인가요? | `freshFriendlyKeyword` 상큼하고 친근함 / `calmGentleKeyword` 차분하고 부드러움 / `refinedTrustKeyword` 정돈되고 신뢰감 있음 / `boldPresenceKeyword` 선명한 존재감 |
| `occasionStyle` | 상황 스타일 | 가장 잘 맞추고 싶은 상황 스타일은? | `dailyCasualOccasion` 데일리 캐주얼 / `officeCleanOccasion` 오피스/면접 / `dateSoftOccasion` 데이트/약속 / `eveningPointOccasion` 모임/촬영 |
| `eyeContrast` | 눈매 대비 | 눈동자와 눈썹의 대비감은 어느 쪽인가요? | `softBrown` 부드러운 브라운 / `clearBrown` 맑고 밝은 브라운 / `deepContrast` 진하고 또렷함 / `mutedGray` 차분하고 낮은 대비 |
| `colorSaturation` | 채도 | 얼굴에 잘 맞는 색의 진하기는? | `lightClear` 밝고 맑은 색 / `mutedSoft` 탁하지 않은 저채도 / `deepRich` 깊고 진한 색 / `neutralBalanced` 중간 채도 |
| `patternMood` | 패턴 무드 | 옷의 패턴이나 디테일은 어떤 쪽이 잘 맞나요? | `delicateDetail` 작고 섬세한 디테일 / `naturalTexture` 내추럴한 질감 / `classicTailored` 단정한 테일러드 / `minimalStatement` 미니멀한 한 포인트 |
| `accessoryScale` | 액세서리 크기 | 얼굴 가까이 오는 액세서리 크기는? | `smallSoft` 작고 부드러운 포인트 / `mediumClean` 깔끔한 중간 크기 / `refinedSimple` 절제된 심플 포인트 / `boldSharp` 큰 포인트도 소화 |
| `fabricTexture` | 소재감 | 옷 소재는 어떤 질감이 얼굴과 잘 어울리나요? | `sheerGlossy` 가볍고 윤기 있는 소재 / `softCotton` 부드러운 코튼/니트 / `suedeMatte` 차분한 스웨이드/매트 / `crispLeather` 선명한 레더/새틴 |
| `browLine` | 눈썹 라인 | 눈썹은 어떤 형태가 가장 편안한가요? | `softArch` 부드러운 아치 / `straightNatural` 자연스러운 일자 / `cleanArch` 정돈된 세미 아치 / `sharpDefined` 또렷한 각도 |
| `lipBoundary` | 립 경계 | 립 표현은 어떤 방식이 가장 안정적인가요? | `blurTint` 부드럽게 번진 틴트 / `glossTint` 맑고 촉촉한 틴트 / `satinNatural` 차분한 새틴 립 / `clearFull` 선명한 풀립 |
| `overallPreference` | 최종 무드 | 가장 끌리는 전체 스타일 방향은? | `warmFresh` 따뜻하고 산뜻한 무드 / `coolClean` 차갑고 깨끗한 무드 / `earthyElegant` 차분하고 우아한 무드 / `statementChic` 선명하고 시크한 무드 |

## 세부 문항 seed

아래 seed 각각은 `R1`, `R2`, `R3` 3개 문항으로 확장된다. 실제 선택지는 연결된 option set을 사용한다.

| seed id | 영역 | 질문 | option set |
| --- | --- | --- | --- |
| `detailNaturalLightSkin` | 컬러 세부 | 자연광에서 얼굴이 가장 맑아 보이는 색감은? | `colorTemperature` |
| `detailIndoorSkin` | 컬러 세부 | 실내 조명에서도 안정적으로 보이는 색감은? | `colorTemperature` |
| `detailWhiteBalance` | 컬러 세부 | 흰 상의를 입었을 때 얼굴 반응은? | `colorTemperature` |
| `detailBlackBalance` | 컬러 세부 | 검정 상의를 입었을 때 인상은? | `colorTemperature` |
| `detailPastelReaction` | 컬러 세부 | 파스텔 컬러를 입었을 때 얼굴은? | `colorTemperature` |
| `detailEarthReaction` | 컬러 세부 | 카멜/올리브/브라운 계열은 어떤가요? | `colorTemperature` |
| `detailVividReaction` | 컬러 세부 | 선명한 원색을 입었을 때는? | `colorTemperature` |
| `detailMonochromeReaction` | 컬러 세부 | 흑백 조합을 입었을 때 전체 인상은? | `colorTemperature` |
| `detailBlushArea` | 메이크업 세부 | 블러셔 면적은 어느 쪽이 안정적인가요? | `lipCheek` |
| `detailLipDepth` | 메이크업 세부 | 립 컬러의 깊이는 어느 정도가 좋은가요? | `lipCheek` |
| `detailEyeShadowDepth` | 메이크업 세부 | 아이섀도 음영은 어떤 쪽이 편안한가요? | `baseFinish` |
| `detailBaseLongevity` | 메이크업 세부 | 시간이 지나도 덜 무너져 보이는 베이스는? | `baseFinish` |
| `detailMakeupBoundary` | 메이크업 세부 | 메이크업 경계감은 어디까지 괜찮나요? | `baseFinish` |
| `detailHighlightReaction` | 메이크업 세부 | 하이라이터나 광 표현은 얼마나 어울리나요? | `baseFinish` |
| `detailHairFaceFrame` | 헤어 세부 | 얼굴 옆머리 연출은 어떤 쪽이 좋은가요? | `hairDirection` |
| `detailHairEnds` | 헤어 세부 | 머리 끝선은 어떤 방향이 자연스럽나요? | `hairDirection` |
| `detailHairBangWeight` | 헤어 세부 | 앞머리 무게감은 어느 정도가 편안한가요? | `hairDirection` |
| `detailHairShine` | 헤어 세부 | 모발 윤기 표현은 어느 쪽이 잘 맞나요? | `hairDirection` |
| `detailHairColorBrightness` | 헤어 세부 | 헤어 컬러 밝기는 어느 정도가 좋았나요? | `colorTemperature` |
| `detailTopNeckline` | 패션 세부 | 상의 네크라인은 어떤 쪽이 편안한가요? | `fashionFit` |
| `detailShoulderLine` | 패션 세부 | 어깨선은 어느 정도 잡히는 게 좋나요? | `fashionFit` |
| `detailOuterLength` | 패션 세부 | 아우터 길이는 어떤 쪽이 안정적인가요? | `fashionFit` |
| `detailPantsRise` | 패션 세부 | 팬츠 밑위와 허리 위치는? | `fashionFit` |
| `detailSkirtShape` | 패션 세부 | 스커트나 원피스 하단은 어떤 선이 좋은가요? | `fashionFit` |
| `detailLayerContrast` | 스타일링 세부 | 레이어링의 색 대비는 어느 정도가 좋나요? | `patternTexture` |
| `detailTextureWeight` | 스타일링 세부 | 소재 두께감은 어느 쪽이 어울리나요? | `patternTexture` |
| `detailPatternDistance` | 스타일링 세부 | 패턴이 얼굴 가까이에 있을 때 반응은? | `patternTexture` |
| `detailAccessoryEarring` | 스타일링 세부 | 귀걸이 형태는 어떤 쪽이 좋나요? | `accessoryShape` |
| `detailAccessoryGlasses` | 스타일링 세부 | 안경테나 선글라스 프레임은? | `accessoryShape` |
| `detailDailyMood` | 이미지 세부 | 데일리룩에서 가장 듣고 싶은 인상은? | `imageMood` |
| `detailWorkMood` | 이미지 세부 | 업무나 면접 상황에서 원하는 이미지는? | `imageMood` |
| `detailDateMood` | 이미지 세부 | 약속이나 데이트에서 원하는 이미지는? | `imageMood` |
| `detailPhotoMood` | 이미지 세부 | 사진 촬영에서 가장 잘 사는 분위기는? | `imageMood` |

## 세부 문항 option set

| option set | 선택지 |
| --- | --- |
| `accessoryShape` | `detailAccessoryRoundSmall` 작고 둥근 포인트 / `detailAccessoryMinimalClean` 미니멀한 직선 포인트 / `detailAccessoryClassicMetal` 클래식한 금속 포인트 / `detailAccessoryBoldLine` 큰 직선 포인트 |
| `baseFinish` | `detailBaseClearGlow` 얇은 윤광 / `detailBaseSoftSemiMatte` 소프트 세미매트 / `detailBaseStructuredMatte` 정돈된 매트 / `detailBaseHighContrastClean` 균일하고 선명한 베이스 |
| `colorTemperature` | `detailColorWarmPeach` 따뜻한 피치 / `detailColorCoolRose` 차가운 로즈 / `detailColorMutedBrown` 톤다운 브라운 / `detailColorCoolContrast` 선명한 쿨 대비 |
| `fashionFit` | `detailFashionLightWaist` 가벼운 허리선 / `detailFashionRelaxedNatural` 편안한 여유핏 / `detailFashionTailored` 단정한 테일러드 / `detailFashionUrbanLine` 긴 직선 실루엣 |
| `hairDirection` | `detailHairSoftBobWave` 가벼운 보브 웨이브 / `detailHairNaturalLayer` 내추럴 레이어 / `detailHairClassicCcurve` 정돈된 C컬 / `detailHairSleekLine` 슬릭한 직선 |
| `imageMood` | `detailImageLovelyFresh` 상큼하고 러블리 / `detailImageSoftNatural` 부드럽고 내추럴 / `detailImageClassicTrust` 차분하고 클래식 / `detailImageChicModern` 시크하고 모던 |
| `lipCheek` | `detailLipCheekCoral` 코랄/피치 생기 / `detailLipCheekRose` 로즈/핑크 정돈감 / `detailLipCheekBrown` 로즈 브라운 깊이 / `detailLipCheekBerry` 베리/레드 포인트 |
| `patternTexture` | `detailPatternSmallLight` 작고 밝은 디테일 / `detailPatternNaturalTexture` 내추럴한 소재감 / `detailPatternClassicOrder` 질서 있는 패턴 / `detailPatternBoldContrast` 큰 포인트 패턴 |

## 화면/저장 플로우

- 새 설문: 전체 133문항을 순서대로 답한다.
- 중간 저장: 현재 답변과 현재 질문 id를 SecureStore draft로 저장한다.
- 이어하기: 메인 화면에서 저장된 draft가 있을 때만 `저장한 설문 이어하기`를 노출한다.
- 최근 결과 보기: 결과가 하나라도 저장된 뒤에만 메인 화면에서 노출한다.
- 모르겠음 재답변: 결과 화면에서 `unknownQuestionIds`가 있을 때만 해당 문항만 다시 보여준다.
- 전체 수정: 결과 화면에서 기존 `surveyAnswers`를 채운 상태로 전체 문항을 다시 보여준다.
- 재분석: 모르겠음 재답변이나 전체 수정 모두 새 결과를 만들고 최근 결과 목록에 저장한다.

## 결과 해석 주의

이 기능은 사진 분석이나 전문가 진단이 아니라 설문 기반 스타일링 가이드다. 앱 심사와 사용자 오해 방지를 위해 결과 문구는 확정 진단보다 "추천", "방향", "가볍게 확인" 톤을 유지한다.
