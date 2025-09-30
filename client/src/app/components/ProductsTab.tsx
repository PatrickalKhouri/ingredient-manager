'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Typography,
  useMediaQuery,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useProductsQuery, useBrandsQuery } from '@/queries/products';

export default function ProductsTab() {
  // pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // filters
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // list via React Query
  const { data, isLoading, isError, refetch, isFetching } = useProductsQuery({
    page,
    limit: rowsPerPage,
    search: search || undefined,
    brand: brand || undefined,
    sort: 'matched_pct',
    dir: sortDir,
  });

  const { data: brands } = useBrandsQuery();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // responsive: use cards on < md
  const isMdUp = useMediaQuery('(min-width:900px)');

  const hideColsOnSm = useMemo(
    () => ({
      matched: { display: { xs: 'none', md: 'table-cell' } },
      unmatched: { display: { xs: 'none', md: 'table-cell' } },
    }),
    [],
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      {(isLoading || isFetching) && <LinearProgress sx={{ mb: 2 }} />}
      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Couldn’t load products. <Button onClick={() => refetch()}>Retry</Button>
        </Alert>
      )}

      {/* Filters */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        <TextField
          label="Search by product name"
          size="small"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Brand</InputLabel>
          <Select
            label="Brand"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="">All brands</MenuItem>
            {brands?.map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Sort by Matched %</InputLabel>
          <Select
            label="Sort by Matched %"
            value={sortDir}
            onChange={(e) => {
              setSortDir(e.target.value as 'asc' | 'desc');
              setPage(1);
            }}
          >
            <MenuItem value="desc">Most matched first</MenuItem>
            <MenuItem value="asc">Least matched first</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Card>
        <CardContent>
          {!items.length ? (
            <Typography color="text.secondary">No products found</Typography>
          ) : isMdUp ? (
            <>
              <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ tableLayout: 'auto' }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Brand</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right" sx={hideColsOnSm.matched}>
                      Matched %
                    </TableCell>
                    <TableCell align="right" sx={hideColsOnSm.unmatched}>
                      Unmatched %
                    </TableCell>
                    {/* NEW COLUMN */}
                    <TableCell align="right">Manual / Aliases</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((product) => (
                    <TableRow key={product._id} hover>
                      <TableCell>
                        <Box sx={{ fontWeight: 600 }}>{product.brand}</Box>
                      </TableCell>
                      <TableCell>{product?.translations?.en?.title}</TableCell>
                      <TableCell align="right" sx={hideColsOnSm.matched}>
                        <Chip
                          label={`${product.matchedPct}%`}
                          color="success"
                          variant="outlined"
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right" sx={hideColsOnSm.unmatched}>
                        <Chip
                          label={`${Math.max(0, 100 - product.matchedPct)}%`}
                          color={product.matchedPct < 100 ? 'warning' : 'default'}
                          variant="outlined"
                          size="small"
                        />
                      </TableCell>
                      {/* NEW COLUMN */}
                      <TableCell align="right">
                        <Chip
                          label={product.manualCount ?? 0}
                          color={product.manualCount && product.manualCount > 0 ? 'secondary' : 'default'}
                          variant="outlined"
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          component={Link}
                          href={`/products/${product._id}`}
                          variant="text"
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </Box>

              <TablePagination
                component="div"
                count={total}
                page={page - 1}
                onPageChange={(_evt, newPage) => setPage(newPage + 1)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(evt) => {
                  setRowsPerPage(parseInt(evt.target.value, 10));
                  setPage(1);
                }}
                rowsPerPageOptions={[10, 20, 50, 100]}
              />
            </>
          ) : (
            <Typography>TODO: mobile layout update</Typography>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
