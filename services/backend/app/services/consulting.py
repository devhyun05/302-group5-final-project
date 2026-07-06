"""Consulting feature data access and business logic.

Raw asyncpg SQL following the existing backend conventions. All dict keys are
snake_case and get converted to camelCase by ``app.core.responses.success``.
"""

import json
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from app.core.errors import AppError
from app.db.session import Database


def _decode_json_list(value: Any) -> list[Any]:
  """asyncpg returns jsonb columns as raw strings (no codec configured)."""
  if isinstance(value, list):
    return value
  if isinstance(value, str) and value.strip():
    try:
      decoded = json.loads(value)
    except json.JSONDecodeError:
      return []
    return decoded if isinstance(decoded, list) else []
  return []


# Static concern labels (mirrors the mobile consultingConcerns mock).
CONCERN_LABELS: dict[str, str] = {
  "concern_tone": "퍼스널컬러가 헷갈려요",
  "concern_makeup": "메이크업 피드백 심화",
  "concern_product": "제품 추천을 받고 싶어요",
  "concern_hair": "헤어 · 스타일 고민",
}

_WEEKDAYS_KO = ["월", "화", "수", "목", "금", "토", "일"]


# -----------------------------------------------------------------------------
# Categories
# -----------------------------------------------------------------------------
async def list_categories(db: Database) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select id, title, description, icon
    from consulting_categories
    where is_active = true
    order by sort_order, title
    """,
  )


# -----------------------------------------------------------------------------
# Experts
# -----------------------------------------------------------------------------
async def _durations_for(db: Database, expert_id: str) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select code as id, label, minutes, price, description, recommended
    from consulting_expert_durations
    where expert_id = $1
    order by sort_order, minutes
    """,
    expert_id,
  )


async def _category_ids_for(db: Database, expert_id: str) -> list[str]:
  rows = await db.fetch(
    """
    select ec.category_id
    from consulting_expert_categories ec
    join consulting_categories c on c.id = ec.category_id
    where ec.expert_id = $1
    order by c.sort_order
    """,
    expert_id,
  )
  return [row["category_id"] for row in rows]


def _expert_card(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": row["id"],
    "name": row["name"],
    "title": row["title"],
    "signature_line": row["signature_line"],
    "initials": row["initials"],
    "avatar_tone": row["avatar_tone"],
    "career_years": row["career_years"],
    "rating": row["rating"],
    "review_count": row["review_count"],
    "session_count": row["session_count"],
    "rebook_rate": row["rebook_rate"],
    "response_minutes": row["response_minutes"],
    "tags": row["tags"],
    "intro": row["intro"],
    "availability_note": row["availability_note"],
    "certifications": row["certifications"],
  }


async def list_experts(db: Database, category_id: str | None = None) -> list[dict[str, Any]]:
  if category_id and category_id != "all":
    rows = await db.fetch(
      """
      select e.*
      from consulting_experts e
      join consulting_expert_categories ec on ec.expert_id = e.id
      where e.is_active = true and ec.category_id = $1
      order by e.sort_order, e.id
      """,
      category_id,
    )
  else:
    rows = await db.fetch(
      """
      select *
      from consulting_experts
      where is_active = true
      order by sort_order, id
      """,
    )

  experts: list[dict[str, Any]] = []
  for row in rows:
    card = _expert_card(row)
    card["category_ids"] = await _category_ids_for(db, row["id"])
    card["durations"] = await _durations_for(db, row["id"])
    experts.append(card)
  return experts


async def get_expert(db: Database, expert_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_experts where id = $1 and is_active = true",
    expert_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  expert = _expert_card(row)
  expert["category_ids"] = await _category_ids_for(db, expert_id)
  expert["durations"] = await _durations_for(db, expert_id)
  expert["career_history"] = await db.fetch(
    """
    select code as id, period, role
    from consulting_expert_career
    where expert_id = $1
    order by sort_order
    """,
    expert_id,
  )
  expert["reviews"] = await db.fetch(
    """
    select id, author, category, body, rating, date_label
    from consulting_expert_reviews
    where expert_id = $1
    order by created_at desc
    """,
    expert_id,
  )
  return expert


async def get_expert_slots(db: Database, expert_id: str) -> list[dict[str, Any]]:
  exists = await db.fetchrow(
    "select 1 from consulting_experts where id = $1 and is_active = true",
    expert_id,
  )
  if exists is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  rows = await db.fetch(
    """
    select slot_date, weekday, start_time, is_available
    from consulting_slots
    where expert_id = $1
    order by slot_date, start_time
    """,
    expert_id,
  )

  days: list[dict[str, Any]] = []
  index: dict[str, dict[str, Any]] = {}
  for row in rows:
    day_id = row["slot_date"].isoformat()
    day = index.get(day_id)
    if day is None:
      day = {
        "id": day_id,
        "weekday": row["weekday"],
        "day": row["slot_date"].day,
        "slots": [],
      }
      index[day_id] = day
      days.append(day)
    day["slots"].append(
      {
        "id": row["start_time"],
        "label": row["start_time"],
        "available": row["is_available"],
      },
    )
  return days


# -----------------------------------------------------------------------------
# Home aggregate
# -----------------------------------------------------------------------------
async def get_home(db: Database, user_id: str) -> dict[str, Any]:
  categories = await list_categories(db)
  experts = await list_experts(db)
  upcoming = await _upcoming_booking(db, user_id)
  return {
    "categories": categories,
    "experts": experts,
    "upcoming_record": upcoming,
  }


# -----------------------------------------------------------------------------
# Bookings
# -----------------------------------------------------------------------------
def _record(row: dict[str, Any]) -> dict[str, Any]:
  return {
    "id": str(row["id"]),
    "expert_id": row["expert_id"],
    "status": row["status"],
    "category_label": row["category_label"],
    "date_label": row["date_label"],
    "duration_label": row["duration_label"],
  }


async def _attach_summary(db: Database, record: dict[str, Any], booking_id: Any) -> dict[str, Any]:
  summary = await db.fetchrow(
    """
    select expert_id, duration_label, date_label, notes, products
    from consulting_summaries
    where booking_id = $1
    """,
    booking_id,
  )
  if summary is not None:
    record["summary"] = {
      "expert_id": summary["expert_id"],
      "duration_label": summary["duration_label"],
      "date_label": summary["date_label"],
      "notes": _decode_json_list(summary["notes"]),
      "products": _decode_json_list(summary["products"]),
    }
  return record


async def _upcoming_booking(db: Database, user_id: str) -> dict[str, Any] | None:
  row = await db.fetchrow(
    """
    select *
    from consulting_bookings
    where user_id = $1 and status = 'upcoming'
    order by scheduled_at asc nulls last, created_at asc
    limit 1
    """,
    user_id,
  )
  return _record(row) if row else None


async def list_bookings(
  db: Database,
  user_id: str,
  status: str | None = None,
) -> list[dict[str, Any]]:
  if status and status != "all":
    rows = await db.fetch(
      """
      select *
      from consulting_bookings
      where user_id = $1 and status = $2
      order by scheduled_at desc nulls last, created_at desc
      """,
      user_id,
      status,
    )
  else:
    rows = await db.fetch(
      """
      select *
      from consulting_bookings
      where user_id = $1
      order by scheduled_at desc nulls last, created_at desc
      """,
      user_id,
    )

  records: list[dict[str, Any]] = []
  for row in rows:
    record = _record(row)
    if row["status"] == "completed":
      record = await _attach_summary(db, record, row["id"])
    records.append(record)
  return records


async def get_booking(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  return await _attach_summary(db, _record(row), row["id"])


async def create_booking(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  expert = await db.fetchrow(
    "select id, title from consulting_experts where id = $1 and is_active = true",
    payload.expert_id,
  )
  if expert is None:
    raise AppError(404, "CONSULTING_EXPERT_NOT_FOUND", "전문가를 찾을 수 없어요.")

  duration = await db.fetchrow(
    """
    select code, label, minutes, price
    from consulting_expert_durations
    where expert_id = $1 and code = $2
    """,
    payload.expert_id,
    payload.duration_id,
  )
  if duration is None:
    raise AppError(400, "CONSULTING_DURATION_INVALID", "선택한 상담 시간을 확인해 주세요.")

  slot = await db.fetchrow(
    """
    select slot_date, weekday, start_time, is_available
    from consulting_slots
    where expert_id = $1 and slot_date = $2::date and start_time = $3
    """,
    payload.expert_id,
    payload.day_id,
    payload.slot_id,
  )
  if slot is None:
    raise AppError(400, "CONSULTING_SLOT_INVALID", "선택한 시간을 확인해 주세요.")
  if not slot["is_available"]:
    raise AppError(409, "CONSULTING_SLOT_TAKEN", "이미 예약된 시간이에요.")

  category_ids = await _category_ids_for(db, payload.expert_id)
  category_label = None
  if category_ids:
    category_row = await db.fetchrow(
      "select title from consulting_categories where id = $1",
      category_ids[0],
    )
    category_label = category_row["title"] if category_row else None

  concern_label = CONCERN_LABELS.get(payload.concern_id or "")
  scheduled_at = datetime.combine(
    slot["slot_date"],
    datetime.strptime(slot["start_time"], "%H:%M").time(),
  )
  date_label = (
    f"{slot['slot_date'].month}월 {slot['slot_date'].day}일 "
    f"({slot['weekday']}) {slot['start_time']}"
  )
  shared_report_ids = [str(value) for value in (payload.shared_report_ids or [])]

  row = await db.fetchrow(
    """
    insert into consulting_bookings (
      user_id, expert_id, duration_code, duration_label, duration_minutes,
      category_label, scheduled_at, date_label, slot_id, concern_id, concern_label,
      share_reports, shared_report_ids, question, status, price
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'upcoming', $15)
    returning *
    """,
    user_id,
    payload.expert_id,
    duration["code"],
    duration["label"],
    duration["minutes"],
    category_label,
    scheduled_at,
    date_label,
    payload.slot_id,
    payload.concern_id,
    concern_label,
    payload.share_reports,
    shared_report_ids,
    (payload.question or "").strip() or None,
    duration["price"],
  )

  # Best-effort: mark the slot as taken so it disappears from availability.
  await db.execute(
    """
    update consulting_slots set is_available = false
    where expert_id = $1 and slot_date = $2::date and start_time = $3
    """,
    payload.expert_id,
    payload.day_id,
    payload.slot_id,
  )

  return _record(row)


async def cancel_booking(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  row = await db.fetchrow(
    "select * from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if row is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if row["status"] == "canceled":
    return _record(row)
  if row["status"] == "completed":
    raise AppError(409, "CONSULTING_BOOKING_COMPLETED", "이미 완료된 상담은 취소할 수 없어요.")

  updated = await db.fetchrow(
    "update consulting_bookings set status = 'canceled' where id = $1 returning *",
    booking_id,
  )
  # Release the reserved slot.
  if row["slot_id"] and row["scheduled_at"] is not None:
    await db.execute(
      """
      update consulting_slots set is_available = true
      where expert_id = $1 and slot_date = $2::date and start_time = $3
      """,
      row["expert_id"],
      row["scheduled_at"].date(),
      row["slot_id"],
    )
  return _record(updated)


async def get_booking_summary(db: Database, user_id: str, booking_id: str) -> dict[str, Any]:
  booking = await db.fetchrow(
    "select id from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")

  summary = await db.fetchrow(
    """
    select expert_id, duration_label, date_label, notes, products
    from consulting_summaries
    where booking_id = $1
    """,
    booking_id,
  )
  if summary is None:
    raise AppError(404, "CONSULTING_SUMMARY_NOT_FOUND", "상담 요약이 아직 준비되지 않았어요.")
  return {
    "expert_id": summary["expert_id"],
    "duration_label": summary["duration_label"],
    "date_label": summary["date_label"],
    "notes": _decode_json_list(summary["notes"]),
    "products": _decode_json_list(summary["products"]),
  }


# -----------------------------------------------------------------------------
# Reviews
# -----------------------------------------------------------------------------
async def create_review(
  db: Database,
  user_id: str,
  author_name: str,
  booking_id: str,
  payload: Any,
) -> dict[str, Any]:
  booking = await db.fetchrow(
    "select expert_id, status, category_label from consulting_bookings where id = $1 and user_id = $2",
    booking_id,
    user_id,
  )
  if booking is None:
    raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
  if booking["status"] != "completed":
    raise AppError(409, "CONSULTING_REVIEW_NOT_ALLOWED", "완료된 상담만 리뷰를 남길 수 있어요.")

  review_id = str(uuid4())
  category = (payload.category or booking["category_label"] or "").strip()
  review = await db.fetchrow(
    """
    insert into consulting_expert_reviews (id, expert_id, author, author_user_id, category, body, rating)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id, author, category, body, rating, date_label
    """,
    review_id,
    booking["expert_id"],
    author_name,
    user_id,
    category,
    payload.body.strip(),
    payload.rating,
  )

  await db.execute(
    """
    update consulting_experts set
      review_count = (select count(*) from consulting_expert_reviews where expert_id = $1),
      rating = coalesce(
        (select round(avg(rating)::numeric, 1) from consulting_expert_reviews where expert_id = $1),
        0
      )
    where id = $1
    """,
    booking["expert_id"],
  )
  return dict(review)


# -----------------------------------------------------------------------------
# Membership
# -----------------------------------------------------------------------------
async def list_membership_plans(db: Database) -> list[dict[str, Any]]:
  return await db.fetch(
    """
    select id, name, tagline, price_per_month, original_price_per_month,
           benefits, badge, highlight
    from consulting_membership_plans
    where is_active = true
    order by sort_order, price_per_month
    """,
  )


async def get_my_membership(db: Database, user_id: str) -> dict[str, Any] | None:
  return await db.fetchrow(
    """
    select m.id, m.plan_id, m.status, m.started_at, m.current_period_end,
           p.name as plan_name, p.price_per_month
    from user_consulting_memberships m
    join consulting_membership_plans p on p.id = m.plan_id
    where m.user_id = $1 and m.status = 'active'
    order by m.created_at desc
    limit 1
    """,
    user_id,
  )


async def subscribe_membership(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  plan = await db.fetchrow(
    "select id, name, price_per_month from consulting_membership_plans where id = $1 and is_active = true",
    payload.plan_id,
  )
  if plan is None:
    raise AppError(404, "CONSULTING_PLAN_NOT_FOUND", "멤버십 플랜을 찾을 수 없어요.")

  # Deactivate any existing active membership before subscribing to a new one.
  await db.execute(
    "update user_consulting_memberships set status = 'canceled' where user_id = $1 and status = 'active'",
    user_id,
  )

  period_end = datetime.now() + timedelta(days=30)
  membership = await db.fetchrow(
    """
    insert into user_consulting_memberships (user_id, plan_id, status, current_period_end)
    values ($1, $2, 'active', $3)
    returning id, plan_id, status, started_at, current_period_end
    """,
    user_id,
    plan["id"],
    period_end,
  )

  payment = await _record_payment(
    db,
    user_id=user_id,
    kind="membership",
    option_id=plan["id"],
    amount=plan["price_per_month"],
    booking_id=None,
    membership_id=membership["id"],
    method=payload.method,
  )

  result = dict(membership)
  result["plan_name"] = plan["name"]
  result["payment"] = payment
  return result


# -----------------------------------------------------------------------------
# Payments (records the payment; the real PG charge is a stub for now)
# -----------------------------------------------------------------------------
_OPTION_MULTIPLIER = {"single": 1, "package3": 3}


async def _record_payment(
  db: Database,
  *,
  user_id: str,
  kind: str,
  option_id: str | None,
  amount: int,
  booking_id: Any,
  membership_id: Any,
  method: str | None,
) -> dict[str, Any]:
  # NOTE: This marks the payment as paid without calling a real payment
  # gateway. Wire a PG provider (Toss/PortOne) here and set status from its
  # result once merchant credentials are available.
  row = await db.fetchrow(
    """
    insert into consulting_payments (
      user_id, kind, option_id, booking_id, membership_id,
      amount, currency, status, method, pg_provider
    )
    values ($1, $2, $3, $4, $5, $6, 'KRW', 'paid', $7, 'stub')
    returning id, kind, option_id, amount, currency, status, method, created_at
    """,
    user_id,
    kind,
    option_id,
    booking_id,
    membership_id,
    amount,
    method,
  )
  result = dict(row)
  result["id"] = str(result["id"])
  return result


async def create_payment(db: Database, user_id: str, payload: Any) -> dict[str, Any]:
  if payload.kind == "booking":
    if payload.booking_id is None:
      raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제할 예약이 필요해요.")
    booking = await db.fetchrow(
      "select id, price from consulting_bookings where id = $1 and user_id = $2",
      str(payload.booking_id),
      user_id,
    )
    if booking is None:
      raise AppError(404, "CONSULTING_BOOKING_NOT_FOUND", "예약을 찾을 수 없어요.")
    multiplier = _OPTION_MULTIPLIER.get(payload.option_id or "single", 1)
    amount = booking["price"] * multiplier
    return await _record_payment(
      db,
      user_id=user_id,
      kind="booking",
      option_id=payload.option_id or "single",
      amount=amount,
      booking_id=booking["id"],
      membership_id=None,
      method=payload.method,
    )

  if payload.kind == "membership":
    if payload.plan_id is None:
      raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제할 멤버십 플랜이 필요해요.")
    plan = await db.fetchrow(
      "select id, price_per_month from consulting_membership_plans where id = $1 and is_active = true",
      payload.plan_id,
    )
    if plan is None:
      raise AppError(404, "CONSULTING_PLAN_NOT_FOUND", "멤버십 플랜을 찾을 수 없어요.")
    return await _record_payment(
      db,
      user_id=user_id,
      kind="membership",
      option_id=plan["id"],
      amount=plan["price_per_month"],
      booking_id=None,
      membership_id=None,
      method=payload.method,
    )

  raise AppError(400, "CONSULTING_PAYMENT_INVALID", "결제 종류를 확인해 주세요.")
