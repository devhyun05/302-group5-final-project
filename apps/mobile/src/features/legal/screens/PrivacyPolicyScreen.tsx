import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  onClose?: () => void;
};

export function PrivacyPolicyScreen({ onClose }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>개인정보처리방침</Text>
        <Text style={styles.updated}>최종 업데이트: 2026-07-12</Text>

        <Section title="1. 카메라와 얼굴 분석 이용 목적">
          AURA는 얼굴 비율·색상·얼굴형을 분석하고 맞춤 메이크업, 필터 및 제품을 추천하기
          위해 카메라와 사용자가 선택한 얼굴 사진을 이용합니다. 얼굴 분석 동의를 거부해도
          다른 기능은 이용할 수 있지만, 얼굴 분석 보고서와 이를 바탕으로 한 맞춤 추천은
          이용할 수 없습니다.
        </Section>
        <Section title="2. 저장하는 얼굴 분석 정보">
          촬영 또는 선택한 얼굴 사진, 사진에서 계산한 FaceProfile(얼굴 비율·색상·얼굴형·촬영
          품질 정보), 동의 유형·버전·동의 시점을 계정 및 분석 보고서와 연결해 저장합니다.
        </Section>
        <Section title="3. 저장하지 않는 센서 원본">
          원본 478개 얼굴 랜드마크, 원본 depth map, semantic matte, 카메라 calibration 및
          ROI는 서버나 기기 저장소에 장기 보관하지 않습니다. 분석 중 기기 메모리의 일회용
          입력으로만 처리하고 파생 수치를 계산한 뒤 폐기합니다.
        </Section>
        <Section title="4. 보관 기간과 삭제 방법">
          얼굴 사진과 FaceProfile은 해당 분석 보고서 또는 계정을 삭제할 때까지 보관합니다.
          분석 보고서의 삭제 메뉴에서 개별 결과를 삭제하거나, 설정 &gt; 계정 관리 &gt; 회원
          탈퇴에서 계정에 연결된 정보를 삭제할 수 있습니다. 법령상 별도 보관 의무가 있는
          기록은 정해진 기간 동안 분리해 보관될 수 있습니다.
        </Section>
        <Section title="5. 외부 AI 처리">
          서버 환경에서 외부 AI 처리가 필요한 경우에만 보고서와 추천 이미지를 만들기 위해
          필요한 얼굴 사진과 파생 분석 정보를 외부 AI 처리 환경으로 전송할 수 있습니다. 이
          경우 촬영 전에 별도 안내와 동의를 표시하며, 외부 처리가 필요하지 않은 환경에서는
          해당 동의 항목을 표시하지 않습니다. 원본 센서 정보는 외부로 전송하지 않습니다.
        </Section>
        <Section title="6. 모델 학습 및 광고 목적 사용">
          얼굴 사진, FaceProfile 및 원본 센서 정보는 현재 모델 학습에 사용하지 않으며,
          광고·추적 목적으로 사용하지 않습니다. 향후 학습 이용을 검토할 경우 기존 동의와
          분리된 안내와 명시적 동의를 먼저 받습니다.
        </Section>
        <Section title="7. 퍼스널 컬러 단독 분석">
          얼굴 분석 보고서와 별도로 제공되는 기기 내 퍼스널 컬러 단독 분석은 로컬에서
          처리되며, 해당 기능이 별도로 고지한 범위에 따라 결과를 관리합니다.
        </Section>
        <Section title="8. 문의">
          개인정보 관련 문의는 앱 설정의 고객센터를 통해 접수할 수 있습니다.
        </Section>

        {onClose && (
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  updated: { fontSize: 12, color: '#999', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#222', marginTop: 12 },
  sectionBody: { fontSize: 14, color: '#444', lineHeight: 21 },
  closeBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#eef0f4' },
  closeBtnText: { color: '#333', fontSize: 15, fontWeight: '600' },
});
