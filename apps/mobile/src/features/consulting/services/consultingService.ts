import {
  getBackendApiBaseUrl,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {
  consultingCategories,
  consultingExperts,
  consultingMembershipPlans,
  findConsultingExpertOrFirst,
} from '../mocks/consulting.mock';
import type {
  ConsultingBookingDay,
  ConsultingBookingDraft,
  ConsultingAdminExpertInput,
  ConsultingCategory,
  ConsultingDurationOption,
  ConsultingExpert,
  ConsultingExpertReview,
  ConsultingMembershipPlan,
  ConsultingRecord,
  ConsultingReviewDraft,
  ConsultingSummary,
} from '../types';

export type ConsultingHomeData = {
  categories: readonly ConsultingCategory[];
  experts: readonly ConsultingExpert[];
  upcomingRecord: ConsultingRecord | null;
};

function arr<T>(value: unknown, fallback: readonly T[]): readonly T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function logFallback(scope: string, error: unknown): void {
  console.info(`[aura:consulting] ${scope}:fallback`, {
    message: error instanceof Error ? error.message : String(error),
  });
}

// ---------------------------------------------------------------------------
// Coercion helpers — the backend already returns camelCase matching the
// frontend types; these guard against missing/partial fields and fall back to
// the mock so the UI never renders undefined.
// ---------------------------------------------------------------------------
function coerceDuration(raw: any, index: number): ConsultingDurationOption {
  return {
    id: String(raw?.id ?? `d${index}`),
    label: String(raw?.label ?? ''),
    minutes: Number(raw?.minutes ?? 0),
    price: Number(raw?.price ?? 0),
    description: String(raw?.description ?? ''),
    recommended: Boolean(raw?.recommended),
  };
}

function coerceExpert(raw: any): ConsultingExpert {
  const fallback = findConsultingExpertOrFirst(raw?.id);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const durations = Array.isArray(raw.durations) && raw.durations.length
    ? raw.durations.map(coerceDuration)
    : fallback.durations;
  return {
    id: String(raw.id ?? fallback.id),
    name: String(raw.name ?? fallback.name),
    title: String(raw.title ?? fallback.title),
    signatureLine: String(raw.signatureLine ?? fallback.signatureLine),
    initials: String(raw.initials ?? fallback.initials),
    avatarTone: (raw.avatarTone ?? fallback.avatarTone) as ConsultingExpert['avatarTone'],
    imageSource: fallback.imageSource,
    imageUrl: raw.imageUrl ? String(raw.imageUrl) : fallback.imageUrl,
    studioName: raw.studioName ? String(raw.studioName) : fallback.studioName,
    careerYears: Number(raw.careerYears ?? fallback.careerYears),
    rating: Number(raw.rating ?? fallback.rating),
    reviewCount: Number(raw.reviewCount ?? fallback.reviewCount),
    sessionCount: Number(raw.sessionCount ?? fallback.sessionCount),
    rebookRate: Number(raw.rebookRate ?? fallback.rebookRate),
    responseMinutes: Number(raw.responseMinutes ?? fallback.responseMinutes),
    tags: arr(raw.tags, fallback.tags),
    intro: String(raw.intro ?? fallback.intro),
    careerHistory: arr(raw.careerHistory, fallback.careerHistory),
    certifications: arr(raw.certifications, fallback.certifications),
    availabilityNote: String(raw.availabilityNote ?? fallback.availabilityNote),
    categoryIds: arr(raw.categoryIds, fallback.categoryIds),
    durations,
    reviews: arr(raw.reviews, fallback.reviews),
  };
}

function coerceRecord(raw: any): ConsultingRecord {
  return {
    id: String(raw?.id ?? ''),
    expertId: String(raw?.expertId ?? ''),
    status: (raw?.status ?? 'upcoming') as ConsultingRecord['status'],
    categoryLabel: String(raw?.categoryLabel ?? ''),
    dateLabel: String(raw?.dateLabel ?? ''),
    durationLabel: String(raw?.durationLabel ?? ''),
    reviewId: raw?.reviewId ? String(raw.reviewId) : null,
    summary: raw?.summary ? (raw.summary as ConsultingSummary) : undefined,
  };
}

function coerceReview(raw: any): ConsultingExpertReview {
  return {
    id: String(raw?.id ?? ''),
    author: String(raw?.author ?? '익명'),
    category: String(raw?.category ?? ''),
    body: String(raw?.body ?? ''),
    rating: Number(raw?.rating ?? 5),
    dateLabel: String(raw?.dateLabel ?? ''),
  };
}

const hasBackend = (): boolean => Boolean(getBackendApiBaseUrl());

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function getConsultingHome(): Promise<ConsultingHomeData> {
  const fallback: ConsultingHomeData = {
    categories: consultingCategories,
    experts: consultingExperts,
    upcomingRecord: null,
  };
  if (!hasBackend()) {
    return fallback;
  }
  try {
    const res = await requestBackendJson<{
      categories?: unknown;
      experts?: unknown;
      upcomingRecord?: unknown;
    }>('/consulting/home');
    return {
      categories: arr<ConsultingCategory>(res.categories, consultingCategories),
      experts: (arr<any>(res.experts, consultingExperts) as any[]).map(coerceExpert),
      upcomingRecord: res.upcomingRecord
        ? coerceRecord(res.upcomingRecord)
        : null,
    };
  } catch (error) {
    logFallback('home', error);
    return fallback;
  }
}

export async function getConsultingExperts(
  categoryId?: string | null,
): Promise<readonly ConsultingExpert[]> {
  if (!hasBackend()) {
    return consultingExperts;
  }
  try {
    const query = categoryId && categoryId !== 'all'
      ? `?category=${encodeURIComponent(categoryId)}`
      : '';
    const res = await requestBackendJson<{experts?: unknown}>(
      `/consulting/experts${query}`,
    );
    return (arr<any>(res.experts, consultingExperts) as any[]).map(coerceExpert);
  } catch (error) {
    logFallback('experts', error);
    return consultingExperts;
  }
}

export async function getConsultingExpert(
  expertId: string,
): Promise<ConsultingExpert> {
  const fallback = findConsultingExpertOrFirst(expertId);
  if (!hasBackend()) {
    return fallback;
  }
  try {
    const res = await requestBackendJson<{expert?: unknown}>(
      `/consulting/experts/${encodeURIComponent(expertId)}`,
    );
    return res.expert ? coerceExpert(res.expert) : fallback;
  } catch (error) {
    logFallback('expert', error);
    return fallback;
  }
}

export async function getConsultingExpertSlots(
  expertId: string,
): Promise<readonly ConsultingBookingDay[]> {
  if (!hasBackend()) {
    return [];
  }
  try {
    const res = await requestBackendJson<{days?: unknown}>(
      `/consulting/experts/${encodeURIComponent(expertId)}/slots`,
    );
    return arr<ConsultingBookingDay>(res.days, []);
  } catch (error) {
    logFallback('slots', error);
    return [];
  }
}

export async function getConsultingMembershipPlans(): Promise<
  readonly ConsultingMembershipPlan[]
> {
  if (!hasBackend()) {
    return consultingMembershipPlans;
  }
  try {
    const res = await requestBackendJson<{plans?: unknown}>(
      '/consulting/membership/plans',
    );
    const plans = arr<ConsultingMembershipPlan>(res.plans, consultingMembershipPlans);
    return plans.length > 0 ? plans : consultingMembershipPlans;
  } catch (error) {
    logFallback('plans', error);
    return consultingMembershipPlans;
  }
}

export async function getConsultingBookings(
  status?: string,
): Promise<readonly ConsultingRecord[]> {
  if (!hasBackend()) {
    return [];
  }
  try {
    const query = status && status !== 'all'
      ? `?status=${encodeURIComponent(status)}`
      : '';
    const res = await requestBackendJson<{records?: unknown}>(
      `/consulting/bookings${query}`,
    );
    return (arr<any>(res.records, []) as any[]).map(coerceRecord);
  } catch (error) {
    logFallback('bookings', error);
    return [];
  }
}

export async function getConsultingBooking(
  bookingId: string,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}`,
    );
    return res.record ? coerceRecord(res.record) : null;
  } catch (error) {
    logFallback('booking', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Writes (best-effort; return null/false on failure so callers can show an error)
// ---------------------------------------------------------------------------
export async function createConsultingBooking(
  draft: ConsultingBookingDraft,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      '/consulting/bookings',
      {method: 'POST', body: draft},
    );
    return res.record ? coerceRecord(res.record) : null;
  } catch (error) {
    logFallback('booking:create', error);
    return null;
  }
}

export async function createConsultingReview(
  bookingId: string,
  draft: ConsultingReviewDraft,
): Promise<ConsultingExpertReview | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{review?: unknown}>(
      `/consulting/bookings/${encodeURIComponent(bookingId)}/reviews`,
      {method: 'POST', body: draft},
    );
    return res.review ? coerceReview(res.review) : null;
  } catch (error) {
    logFallback('review:create', error);
    return null;
  }
}

export async function createConsultingPayment(payload: {
  kind: 'booking' | 'membership';
  optionId?: string;
  bookingId?: string;
  planId?: string;
  method?: string;
}): Promise<boolean> {
  if (!hasBackend()) {
    return false;
  }
  try {
    await requestBackendJson('/consulting/payments', {
      method: 'POST',
      body: payload,
    });
    return true;
  } catch (error) {
    logFallback('payment', error);
    return false;
  }
}

export async function subscribeConsultingMembership(
  planId: string,
  method?: string,
): Promise<boolean> {
  if (!hasBackend()) {
    return false;
  }
  try {
    await requestBackendJson('/consulting/membership/subscribe', {
      method: 'POST',
      body: {planId, method},
    });
    return true;
  } catch (error) {
    logFallback('membership:subscribe', error);
    return false;
  }
}

export async function createConsultingAdminExpert(
  payload: ConsultingAdminExpertInput,
): Promise<ConsultingExpert | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{expert?: unknown}>(
      '/consulting/admin/experts',
      {method: 'POST', body: payload},
    );
    return res.expert ? coerceExpert(res.expert) : null;
  } catch (error) {
    logFallback('admin:expert:create', error);
    return null;
  }
}

export async function completeConsultingAdminBooking(
  bookingId: string,
): Promise<ConsultingRecord | null> {
  if (!hasBackend()) {
    return null;
  }
  try {
    const res = await requestBackendJson<{record?: unknown}>(
      `/consulting/admin/bookings/${encodeURIComponent(bookingId)}/complete`,
      {method: 'POST'},
    );
    return res.record ? coerceRecord(res.record) : null;
  } catch (error) {
    logFallback('admin:booking:complete', error);
    return null;
  }
}
