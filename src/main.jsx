import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, ErrorBoundary } from "./App.jsx";
import { AppProvider } from "./AppContext.jsx";
import { CLOUD_SYNC_ENABLED } from "./config.js";
import { createStore } from "./lib/store.js";
import "./style.css";

const store = createStore(localStorage);
// A signed-in notebook loads once auth answers; with sync on, seeding waits for it.
store.load("", { seed: !CLOUD_SYNC_ENABLED || !sessionStorageHasAccount() });

function sessionStorageHasAccount() {
  try { return !!JSON.parse(sessionStorage.getItem("saturn-pkm-ui"))?.uid; } catch { return false; }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider store={store}>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);
