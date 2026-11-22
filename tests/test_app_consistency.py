"""The app re-implements the notebook's query layer; its ranking constants must match the evaluated notebook."""

import pytest


# SERVICE_NAMES is left out on purpose: the app uses friendlier UI wording ("Ear, nose & throat").
@pytest.mark.parametrize("name", ["SERVICES", "PROFILE", "RADIUS_STEPS", "LABEL_RANK", "SERVICE_PHRASE"])
def test_app_matches_notebook(name, notebook_constants, app_core):
    assert name in notebook_constants, f"{name} not found as a literal in the notebook"
    assert getattr(app_core, name) == notebook_constants[name]


def test_profile_weights_sum_to_one(app_core):
    for service, (_, _, w_e, w_d, w_a, *_rest) in app_core.PROFILE.items():
        assert w_e + w_d + w_a == pytest.approx(1.0), service


@pytest.mark.parametrize(
    "name, service, rejected",
    [
        ("Aravind Eye Hospital", "nicu", True),  # the motivating case in app/README.md
        ("City Diagnostic Centre", "mri", False),  # diagnostic centres are allowed for MRI only
        ("City Diagnostic Centre", "dialysis", True),
        ("Government Multi Speciality Eye Hospital", "nicu", False),  # general hospitals are exempt
        ("Sharda Homoeopathic Medical College", "oncology", True),  # AYUSH is never exempt
        ("CARE Hospitals Raipur", "dialysis", False),
    ],
)
def test_facility_type_plausibility(name, service, rejected, app_core):
    assert (app_core.implausible_reason(name, service) is not None) is rejected


def test_record_checks_only_lower_confidence(app_core):
    assert app_core.apply_record_checks("High", []) == "High"
    assert app_core.apply_record_checks("High", [("x", 1)]) == "Medium"
    assert app_core.apply_record_checks("High", [("x", 1), ("y", 2)]) == "Low"
    assert app_core.apply_record_checks("Low", [("x", 1)]) == "Low"
