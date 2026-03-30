#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup-dir>"
  exit 1
fi

DIR="$1"

if [ ! -f "$DIR/days.json" ]; then
  echo "Error: $DIR/days.json not found"
  exit 1
fi

echo "=== Fetching connection string ==="
CONN="$(az staticwebapp appsettings list --name pood-app --resource-group pood-rg --query 'properties.AZURE_STORAGE_CONNECTION_STRING' -o tsv)"

echo "=== Restoring table: days ==="
python3 -c "
import json, subprocess, sys

data = json.load(open('$DIR/days.json'))
entities = data['items']
print(f'  Restoring {len(entities)} entities...')

for e in entities:
    pk = e['PartitionKey']
    rk = e['RowKey']

    # Build entity args from all non-metadata fields
    skip = {'PartitionKey', 'RowKey', 'Timestamp', 'etag', 'odata.etag'}
    args = [f'PartitionKey={pk}', f'RowKey={rk}']
    for k, v in e.items():
        if k in skip or k.startswith('odata.') or k.startswith('.'):
            continue
        args.append(f'{k}={v}')

    subprocess.run([
        'az', 'storage', 'entity', 'merge',
        '--connection-string', '''$CONN''',
        '--table-name', 'days',
        '--entity', *args,
        '--only-show-errors', '-o', 'none'
    ], check=True)
    print(f'  {pk}/{rk}')
"

echo "=== Restoring blobs: images ==="
if [ -d "$DIR/images" ]; then
  cd "$DIR/images"
  find . -type f | while read -r f; do
    blob="${f#./}"
    echo "  $blob"
    az storage blob upload --connection-string "$CONN" \
      --container-name "images" --name "$blob" \
      --file "$blob" --overwrite \
      --only-show-errors -o none
  done
  cd - > /dev/null
fi

echo ""
echo "=== Restore complete ==="
