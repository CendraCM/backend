#!/bin/bash
set -e

if [ "$1" = "debug" ]; then
  echo "Installing node inspector... please wait"
  #npm install -g node-inspector
  node-debug --web-host=0.0.0.0 index.js
else
  exec "$@"
fi;
