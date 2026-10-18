// Source of truth for the "auth" namespace. Add keys here first; every
// other locale file must then define the same keys (enforced by tsc and
// src/lib/i18n/__tests__/namespaces.test.ts).
export default {
  "auth.welcomeBack": "Welcome Back",
  "auth.signInToAccount": "Sign in to your account",
  "auth.signIn": "Sign In",
  "auth.createAccount": "Create Account",
  "auth.dontHaveAccount": "Don't have an account?",
  "auth.alreadyHaveAccount": "Already have an account?",
  "auth.forgotPassword": "Forgot your password?",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.fullName": "Full Name",
  "auth.iAm": "I am a",
  "auth.candidate": "Candidate",
  "auth.employer": "Employer",
  "auth.lookingForJobs": "Looking for jobs",
  "auth.hiringTalent": "Hiring talent",
} satisfies Record<string, string>;
