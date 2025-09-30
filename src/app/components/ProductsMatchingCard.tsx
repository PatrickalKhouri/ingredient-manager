'use client';

import { Card, CardContent, Typography, LinearProgress, Box } from '@mui/material';
import { useProductsMatchingSummary } from '../../queries/products';

type Props = {
  brand?: string;
  /** If true, don't show a loading placeholder—render nothing while loading */
  hideIfLoading?: boolean;
};

export default function ProductsMatchingCard({ brand, hideIfLoading }: Props) {
  const { data, isLoading, isError } = useProductsMatchingSummary({ brand });

  // Non-blocking: if anything goes wrong (error) or no data, render nothing
  if (isError || !data) return null;
  if (hideIfLoading && isLoading) return null;

  // Optional: super-light loading state (won't block page either way)
  if (isLoading) {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2">Fully matched products</Typography>
          <Box sx={{ mt: 1 }}>
            <LinearProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2">Fully matched products</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
          <Box sx={{ flexGrow: 1 }}>
            <LinearProgress variant="determinate" value={data.percentFullyMatched} />
          </Box>
          <Typography variant="body2">{data.percentFullyMatched.toFixed(2)}%</Typography>
        </Box>
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {data.fullyMatched} of {data.totalProducts}
        </Typography>
      </CardContent>
    </Card>
  );
}
