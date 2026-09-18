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
| [1.7.0-beta.15](docs/releases/1.7.0-beta.15.md) | Beta | Préparée pour Release | Authentication & Mobile UX |

## Politique d'archivage

Pour chaque nouvelle version, la GitHub Release doit contenir :

- le tag immuable `vX.Y.Z[-beta.N]` ;
- les notes de version ;
- `proxpanel-vX.Y.Z[-beta.N].zip` pour le package complet ;
- `proxpanel-update-vX.Y.Z[-beta.N].zip` pour le package OTA ;
- `release.json` ;
- `SHA256SUMS.txt`.

Les images Docker restent distribuées via Docker Hub. GitHub conserve l'historique public et les artefacts de release, tandis que `updates.proxpanel.fr` reste responsable des canaux OTA, du rollout et des révocations.


## Première release archivée sur GitHub

La version [v1.7.0-beta.14](https://github.com/ItechLabFr/proxpanel/releases/tag/v1.7.0-beta.14) est la première release de la branche 1.7 archivée de façon reproductible sur GitHub avec :

- `proxpanel-v1.7.0-beta.14.zip`
- `proxpanel-update-v1.7.0-beta.14.zip`
- `release.json`
- `SHA256SUMS.txt`

Les versions suivantes utiliseront le même format.
