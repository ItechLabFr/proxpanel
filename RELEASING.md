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

- la prochaine version de développement est `1.7.1-beta.1` ;
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

## Révoquer une version

GitHub ne possède pas de statut natif « revoked ». Une version ProxPanel révoquée suit donc cette convention :

1. **Ne pas supprimer le tag Git.** Il représente l'état historique exact du code.
2. Renommer la GitHub Release en `⚠️ REVOKED — ProxPanel <version>`.
3. Ajouter en tête des notes un avertissement en français et en anglais avec la raison et, si disponible, la version de remplacement.
4. Supprimer les deux ZIP installables de la Release :
   - `proxpanel-v<version>.zip`
   - `proxpanel-update-v<version>.zip`
5. Conserver `release.json` et `SHA256SUMS.txt` pour la traçabilité historique.
6. Révoquer aussi la version dans `updates.proxpanel.fr`.
7. Si l'image Docker a été publiée, ne plus faire pointer `:beta` ou `:latest` vers cette version. Selon la gravité, le tag Docker versionné peut également être retiré.

Le workflow **Revoke ProxPanel Release** automatise les étapes GitHub. Il demande une confirmation explicite `REVOKE`, les raisons FR/EN et une éventuelle version de remplacement.

> Si les Immutable Releases sont activées dans GitHub, le titre et les notes restent modifiables mais GitHub bloque l'ajout, le remplacement ou la suppression des assets. Dans ce cas, la Release doit être marquée révoquée visuellement et la distribution doit être bloquée côté OTA/Docker.
