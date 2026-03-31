import { describe, it, expect } from 'vitest';
import {
  MerchantSettingsSchema,
  ReviewSubmissionSchema,
  GdprEmailSchema,
  DEFAULT_MERCHANT_SETTINGS,
} from '../validation';

describe('MerchantSettingsSchema', () => {
  it('accepts valid settings', () => {
    const result = MerchantSettingsSchema.safeParse({
      review_trigger: 'order.completed',
      review_delay_days: 2,
      auto_approve_enabled: false,
      auto_approve_min_rating: 5,
      locale: 'en',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid trigger values', () => {
    for (const trigger of ['order.placed', 'order.shipped', 'order.completed']) {
      const data = { ...DEFAULT_MERCHANT_SETTINGS, review_trigger: trigger };
      expect(MerchantSettingsSchema.safeParse(data).success).toBe(true);
    }
  });

  it('rejects invalid trigger values', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, review_trigger: 'order.invalid' };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects out-of-range delay_days (negative)', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, review_delay_days: -1 };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects out-of-range delay_days (too high)', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, review_delay_days: 31 };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects non-integer delay_days', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, review_delay_days: 1.5 };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects invalid auto_approve_min_rating', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, auto_approve_min_rating: 0 };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects auto_approve_min_rating above 5', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, auto_approve_min_rating: 6 };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects invalid locale', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, locale: 'fr' };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('accepts German locale', () => {
    const data = { ...DEFAULT_MERCHANT_SETTINGS, locale: 'de' };
    expect(MerchantSettingsSchema.safeParse(data).success).toBe(true);
  });

  it('default settings are valid', () => {
    expect(MerchantSettingsSchema.safeParse(DEFAULT_MERCHANT_SETTINGS).success).toBe(true);
  });
});

describe('ReviewSubmissionSchema', () => {
  const validSubmission = {
    rating: 4,
    title: 'Great product',
    body: 'I really enjoyed using this product.',
    authorName: 'Jane Doe',
  };

  it('accepts valid submission', () => {
    expect(ReviewSubmissionSchema.safeParse(validSubmission).success).toBe(true);
  });

  it('rejects rating below 1', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, rating: 0 }).success,
    ).toBe(false);
  });

  it('rejects rating above 5', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, rating: 6 }).success,
    ).toBe(false);
  });

  it('rejects non-integer rating', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, rating: 3.5 }).success,
    ).toBe(false);
  });

  it('rejects empty title', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, title: '' }).success,
    ).toBe(false);
  });

  it('rejects title longer than 255 chars', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, title: 'x'.repeat(256) }).success,
    ).toBe(false);
  });

  it('rejects empty body', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, body: '' }).success,
    ).toBe(false);
  });

  it('rejects body longer than 5000 chars', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, body: 'x'.repeat(5001) }).success,
    ).toBe(false);
  });

  it('rejects empty authorName', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, authorName: '' }).success,
    ).toBe(false);
  });

  it('rejects authorName longer than 255 chars', () => {
    expect(
      ReviewSubmissionSchema.safeParse({ ...validSubmission, authorName: 'x'.repeat(256) })
        .success,
    ).toBe(false);
  });
});

describe('GdprEmailSchema', () => {
  it('accepts valid email', () => {
    expect(GdprEmailSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(GdprEmailSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(GdprEmailSchema.safeParse({ email: '' }).success).toBe(false);
  });
});
