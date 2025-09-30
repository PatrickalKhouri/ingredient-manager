'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { searchCosing } from '../../api/config';
import { useAliasesQuery, useCreateAlias, useDeleteAlias } from '../../queries/aliases';
import React from 'react';

type AliasRow = {
  id: string;
  alias: string;
  aliasNormalized: string;
  source: 'manual' | 'system';
  confidence: number | null;
  createdAt: string;
  cosing: { id: string; inciName: string };
};

export default function AliasesPage() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [aliasText, setAliasText] = useState('');
  const [cosingQuery, setCosingQuery] = useState('');
  const [cosingOptions, setCosingOptions] = useState<Array<{ id: string; inciName: string }>>([]);
  const [chosen, setChosen] = useState<{ id: string; inciName: string } | null>(null);

  // ✅ React Query hooks
  const { data: rows, isLoading } = useAliasesQuery();
  const { mutateAsync: createAlias, isPending: creating } = useCreateAlias();
  const { mutateAsync: deleteAlias, isPending: deleting } = useDeleteAlias();

  // search CosIng for dialog
  React.useEffect(() => {
    let active = true;
    if (!open || cosingQuery.trim().length < 2) {
      setCosingOptions([]);
      return;
    }
    (async () => {
      try {
        const res = await searchCosing(cosingQuery);
        if (active) setCosingOptions(res as Array<{ id: string; inciName: string }>);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [open, cosingQuery]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toUpperCase();
    if (!term) return rows;
    return rows.filter((r: AliasRow) =>
      r.alias.toUpperCase().includes(term) ||
      r.aliasNormalized.includes(term) ||
      r.cosing.inciName.toUpperCase().includes(term),
    );
  }, [rows, q]);

  async function onCreate() {
    if (!aliasText.trim() || !chosen) return;
    await createAlias({ alias: aliasText.trim(), cosingId: chosen.id });
    setOpen(false);
    setAliasText('');
    setChosen(null);
    setCosingQuery('');
  }

  async function onDelete(id: string) {
    await deleteAlias(id);
  }

  return (
    <Box display="grid" gap={3}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Button variant="text" component={Link} href="/">
          &larr; All products
        </Button>
        <Typography variant="h5" fontWeight={700}>
          Aliases
        </Typography>
        <Box flexGrow={1} />
        <TextField
          size="small"
          placeholder="Search alias or INCI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="contained" onClick={() => setOpen(true)}>
          New alias
        </Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? (
            <LinearProgress />
          ) : rows && rows.length ? (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 800 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 250 }}>Alias</TableCell>
                    <TableCell sx={{ width: 250 }}>Normalized</TableCell>
                    <TableCell sx={{ width: 250 }}>CosIng</TableCell>
                    <TableCell sx={{ width: 120 }}>Confidence</TableCell>
                    <TableCell sx={{ width: 180 }}>Created</TableCell>
                    <TableCell align="right" sx={{ width: 80 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((a: AliasRow) => (
                    <TableRow key={a.id} hover>
                      <TableCell
                        sx={{
                          maxWidth: 250,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {a.alias}
                      </TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 250,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        <Chip size="small" label={a.aliasNormalized} />
                      </TableCell>
                      <TableCell
                        sx={{
                          maxWidth: 250,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        {a.cosing?.inciName ?? <em>—</em>}
                      </TableCell>
                      <TableCell>{a.confidence ?? '—'}</TableCell>
                      <TableCell>
                        {new Date(a.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ width: 80 }}>
                        <IconButton
                          size="small"
                          onClick={() => onDelete(a.id)}
                          disabled={deleting}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ) : (
            <Typography color="text.secondary">No aliases yet.</Typography>
          )}
        </CardContent>
      </Card>

      {/* Create alias dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create alias (global)</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="Alias text"
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            helperText='Label variant seen on products (e.g., “Aqua (Water)”).'
          />
          <Autocomplete
            sx={{ mt: 2 }}
            options={cosingOptions}
            getOptionLabel={(o) => o.inciName}
            onChange={(_, v) =>
              setChosen(v ? { id: v.id, inciName: v.inciName } : null)
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Map to CosIng"
                value={cosingQuery}
                onChange={(e) => setCosingQuery(e.target.value)}
                helperText="Type at least 2 characters"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={onCreate}
            variant="contained"
            disabled={!aliasText.trim() || !chosen || creating}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
