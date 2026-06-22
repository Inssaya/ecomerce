from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "catalog-service"
    port: int = 8002
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/catalog_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    meili_url: str = "http://meilisearch:7700"
    meili_master_key: str = "ecomerce_meili_master_key_changeme"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_secret"
    minio_use_ssl: bool = False
    media_bucket: str = "product-media"

    class Config:
        env_file = ".env"


settings = Settings()
