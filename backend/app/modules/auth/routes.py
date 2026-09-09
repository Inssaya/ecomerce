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

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.errors import bad_request
from app.core.storage import sniff_image, upload_image
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


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(file: UploadFile, user: CurrentUser, db: DbSession) -> User:
    """The customer's own photograph.

    Same rules as product photography, for the same reason: the declared
    content type is whatever the client typed, so the format is decided from
    the file's own first bytes. A profile picture is the one upload on the site
    a stranger can make, which is exactly why it is sniffed rather than trusted.
    """
    data = await file.read()
    if not data:
        raise bad_request("That file is empty")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="That photo is larger than 4 MB")

    content_type = sniff_image(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Photos must be JPEG, PNG or WebP")

    user.avatar_url = await upload_image(data, content_type, prefix=f"avatars/{user.id}")
    await db.commit()
    await db.refresh(user)
    return user
