# ProxPanel Demo

La démo utilise volontairement le mécanisme le plus simple possible : le serveur récupère le dépôt GitHub public et construit l'image Docker localement.

Il n'y a aucun GitHub Actions dédié à la démo, aucun accès Docker Hub requis, aucun secret Docker Hub, aucun runner GitHub et aucun SSH public nécessaire.

## Image locale

La démo utilise :

```text
proxpanel-demo:local
```

Cette image existe uniquement sur le serveur de démo.

## Compte et données de démonstration

Le fichier `docker-compose.demo.yml` active automatiquement le mode démo public.

```text
Utilisateur : demo
Mot de passe : ProxPanelDemo2026!
```

Les identifiants sont préremplis sur la page de connexion.

Le mode démo initialise automatiquement une infrastructure fictive complète : cluster Proxmox, VM/LXC, stockages, sauvegardes, tâches, métriques, températures et historique. Il inclut également un Portainer CE fictif avec plusieurs environnements Docker, conteneurs, stacks, ports, réseaux, états de santé, métriques et logs simulés. Aucune connexion à un vrai serveur Proxmox ou Portainer n'est nécessaire.

Le mode est en lecture seule : les visiteurs peuvent parcourir l'interface, mais les modifications et actions d'administration sont bloquées.


## Règle obligatoire : parité fonctionnelle de la démo

Toute nouvelle fonctionnalité visible ajoutée à ProxPanel doit être représentée dans le mode démo **avant que la version soit considérée comme terminée**.

Cela concerne notamment :

- une nouvelle page ou carte du dashboard ;
- une nouvelle intégration ;
- une nouvelle ressource Proxmox, PBS, Docker ou Portainer ;
- une nouvelle métrique, alerte, notification ou état ;
- une nouvelle vue de monitoring ;
- un nouvel écran de détails ;
- une nouvelle fonction de sauvegarde, stockage, tâche ou mise à jour.

Pour chaque nouveauté, le mode démo doit fournir des données fictives cohérentes permettant de parcourir réellement l'interface sans dépendre d'un service externe.

Les données doivent couvrir lorsque c'est pertinent plusieurs états : normal, arrêté/inactif, warning, erreur ou unhealthy. Les actions modifiant l'infrastructure restent bloquées en mode démo lecture seule.

Une nouveauté UI qui apparaît vide, demande une vraie connexion externe ou affiche « non configuré » alors qu'elle fait partie de la démonstration est considérée comme **incomplète côté démo**.

Le contrôle à effectuer pour chaque nouvelle fonctionnalité est donc :

```text
Fonction réelle ajoutée
→ données fictives ajoutées
→ navigation et détails testés en DEMO_MODE
→ aucune dépendance externe requise
→ actions sensibles toujours bloquées
→ seulement ensuite : version prête
```

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
4. recrée les données fictives de démonstration ;
5. contrôle le healthcheck et vérifie que `demoMode=true` et `setupDone=true` ;
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
