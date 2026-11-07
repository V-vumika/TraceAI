import { z } from 'zod';

export const commonSettingsSchema = z.object({
  timeoutSeconds: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(60)
    .describe('Stop the node if it runs longer than this many seconds'),
  maxRetries: z
    .number()
    .int()
    .min(0)
    .max(5)
    .default(0)
    .describe('How many times to retry after a failure'),
  continueOnError: z
    .boolean()
    .default(false)
    .describe('Keep the workflow going even if this node fails'),
});

export type CommonSettings = z.infer<typeof commonSettingsSchema>;