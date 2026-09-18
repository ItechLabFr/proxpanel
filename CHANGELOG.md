# ProxPanel 1.7.0-beta.14

## Traduction FR / EN exhaustive
- Passe complète sur les textes UI encore codés en français.
- Traduction des boutons, champs, options, confirmations, prompts, toasts et notifications navigateur.
- Couverture renforcée du Dashboard, TV, Machines, Nœuds, Monitoring, Stockage, Backups, OTA, Notifications, Utilisateurs et Administration.
- Ajout de règles pour les textes dynamiques (compteurs, actions, migrations, backups, OTA, 2FA).
- Le changement FR / EN reste instantané et sans redémarrage.

# ProxPanel 1.7.0-beta.13

- Traduction FR/EN étendue à toute l’interface et aux messages dynamiques.
- Diagnostics température, OTA, utilisateurs, machines, sauvegardes et actions désormais traduits en English.
- Changement de langue toujours instantané, sans rebuild ni redémarrage.

# ProxPanel 1.7.0-beta.14

## Français / English
- Ajout d’un sélecteur FR / EN instantané côté frontend.
- Ajout d’une langue par défaut persistante dans les paramètres.
- Le choix rapide est local au navigateur et ne nécessite ni rebuild ni redémarrage.
- La page de connexion, le dashboard, le mode TV, l’administration et les principaux flux UI suivent la langue active.
- Formats régionaux FR/EN pour dates, nombres et tailles.
- Cache PWA incrémenté afin de déployer immédiatement les ressources de traduction.

# ProxPanel 1.7.0-beta.11

## Diagnostic température
- Affichage de la cause exacte lorsqu’une température est indisponible, directement par nœud.
- Causes distinguées : client SSH absent, `sshpass` absent, compte PAM requis, mot de passe absent/illisible, adresse de nœud introuvable, authentification refusée, nœud injoignable, `lm-sensors` absent et aucune sonde CPU exploitable.
- Une action recommandée accompagne chaque diagnostic dans le détail du nœud.
- Le Dashboard et les modes TV n’affichent plus un simple `—` sans explication.
- Les erreurs de collecte restent non bloquantes pour le Dashboard.

# ProxPanel 1.7.0-beta.10

## Correctif des graphiques
- Suppression réelle de `stroke-dasharray` et `stroke-dashoffset` sur les courbes CPU, RAM, stockage, réseau et TV.
- L’animation de dessin est remplacée par un fondu léger qui ne peut pas couper la ligne.
- Les points utilisent leurs timestamps réels pour l’axe horizontal quand ils sont disponibles.
- Les aires sous les courbes sont reconstruites avec le même chemin continu.

## Cache PWA
- `styles.css` et `app.js` utilisent désormais une URL versionnée par release.
- Le Service Worker charge CSS/JS en network-first afin qu’une OTA n’affiche plus un ancien rendu depuis le cache.

## Santé du cluster
- Conservation de la nouvelle carte Santé introduite en beta.9.
- La correction de cache garantit que son nouveau style est également chargé après OTA.

# ProxPanel 1.7.0-beta.8

## Dashboard Studio
- Widgets affichables/masquables avec tailles S/M/L/XL.
- Densité Compacte, Confortable ou Aérée.
- Animations douces optionnelles avec respect de `prefers-reduced-motion`.
- Présentation des machines au choix : Cartes, Compact ou Tableau.
