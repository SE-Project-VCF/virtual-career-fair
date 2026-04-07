import ReactDOM from "react-dom/client";
import App from "./App";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

/** Aligns with BaseLayout header gradient (magenta → forest green). */
const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#b03a6c",
      light: "#d46b93",
      dark: "#7d2849",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#388560",
      light: "#5daa84",
      dark: "#265a44",
      contrastText: "#ffffff",
    },
    background: {
      default: "#fafafa",
      paper: "#ffffff",
    },
  },
  typography: {
    button: {
      fontWeight: 600,
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
);
