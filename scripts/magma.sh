#!/bin/bash
API="${MAGMA_API:-http://localhost:3100/api}"
get() { curl -sS "$API/$1"; }
post() { curl -sS -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
ref() { post "$1" "{\"ref\":\"$2\"}"; }

case "${1:-}" in
  ""|-h|--help)
    printf '%s\n' "magma.sh ping|containers|images|stacks|inspect <ref>|start|stop|rm <ref>|rmi <img>|run <img> [name]|run-many <img> <n> [prefix]|commit <c> <repo:tag> [msg]|batch <c> <n> [msg]|stamp <c> <n> [apt|cmd] [prefix]|bake [from] [tag] [n]|evolve <c> [name] [msg]|lineage [ref]|compose-write <name> [file|-]|compose-up|compose-down|compose-rm <name>" ;;
  ping) get health ;;
  containers|images|stacks) get "$1" ;;
  inspect) get "inspect?ref=$2" ;;
  lineage) get "lineage${2:+?ref=$2}" ;;
  start|stop) ref "containers/$1" "$2" ;;
  rm) ref containers/rm "$2" ;;
  rmi) ref images/rm "$2" ;;
  run) post containers/run "{\"image\":\"$2\",\"name\":\"${3:-}\"}" ;;
  commit) post commit "{\"container\":\"$2\",\"repository\":\"$3\",\"message\":\"${4:-commit magma}\"}" ;;
  batch) post commit-batch "{\"container\":\"$2\",\"n\":${3:-1},\"message\":\"${4:-snapshot}\"}" ;;
  evolve) post evolve "{\"container\":\"$2\",\"name\":\"${3:-}\",\"message\":\"${4:-evolve}\"}" ;;
  run-many) post run-many "{\"image\":\"$2\",\"n\":${3:-1},\"prefix\":\"${4:-lab}\"}" ;;
  stamp) post stamp "{\"container\":\"$2\",\"n\":${3:-1},\"exec\":\"${4:-}\",\"prefix\":\"${5:-$2}\"}" ;;
  bake) post bake "{\"from\":\"${2:-debian:bookworm-slim}\",\"tag\":\"${3:-magma/slim:upgraded}\",\"n\":${4:-0}}" ;;
  compose-write)
    yaml=$( [ "${3:--}" = "-" ] && cat || cat "$3" )
    post stacks "$(printf '%s' "$yaml" | bun -e 'const yaml=await Bun.stdin.text(); console.log(JSON.stringify({name:Bun.argv[2],yaml}))' -- "$2")" ;;
  compose-up|compose-down|compose-rm) post "stacks/${1#compose-}" "{\"name\":\"$2\"}" ;;
  *) echo "comando desconocido: $1"; exit 1 ;;
esac
echo
