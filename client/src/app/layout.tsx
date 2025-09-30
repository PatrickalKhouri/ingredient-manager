'use client';
import { CssBaseline, ThemeProvider, createTheme, Container, Box, Typography } from '@mui/material';
import ReactQueryProvider from './react-query-provider';

const theme = createTheme({ palette: { mode: 'light' } });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Container maxWidth="lg">
            <Box py={4}>
              <Typography variant="h3" fontWeight={700}>Oli Labs Matcher</Typography>
              <Typography color="text.secondary" mt={1}>
                Add a product, then resolve unmatched ingredients by creating aliases or manual matches.
              </Typography>
            </Box>
            <ReactQueryProvider>{children}</ReactQueryProvider>
          </Container>
        </ThemeProvider>
      </body>
    </html>
  );
}
