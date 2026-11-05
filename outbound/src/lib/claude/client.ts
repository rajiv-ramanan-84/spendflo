import "server-only";

/** App entry point for Claude calls. The guard keeps the API key out of any browser bundle. */
export * from "./call";
