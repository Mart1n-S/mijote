<script setup lang="ts">
/*
  La page de confidentialité.

  Publique, et liée depuis le pied de page : elle doit se lire avant de créer un
  compte, donc sans en avoir un.

  Elle dit quatre choses et s'arrête là : quelles données, pourquoi, combien de
  temps, et où se trouvent l'export et la suppression. Pas de responsable du
  traitement, pas de mention de la CNIL, aucune mention légale : Mijote tourne
  sur un réseau local, sans exposition à Internet, pour son auteur et sa
  famille, ce qui relève du cadre domestique que le RGPD écarte de son champ
  (article 2, paragraphe 2, point c). L'ADR 0017 écrit ce raisonnement et dit
  quand y revenir.

  Les durées annoncées ne sont pas inventées ici : invitations terminées trente
  jours (ADR 0013), tentatives un jour (ADR 0010), journaux trente jours et
  journal d'audit un an (cahier des charges, section 8), sauvegardes sept jours
  (ADR 0017).
*/
</script>

<template>
  <h1>Confidentialité</h1>

  <div class="privacy">
    <p>
      Mijote est une application privée, hébergée sur un réseau local et utilisée par son auteur et
      sa famille. Cette page dit ce qu'elle conserve, pourquoi, et combien de temps.
    </p>

    <h2>Ce qui est conservé</h2>

    <ul>
      <li>
        <strong>Votre compte</strong> : votre adresse e-mail, votre mot de passe sous forme
        d'empreinte, qui ne permet pas de le retrouver, votre rôle et votre date d'inscription.
      </li>
      <li>
        <strong>Votre foyer</strong> : son nom, le nombre de personnes, le budget, le temps de
        préparation, l'objectif, et vos allergies, intolérances, régimes et ingrédients écartés.
      </li>
      <li>
        <strong>Votre sécurité</strong> : l'état de la double authentification et la date de son
        activation, les codes de secours sous forme d'empreintes, et les dates des sessions
        ouvertes.
      </li>
      <li>
        <strong>Vos connexions</strong> : les tentatives récentes, sous forme d'empreintes, et des
        lignes de journal qui ne portent que des identifiants.
      </li>
    </ul>

    <p>
      Les allergies et les intolérances sont des données de santé. Elles ne servent qu'à écarter des
      recettes, elles ne sont jamais écrites dans les journaux, et elles ne sortent de l'application
      que dans le fichier que vous demandez vous-même.
    </p>

    <h2>Pourquoi</h2>

    <ul>
      <li>
        L'adresse e-mail sert à se connecter, et à recevoir une invitation ou un lien de
        réinitialisation.
      </li>
      <li>Le foyer sert à choisir les recettes, calculer les quantités et tenir le budget.</li>
      <li>
        Les empreintes de connexion servent à limiter les tentatives, donc à protéger le compte.
      </li>
    </ul>

    <p>
      Rien n'est vendu, ni partagé, ni utilisé pour de la publicité. Il n'y a aucun traceur et
      aucune mesure d'audience.
    </p>

    <h2>Combien de temps</h2>

    <ul>
      <li>Le compte et le foyer : tant que le compte existe.</li>
      <li>Les invitations terminées : trente jours.</li>
      <li>Les tentatives de connexion : un jour.</li>
      <li>Les journaux techniques : trente jours. Le journal des actions sensibles : un an.</li>
      <li>
        Les sauvegardes : sept jours au plus. Une suppression ne réécrit pas les sauvegardes déjà
        prises, donc une copie de vos données peut subsister jusqu'à sept jours.
      </li>
    </ul>

    <h2>Récupérer vos données, ou supprimer votre compte</h2>

    <p>
      Les deux se font depuis la page <strong>Profil du foyer</strong>, section
      <strong>Mes données</strong>. Le téléchargement rend un fichier qui contient tout ce qui est
      conservé sur vous, sauf ce qui sert à s'authentifier. La suppression est immédiate et sans
      retour : le compte, le foyer et son profil sont effacés.
    </p>
  </div>
</template>

<style scoped>
.privacy {
  /* La longueur de ligne confortable à la lecture, comme les autres pages de
     texte : plus large que les formulaires, plus étroit que l'écran. */
  max-width: 42rem;
  margin-top: var(--space-5);
}

.privacy h2 {
  margin-top: var(--space-6);
}

.privacy li {
  margin-bottom: var(--space-2);
}
</style>
