import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// Redacted key paths. Pino wildcards only match one level deep, so both the
// bare key and the `*.` form are listed for every sensitive field. Phone/OTP
// keys are included so notification payloads and SMS-provider errors can
// never leak them, even from a future stray log call.
export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "email",
  "*.email",
  "to",
  "*.to",
  "replyTo",
  "*.replyTo",
  "phone",
  "*.phone",
  "phoneNumber",
  "*.phoneNumber",
  "otp",
  "*.otp",
  "otpCode",
  "*.otpCode",
];

// Configure Pino logger
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),

  // Redact sensitive fields
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },

  // Formatting
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      node_version: process.version,
    }),
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty print in development only
  transport: isProduction
    ? undefined
    : {
        target: "pino/file",
        options: { destination: 1 }, // stdout
      },
});

// Create child logger with context
export function createLogger(context: string) {
  return logger.child({ context });
}

// Request logger configuration for pino-http
export const httpLoggerConfig = {
  logger,
  
  // Generate unique request ID
  genReqId: (req: { id?: string; headers: { "x-request-id"?: string } }) => {
    return req.headers["x-request-id"] || generateRequestId();
  },

  // Customize serializers
  serializers: {
    req: (req: {
      id: string;
      method: string;
      url: string;
      headers: Record<string, string>;
      remoteAddress: string;
    }) => ({
      id: req.id,
      method: req.method,
      // Query strings routinely carry reset, verification, and OAuth state
      // values. Keep route-level observability without retaining them in logs.
      url: req.url.split("?", 1)[0],
      userAgent: req.headers["user-agent"],
      remoteAddress: req.remoteAddress,
    }),
    res: (res: { statusCode: number }) => ({
      statusCode: res.statusCode,
    }),
  },

  // Custom success message
  customSuccessMessage: (req: { method: string; url: string }, res: { statusCode: number }) => {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },

  // Custom error message
  customErrorMessage: (req: { method: string; url: string }, res: { statusCode: number }) => {
    return `${req.method} ${req.url} failed with ${res.statusCode}`;
  },

  // Don't log health checks in production
  autoLogging: {
    ignore: (req: { url?: string }) => {
      return isProduction && req.url === "/health";
    },
  },
};

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export default logger;
