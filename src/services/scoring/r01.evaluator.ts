import fs from 'fs';
import path from 'path';

export type R01Config = {
  rule_id: 'R01';
  name: string;
  version: string;
  direction: 'bonus';
  max_points: number;
  exceptions_source: string;                 // "datasets/exceptions@1.0.0"
  exceptions_matching: 'exact_name';
  bucketing: {
    large_list_threshold: number;           // 15
    large_list_scheme: {
      name: 'thirds';
      awards: { top: number; middle: number; bottom: number };
    };
    small_list_scheme: {
      name: 'halves';
      awards: { first: number; second: number };
    };
    indexing: 'zero_based';
    tie_breaks: 'floor_division_boundaries';
  };
  scoring: {
    points_per_active_formula: string;      // "30 / count(actives_detected)"
    exceptions_full_points: boolean;        // true
  };
};

export type R01Context = {
  productId: string;
  listLength: number;                       // total INCI items
  actives: Array<{
    ingredientId: string;                   // cosing _id as string
    name: string;                           // CosIng inci_name (canonical)
    index: number;                          // first occurrence (0-based)
  }>;
  exceptions: {
    dataset_version: string;                // "1.0.0"
    names: Set<string>;                     // normalized exception names
  };
};

export type R01Result = {
  rule_id: 'R01';
  version: string;
  direction: 'bonus';
  max_points: number;
  points_awarded: number;                   // 0..30
  verdict: 'pass' | 'partial' | 'unknown';
  confidence: 'high';
  explanation: string;
  observed_inputs: {
    actives_detected: Array<{
      ingredient_id: string;
      name: string;
      index: number;
      bucket: string;
      awarded: number;
    }>;
    exceptions_applied: string[];
    x_points: number;                       // points per active
    list_length: number;
    dataset_versions_used: { exceptions: string };
  };
};

function normalizeName(value: string): string {
  return (value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function computePositionBucket(
  ingredientIndex: number,
  inciListLength: number
): 'top' | 'middle' | 'bottom' | 'first' | 'second' {
  if (inciListLength >= 15) {
    const firstThirdBoundary = Math.floor(inciListLength / 3);
    const secondThirdBoundary = Math.floor((2 * inciListLength) / 3);
    if (ingredientIndex < firstThirdBoundary) return 'top';
    if (ingredientIndex < secondThirdBoundary) return 'middle';
    return 'bottom';
  } else {
    const halfBoundary = Math.floor(inciListLength / 2);
    return ingredientIndex < halfBoundary ? 'first' : 'second';
  }
}

export function evaluateR01(context: R01Context, config: R01Config): R01Result {
  const activeCount = context.actives.length;

  if (activeCount <= 0) {
    return {
      rule_id: 'R01',
      version: config.version,
      direction: 'bonus',
      max_points: config.max_points,
      points_awarded: 0,
      verdict: 'unknown',
      confidence: 'high',
      explanation: 'No actives detected.',
      observed_inputs: {
        actives_detected: [],
        exceptions_applied: [],
        x_points: 0,
        list_length: context.listLength,
        dataset_versions_used: { exceptions: context.exceptions.dataset_version },
      },
    };
  }

  const pointsPerActive = 30 / activeCount;
  const exceptionsAppliedNames: string[] = [];
  const perActiveRows: Array<{
    ingredient_id: string;
    name: string;
    index: number;
    bucket: string;
    awarded: number;
  }> = [];

  for (const activeIngredient of context.actives) {
    const isException = context.exceptions.names.has(normalizeName(activeIngredient.name));
    const positionBucket = computePositionBucket(activeIngredient.index, context.listLength);

    let multiplier = 1.0;
    if (!isException) {
      if (context.listLength >= config.bucketing.large_list_threshold) {
        // thirds
        if (positionBucket === 'top') {
          multiplier = config.bucketing.large_list_scheme.awards.top;
        } else if (positionBucket === 'middle') {
          multiplier = config.bucketing.large_list_scheme.awards.middle;
        } else {
          multiplier = config.bucketing.large_list_scheme.awards.bottom;
        }
      } else {
        // halves
        multiplier =
          positionBucket === 'first'
            ? config.bucketing.small_list_scheme.awards.first
            : config.bucketing.small_list_scheme.awards.second;
      }
    } else {
      multiplier = 1.0; // exceptions always get full points
      exceptionsAppliedNames.push(activeIngredient.name);
    }

    const awardedPoints = pointsPerActive * multiplier;
    perActiveRows.push({
      ingredient_id: activeIngredient.ingredientId,
      name: activeIngredient.name,
      index: activeIngredient.index,
      bucket: positionBucket,
      awarded: awardedPoints,
    });
  }

  const totalAwardedPoints = perActiveRows.reduce((sum, row) => sum + row.awarded, 0);
  const verdict =
    totalAwardedPoints === 30 ? 'pass' : totalAwardedPoints > 0 ? 'partial' : 'unknown';

  return {
    rule_id: 'R01',
    version: config.version,
    direction: 'bonus',
    max_points: config.max_points,
    points_awarded: Number(totalAwardedPoints.toFixed(4)),
    verdict,
    confidence: 'high',
    explanation: `Awarded ${Number(totalAwardedPoints.toFixed(2))} / 30 for ${activeCount} actives (X=${Number(
      pointsPerActive.toFixed(4)
    )}). Exceptions full points: ${
      exceptionsAppliedNames.length ? exceptionsAppliedNames.join(', ') : 'none'
    }.`,
    observed_inputs: {
      actives_detected: perActiveRows,
      exceptions_applied: exceptionsAppliedNames,
      x_points: Number(pointsPerActive.toFixed(6)),
      list_length: context.listLength,
      dataset_versions_used: { exceptions: context.exceptions.dataset_version },
    },
  };
}

// helpers to load JSON from disk (optional)
export function loadR01ConfigFromFile(absoluteJsonPath: string): R01Config {
  const text = fs.readFileSync(absoluteJsonPath, 'utf8');
  return JSON.parse(text);
}

export function loadExceptionsDataset(absoluteJsonPath: string): {
  dataset_version: string;
  names: Set<string>;
} {
  const text = fs.readFileSync(absoluteJsonPath, 'utf8');
  const json = JSON.parse(text) as {
    dataset: string;
    version: string;
    match_mode: string;
    ingredients: string[];
  };
  return {
    dataset_version: json.version,
    names: new Set(json.ingredients.map(normalizeName)),
  };
}
