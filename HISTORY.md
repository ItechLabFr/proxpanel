# Historique des versions ProxPanel

Cet historique couvre la branche **1.7.0-beta.x** à partir de **1.7.0-beta.1**.

> **Important :** les versions 1.7.0-beta.1 à 1.7.0-beta.13 sont documentées rétroactivement à partir du suivi du projet et des changelogs disponibles. Le dépôt GitHub n'existait pas encore comme historique source complet pour ces builds. Elles ne doivent donc pas être présentées comme des snapshots Git exacts tant que leurs archives d'origine n'ont pas été récupérées et vérifiées.

À partir de **1.7.0-beta.14**, GitHub devient la référence publique pour le code source, les tags, les Releases et les fichiers distribués.

| Version | Canal | Statut GitHub | Thème principal |
| --- | --- | --- | --- |
| [1.7.0-beta.1](docs/releases/1.7.0-beta.1.md) | Beta | Historique documenté | Début de la branche 1.7 |
| [1.7.0-beta.2](docs/releases/1.7.0-beta.2.md) | Beta | Historique documenté | Performance, cache et PWA |
| [1.7.0-beta.3](docs/releases/1.7.0-beta.3.md) | Beta | Historique documenté | Planification automatique des mises à jour OTA |
| [1.7.0-beta.4](docs/releases/1.7.0-beta.4.md) | Beta | Historique documenté | Températures et mode TV |
| [1.7.0-beta.5](docs/releases/1.7.0-beta.5.md) | Beta | Historique documenté | Vue TV graphique |
| [1.7.0-beta.6](docs/releases/1.7.0-beta.6.md) | Beta | Historique documenté | E-mails professionnels et laboratoire de notifications |
| [1.7.0-beta.7](docs/releases/1.7.0-beta.7.md) | Beta | Historique documenté | Canaux OTA Stable / Beta |
| [1.7.0-beta.8](docs/releases/1.7.0-beta.8.md) | Beta | Historique documenté | Dashboard Studio et TV Studio |
| [1.7.0-beta.9](docs/releases/1.7.0-beta.9.md) | Beta | Historique documenté | Graphiques et santé du cluster |
| [1.7.0-beta.10](docs/releases/1.7.0-beta.10.md) | Beta | Historique documenté | Correction des graphiques continus |
| [1.7.0-beta.11](docs/releases/1.7.0-beta.11.md) | Beta | Historique documenté | Diagnostic des températures |
| [1.7.0-beta.12](docs/releases/1.7.0-beta.12.md) | Beta | Historique documenté | Fondation Français / English |
| [1.7.0-beta.13](docs/releases/1.7.0-beta.13.md) | Beta | Historique documenté | Extension des traductions |
| [1.7.0-beta.14](docs/releases/1.7.0-beta.14.md) | Beta | [GitHub Release](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.0-beta.14) | Traduction FR/EN exhaustive |
| [1.7.0-beta.15](docs/releases/1.7.0-beta.15.md) | Beta | [GitHub Release](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.0-beta.15) | Authentication & Mobile UX |
| [1.7.0-beta.16](docs/releases/1.7.0-beta.16.md) | Beta | [GitHub Release](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.0-beta.16) | Correctif température vue individuelle |
| [1.7.1-beta.1](docs/releases/1.7.1-beta.1.md) | Beta | [GitHub Release](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.1-beta.1) | Console & démarrage PWA mobile |
| [1.7.1-beta.2](docs/releases/1.7.1-beta.2.md) | Beta | [GitHub Release](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.1-beta.2) | Stockage VM · Multi-nœuds · Responsive · Monitoring |
| [1.7.1-beta.3](docs/releases/1.7.1-beta.3.md) | Beta | Révoquée | Performance · Administration · Thèmes |
| [1.7.1-beta.4](docs/releases/1.7.1-beta.4.md) | Beta | Révoquée | Hotfix connexion Proxmox |
| [1.7.1-beta.5](docs/releases/1.7.1-beta.5.md) | Beta | Révoquée | Hotfix chargement dashboard |
| [1.7.1-beta.6](docs/releases/1.7.1-beta.6.md) | Beta | Révoquée | Light theme · Productivité · PWA |
| [1.7.1-beta.7](docs/releases/1.7.1-beta.7.md) | Beta | Révoquée | Light theme · Navigation Administration |
| [1.7.1-beta.8](docs/releases/1.7.1-beta.8.md) | Beta | Révoquée | Mode TV · Administration |
| [1.7.1-beta.9](docs/releases/1.7.1-beta.9.md) | Beta | Révoquée | UX mobile · Santé du cluster |
| [1.7.1-beta.10](docs/releases/1.7.1-beta.10.md) | Beta | Révoquée par 1.7.2-beta.1 | Fiabilité sauvegardes · Stabilisation |

| [1.7.2-beta.1](docs/releases/1.7.2-beta.1.md) | Beta | Révoquée | Portainer Core · Docker Standalone · Foundation |

## Politique d'archivage

Pour chaque nouvelle version, la GitHub Release doit contenir :

- le tag immuable `vX.Y.Z[-beta.N]` ;
- les notes de version ;
- `proxpanel-vX.Y.Z[-beta.N].zip` pour le package complet ;
- `proxpanel-update-vX.Y.Z[-beta.N].zip` pour le package OTA ;
- `release.json` ;
- `SHA256SUMS.txt`.

Les images Docker restent distribuées via Docker Hub. GitHub conserve les tags et l'historique des Releases. Lorsqu'une nouvelle version est publiée, les Releases plus anciennes sont marquées **REVOKED** et leurs assets téléchargeables sont supprimés. `updates.proxpanel.fr` reste responsable des canaux OTA, du rollout et des révocations OTA.


## Première release archivée sur GitHub

La version [v1.7.0-beta.14](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.0-beta.14) est la première release de la branche 1.7 archivée de façon reproductible sur GitHub avec :

- `proxpanel-v1.7.0-beta.14.zip`
- `proxpanel-update-v1.7.0-beta.14.zip`
- `release.json`
- `SHA256SUMS.txt`

Les versions suivantes utiliseront le même format.


## Série actuelle — 1.7.2

La série `1.7.1-beta.x` a atteint `beta.10`. Le cycle de développement actif est **`1.7.2-beta.x`**, avec Portainer/Docker comme première intégration officielle, PBS optionnel, Automations 2.0, RBAC/Audit 2.0 et Health Center 2.0. Voir [`ROADMAP.md`](ROADMAP.md).

| [1.7.2-beta.1.1](docs/releases/1.7.2-beta.1.1.md) | Hotfix Beta | Révoquée après beta.2 | Correctif packaging OTA / 502 |
| [1.7.2-beta.2](docs/releases/1.7.2-beta.2.md) | Beta | Révoquée par beta.3 | Docker Containers & Stacks |

| [1.7.2-beta.4.2](docs/releases/1.7.2-beta.4.2.md) | Beta patch | **Release active** | Mail Diagnostics & Logs |
| [1.7.2-beta.4.1](docs/releases/1.7.2-beta.4.1.md) | Beta | Superseded | Docker Metrics Dashboard |
| [1.7.2-beta.4](docs/releases/1.7.2-beta.4.md) | Beta | Superseded | Docker Dashboard & Proxmox Topology |
| [1.7.2-beta.3](docs/releases/1.7.2-beta.3.md) | Beta | Superseded | Docker Monitoring & Alerts |
