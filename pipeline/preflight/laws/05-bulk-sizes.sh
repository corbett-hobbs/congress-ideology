#!/bin/sh
# HEAD requests only: sizes of the GovInfo Bill Status bulk ZIPs (nothing downloaded).
for c in 108 109 110 111 112 113 114 115 116 117 118 119; do
  for t in hconres hjres hr hres s sconres sjres sres; do
    sz=$(curl -sIL "https://www.govinfo.gov/bulkdata/BILLSTATUS/$c/$t/BILLSTATUS-$c-$t.zip" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}' | tail -1)
    echo "$c,$t,${sz:-NA}"
  done
done
