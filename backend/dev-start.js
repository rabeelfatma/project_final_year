/**
 * Local development entry: enables full application mode for npm run dev
 * without changing the local/production default (locked maintenance until
 * APP_RUNTIME_MODE=full).
 */
process.env.APP_RUNTIME_MODE = process.env.APP_RUNTIME_MODE || "full";
require("./server.js");
