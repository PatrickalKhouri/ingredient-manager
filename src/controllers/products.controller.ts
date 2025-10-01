import type { Request, Response } from 'express';
import { productsService } from '../services/products.service';

export async function listProducts(req: Request, res: Response) {
  const q = (req as any).validated?.query ?? req.query;
  res.json(await productsService.list(q as any));
}

export async function listBrands(_req: Request, res: Response) {
  res.json(await productsService.listBrands());
}

export async function matchingSummary(req: Request, res: Response) {
  const q = (req as any).validated?.query ?? req.query;
  const brand = (q as any).brand as string | undefined;
  res.json(await productsService.getMatchingSummary(brand ? { brand } : {}));
}

export async function detail(req: Request, res: Response) {
  const p = (req as any).validated?.params ?? req.params;
  res.json(await productsService.detail((p as any).productId));
}

export async function match(req: Request, res: Response) {
  const p = (req as any).validated?.params ?? req.params;
  res.json(await productsService.matchProduct((p as any).productId));
}

export async function updateIngredientsAndRematch(req: Request, res: Response) {
  const params = (req as any).validated?.params ?? req.params;
  const body = (req as any).validated?.body ?? req.body;

  const productId = (params as any).productId as string;

  const { savedList } = await productsService.updateIngredients(productId, body);

  const matchResult = await productsService.matchProduct(productId);

  res.json({
    ok: true,
    productId,
    savedCount: savedList.length,
    savedList,
    matchResult,
  });
}
