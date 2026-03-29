#!/usr/bin/env bash
set -euo pipefail

# Migration: rename blob prefixes and table partition keys from old SHA-256 hashes to new HMAC hashes.
# Also handles orphaned no-prefix data by skipping it.

CONN="$(az staticwebapp appsettings list --name pood-app --resource-group pood-rg --query 'properties.AZURE_STORAGE_CONNECTION_STRING' -o tsv)"
CONTAINER="images"
TABLE="days"

declare -A MAPPING=(
  ["39ef168e25af"]="9ea0f5a357da4990"
  ["b0f66debd0da"]="1e66db82d0dd8d4e"
  ["fa2b19b684f0"]="378a4cc3ea36fabb"
  ["113315c8920f"]="5f51f84832e267cd"
  ["ebbf34a2599f"]="158306044807093f"
)

echo "=== Migrating blobs ==="
for old in "${!MAPPING[@]}"; do
  new="${MAPPING[$old]}"
  echo "  $old → $new"

  # List all blobs with old prefix
  blobs=$(az storage blob list --connection-string "$CONN" --container-name "$CONTAINER" --prefix "$old/" --query "[].name" -o tsv 2>/dev/null)

  for blob in $blobs; do
    new_blob="${new}${blob#$old}"
    echo "    copy $blob → $new_blob"
    az storage blob copy start \
      --connection-string "$CONN" \
      --destination-container "$CONTAINER" \
      --destination-blob "$new_blob" \
      --source-container "$CONTAINER" \
      --source-blob "$blob" \
      --only-show-errors -o none
  done
done

echo ""
echo "=== Waiting for copies to complete ==="
sleep 3

echo ""
echo "=== Migrating table entities ==="
for old in "${!MAPPING[@]}"; do
  new="${MAPPING[$old]}"

  # Query entities with old partition key prefix
  entities=$(az storage entity query --connection-string "$CONN" --table-name "$TABLE" \
    --filter "PartitionKey ge '$old' and PartitionKey lt '${old}~'" \
    --query "items[].{pk:PartitionKey, rk:RowKey, name:name, tilt:tilt, offsetX:offsetX, offsetY:offsetY}" \
    -o json 2>/dev/null)

  echo "$entities" | python3 -c "
import json, sys, subprocess

entities = json.load(sys.stdin)
old = '$old'
new = '$new'
conn = '''$CONN'''

for e in entities:
    old_pk = e['pk']
    new_pk = old_pk.replace(old, new, 1)
    rk = e['rk']
    print(f'  {old_pk}/{rk} → {new_pk}/{rk}')

    # Insert new entity
    subprocess.run([
        'az', 'storage', 'entity', 'insert',
        '--connection-string', conn,
        '--table-name', '$TABLE',
        '--entity', f'PartitionKey={new_pk}', f'RowKey={rk}',
        f'name={e[\"name\"]}',
        f'tilt={e[\"tilt\"]}',
        f'offsetX={e[\"offsetX\"]}',
        f'offsetY={e[\"offsetY\"]}',
        '--only-show-errors', '-o', 'none'
    ], check=True)
"
done

echo ""
echo "=== Verifying new data exists ==="
echo "New blobs:"
for new in "${MAPPING[@]}"; do
  count=$(az storage blob list --connection-string "$CONN" --container-name "$CONTAINER" --prefix "$new/" --query "length(@)" -o tsv 2>/dev/null)
  echo "  $new: $count blobs"
done

echo "New table entities:"
for new in "${MAPPING[@]}"; do
  count=$(az storage entity query --connection-string "$CONN" --table-name "$TABLE" \
    --filter "PartitionKey ge '$new' and PartitionKey lt '${new}~'" \
    --query "length(items)" -o tsv 2>/dev/null)
  echo "  $new: $count entities"
done

echo ""
echo "=== Migration complete. Old data NOT deleted yet. ==="
echo "Run with --cleanup to delete old data after verifying."
