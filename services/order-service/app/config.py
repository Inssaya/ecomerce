from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "order-service"
    port: int = 8004
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/order_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    catalog_service_url: str = "http://catalog-service:8002"
    seller_service_url: str = "http://seller-service:8003"
    cart_ttl_seconds: int = 86400  # 24h guest cart TTL
    delivery_fee_default: float = 20.0  # 20 MAD flat fee

    class Config:
        env_file = ".env"


settings = Settings()
