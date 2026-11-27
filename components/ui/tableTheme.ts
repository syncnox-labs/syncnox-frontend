/**
 * Table look for screens that use the Syncnox interface language (see components/ui/kit.tsx):
 * a filled header row with small uppercase labels instead of a ruled header, thin row lines taken from the
 * brand-green neutrals, medium weight at most. Pass as `themeParams` to BaseTable.
 */
export const tableTheme = {
  borderColor: "#E3E8E5",
  foregroundColor: "#12211A",
  headerBackgroundColor: "#F3F6F4",
  headerTextColor: "#626E67",
  headerFontSize: 11,
  headerFontWeight: 500,
  headerHeight: 34,
  rowHoverColor: "#F3F6F4",
  selectedRowBackgroundColor: "#E7F3ED",
  accentColor: "#003220",
} as const;
