import { z } from 'zod';

export const MerchantSettingsSchema = z.object({
  review_trigger: z.enum(['order.placed', 'order.shipped', 'order.completed']),
  review_delay_days: z.number().int().min(0).max(30),
  auto_approve_enabled: z.boolean(),
  auto_approve_min_rating: z.number().int().min(1).max(5),
  locale: z.enum(['en', 'de']),
});

export type MerchantSettings = z.infer<typeof MerchantSettingsSchema>;

export const DEFAULT_MERCHANT_SETTINGS: MerchantSettings = {
  review_trigger: 'order.completed',
  review_delay_days: 2,
  auto_approve_enabled: false,
  auto_approve_min_rating: 5,
  locale: 'en',
};

export const ReviewSubmissionSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(5000),
  authorName: z.string().min(1).max(255),
});

export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>;

export const GdprEmailSchema = z.object({
  email: z.string().email(),
});

export type GdprEmail = z.infer<typeof GdprEmailSchema>;
