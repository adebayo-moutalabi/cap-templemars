# Vérifie les données, commit les changements et les pousse sur main.
# Usage, depuis la racine du projet : .\scripts\publier.ps1 "Votre message de commit"
param([string]$Message = "Mise à jour de Cap Templemars")
$ErrorActionPreference = "Stop"

python -c "import json; json.load(open('data/data.json', encoding='utf-8'))"
if ($LASTEXITCODE -ne 0) { throw "data/data.json n'est pas valide : publication annulée." }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host "Aucun changement à publier."; exit 0 }

git commit -m $Message
git push origin main
Write-Host "Publié. Le site se met à jour en une à deux minutes."
