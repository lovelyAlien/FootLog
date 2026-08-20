// Values follow DESIGN.md's light-mode palette (Organic/Natural direction).
export const colors = {
  background: '#faf7f2',

  textPrimary: '#221f1b',
  textSecondary: '#5a554d',
  textMuted: '#9a9186',

  primary: '#3e6259',
  onPrimary: '#ffffff',
  primarySoftBackground: '#e9efe9',
  primarySoftText: '#2c4a42',
  mapRoute: '#a3c2b8',

  border: '#e8e1d6',
  borderMuted: '#d6cdbe',

  buttonSecondaryText: '#4a453d',
  buttonTertiaryText: '#7a7268',

  optionBorder: '#d9d0c2',
  optionText: '#3a362f',

  error: '#b42318',
  noticeBackground: '#fbf1e4',
  noticeText: '#7c2d12',
} as const;

// Display/data-table numeral font from DESIGN.md's Typography section — applied only to
// standalone numerals (check-in times, calendar month title). Korean text stays on the
// platform system font, so this never needs a Hangul-covering glyph set.
export const fonts = {
  display: 'Fraunces_500Medium',
} as const;
