import type { RouteRecordRaw } from 'vue-router';

import AdminPage from './pages/AdminPage.vue';
import AdminUnlockPage from './pages/AdminUnlockPage.vue';
import ForgotPasswordPage from './pages/ForgotPasswordPage.vue';
import HomePage from './pages/HomePage.vue';
import HouseholdProfilePage from './pages/HouseholdProfilePage.vue';
import InvitationPage from './pages/InvitationPage.vue';
import InvitationsPage from './pages/InvitationsPage.vue';
import LoginPage from './pages/LoginPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import OnboardingPage from './pages/OnboardingPage.vue';
import PrivacyPage from './pages/PrivacyPage.vue';
import ResetPasswordPage from './pages/ResetPasswordPage.vue';
import TwoFactorPage from './pages/TwoFactorPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Titre de la page, repris dans le titre du document. */
    title: string;
    /** Libellé dans la navigation principale. Absent, la page n'y figure pas. */
    navLabel?: string;
    /**
     * Accessible sans session. Absent, la page en demande une : l'application
     * est privée, et le défaut doit être le plus fermé des deux.
     */
    public?: boolean;
    /**
     * Réservée à l'administration : rôle administrateur, second facteur actif,
     * et code validé dans cette session (ADR 0012).
     *
     * La garde de navigation s'en sert pour conduire au bon écran, et la barre
     * de navigation pour ne pas montrer l'entrée aux autres comptes. Ce qui
     * protège les données reste le serveur.
     */
    admin?: boolean;
  }
}

/*
  La page de démonstration ne doit pas partir dans le paquet livré. La
  condition est donc écrite ici, au niveau du module, et non dans la fonction
  en dessous : import.meta.env.MODE est remplacé à la compilation, la branche
  devient du code mort et l'import dynamique disparaît avec elle. Placée dans
  la fonction, la même condition laissait le greffon émettre le fragment, parce
  que le corps de la fonction, lui, reste bien vivant.
*/
const designSystemPage =
  import.meta.env.MODE === 'production' ? undefined : () => import('./pages/DesignSystemPage.vue');

/**
 * La table des routes. La page de démonstration du design system n'est pas une
 * page de l'application : elle n'est ajoutée que là où elle a un sens, et elle
 * n'est de toute façon pas construite en production.
 */
export function createRoutes(withDesignSystem: boolean): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = [
    {
      path: '/',
      name: 'home',
      component: HomePage,
      meta: { title: 'Accueil', navLabel: 'Accueil' },
    },
  ];

  /*
    Le premier lancement : le même profil, une étape à la fois. Hors
    navigation : la garde y conduit tant qu'il reste à faire, et cesse de le
    faire une fois terminé. L'adresse reste atteignable à la main, et le
    parcours se rejoue alors sans conséquence : la date de fin, elle, ne
    s'écrit qu'une fois (ADR 0016).
  */
  routes.push({
    path: '/premier-lancement',
    name: 'onboarding',
    component: OnboardingPage,
    meta: { title: 'Bienvenue' },
  });

  /*
    Le profil du foyer : la première page qui porte des données de foyer, et la
    seule entrée de navigation que le lot 1 ajoute après l'administration. Elle
    demande une session, comme tout le reste (ADR 0015).
  */
  routes.push({
    path: '/profil',
    name: 'household-profile',
    component: HouseholdProfilePage,
    meta: { title: 'Profil du foyer', navLabel: 'Profil' },
  });

  /*
    La page de confidentialité : publique, et liée depuis le pied de page.

    Publique parce qu'elle doit se lire avant de creer un compte, donc sans en
    avoir un (ADR 0017). Pas de libelle de navigation : elle se lit une fois, et
    sa place est le pied de page, pas la barre de navigation.
  */
  routes.push({
    path: '/confidentialite',
    name: 'privacy',
    component: PrivacyPage,
    meta: { title: 'Confidentialité', public: true },
  });

  /*
    La connexion est l'autre page ouverte, et elle ne figure pas dans la
    navigation : on y arrive par la garde, ou parce qu'on n'est pas connecté.
    Import statique, c'est le premier écran d'une visite sans session.
  */
  routes.push({
    path: '/connexion',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Connexion', public: true },
  });

  /*
    Le mot de passe oublié : deux pages ouvertes, forcément, puisqu'elles sont
    faites pour quelqu'un qui ne peut pas se connecter.

    La seconde reçoit le jeton dans le fragment de l'adresse, qu'elle lit puis
    efface, comme la page d'invitation (ADR 0014). Aucune des deux ne figure
    dans la navigation : on y arrive par le lien de la page de connexion, ou par
    celui de l'e-mail.
  */
  routes.push({
    path: '/mot-de-passe-oublie',
    name: 'forgot-password',
    component: ForgotPasswordPage,
    meta: { title: 'Mot de passe oublié', public: true },
  });

  routes.push({
    path: '/mot-de-passe/reinitialisation',
    name: 'reset-password',
    component: ResetPasswordPage,
    meta: { title: 'Nouveau mot de passe', public: true },
  });

  /*
    La double authentification : une page de compte, qui demande une session.
    Elle ne figure pas dans la navigation : on y arrive par l'invitation de
    l'en-tête quand elle manque, ou par un lien direct.
  */
  routes.push({
    path: '/securite/double-authentification',
    name: 'two-factor',
    component: TwoFactorPage,
    meta: { title: 'Double authentification' },
  });

  /*
    L'inscription par invitation : ouverte, et la seule porte d'entrée de la V1.
    Le jeton voyage dans le fragment de l'adresse, que cette page lit puis
    efface (ADR 0013).
  */
  routes.push({
    path: '/invitation',
    name: 'invitation',
    component: InvitationPage,
    meta: { title: 'Créer votre compte', public: true },
  });

  /*
    L'espace d'administration. Seule l'entrée figure dans la navigation, et
    seulement pour un administrateur : les autres pages s'atteignent depuis
    elle.
  */
  routes.push({
    path: '/administration',
    name: 'admin',
    component: AdminPage,
    meta: { title: 'Administration', navLabel: 'Administration', admin: true },
  });

  routes.push({
    path: '/administration/deverrouillage',
    name: 'admin-unlock',
    component: AdminUnlockPage,
    meta: { title: "Déverrouiller l'administration", admin: true },
  });

  routes.push({
    path: '/administration/invitations',
    name: 'admin-invitations',
    component: InvitationsPage,
    meta: { title: 'Invitations', admin: true },
  });

  if (withDesignSystem && designSystemPage !== undefined) {
    routes.push({
      path: '/design-system',
      name: 'design-system',
      component: designSystemPage,
      meta: { title: 'Design system', navLabel: 'Design system' },
    });
  }

  /*
    Le repli vient en dernier, et hors de toute condition : une URL inconnue
    est servie par la bascule SPA, et sans cette route RouterView ne rend rien.
    L'utilisateur obtient alors un main vide, sans titre, sans explication et
    sans moyen de repartir. Import statique, la page devant exister en
    production, où le défaut se produit le plus.
  */
  routes.push({
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
    // Pas de navLabel : ce n'est pas une destination, elle n'a rien à faire
    // dans la barre de navigation.
    meta: { title: 'Page introuvable' },
  });

  return routes;
}

// La table des routes est séparée de la création du routeur : createWebHistory
// touche à window dès l'import, ce qui la rendrait intestable hors navigateur.
export const routes = createRoutes(import.meta.env.MODE !== 'production');
