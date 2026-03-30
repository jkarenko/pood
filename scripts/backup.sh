#!/usr/bin/env bash
set -euo pipefail

DIR="backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"

echo "=== Fetching connection string ==="
CONN="$(az staticwebapp appsettings list --name pood-app --resource-group pood-rg --query 'properties.AZURE_STORAGE_CONNECTION_STRING' -o tsv)"

echo "=== Backing up table: days ==="
az storage entity query --connection-string "$CONN" --table-name "days" \
  -o json > "$DIR/days.json"
count=$(python3 -c "import json; print(len(json.load(open('$DIR/days.json'))['items']))")
echo "  $count entities saved"

echo "=== Backing up blobs: images ==="
mkdir -p "$DIR/images"
blobs=$(az storage blob list --connection-string "$CONN" --container-name "images" --query "[].name" -o tsv)
total=$(echo "$blobs" | wc -l | tr -d ' ')
i=0
for blob in $blobs; do
  i=$((i + 1))
  # Preserve directory structure
  mkdir -p "$DIR/images/$(dirname "$blob")"
  echo "  [$i/$total] $blob"
  az storage blob download --connection-string "$CONN" \
    --container-name "images" --name "$blob" \
    --file "$DIR/images/$blob" \
    --only-show-errors -o none
done

echo ""
echo "=== Backup complete: $DIR ==="
echo "  Table entities: $DIR/days.json"
echo "  Blob images:    $DIR/images/ ($total files)"
echo ""
echo "To restore table entities:"
echo "  python3 scripts/restore.sh $DIR"
