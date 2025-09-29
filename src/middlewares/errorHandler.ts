import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = Number((err as any).status) || 500;
  const message =
    typeof err?.message === 'string' && err.message
      ? err.message
      : 'Internal Server Error';

  if (res.getHeader('Content-Type')?.toString().includes('application/json')) {
    return res.status(status).json({ message, ...(err.details ? { details: err.details } : {}) });
  }
  res.status(status).send(message);
};
