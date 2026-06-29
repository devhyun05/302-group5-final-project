import {
  FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
  FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
  resolveFaceAnalysisReportDetailLoadState,
} from './faceAnalysisReportDetailLoadState';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

async function expectResolvedLoadKeepsNullReport() {
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.resolve({
      report: null,
    }),
  );

  expectEqual(state.status, 'success', 'resolved report detail load state');

  if (state.status !== 'success') {
    throw new Error('resolved report detail load should return success state');
  }

  expectEqual(state.report, null, 'resolved report detail null report');
}

async function expectRejectedLoadShowsErrorState() {
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.reject(new Error('network unavailable')),
  );

  expectEqual(state.status, 'error', 'rejected report detail load state');

  if (state.status !== 'error') {
    throw new Error('rejected report detail load should return error state');
  }

  expectEqual(
    state.message,
    FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_MESSAGE,
    'report detail load error message',
  );
  expectEqual(
    state.description,
    FACE_ANALYSIS_REPORT_DETAIL_LOAD_ERROR_DESCRIPTION,
    'report detail load error description',
  );
}

async function expectResolvedLoadKeepsReport() {
  const mockReport = {id: 'analysis-1'} as FaceAnalysisReport;
  const state = await resolveFaceAnalysisReportDetailLoadState(() =>
    Promise.resolve({
      report: mockReport,
    }),
  );

  if (state.status !== 'success') {
    throw new Error('resolved report detail report should return success state');
  }

  if (!state.report) {
    throw new Error('resolved report detail report should keep report data');
  }

  expectEqual(state.report.id, mockReport.id, 'resolved report detail report');
}

void expectResolvedLoadKeepsNullReport();
void expectRejectedLoadShowsErrorState();
void expectResolvedLoadKeepsReport();
