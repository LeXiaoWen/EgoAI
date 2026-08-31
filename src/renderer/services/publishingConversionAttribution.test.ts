import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./config', () => ({
  configService: {
    getConfig: vi.fn(() => ({ usageAnalyticsEnabled: true })),
  },
}));

vi.mock('./logReporter', async () => {
  const actual = await vi.importActual<typeof import('./logReporter')>('./logReporter');
  return { ...actual, reportYdAnalyzer: vi.fn() };
});

import { PublishingIdentityType } from '@shared/publishing/constants';

import { defaultConfig } from '../config';
import { configService } from './config';
import { LogReporterAction, reportYdAnalyzer } from './logReporter';
import {
  clearPendingPublishingConversionAttribution,
  PublishingSubscriptionObservationConfidence,
  rememberPublishingConversionAttribution,
  reportPendingPublishingSubscriptionObserved,
} from './publishingConversionAttribution';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const attribution = {
  attemptId: 'attempt-1',
  operationId: 'operation-1',
  feature: 'share',
  resourceKind: 'file',
  operationType: 'create',
  source: 'library_list',
  entryPoint: 'library_menu',
  surface: 'my_files',
  pageViewId: 'page-view-1',
  hasExistingResource: false,
  dialogType: 'trial_notice',
  exposureId: 'exposure-1',
  identityType: PublishingIdentityType.Free,
  countMode: 'total',
  quotaUsed: 2,
  quotaLimit: 10,
  canReleaseByClosing: false,
  trialAccessTtlSeconds: 7_200,
  ctaId: 'secondary',
  target: 'learn_benefits',
  dialogVisibleMs: 1_500,
};

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.mocked(reportYdAnalyzer).mockReset();
  vi.mocked(configService.getConfig).mockReturnValue({
    ...defaultConfig,
    usageAnalyticsEnabled: true,
  });
  clearPendingPublishingConversionAttribution();
});

afterEach(() => {
  clearPendingPublishingConversionAttribution();
  vi.unstubAllGlobals();
});

describe('publishing conversion attribution', () => {
  test('reports a paid subscription observed within the last-touch window once', async () => {
    vi.mocked(reportYdAnalyzer).mockResolvedValue(true);
    rememberPublishingConversionAttribution(attribution, 1_000);

    await expect(reportPendingPublishingSubscriptionObserved('active', 4_000))
      .resolves.toBe(true);

    expect(reportYdAnalyzer).toHaveBeenCalledOnce();
    expect(vi.mocked(reportYdAnalyzer).mock.calls[0][0]).toMatchObject({
      action: LogReporterAction.PublishingSubscriptionObserved,
      actionType: 'subscription_observed',
      attemptId: 'attempt-1',
      operationId: 'operation-1',
      exposureId: 'exposure-1',
      feature: 'share',
      source: 'library_list',
      entryPoint: 'library_menu',
      surface: 'my_files',
      pageViewId: 'page-view-1',
      target: 'learn_benefits',
      attributionAgeSeconds: 3,
      subscriptionStatus: 'active',
      confidence: PublishingSubscriptionObservationConfidence.KnownFree,
    });

    await expect(reportPendingPublishingSubscriptionObserved('active', 5_000))
      .resolves.toBe(false);
    expect(reportYdAnalyzer).toHaveBeenCalledOnce();
  });

  test('does not report an expired attribution', async () => {
    vi.mocked(reportYdAnalyzer).mockResolvedValue(true);
    rememberPublishingConversionAttribution(attribution, 1_000);

    const eightDaysLater = 1_000 + 8 * 24 * 60 * 60 * 1_000;
    await expect(reportPendingPublishingSubscriptionObserved('active', eightDaysLater))
      .resolves.toBe(false);

    expect(reportYdAnalyzer).not.toHaveBeenCalled();
  });

  test('retains attribution when delivery fails so a later quota refresh can retry', async () => {
    vi.mocked(reportYdAnalyzer)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    rememberPublishingConversionAttribution(attribution, 1_000);

    await expect(reportPendingPublishingSubscriptionObserved('active', 2_000))
      .resolves.toBe(false);
    await expect(reportPendingPublishingSubscriptionObserved('active', 3_000))
      .resolves.toBe(true);

    expect(reportYdAnalyzer).toHaveBeenCalledTimes(2);
  });

  test('clears pending attribution instead of reporting after analytics is disabled', async () => {
    rememberPublishingConversionAttribution(attribution, 1_000);
    vi.mocked(configService.getConfig).mockReturnValue({
      ...defaultConfig,
      usageAnalyticsEnabled: false,
    });

    await expect(reportPendingPublishingSubscriptionObserved('active', 2_000))
      .resolves.toBe(false);

    expect(reportYdAnalyzer).not.toHaveBeenCalled();
    expect(globalThis.localStorage.length).toBe(0);
  });
});
