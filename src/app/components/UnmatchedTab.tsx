'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { useRouter } from 'next/navigation';

import { useGetUnmatchedIngredients, useManualMatch } from '../../queries/matches';
import { useCreateAlias } from '../../queries/aliases';
import { searchCosing } from '../../api/config';
import { Suggestion, UnmatchedIngredient } from '../../types/matches';
import SuggestionsCell from './SuggestionCell';
import { useBrandsQuery } from '../../queries/products';

// tiny debounce hook
function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function UnmatchedTab() {
  const router = useRouter();

  // filters + pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [brand, setBrand] = useState('');
  const [ingredient, setIngredient] = useState('');
  const [productName, setProductName] = useState('');

  // debounce the two search fields
  const ingredientQ = useDebounced(ingredient, 350);
  const productNameQ = useDebounced(productName, 350);

  const { data, isError, isLoading, isFetching, refetch } = useGetUnmatchedIngredients({
    page,
    limit: rowsPerPage,
    brand: brand || undefined,
    ingredient: ingredientQ || undefined,
    productName: productNameQ || undefined,
  });

  const { data: brandsData } = useBrandsQuery();

  // alias dialog state
  const [openAlias, setOpenAlias] = useState(false);
  const [aliasLabel, setAliasLabel] = useState<string | null>(null);
  const [aliasText, setAliasText] = useState('');
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasOptions, setAliasOptions] = useState<Array<{ id: string; inciName: string }>>([]);
  const [aliasChosen, setAliasChosen] = useState<{ id: string; inciName: string } | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  const { mutate: doManualMatch } = useManualMatch(productId!, () => refetch());
  const { mutateAsync: createAlias } = useCreateAlias();

  // search CosIng API for alias
  useEffect(() => {
    let active = true;
    if (!openAlias || aliasQuery.trim().length < 2) { setAliasOptions([]); return; }
    (async () => {
      try {
        const res = await searchCosing(aliasQuery);
        if (active) setAliasOptions(res as Array<{ id: string; inciName: string }>);
      } catch {}
    })();
    return () => { active = false; };
  }, [openAlias, aliasQuery]);

  // Actions
  const onPickSuggestion = (
    productId: string,
    label: string,
    cosingId: string,
    score?: number,
    suggestions?: Suggestion[]
  ) => {
    setProductId(productId);
    doManualMatch({ label, cosingId, score: score ?? null, method: 'manual', suggestions: suggestions ?? [] });
  };

  const openAliasFor = (label: string, productId: string) => {
    setAliasLabel(label);
    setAliasText(label);
    setAliasChosen(null);
    setAliasQuery('');
    setAliasOptions([]);
    setProductId(productId);
    setOpenAlias(true);
  };

  const onAliasSubmit = async () => {
    if (!aliasText.trim() || !aliasChosen) return;
    await createAlias({ alias: aliasText.trim(), cosingId: aliasChosen.id });
    setOpenAlias(false);
    setAliasText('');
    setAliasChosen(null);
    setAliasQuery('');
    setAliasOptions([]);
    setProductId(null);
    refetch();
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <>
      {/* Keep inputs mounted; show fetching bar on top */}
      {(isFetching || (isLoading && !data)) && <LinearProgress sx={{ mb: 2 }} />}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading unmatched ingredients
        </Alert>
      )}

      {/* Filters */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={2}>
        <TextField
          label="Search by ingredient name"
          size="small"
          value={ingredient}
          onChange={(e) => {
            setIngredient(e.target.value);
            setPage(1);
          }}
        />
        <TextField
          label="Search by product name"
          size="small"
          value={productName}
          onChange={(e) => {
            setProductName(e.target.value);
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
            {(brandsData ?? []).map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {!items.length && !isLoading ? (
        <Typography color="text.secondary">No unmatched ingredients 🎉</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell>Ingredient</TableCell>
                <TableCell>Suggestions</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Brand</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row: UnmatchedIngredient) => (
                <TableRow
                  key={row._id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/products/${row.product._id}`)}
                >
                  <TableCell sx={{ maxWidth: 280, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {row.ingredient}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} sx={{ overflowWrap: 'anywhere' }}>
                    <SuggestionsCell
                      ingredient={row.ingredient}
                      productId={row.product._id}
                      suggestions={row.suggestions ?? []}
                      onPickSuggestion={onPickSuggestion}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 320, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {row.product.translations?.en?.title}
                  </TableCell>
                  <TableCell>{row.product.brand}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Button size="small" variant="outlined" onClick={() => openAliasFor(row.ingredient, row.product._id)}>
                      Alias
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={total}
            page={page - 1}
            onPageChange={(_, newPage) => setPage(newPage + 1)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(1);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Box>
      )}

      {/* Alias dialog */}
      <Dialog open={openAlias} onClose={() => setOpenAlias(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create alias (global)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Ingredient label: <strong>{aliasLabel}</strong>
          </Typography>
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Alias text"
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            helperText="This is the variant text to recognize (e.g., 'Aqua (Water)')."
          />
          <Autocomplete
            sx={{ mt: 2 }}
            options={aliasOptions}
            getOptionLabel={(o) => o.inciName}
            onChange={(_, v) => setAliasChosen(v ? { id: v.id, inciName: v.inciName } : null)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Map alias to CosIng"
                value={aliasQuery}
                onChange={(e) => setAliasQuery(e.target.value)}
                helperText="Type at least 2 characters to search"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAlias(false)}>Cancel</Button>
          <Button onClick={onAliasSubmit} variant="contained" disabled={!aliasText?.trim() || !aliasChosen}>
            Save & Rematch
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
