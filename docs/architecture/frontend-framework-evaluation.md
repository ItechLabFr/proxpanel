# ADR — Évaluation d’un framework front pour ProxPanel

- **Date :** 2026-09-20
- **Issue :** #19
- **Statut :** Décision prise
- **Décision :** **REPORTÉ / NO-GO pour la série 1.7.2**

## Contexte

ProxPanel utilise actuellement une SPA en JavaScript/CSS sans build front dédié, servie par le backend Node.js.

Mesures sur la branche 1.7.2-beta.5.1 :

| Fichier | Taille observée |
| --- | ---: |
| `app/public/app.js` | ~1 800 lignes / ~405 k caractères |
| `app/public/styles.css` | ~1 942 lignes / ~200 k caractères |
| `app/public/auth-v15.js` | ~131 lignes / ~16 k caractères |
| `app/public/auth-v15.css` | ~65 lignes / ~7,5 k caractères |
| `app/server.js` | ~5 459 lignes / ~451 k caractères |

Le `package.json` ne contient actuellement aucun bundler ni pipeline front : le démarrage reste `node server.js`.

## Sécurité : constat explicite

Une migration React, Vue ou Vite **n’améliore pas à elle seule la sécurité d’authentification de ProxPanel**.

Les contrôles importants restent côté serveur :

- session signée et cookie ;
- vérification de l’origine des requêtes mutantes ;
- hashing des mots de passe ;
- TOTP / codes de récupération / secours e-mail ;
- rate limiting ;
- permissions/RBAC côté API ;
- redaction des secrets ;
- validation des entrées et autorisations avant action.

Un framework peut aider à réduire certains risques de rendu grâce à l’échappement par défaut de ses templates, mais il ne remplace ni l’autorisation serveur, ni la protection de session, ni le contrôle des endpoints sensibles. Les API doivent rester sûres même avec un client HTTP totalement externe.

## Bénéfices réels d’une migration

### Positifs

- composants réutilisables ;
- découpage plus clair des vues ;
- state management plus structuré ;
- écosystème de tests UI plus riche ;
- onboarding plus simple pour des contributeurs déjà familiers de React/Vue ;
- meilleure maintenabilité si la surface UI continue à croître fortement.

### Coûts et risques

- réécriture de la majeure partie de `app/public/app.js` ;
- adaptation de la navigation, des modales, formulaires, tableaux, graphiques et interactions ;
- reprise du système FR/EN ;
- introduction d’un pipeline Vite/build dans Docker et dans les releases ;
- adaptation du service worker et de la stratégie de cache PWA ;
- vérification du packaging OTA pour inclure les assets compilés ;
- retest complet login/2FA, utilisateurs, Proxmox, Docker, OTA, notifications et mobile ;
- risque de régressions alors que la série 1.7.2 est encore en construction.

## Estimation de migration

Ordre de grandeur pour une migration complète avec parité fonctionnelle :

- socle Vite + routing + layout + thèmes : **1 à 2 jours** ;
- migration des pages et composants principaux : **3 à 5 jours** ;
- auth/2FA, modales, formulaires et actions sensibles : **1 à 2 jours** ;
- PWA/service worker, Docker/OTA packaging et CI : **1 à 2 jours** ;
- régression desktop/mobile/PWA et corrections : **2 à 4 jours**.

**Total réaliste : environ 8 à 15 jours de développement/retest**, avec peu de nouvelles fonctions visibles pendant cette période.

Cette estimation est un ordre de grandeur basé sur la surface actuelle du dépôt, pas un engagement calendaire.

## Décision

**Ne pas migrer vers React/Vue/Vite pendant la série 1.7.2.**

Le bénéfice principal serait la vélocité/maintenabilité future, tandis que le coût immédiat est élevé et n’apporte pas de gain de sécurité backend.

### Action préférée à court terme

Avant un éventuel framework :

1. continuer à extraire les fonctions métier testables de `server.js` et `app.js` vers des modules ;
2. découper progressivement les fonctions UI les plus lourdes ;
3. renforcer les tests des flux sensibles ;
4. terminer et stabiliser la série 1.7.2 ;
5. réévaluer après stabilisation.

## Critères de réouverture

Réévaluer une migration si plusieurs de ces signaux apparaissent :

- `app.js` devient significativement plus difficile à maintenir malgré le découpage ;
- plusieurs contributeurs travaillent en parallèle sur le front ;
- les régressions liées au state/rendu deviennent fréquentes ;
- le besoin de composants réutilisables dépasse clairement le coût d’un build front ;
- une nouvelle version majeure permet d’assumer une migration sans perturber une série bêta active.

## Conclusion

Pour ProxPanel aujourd’hui, **le meilleur ratio risque/bénéfice est de conserver la stack front actuelle pour 1.7.2, tout en poursuivant sa modularisation**. La décision pourra être revue pour une future version majeure.
