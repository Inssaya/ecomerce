import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from app.config import settings

router = APIRouter()

# Path-prefix → upstream base URL
_ROUTES: list[tuple[str, str]] = [
    ("/api/v1/auth", settings.auth_service_url),
    ("/api/v1/catalog", settings.catalog_service_url),
    ("/api/v1/seller", settings.seller_service_url),
    ("/api/v1/orders", settings.order_service_url),
    ("/api/v1/delivery", settings.delivery_service_url),
    ("/api/v1/notifications", settings.notification_service_url),
    ("/api/v1/recommendations", settings.recommendation_service_url),
    ("/api/v1/admin", settings.admin_service_url),
]


def _resolve(path: str) -> tuple[str, str]:
    for prefix, base in _ROUTES:
        if path == prefix or path.startswith(prefix + "/"):
            return base, path[len(prefix):]
    raise HTTPException(status_code=404, detail=f"No route for path: {path}")


@router.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(request: Request, path: str) -> Response:
    full_path = f"/{path}"
    upstream_base, upstream_path = _resolve(full_path)

    upstream_path = upstream_path or "/"
    query = request.url.query
    target_url = f"{upstream_base}{upstream_path}"
    if query:
        target_url += f"?{query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host",)}
    # Forward authenticated user context set by the auth middleware
    user_headers: dict = getattr(request.state, "user_headers", {})
    headers.update(user_headers)
    body = await request.body()

    async with httpx.AsyncClient(timeout=30.0) as client:
        upstream_resp = await client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )

    excluded = {"transfer-encoding", "connection"}
    resp_headers = {
        k: v for k, v in upstream_resp.headers.items() if k.lower() not in excluded
    }
    return Response(
        content=upstream_resp.content,
        status_code=upstream_resp.status_code,
        headers=resp_headers,
    )
