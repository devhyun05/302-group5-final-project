from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class BookingCreate(CamelModel):
  expert_id: str = Field(alias="expertId")
  duration_id: str = Field(alias="durationId")
  day_id: str = Field(alias="dayId")
  slot_id: str = Field(alias="slotId")
  concern_id: str | None = Field(default=None, alias="concernId")
  share_reports: bool = Field(default=False, alias="shareReports")
  shared_report_ids: list[UUID] | None = Field(default=None, alias="sharedReportIds")
  question: str | None = None


class ReviewCreate(CamelModel):
  rating: int = Field(ge=1, le=5)
  body: str
  category: str | None = None


class MembershipSubscribe(CamelModel):
  plan_id: str = Field(alias="planId")
  method: str | None = None


class PaymentCreate(CamelModel):
  kind: str
  option_id: str | None = Field(default=None, alias="optionId")
  booking_id: UUID | None = Field(default=None, alias="bookingId")
  plan_id: str | None = Field(default=None, alias="planId")
  method: str | None = None
