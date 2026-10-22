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
| / | chercher |
| P | reposter / retirer le repost (sur X) |
| D | discussion : réponses et citations |
| T | traduire le texte (traduction de X) |
| H | masquer le compte |
| C | angle suivant (dans une chaîne) |
| F, double-clic | plein écran |
| Échap | fermer |

## Fonctions

- **Lecture** : Nocturne lit les vidéos de la page de X et fait défiler la page pour en trouver d'autres. Il ne télécharge
  rien lui-même et ne modifie pas X. La vidéo affichée est celle de X, empruntée le temps de la lecture puis remise à sa
  place : aucune image n'est recopiée, Firefox l'affiche comme n'importe quelle vidéo.
- **Chaînes** : Jeux vidéo, Films & séries, Musique, DevOps & tech, Documentaires, Science, Sport, Humour, Cuisine,
  Nature, Art, et tes chaînes perso (bouton **+ Créer** : mots, hashtags, comptes). Elles utilisent la recherche de X.
  Chaque angle d'une chaîne reçoit une note automatique (part des vidéos qui ont marché).
- **Chiffres sous la vidéo** : vues, j'aime, reposts, réponses tels que X les affiche, et un verdict automatique
  (Discret, Moyen, Marche bien, Carton) calculé à partir des vues, de l'engagement et de la vitesse depuis la publication.
- **Tableau de bord de l'algo** : dans « Pour vous », les thèmes que tu montes sont vraiment respectés. Quand l'un d'eux
  manque, Nocturne prend une vidéo de ce thème dans le fil de X, ou fait un petit détour (3 à 6 vidéos d'une recherche
  X sur ce thème) avant de revenir à Pour vous. Les parts sont ramenées à 80 % au plus : il reste toujours du vrai Pour vous.
- **Sans violence** : écarte les vidéos que X marque comme sensibles et celles qui parlent de bagarres, agressions,
  armes, guerre ou accidents graves (sans écarter un « boss fight » de jeu vidéo).
- **Filtres** : vidéos IA, violence, langues, zone (une liste), mots bloqués, comptes masqués (listes repliées derrière un
  œil), durée. « Ce que tu vois » : Mes goûts, Équilibré ou Découverte.
- **Discussion** : sur demande, Nocturne ouvre quelques secondes la page du tweet dans une petite fenêtre, lit les réponses
  affichées et te les montre. Rien n'est enregistré.
- **Diagnostic** : vérifie que Nocturne retrouve tout dans la page de X (utile quand X change son site).
- **Sobriété** : rendu au rythme des images de la vidéo, rien ne tourne en pause, et la page de X est rechargée proprement
  après une longue session pour ne pas saturer la mémoire.
- **Démarrage rapide** : une vidéo qui ne démarre pas en 8 s est passée. Si trois de suite ne démarrent pas, Nocturne
  s'arrête et l'explique (c'est alors le lecteur vidéo de Firefox qui est bloqué : il faut redémarrer Firefox).
- **Écrans étroits** : la barre du haut et les colonnes se replient ; en plein écran, une barre « Quitter le plein écran »
  apparaît au passage de la souris.
- Carte **Analyse de ce fil** : visible seulement si un module complémentaire privé, installé à part, est présent.

## Publier une nouvelle version

1. Monter la version dans `manifest.json` et `package.json`.
2. `git tag v0.7.2 && git push --tags`.
3. L'Action *release* teste, fait signer par Mozilla (secrets du dépôt `AMO_JWT_ISSUER` et `AMO_JWT_SECRET`), publie le
   `.xpi` et met à jour `updates.json`.

## Son

Firefox coupe le son des vidéos lancées automatiquement tant que tu n'as pas cliqué dans la page. Pour ne jamais avoir à
cliquer : sur x.com, icône à gauche de l'adresse > *Lecture automatique* > *Autoriser l'audio et la vidéo*.

## Développement

`node --test tests/core.test.js`. Aucune dépendance à installer pour les tests.

## Licence

Tous droits réservés (voir `LICENCE`).
