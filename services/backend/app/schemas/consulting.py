from datetime import date
from uuid import UUID

from pydantic import Field

from app.schemas.base import CamelModel


class BookingCreate(CamelModel):
  expert_id: str = Field(alias="expertId")
  duration_id: str = Field(alias="durationId")
  day_id: date = Field(alias="dayId")
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


class AdminDurationCreate(CamelModel):
  code: str
  label: str
  minutes: int = Field(gt=0)
  price: int = Field(ge=0)
  description: str = ""
  recommended: bool = False


class AdminCareerCreate(CamelModel):
  code: str
  period: str
  role: str


class AdminSlotCreate(CamelModel):
  slot_date: date = Field(alias="slotDate")
  start_time: str = Field(alias="startTime")
  is_available: bool = Field(default=True, alias="isAvailable")


class AdminExpertCreate(CamelModel):
  id: str | None = None
  name: str
  title: str
  signature_line: str = Field(alias="signatureLine")
  initials: str | None = None
  avatar_tone: str = Field(default="rose", alias="avatarTone")
  image_url: str | None = Field(default=None, alias="imageUrl")
  studio_name: str | None = Field(default=None, alias="studioName")
  career_years: int = Field(default=0, ge=0, alias="careerYears")
  response_minutes: int = Field(default=30, ge=0, alias="responseMinutes")
  intro: str = ""
  availability_note: str = Field(default="", alias="availabilityNote")
  tags: list[str] = Field(default_factory=list)
  certifications: list[str] = Field(default_factory=list)
  category_ids: list[str] = Field(default_factory=list, alias="categoryIds")
  durations: list[AdminDurationCreate]
  career_history: list[AdminCareerCreate] = Field(default_factory=list, alias="careerHistory")
  slots: list[AdminSlotCreate] = Field(default_factory=list)
