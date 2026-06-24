from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "recommendation-service"
    port: int = 8007
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/recommendation_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    catalog_service_url: str = "http://catalog-service:8002"
    profile_ttl_seconds: int = 604800  # 7 days
    trending_window_hours: int = 48
    max_recommendations: int = 20

    class Config:
        env_file = ".env"


settings = Settings()
