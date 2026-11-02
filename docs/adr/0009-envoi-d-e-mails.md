# ADR 0009 : nodemailer seul pour l'envoi d'e-mails

- Statut : acceptée
- Date : 2 novembre 2026

## Contexte

La story #9 demande à l'API d'envoyer des e-mails : les invitations et la réinitialisation du mot de passe en dépendent. Le `CLAUDE.md` ne nommait aucune bibliothèque pour cela, et l'issue elle-même posait la question comme une dépendance à approuver.

Node 24 n'a pas de client SMTP. L'écrire à la main demanderait la négociation TLS (STARTTLS), l'authentification et l'encodage MIME, soit beaucoup de code de protocole non testé.

## Décision

### `nodemailer` 10.3.1, seul

Licence MIT-0, **aucune dépendance d'exécution**, et ses propres types livrés avec le paquet : ni `@types/nodemailer`, ni rien d'autre. Une dépendance en tout pour cette story.

Écartés :

- **`@nestjs-modules/mailer`.** Il enveloppe nodemailer et ajoute un moteur de gabarits (handlebars, pug ou ejs), soit trois dépendances au moins, et impose ses conventions de module. Il se justifie avec beaucoup de gabarits ; le lot 1 en compte un, et la story #10 en ajoutera peut-être un second.
- **Écrire le client SMTP à la main**, pour la raison ci-dessus.

### Les gabarits sont des fonctions TypeScript

Pas de moteur de gabarits, donc pas de dépendance de plus : une fonction par e-mail, qui rend le sujet, le texte brut et le HTML.

**Le prix de ce choix est l'échappement**, et il est explicite : un moteur échappe les valeurs tout seul, nos fonctions doivent appeler `escapeHtml`. La règle qui en découle, et que les tests gardent : toute valeur venue d'une saisie (nom du foyer, nom de la personne qui invite) est échappée avant d'entrer dans le HTML, et jamais dans la version texte, où une entité s'afficherait littéralement.

Si le nombre de gabarits devient tel que cette règle se rate, le moteur redevient le bon choix, et c'est le signal à guetter.

### Mailpit en développement, et dans la CI

`axllent/mailpit:v1.33.0`, dans `docker-compose.yml`, publié sur la seule boucle locale. Il capture tout et n'envoie rien : aucune adresse réelle ne peut recevoir un message de développement par accident. Ses messages vivent en mémoire, sans volume ni `MP_DATABASE`, donc aucune adresse e-mail ne reste sur le disque.

Le même service est déclaré dans la CI, pour que `apps/api/src/mail/mailpit.spec.ts` traverse vraiment nodemailer, SMTP et Mailpit. Ce test se saute quand Mailpit n'est pas joignable, afin qu'un `pnpm test` local sans `docker compose up` reste vert ; c'est le service de la CI qui garantit qu'il tourne pour de bon.

### L'interface d'envoi, et ce que les journaux en disent

Un seul point d'entrée, `Mailer`, avec deux implémentations : `SmtpMailer` en production et en développement, `MemoryMailer` dans les tests. Le fournisseur se choisit donc par l'environnement, sans toucher au code.

Un envoi en échec journalise la cause et lève une `ProblemException`, donc l'appelant reçoit un problème RFC 9457 (ADR 0008) et l'API ne tombe pas. **Seul l'identifiant du message est journalisé** : l'adresse du destinataire est une donnée personnelle, et un destinataire refusé n'est compté que par son nombre.

## Conséquences

- Une dépendance d'exécution de plus, figée à l'exact, et une image Docker de plus, également figée, consignée dans `docs/poste-de-dev.md`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` et `MAIL_FROM` entrent dans `.env.example`. Leur absence arrête le démarrage : une configuration d'e-mail incomplète découverte à la première invitation serait découverte trop tard.
- `MAIL_FROM` n'est jamais une adresse personnelle : c'est celle de l'application, et elle part dans chaque message.
- Le travail de la CI « lint, types et tests » gagne un service. C'est le premier, et il n'ajoute que quelques secondes.

## Quand revoir cette décision

- Si les gabarits se multiplient au point que l'échappement explicite se rate : un moteur de gabarits reprend alors l'avantage.
- Au choix du fournisseur SMTP de production, qui peut imposer son propre client (une API HTTP plutôt que SMTP, par exemple). L'interface `Mailer` est là pour que ce choix ne touche qu'une classe.
- Si une file d'attente avec nouvelles tentatives devient nécessaire : elle est hors du périmètre de la story #9, et elle changerait la signature de `send`.
