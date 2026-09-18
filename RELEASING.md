# Publication et révocation des versions ProxPanel

Ce document décrit le cycle officiel d'une version ProxPanel sur GitHub, Docker Hub et le serveur OTA.

## Publication normale

Chaque version publiée doit avoir :

- un tag Git immuable `vX.Y.Z[-beta.N]` ;
- une GitHub Release ;
- `proxpanel-vX.Y.Z[-beta.N].zip` ;
- `proxpanel-update-vX.Y.Z[-beta.N].zip` ;
- `release.json` ;
- `SHA256SUMS.txt` ;
- des notes de version en **français et en anglais**.

Docker Hub reste le canal de distribution des images conteneur. `updates.proxpanel.fr` reste la source de vérité pour les canaux OTA, le rollout et la révocation OTA.

## Notes de version bilingues

À partir des prochaines versions, les notes GitHub doivent toujours contenir deux sections :

```text
🇫🇷 Français
- Résumé
- Nouveautés / améliorations
- Correctifs
- Notes

🇬🇧 English
- Summary
- Improvements / new features
- Fixes
- Notes
```

Quand `release.json` contient des champs anglais, utiliser :

- `title_en`
- `summary_en`
- `improvements_en`
- `fixes_en`
- `notes_en`
- `breaking_changes_en`

Les champs français historiques restent inchangés pour conserver la compatibilité OTA.

## Politique de numérotation Beta

La série historique `1.7.0-beta.x` se termine exceptionnellement à `1.7.0-beta.16`.

À partir de la prochaine série :

- après `1.7.1-beta.10`, la prochaine version de développement est `1.7.2-beta.1` ;
- une même version `X.Y.Z` peut contenir au maximum **10 betas** ;
- les suffixes autorisés sont donc `beta.1` à `beta.10` ;
- si des modifications supplémentaires sont nécessaires après `beta.10`, incrémenter le numéro de version avant de repartir à `beta.1`.

Exemple :

```text
1.7.1-beta.1
...
1.7.1-beta.10
1.7.2-beta.1
```

Le workflow de publication applique automatiquement cette limite. `1.7.0-beta.16` est conservée comme exception historique.

## Révocation automatique des anciennes versions

GitHub ne possède pas de statut natif « revoked ». ProxPanel applique donc automatiquement cette politique à chaque nouvelle publication :

1. **Le tag Git historique est conservé.**
2. La Release plus ancienne est renommée `<version> — REVOKED`.
3. L'avertissement suivant est ajouté en tête de la description :
   `⚠️ Cette version a été révoquée. Ne pas installer. Utilisez la version suivante.`
4. **Tous les assets téléchargeables de l'ancienne Release sont supprimés**, y compris les ZIP, `release.json` et `SHA256SUMS.txt`.
5. La Release et le tag restent visibles pour conserver l'historique.
6. La nouvelle Release reste la seule Release active avec ses assets.
7. La révocation OTA doit également être appliquée côté `updates.proxpanel.fr`.
8. Si une image Docker a été publiée, les tags de canal `:beta` / `:latest` doivent pointer vers la version active appropriée.

Le workflow de publication vérifie et applique cette politique. Le workflow **Revoke old ProxPanel releases** reste un filet de sécurité pour remettre les anciennes Releases en conformité.

Le workflow manuel **Revoke ProxPanel Release** peut toujours être utilisé pour révoquer explicitement une version en dehors d'une nouvelle publication.
