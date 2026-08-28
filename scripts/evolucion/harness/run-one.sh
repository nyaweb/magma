#!/bin/bash
# usage: run-one.sh <farm> <slot> <model>
set +e
farm=$1
slot=$(printf '%02d' "$((10#$2))")
model=$3
dir="$farm/$slot"
timeout_s=${TIMEOUT:-420}
prompt=$(cat "$farm/PROMPT.txt")
{
  echo "slot=$slot model=$model start=$(date -Is)"
  timeout "$timeout_s" opencode run --auto --dir "$dir" -m "$model" --title "magma-evo-$(basename "$farm")-$slot" "$prompt"
  echo "slot=$slot end=$(date -Is) exit=$?"
} >"$dir/opencode.log" 2>&1
echo "$slot $model $?" >>"$farm/done.log"
