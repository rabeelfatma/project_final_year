const mongoose = require("mongoose");
const { ensureSrvDnsResolvers } = require("./mongoDns");

/**
 * Reuse one mongoose connection across serverless invocations.
 * Avoid process.exit() on Vercel — that terminates the runtime for all requests.
 */
const globalKey = "__quickcheck_mongoose__";
const cached = global[globalKey] || { conn: null, promise: null };
global[globalKey] = cached;

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      const err = new Error("MONGO_URI is not configured.");
      if (process.env.VERCEL === "1") throw err;
      console.error("MongoDB Connection Error:", err.message);
      process.exit(1);
    }

    ensureSrvDnsResolvers(uri);
    cached.promise = mongoose
      .connect(uri)
      .then((m) => {
        console.log("MongoDB Connected Successfully");
        return m;
      })
      .catch((error) => {
        cached.promise = null;
        console.error("MongoDB Connection Error:", error.message);
        if (process.env.VERCEL === "1") {
          throw error;
        }
        process.exit(1);
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
