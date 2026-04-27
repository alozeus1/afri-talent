import type { SupportedLocale } from "./config";

export type MessageKey =
  | "nav.findJobs"
  | "nav.companies"
  | "nav.salaries"
  | "nav.interviews"
  | "nav.learn"
  | "nav.pricing"
  | "nav.dashboard"
  | "nav.login"
  | "nav.getStarted"
  | "nav.messages"
  | "nav.notifications"
  | "nav.logout"
  | "auth.welcomeBack"
  | "auth.signInToAccount"
  | "auth.signIn"
  | "auth.createAccount"
  | "auth.dontHaveAccount"
  | "auth.alreadyHaveAccount"
  | "common.backToJobs"
  | "common.applyNow"
  | "common.signInToApply"
  | "common.quickApply"
  | "candidate.dashboard"
  | "pricing.title"
  | "pricing.subtitle";

type LocaleDictionary = Record<MessageKey, string>;

export const MESSAGES: Record<SupportedLocale, LocaleDictionary> = {
  en: {
    "nav.findJobs": "Find Jobs",
    "nav.companies": "Companies",
    "nav.salaries": "Salaries",
    "nav.interviews": "Interviews",
    "nav.learn": "Learn",
    "nav.pricing": "Pricing",
    "nav.dashboard": "Dashboard",
    "nav.login": "Login",
    "nav.getStarted": "Get Started",
    "nav.messages": "Messages",
    "nav.notifications": "Notifications",
    "nav.logout": "Logout",
    "auth.welcomeBack": "Welcome Back",
    "auth.signInToAccount": "Sign in to your account",
    "auth.signIn": "Sign In",
    "auth.createAccount": "Create Account",
    "auth.dontHaveAccount": "Don't have an account?",
    "auth.alreadyHaveAccount": "Already have an account?",
    "common.backToJobs": "Back to Jobs",
    "common.applyNow": "Apply Now",
    "common.signInToApply": "Sign in to Apply",
    "common.quickApply": "Quick Apply",
    "candidate.dashboard": "Dashboard",
    "pricing.title": "Plans & Pricing",
    "pricing.subtitle": "Choose the right plan for your career growth",
  },
  es: {
    "nav.findJobs": "Buscar empleos",
    "nav.companies": "Empresas",
    "nav.salaries": "Salarios",
    "nav.interviews": "Entrevistas",
    "nav.learn": "Aprender",
    "nav.pricing": "Precios",
    "nav.dashboard": "Panel",
    "nav.login": "Iniciar sesión",
    "nav.getStarted": "Comenzar",
    "nav.messages": "Mensajes",
    "nav.notifications": "Notificaciones",
    "nav.logout": "Cerrar sesión",
    "auth.welcomeBack": "Bienvenido de nuevo",
    "auth.signInToAccount": "Inicia sesión en tu cuenta",
    "auth.signIn": "Iniciar sesión",
    "auth.createAccount": "Crear cuenta",
    "auth.dontHaveAccount": "¿No tienes una cuenta?",
    "auth.alreadyHaveAccount": "¿Ya tienes una cuenta?",
    "common.backToJobs": "Volver a empleos",
    "common.applyNow": "Postular ahora",
    "common.signInToApply": "Inicia sesión para postular",
    "common.quickApply": "Postulación rápida",
    "candidate.dashboard": "Panel",
    "pricing.title": "Planes y precios",
    "pricing.subtitle": "Elige el plan adecuado para tu crecimiento profesional",
  },
  fr: {
    "nav.findJobs": "Trouver des emplois",
    "nav.companies": "Entreprises",
    "nav.salaries": "Salaires",
    "nav.interviews": "Entretiens",
    "nav.learn": "Apprendre",
    "nav.pricing": "Tarifs",
    "nav.dashboard": "Tableau de bord",
    "nav.login": "Connexion",
    "nav.getStarted": "Commencer",
    "nav.messages": "Messages",
    "nav.notifications": "Notifications",
    "nav.logout": "Déconnexion",
    "auth.welcomeBack": "Bon retour",
    "auth.signInToAccount": "Connectez-vous à votre compte",
    "auth.signIn": "Se connecter",
    "auth.createAccount": "Créer un compte",
    "auth.dontHaveAccount": "Vous n'avez pas de compte ?",
    "auth.alreadyHaveAccount": "Vous avez déjà un compte ?",
    "common.backToJobs": "Retour aux emplois",
    "common.applyNow": "Postuler maintenant",
    "common.signInToApply": "Connectez-vous pour postuler",
    "common.quickApply": "Candidature rapide",
    "candidate.dashboard": "Tableau de bord",
    "pricing.title": "Plans et tarifs",
    "pricing.subtitle": "Choisissez le plan adapté à votre croissance professionnelle",
  },
  pt: {
    "nav.findJobs": "Encontrar vagas",
    "nav.companies": "Empresas",
    "nav.salaries": "Salários",
    "nav.interviews": "Entrevistas",
    "nav.learn": "Aprender",
    "nav.pricing": "Preços",
    "nav.dashboard": "Painel",
    "nav.login": "Entrar",
    "nav.getStarted": "Começar",
    "nav.messages": "Mensagens",
    "nav.notifications": "Notificações",
    "nav.logout": "Sair",
    "auth.welcomeBack": "Bem-vindo de volta",
    "auth.signInToAccount": "Entre na sua conta",
    "auth.signIn": "Entrar",
    "auth.createAccount": "Criar conta",
    "auth.dontHaveAccount": "Não tem uma conta?",
    "auth.alreadyHaveAccount": "Já tem uma conta?",
    "common.backToJobs": "Voltar às vagas",
    "common.applyNow": "Candidatar-se",
    "common.signInToApply": "Entre para se candidatar",
    "common.quickApply": "Candidatura rápida",
    "candidate.dashboard": "Painel",
    "pricing.title": "Planos e preços",
    "pricing.subtitle": "Escolha o plano certo para sua evolução profissional",
  },
  ar: {
    "nav.findJobs": "البحث عن وظائف",
    "nav.companies": "الشركات",
    "nav.salaries": "الرواتب",
    "nav.interviews": "المقابلات",
    "nav.learn": "التعلم",
    "nav.pricing": "الأسعار",
    "nav.dashboard": "لوحة التحكم",
    "nav.login": "تسجيل الدخول",
    "nav.getStarted": "ابدأ الآن",
    "nav.messages": "الرسائل",
    "nav.notifications": "الإشعارات",
    "nav.logout": "تسجيل الخروج",
    "auth.welcomeBack": "مرحبًا بعودتك",
    "auth.signInToAccount": "سجّل الدخول إلى حسابك",
    "auth.signIn": "تسجيل الدخول",
    "auth.createAccount": "إنشاء حساب",
    "auth.dontHaveAccount": "ليس لديك حساب؟",
    "auth.alreadyHaveAccount": "لديك حساب بالفعل؟",
    "common.backToJobs": "العودة إلى الوظائف",
    "common.applyNow": "قدّم الآن",
    "common.signInToApply": "سجّل الدخول للتقديم",
    "common.quickApply": "تقديم سريع",
    "candidate.dashboard": "لوحة التحكم",
    "pricing.title": "الخطط والأسعار",
    "pricing.subtitle": "اختر الخطة المناسبة لنموك المهني",
  },
};
