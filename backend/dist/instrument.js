import dotenv from "dotenv";
import { validateRuntimeEnv } from "./config/env.js";
import { initSentry } from "./lib/sentry.js";
dotenv.config({ quiet: true });
validateRuntimeEnv();
initSentry();
//# sourceMappingURL=instrument.js.map