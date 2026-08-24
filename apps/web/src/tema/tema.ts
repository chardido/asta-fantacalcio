import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  CloseButton,
  Drawer,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  Switch,
  TextInput,
  Textarea,
  createTheme,
} from "@mantine/core";

export const DIMENSIONE_INTERATTIVA_MINIMA = 44;

export const COLORI_NOCTURNE = {
  sfondo: "#161826",
  superficie: "#232532",
  superficieElevata: "#2b2e3d",
  bordo: "#3a3d4f",
  testo: "#e9e9ed",
  testoSecondario: "#aeb0bd",
  accento: "#9184d9",
} as const;

const stileInputInterattivo = {
  input: {
    backgroundColor: COLORI_NOCTURNE.superficieElevata,
    borderColor: COLORI_NOCTURNE.bordo,
    color: COLORI_NOCTURNE.testo,
    minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
    minWidth: DIMENSIONE_INTERATTIVA_MINIMA,
  },
} as const;

const proprietaInputInterattivo = {
  size: "lg" as const,
  styles: stileInputInterattivo,
};

export const tema = createTheme({
  black: COLORI_NOCTURNE.sfondo,
  white: COLORI_NOCTURNE.testo,
  colors: {
    dark: [
      "#f7f7f9",
      COLORI_NOCTURNE.testo,
      "#d3d4dc",
      "#b9bac5",
      COLORI_NOCTURNE.testoSecondario,
      "#7f8292",
      "#555969",
      COLORI_NOCTURNE.bordo,
      COLORI_NOCTURNE.superficie,
      COLORI_NOCTURNE.sfondo,
    ],
    nocturne: [
      "#f2f0fb",
      "#e3dff6",
      "#cec6ee",
      "#b5aae5",
      COLORI_NOCTURNE.accento,
      "#8274d3",
      "#7364c6",
      "#6254ae",
      "#534895",
      "#463e7d",
    ],
  },
  defaultRadius: "md",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headings: {
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: "700",
  },
  primaryColor: "nocturne",
  primaryShade: { dark: 7, light: 4 },
  radius: {
    xs: "4px",
    sm: "8px",
    md: "8px",
    lg: "14px",
    xl: "14px",
  },
  respectReducedMotion: true,
  components: {
    Autocomplete: Autocomplete.extend({
      defaultProps: {
        clearButtonProps: { size: "xl" },
        ...proprietaInputInterattivo,
      },
    }),
    Button: Button.extend({
      defaultProps: {
        h: DIMENSIONE_INTERATTIVA_MINIMA,
        miw: DIMENSIONE_INTERATTIVA_MINIMA,
        radius: "sm",
      },
      styles: {
        root: { fontWeight: 650 },
      },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: {
        radius: "sm",
        size: DIMENSIONE_INTERATTIVA_MINIMA,
      },
    }),
    Switch: Switch.extend({
      defaultProps: {
        size: "md",
        styles: {
          body: {
            alignItems: "center",
            minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
          },
          label: {
            alignItems: "center",
            display: "flex",
            minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
          },
          root: {
            minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
          },
        },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: proprietaInputInterattivo,
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: proprietaInputInterattivo,
    }),
    Textarea: Textarea.extend({
      defaultProps: proprietaInputInterattivo,
    }),
    CloseButton: CloseButton.extend({
      defaultProps: {
        size: DIMENSIONE_INTERATTIVA_MINIMA,
      },
    }),
    NumberInput: NumberInput.extend({
      defaultProps: {
        allowDecimal: false,
        hideControls: true,
        ...proprietaInputInterattivo,
      },
    }),
    Select: Select.extend({
      defaultProps: proprietaInputInterattivo,
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: proprietaInputInterattivo,
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: {
        radius: "sm",
        styles: {
          control: { minHeight: DIMENSIONE_INTERATTIVA_MINIMA },
          label: {
            alignItems: "center",
            display: "flex",
            justifyContent: "center",
            minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
          },
        },
      },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "md" },
      styles: {
        root: {
          backgroundColor: COLORI_NOCTURNE.superficie,
          borderColor: COLORI_NOCTURNE.bordo,
        },
      },
    }),
    Card: Card.extend({
      defaultProps: { radius: "lg" },
      styles: {
        root: {
          backgroundColor: COLORI_NOCTURNE.superficie,
          borderColor: COLORI_NOCTURNE.bordo,
        },
      },
    }),
    Alert: Alert.extend({ defaultProps: { radius: "md", variant: "light" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light" } }),
    Modal: Modal.extend({ defaultProps: { centered: true, radius: "lg" } }),
    Drawer: Drawer.extend({ defaultProps: { radius: "lg" } }),
  },
});
