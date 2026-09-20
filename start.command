#!/bin/zsh
cd "${0:A:h}"
python3 -m http.server 4177 --bind 0.0.0.0
