#!/usr/bin/env bash
# Build dist/Spelunkr.wgt from spelunkr-tv/. The package is not signed: Apps2Samsung or TV-Store signs it.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/Spelunkr.wgt
(cd spelunkr-tv && zip -X -q -r ../dist/Spelunkr.wgt .)
echo "dist/Spelunkr.wgt (version $(sed -n 's/.*<widget[^>]* version="\([^"]*\)".*/\1/p' spelunkr-tv/config.xml))"
