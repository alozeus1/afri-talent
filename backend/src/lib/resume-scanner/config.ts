export type ResumeScannerMode = "callback" | "disabled";

export type ResumeScannerConfiguration = {
  mode: ResumeScannerMode | null;
  callbackSecretConfigured: boolean;
  registrationEnabled: boolean;
  readinessReason: "configured" | "disabled" | "mode_required" | "secret_required" | "secret_too_short";
};

const MIN_CALLBACK_SECRET_LENGTH = 32;

/**
 * Scanner configuration is deliberately independent of request input.  A
 * callback deployment must be explicitly configured in production so newly
 * uploaded files cannot quietly accumulate in a workflow that can never
 * complete.  The disabled mode is safe for maintenance: it rejects new
 * registrations and never makes an unscanned resume available.
 */
export function getResumeScannerConfiguration(env: NodeJS.ProcessEnv = process.env): ResumeScannerConfiguration {
  const isProductionLike = env.NODE_ENV === "production" || env.NODE_ENV === "staging";
  const rawMode = env.RESUME_SCANNER_MODE?.trim().toLowerCase();
  const mode = rawMode === "callback" || rawMode === "disabled" ? rawMode : null;
  const secret = env.RESUME_SCANNER_WEBHOOK_SECRET?.trim() ?? "";
  const callbackSecretConfigured = secret.length >= MIN_CALLBACK_SECRET_LENGTH;

  if (isProductionLike && mode === null) {
    return { mode, callbackSecretConfigured, registrationEnabled: false, readinessReason: "mode_required" };
  }
  if (mode === "disabled") {
    return { mode, callbackSecretConfigured, registrationEnabled: false, readinessReason: "disabled" };
  }
  if (mode === "callback" || isProductionLike) {
    if (secret.length === 0) {
      return { mode: "callback", callbackSecretConfigured: false, registrationEnabled: false, readinessReason: "secret_required" };
    }
    if (!callbackSecretConfigured) {
      return { mode: "callback", callbackSecretConfigured: false, registrationEnabled: false, readinessReason: "secret_too_short" };
    }
    return { mode: "callback", callbackSecretConfigured: true, registrationEnabled: true, readinessReason: "configured" };
  }

  // Development and test setups retain the existing callback behavior. The
  // callback route itself still fails closed until a secret is supplied.
  return { mode: "callback", callbackSecretConfigured, registrationEnabled: true, readinessReason: "configured" };
}

export function validateResumeScannerConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  const configuration = getResumeScannerConfiguration(env);
  if (configuration.readinessReason === "configured" || configuration.readinessReason === "disabled") return;
  if (configuration.readinessReason === "mode_required") {
    throw new Error("RESUME_SCANNER_MODE must be explicitly set to callback or disabled");
  }
  if (configuration.readinessReason === "secret_required") {
    throw new Error("RESUME_SCANNER_WEBHOOK_SECRET must be set when RESUME_SCANNER_MODE=callback");
  }
  throw new Error("RESUME_SCANNER_WEBHOOK_SECRET must be at least 32 characters when RESUME_SCANNER_MODE=callback");
}
