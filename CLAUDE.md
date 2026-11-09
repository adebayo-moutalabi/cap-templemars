# Cap Templemars

Application personnelle de suivi de recherche de logement pour un stage de janvier à fin juin 2027 chez Le Casier Français (Zone Acti+, Bâtiment 6, Route de Vendeville, 59175 Templemars). Entrée visée entre le 24 et le 31 décembre 2026.

Site statique, sans dépendance ni étape de compilation.

## Fichiers

- `index.html` : squelette de la page.
- `assets/style.css` : design, avec la charte d'adebayo-moutalabi.github.io (nuit `#0d0e10`, or `#e8b65f`, Fraunces et Inter, thème clair sable).
- `assets/app.js` : logique et rendu des quatre vues (Accueil, Pistes, Mails, Dossier).
- `data/data.json` : pistes, itinéraires, modèles de messages, documents.
- `scripts/routes.py` : recalcule les trajets à vélo.
- `scripts/publier.ps1` : vérifie, commit et pousse.

Le suivi personnel (statuts, notes, cases, téléphone) reste dans le `localStorage` du navigateur.

## Tester en local

```bash
python -m http.server 8123
```

## Publier

Chaque push sur `main` publie automatiquement le site via `.github/workflows/deploy.yml`, sur https://adebayo-moutalabi.github.io/cap-templemars/. Quand une modification demandée est terminée et testée, commiter et pousser sur `main`.

## Ajouter une piste dans `data/data.json`

1. Ajouter l'objet dans `pistes` avec `id`, `name`, `kind`, `commune`, `score`, `rent`, `contact`, `email`, `phone`, `url`, `msg`, `note`, et une question propre à la piste dans `ask`.
2. Mettre `"route": {"label": "Ronchin (centre)", "precise": false}`. Pour une adresse exacte, ajouter `"dest": {"label": "...", "lat": 0, "lon": 0}` et `"precise": true`.
3. Lancer `python scripts/routes.py`, qui calcule le vélo, la marche et les transports dans les deux sens.

## Règles

- Le dépôt est public : ne jamais y mettre de pièce d'identité, de RIB, de relevé, de numéro de visa, de numéro de téléphone personnel ni de montant de budget. Les documents restent dans le Drive privé « Cap Templemars – Dossier logement ».
- Chaque piste doit garder sa distance, son trajet écrit, son temps à pied, ses options en transports et son lien Google Maps, du logement vers le stage par défaut.
- Messages aux contacts : toujours polis (bonjour, s'il vous plaît, merci), avec un ton adapté au destinataire. Aucun modèle ne parle de bail court ni de dépôt de garantie.
- Rien ne s'envoie automatiquement : l'utilisateur relit et envoie lui-même depuis Gmail.
- Interface en français, au vouvoiement. Conserver les tokens de couleur, les polices et le dock flottant.
- Ne jamais marquer une information non vérifiée comme sûre : garder les mentions « à vérifier » des données.
