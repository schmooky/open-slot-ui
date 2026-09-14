import type { Theme } from '@open-slot-ui/core';

/**
 * The palette every WINDOW uses — the info/rules sheet, the notice modal, the
 * history window and the buy-feature sheet.
 *
 * open-ui used to draw these as white cards, independent of the game theme. They are
 * now the same near-black plate with an accent rule that the ribbon uses, so the HUD
 * reads as one surface instead of a dark bar that opens light dialogs. It is derived
 * from the theme tokens, so recolouring the accent recolours every window with it.
 */
export interface WindowPalette {
  /** The card itself. */
  surface: string;
  /** Rows, wells and the header band inside the card. */
  surfaceAlt: string;
  text: string;
  textDim: string;
  /** The card's rule + the outline of an outline button. */
  border: string;
  accent: string;
  accentText: string;
  /** A filled primary button + its label. */
  primary: string;
  primaryText: string;
  /** The dim behind a modal. */
  scrim: string;
}

export function windowPalette(theme: Theme): WindowPalette {
  return {
    surface: theme.color.menu,
    surfaceAlt: theme.color.surface,
    text: theme.color.text,
    textDim: theme.color.label,
    border: theme.color.accent,
    accent: theme.color.accent,
    accentText: theme.color.accentText,
    primary: theme.color.accent,
    primaryText: theme.color.accentText,
    scrim: '#000000',
  };
}
