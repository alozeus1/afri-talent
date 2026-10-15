import type en from "./en";

export default {
  "auth.welcomeBack": "Bon retour",
  "auth.signInToAccount": "Connectez-vous à votre compte",
  "auth.signIn": "Se connecter",
  "auth.createAccount": "Créer un compte",
  "auth.dontHaveAccount": "Vous n'avez pas de compte ?",
  "auth.alreadyHaveAccount": "Vous avez déjà un compte ?",
  "auth.forgotPassword": "Mot de passe oublié ?",
  "auth.email": "E-mail",
  "auth.password": "Mot de passe",
  "auth.fullName": "Nom complet",
  "auth.iAm": "Je suis",
  "auth.candidate": "Candidat",
  "auth.employer": "Employeur",
  "auth.lookingForJobs": "À la recherche d'un emploi",
  "auth.hiringTalent": "En train de recruter",
} satisfies Record<keyof typeof en, string>;
