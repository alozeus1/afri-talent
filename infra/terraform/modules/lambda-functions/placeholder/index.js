// Placeholder Lambda handler used during Terraform-only development.
// CI replaces this with the real built artifact via the *_zip_path inputs.
exports.handler = async () => ({
  statusCode: 503,
  body: JSON.stringify({ error: "lambda not yet deployed" }),
});
