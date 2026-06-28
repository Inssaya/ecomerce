from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    service_name: str = "auth-user-service"
    port: int = 8001
    database_url: str = "postgresql+asyncpg://ecomerce:ecomerce_secret@postgres:5432/auth_db"
    redis_url: str = "redis://redis:6379/0"
    rabbitmq_url: str = "amqp://ecomerce:ecomerce_secret@rabbitmq:5672/"
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_secret"
    minio_use_ssl: bool = False
    kyc_bucket: str = "kyc-documents"
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_from: str = "noreply@mostyle.ma"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = False
    app_name: str = "MoStyle"
    app_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
