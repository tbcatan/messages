#!/bin/bash

branch="$(git rev-parse --abbrev-ref HEAD)"
git add -A
git stash
git checkout release
git pull origin main
git push
git checkout "$branch"
git stash pop
git reset
