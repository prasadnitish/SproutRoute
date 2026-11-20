// Applies only to Railway staging. Live releases still require a configured provider.
export function stagingModelsDisabled() {
  return process.env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
    process.env.V3_DISABLE_MODEL_CALLS === "true";
}
