const dns = require("dns");

/**
 * Some Windows/Node environments refuse SRV lookups via the default resolver
 * (querySrv ECONNREFUSED) while public resolvers succeed. Atlas mongodb+srv
 * requires SRV/TXT resolution, so prefer public DNS only for SRV URIs.
 *
 * @param {string} [uri] MongoDB URI (defaults to process.env.MONGO_URI)
 */
function ensureSrvDnsResolvers(uri) {
  const value = String(uri || process.env.MONGO_URI || "");
  if (!value.startsWith("mongodb+srv://")) return;
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch (_) {
    /* keep process defaults */
  }
}

module.exports = { ensureSrvDnsResolvers };
