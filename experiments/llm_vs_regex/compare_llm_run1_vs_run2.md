## llm_run1 vs llm_run2

### Feature agreement (found vs not found)

| feature | agree | disagreements |
|---|---|---|
| EV_cardiac_surgery_direct_claim | 15/15 |  |
| EV_cardiac_surgery_label | 14/15 | Vidya Hospital and Kidney Ce (None vs Possible) |
| EV_cardiac_surgery_negated | 15/15 |  |
| EV_dialysis_direct_claim | 15/15 |  |
| EV_dialysis_label | 15/15 |  |
| EV_dialysis_negated | 15/15 |  |
| EV_emergency_csection_direct_claim | 15/15 |  |
| EV_emergency_csection_label | 15/15 |  |
| EV_emergency_csection_negated | 15/15 |  |
| G1_facility_type | 15/15 |  |
| G2_doctors | 15/15 |  |
| G3_beds | 15/15 |  |
| G4_icu | 14/15 | Vidya Hospital and Kidney Ce (not_mentioned vs found) |
| G5_emergency_24x7 | 15/15 |  |
| G6_ambulance | 15/15 |  |
| G7_ot | 15/15 |  |
| G8_blood_bank | 15/15 |  |
| G9_anaesthesia | 15/15 |  |
| G10_accreditation | 15/15 |  |
| G11_lab_accreditation | 15/15 |  |
| G12_teaching | 15/15 |  |
| G13_diagnostic_breadth | 15/15 |  |
| G14_years_operating | 15/15 |  |
| S1_dialysis_unit | 15/15 |  |
| S2_labour_room | 15/15 |  |
| S3_nicu | 15/15 |  |
| S4_neonatal_support | 15/15 |  |
| S5_cath_lab | 15/15 |  |
| S6_ccu | 15/15 |  |
| S7_mri | 15/15 |  |
| S8_ct | 15/15 |  |
| S9_pet | 15/15 |  |
| S10_radiotherapy | 15/15 |  |
| S11_chemotherapy | 15/15 |  |
| S12_audiometry | 15/15 |  |

### Evidence

| service | label agree | mean abs E diff | mean abs D diff |
|---|---|---|---|
| dialysis | 15/15 | 1.0 | 0.4 |
| emergency_csection | 15/15 | 0.0 | 0.0 |
| cardiac_surgery | 14/15 | 0.3 | 0.0 |

### Ranking

| query | Kendall τ llm_run1 vs llm_run2 | top-3 overlap | top-3 llm_run1 | top-3 llm_run2 |
|---|---|---|---|---|
| Q1 | 0.981 | 3/3 | Hospitales CARE, Raipu, Vidya Hospital and Kid, Shri Krishna Hospital | Hospitales CARE, Raipu, Vidya Hospital and Kid, Shri Krishna Hospital |
| Q2 | 1.000 | 3/3 | Smc Heart Institute An, Kanwar Nursing Home, Tiwari Nursing Home | Smc Heart Institute An, Kanwar Nursing Home, Tiwari Nursing Home |
| Q3 | 0.943 | 3/3 | Suyash Hospital, Hospitales CARE, Raipu, MMI Narayana Multispec | Suyash Hospital, Hospitales CARE, Raipu, MMI Narayana Multispec |
