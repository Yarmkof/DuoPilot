# DuoPilot V1.8

## Correctif mobile principal

Cause identifiée :
le `sidebar-backdrop` était au-dessus de tout le `.app-shell` sur smartphone.
Il interceptait donc les taps destinés à SONKI, SONKA, À deux, aux raccourcis et aux univers.

## Corrections
- suppression du stacking context bloquant de `.app-shell` sur mobile ;
- sidebar placée réellement au-dessus du backdrop ;
- backdrop placé au-dessus du contenu mais sous la sidebar ;
- zones tactiles renforcées ;
- script `app.js` déplacé à la fin réelle du `<body>` ;
- recherche et aide peuvent maintenant trouver leurs éléments au chargement ;
- Service Worker V1.8 avec suppression automatique des anciens caches ;
- stratégie network-first pour HTML, JavaScript et CSS.

## Couleurs conservées
- Vue d’ensemble : gris
- SONKI : rose clair
- SONKA : bleu foncé
- À deux : gris bleuté

## Summary GitHub Desktop
V1.8 - Fix mobile tap overlay + cache

## Site
https://yarmkof.github.io/DuoPilot/
