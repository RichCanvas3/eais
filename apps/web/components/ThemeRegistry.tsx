'use client';
import * as React from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

const theme = createTheme({
	palette: {
		mode: 'light',
		primary: { main: '#2563eb' },
		secondary: { main: '#0ea5e9' },
		background: { default: '#f8fafc' },
	},
	shape: { borderRadius: 12 },
});

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}


