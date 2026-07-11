# AURA FaceProfile 추후 고려사항

- 작성일: 2026-07-12
- 적용 시점: 법무·개인정보·보안 검토가 가능한 이후
- 현재 상태: 구현 금지 경계 문서

## 1. 현재 MVP 경계

현재 MVP는 다음 데이터만 서버에 저장한다.

- 기존 얼굴 분석 사진
- 계산된 FaceProfile
- 얼굴형 7종 점수와 신뢰도
- 측정 출처·엔진 버전·경고
- 동의 버전과 수락 시각

다음 데이터는 기기 메모리에서만 처리하고 서버에 업로드하거나 장기 저장하지 않는다.

- 478개 원본 랜드마크
- TrueDepth 원본 depth/disparity map
- camera calibration 원본
- hair/skin semantic matte
- ROI 픽셀과 디버그 이미지

현재 수집한 데이터는 모델 학습에 사용하지 않는다. 향후 동의를 추가하더라도 기존 데이터를 소급해서 학습 데이터로 전환하지 않는다.

## 2. 원본 데이터 저장을 다시 검토할 조건

다음 항목이 모두 준비된 후에만 원본 데이터 저장을 검토한다.

- 개인정보 담당자 또는 외부 법률 검토 완료
- 원본 데이터의 정확한 처리 목적 확정
- 필수 서비스 동의와 선택적 원본 보관 동의 분리
- 모델 학습 동의와 단순 재분석 동의 분리
- 보유기간과 자동 파기 정책 확정
- 동의 철회·열람·삭제·처리정지 API와 UI 준비
- 미성년자 처리 정책 확정
- 국외 이전과 외부 처리업체 검토
- 암호화·키 관리·접근통제·감사로그 설계 완료
- 침해사고 대응과 데이터 복구 정책 확정
- 개인정보 영향평가 또는 그에 준하는 내부 위험평가 완료

## 3. 향후 동의 유형

현재 `consent_type`에는 학습 전용 값이 없다. 향후 기능을 도입할 때 다음 유형을 별도로 추가한다.

```text
raw_face_measurement_retention
face_model_training
face_model_evaluation
```

동의는 다음 원칙을 지킨다.

- 선택 동의이며 거부해도 얼굴 분석 서비스는 정상 제공한다.
- 수집 항목, 목적, 보유기간, 제3자 제공, 국외 이전 여부를 구분해 표시한다.
- 원본 보관 동의가 모델 학습 동의를 의미하지 않는다.
- 학습 동의 철회 이후 신규 학습 데이터셋에 포함하지 않는다.
- 이미 배포된 모델에서의 제거 가능 범위와 한계를 사전에 고지한다.
- 동의 버전, 수락/철회 시각, 데이터셋 버전, 모델 버전을 연결해 추적한다.

## 4. 향후 저장 구조

원본 저장이 승인되면 파생 FaceProfile과 물리적으로 분리한다.

### 4.1 PostgreSQL

`analysis_face_raw_inputs`에는 다음 메타데이터만 둔다.

- report/user/capture 연결 키
- 가명 데이터 주체 ID
- consent type/version/acceptedAt
- landmark asset 참조
- depth asset 참조
- checksum, content type, byte size
- landmark/depth/calibration schema version
- dataset eligibility
- expiresAt, deletedAt

### 4.2 Object storage

- 478개 랜드마크는 압축·암호화된 versioned artifact로 저장한다.
- depth map은 PostgreSQL JSONB가 아니라 암호화된 object storage에 저장한다.
- camera calibration은 depth artifact와 같은 접근 경계에 둔다.
- 사용자별 경로와 KMS key policy를 적용한다.
- public CDN을 사용하지 않는다.
- 짧은 수명의 서명 URL로만 내부 재분석 작업이 접근한다.

### 4.3 파기

- 보고서 삭제, 계정 삭제, 동의 철회, expiresAt 도달 시 deletion outbox를 생성한다.
- DB 참조 삭제와 object 삭제를 재시도 가능한 작업으로 처리한다.
- 파기 결과와 실패 사유를 감사 기록에 남긴다.
- 백업 보존 정책과 실제 파기 가능 시점을 동의문에 맞춘다.

## 5. 모델 학습 로드맵

### 단계 1. 규칙 분류기 보정

- 전문가 또는 다수 평가자 라벨
- oval/round, heart/diamond, square/round 혼동 분석
- 현재 rule threshold 조정
- Top 1 정확도, Top 2 coverage, mixed 비율, blocked 비율 측정

### 단계 2. Feature-vector 모델

입력 후보:

- face length/width
- forehead/cheek/jaw/chin/temple ratios
- cheek dominance
- jaw angle와 softness
- chin pointedness
- contour roundness
- vertical thirds
- 품질 confidence

후보 모델:

- Logistic Regression
- Decision Tree
- Random Forest
- Gradient Boosting
- 작은 MLP

이 단계가 첫 학습 모델로 적합하다. 원본 사진 없이도 학습할 수 있고, 설명 가능성과 Core ML 이식성이 높다.

### 단계 3. Core ML 온디바이스 모델

- feature-vector 모델을 Core ML로 변환한다.
- rule score와 Core ML probability를 별도로 기록한다.
- 모델 품질이 rule보다 충분히 높은 경우에만 primary 전환을 검토한다.

### 단계 4. Rule + ML ensemble

- rule과 ML을 품질 confidence에 따라 결합한다.
- low-confidence 또는 provider mismatch에서 rule fallback을 유지한다.
- classifier version과 결합 가중치를 결과에 저장한다.

### 단계 5. 이미지·depth 모델

원본 사진과 depth를 사용하는 모델은 마지막 단계로 미룬다. 도입 전 다음을 추가 검증한다.

- 데이터 규모와 라벨 품질
- 얼굴 재식별 위험
- 성별·연령·피부톤·기기별 편향
- depth 센서 기종별 도메인 차이
- 모델 역추론·membership inference 위험
- 학습 데이터 삭제와 재학습 비용

## 6. 데이터셋 거버넌스

- 사용자는 무작위 가명 ID로만 연결한다.
- 운영 DB를 직접 학습 데이터로 사용하지 않는다.
- 동의된 레코드만 versioned dataset manifest에 포함한다.
- 학습/검증/테스트 사용자를 분리해 동일 인물 누수를 막는다.
- 얼굴형 라벨은 최소 2명의 평가와 불일치 검토를 거친다.
- 한국인·동아시아 표본에만 과적합하지 않도록 모집단 범위를 문서화한다.
- 기기·렌즈·조명·표정 분포를 데이터셋 카드에 기록한다.
- 모델 카드에 성능, 제한, 금지 용도, 실패 사례를 기록한다.
- 사용자 식별·감정 추정·건강 추정으로 목적을 확장하지 않는다.

## 7. 학습 허용 전 체크리스트

- [ ] 법무·개인정보 검토 승인
- [ ] 선택 동의 화면과 처리방침 반영
- [ ] opt-out과 삭제 UI/API 검증
- [ ] 원본 저장소 암호화·접근통제 보안 검토
- [ ] 데이터셋 lineage와 consent lineage 검증
- [ ] 학습 데이터 파기 작업 리허설
- [ ] 모델 학습 목적과 금지 용도 문서화
- [ ] 편향·정확도·프라이버시 평가 기준 확정
- [ ] 외부 공급자·국외 이전 없음 또는 별도 승인
- [ ] 운영/개발/학습 권한 분리
- [ ] 사고 대응 담당자와 절차 확정

체크리스트가 모두 완료되기 전에는 원본 데이터 저장과 모델 학습 코드를 배포하지 않는다.

## 8. 공식 참고자료

- 개인정보보호위원회, 생성형 AI 개발·활용을 위한 개인정보 처리 안내서: https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=11410
- 개인정보보호위원회, 2026 개인정보 처리방침 작성지침 안내: https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=&nttId=12021
- 개인정보 보호법 제16조 최소수집 원칙: https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900079387
- 개인정보 보호법 제21조 파기: https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078981
- 개인정보 보호법 시행령 제18조 민감정보 범위: https://www.law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0018&lsiSeq=286175&urlMode=lsScJoRltInfoR
- Apple AVDepthData: https://developer.apple.com/documentation/avfoundation/avdepthdata
