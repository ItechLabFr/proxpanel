<p align="center">
  <img src="docs/assets/proxpanel-logo.png" width="150" alt="Logo ProxPanel">
</p>

<h1 align="center">ProxPanel</h1>

<p align="center">
  Panel moderne auto-hébergé de gestion et de supervision pour Proxmox VE.
</p>

<p align="center">
  <a href="https://proxpanel.fr">Site officiel</a> ·
  <a href="README.md">English</a> ·
  <a href="https://hub.docker.com/r/itechlab/proxpanel">Docker Hub</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="HISTORY.md">Historique des versions</a>
</p>

> **Logiciel en bêta.** ProxPanel est encore en développement actif. Sauvegarde ta configuration avant de tester une nouvelle version.

## À propos

ProxPanel est un **projet personnel et indépendant** qui vise à centraliser la supervision et l'administration d'environnements Proxmox VE dans une interface web moderne, responsive et plus agréable à utiliser.

Le projet **n'est ni affilié, ni approuvé, ni sponsorisé par Proxmox**.

Le développement est **assisté par IA** pour certaines tâches de design, génération de code, refactorisation, documentation et tests. La direction du projet, les validations et les décisions de publication restent sous le contrôle du mainteneur.

## Fonctions principales

- Dashboard responsive pour nœuds, VM et LXC
- Dashboard Studio personnalisable
- Mode TV Classique, Graphiques et Personnalisé
- CPU, RAM, stockage, réseau et métriques historiques
- Températures CPU des nœuds via `lm-sensors`
- Gestion et actions VM/LXC
- Suivi des sauvegardes et tâches
- Canaux OTA Stable / Beta
- Mises à jour ProxPanel automatiques planifiables
- Vérification des mises à jour Proxmox
- Notifications Panel, Discord et e-mail
- Microsoft 365 Graph / SMTP
- 2FA TOTP, codes de récupération et secours e-mail
- Heartbeat OTA minimal respectueux des données d'infrastructure
- PWA
- Interface Français / English
- Déploiement Docker

## Installation rapide avec Docker

```bash
docker volume create proxpanel_data
docker volume create proxpanel_runtime

docker run -d \
  --name proxpanel \
  --restart unless-stopped \
  -p 8080:8080 \
  -v proxpanel_data:/app/data \
  -v proxpanel_runtime:/opt/proxpanel-runtime \
  itechlab/proxpanel:1.7.0-beta.14
```

Puis ouvre :

```text
http://IP-DU-SERVEUR:8080
```

Au premier démarrage, ProxPanel demande de créer le premier compte administrateur puis d'ajouter le serveur ou cluster Proxmox VE.

## Docker Compose

Depuis le dépôt :

```bash
docker compose up -d
```

Les données persistantes restent dans les volumes Docker après recréation du conteneur.

## Températures

Pour utiliser la supervision des températures :

- `lm-sensors` doit être installé sur le nœud Proxmox ;
- un compte Proxmox `@pam` avec mot de passe enregistré doit être disponible ;
- le conteneur ProxPanel doit pouvoir joindre le nœud en SSH.

L'image Docker officielle contient `openssh-client` et `sshpass`.

## Mises à jour OTA

Deux canaux sont disponibles :

- **Stable** — versions recommandées pour une utilisation normale ;
- **Beta** — accès anticipé aux nouvelles fonctions et passage possible vers une future Stable plus récente.

Le canal sélectionné est persistant et n'est pas déduit de la version installée. ProxPanel bloque également les downgrades automatiques.

Serveur OTA officiel : `https://updates.proxpanel.fr`

## Confidentialité du heartbeat OTA

Seules ces informations sont envoyées :

```json
{
  "installation_id": "uuid-local-persistant",
  "version": "1.7.0-beta.15",
  "update_channel": "beta"
}
```

Aucune IP Proxmox, hostname, liste VM/LXC, token, compte ou donnée d'infrastructure n'est transmise au serveur OTA.

## Sécurité

Consulte [`SECURITY.md`](SECURITY.md) et [`SECURITY-IMAGE.md`](SECURITY-IMAGE.md).

Ne publie jamais de mots de passe, tokens Proxmox, secrets Microsoft 365, webhooks Discord ou informations d'infrastructure privées dans une issue GitHub.

## Contribuer

Les rapports de bugs, demandes de fonctions ciblées et pull requests revues sont les bienvenus. Voir [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Historique des versions et Releases

L'historique public de la branche 1.7 est disponible dans [`HISTORY.md`](HISTORY.md).

Les notes historiques sont disponibles depuis **1.7.0-beta.1**. **v1.7.0-beta.14** est la première GitHub Release reproductible. La dernière prerelease publiée est **v1.7.0-beta.16**, avec ZIP complet, ZIP OTA, `release.json` et sommes SHA-256.

Les images restent distribuées via [Docker Hub](https://hub.docker.com/r/itechlab/proxpanel), tandis que `updates.proxpanel.fr` reste responsable des canaux OTA, du rollout et des révocations.

## Statut

Version de développement actuelle : **1.7.1-beta.1**

Dernière GitHub Release publiée : **1.7.1-beta.1**

Série de développement actuelle : **1.7.1-beta.x** — 10 betas maximum par version.

Docker Hub reste pour l’instant sur l’image publiée précédente tant que l’image beta.15 n’a pas été poussée.

ProxPanel est actuellement un projet personnel en bêta.

## Licence

ProxPanel est publié sous **licence MIT**. La licence autorise notamment l'utilisation, la copie, la modification, la redistribution, la sous-licence et la vente de copies du logiciel, sous réserve de respecter les conditions de la licence MIT.

Voir [`LICENSE`](LICENSE).
