from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    channel: str
    type: str
    title: str
    body: str
    payload: Optional[dict[str, Any]]
    read_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationCreate(BaseModel):
    user_id: str
    channel: str
    type: str
    title: str
    body: str
    payload: Optional[dict[str, Any]] = None


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    html_body: str


class NotificationPage(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread: int
