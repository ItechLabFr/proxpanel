# ProxPanel Demo

La démo utilise volontairement le mécanisme le plus simple possible : le serveur récupère le dépôt GitHub public et construit l'image Docker localement.

Il n'y a aucun GitHub Actions dédié à la démo, aucun accès Docker Hub requis, aucun secret Docker Hub, aucun runner GitHub et aucun SSH public nécessaire.

## Image locale

La démo utilise :

```text
proxpanel-demo:local
```

Cette image existe uniquement sur le serveur de démo.

## Première installation

Sur le serveur Docker :

```bash
cd /opt
git clone https://github.com/ItechLabFr/proxpanel.git proxpanel-demo
cd /opt/proxpanel-demo
docker compose -f docker-compose.demo.yml up -d --build
```

Par défaut, la démo écoute sur le port `8082`.

Accès local :

```text
http://IP_DU_SERVEUR:8082
```

Pour utiliser exceptionnellement un autre port, crée `/opt/proxpanel-demo/.env` :

```text
PROXPANEL_DEMO_PORT=8083
```

## Mettre la démo à jour

Uniquement lorsque tu le souhaites :

```bash
cd /opt/proxpanel-demo
bash update-demo.sh
```

Le script :

1. récupère le dernier `main` depuis GitHub ;
2. construit `proxpanel-demo:local` directement sur le serveur ;
3. recrée uniquement le conteneur `proxpanel-demo` ;
4. conserve les volumes de données ;
5. contrôle le healthcheck ;
6. affiche le commit réellement déployé.

Aucun build n'est déclenché tant que la commande n'est pas exécutée.

## Vérification

```bash
docker compose -f /opt/proxpanel-demo/docker-compose.demo.yml ps
docker images proxpanel-demo:local
docker logs --tail 100 proxpanel-demo
```

## Retour à un commit précis

Le dépôt étant local, il est également possible de tester temporairement un commit précis :

```bash
cd /opt/proxpanel-demo
git fetch origin
git checkout <commit>
PROXPANEL_DEMO_VERSION="demo-$(git rev-parse --short=12 HEAD)" docker compose -f docker-compose.demo.yml up -d --build --force-recreate
```

Pour revenir ensuite au dernier développement :

```bash
git checkout main
bash update-demo.sh
```

## Sécurité

La démo publique ne doit pas être reliée à un environnement Proxmox de production avec des droits privilégiés. Utilise un environnement de test et un compte Proxmox dédié avec les permissions minimales nécessaires.
