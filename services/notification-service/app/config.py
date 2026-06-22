from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "notification-service"
    port: int = 8006
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/notification_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"

    class Config:
        env_file = ".env"


settings = Settings()
