'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  LinearProgress,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  TextField,
  IconButton,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useState, useMemo, useEffect } from 'react';
import { useProductDetailQuery, useMatchProduct, useUpdateIngredients } from '../../../queries/products';
import { Concerns, Suggestion } from '../../../types/matches';
import { NonIngredientRow } from '../../../types/products';
import {
  useClearMatch,
  useManualMatch,
  useReject,
  useMarkNonIngredient,
  useUnclassifyNonIngredient,
} from '../../../queries/matches';
import { useCreateAlias } from '../../../queries/aliases';
import { searchCosing } from '../../../api/config';

function slugToTitle(slug: string | null) {
  if (!slug) return '';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) ?? '';

  const isXs = useMediaQuery('(max-width:600px)');

  const [filter, setFilter] = useState<'all'|'exact'|'alias'|'fuzzy'|'manual'|'auto'|'unmatched'|'non_ingredient'>('all');
  const [sortBy, setSortBy] = useState<'position'|'scoreDesc'|'scoreAsc'|'alpha'>('position');

  const { data, isLoading, isError, refetch } = useProductDetailQuery(id, !!id);
  const { mutate: matchProduct, isPending: isMatching } = useMatchProduct(id, refetch);
  const { mutate: saveIngredients, isPending: isUpdating } = useUpdateIngredients(id, () => {
    setIsEditing(false);
  });

  const { mutate: doManualMatch, isPending: isManualing } = useManualMatch(id);
  const { mutate: doReject, isPending: isRejecting } = useReject(id);
  const { mutateAsync: createAlias, isPending: creating } = useCreateAlias();
  const { mutate: doClearMatch, isPending: isClearing } = useClearMatch(id);

  // NEW: non-ingredient classify / unclassify
  const { mutate: doMarkNonIng, isPending: markingNon } = useMarkNonIngredient(() => refetch());
  const { mutate: doUnclassify, isPending: unclassifying } = useUnclassifyNonIngredient(() => refetch());


  const computedIngredientsLine = useMemo(() => {
    if (Array.isArray(data?.ingredientsRaw) && data.ingredientsRaw.length) {
      return data.ingredientsRaw.join(', ');
    }
    return '';
  }, [data?.ingredientsRaw]);

  // 2) Local UI state for editing
  const [isEditing, setIsEditing] = useState(false);
  const [displayLine, setDisplayLine] = useState(computedIngredientsLine);
  const [editedText, setEditedText] = useState(computedIngredientsLine);

  // Keep UI in sync when navigating or refetching
  useEffect(() => {
    setDisplayLine(computedIngredientsLine);
    if (!isEditing) setEditedText(computedIngredientsLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedIngredientsLine]);

  const onEdit = () => {
    setEditedText(displayLine);
    setIsEditing(true);
  };
  const onCancel = () => {
    setEditedText(displayLine);
    setIsEditing(false);
  };

  const onSave = () => {
    const next = (editedText ?? '').trim();
    if (!next.length || next === displayLine.trim()) {
      setIsEditing(false);
      return;
    }
    saveIngredients(next);
    setDisplayLine(next);
  };

  const [openAlias, setOpenAlias] = useState(false);
  const [aliasPi, setAliasPi] = useState<{ label: string } | null>(null);
  const [aliasText, setAliasText] = useState('');
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasOptions, setAliasOptions] = useState<Array<{ id: string; inciName: string; score?: number }>>([]);
  const [aliasChosen, setAliasChosen] = useState<{ id: string; inciName: string } | null>(null);

  useEffect(() => {
    let active = true;
    if (!openAlias || aliasQuery.trim().length < 2) { setAliasOptions([]); return; }
    (async () => {
      try {
        const res = await searchCosing(aliasQuery);
        if (active) setAliasOptions(res as Array<{ id: string; inciName: string; score?: number }>);
      } catch {}
    })();
    return () => { active = false; };
  }, [openAlias, aliasQuery]);

  const filteredMatches = useMemo(() => {
    if (!data) return [];
    if (filter === 'unmatched') return [];
    if (filter === 'non_ingredient') return [];
    let list = [...data.matches];

    if (filter === 'exact' || filter === 'alias') {
      list = list.filter((m) => m.method === filter);
    } else if (filter === 'manual') {
      list = list.filter((m) => m.status === 'manual');
    } else if (filter === 'auto') {
      list = list.filter((m) => m.status === 'auto');
    } else if (filter === 'fuzzy') {
      list = list.filter((m) => m.method === 'fuzzy');
    }

    switch (sortBy) {
      case 'scoreDesc':
        list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        break;
      case 'scoreAsc':
        list.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
        break;
      case 'alpha':
        list.sort((a, b) => a.product_ingredient.localeCompare(b.product_ingredient));
        break;
      case 'position':
      default:
        break;
    }
    return list;
  }, [data, filter, sortBy]);

  const showUnmatched = filter === 'all' || filter === 'unmatched' || filter === 'fuzzy';
  const showNonIngredients = filter === 'all' || filter === 'non_ingredient';

  if (!id) return <Typography sx={{ m: 2 }}>Invalid product id</Typography>;
  if (isLoading) return <LinearProgress sx={{ m: 2 }} />;

  if (isError || !data) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Couldn’t load product. <Button onClick={() => refetch()}>Retry</Button>
      </Alert>
    );
  }

  async function onReject(label: string, suggestions?: Suggestion[]) {
    doReject({ label, suggestions: suggestions ?? [] });
    refetch();
  }
  async function onClear(label: string) {
    doClearMatch({ label });
    refetch();
  }
  function onPickSuggestion(label: string, cosingId: string, score?: number, suggestions?: Suggestion[]) {
    doManualMatch({ label, cosingId, score: score ?? null, method: 'manual', suggestions: suggestions ?? [] });
    refetch();
  }
  function openAliasFor(label: string) {
    setAliasPi({ label });
    setAliasText(label);
    setAliasChosen(null);
    setAliasQuery('');
    setAliasOptions([]);
    setOpenAlias(true);
  }
  async function onAliasSubmit() {
    if (!aliasText.trim() || !aliasChosen) return;
    await createAlias({ alias: aliasText.trim(), cosingId: aliasChosen.id });
    setOpenAlias(false);
    setAliasText('');
    setAliasChosen(null);
    setAliasQuery('');
    setAliasOptions([]);
  }

  const title = slugToTitle(data.slug);

  const actionRowSx = {
    '& > .MuiButton-root': {
      flex: { xs: '1 1 calc(50% - 8px)', md: '0 0 auto' },
      minWidth: { xs: 0, md: 64 },
    },
  };

  if (isManualing || isRejecting || isClearing || markingNon || unclassifying) {
    return <LinearProgress sx={{ m: 2 }} />;
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={2} flexWrap="wrap">
        <Button variant="text" onClick={() => router.back()}>
          &larr; Back
        </Button>
        <Typography variant="h6" sx={{ ml: 'auto' }}>
          {data.brand ?? 'Unknown brand'} — {title || data.slug || '—'}
        </Typography>
        <Button
          variant="contained"
          size="small"
          disabled={isMatching}
          onClick={() => matchProduct()}
        >
          {isMatching ? 'Matching…' : 'Run Match'}
        </Button>
      </Stack>

      {/* Editable "Original Ingredients" */}
      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="h6">Original Ingredients</Typography>
            {!isEditing && !!displayLine && (
              <Tooltip title="Edit ingredients">
                <span>
                  <IconButton size="small" onClick={onEdit}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Stack>

          {!displayLine && !isEditing ? (
            <Typography color="text.secondary">No ingredients found.</Typography>
          ) : isEditing ? (
            <Stack spacing={1.5}>
              <TextField
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                multiline
                minRows={5}
                fullWidth
                placeholder="Type ingredients separated by commas (e.g., Water, Glycerin, Aloe)…"
              />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={onSave}
                  disabled={editedText.trim() === displayLine.trim()}
                >
                  Save
                </Button>
                <Button variant="text" onClick={onCancel}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Typography
              variant="body1"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}
            >
              {displayLine}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Filter & Sort */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        flexWrap="wrap"
        sx={{ mt: 2 }}
      >
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, v) => v && setFilter(v)}
          sx={{ flexWrap: { xs: 'nowrap', md: 'wrap' } }}
        >
          <ToggleButton value="all">ALL</ToggleButton>
          <ToggleButton value="exact">EXACT</ToggleButton>
          <ToggleButton value="alias">ALIAS</ToggleButton>
          <ToggleButton value="fuzzy">FUZZY</ToggleButton>
          <ToggleButton value="manual">MANUAL</ToggleButton>
          <ToggleButton value="auto">AUTO</ToggleButton>
          <ToggleButton value="unmatched">UNMATCHED</ToggleButton>
          <ToggleButton value="non_ingredient">NON-INGREDIENT</ToggleButton>
        </ToggleButtonGroup>

        <Box flexGrow={1} />

        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 220 } }} fullWidth={isXs}>
          <InputLabel id="sort-ingr-label">Sort</InputLabel>
          <Select
            labelId="sort-ingr-label"
            label="Sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <MenuItem value="position">By position</MenuItem>
            <MenuItem value="scoreDesc">Score ↓</MenuItem>
            <MenuItem value="scoreAsc">Score ↑</MenuItem>
            <MenuItem value="alpha">Ingredient A–Z</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Grid container spacing={3}>
        {/* Matched */}
        {filter !== 'unmatched' && (
          <Grid sx={{ xs: 12, md: 6 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" gutterBottom>Matched</Typography>
                {!filteredMatches.length ? (
                  <Typography color="text.secondary">No matches for this filter.</Typography>
                ) : (
                  <Stack divider={<Divider flexItem />} spacing={2}>
                    {filteredMatches.map((m) => (
                      <Box
                        key={m.product_ingredient}
                        display="grid"
                        alignItems="center"
                        gap={1.25}
                        sx={{
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: '1fr minmax(420px, 520px)',
                          },
                        }}
                      >
                        <Box>
                          <Typography fontWeight={600}>{m.product_ingredient}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.5, gap: 0.75 }}>
                            <Typography variant="body2" color="text.secondary">
                              → {m.cosing_ingredient ?? <em>(id: {m.cosingId})</em>}
                            </Typography>
                            {m.method && <Chip size="small" variant="outlined" label={m.method} />}
                            {typeof m.score === 'number' && (
                              <Chip size="small" variant="outlined" label={`score ${m.score.toFixed(2)}`} />
                            )}
                            {m.status === 'manual' && <Chip size="small" color="secondary" label="manual" />}
                          </Stack>

                          {!!m.functions?.length && (
                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                                Functions:
                              </Typography>
                              {m.functions.map((fn, i) => (
                                <Chip
                                  key={`fn-${fn}-${i}`}
                                  size="small"
                                  variant="outlined"
                                  label={fn}
                                  sx={{ borderStyle: 'dashed', fontSize: '0.72rem', height: 22 }}
                                />
                              ))}
                            </Stack>
                          )}

                          {(() => {
                            const filtered =
                              (m.concerns ?? []).filter((c: Concerns) => {
                                const lvl = String(c?.level ?? '').toLowerCase();
                                return lvl === 'moderate' || lvl === 'high';
                              }) || [];
                            if (!filtered.length) return null;
                            return (
                              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                                  Concerns:
                                </Typography>
                                {filtered.map((c: Concerns, i: number) => (
                                  <Chip
                                    key={`concern-${c.concern ?? 'unknown'}-${i}`}
                                    size="small"
                                    variant="filled"
                                    color={String(c.level).toLowerCase() === 'high' ? 'error' : 'warning'}
                                    label={`${c.concern ?? 'Concern'} • ${String(c.level).toLowerCase()}`}
                                    sx={{ fontWeight: 600, height: 22 }}
                                  />
                                ))}
                              </Stack>
                            );
                          })()}
                        </Box>

                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" sx={actionRowSx}>
                          <Button size="small" variant="outlined" color="warning" onClick={() => onReject(m.product_ingredient, m.suggestions ?? [])}>
                            Reject
                          </Button>
                          <Button size="small" variant="outlined" color="inherit" onClick={() => onClear(m.product_ingredient)}>
                            Clear+Auto
                          </Button>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Right column: Unmatched + Non-ingredients */}
        <Grid sx={{ xs: 12, md: 6 }}>
          {/* Unmatched */}
          {showUnmatched && (
            <Card sx={{ mb: data.nonIngredients?.length ? 3 : 0 }}>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" gutterBottom>Unmatched</Typography>
                {!data.unmatched.length ? (
                  <Typography color="text.secondary">Great! No unmatched ingredients.</Typography>
                ) : (
                  <Stack divider={<Divider flexItem />} spacing={2}>
                    {data.unmatched.map((u, idx) => {
                      const sugg = u.suggestions ?? [];
                      const matchId = (u as unknown as NonIngredientRow).matchId as string | undefined; // backend now provides this when possible
                      return (
                        <Box
                          key={`${u.product_ingredient}-${idx}`}
                          display="grid"
                          alignItems="start"
                          gap={1.5}
                          sx={{
                            gridTemplateColumns: {
                              xs: '1fr',
                              md: '1fr minmax(360px, 460px)',
                            },
                          }}
                        >
                          <Box>
                            <Typography fontWeight={600}>{u.product_ingredient}</Typography>
                            {sugg.length > 0 ? (
                              <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap">
                                {sugg.map((s) => (
                                  <Chip
                                    key={s.cosingId}
                                    size="small"
                                    variant="outlined"
                                    label={`${s.inciName} (${s.score.toFixed(2)})`}
                                    onClick={() => onPickSuggestion(u.product_ingredient, s.cosingId, s.score, sugg)}
                                    sx={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </Stack>
                            ) : (
                              <Typography color="text.secondary">No suggestions found.</Typography>
                            )}
                          </Box>

                          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" sx={actionRowSx}>
                            <Button size="small" variant="outlined" onClick={() => openAliasFor(u.product_ingredient)}>
                              Create alias…
                            </Button>
                            <Button size="small" variant="outlined" color="inherit" onClick={() => onClear(u.product_ingredient)}>
                              Auto
                            </Button>
                            {/* NEW: mark non-ingredient */}
                            <Button
                              size="small"
                              variant="outlined"
                              color="warning"
                              disabled={!matchId}
                              onClick={() => {
                                if (matchId) doMarkNonIng({ matchId, productId: id });
                              }}
                            >
                              Mark non-ingredient
                            </Button>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </CardContent>
            </Card>
          )}

          {/* Non-ingredients */}
          {!!data.nonIngredients?.length && showNonIngredients && (
            <Card>
              <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" gutterBottom>Non-ingredients</Typography>
                <Stack divider={<Divider flexItem />} spacing={2}>
                  {data.nonIngredients.map((ni, idx) => {
                    const matchId = (ni as NonIngredientRow).matchId as string;
                    return (
                      <Box
                        key={`${ni.product_ingredient}-${idx}`}
                        display="grid"
                        alignItems="center"
                        gap={1.25}
                        sx={{
                          gridTemplateColumns: {
                            xs: '1fr',
                            md: '1fr minmax(220px, 260px)',
                          },
                        }}
                      >
                        <Typography fontWeight={600}>{ni.product_ingredient}</Typography>
                        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" sx={actionRowSx}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onClick={() => doUnclassify(matchId)}
                          >
                            Unclassify
                          </Button>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Alias dialog */}
      <Dialog open={openAlias} onClose={() => setOpenAlias(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create alias (global)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Ingredient label from product: <strong>{aliasPi?.label}</strong>
          </Typography>
          <TextField
            fullWidth
            sx={{ mt: 2 }}
            label="Alias text"
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            helperText="This is the label variant to recognize in products (e.g., 'Aqua (Water)')."
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
          <Button onClick={onAliasSubmit} variant="contained" disabled={!aliasText?.trim() || !aliasChosen || creating}>
            Save & Rematch
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
