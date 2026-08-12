# DuoPilot V2.0 — PWA inspirée d’Outlook

Cette version repart de la V1.12 et conserve les fonctions existantes tout en
modernisant fortement l’interface desktop, tablette et smartphone.

## Interface
- shell sombre type application/PWA ;
- barre supérieure avec recherche, notifications, aide et profil actif ;
- SONKI / SONKA mis en avant dans la navigation ;
- cockpit 4 cartes ;
- panneau analytique par univers ;
- navigation mobile fixe + bouton d’ajout flottant ;
- interface responsive PC / tablette / smartphone ;
- cache PWA passé en V2.0.0.

## Notifications
- centre de notifications conservé ;
- activation des notifications navigateur/PWA ;
- synchronisation Web Push vers Railway ;
- bouton de test ;
- Service Worker capable de recevoir les Push ;
- backend `/health` pour vérifier Railway.

## Correctif Railway
Le backend crée désormais automatiquement le dossier SQLite. Si `/data`
n’est pas disponible, il bascule sur `./data/duopilot.sqlite` au lieu de planter.
Pour une vraie persistance après redéploiement, un volume Railway reste recommandé.

## Summary GitHub Desktop
DuoPilot V2.0 - Nouvelle interface PWA + notifications

## Site
https://yarmkof.github.io/DuoPilot/
