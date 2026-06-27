import asyncio
import uuid
from io import BytesIO

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models import KycDocument, KycStatus, User
from app.schemas import KycDocumentResponse

router = APIRouter(prefix="/kyc", tags=["kyc"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _upload_to_minio(bucket: str, key: str, data: bytes, content_type: str) -> str:
    from minio import Minio

    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )

    def _do():
        found = client.bucket_exists(bucket)
        if not found:
            client.make_bucket(bucket)
        client.put_object(bucket, key, BytesIO(data), len(data), content_type=content_type)
        return f"/{bucket}/{key}"

    return await asyncio.to_thread(_do)


@router.post("/submit", response_model=KycDocumentResponse, status_code=status.HTTP_201_CREATED)
async def submit_kyc(
    full_name: str = Form(...),
    doc_type: str = Form(..., description="national_id | passport | residence_permit"),
    selfie: UploadFile = File(...),
    id_card: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for existing pending/approved submission
    existing = await db.execute(
        select(KycDocument).where(
            KycDocument.user_id == current_user.id,
            KycDocument.review_status.in_([KycStatus.submitted, KycStatus.approved]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="KYC already submitted or approved. Contact support to re-submit.",
        )

    # Validate files
    for f in [selfie, id_card]:
        if f.content_type not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail=f"File {f.filename}: only JPEG/PNG/WebP allowed")
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"File {f.filename} exceeds 10 MB limit")
        await f.seek(0)

    uid = str(uuid.uuid4())
    selfie_data = await selfie.read()
    id_card_data = await id_card.read()

    selfie_key = f"{current_user.id}/{uid}/selfie_{selfie.filename}"
    id_card_key = f"{current_user.id}/{uid}/id_{id_card.filename}"

    selfie_path = await _upload_to_minio(
        settings.kyc_bucket, selfie_key, selfie_data, selfie.content_type or "image/jpeg"
    )
    id_card_path = await _upload_to_minio(
        settings.kyc_bucket, id_card_key, id_card_data, id_card.content_type or "image/jpeg"
    )

    doc = KycDocument(
        user_id=current_user.id,
        doc_type=doc_type,
        full_name=full_name,
        selfie_path=selfie_path,
        id_card_path=id_card_path,
        review_status=KycStatus.submitted,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/status", response_model=list[KycDocumentResponse])
async def kyc_status(current_user: User = Depends(get_current_user)):
    return current_user.kyc_documents
