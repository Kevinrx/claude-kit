#!/usr/bin/env bash
# Verify greeting.txt is exactly "hello demo!\n".
target="${1:-greeting.txt}"
if [ "$(od -An -c "$target" | tr -s ' \n' ' ')" = "$(printf 'hello demo!\n' | od -An -c | tr -s ' \n' ' ')" ]; then
  echo OK
else
  echo FAIL
  exit 1
fi
