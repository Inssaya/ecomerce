"""The shop's half of an account.

Identity moved to Supabase. It holds the password, sends the confirmation and
reset mail, signs the tokens and rotates the sessions — so `register`,
`login`, `refresh`, `logout`, `change-password`, `forgot-password` and
`reset-password` are all gone from here. They were not deleted so much as
handed over: the working versions are kept in `archive/own-auth/` for reuse
elsewhere.

What is left is what Supabase has no opinion about, because it is not identity
at all. Where a customer lives, which language to write to them in, what their
face looks like, and whether they may open the console — those are the shop's
own facts about a person, kept on the shop's own row.

`role` in particular stays here deliberately. Supabase can say who somebody
is; whether they are the workshop is a question about this business, and
answering it from a dashboard setting would mean whoever can edit that
dashboard can grant themselves the console.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel, Field

from app.core.errors import bad_request
from app.core.storage import UploadRejected, delete_object, public_url, verify_uploaded
from app.deps import CurrentUser, DbSession
from app.models import User
from app.modules.auth.schemas import UserResponse, UserUpdate

#: A face, not a photograph of a wall. Smaller than the 12 MB product limit
#: because nothing here is ever displayed larger than 96px.
MAX_AVATAR_BYTES = 4 * 1024 * 1024

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> User:
    """Who this token belongs to, in the shop's terms.

    The storefront calls this to learn the `role` the Supabase token does not
    carry, which is what decides whether sign-in lands on a profile or on the
    console.
    """
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


class AvatarClaim(BaseModel):
    """A face the browser has already written to storage."""

    key: str = Field(min_length=1, max_length=300)


@router.post("/me/avatar", response_model=UserResponse)
async def claim_avatar(body: AvatarClaim, user: CurrentUser, db: DbSession) -> User:
    """The customer's own photograph.

    Same rules as product photography, for the same reason: the declared
    content type is whatever the client typed, so the format is decided from
    the file's own first bytes — read back out of storage now that the bytes
    go there directly. A profile picture is the one upload a stranger can
    make, which is exactly why it is sniffed rather than trusted.
    """
    if not body.key.startswith("avatars/"):
        raise bad_request("That upload is not an avatar")
    try:
        await verify_uploaded(body.key, max_bytes=MAX_AVATAR_BYTES)
    except UploadRejected as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    old_avatar = user.avatar_url
    user.avatar_url = public_url(body.key)
    await db.commit()
    await db.refresh(user)
    # A face is replaced, not accumulated — the old one is nobody's record.
    if old_avatar:
        await delete_object(old_avatar)
    return user
