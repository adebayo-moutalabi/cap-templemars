# Verifie les donnees, commit les changements et les pousse sur main.
# Usage, depuis la racine du projet : .\scripts\publier.ps1 "Message de commit"
param([string]$Message = "Mise a jour de Cap Templemars")

python -c "import json; json.load(open('data/data.json', encoding='utf-8'))"
if ($LASTEXITCODE -ne 0) { throw "data/data.json n'est pas valide : publication annulee." }

git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host "Aucun changement a publier."; exit 0 }

git commit -m $Message
git push origin main
Write-Host "Publie. Le site se met a jour en une a deux minutes."
