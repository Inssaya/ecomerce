from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8000
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    redis_url: str = "redis://redis:6379/0"

    auth_service_url: str = "http://auth-user-service:8001"
    catalog_service_url: str = "http://catalog-service:8002"
    seller_service_url: str = "http://seller-service:8003"
    order_service_url: str = "http://order-service:8004"
    delivery_service_url: str = "http://delivery-service:8005"
    notification_service_url: str = "http://notification-service:8006"
    recommendation_service_url: str = "http://recommendation-service:8007"
    admin_service_url: str = "http://admin-service:8008"

    class Config:
        env_file = ".env"


settings = Settings()
