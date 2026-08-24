import {
  ActionIcon,
  Autocomplete,
  Button,
  CloseButton,
  NumberInput,
  PasswordInput,
  Select,
  Switch,
  TextInput,
  createTheme,
} from "@mantine/core";

export const DIMENSIONE_INTERATTIVA_MINIMA = 44;

const stileInputInterattivo = {
  input: {
    minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
    minWidth: DIMENSIONE_INTERATTIVA_MINIMA,
  },
} as const;

export const tema = createTheme({
  components: {
    Autocomplete: Autocomplete.extend({
      defaultProps: {
        clearButtonProps: { size: "xl" },
        size: "lg",
        styles: stileInputInterattivo,
      },
    }),
    Button: Button.extend({
      defaultProps: {
        h: DIMENSIONE_INTERATTIVA_MINIMA,
        miw: DIMENSIONE_INTERATTIVA_MINIMA,
      },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: {
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
      defaultProps: {
        size: "lg",
        styles: stileInputInterattivo,
      },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: {
        size: "lg",
        styles: stileInputInterattivo,
      },
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
        size: "lg",
        styles: stileInputInterattivo,
      },
    }),
    Select: Select.extend({
      defaultProps: {
        size: "lg",
        styles: stileInputInterattivo,
      },
    }),
  },
});
