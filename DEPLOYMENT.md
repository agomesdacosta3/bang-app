
---

## Configurer son propre backend

### 1. Créer le projet Supabase

Rends-toi sur [database.new](https://database.new), crée un compte si besoin, puis un nouveau projet : donne-lui un nom, choisis une région proche de toi, définis un mot de passe de base de données (garde-le de côté). La provision prend 1 à 2 minutes.

### 2. Appliquer le schéma complet

Concatène tous les fichiers SQL du projet dans l'ordre :
```powershell
cd bang-app/supabase/sql
Get-ChildItem -Filter *.sql | Sort-Object Name | Get-Content | Set-Content ../../combined_migration.sql
```
Ouvre `bang-app/combined_migration.sql`, copie tout son contenu, colle-le dans le **SQL Editor** du dashboard Supabase de ton projet, puis "Run".

**Si une erreur mentionne "unsafe use of new value of enum type"** : exécute d'abord, seule :
```sql
alter type game_status add value 'preparing' after 'lobby';
```
puis relance le script complet une seconde fois.

### 3. Activer les connexions anonymes

Dashboard → **Authentication → Sign In / Providers** → active **"Allow anonymous sign-ins"**. Le jeu n'utilise aucun compte nominatif, uniquement des sessions anonymes par appareil.

### 4. Déployer les Edge Functions

```powershell
npx supabase login
cd bang-app
npx supabase link --project-ref TON_PROJECT_REF
npx supabase functions deploy
```
La référence du projet se trouve dans l'URL du dashboard (juste après `/project/`) ou dans **Project Settings → General**.

Si le déploiement échoue avec une erreur générique de bundling (bug connu sur certaines versions de la CLI, notamment Windows) :
```powershell
npx supabase functions deploy --use-api
```

### 5. Récupérer les identifiants et configurer l'app

Dashboard → **Project Settings → API Keys** → onglet **"Publishable and secret API keys"** → copie l'**URL du projet** et la **clé publiable** (`sb_publishable_...`).

Crée le fichier `bang-app/.env` (voir format plus haut) avec ces deux valeurs.

---

## Lancer l'app

```powershell
cd bang-app
npm install
npx expo start
```
Scanne le QR code avec Expo Go **sur le même Wi-Fi que l'ordinateur**.

### Jouer depuis un autre réseau (4G/5G, autre Wi-Fi)

```powershell
npx expo start --tunnel
```
Si c'est la première utilisation, installe le paquet nécessaire en local plutôt que globalement (plus fiable, bug connu sinon) :
```powershell
npm install @expo/ngrok@4.1.0 --save-dev
```
puis relance `npx expo start --tunnel`.

### Mode hors ligne

Aucune configuration nécessaire — depuis l'écran d'accueil, "Jouer hors ligne" lance une partie contre des IA entièrement en local, sans réseau ni backend.

---

## Limite connue de ce mode de déploiement

Ce projet est actuellement déployé en **Niveau 1** : l'app se lance via Expo Go, ce qui veut dire que **l'ordinateur qui exécute `npx expo start` doit rester allumé pendant toute la session de jeu** — que ce soit en Wi-Fi partagé ou en tunnel. Il ne s'agit pas d'une app installée de façon autonome sur le téléphone.

---

## Développement local (backend séparé du backend hébergé)

Pour contribuer au code sans toucher au backend de production :

```powershell
docker --version   # vérifier que Docker Desktop tourne
cd bang-app
npx supabase start
npx supabase functions serve
```
Le fichier `bang-app/.env` local (utilisé pendant le développement) doit alors pointer vers `http://127.0.0.1:54321` avec la clé publiable locale (`npx supabase status -o env` pour la récupérer).

### Scripts de test avec bots

Dans `bang-app/scripts/` :
- `rig-game.js CODE` — crée une partie de test complète, personnages/rôles/mains truqués selon la constante `RIG`, joueurs bots inclus
- `fill-and-play.js CODE` — complète une partie existante avec des bots et la fait tourner jusqu'au bout
- `resume-play.js GAME_ID` — reprend une partie interrompue

Ces scripts pointent toujours vers l'instance Docker locale, jamais vers le backend hébergé — les deux environnements restent totalement séparés.

### Redéployer une modification en production

Toute modification d'une Edge Function testée en local doit être explicitement republiée pour affecter l'app réelle :
```powershell
cd bang-app
npx supabase functions deploy
```
Les changements côté app (écrans, styles) n'ont besoin d'aucune action particulière : ils sont pris en compte au prochain lancement de `npx expo start`.