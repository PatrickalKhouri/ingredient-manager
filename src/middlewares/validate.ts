import type { ZodType } from 'zod';
import type { RequestHandler } from 'express';

type Where = 'body' | 'query' | 'params';

export const validate = (schema: ZodType<unknown>, where: Where = 'body'): RequestHandler => (req, _res, next) => {
  try {
    const result = schema.safeParse((req as any)[where]);
    if (!result.success) {
      const err: any = new Error('ValidationError');
      err.status = 400;
      const zerr: any = result.error;
      err.details =
        typeof zerr.flatten === 'function'
          ? zerr.flatten()
          : { issues: zerr.issues ?? [] };
      return next(err);
    }
    const v = (req as any).validated || {};
    (req as any).validated = { ...v, [where]: result.data };
    next();
  } catch (e) {
    next(e);
  }
};
