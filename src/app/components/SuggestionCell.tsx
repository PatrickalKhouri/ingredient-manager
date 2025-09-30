import { useState } from 'react';
import {
  Box,
  Chip,
  Popover,
  Stack,
  Typography,
} from '@mui/material';
import { Suggestion } from '../../types/matches';

function SuggestionsCell({
  ingredient,
  productId,
  suggestions,
  onPickSuggestion,
}: {
  ingredient: string;
  productId: string;
  suggestions: Suggestion[];
  onPickSuggestion: (
    productId: string,
    label: string,
    cosingId: string,
    score?: number,
    suggestions?: Suggestion[],
  ) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (!suggestions?.length) {
    return <Typography color="text.secondary">—</Typography>;
  }

  const maxVisible = 1;
  const visibleSuggestions = suggestions.slice(0, maxVisible);
  const hiddenCount = suggestions.length - maxVisible;

  return (
    <>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {visibleSuggestions.map((s) => (
          <Chip
            key={s.cosingId}
            size="small"
            variant="outlined"
            label={`${s.inciName} (${s.score.toFixed(2)})`}
            onClick={(e) => {
              e.stopPropagation();
              onPickSuggestion(productId, ingredient, s.cosingId, s.score, suggestions);
            }}
            sx={{ cursor: 'pointer' }}
          />
        ))}

        {hiddenCount > 0 && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={`+${hiddenCount} more`}
            onClick={(e) => {
              e.stopPropagation();
              setAnchorEl(e.currentTarget);
            }}
          />
        )}
      </Stack>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 400 }}>
          <Typography variant="subtitle2" gutterBottom>
            All suggestions
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {suggestions.map((s) => (
              <Chip
                key={s.cosingId}
                size="small"
                variant="outlined"
                label={`${s.inciName} (${s.score.toFixed(2)})`}
                onClick={() => {
                  onPickSuggestion(productId, ingredient, s.cosingId, s.score, suggestions);
                  setAnchorEl(null);
                }}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

export default SuggestionsCell;
