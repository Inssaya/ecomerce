"""the cities we deliver to and the services we offer

Two new tables and nothing touched, so this is safe against a live shop. The
rows themselves are not inserted here — `modules/local/seed.py` fills them on
startup and only ever adds what is missing, so re-running it never overwrites
copy the owner has edited.


Revision ID: 3a77cf8ceb8c
Revises: 8b2ad4471e90
Create Date: 2026-08-06 18:24:20.703106
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '3a77cf8ceb8c'
down_revision: str | None = '8b2ad4471e90'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('cities',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('slug', sa.String(length=80), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('name_ar', sa.String(length=120), nullable=False),
    sa.Column('region_en', sa.String(length=120), nullable=False),
    sa.Column('region_ar', sa.String(length=120), nullable=False),
    sa.Column('delivery_days_min', sa.Integer(), nullable=False),
    sa.Column('delivery_days_max', sa.Integer(), nullable=False),
    sa.Column('delivery_fee', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('people', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cities_created_at'), 'cities', ['created_at'], unique=False)
    op.create_index(op.f('ix_cities_slug'), 'cities', ['slug'], unique=True)
    op.create_table('services',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('slug', sa.String(length=120), nullable=False),
    sa.Column('name_en', sa.String(length=160), nullable=False),
    sa.Column('name_ar', sa.String(length=160), nullable=False),
    sa.Column('summary_en', sa.String(length=320), nullable=False),
    sa.Column('summary_ar', sa.String(length=320), nullable=False),
    sa.Column('body_en', sa.Text(), nullable=False),
    sa.Column('body_ar', sa.Text(), nullable=False),
    sa.Column('from_price', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('lead_time_days', sa.Integer(), nullable=True),
    sa.Column('category_slug', sa.String(length=160), nullable=True),
    sa.Column('display_order', sa.Integer(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_services_created_at'), 'services', ['created_at'], unique=False)
    op.create_index(op.f('ix_services_slug'), 'services', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_services_slug'), table_name='services')
    op.drop_index(op.f('ix_services_created_at'), table_name='services')
    op.drop_table('services')
    op.drop_index(op.f('ix_cities_slug'), table_name='cities')
    op.drop_index(op.f('ix_cities_created_at'), table_name='cities')
    op.drop_table('cities')
