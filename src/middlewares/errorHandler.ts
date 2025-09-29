import type { ErrorRequestHandler } from 'express';
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err?.status as number) || 500;
  res.status(status).json({
    message: err?.message || 'Internal Server Error',
    ...(err?.details ? { details: err.details } : {}),
  });
};
