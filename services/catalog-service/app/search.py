import asyncio
import logging

import meilisearch

from app.config import settings

logger = logging.getLogger("catalog.search")

PRODUCTS_INDEX = "products"

_client: meilisearch.Client | None = None


def _get_client() -> meilisearch.Client:
    global _client
    if _client is None:
        _client = meilisearch.Client(settings.meili_url, settings.meili_master_key)
    return _client


async def ensure_index() -> None:
    def _setup():
        client = _get_client()
        try:
            client.get_index(PRODUCTS_INDEX)
        except Exception:
            client.create_index(PRODUCTS_INDEX, {"primaryKey": "id"})

        index = client.index(PRODUCTS_INDEX)
        index.update_settings(
            {
                "searchableAttributes": ["title", "description", "category_name", "label_names"],
                "filterableAttributes": [
                    "category_id",
                    "label_ids",
                    "label_groups",
                    "status",
                    "seller_id",
                    "price",
                ],
                "sortableAttributes": ["price", "rating", "view_count", "created_at"],
                "rankingRules": [
                    "words",
                    "typo",
                    "proximity",
                    "attribute",
                    "sort",
                    "exactness",
                ],
            }
        )

    try:
        await asyncio.to_thread(_setup)
    except Exception as exc:
        logger.warning("Meilisearch setup failed (will retry on next request): %s", exc)


async def index_product(doc: dict) -> None:
    def _add():
        _get_client().index(PRODUCTS_INDEX).add_documents([doc])

    try:
        await asyncio.to_thread(_add)
    except Exception as exc:
        logger.warning("Failed to index product %s: %s", doc.get("id"), exc)


async def delete_product(product_id: str) -> None:
    def _del():
        _get_client().index(PRODUCTS_INDEX).delete_document(product_id)

    try:
        await asyncio.to_thread(_del)
    except Exception as exc:
        logger.warning("Failed to delete product %s from index: %s", product_id, exc)


async def search(
    query: str,
    *,
    filters: str | None = None,
    sort: list[str] | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    params: dict = {"limit": limit, "offset": offset, "attributesToHighlight": ["title"]}
    if filters:
        params["filter"] = filters
    if sort:
        params["sort"] = sort

    def _search():
        return _get_client().index(PRODUCTS_INDEX).search(query, params)

    try:
        result = await asyncio.to_thread(_search)
        return {
            "hits": result["hits"],
            "total": result.get("estimatedTotalHits", 0),
            "query": query,
            "processing_time_ms": result.get("processingTimeMs", 0),
        }
    except Exception as exc:
        logger.warning("Search failed: %s", exc)
        return {"hits": [], "total": 0, "query": query, "processing_time_ms": 0}


def product_to_doc(product) -> dict:
    """Convert a Product ORM object to a Meilisearch document."""
    return {
        "id": product.id,
        "seller_id": product.seller_id,
        "title": product.title,
        "description": product.description,
        "price": product.price,
        "currency": product.currency,
        "stock": product.stock,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "label_ids": [label.id for label in product.labels],
        "label_names": [label.name for label in product.labels],
        "label_groups": list({label.group.value for label in product.labels}),
        "status": product.status.value,
        "rating": product.rating,
        "view_count": product.view_count,
        "primary_image": next(
            (m.url for m in product.media if m.is_primary),
            product.media[0].url if product.media else None,
        ),
        "created_at": product.created_at.isoformat(),
    }
