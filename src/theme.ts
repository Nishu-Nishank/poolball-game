import { createTheme } from '@mui/material/styles';

export const colors = {
  navy: '#0f2742',
  navyLight: '#1d3b5f',
  win: '#15803d',
  winSoft: '#ecfdf3',
  loss: '#b91c1c',
  lossSoft: '#fef2f2',
  border: '#e3e8ef',
  headBg: '#f4f6fa',
  muted: '#5b6b80',
};

export const theme = createTheme({
  palette: {
    primary: { main: colors.navy, light: colors.navyLight },
    success: { main: colors.win },
    error: { main: colors.loss },
    background: { default: '#f3f5f9', paper: '#ffffff' },
    text: { primary: '#0f1b2d', secondary: colors.muted },
    divider: colors.border,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h2: { fontSize: '1.0625rem', fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase' },
    h3: { fontSize: '1rem', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { border: `1px solid ${colors.border}` } },
    },
    MuiAppBar: {
      styleOverrides: { root: { border: 'none' } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: colors.border, fontVariantNumeric: 'tabular-nums' },
        head: {
          backgroundColor: colors.headBg,
          color: colors.muted,
          fontWeight: 600,
          fontSize: '0.8125rem',
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 48 } },
    },
  },
});
