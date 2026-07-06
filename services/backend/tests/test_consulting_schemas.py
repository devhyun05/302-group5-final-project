from datetime import date

from app.schemas.consulting import BookingCreate


def test_booking_create_parses_mobile_day_id_as_date() -> None:
  payload = BookingCreate.model_validate(
    {
      "expertId": "exp_sea",
      "durationId": "d15",
      "dayId": "2026-07-07",
      "slotId": "18:30",
      "shareReports": True,
    },
  )

  assert payload.day_id == date(2026, 7, 7)
