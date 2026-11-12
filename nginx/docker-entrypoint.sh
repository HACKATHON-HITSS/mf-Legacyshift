#!/bin/sh
set -e
cp /etc/nginx/templates/default.conf.template /etc/nginx/conf.d/default.conf
exec "$@"
