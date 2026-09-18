# Sécurité de l’image Docker

Depuis la v1.7.0-beta.2, le paquet Info-ZIP `unzip` est retiré du runtime. L’extraction OTA utilise l’applet `unzip` de BusyBox déjà présente dans Alpine, tandis que ProxPanel inspecte lui-même le répertoire central ZIP avant extraction.

Depuis la v1.7.0-beta.4, l’image complète embarque `openssh-client` et `sshpass` pour la collecte distante des températures `lm-sensors`. La beta.11 n’ajoute aucun nouveau paquet système ; elle améliore uniquement le diagnostic de collecte. Les gestionnaires de paquets Node restent retirés du runtime.

Objectif Docker Scout : 0 Critical / 0 High lorsque l’image de base Alpine ne contient pas d’autre vulnérabilité connue.

Après publication :

```bash
docker scout cves registry://itechlab/proxpanel:1.7.0-beta.16 --only-severity critical,high
docker scout cves registry://itechlab/proxpanel:1.7.0-beta.16 --only-fixed
docker scout cves registry://itechlab/proxpanel:1.7.0-beta.16 --only-cisa-kev
```
