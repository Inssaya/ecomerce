#!/usr/bin/env bash
# Creates one database per microservice and enables pgvector where needed.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    CREATE DATABASE auth_db;
    CREATE DATABASE catalog_db;
    CREATE DATABASE seller_db;
    CREATE DATABASE order_db;
    CREATE DATABASE delivery_db;
    CREATE DATABASE notification_db;
    CREATE DATABASE recommendation_db;
    CREATE DATABASE admin_db;
EOSQL

# pgvector is needed by recommendation-service for embedding similarity search
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "recommendation_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "All databases initialised."
