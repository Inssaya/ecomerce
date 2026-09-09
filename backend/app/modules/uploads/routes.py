"""Permission to write one file, for ten minutes.

Photographs no longer travel through this application. The browser asks here
for a URL, writes the bytes straight to storage, and comes back with a name —
so a twelve-megabyte photograph never passes through the API at all.

That was forced by the move to a serverless host, which caps a request body
well below what a product photograph weighs. It is also simply better: the
process no longer holds an entire image in memory to copy it somewhere else,
and a slow upload no longer occupies a worker for its whole duration.

**What did not change is who decides whether a file is acceptable.** The API
used to sniff the first bytes of every upload, because the declared content
type is a string the client chose — anything can claim to be `image/jpeg`, and
an SVG carrying script served back from our own domain is the reason that
check exists. It still happens, in `storage.verify_uploaded`, by reading the
first sixteen bytes back out of the bucket after the write. A ranged read is
not a download, and the guarantee is identical: nothing is attached to
anything until this application has looked at the actual bytes.

The signature is the whole permission. It is bound to one object name, one
method and one short window, so it cannot be replayed against another key, and
it grants no reading and no listing.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core import storage
from app.core.errors import bad_request
from app.core.limits import ReferenceUploadLimit
from app.deps import CurrentUser, Owner

router = APIRouter(tags=["uploads"])

#: Where each kind of photograph is filed, and how large it may be.
#:
#: The ceilings are the ones the old endpoints enforced, kept deliberately
#: different: a product photograph is the thing being sold and is looked at
#: full-bleed, a sketch attached to a custom request is looked at once by the
#: person who will make the thing, and a face is never drawn above 96px.
PURPOSES: dict[str, tuple[str, int]] = {
    "product": ("products", 12 * 1024 * 1024),
    "reference": ("requests", 8 * 1024 * 1024),
    "avatar": ("avatars", 4 * 1024 * 1024),
    "category": ("categories", 4 * 1024 * 1024),
}

Purpose = Literal["product", "reference", "avatar", "category"]


class SignRequest(BaseModel):
    purpose: Purpose
    #: Only used to choose the file extension. What the file *is* gets decided
    #: after the upload, from its own first bytes.
    content_type: Literal["image/jpeg", "image/png", "image/webp"]


class SignedUpload(BaseModel):
    #: PUT the bytes here, with no credentials of any kind attached.
    put_url: str
    #: Hand this back to whichever endpoint is going to keep the photograph.
    key: str
    max_bytes: int = Field(description="Refused after the fact if exceeded, so check first.")


def _sign(purpose: Purpose, content_type: str) -> SignedUpload:
    prefix, max_bytes = PURPOSES[purpose]
    key = storage.new_object_key(prefix, content_type)
    return SignedUpload(put_url="", key=key, max_bytes=max_bytes)


@router.post("/uploads/sign", response_model=SignedUpload)
async def sign_owner_upload(body: SignRequest, owner: Owner) -> SignedUpload:
    """For the workshop's own photography — products and category marks."""
    if body.purpose not in ("product", "category"):
        raise bad_request("That is not an owner upload")
    signed = _sign(body.purpose, body.content_type)
    signed.put_url = await storage.presigned_put(signed.key)
    return signed


@router.post("/uploads/sign/avatar", response_model=SignedUpload)
async def sign_avatar_upload(body: SignRequest, user: CurrentUser) -> SignedUpload:
    """A customer's own face. Signed in, and only ever for themselves."""
    if body.purpose != "avatar":
        raise bad_request("That is not an avatar upload")
    signed = _sign("avatar", body.content_type)
    signed.put_url = await storage.presigned_put(signed.key)
    return signed


@router.post("/uploads/sign/reference", response_model=SignedUpload)
async def sign_reference_upload(body: SignRequest, _: ReferenceUploadLimit) -> SignedUpload:
    """A sketch attached to a custom request.

    Unauthenticated, because asking for a price must not require an account —
    which makes it the one place a stranger can cause a write. Rate limited for
    exactly that reason, and the ceiling is enforced after the fact as well,
    because a signature carries no size of its own.
    """
    if body.purpose != "reference":
        raise bad_request("That is not a reference upload")
    signed = _sign("reference", body.content_type)
    signed.put_url = await storage.presigned_put(signed.key)
    return signed
