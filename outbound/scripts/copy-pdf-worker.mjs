// Copies the PDF reader's worker script into /public so the browser can load it from our own domain.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
const from = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(from)) { mkdirSync("public", { recursive: true }); copyFileSync(from, "public/pdf.worker.min.mjs"); console.log("pdf worker copied"); }
