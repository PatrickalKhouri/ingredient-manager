'use client';

import { useState } from 'react';
import { Container, Card, CardContent, Tabs, Tab, Button, Stack } from '@mui/material';
import { useRouter } from 'next/navigation';
import ProductsTab from './components/ProductsTab';
import UnmatchedTab from './components/UnmatchedTab';
import ProductsMatchingCard from './components/ProductsMatchingCard';

export default function HomePage() {
  const [tab, setTab] = useState(0);
  const router = useRouter();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
      <Card>
        <CardContent>
          {/* Header row: Tabs + Aliases button */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 2 }}
          >
            <Tabs
              value={tab}
              onChange={(_e, newValue) => setTab(newValue)}
              sx={{ flexGrow: 1 }}
            >
              <Tab label="Products" />
              <Tab label="Unmatched Ingredients" />
            </Tabs>

            <Button
              variant="outlined"
              size="small"
              onClick={() => router.push('/aliases')}
              sx={{ ml: 2 }}
            >
              Manage Aliases
            </Button>
          </Stack>

          <ProductsMatchingCard />

          {/* Render active tab */}
          {tab === 0 && <ProductsTab />}
          {tab === 1 && <UnmatchedTab />}
        </CardContent>
      </Card>
    </Container>
  );
}
