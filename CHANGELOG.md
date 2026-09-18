# ProxPanel 1.7.1-beta.1

## Français
- Diagnostic console par étapes et reconnexion automatique noVNC.
- Sessions console temporaires portées à 5 minutes.
- Console mobile/tablette plus lisible et plus facile à utiliser.
- Premier affichage PWA accéléré sur iPhone grâce au chargement progressif.
- Données secondaires déplacées en arrière-plan.
- Dashboard initial chargé sans historique, puis graphiques complétés après affichage.
- Service Worker et cache HTTP optimisés pour les fichiers versionnés.

## English
- Adds step-by-step console diagnostics and automatic noVNC reconnect.
- Extends temporary console sessions to 5 minutes.
- Improves phone/tablet console usability.
- Speeds up the first PWA render on iPhone with progressive loading.
- Moves secondary startup data to background loading.
- Loads the initial dashboard without history, then fetches historical charts after the first render.
- Optimizes Service Worker and HTTP caching for versioned assets.

# ProxPanel 1.7.0-beta.16

## Français
- Corrige la température CPU absente dans les vues individuelles des nœuds.
- Aligne les routes dashboard et live individuelles sur la collecte lm-sensors des vues regroupées.
- Corrige la disparition de la température pendant le rafraîchissement live.
- Ajoute la règle de versioning : prochaine série en 1.7.1-beta.1, 10 betas maximum par version.

## English
- Fixes missing CPU temperature values in individual node views.
- Aligns individual dashboard and live routes with the lm-sensors collection used by grouped views.
- Fixes temperatures disappearing during live refresh.
- Adds the versioning rule: next series starts at 1.7.1-beta.1, with a maximum of 10 beta releases per version.

# ProxPanel 1.7.0-beta.15

## Authentication & Mobile UX
- Refonte complète de l’écran de connexion sur desktop, tablette et téléphone.
- Nouveau parcours en deux étapes visuelles : identifiants puis MFA.
- Champ Authenticator à 6 chiffres optimisé pour le clavier numérique mobile et l’autocomplétion OTP.
- Validation automatique lorsque les 6 chiffres sont saisis.
- Nouveaux écrans dédiés pour les codes de récupération et le secours par e-mail.
- Secours e-mail avec expiration visible et délai avant renvoi.
- Ajout de l’affichage/masquage du mot de passe et de la détection Verr. Maj.
- Première installation avec confirmation du mot de passe et indicateur de robustesse.
- Erreurs d’authentification affichées directement dans la carte.
- Support 100dvh, safe-area iOS, clavier virtuel, petits écrans et prefers-reduced-motion.

## Correctifs
- Corrige le login et le MFA trop compacts sur téléphone et tablette.
- Corrige les petites zones tactiles des méthodes de récupération.
- Corrige plusieurs risques de débordement avec le clavier mobile.
- Améliore la continuité visuelle après une erreur MFA.

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
