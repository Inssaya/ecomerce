from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "seller-service"
    port: int = 8003
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/seller_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    catalog_service_url: str = "http://catalog-service:8002"
    order_service_url: str = "http://order-service:8004"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_secret"
    minio_use_ssl: bool = False
    seller_media_bucket: str = "seller-media"
    default_commission_rate: float = 0.05

    class Config:
        env_file = ".env"


settings = Settings()
