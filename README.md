# Nocturne

Extension Firefox : les vidéos de X en plein écran, l'une après l'autre. Enchaînement automatique, recherche par sujet,
chaînes thématiques, filtres (IA, langues, zones, mots, comptes), barre de progression, volume et plein écran.

**Nocturne ne collecte, n'enregistre ni n'envoie aucune donnée.** Il affiche autrement ce que la page de X te montre déjà,
dans ton navigateur. Tes réglages restent dans le stockage local de Firefox.

Nocturne n'est ni affilié à X Corp., ni approuvé par X Corp.

## Installer

Avec le `.xpi` signé par Mozilla (voir les [releases](https://github.com/SyphaxHdr/nocturne/releases)), glissé dans Firefox.
Ensuite **Firefox installe les nouvelles versions tout seul** (`update_url` → `updates.json`, environ une fois par jour, ou
*about:addons → roue → Rechercher des mises à jour*).

Une nouvelle version ne s'installe que lorsqu'aucun onglet X n'est ouvert (ou au redémarrage de Firefox), jamais en plein
visionnage.

Ne charge pas aussi le dossier par `about:debugging` : la copie temporaire porte le même identifiant et cache la version
installée.

## Utiliser

Sur x.com : bouton **Nocturne** en bas de page, icône de la barre d'outils, ou `Alt+Maj+N`.

| Touche | Action |
|---|---|
| J / ↓ , K / ↑ | suivante, précédente |
| ← → (Maj = 10 s) | reculer, avancer |
| 0–9 | aller à 0–90 % |
| Espace, M, + / − | pause, son, volume |
| < > | vitesse |
| L, O, R | aimer sur X, ouvrir le post, actualiser |
| P | reposter / retirer le repost (sur X) |
| D | discussion : réponses et citations |
| T | traduire le texte (traduction de X) |
| H | masquer le compte |
| C | angle suivant (dans une chaîne) |
| F, double-clic | plein écran |
| Échap | fermer |

## Fonctions

- **Lecture** : Nocturne lit les vidéos de la page de X et fait défiler la page pour en trouver d'autres. Il ne télécharge
  rien lui-même et ne modifie pas X.
- **Chaînes** : Jeux vidéo, Films & séries, Musique, DevOps & tech, Documentaires, et tes chaînes perso (mots, hashtags,
  comptes). Elles utilisent la recherche de X.
- **Filtres** : vidéos IA, langues, zones, mots bloqués, comptes masqués (listes repliées derrière un œil), durée.
- **Discussion** : sur demande, Nocturne ouvre quelques secondes la page du tweet dans une petite fenêtre, lit les réponses
  affichées et te les montre. Rien n'est enregistré.
- **Diagnostic** : vérifie que Nocturne retrouve tout dans la page de X (utile quand X change son site).
- **Sobriété** : rendu au rythme des images de la vidéo, rien ne tourne en pause, et la page de X est rechargée proprement
  après une longue session pour ne pas saturer la mémoire.
- Boutons **Marquer** et **Analyse** : visibles seulement si un module complémentaire privé, installé à part, est présent.

## Publier une nouvelle version

1. Monter la version dans `manifest.json` et `package.json`.
2. `git tag v0.6.1 && git push --tags`.
3. L'Action *release* teste, fait signer par Mozilla (secrets du dépôt `AMO_JWT_ISSUER` et `AMO_JWT_SECRET`), publie le
   `.xpi` et met à jour `updates.json`.

## Développement

`node --test tests/core.test.js`. Aucune dépendance à installer pour les tests.

## Licence

Tous droits réservés (voir `LICENCE`).
