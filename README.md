# DuoPilot V1.12 — Notifications + Railway

Cette version repart de la V1.10 stable et ajoute les notifications Web Push.

## Frontend
- cloche de notifications ;
- centre des rappels ;
- activation et test des notifications ;
- synchronisation automatique des échéances ;
- Service Worker Push ;
- serveur configuré : `https://duopilot-production-d0e9.up.railway.app`.

## Backend Railway
- Express + Web Push ;
- VAPID ;
- stockage SQLite ;
- planification des rappels ;
- envoi à partir de 09:00 le jour prévu.

## Variables Railway obligatoires
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `ALLOWED_ORIGIN=https://yarmkof.github.io`
- `DB_PATH=/data/duopilot.sqlite` (après ajout d'un volume)

## Summary GitHub Desktop
DuoPilot V1.12 - Notifications + Railway

## Site
https://yarmkof.github.io/DuoPilot/
