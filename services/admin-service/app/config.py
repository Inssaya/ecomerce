from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "admin-service"
    port: int = 8008
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/admin_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    auth_service_url: str = "http://auth-user-service:8001"
    catalog_service_url: str = "http://catalog-service:8002"
    seller_service_url: str = "http://seller-service:8003"
    order_service_url: str = "http://order-service:8004"
    delivery_service_url: str = "http://delivery-service:8005"

    class Config:
        env_file = ".env"


settings = Settings()
