import pytest
from pydantic import ValidationError

from app.schemas.face_profile import FaceProfileResultModel
from tests.test_analysis_face_profiles import make_full_profile


GAP_THRESHOLD = 0.10
GAP_EPSILON = 1e-9


def profile_with_face_shape_gap(gap: float, status: str) -> dict:
  profile = make_full_profile()
  first_score = 0.25 + (gap / 2)
  second_score = 0.25 - (gap / 2)
  scores = {
    "oval": first_score,
    "round": second_score,
    "square": 0.10,
    "heart": 0.10,
    "oblong": 0.10,
    "diamond": 0.10,
    "triangle": 0.10,
  }
  profile["faceShape"].update({
    "status": status,
    "dominantShape": "oval",
    "faceShapeScores": scores,
    "top2": [
      {"shape": "oval", "score": first_score},
      {"shape": "round", "score": second_score},
    ],
    "confidenceGap": gap,
  })
  return profile


@pytest.mark.parametrize(
  ("gap", "status"),
  (
    (GAP_THRESHOLD - (2 * GAP_EPSILON), "mixed"),
    (GAP_THRESHOLD - (GAP_EPSILON / 2), "ready"),
    (GAP_THRESHOLD, "ready"),
    (GAP_THRESHOLD + 0.01, "ready"),
  ),
)
def test_face_shape_status_matches_scorer_gap_boundary(gap: float, status: str) -> None:
  parsed = FaceProfileResultModel.model_validate(
    profile_with_face_shape_gap(gap, status),
  )

  assert parsed.face_shape.status == status


@pytest.mark.parametrize(
  ("gap", "contradicting_status"),
  (
    (GAP_THRESHOLD - 0.01, "ready"),
    (GAP_THRESHOLD, "mixed"),
    (GAP_THRESHOLD + 0.01, "mixed"),
  ),
)
def test_face_shape_status_rejects_gap_contradictions(
  gap: float,
  contradicting_status: str,
) -> None:
  with pytest.raises(ValidationError, match="face shape status"):
    FaceProfileResultModel.model_validate(
      profile_with_face_shape_gap(gap, contradicting_status),
    )
