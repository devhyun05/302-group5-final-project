from datetime import date

from app.schemas.consulting import BookingCreate
from app.services.consulting import _build_booking_days


def test_booking_create_parses_mobile_day_id_as_date() -> None:
  payload = BookingCreate.model_validate(
    {
      "expertId": "exp_sea",
      "durationId": "d30",
      "dayId": "2026-07-07",
      "slotId": "18:30",
      "shareReports": True,
    },
  )

  assert payload.day_id == date(2026, 7, 7)


def test_consulting_days_are_generated_from_booking_rules() -> None:
  days = _build_booking_days(
    {"2026-07-14": {"10:30", "20:00"}},
    start_day=date(2026, 7, 14),
  )

  assert len(days) == 31
  assert days[0]["id"] == "2026-07-14"
  assert days[0]["slots"][0] == {
    "id": "10:00",
    "label": "10:00",
    "available": True,
  }
  assert days[0]["slots"][1] == {
    "id": "10:30",
    "label": "10:30",
    "available": False,
  }
  assert days[0]["slots"][-1] == {
    "id": "20:00",
    "label": "20:00",
    "available": False,
  }
