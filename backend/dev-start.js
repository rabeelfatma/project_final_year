/**
 * Local development entry: enables full application mode for npm run dev
 * without changing Hostinger/production default (locked maintenance).
 */
process.env.APP_RUNTIME_MODE = process.env.APP_RUNTIME_MODE || "full";
require("./server.js");
