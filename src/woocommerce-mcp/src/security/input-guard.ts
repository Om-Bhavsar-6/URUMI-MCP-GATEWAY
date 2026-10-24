import { z } from 'zod';

export const VALID_ORDER_STATUSES = [
  'pending',
  'processing',
  'on-hold',
  'completed',
  'cancelled',
  'refunded',
  'failed',
] as const;

export type OrderStatus = (typeof VALID_ORDER_STATUSES)[number];

// Guard against XSS and control character injection
export function sanitizeString(val: string): string {
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

// Zod Guardrails for WooCommerce Tool Inputs
export const ListProductsInputSchema = z.object({
  search: z
    .string()
    .max(100, 'Search query cannot exceed 100 characters')
    .transform(sanitizeString)
    .optional(),
  category: z.string().max(50).transform(sanitizeString).optional(),
  per_page: z.coerce
    .number()
    .int()
    .min(1, 'Minimum 1 item per page')
    .max(100, 'Maximum 100 items per page')
    .default(10),
  page: z.coerce.number().int().min(1).default(1),
});

export const CreateProductInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Product name is required')
    .max(200, 'Product name cannot exceed 200 characters')
    .transform(sanitizeString),
  regular_price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid positive decimal (e.g. 19.99)')
    .refine((val) => {
      const num = parseFloat(val);
      return num >= 0.01 && num <= 1000000;
    }, 'Price must be between $0.01 and $1,000,000.00'),
  description: z
    .string()
    .max(5000, 'Description cannot exceed 5000 characters')
    .transform(sanitizeString)
    .optional(),
  status: z.enum(['publish', 'draft', 'pending', 'private']).default('publish'),
});

export const ListOrdersInputSchema = z.object({
  status: z
    .enum(VALID_ORDER_STATUSES, {
      errorMap: () => ({
        message: `Status must be one of: ${VALID_ORDER_STATUSES.join(', ')}`,
      }),
    })
    .optional(),
  per_page: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
  customer: z.coerce.number().int().positive().optional(),
});

export const GetOrderInputSchema = z.object({
  order_id: z.coerce.number().int().positive('Order ID must be a positive integer'),
});

export const UpdateOrderStatusInputSchema = z.object({
  order_id: z.coerce.number().int().positive('Order ID must be a positive integer'),
  status: z.enum(VALID_ORDER_STATUSES, {
    errorMap: () => ({
      message: `Invalid order status. Allowed: ${VALID_ORDER_STATUSES.join(', ')}`,
    }),
  }),
});
